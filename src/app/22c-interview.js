/* Pitwall — Spoken interviews (BETA). Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  A media session out loud, with the race engineer's downloads: each reporter reads their question in a voice of their
  own (the engineer's voices, without the radio sound), you answer into the microphone, and what you said is written
  into the answer box, where it can still be edited before publishing. A reporter may come back with a follow-up when
  an answer dodges the question, is very short or opens something worth pressing (two at most in an interview). The
  typed interview is unchanged: this is a way of filling it in.
*/
const IV = { id: null, i: 0, phase: '', stop: false, skip: false, src: null, follows: 0 };

const ivVoices = () => (engStatus?.voices || []).filter(v => v.installed);
const ivReady = () => !!engApi() && !!engStatus?.whisper && ivVoices().length > 0;

/** Each reporter gets a voice of their own (not the engineer's while there are others), kept for their follow-ups. */
function ivCast(m) {
  const pool = ivVoices(); if (!pool.length) return;
  const others = pool.filter(v => v.id !== engCfg().voice); const P = others.length ? others : pool;
  const by = new Map();
  for (const q of m.questions) {
    if (by.has(q.reporter)) { q.voice = by.get(q.reporter); continue; }
    if (q.voice && pool.some(v => v.id === q.voice)) { by.set(q.reporter, q.voice); continue; }
    const taken = new Set(by.values()); const g = q.vg === 'female' ? 'Female' : q.vg === 'male' ? 'Male' : null;
    const v = P.find(v => !taken.has(v.id) && (!g || v.voice === g)) || P.find(v => !taken.has(v.id)) || P.find(v => !g || v.voice === g) || P[by.size % P.length];
    by.set(q.reporter, v.id); q.voice = v.id;
  }
}

/** What the speech recognition expects to hear: an interview answer, and the names it might bring up. */
function ivPrompt() {
  const s = latestSeason(); const names = s ? [...new Set(gridIds(s).map(d => dName(s, d)).filter(Boolean))].slice(0, 24) : [];
  return `A Formula 1 driver answering a press conference question. Yeah, I think it was a tough weekend for us. The car felt good in the first stint, but the tyres dropped off and we lost a bit of time in traffic. Credit to the team, the strategy was spot on. ${names.join(', ')}. ${(s?.teams || []).map(t => t.name).join(', ')}. Qualifying, pole position, podium, championship, undercut, safety car, softs, mediums, hards.`;
}

async function ivSpeak(text, voice) {
  const res = await engApi().speak(engSpeakable(text), voice, { fx: false });
  if (!res?.ok) throw new Error(res?.error === 'not_installed' ? 'That voice isn’t downloaded' : res?.error || 'The voice failed');
  if (IV.stop || IV.skip) return;
  const ctx = engAudio(); if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const ab = res.wav.buffer ? res.wav.buffer.slice(res.wav.byteOffset, res.wav.byteOffset + res.wav.byteLength) : res.wav;
  const buf = await ctx.decodeAudioData(ab);
  const src = ctx.createBufferSource(); const g = ctx.createGain(); g.gain.value = engCfg().vol; src.buffer = buf; src.connect(g).connect(ctx.destination);
  IV.src = src; src.start();
  await new Promise(ok => { src.onended = ok; setTimeout(ok, buf.duration * 1000 + 500); });
  IV.src = null;
}
/** Your answer: listening starts after the question and ends when you've finished (2.5 s of quiet), a minute at most. */
function ivListen() {
  return new Promise((ok) => {
    const hook = (text) => ok(text); hook.working = () => ivSet('writing');
    engRecStart('iv', { toggle: true, max: 60000, quiet: 2500, prompt: ivPrompt(), hook }).then(() => { if (!ENG_REC.on && !IV.skip) { IV.stop = true; ok(null); } });
  });
}
function ivCancelRec() { if (!ENG_REC.on) return; const h = ENG_REC.hook; ENG_REC.on = false; ENG_REC.hook = null; engMicIdle(); h?.(null); }
const ivTidy = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : ''; };

/** A follow-up from the same reporter, or none: the AI journalist when there's a key, otherwise a few plain rules. */
async function ivFollowUp(c, m, q) {
  if (IV.follows >= 2 || q.follow) return null;
  const a = q.answer.trim(); let text = null;
  if (settings.hasKey && window.api) {
    const res = await aiCall(`CONTEXT\n${mediaContext(c, m.seasonIdx, m.roundId, m.kind)}\n\nIn ${KIND_BRIEF[m.kind]}, ${q.reporter} (${q.outlet}) asked: ${q.question}\nThe ${isPrincipal(c) ? 'team principal' : 'driver'} answered (spoken, transcribed): ${a}\n\nTASK\nDecide whether ${q.reporter} asks one follow-up, as a real journalist would: only when the answer dodged the question, was very short, said something surprising, blamed someone, or opened an angle worth pressing. Most answers get none. A follow-up reacts to what was actually said, in 1–2 short spoken sentences.\n\nReturn {"followup":""}, an empty string for none.`, 300);
    if (res.ok) { try { text = String(extractJson(res.text).followup || '').trim(); } catch { text = null; } }
  }
  if (text == null) text = ivOfflineFollow(c, m, a);
  if (!text || m.questions.some(x => x.question === text)) return null;
  IV.follows++;
  return { outlet: q.outlet, reporter: q.reporter, vg: q.vg, voice: q.voice, question: text, answer: '', follow: true };
}
function ivOfflineFollow(c, m, a) {
  const words = a.split(/\s+/).filter(Boolean).length; const r = Math.random();
  if (/no comment|rather not|focus on the next/i.test(a)) return null;
  if (words < 7) return r < 0.6 ? qPick(['Can you say a bit more about that?', 'That’s a short answer. Is there something you’d rather not say?', 'Could you expand on that for us?']) : null;
  if (/\b(stewards?|penalt(y|ies)|his fault|her fault|their fault|blame|divebomb|dive bomb|hit me|ran me|pushed me)\b/i.test(a) && r < 0.6) return qPick(['Do you think the stewards got that one right?', 'Will you be talking to them about it?']);
  const s = c.seasons[m.seasonIdx];
  const named = s && gridIds(s).filter(d => d !== PLAYER).map(d => dName(s, d)).find(n => n && new RegExp(`\\b${lastName(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(a));
  if (named && r < 0.5) return `You mention ${lastName(named)}. How would you describe things between you two right now?`;
  return null;
}

function ivSet(phase) { IV.phase = phase; ivDraw(); }
function ivDraw() {
  const el = document.getElementById('media-session'); const c = career(); const m = c?.media.find(x => x.id === ui.mediaOpen || x.id === IV.id);
  if (!el || !m || ui.view !== 'media') return;
  el.outerHTML = renderMediaSession(c, m);
  document.querySelector('#media-session .q.iv-on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function ivRun(m) {
  const c = career(); Object.assign(IV, { id: m.id, i: 0, phase: '', stop: false, skip: false, follows: m.questions.filter(q => q.follow).length });
  ivCast(m); store.save();
  try {
    while (!IV.stop && IV.i < m.questions.length && c.media.includes(m)) {
      const q = m.questions[IV.i]; IV.skip = false;
      if (q.answer?.trim()) { IV.i++; continue; } // already answered (typed, or earlier)
      ivSet('asking');
      try { await ivSpeak(q.question, q.voice); } catch (e) { toast(e.message); break; }
      if (IV.stop) break; if (IV.skip) { IV.i++; continue; }
      ivSet('listening');
      const heard = await ivListen();
      if (IV.stop) break; if (IV.skip) { IV.i++; continue; }
      if (heard) {
        q.answer = ivTidy(heard); store.save();
        ivSet('follow');
        const f = await ivFollowUp(c, m, q);
        if (f && !IV.stop && !IV.skip) { m.questions.splice(IV.i + 1, 0, f); store.save(); }
      }
      IV.i++;
    }
  } finally {
    const done = !IV.stop && IV.i >= m.questions.length;
    ivCancelRec(); Object.assign(IV, { id: null, phase: '', stop: false, skip: false }); ivDraw();
    if (done) toast('That’s the interview. Check your answers, then publish');
  }
}
function ivStopAll() { if (!IV.id) return; IV.stop = true; try { IV.src?.stop(); } catch { } ivCancelRec(); }

/** The bar at the top of an interview in progress: start it out loud, or what's happening and the controls. */
function ivBar(m) {
  if (!engApi()) return '';
  if (!engStatus) { engRefresh().then(() => engStatus && ivDraw()); return ''; }
  if (!ivReady()) return `<div class="iv-bar muted">To answer out loud, download a voice and the speech recognition in Settings → Race engineer.</div>`;
  if (IV.id !== m.id) {
    const one = ivVoices().length < 2;
    return `<div class="iv-bar"><button class="btn sm primary" data-act="iv-start" data-id="${m.id}" ${IV.id ? 'disabled' : ''}>${ICON.mic} Answer out loud <span class="tag" style="margin-left:4px">BETA</span></button>
      <span class="muted">Each reporter asks in their own voice and you answer into your microphone. They may follow up. You can still edit every answer.${one ? ' Download more voices in Settings → Race engineer so the reporters sound different.' : ''}</span></div>`;
  }
  const q = m.questions[IV.i]; const who = q ? esc(q.reporter) : '';
  const state = { asking: `${who} is asking…`, listening: 'Listening. Answer out loud, it stops when you’ve finished.', writing: 'Writing down your answer…', follow: `${who} is thinking…` }[IV.phase] || '';
  return `<div class="iv-bar on"><span class="iv-dot ${IV.phase === 'listening' ? 'rec' : ''}"></span><b>${state}</b>
    ${IV.phase === 'listening' ? '<span class="iv-level"><span id="eng-level"></span></span><button class="btn sm primary" data-act="iv-done">Done talking</button>' : ''}
    <button class="btn sm ghost" data-act="iv-skip">Skip question</button><button class="btn sm ghost danger" data-act="iv-stop">Stop</button></div>`;
}

Object.assign(ENG_ACTIONS, {
  async 'iv-start'(el) {
    const m = career().media.find(x => x.id === el.dataset.id); if (!m || IV.id) return;
    ui.mediaOpen = m.id; await engRefresh(); if (!ivReady()) { toast('Download a voice and the speech recognition in Settings → Race engineer first'); return; }
    ivRun(m);
  },
  'iv-done'() { if (ENG_REC.on && ENG_REC.src === 'iv') engRecStop(); },
  'iv-skip'() { if (!IV.id) return; IV.skip = true; try { IV.src?.stop(); } catch { } ivCancelRec(); },
  'iv-stop'() { ivStopAll(); },
});
