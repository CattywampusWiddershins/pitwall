/* Pitwall — Race engineer (dev mode, BETA). Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  The race engineer: a voice on the radio in Live Race that calls the stops and the safety cars, follows the cars you ask
  it to ("keep me updated on Piastri"), and answers when you talk back (push to talk on a button you've given "UDP Action" in F1 25, or a key). Speech is made
  and understood on this PC (engineer.js in the main process). What you say is read by keywords, not set sentences: a
  driver's name and "gap" in one sentence is the gap to that driver, however it's put. ENG_INTENTS is the whole list, and
  the Help tab shows it.

  Dev mode only for now: on when Pitwall runs from the source, or when a file named "dev-mode" is in the user folder.
  Turned off (or with no voice downloaded), Live Race plays your uploaded sounds as before.
*/
let DEV_MODE = false; // set at start-up from the main process
const ENG_DEF = { on: false, voice: null, fx: true, chat: 2, ptt: 'udp', udp: 1, key: 'F8', mic: '', vol: 0.9, ovl: false, ovlBg: 0.95, ovlText: 1, ovlLines: 4, asr: 'fast' };
const engCfg = () => ({ ...ENG_DEF, ...(state.engineer || {}) });
const engSet = (patch) => { state.engineer = { ...engCfg(), ...patch }; store.save(); engSyncKey(); };
let engStatus = null; // what's downloaded (from the main process)
const engApi = () => window.api?.engineer || null;
const engVoiceOk = (id) => !!engStatus?.voices?.find(v => v.id === id)?.installed;
/** The engineer is on and has a voice: the radio replaces the pit-call sounds. */
function engVoiceReady() { const E = engCfg(); return !!engApi() && E.on && !!E.voice && engVoiceOk(E.voice); }
async function engRefresh() { const A = engApi(); if (!A) return null; try { engStatus = await A.status(); } catch { engStatus = null; } return engStatus; }

// ---- saying it: numbers the voice reads well ("P 3", "1 32 point 4"), then queued, made and played in turn
function engSpeakable(t) {
  return String(t)
    .replace(/\b(\d+):(\d\d)\.(\d)\d*\b/g, (m, a, b, c) => `${a} ${b} point ${c}`)
    .replace(/\bP(\d{1,2})\b/g, 'P $1').replace(/\bVSC\b/g, 'V S C').replace(/\bERS\b/g, 'E R S')
    .replace(/(\d+(?:\.\d+)?)\s?s\b/g, '$1 seconds').replace(/(\d+)%/g, '$1 percent').replace(/(\d+(?:\.\d+)?) ?kg\b/g, '$1 kilos');
}
let engCtx = null; const engQ = []; let engBusy = false; let engLast = ''; const engLog = [];
const engAudio = () => (engCtx ||= new (window.AudioContext || window.webkitAudioContext)());
/**
 * Puts a line on the radio. prio 1 (a pit call, a safety car) goes to the front and drops anything not yet said that's
 * gone stale; a routine line older than 8 s when its turn comes is dropped. who: 'eng', or 'me' for what you said.
 */
function engSay(text, { prio = 2, me = null } = {}) {
  if (!text) return;
  const item = { text, prio, me, at: Date.now() };
  if (prio === 1) { for (let k = engQ.length - 1; k >= 0; k--) if (engQ[k].prio > 1) engQ.splice(k, 1); engQ.unshift(item); } else engQ.push(item);
  engPump();
}
async function engPump() {
  if (engBusy) return; const item = engQ.shift(); if (!item) return;
  if (item.prio > 1 && Date.now() - item.at > 8000) { engPump(); return; }
  engBusy = true; engLast = item.text; engRecord(item);
  const E = engCfg(); let dur = Math.max(1.6, item.text.length / 15);
  try {
    const res = engVoiceReady() ? await engApi().speak(engSpeakable(item.text), E.voice, { fx: E.fx }) : null;
    if (res?.ok) {
      const ctx = engAudio(); if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const ab = res.wav.buffer ? res.wav.buffer.slice(res.wav.byteOffset, res.wav.byteOffset + res.wav.byteLength) : res.wav;
      const buf = await ctx.decodeAudioData(ab); dur = buf.duration;
      const src = ctx.createBufferSource(); const g = ctx.createGain(); g.gain.value = E.vol; src.buffer = buf; src.connect(g).connect(ctx.destination);
      engRadioShow({ me: item.me, eng: item.text, dur }); engOverlay({ me: item.me, eng: item.text, dur }); src.start();
      await new Promise(ok => { src.onended = ok; setTimeout(ok, dur * 1000 + 500); });
    } else { engRadioShow({ me: item.me, eng: item.text, dur }); engOverlay({ me: item.me, eng: item.text, dur }); await new Promise(ok => setTimeout(ok, dur * 1000)); }
  } catch (e) { console.warn('engineer voice', e); }
  engBusy = false; setTimeout(engPump, 250);
}
/** Each exchange is logged, and kept with the race's recording for Race Replay. */
function engRecord(item) {
  engLog.push({ at: Date.now(), me: item.me, eng: item.text }); if (engLog.length > 40) engLog.shift();
  if (liveErs?.uid && !liveErs.done) { try { engApi()?.record({ uid: liveErs.uid, me: item.me, eng: item.text }); } catch { /* not kept */ } }
}

// ---- the radio graphic: driver and number in the team's colour, bars that move while someone's talking, what you said
// in the team's colour and the engineer in white, both written on as they're spoken
const ENG_BARS = 18;
function engRadioEl() {
  let el = document.getElementById('eng-radio');
  if (!el) { el = document.createElement('div'); el.id = 'eng-radio'; el.className = 'eng-radio'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  return el;
}
const engRadioHere = () => (ui.view === 'now' && ui.nowTab === 'live') || ui.view === 'replay';
let engRadioT = null; let engWriteT = null;
/** The radio graphic's markup and team colour: { html, tc }. */
function engRadioMarkup({ me = null, eng = '', who = null, season = null }) {
  const c = career(); const s = season || latestSeason(); const id = who || PLAYER;
  const tm = c && s ? teamOf(s, id) : null;
  return { tc: tm?.color || '#3A8DFF', html: `<div class="er-head"><span class="er-name">${esc(lastName(s ? dName(s, id) : 'Radio').toUpperCase())}</span><span class="er-radio">RADIO</span></div>
    <div class="er-mid"><span class="er-num">${esc(String(s?.drivers?.[id]?.number ?? ''))}</span><span class="er-bars">${Array.from({ length: ENG_BARS }, (_, k) => `<i style="animation-delay:-${(k * 137 % 600) / 1000}s;animation-duration:${0.35 + (k * 53 % 40) / 100}s"></i>`).join('')}</span><span class="er-logo">${tm ? teamLogo(c, tm, 34) : ''}</span></div>
    ${me ? `<div class="er-me" data-full="${esc('“' + me.toUpperCase() + '”')}"></div>` : ''}${eng ? `<div class="er-eng" data-full="${esc('“' + eng.toUpperCase() + '”')}"></div>` : ''}` };
}
/** How the overlay looks: the background's and the text's opacity (Settings). */
const engOvlStyle = () => { const E = engCfg(); return { bg: E.ovlBg, text: E.ovlText, lines: E.ovlLines }; };
/** The radio over the game too, when that's turned on (Settings). */
function engOverlay(o) { const E = engCfg(); if (!E.ovl || !E.on || !engApi()?.overlay) return; try { engApi().overlay.show({ ...engRadioMarkup(o), dur: o.dur, style: engOvlStyle() }); } catch { /* the overlay's gone */ } }
function engRadioShow({ me = null, eng = '', dur = 3, who = null, season = null }) {
  if (!engRadioHere()) return;
  const M = engRadioMarkup({ me, eng, who, season }); const el = engRadioEl();
  el.style.setProperty('--tc', M.tc); el.innerHTML = M.html;
  el.classList.add('on', 'talking');
  // written on: what you said first (quickly), then the engineer across the time the line takes to say
  const parts = [...el.querySelectorAll('[data-full]')]; clearInterval(engWriteT);
  const plan = parts.map(p => ({ p, full: p.dataset.full, n: 0, per: p.classList.contains('er-me') ? 40 : Math.max(18, p.dataset.full.length / Math.max(0.8, dur * 0.95)) }));
  let k = 0; let last = performance.now();
  engWriteT = setInterval(() => {
    const now = performance.now(); const dt = (now - last) / 1000; last = now; const P = plan[k]; if (!P) { clearInterval(engWriteT); el.classList.remove('talking'); return; }
    P.n = Math.min(P.full.length, P.n + P.per * dt); P.p.textContent = P.full.slice(0, Math.floor(P.n)); if (P.n >= P.full.length) k++;
  }, 30);
  clearTimeout(engRadioT); engRadioT = setTimeout(() => el.classList.remove('on'), (dur + 6) * 1000);
}
function engRadioHide() { const el = document.getElementById('eng-radio'); if (el) el.classList.remove('on', 'talking'); clearInterval(engWriteT); }
setInterval(() => { if (!engRadioHere()) engRadioHide(); }, 500);

// ---- the race as the engineer sees it: your car, the cars around, the strategy and the call, rejoin, weather and fuel
function engSnap() {
  const c = career(); const s = c && latestSeason(); const r = s && nextRound(s); if (!r) return null;
  const L = liveFor(c, r); if (!L) return null;
  const map = liveMap(c, s, L); const idOf = (i) => map[i];
  const me = L.field.find(x => x.i === L.player); if (!me) return null;
  const byPos = L.field.filter(x => x.pos > 0).sort((a, b) => a.pos - b.pos);
  const name = (x) => x ? lastName(dName(s, idOf(x.i)) || 'that car') : '';
  const race = L.kind === 'race'; const around = { ahead: byPos.find(x => x.pos === me.pos - 1), behind: byPos.find(x => x.pos === me.pos + 1) };
  let WC = null;
  if (!race) {
    // practice and qualifying: the timing sheet, the clock, the cut-off and the track around you
    try { WC = wetCall(c, s, r, L, me, 20000); } catch { }
    const top = Math.min(...byPos.map(x => x.best).filter(v => v > 0));
    let cut = null; try { cut = L.kind === 'quali' ? lsCut(L, me) : null; } catch { } let TR = null; try { TR = lsTraffic(L, me); } catch { }
    return { c, s, r, L, me, idOf, name, byPos, race, top: isFinite(top) ? top : null, cut, TR, WC, ST: {}, plan: null, call: null, G: {}, N: L.totalLaps || 0, left: 0, ...around };
  }
  const w = weekend(s, r.id, true); let P = null; try { P = livePlan(c, s, r, L, w, me, PLAYER, idOf); } catch { P = { ST: { none: true }, plan: null, call: null }; }
  const N = L.totalLaps || (L.key === 'SPR' ? Math.ceil(raceLaps(s, r.id) / 3) : raceLaps(s, r.id));
  let RJ = null; try { RJ = rejoin(L.field, me, P.ST.lossNow ?? 20000); } catch { }
  try { WC = wetCall(c, s, r, L, me, P.ST.lossNow ?? 20000); } catch { }
  let FP = null; try { FP = fuelProjection(s, r, L, me, PLAYER); } catch { }
  const G = raceGaps(L.field);
  return { c, s, r, L, me, idOf, name, byPos, race, N, left: Math.max(0, N - me.lap + 1), RJ, WC, FP, G, ...P, ...around };
}
const engTyre = (c) => COMPOUNDS[c]?.[1] || 'tyre';
const engTyres = (c) => ({ 16: 'softs', 17: 'mediums', 18: 'hards', 7: 'inters', 8: 'wets' }[c] || 'tyres');
const engSec = (ms) => `${(Math.abs(ms) / 1000).toFixed(1)}`;
/** Gap from you to another car (ms; positive: they're ahead), from the real gaps to the leader. */
const engGap = (S, x) => S.race ? (S.G[S.me.i]?.g ?? 0) - (S.G[x.i]?.g ?? 0) : (S.me.best && x.best ? S.me.best - x.best : 0);

// ---- what the engineer says unprompted, as the race goes (chat: 1 just the calls, 2 normal, 3 chatty)
let engMem = {};
function engineerTick() {
  if (!engVoiceReady()) return;
  const S = engSnap(); if (!S) return;
  if (!S.race) { engTickSession(S); return; }
  const { L, me } = S; const E = engCfg(); const now = L.clock != null ? L.clock * 1000 : Date.now(); // the race's clock: a flashback or a pause doesn't fool the waits
  if (engMem.uid === L.uid && now < (engMem.now || 0) - 1000) Object.assign(engMem, { posAt: now, said: { ...engMem.said, pos: 0 }, pitOut: engMem.pitOut ? now : null });
  if (engMem.uid !== L.uid) engMem = { uid: L.uid, pos: me.pos, posAt: now, posSaid: me.pos, sc: L.sc || 0, red: !!L.red, pit: !!me.pit, lap: me.lap, wear: 0, best: {}, said: {}, call: null, started: false };
  const M = engMem; M.now = now; const say = (lvl, text, prio = 2) => { if (E.chat >= lvl) engSay(text, { prio }); };
  // the start
  if (!M.started) { M.started = true; if (me.lap <= 1) { const st = S.plan?.stints?.length; say(2, `Radio check. Starting P${me.pos}.${st ? ` Plan is a ${st === 1 ? 'one' : st === 2 ? 'two' : st}-stop.` : ''} Good luck.`); } }
  // the pit call (what the uploaded sounds did)
  if (S.call) {
    const last = M.call; const fresh = !last || last.kind !== S.call.kind || last.c !== S.call.c || me.lap > last.lap + 1;
    // a call that changes tyre while it stands: corrected once the new tyre has held for 6 s (the plan can waver)
    const fix = last && last.kind === S.call.kind && last.c !== S.call.c && (me.lap <= last.lap || now - (M.callAt || 0) < 30000);
    if (fix) { if (M.pend?.c !== S.call.c) M.pend = { c: S.call.c, at: now }; if (now - M.pend.at < 6000) return engTickRest(S, M, E, now, say); }
    M.pend = null; M.call = { ...S.call };
    if (fix) { say(1, `Correction: ${engTyres(S.call.c)}.`, 1); M.callAt = now; }
    else if (fresh && (last?.kind !== S.call.kind || now - (M.callAt || 0) > 20000)) { M.callAt = now; say(1, S.call.kind === 'sc' ? `${L.sc === 1 ? 'Safety car' : 'VSC'}, box box. Box this lap for ${engTyres(S.call.c)}.` : `Box this lap, box box. ${cap1(engTyres(S.call.c))}.`, 1); }
  } else M.pend = null;
  engTickRest(S, M, E, now, say);
}
/** The rest of what the engineer says unprompted: safety cars, stops, places, laps and the flag. */
function engTickRest(S, M, E, now, say) {
  const { L, me } = S;
  engPenCalls(S, M, say); engDamageCalls(S, M, say);
  // safety cars and red flags
  const sc = L.sc || 0;
  if (sc !== M.sc) { if (sc === 1) say(1, 'Safety car, safety car.', 1); else if (sc === 2) say(1, 'Virtual safety car. Watch your delta.', 1); else if (M.sc === 1 || M.sc === 2) say(1, 'Green flag, green flag. Go, go.', 1); M.sc = sc; }
  if (!!L.red !== M.red) { if (L.red) say(1, 'Red flag, red flag. Back to the pits.', 1); M.red = !!L.red; }
  // your own stop
  if (M.pit && !me.pit) { M.pitOut = now; M.pitDone = me.lap; M.lifeSaid = {}; }
  M.pit = !!me.pit;
  if (M.pitOut && now - M.pitOut > 5000) { const a = S.ahead; M.pitOut = null; say(2, `Good stop. You're P${me.pos}${a ? `, ${S.name(a)} ${engSec(engGap(S, a))} ahead` : ', leading'}.`); }
  // the cars you asked the engineer to follow ("keep me updated on Piastri"). Passes between you and them aren't called (you can
  // see those). When one becomes the car right behind or ahead of you some other way (passing the car behind you, a
  // stop, you passing the car between), the engineer says so, "Piastri behind you now"; then, while it stays there, the gap each
  // lap while it's within 5 s (a car right behind 20 s back gets it every three laps, like one further away). Further
  // away: its places against the others (settled for 8 s; one such call every 30 s for all the cars followed, and two
  // of them swapping is one call), its stops.
  const W = engWatch.uid === L.uid ? engWatch.ids : new Set(); const gapNow = new Set();
  for (const i of W) {
    const x = L.field.find(y => y.i === i); if (!x || !x.pos) continue;
    const side = x === S.ahead ? 'ahead' : x === S.behind ? 'behind' : null;
    const T = (M.watch ||= {})[i] ||= { pos: x.pos, posAt: now, posSaid: x.pos, pit: !!x.pit, at: 0, lap: me.lap, side, sideNow: side, sideAt: now, ahead: x.pos < me.pos };
    const busy = x.pit || me.pit; const ahead = x.pos < me.pos;
    if (x.pos !== T.pos) { T.pos = x.pos; T.posAt = now; }
    if (side !== T.sideNow) { T.sideNow = side; T.sideAt = now; }
    // next to you now (settled for 5 s); swapping sides with you is a pass you made or lost: nothing said
    if (!busy && side !== T.side && now - T.sideAt > 5000) {
      const swapped = T.side && side && T.side !== side;
      // (not again for the same side within 3 minutes: a car slipping between for a while and out again)
      if (side && !swapped && !(T.saidSide === side && now - T.saidAt < 180000)) { say(1, `${S.name(x)} ${side === 'behind' ? 'behind you' : 'ahead of you'} now, ${engSec(engGap(S, x))}.`); T.lap = me.lap; T.saidSide = side; T.saidAt = now; }
      T.side = side; T.posSaid = x.pos; T.ahead = ahead;
    }
    // further away: a change of place against the other cars (not one made by passing you)
    if (busy || ahead !== T.ahead) { T.posSaid = x.pos; T.ahead = ahead; }
    else if (!T.side && !side && x.pos !== T.posSaid && now - T.posAt > 8000 && now - (M.watchAt || 0) > 30000) {
      // two followed cars that swapped with each other: one call
      const y = [...W].map(j => j !== i && L.field.find(z => z.i === j)).find(z => z && M.watch[z.i] && z.pos === T.posSaid && M.watch[z.i].posSaid === x.pos);
      if (y) { const [a, b] = x.pos < y.pos ? [x, y] : [y, x]; say(1, `${S.name(a)} past ${S.name(b)} for P${a.pos}.`); M.watch[y.i].posSaid = y.pos; }
      else say(1, `${S.name(x)} ${x.pos < T.posSaid ? 'up' : 'down'} to P${x.pos}.`);
      T.posSaid = x.pos; M.watchAt = now;
    }
    if (x.pit && !T.pit) say(1, `${S.name(x)} is boxing.`);
    T.pit = !!x.pit;
    // the gap: each lap while it's right behind or ahead of you, every three laps otherwise
    const close = T.side && T.side === side && Math.abs(engGap(S, x)) < 5000;
    if (close) gapNow.add(i);
    if (!x.pit && !me.pit && me.lap > T.lap && (close || me.lap >= T.lap + 3)) { T.lap = me.lap; say(1, `${engRelGap(S, x)}.${engTrend(S, x)}`); }
  }
  // the cars either side stopping
  for (const [x, k] of [[S.ahead, 'a'], [S.behind, 'b']]) {
    if (!x) continue; const was = M['p' + k]; const key = x.i;
    if (was && was.i === key && x.pit && !was.pit && !W.has(key)) say(2, `${S.name(x)} is boxing.`);
    M['p' + k] = { i: key, pit: !!x.pit };
  }
  // a new lap: bests, gaps, tyres, fuel, the last lap
  if (me.lap !== M.lap) {
    M.lap = me.lap;
    for (const x of L.field) if (x.last > 30000 && (!M.best[x.i] || x.last < M.best[x.i])) M.best[x.i] = x.last;
    const fast = Math.min(...Object.values(M.best)); if (me.last && me.last === M.best[me.i] && me.last === fast && me.lap > 3 && now - (M.said.fl || 0) > 60000) { say(3, `Fastest lap. ${fmtLap(me.last)}.`); M.said.fl = now; }
    const every = E.chat >= 3 ? 1 : 5;
    if (me.lap > 2 && me.lap % every === 0 && !me.pit && S.left > 1) { const a = S.ahead, b = S.behind; const bits = []; if (a && !gapNow.has(a.i)) bits.push(`gap to ${S.name(a)} ${engSec(engGap(S, a))}`); if (b && !gapNow.has(b.i)) bits.push(`${S.name(b)} ${engSec(-engGap(S, b))} behind`); if (bits.length) { say(2, cap1(bits.join(', ')) + '.'); M.gapLap = me.lap; } }
    // the tyres in laps, as a team talks about them (never a wear percentage): about 10 laps left, then about 5
    const life = S.ST?.curLife; if (life != null && !me.pit) for (const th of [10, 5]) if (life <= th && !(M.lifeSaid ||= {})[th]) { for (const t2 of [10, 5]) if (life <= t2) M.lifeSaid[t2] = true; say(2, `About ${plural(Math.max(0, life), 'lap')} left in these.`); break; }
    if (me.lap >= 4 && S.FP && S.FP.end < -0.3 && now - (M.said.fuel || 0) > 240000) { say(2, `We need to save fuel. ${S.FP.save.toFixed(2)} kg a lap.`); M.said.fuel = now; }
    if (S.WC?.cls === 'call' && S.WC.text !== M.wc) { say(1, S.WC.text.replace(/:/, '.'), 1); }
    M.wc = S.WC?.cls === 'call' ? S.WC.text : null;
    if (me.lap === S.N && !M.said.last) { say(2, 'Last lap. Bring it home.'); M.said.last = true; }
  }
  // the flag
  if (me.st === 3 && !M.said.fin) {
    M.said.fin = true; const p = me.pos;
    say(1, p === 1 ? `Get in there! You've won the ${gpTitle(S.r)}! Brilliant drive.` : p <= 3 ? `P${p}! That's a podium. Great job.` : p <= 10 ? `P${p}. Good points today.` : `P${p}. Tough one. We'll go again next time.`, 1);
  }
}

// ---- understanding you: words as Pitwall knows them, then the drivers, teams, places and tyres you named
const ENG_ALIAS = [[/\btires?\b/g, (m) => m.replace('tire', 'tyre')], [/\bmedians?\b/g, 'mediums'], [/\blabs?\b/g, (m) => m.replace('lab', 'lap')], [/\bgab\b/g, 'gap'],
  [/\b(bocks|boks|bucks)\b/g, 'box'], [/\bsafety ?cart?\b/g, 'safety car'], [/\bv ?s ?c\b/g, 'vsc'], [/\be ?r ?s\b/g, 'ers'], [/\binterm[ae]diates?\b/g, 'inters'],
  [/\bpee (\d)/g, 'p$1'], [/\bposition (\d+)/g, 'p$1'], [/\bteam ?-?mate\b/g, 'teammate'], [/\bin front\b/g, 'ahead'], [/\bbehind me\b/g, 'behind'], [/\bwhat's\b/g, 'what is'], [/\blap,? (bye[- ]?bye|bye lap|by lap)\b/g, 'lap by lap'], [/\bmatt\b/g, 'max'], [/\bwear (am i|is|are)\b/g, 'where $1'], [/\bloosing\b/g, 'losing'], [/\bup dated\b/g, 'updated'], [/\bwho's\b/g, 'who is'], [/\bi'm\b/g, 'i am'], [/\bhow's\b/g, 'how is']];
const ENG_ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
const engNorm = (t) => { let x = ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%' ]+/g, ' ').replace(/\s+/g, ' ') + ' '; for (const [re, to] of ENG_ALIAS) x = x.replace(re, to); return x.replace(/\s+/g, ' '); };
function engLev(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
// nicknames and short forms the radio uses
const ENG_WORDS = new Set(['the', 'and', 'nor', 'per', 'not', 'for', 'can', 'box', 'gap', 'pit', 'lap', 'car', 'all', 'one', 'two', 'law', 'bot', 'mag', 'sar', 'oco']);
const ENG_NICK = { max: 'VER', checo: 'PER', lewis: 'HAM', ham: 'HAM', charles: 'LEC', lando: 'NOR', oscar: 'PIA', george: 'RUS', carlos: 'SAI', fernando: 'ALO', nando: 'ALO', yuki: 'TSU', nico: 'HUL', hulk: 'HUL', kimi: 'ANT' };
/** Drivers, teams, a place, the car ahead or behind, your teammate and a tyre named in what you said. */
function engEntities(t, S) {
  const out = { cars: [], rel: null, comp: null, pos: null, team: null, fix: [], names: new Set(), pron: / (him|her|he|she|his|them|they|their) /.test(t) };
  const words = t.trim().split(' ').map(w => w.replace(/'s?$/, ''));
  if (S) {
    const cars = S.L.field.filter(x => S.idOf(x.i));
    for (const x of cars) {
      const id = S.idOf(x.i); const full = dName(S.s, id).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); const parts = full.split(/[\s-]+/); const last = lastName(full).toLowerCase(); const abbr = (S.s.drivers[id]?.abbr || '').toLowerCase();
      // (a three-letter code counts too, unless it's an everyday word: "nor", "per")
      const hit = (w) => w === last || (w.length >= 5 && engLev(w, last) <= (last.length >= 8 ? 2 : 1)) || (parts.length > 1 && w === parts[0] && w.length > 3) || (abbr.length === 3 && w === abbr && !ENG_WORDS.has(w));
      const nick = Object.entries(ENG_NICK).some(([n, a]) => words.includes(n) && a.toLowerCase() === abbr);
      if (x.i !== S.me.i && (words.some(hit) || (last.includes(' ') && t.includes(' ' + last + ' ')) || nick)) {
        out.cars.push(x);
        // a name heard a little wrong ("lecler"): put right in what's shown
        const w = words.find(hit); if (w && w !== last && w !== abbr && w !== parts[0]) out.fix.push([w, lastName(dName(S.s, id))]);
        words.filter(hit).forEach(v => out.names.add(v)); if (last.includes(' ')) last.split(' ').forEach(v => out.names.add(v));
      }
    }
    for (const tm of S.s.teams) { const n = tm.name.toLowerCase(); const key = n.split(' ')[0]; if (t.includes(' ' + n + ' ') || (key.length > 3 && words.includes(key))) { out.team = tm; break; } }
  }
  if (/ (ahead|car ahead|next car|man ahead|guy ahead) /.test(t)) out.rel = 'ahead';
  else if (/ (behind|chasing|following|car behind) /.test(t)) out.rel = 'behind';
  else if (/ (leader|leading|in the lead|first place|p1) /.test(t) && !/ am i leading /.test(t)) out.rel = 'leader';
  if (/ teammate /.test(t)) out.rel = 'mate';
  const pm = t.match(/ p(\d{1,2}) /); if (pm && +pm[1] > 1) out.pos = +pm[1];
  for (const [w, n] of Object.entries(ENG_ORD)) if (t.includes(` ${w} place `)) out.pos = n;
  const cm = t.match(/ (softs?|mediums?|hards?|inters?|wets?) /); if (cm) out.comp = { s: 16, m: 17, h: 18, i: 7, w: 8 }[cm[1][0]];
  return out;
}
/** The car a question is about: one named, else your teammate, the car ahead or behind, the leader or a place, else the
 *  nearest car of a team named. */
function engTarget(S, E) {
  if (!S) return null;
  if (E.cars.length) return E.cars.sort((a, b) => Math.abs(a.pos - S.me.pos) - Math.abs(b.pos - S.me.pos))[0];
  if (E.rel === 'mate') { const tm = teamOf(S.s, PLAYER); const mid = tm?.drivers.find(d => d && d !== PLAYER); return S.L.field.find(x => S.idOf(x.i) === mid) || null; }
  if (E.rel === 'ahead') return S.ahead || null; if (E.rel === 'behind') return S.behind || null; if (E.rel === 'leader') return S.byPos[0] || null;
  if (E.pos) return S.byPos.find(x => x.pos === E.pos) || null;
  if (E.team) return S.L.field.filter(x => x.i !== S.me.i && teamOf(S.s, S.idOf(x.i))?.id === E.team.id).sort((a, b) => Math.abs(a.pos - S.me.pos) - Math.abs(b.pos - S.me.pos))[0] || null;
  // "him", "they": the driver you asked about last, this session
  if (E.pron && engLastCar?.uid === S.L.uid) return S.L.field.find(x => x.i === engLastCar.i) || null;
  return null;
}
let engLastCar = null;
const engRelGap = (S, x) => { if (!S.race) return !x.best ? `${S.name(x)} has no time yet` : !S.me.best ? `${S.name(x)} is on ${fmtLap(x.best)}, you have no time yet` : x.best === S.me.best ? `${S.name(x)} is on exactly your time, ${fmtLap(x.best)}` : `${S.name(x)} is on ${fmtLap(x.best)}, ${(Math.abs(x.best - S.me.best) / 1000).toFixed(3)} ${x.best < S.me.best ? 'quicker' : 'slower'}`; const g = engGap(S, x); const down = (S.G[x.i]?.down ?? 0) - (S.G[S.me.i]?.down ?? 0); if (down >= 1) return `${S.name(x)} is ${plural(down, 'lap')} down`; if (down <= -1) return `${S.name(x)} is ${plural(-down, 'lap')} ahead of you`; return g >= 0 ? `${S.name(x)} is ${engSec(g)} ahead` : `${S.name(x)} is ${engSec(g)} behind`; };
const engTrend = (S, x) => { if (!S.race) return ''; let e = null; try { e = paceEdge(S.me, x, (y) => S.L.pitLaps?.[y.i] || []); } catch { } if (e == null) return ''; const ahead = engGap(S, x) > 0; const closing = ahead ? e > 0 : e < 0; return ` ${closing ? (ahead ? "You're closing in" : "They're closing in") : (ahead ? "They're pulling away" : "You're pulling away")}, ${(Math.abs(e) / 1000).toFixed(2)} a lap.`; };
/** Another car's times: its best (and place, outside the race), its last lap, and against yours. */
const engLapsOf = (S, x) => { const nm = S.name(x); if (!x.best && !x.last) return `${nm} has no time yet.`;
  const vs = !S.race && S.me.best && x.best ? (x.best === S.me.best ? ' Exactly your time.' : ` ${(Math.abs(x.best - S.me.best) / 1000).toFixed(3)} ${x.best < S.me.best ? 'quicker' : 'slower'} than you.`) : '';
  return `${nm}'s best is ${x.best ? fmtLap(x.best) : 'not set yet'}${!S.race && x.best && x.pos ? `, P${x.pos}` : ''}.${x.last && x.last !== x.best ? ` Last lap ${fmtLap(x.last)}.` : ''}${vs}`; };
const engCarTyre = (S, x) => x.c ? `${engTyres(x.c)}, ${plural(x.age ?? 0, 'lap')} old` : 'no tyre data';
const engYou = (S) => !S.race ? (S.me.pos === 1 ? 'You are quickest.' : `That is you, P${S.me.pos}.`) : S.me.pos === 1 ? `You are leading.${S.behind ? ` ${S.name(S.behind)} is ${engSec(-engGap(S, S.behind))} behind.` : ''}` : `That is you, P${S.me.pos}.`;
/*
  Practice and qualifying, unprompted: the start, each lap done (in qualifying every flying lap with its time, place and
  gap to the top; in practice a personal best, every lap when chatty), a deleted lap, the drop zone in qualifying (after
  your lap, or pushed into it while you wait), the clock at five and two minutes, traffic ahead on a flying lap, a red
  flag, and the cars you follow improving.
*/
function engTickSession(S) {
  const { L, me } = S; const E = engCfg(); const now = L.clock != null ? L.clock * 1000 : Date.now();
  if (engMem.uid !== L.uid) engMem = { uid: L.uid, lap: me.lap, flying: me.ds === 1, said: {}, red: !!L.red, safe: S.cut?.safe ?? null, safeNow: S.cut?.safe ?? null, safeAt: now, best: {}, tl: L.timeLeft, traffic: {} };
  const M = engMem; const say = (lvl, text, prio = 2) => { if (E.chat >= lvl) engSay(text, { prio }); };
  const title = GAME_SESSION_NAMES[L.sessionType] || 'the session';
  if (!M.said.start) { M.said.start = true; say(2, `Radio check. ${title}${L.timeLeft ? `, ${Math.round(L.timeLeft / 60)} minutes` : ''}.`); }
  if (!!L.red !== M.red) { if (L.red) say(1, 'Red flag, red flag. Back to the pits.', 1); M.red = !!L.red; }
  if (me.ds === 1) M.flying = true;
  // a lap done
  if (me.lap !== M.lap) {
    const done = liveLaps(me).find(l => l.n === M.lap) || liveLaps(me).slice(-1)[0]; const wasFlying = M.flying; M.lap = me.lap; M.flying = me.ds === 1;
    if (done && done.ms && (wasFlying || L.kind === 'practice')) {
      if (!done.valid) say(1, 'That lap is deleted.', 1);
      else {
        const pb = done.ms <= (me.best || Infinity); const purple = S.top && done.ms <= S.top;
        const where = me.pos === 1 ? 'P1, fastest of anyone' : `P${me.pos}${S.top ? `, ${((me.best - S.top) / 1000).toFixed(3)} off the top` : ''}`;
        const line = `${purple ? 'Purple lap! ' : pb ? 'Personal best. ' : ''}${fmtLap(done.ms)}. ${where}.`;
        if (L.kind === 'quali') { say(1, line, 1); if (S.cut && !S.cut.safe && S.cut.margin != null) say(1, `You're in the drop zone. ${(Math.abs(S.cut.margin) / 1000).toFixed(3)} off P${S.cut.cut}.`, 1); }
        else say(pb ? 2 : 3, line);
      }
    }
  }
  // qualifying: pushed into the drop zone while you're not on a lap (settled for 5 s)
  if (S.cut && me.best) {
    if (S.cut.safe !== M.safeNow) { M.safeNow = S.cut.safe; M.safeAt = now; }
    if (M.safe !== M.safeNow && now - M.safeAt > 5000) { if (M.safe && !M.safeNow && me.ds !== 1) say(1, `You've dropped to P${me.pos}, into the drop zone.${L.timeLeft ? ` ${lsClock(L.timeLeft)} left.` : ''}`, 1); M.safe = M.safeNow; }
  }
  // the clock
  if (L.timeLeft != null && M.tl != null) {
    if (M.tl > 300 && L.timeLeft <= 300) say(2, `Five minutes left${L.kind === 'quali' ? '' : ' in the session'}.`);
    if (L.kind === 'quali' && M.tl > 120 && L.timeLeft <= 120) say(2, me.ds === 0 ? 'Two minutes left. Go now for one more lap.' : 'Two minutes left.');
  }
  M.tl = L.timeLeft;
  // traffic on a flying lap: a car on an out lap or in lap within 3 s ahead on track, once a lap
  if (me.ds === 1 && S.TR?.ahead && S.TR.ahead.s < 3 && [2, 3].includes(S.TR.ahead.x.ds) && M.traffic[S.TR.ahead.x.i] !== me.lap) { M.traffic[S.TR.ahead.x.i] = me.lap; say(2, `Traffic ahead. ${S.name(S.TR.ahead.x)}, on ${S.TR.ahead.x.ds === 3 ? 'an out lap' : 'an in lap'}.`); }
  // the cars you follow, improving
  // (a lap of theirs counts once they were on a flying lap; in practice a lap on a run counts too, said only when chatty)
  const W = engWatch.uid === L.uid ? engWatch.ids : new Set(); M.wl ||= {};
  for (const i of W) {
    const x = L.field.find(y => y.i === i); if (!x) continue; const nm = S.name(x);
    const P = M.wl[i] ||= { lap: x.lap, ds: x.ds, fly: x.ds === 1, run: x.ds === 4, best: x.best || 0 };
    if (x.ds === 1 && P.ds !== 1) say(2, `${nm} is on a push lap.`);
    if (x.lap !== P.lap) {
      const done = liveLaps(x).find(l => l.n === P.lap); const counts = P.fly || (L.kind === 'practice' && P.run);
      if (done?.ms && counts) {
        const vs = me.best ? (done.ms === me.best ? ' Exactly your time.' : ` ${(Math.abs(done.ms - me.best) / 1000).toFixed(3)} ${done.ms < me.best ? 'quicker' : 'slower'} than you.`) : '';
        if (!done.valid) say(P.fly ? 2 : 3, `${nm}'s lap is deleted.`);
        else if (!P.best || done.ms < P.best) say(P.fly ? 1 : 3, `${nm} ${P.best ? 'improves' : 'sets a time'}. ${fmtLap(done.ms)}, P${x.pos}.${vs}`);
        else say(P.fly ? 2 : 3, `${nm}, ${fmtLap(done.ms)}. No improvement, still P${x.pos} on ${fmtLap(x.best || P.best)}.`);
      }
      P.lap = x.lap; P.fly = x.ds === 1; P.run = x.ds === 4;
    }
    if (x.ds === 1) P.fly = true; if (x.ds === 4) P.run = true;
    P.ds = x.ds; if (x.best && (!P.best || x.best < P.best)) P.best = x.best;
  }
}
// the cars you've asked to be kept updated on, this race
let engWatch = { uid: null, ids: new Set() };
const engWatchSet = (S, x, on) => { if (engWatch.uid !== S.L.uid) engWatch = { uid: S.L.uid, ids: new Set() }; if (on) engWatch.ids.add(x.i); else engWatch.ids.delete(x.i); if (engMem.watch) delete engMem.watch[x.i]; if (engMem.wl) delete engMem.wl[x.i]; };
/*
  The pre-race briefing: once qualifying is logged and until the race starts. Our strategy (from practice long runs and
  the tyres left, as on the post-qualifying screen), what the cars starting around us should do (the grid's runs), who
  we should be fighting and where we should finish (the race forecast on Current Weekend). A question about one part
  ("who are we fighting?", "where will we finish?") gets that part.
*/
function engBriefing(t = ' ') {
  const c = career(); const s = c && latestSeason(); const r = s && nextRound(s); if (!r || isHist(s)) return null;
  const w = s.weekends[r.id]; const Q = w?.sessions?.Q; if (!Q?.done || w.sessions.R?.done) return null;
  const nm = (d) => lastName(dName(s, d)); const list = (xs) => listJoin(xs.map(nm));
  const n = raceLaps(s, r.id); const PL = (() => { try { return pitLoss(c, trackOf(r)).green; } catch { return undefined; } })();
  const grid = Q.results.map(x => x.d); const start = grid.indexOf(PLAYER) + 1;
  const say = (p) => { let lap = 0; return p.seq.map((cp, k) => { lap += p.lens[k]; const W = p.windows?.[k]; const ty = (k && p.seq[k - 1] === cp ? 'fresh ' : '') + engTyres(cp); return k < p.seq.length - 1 ? `${ty} to lap ${lap}${W && W[1] > W[0] ? ` (laps ${W[0]} to ${W[1]})` : ''}` : `${ty} to the flag`; }).join(', then '); };
  const stops = (p) => ['No stop', 'One stop', 'Two stops', 'Three stops'][p.stops] || `${p.stops} stops`;
  // ours
  let ours = null; try { const { mine } = strategyRuns(s, r); if (Object.keys(mine).length >= 2) ours = optimalStrategies(mine, n, { loss: PL, sets: setsLeft(c, s, r).sets })[0] || null; } catch { }
  // the grid's, and the forecast
  let F = null; try { F = raceForecast(s, r); } catch { }
  let theirs = F?.plan || null; if (!theirs) try { const G = gridRuns(s, r); if (Object.keys(G).length >= 2) theirs = optimalStrategies(G, n, { loss: PL })[0] || null; } catch { }
  const near = grid.filter((d, k) => d !== PLAYER && Math.abs(k + 1 - start) <= 2);
  const ahead = near.filter(d => grid.indexOf(d) + 1 < start), behind = near.filter(d => grid.indexOf(d) + 1 > start);
  const me = F?.order.find(x => x.d === PLAYER);
  const parts = {};
  parts.plan = ours ? `${stops(ours)}: ${say(ours)}.` : 'No race strategy yet: it needs long runs on two dry compounds in practice. We will build it from the tyre you start on.';
  parts.start = `You start P${start}${ahead.length ? `, with ${list(ahead)} ahead` : ''}${behind.length ? `${ahead.length ? ' and' : ', with'} ${list(behind)} behind` : ''}.`;
  parts.others = theirs ? (ours && theirs.seq.join() === ours.seq.join() ? `The cars around you should do the same, ${stops(theirs).toLowerCase()}.` : `The cars around you should go ${stops(theirs).toLowerCase()}: ${say(theirs)}.`) : '';
  if (me) {
    const U = Math.max(6000, n * 120), close = Math.max(4000, n * 70);
    const rows = F.order; const pos = rows.indexOf(me) + 1;
    const best = 1 + rows.filter(x => x.t < me.t - U).length, worst = rows.filter(x => x.t <= me.t + U).length;
    const fight = rows.filter(x => x !== me && Math.abs(x.t - me.t) <= close).sort((a, b) => Math.abs(a.t - me.t) - Math.abs(b.t - me.t)).slice(0, 3).map(x => x.d);
    parts.fight = fight.length ? `We expect to be fighting ${list(fight)}.` : `Nobody close on race pace: a lonely one, most likely.`;
    parts.finish = best === worst ? `We expect P${pos}.` : `Most likely P${pos}, anywhere from P${best} to P${Math.max(worst, pos)}.`;
  } else {
    const L = gridIds(s).length; parts.fight = `No race pace from practice to go on. Starting around you: ${list(near) || 'nobody'}.`;
    parts.finish = `No long runs to forecast from. From P${start}, somewhere around P${Math.max(1, start - 3)} to P${Math.min(L, start + 3)}.`;
  }
  if (/ (fight|fighting|battle|battling|racing against|up against|rivals?) /.test(t)) return parts.fight;
  if (/ (finish|end up|range|result|where will) /.test(t)) return parts.finish;
  if (/ (others|other cars|everyone else|the rest|around us|around me) /.test(t) && !/ plan /.test(t)) return [parts.start, parts.others].filter(Boolean).join(' ');
  return [parts.plan, parts.start, parts.others, parts.fight, parts.finish].filter(Boolean).join(' ');
}
const engPick = (a) => a[Math.floor(Math.random() * a.length)];
/*
  Hearing it right. Talking fast, the speech recognition hears words that sound alike ("captain Verstappen" for "gap to
  Verstappen", "lactime" for "lap time"). When nothing you said matches an instruction, each run of one to four words
  is compared by sound with what the engineer knows (in a sentence that names a driver, team or car) (every instruction's phrases, and the radio's usual phrases): a
  close one that turns the sentence into an instruction is taken, the closest first. Names you said are left alone.
*/
/** How a word sounds, roughly: alike letters merged, vowels dropped after the first letter. */
const engKey = (w) => {
  let x = String(w).toLowerCase().replace(/[^a-z]/g, ''); if (!x) return '';
  x = x.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/[cqg]/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/v/g, 'f').replace(/b/g, 'p').replace(/d/g, 't').replace(/j/g, 'k');
  const f = 'aeiouyhw'.includes(x[0]) ? 'a' : x[0];
  return (f + x.slice(1).replace(/[aeiouyhw]/g, '')).replace(/(.)\1+/g, '$1');
};
/** Edits between two sound keys (a swap of two letters counts as one). */
function engDL(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
// the radio's usual phrases, on top of every instruction's own
const ENG_SAID = ['gap to', 'the gap to', 'lap time', 'last lap', 'best lap', 'box this lap', 'box box', 'the car ahead', 'the car behind', 'push lap', 'fastest lap', 'pit window', 'track limits', 'blue flag', 'safety car', 'undercut', 'overcut', 'tyres', 'penalty', 'hit me', 'keep me updated on', 'where am i losing to'];
const ENG_SMALL = new Set(['has', 'he', 'have', 'they', 'she', 'is', 'who', 'what', 'which', 'the', 'to', 'on', 'in', 'a', 'an', 'been', 'me', 'i', 'am', 'are', 'do', 'does', 'can', 'it', 'this', 'that', 'my', 'you', 'we', 'us', 'of', 'for', 'how', 'where', 'when', 'will', 'should', 'could', 'would', 'was', 'were', 'be', 'go', 'up', 'out', 'off', 'if', 'there']);
let engVocabMemo = null;
const engVocab = () => engVocabMemo ||= [...new Set([...ENG_INTENTS.filter(I => !I.low).flatMap(I => I.k.flat()), ...ENG_SAID])]
  .filter(p => !p.split(' ').every(w => ENG_SMALL.has(w))) // (not one made only of small words: "has he", "who is")
  .map(p => ({ p, n: p.split(' ').length, key: p.split(' ').map(engKey).join('') })).filter(v => v.key.length >= 3 && v.n <= 4);
/** What you most likely said: { t, I, shown(text, E) }, or null. */
function engCorrect(t, S, E) {
  const words = t.trim().split(' ').filter(Boolean); if (!words.length || words.length > 16) return null;
  // (only for a sentence about a driver, a team or a car: anything else is left as heard)
  if (!E || !(E.cars.length || E.team || E.rel || E.pos || E.pron)) return null;
  const keep = E.names || new Set(); let best = null;
  for (let i = 0; i < words.length; i++) for (let n = 1; n <= 4 && i + n <= words.length; n++) {
    const span = words.slice(i, i + n); if (span.some(w => keep.has(w))) continue;
    const sk = span.map(engKey).join(''); if (sk.length < 3) continue; const said = span.join(' ');
    for (const v of engVocab()) {
      if (v.p === said || Math.abs(v.n - n) > 1) continue;
      const lim = v.key.length <= 5 ? 1 : 2; if (Math.abs(v.key.length - sk.length) > lim) continue;
      const d = engDL(sk, v.key); if (d > lim) continue;
      const t2 = ' ' + [...words.slice(0, i), v.p, ...words.slice(i + n)].join(' ') + ' '; const I = engMatch(t2); if (!I || I.low) continue;
      if (E.cars.length && !(I.car || I.id === 'mate' || I.id === 'who')) continue; // a driver named: only an instruction about a driver
      // the closest by sound first; then one that starts the same, and (a driver named) an instruction about a driver
      const score = d * 10 + Math.abs(v.key.length - sk.length) + (v.key[0] !== sk[0] ? 3 : 0) - (E.cars.length && I.car ? 4 : 0) - (ENG_SAID.includes(v.p) ? 3 : 0) - v.key.length / 100; // (the radio's usual phrases win a close call)
      if (!best || score < best.score) best = { score, t: t2, I };
    }
  }
  if (!best) return null;
  // shown as you'd have written it: the names spelt right, a capital, and the question mark if you asked one
  best.shown = (text, E2) => {
    const s = S && latestSeason(); const proper = {};
    if (s) for (const d of gridIds(s)) { const nm = lastName(dName(s, d)); proper[nm.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] = nm; }
    for (const [w, to] of E2?.fix || []) proper[w] = to;
    const out = best.t.trim().split(' ').map(w => proper[w] || w).join(' ').replace(/\bi\b/g, 'I');
    return out.charAt(0).toUpperCase() + out.slice(1) + (/\?\s*$/.test(text) ? '?' : '');
  };
  return best;
}
/*
  Penalties and contact. F1 25 sends each penalty (who, what, for what, against whom) and each touch between two cars;
  the engineer answers a complaint with them, and tells you of a penalty as it's given.
*/
const ENG_COLL_INF = new Set([3, 4, 5, 6, 35]); // the infringements that are contact
const engPenWhy = (inf) => ({ 3: 'causing a collision', 4: 'causing a collision', 5: 'not giving the place back', 6: 'not giving the places back', 7: 'cutting the track', 8: 'cutting the track to pass', 9: 'cutting the track to pass', 11: 'ignoring blue flags', 12: 'ignoring yellow flags', 17: 'speeding in the pit lane', 27: 'track limits', 28: 'track limits', 29: 'track limits', 34: 'a jump start', 35: 'hitting the safety car', 36: 'passing under the safety car' })[inf] || '';
const engPenWhat = (p) => p.type === 4 ? `${p.time ? `${p.time} second` : 'time'} penalty` : p.type === 0 ? 'drive-through penalty' : p.type === 1 ? `${p.time ? `${p.time} second ` : ''}stop-go penalty` : p.type === 5 ? 'warning' : p.type === 6 ? 'disqualification' : p.type === 2 ? `${plural(p.places || 0, 'place')} grid penalty` : null;
/** The engineer's word on a penalty as it's given: yours, and one for a car that hit you. */
function engPenCalls(S, M, say) {
  const { L, me } = S; const P = L.recentPens || []; const key = (p) => `${p.t}:${p.car}:${p.type}:${p.infringement}`;
  if (!M.pens) { M.pens = new Set(P.map(key)); return; } // the ones from before the engineer was listening
  for (const p of P) {
    if (M.pens.has(key(p))) continue; M.pens.add(key(p));
    const what = engPenWhat(p); const why = engPenWhy(p.infringement); if (!what) continue;
    if (p.car === me.i) {
      if (p.type === 5) { if (why === 'track limits' || why === 'cutting the track') say(2, engPick(['Track limits warning. Careful.', 'That’s a warning for track limits. Keep it inside.'])); else if (why) say(2, `Warning for ${why}.`); }
      else say(1, `${cap1(what)}${why ? ` for ${why}` : ''}.${p.type === 4 ? ' We can make it back.' : ''}`, 1);
    } else if (p.other === me.i && ENG_COLL_INF.has(p.infringement) && p.type !== 5) {
      const o = L.field.find(y => y.i === p.car); if (o) say(1, `${S.name(o)} has a ${what} for the contact with you.`);
    }
  }
}
/*
  Damage, from F1 25's own figures for your car: each part's damage in percent. A front wing can be changed at a stop;
  the floor, diffuser and sidepods can't, so those are managed. Asked, the engineer reads it out; unasked, he tells you
  when a part takes a hit (in the race).
*/
const ENG_DMG_PART = [['fl', 'front left wing'], ['fr', 'front right wing'], ['rw', 'rear wing'], ['floor', 'floor'], ['diff', 'diffuser'], ['side', 'sidepods']];
function engDamageSay(S, asked) {
  const D = S?.L?.myDmg; if (!D) return null;
  const parts = ENG_DMG_PART.filter(([k]) => (D[k] || 0) >= 5).map(([k, n]) => `${n} ${D[k]}%`);
  const faults = [D.drs ? 'a DRS fault, it won’t open' : '', D.ers ? 'an ERS fault' : '', (D.gb || 0) >= 50 ? `gearbox damage, ${D.gb}%` : '', (D.eng || 0) >= 50 ? `engine damage, ${D.eng}%` : ''].filter(Boolean);
  if (!parts.length && !faults.length) return asked ? 'We don’t see any damage on the data. The car looks clean from here.' : null;
  const wing = Math.max(D.fl || 0, D.fr || 0); const aero = Math.max(D.floor || 0, D.diff || 0, D.side || 0);
  const advice = S.race && wing >= 30 ? ' Worth a new front wing at the stop.' : S.race && wing >= 10 ? ' The wing is OK for now, we can change it at the stop.' : '';
  const keep = aero >= 10 ? ` We can’t fix the ${(D.floor || 0) >= 10 ? 'floor' : (D.diff || 0) >= 10 ? 'diffuser' : 'sidepods'} at a stop, so we manage it.` : '';
  return `We see ${listJoin([...parts, ...faults])}.${advice}${keep}`;
}
/** Unasked, in the race: a part that's taken a hit since it was last mentioned (10 points or more). */
function engDamageCalls(S, M, say) {
  const D = S.L.myDmg; if (!D) return; const was = M.dmg || (M.dmg = { ...D }); let hit = false;
  for (const [k] of ENG_DMG_PART) if ((D[k] || 0) - (was[k] || 0) >= 10) hit = true;
  if ((D.drs && !was.drs) || (D.ers && !was.ers)) hit = true;
  if (hit) { M.dmg = { ...D }; const t = engDamageSay(S, false); if (t) say(1, t, 1); }
}
/** What the engineer says to an instruction: just an acknowledgement, never how it works. */
const engAck = () => ['Copy.', 'Copy that.', 'Understood.', 'Will do.', 'Copy, will do.'][Math.floor(Math.random() * 5)];
const engNoRace = 'No live race right now. Once you are on track, I will have the numbers.';
/*
  The instructions: each has its keywords (a sentence needs one from every group in `k`; a longer phrase that matches
  counts for more), examples for the Help tab, and the answer from the race as it stands. `car`: the question is about
  another car when one is named. `live: false` answers without a race.
*/
const ENG_INTENTS = [
  // ---- the race
  { id: 'gap', cat: 'The race', title: 'Gaps', k: [['gap', 'gaps', 'distance', 'how far', 'interval', 'seconds to', 'time to', 'catching', 'closing', 'how close', 'margin']], ex: ['What’s the gap to Verstappen?', 'How far is the car ahead?', 'Am I catching Norris?', 'Gap to the Ferrari'], car: true,
    say: (S, E, x) => !S.race && !x ? ([S.ahead && engRelGap(S, S.ahead), S.behind && engRelGap(S, S.behind)].filter(Boolean).join('. ') || 'No times to compare yet.') + '.' : x ? (x.i === S.me.i ? engYou(S) : `${engRelGap(S, x)}.${engTrend(S, x)}`) : (E.rel === 'ahead' && !S.ahead ? 'Nobody ahead, you are leading. ' : E.rel === 'behind' && !S.behind ? 'Nobody behind you. ' : '') + [S.ahead && `${S.name(S.ahead)} ${engSec(engGap(S, S.ahead))} ahead`, S.behind && `${S.name(S.behind)} ${engSec(-engGap(S, S.behind))} behind`].filter(Boolean).join(', ') + '.' },
  { id: 'who', cat: 'The race', title: 'Who’s around you', k: [['who is', 'who', 'which car', 'what car', 'name']], ex: ['Who’s ahead?', 'Who is behind me?', 'Who’s in P5?', 'Who is leading?'], car: true,
    say: (S, E, x) => x?.i === S.me.i ? engYou(S) : x ? `${x.i === S.byPos[0]?.i ? `${S.name(x)} is leading` : `P${x.pos} is ${S.name(x)}`}. ${engRelGap(S, x)}.` : `Ahead is ${S.ahead ? S.name(S.ahead) : 'nobody, you are leading'}. Behind is ${S.behind ? S.name(S.behind) : 'nobody'}.` },
  { id: 'pos', cat: 'The race', title: 'Positions', k: [['position', 'what place', 'where am i', 'what p', 'which place', 'am i leading', 'where are we', 'running', 'where is', 'where s']], ex: ['What position am I?', 'Where am I running?', 'What position is Verstappen?'], car: true,
    say: (S, E, x) => x && x.i !== S.me.i ? (S.race ? `${S.name(x)} is P${x.pos}. ${engRelGap(S, x)}.` : `${S.name(x)} is P${x.pos}${x.best ? ` on ${fmtLap(x.best)}` : ', no time yet'}.`) : S.race ? `You are P${S.me.pos}${S.me.pos === 1 ? ', leading the race' : ''}. ${plural(S.left, 'lap')} to go.` : !S.me.best ? 'No time on the board yet.' : S.me.pos === 1 ? `P1, fastest of anyone on ${fmtLap(S.me.best)}.` : `P${S.me.pos}, ${((S.me.best - S.top) / 1000).toFixed(3)} off the top.` },
  { id: 'laps', cat: 'The race', title: 'Laps or time left', k: [['laps left', 'laps to go', 'laps remaining', 'how many laps', 'what lap', 'which lap', 'how long left', 'how much longer', 'remaining', 'to go', 'time left', 'minutes left', 'how much time', 'time remaining', 'session time', 'clock']], ex: ['How many laps left?', 'What lap is it?', 'How much time is left?'],
    say: (S) => S.race ? `Lap ${S.me.lap} of ${S.N}. ${plural(S.left, 'lap')} to go.` : S.L.timeLeft != null ? `${lsClock(S.L.timeLeft)} left. You're on lap ${S.me.lap}.` : `You're on lap ${S.me.lap}.` },
  { id: 'leader', cat: 'The race', title: 'The leader', k: [['leader', 'leading', 'in the lead', 'who is first', 'winning', 'who is quickest', 'who is fastest', 'who is on top', 'top of the timesheet', 'top time', 'fastest time']], ex: ['Who’s leading?', 'Gap to the leader', 'Who is winning?'],
    say: (S) => { const x = S.byPos[0]; if (!S.race) return !x?.best ? 'Nobody has a time yet.' : x.i === S.me.i ? `You are quickest, ${fmtLap(x.best)}.` : `${S.name(x)} is quickest, ${fmtLap(x.best)}. ${engRelGap(S, x)}.`; return x.i === S.me.i ? `You are leading.${S.behind ? ` ${S.name(S.behind)} is ${engSec(-engGap(S, S.behind))} behind.` : ''}` : `${S.name(x)} is leading, ${engSec(engGap(S, x))} up the road.`; } },
  { id: 'pace', cat: 'The race', title: 'Pace', k: [['pace', 'lap times', 'laptimes', 'faster', 'quicker', 'slower', 'losing time', 'gaining', 'speed', 'how quick', 'how fast']], ex: ['How’s my pace?', 'Am I quicker than Leclerc?', 'Pace of the car behind'], car: true,
    say: (S, E, x) => { const y = x || S.ahead || S.behind; const last = S.me.last ? `Last lap ${fmtLap(S.me.last)}.` : ''; if (!S.race) return x ? engLapsOf(S, x) : y ? `${last} ${engRelGap(S, y)} on best laps.`.trim() : last || 'No lap times yet.'; return y ? `${last}${engTrend(S, y) || ` Not enough clean laps against ${S.name(y)} yet.`}` : last || 'No lap times yet.'; } },
  { id: 'lastlap', cat: 'The race', title: 'Your last lap', k: [['last lap', 'my lap', 'lap time', 'laptime', 'time', 'times', 'best time', 'last time', 'how was that', 'that lap', 'my time', 'best lap', 'his lap', 'her lap', 'their lap', 'what did he do', 'what did she do', 'what did they do']], ex: ['What was my last lap?', 'How was that lap?', 'What’s Norris’s lap time?', 'Leclerc’s best lap?'], car: true,
    say: (S, E, x) => { if (x && x.i !== S.me.i) return engLapsOf(S, x); const b = S.race ? engMem.best?.[S.me.i] : S.me.best; return S.me.last ? `Last lap ${fmtLap(S.me.last)}.${b && b !== S.me.last ? ` Your best is ${fmtLap(b)}.` : b ? ' That is your best.' : ''}` : 'No lap time yet.'; } },
  { id: 'fastest', cat: 'The race', title: 'Fastest lap', k: [['fastest lap', 'purple', 'quickest lap', 'fastest car', 'fastest on track']], ex: ['Who has the fastest lap?', 'Who’s quickest on track?', 'What’s Piastri’s fastest lap?'], car: true,
    say: (S, E, y) => { if (y && y.i !== S.me.i) return engLapsOf(S, y); if (!S.race) { const x = S.byPos.find(y => y.best === S.top); return x ? `${x.i === S.me.i ? 'You have' : `${S.name(x)} has`} the fastest lap, ${fmtLap(S.top)}.` : 'No times yet.'; } const B = Object.entries(engMem.best || {}).sort((a, b) => a[1] - b[1])[0]; if (!B) return 'No fastest lap yet.'; const x = S.L.field.find(y => y.i === +B[0]); return x?.i === S.me.i ? `You have the fastest lap, ${fmtLap(B[1])}.` : `${S.name(x)} has the fastest lap, ${fmtLap(B[1])}.`; } },
  { id: 'mate', cat: 'The race', title: 'Your teammate', k: [['teammate']], ex: ['Where’s my teammate?', 'Gap to my teammate'],
    say: (S, E, x) => x ? `${S.name(x)} is P${x.pos}. ${engRelGap(S, x)}.` : 'I can’t see your teammate.' },
  { id: 'finish', race: true, cat: 'The race', title: 'Projected finish', k: [['finish', 'projected', 'projection', 'predict', 'end up', 'expect', 'chances', 'where will i', 'podium', 'points']], ex: ['Where will I finish?', 'Can we get a podium?', 'Are we in the points?'],
    say: (S) => { const P = S.ST?.posNote; return P ? `Most likely P${P.mode}, anywhere from P${P.best} to P${P.worst}.` : `You are P${S.me.pos}, ${S.me.pos <= 10 ? 'in the points' : `${S.me.pos - 10} places off the points`}.`; } },
  { id: 'standings', race: true, cat: 'The race', title: 'The championship', k: [['championship', 'standings', 'title', 'table', 'points lead', 'championship lead']], ex: ['How’s the championship looking?', 'Where are we in the standings?'],
    say: (S) => { let R; try { R = liveStandings(S.c, S.s, S.r, S.L, S.idOf, 'driver').rows; } catch { return 'I can’t work out the standings right now.'; } const k = R.findIndex(x => x.id === PLAYER); if (k < 0) return 'You’re not in the standings yet.'; const lead = R[0]; return k === 0 ? `As it stands, you lead the championship by ${R[1] ? R[0].pts - R[1].pts : 0} points.` : `As it stands, you are P${k + 1} in the championship on ${R[k].pts}, ${lead.pts - R[k].pts} behind ${lastName(dName(S.s, lead.id))}.`; } },
  { id: 'watch', cat: 'The race', title: 'Follow a car', k: [['keep me updated on', 'keep me posted on', 'update me on', 'updates on', 'lap by lap', 'every lap', 'each lap', 'gaps to', 'keep an eye on', 'watch', 'follow', 'track', 'tell me about', 'let me know about', 'let me know if', 'tell me if']], ex: ['Keep me updated on Piastri', 'Keep an eye on the car behind', 'Let me know if Norris pits'], car: true,
    say: (S, E, x) => { if (!x) { engSet({ chat: 3 }); return engAck(); } engWatchSet(S, x, true); return engAck(); } },
  { id: 'unwatch', cat: 'The race', title: 'Stop following a car', k: [['stop updates on', 'no more updates on', 'stop watching', 'forget about', 'stop following', 'stop tracking', 'no updates on', 'dont need updates on', "don't need updates on"]], ex: ['Stop updates on Piastri', 'Forget about Norris'], car: true,
    say: (S, E, x) => { if (!x) { engWatch = { uid: null, ids: new Set() }; return engAck(); } engWatchSet(S, x, false); return engAck(); } },
  { id: 'raceplan', cat: 'The race', title: 'The race plan (after qualifying)', live: false, k: [['plan for the race', 'race plan', 'plan for tomorrow', 'plan for today', 'race strategy', 'strategy for the race', 'what is the plan', 'what is our plan', 'whats the plan', 'game plan', 'brief me', 'briefing', 'pre race', 'prerace', 'who are we fighting', 'who will we fight', 'who are we racing', 'who will we be racing', 'who will we be fighting', 'who are our rivals', 'what do we expect', 'what are the others doing', 'what will the others do', 'what are the cars around', 'cars around us', 'cars around me', 'the others do', 'everyone else do', 'rest of the field']], ex: ['What’s our plan for the race?', 'Who are we fighting?', 'Where will we finish?', 'What will the cars around us do?'],
    say: (S, E, x, t) => { if (S?.race) { const I = (id) => ENG_INTENTS.find(i => i.id === id); return `${I('stop').say(S, E, x, t)} ${I('finish').say(S)}`; } return engBriefing(t) || 'The race plan comes once qualifying is logged.'; } },
  // ---- chatter: what drivers say on the radio that isn't a question about the numbers
  { id: 'contact', cat: 'Chatter', title: 'Contact and appeals', k: [['hit me', 'hit us', 'ran into me', 'drove into me', 'drove in to me', 'went into me', 'into the back of me', 'hit the back of me', 'rear ended', 'rammed', 'side swiped', 'squeezed me', 'crashed into me', 'smashed into me', 'rammed me', 'punted me', 'pushed me off', 'pushed me wide', 'forced me off', 'ran me off', 'ran me wide', 'divebomb', 'dive bomb', 'dive bombed', 'turned in on me', 'turned into me', 'took me out', 'tagged me', 'touched me', 'clipped me', 'contact', 'collision', 'give him a penalty', 'penalty for him', 'penalty for that', 'that is a penalty', "that's a penalty", 'report him', 'report that', 'investigate', 'stewards', 'dangerous', 'unsafe', 'dirty', 'what was that', 'did you see that', 'blocked me', 'impeded', 'held me up', 'in my way']], ex: ['He just hit me!', 'That’s a penalty, report him', 'Did you see that? He pushed me off', 'He impeded me'], car: true,
    say: (S, E, x) => {
      const { L, me } = S; const now = L.clock || 0;
      if (!S.race) return x ? engPick([`Noted. We’ve reported ${S.name(x)} to the stewards.`, `Copy, it’s with the stewards.`]) : engPick(['Noted, we’ve reported it to the stewards.', 'Copy. We’ll ask them to look at it.']);
      const C = (L.recentColl || []).filter(c => (c.a === me.i || c.b === me.i) && now - c.t < 45 && c.t <= now + 1).pop();
      const oi = C ? (C.a === me.i ? C.b : C.a) : x?.i; const o = L.field.find(y => y.i === oi) || x; const nm = o ? S.name(o) : 'him';
      const pens = (L.recentPens || []).filter(p => ENG_COLL_INF.has(p.infringement) && (C ? p.t >= C.t - 1 : now - p.t < 45));
      const theirs = pens.find(p => p.car === oi && engPenWhat(p)), ours = pens.find(p => p.car === me.i && engPenWhat(p));
      if (theirs) return theirs.type === 5 ? `Race control has given ${nm} a warning for it.` : engPick([`Yeah, race control agrees. ${cap1(engPenWhat(theirs))} for ${nm}.`, `Already done. ${nm} has a ${engPenWhat(theirs)}.`]);
      if (ours) return ours.type === 5 ? 'They’ve given us a warning for that one. Careful.' : engPick([`Unfortunately it’s on us. ${cap1(engPenWhat(ours))}. Head down.`, `The stewards gave it to us, ${engPenWhat(ours)}. Let’s make it back.`]);
      if (!C) return x ? engPick([`We didn’t see contact with ${nm} from here. We’ll keep an eye on him.`, `Copy, we’ll watch ${nm}.`]) : engPick(['We didn’t see contact from here. Keep pushing.', 'Nothing on our side. Head down.']);
      // who was at fault, as far as we can tell: usually the car that was behind
      const mine = C.a === me.i ? C.posA : C.posB, his = C.a === me.i ? C.posB : C.posA;
      if (!mine || !his) return engPick([`Copy, we’ll ask race control to look at it.`, 'Understood, it’s with the stewards.']);
      if (his > mine) return engPick([`Yeah, we saw it. We’ve reported ${nm} to race control.`, 'Understood, it’s with the stewards.', `Copy, we’ve asked race control to look at ${nm}.`]);
      return engPick(['We’ll mention it, but that one looked like yours. Let’s keep pushing.', 'Copy. Not sure the stewards will see it that way. Head down.', 'Understood. Leave it, let’s just keep pushing.']);
    } },
  { id: 'pens', cat: 'Chatter', title: 'Penalties and warnings', k: [['do i have a penalty', 'did i get a penalty', 'have i got a penalty', 'any penalties', 'my penalty', 'penalised', 'penalized', 'penalties', 'penalty', 'track limits', 'warnings', 'warning', 'black and white']], ex: ['Did I get a penalty?', 'How many track limits warnings?', 'Has Norris got a penalty?'], car: true,
    say: (S, E, x) => {
      const y = x && x.i !== S.me.i ? x : S.me; const nm = y === S.me ? null : S.name(y);
      const last = (S.L.recentPens || []).filter(p => p.car === y.i && engPenWhat(p) && p.type !== 5).pop(); const why = last && engPenWhy(last.infringement);
      const pen = y.pen || 0, warn = y.warn || 0;
      if (!nm) return pen ? `You have ${plural(pen, 'second')} of penalties${why ? `, for ${why}` : ''}.${warn ? ` And ${plural(warn, 'warning')}.` : ''}` : warn ? `No penalties. ${plural(warn, 'track limits warning')} though, careful.` : 'No penalties, no warnings. All clean.';
      return pen ? `${nm} has ${plural(pen, 'second')} of penalties${why ? `, for ${why}` : ''}.` : `${nm} has no penalties${warn ? `, ${plural(warn, 'warning')}` : ''}.`;
    } },
  { id: 'blue', cat: 'Chatter', title: 'Blue flags and letting you by', k: [['blue flag', 'blue flags', 'get out of the way', 'out of my way', 'move over', 'let me past', 'let me through', 'let me by', 'not letting me', 'backmarker', 'lapped car', 'team orders', 'tell him to move', 'tell him to let me', 'swap positions', 'switch positions']], ex: ['Blue flags! He’s not moving', 'Tell my teammate to let me by', 'Get him out of the way'],
    say: (S) => {
      if (!S.race) return engPick(['Noted, we’ll report the impeding.', 'Copy. We’ll tell race control.']);
      const A = S.ahead; if (!A) return 'There’s nobody ahead of you.';
      const down = (S.G[A.i]?.down ?? 0) - (S.G[S.me.i]?.down ?? 0); const tm = teamOf(S.s, PLAYER); const mate = tm && S.idOf(A.i) !== PLAYER && tm.drivers.includes(S.idOf(A.i));
      if (down >= 1) return engPick([`${S.name(A)} has blue flags. He’ll let you through.`, 'Blue flags are out for him. He has to move.']);
      if (mate) return engPick([`Copy, we’ll talk to ${S.name(A)}.`, 'Understood. We’ll ask him to let you by.']);
      return engPick([`Negative, ${S.name(A)} is racing you for position.`, 'He’s racing you, no blue flags. You’ll have to pass him.']);
    } },
  { id: 'crash', cat: 'Chatter', title: 'Crashed or stuck', k: [['i crashed', 'crashed', 'in the wall', 'hit the wall', 'into the wall', 'i am out', 'race is over', 'have to retire', 'retire the car', 'beached', 'stuck', 'in the gravel', 'car is broken', 'lost the car']], ex: ['I’ve crashed', 'I’m in the gravel', 'I think the race is over'],
    say: (S, E, x, t) => / (gravel|stuck|beached) /.test(t || '') ? 'Get it going if you can. Come back to the pits.' : engPick(['Are you OK? If the car moves, bring it back to the pits.', 'Understood. Are you OK? Bring it home if you can.']) },
  { id: 'vent', cat: 'Chatter', title: 'Letting off steam', low: true, car: true, k: [['this is a joke', 'joke', 'useless', 'terrible', 'awful', 'rubbish', 'garbage', 'trash', 'no grip', 'cant drive', "can't drive", 'this car', 'i hate', 'unbelievable', 'ridiculous', 'idiot', 'moron', 'clown', 'are you kidding', 'come on man', 'what is he doing', 'fuck', 'fucking', 'shit', 'damn', 'bloody', 'christ', 'seriously']], ex: ['This car is undriveable, no grip', 'What is he doing? Idiot!', 'Are you kidding me?'], live: false,
    say: (S, E, x) => x && S ? engPick([`Yeah, ${S.name(x)} is all over the place. Give him room.`, `Leave ${S.name(x)}, focus on your own race.`]) : S && !S.race ? engPick(['Reset. Next lap.', 'Understood. Deep breath, go again.']) : engPick(['Understood. Deep breath, plenty of race left.', 'Copy. Head down, we go again.', 'Keep calm, we’ll get it back.']) },
  { id: 'joy', cat: 'Chatter', title: 'Celebrating', low: true, k: [['get in', 'come on', 'lets go', "let's go", 'woo', 'wooo', 'woohoo', 'yeah baby', 'what a lap', 'what a move', 'beautiful', 'mega', 'we did it', 'that was awesome', 'love it', 'brilliant', 'unreal', 'get in there']], ex: ['Get in! What a move!', 'Come on! What a lap!', 'We did it!'], live: false,
    say: (S) => !S ? 'Great stuff!' : S.L.done ? (S.me.pos === 1 ? 'Get in there! P1! Fantastic job, mate.' : S.me.pos <= 3 ? `P${S.me.pos}! Great job, mate.` : `P${S.me.pos}. Good job, well driven.`) : !S.race ? (S.me.pos === 1 ? 'Mega lap! P1.' : `Good lap. P${S.me.pos}.`) : S.me.pos === 1 ? engPick(['Yes! Leading the race. Keep it going.', 'Great stuff. Now bring it home.']) : engPick([`Good stuff, P${S.me.pos}. Keep it going.`, 'Lovely. Keep it up.', 'Nice work. Keep pushing.']) },
  { id: 'hello', cat: 'Chatter', title: 'Are you there?', low: true, k: [['hello', 'hey', 'hi', 'how are you', 'you there', 'are you there', 'anyone there', 'talk to me', 'mate']], ex: ['Hello, are you there?', 'Talk to me'], live: false, say: () => engPick(['Go ahead.', 'Right here, go ahead.', 'Loud and clear.']) },
  // ---- tyres and stops
  { id: 'tyres', cat: 'Tyres and stops', title: 'Tyres', k: [['tyre', 'tyres', 'wear', 'grip', 'rubber', 'compound', 'degradation', 'deg', 'softs', 'mediums', 'hards', 'inters', 'what is he on', 'what is she on', 'what are they on', 'what are they on']], ex: ['How are my tyres?', 'What tyres is Hamilton on?', 'How much wear?', 'What is the car ahead on?'], car: true,
    say: (S, E, x) => x ? `${S.name(x)} is on ${engCarTyre(S, x)}${x.stops ? `, ${plural(x.stops, 'stop')} made` : ', no stops yet'}.` : `${cap1(engCarTyre(S, S.me))}.${S.ST?.curLife != null ? ` About ${plural(Math.max(0, S.ST.curLife), 'lap')} left in them.` : ''}` },
  { id: 'life', cat: 'Tyres and stops', title: 'Tyre life', k: [['how long', 'last', 'make it', 'go longer', 'extend', 'life', 'to the end', 'to the flag', 'hold on']], ex: ['How long will these tyres last?', 'Can I make it to the end?', 'Can we go longer?'],
    say: (S) => { if (!S.race) return S.me.age != null ? `${plural(S.me.age, 'lap')} on this set.` : 'No tyre data yet.'; const life = S.ST?.curLife; if (life == null) return 'Not enough laps on this set to tell yet.'; return life >= S.left ? `They should make the end. About ${plural(life, 'lap')} in them, ${plural(S.left, 'lap')} to go.` : `About ${plural(Math.max(0, life), 'lap')} left in them. They won’t make the end.`; } },
  { id: 'boxnow', cat: 'Tyres and stops', title: 'Box this lap (you tell the team)', k: [['box this lap', 'pit this lap', 'box now', 'pit now', 'coming in', 'boxing', 'i am boxing', 'box box', 'pit me', 'bring me in', 'i want to box', 'i want to pit', 'can i box', 'should i box', 'should i pit', 'can i pit']], ex: ['Box this lap', 'I want to pit', 'Should I box?', 'Coming in'],
    say: (S) => { if (!S.race) return ['Copy, box this lap.', 'Box, box. Copy.', 'Copy. Box this lap.'][Math.floor(Math.random() * 3)]; const n = S.plan?.stints?.[0]?.c; const RJ = S.RJ; const out = RJ ? ` You would come out P${RJ.pos}${RJ.ahead ? `, behind ${S.name(RJ.ahead)}` : ''}.` : ''; if (S.call) return `Yes, box this lap for ${engTyres(S.call.c)}.${out}`; const k = S.ST?.k ?? S.plan?.k; return n ? `Copy. We had you stopping on lap ${S.me.lap + (k || 1) - 1}, but box this lap is fine: ${engTyres(n)}.${out}` : `Copy, box this lap.${out}`; } },
  { id: 'stayout', cat: 'Tyres and stops', title: 'Stay out', k: [['stay out', 'staying out', 'not boxing', 'no box', 'dont box', "don't box", 'not pitting', 'one more lap', 'another lap']], ex: ['I’m staying out', 'One more lap', 'Not boxing'],
    say: (S) => { if (!S.race) return engAck(); const life = S.ST?.curLife; return `Copy, stay out.${life != null ? ` About ${plural(Math.max(0, life), 'lap')} left in these.` : ''}`; } },
  { id: 'stop', cat: 'Tyres and stops', title: 'The next stop', k: [['box', 'pit', 'stop', 'strategy', 'plan', 'when do we', 'when are we', 'pit window', 'window']], ex: ['When do I box?', 'What’s the plan?', 'What’s the strategy?', 'When is the pit window?'],
    say: (S, E, x, t) => { if (!S.race) return / (when|plan|strategy|window) /.test(t) ? 'No stops to plan in this one. Box whenever you want.' : 'Copy, box this lap.'; if (S.call) return `Box this lap for ${engTyres(S.call.c)}.`; const p = S.plan; if (!p) return S.ST?.none ? 'No plan on these tyres yet.' : 'No plan fits with the tyres left.'; if (!p.stints.length) return 'No more stops. To the flag on this set.'; const k = S.ST?.k ?? p.k; return `Next stop lap ${S.me.lap + k - 1}${p.window?.[1] > p.window?.[0] ? `, window laps ${S.me.lap + p.window[0] - 1} to ${S.me.lap + p.window[1] - 1}` : ''}, onto ${p.stints.map(x => engTyres(x.c)).join(', then ')}.`; } },
  { id: 'rejoin', race: true, cat: 'Tyres and stops', title: 'Where you’d rejoin', k: [['rejoin', 'come out', 'where would i', 'exit', 'drop to']], ex: ['Where would I come out?', 'Would I rejoin in traffic?'],
    say: (S) => S.RJ ? `If you box now, you come out P${S.RJ.pos}${S.RJ.ahead ? `, ${engSec(S.RJ.gapA)} behind ${S.name(S.RJ.ahead)}` : ', in the lead'}${S.RJ.behind ? `, ${engSec(S.RJ.gapB)} ahead of ${S.name(S.RJ.behind)}` : ''}.` : 'I can’t work that out right now.' },
  { id: 'undercut', race: true, cat: 'Tyres and stops', title: 'Undercut and overcut', k: [['undercut', 'overcut', 'jump him', 'get past in the pits', 'pit stop to pass']], ex: ['Can we undercut Norris?', 'Is the overcut on?'], car: true,
    say: (S, E, x) => { const y = x || S.ahead; if (!y) return 'Nobody close enough to try it on.'; const g = engGap(S, y); const loss = S.ST?.lossNow ?? 20000;
      if (g < 0) return `${S.name(y)} is ${engSec(g)} behind you on ${engCarTyre(S, y)}. If he boxes first, cover him the lap after.`;
      return `${S.name(y)} is ${engSec(g)} ahead on ${engCarTyre(S, y)}. Box now and you come out about ${engSec(g + loss)} behind him, so you'd need to find ${engSec(g)} on fresher tyres before he stops.${g < 3500 ? ' That’s on if he stays out a couple of laps.' : ' Too big a gap for the undercut right now.'}`; } },
  { id: 'stops', race: true, cat: 'Tyres and stops', title: 'Others’ stops', k: [['pitted', 'boxed', 'stopped', 'stops', 'been in', 'has he', 'have they']], ex: ['Has Russell pitted?', 'How many stops has the car ahead made?'], car: true,
    say: (S, E, x) => x ? `${S.name(x)} has ${x.stops ? `stopped ${x.stops === 1 ? 'once' : x.stops === 2 ? 'twice' : x.stops + ' times'}` : 'not stopped yet'}. ${cap1(engCarTyre(S, x))}.` : `You have made ${plural(S.me.stops || 0, 'stop')}.` },
  // ---- practice and qualifying
  { id: 'losing', cat: 'Practice and qualifying', title: 'Where you’re losing time', k: [['losing to', 'losing time to', 'where am i losing', 'where is he faster', 'where is she faster', 'where are they faster', 'where am i slow', 'where can i gain', 'where am i slower', 'where is the time', 'where do i lose', 'losing time', 'compare my lap', 'gain time']], ex: ['Where am I losing to Verstappen?', 'Where can I gain time on the car ahead?', 'Where’s the time to P1?'], car: true, live: true,
    say: async (S, E, x) => { const y = x || (S.race ? S.ahead : S.byPos.find(z => z.best === S.top && z.i !== S.me.i) || S.ahead); if (!y) return 'Nobody to compare with.'; const R = await lsLosing(S.c, S.s, S.r, S.L, PLAYER, S.idOf(y.i), S.me.i, y.i); return lsLosingSay(R, S.name(y)); } },
  { id: 'cutoff', cat: 'Practice and qualifying', title: 'The cut-off (qualifying)', k: [['drop zone', 'cut off', 'cutoff', 'knocked out', 'elimination', 'am i safe', 'get through', 'into q2', 'into q3', 'make it through', 'go through', 'am i through']], ex: ['Am I safe?', 'How far am I from the drop zone?', 'Will I get through?'],
    say: (S) => { const K = S.cut; if (!K) return S.race ? 'That one is for qualifying.' : 'Nobody drops out of this one.'; if (!S.me.best) return `No time yet. P${K.cut} is ${K.rival?.best ? fmtLap(K.rival.best) : 'open'}.`; return K.safe ? `Through as it stands, P${S.me.pos}.${K.margin != null ? ` ${(K.margin / 1000).toFixed(3)} clear of P${K.cut + 1}.` : ''}` : `In the drop zone, P${S.me.pos}.${K.margin != null ? ` ${(Math.abs(K.margin) / 1000).toFixed(3)} off P${K.cut}.` : ''}`; } },
  { id: 'traffic', cat: 'Practice and qualifying', title: 'Traffic on track', k: [['traffic', 'clear track', 'is it clear', 'on track ahead', 'gap on track', 'space', 'anyone ahead on track', 'who is on track']], ex: ['Am I in traffic?', 'Is it clear ahead?'],
    say: (S) => { const T = S.race ? null : S.TR; if (!T) return S.race ? 'Ask me for the gap ahead in the race.' : 'You are not on track.'; const f = (o) => `${S.name(o.x)}, ${o.s.toFixed(1)} seconds, ${(LS_STATUS[o.x.ds] || 'on track').toLowerCase()}`; return `Ahead: ${T.ahead ? f(T.ahead) : 'clear'}. Behind: ${T.behind ? f(T.behind) : 'clear'}.`; } },
  { id: 'sectors', cat: 'Practice and qualifying', title: 'Sectors', k: [['sector', 'sectors', 'ideal lap', 'best sectors', 'theoretical']], ex: ['How are my sectors?', 'What’s my ideal lap?'],
    say: (S) => { const B = S.me.bestS || []; if (!B.every(Boolean)) return 'Not enough laps for all three sectors yet.'; const all = [0, 1, 2].map(k => Math.min(...S.L.field.map(x => x.bestS?.[k]).filter(Boolean))); const worst = [0, 1, 2].map(k => B[k] - all[k]); const k = worst.indexOf(Math.max(...worst)); return `Your ideal lap is ${fmtLap(B[0] + B[1] + B[2])}. You're furthest off in sector ${k + 1}, ${(worst[k] / 1000).toFixed(3)} to the best.`; } },
  // ---- the car
  { id: 'fuel', cat: 'The car', title: 'Fuel', k: [['fuel', 'lift and coast', 'lift', 'coast', 'consumption', 'kilos', 'save fuel']], ex: ['How’s the fuel?', 'Do I need to save fuel?'],
    say: (S) => { const F = S.FP; if (!F) return 'No fuel reading yet.'; return F.end >= 0 ? `Fuel is fine. About ${F.lapsSpare.toFixed(1)} laps spare at the flag.` : `We are short. Save ${F.save.toFixed(2)} kg a lap.`; } },
  { id: 'ers', cat: 'The car', title: 'ERS and battery', k: [['ers', 'battery', 'deploy', 'deployment', 'energy', 'overtake', 'harvest', 'charge', 'hybrid']], ex: ['How’s the battery?', 'Can I use overtake?', 'ERS?'],
    say: (S) => S.L.store == null ? 'No battery reading yet.' : `Battery at ${Math.round(S.L.store / 40)}%, ${(S.L.store / 1000).toFixed(1)} megajoules.${S.L.store > 2500 ? ' Plenty there, use it.' : S.L.store < 1000 ? ' Low, harvest for a bit.' : ''}` },
  { id: 'weather', cat: 'The car', title: 'Weather', k: [['weather', 'rain', 'wet', 'dry', 'forecast', 'cloud', 'sun', 'track temp', 'temperature', 'drizzle']], ex: ['Is rain coming?', 'What’s the weather doing?', 'Track temperature?'],
    say: (S) => { const W = S.L.weather; if (!W) return 'No weather from the game.'; const fc = (W.forecast || []).filter(x => x.session === S.L.sessionType && x.at > 0).slice(0, 2); return `${WEATHER[W.now]?.[0] || 'Unknown'}, track ${W.track} degrees.${fc.length ? ` In ${fc[0].at} minutes, ${fc[0].rain}% chance of rain.` : ''}${S.WC?.text ? ` ${S.WC.text.replace(':', '.')}` : ''}`; } },
  { id: 'push', cat: 'The car', title: 'Push or look after it', k: [['push', 'attack', 'go for it', 'flat out', 'full send', 'quali mode', 'qualifying mode', 'give it everything']], ex: ['Can I push?', 'Can I go flat out?'],
    say: (S) => { if (!S.race) return S.L.kind === 'quali' ? 'Yes, full push. Everything you have.' : 'Yes, push when you are ready.'; const life = S.ST?.curLife; const ok = life == null || life >= Math.min(S.left, (S.ST?.k ?? 99)) + 2; const fuel = S.FP && S.FP.end < 0; return ok && !fuel ? 'Yes, you can push. Tyres and fuel are fine.' : fuel ? 'Careful, we need to save fuel.' : 'Careful with the tyres, they need to last.'; } },
  { id: 'defend', race: true, cat: 'The car', title: 'Defending', k: [['defend', 'cover', 'block', 'protect', 'under pressure']], ex: ['Do I need to defend?', 'Is he close enough to attack?'],
    say: (S) => { const b = S.behind; if (!b) return 'Nobody behind you.'; const g = -engGap(S, b); return `${S.name(b)} is ${engSec(g)} behind.${g < 1000 ? ' DRS range, cover the inside.' : ''}${engTrend(S, b)}`; } },
  { id: 'damage', cat: 'The car', title: 'Damage and problems', k: [['damage', 'damaged', 'wing', 'front wing', 'nose', 'broken', 'puncture', 'floor', 'sidepod', 'sidepods', 'side pod', 'diffuser', 'drs', 'problem', 'issue', 'something wrong', 'undriveable', 'vibration', 'feels weird', 'strange', 'lost downforce']], ex: ['I’ve got damage', 'Something feels wrong with the car'],
    say: (S) => engDamageSay(S, true) || `Understood. We can’t see the damage data from here.${S.ST?.curLife != null ? ` Tyres look normal, about ${plural(Math.max(0, S.ST.curLife), 'lap')} left in them.` : ''} Keep going and tell us if it gets worse.` },
  { id: 'sc', cat: 'The car', title: 'Safety car', k: [['safety car', 'vsc', 'virtual', 'yellow', 'neutralised', 'red flag']], ex: ['Is the safety car out?', 'Is it a VSC?'],
    say: (S) => S.L.red ? 'Red flag. Back to the pits.' : S.L.sc === 1 ? `Safety car is out.${S.call?.kind === 'sc' ? ` Box this lap for ${engTyres(S.call.c)}.` : ''}` : S.L.sc === 2 ? 'Virtual safety car. Keep to your delta.' : 'Green flag. No safety car.' },
  // ---- the radio itself
  { id: 'check', cat: 'The radio', title: 'Radio check', k: [['radio check', 'hear me', 'can you hear', 'testing', 'is this working', 'mic check']], ex: ['Radio check', 'Can you hear me?'], live: false, say: () => 'Loud and clear.' },
  { id: 'repeat', cat: 'The radio', title: 'Say it again', k: [['repeat', 'say again', 'say that again', 'didnt catch', "didn't catch", 'pardon', 'come again', 'what did you say']], ex: ['Say again?', 'Repeat that'], live: false, say: () => engLast || 'Nothing to repeat.' },
  { id: 'quiet', cat: 'The radio', title: 'Less radio', k: [['quiet', 'leave me', 'shut up', 'less radio', 'stop talking', 'no more radio', 'let me drive', 'focus', 'less talking']], ex: ['Leave me alone', 'Less radio please'], live: false, say: () => { engSet({ chat: 1 }); return engAck(); } },
  { id: 'more', cat: 'The radio', title: 'More radio', k: [['more info', 'talk more', 'more radio', 'keep me updated', 'updates', 'keep me posted', 'more updates', 'every lap']], ex: ['Keep me updated', 'Gaps every lap'], live: false, say: () => { engSet({ chat: 3 }); return engAck(); } },
  { id: 'normal', cat: 'The radio', title: 'Normal radio', k: [['normal radio', 'back to normal', 'normal updates']], ex: ['Back to normal radio'], live: false, say: () => { engSet({ chat: 2 }); return engAck(); } },
  { id: 'thanks', cat: 'The radio', title: 'Thanks', low: true, k: [['thanks', 'thank you', 'cheers', 'nice one', 'good job', 'great job', 'well done']], ex: ['Thanks', 'Good job, guys'], live: false, say: () => 'No worries. Keep it up.' },
  { id: 'sorry', cat: 'The radio', title: 'Mistakes', low: true, k: [['sorry', 'my bad', 'my mistake', 'apologies', 'i messed up', 'lost it', 'spun', 'went off', 'messed that up', 'binned it', 'locked up']], ex: ['Sorry, my mistake', 'I spun'], live: false, say: (S) => engPick(S && !S.race ? ['No worries. Reset, next lap.', 'Forget it. Cool the tyres and go again.'] : ['No worries. Head down, plenty of race left.', 'Forget it, we go again.', 'No problem. Reset and push.']) },
  { id: 'copy', cat: 'The radio', title: 'Copy', low: true, k: [['copy', 'understood', 'okay', 'ok', 'roger', 'got it', 'yes', 'yep', 'will do']], ex: ['Copy', 'Understood'], live: false, say: () => 'Copy.' },
];
/** The instruction a sentence matches: every keyword group must match; the longest phrase matched wins. A thank-you, an
 *  apology or a "copy" only counts when nothing else does ("okay, what's the gap?" asks for the gap). */
function engMatch(t) {
  let best = null;
  for (const I of [...ENG_INTENTS].sort((a, b) => !!a.low - !!b.low)) {
    if (I.low && best) break;
    let score = 0; let ok = true;
    for (const grp of I.k) { let m = 0; for (const w of grp) if (t.includes(' ' + w + ' ')) m = Math.max(m, w.split(' ').length + w.length / 100); if (!m) { ok = false; break; } score += m; }
    if (ok && (!best || score > best.score)) best = { I, score };
  }
  return best?.I || null;
}
const engPrompt = () => {
  const s = latestSeason(); const grid = s ? gridIds(s).map(d => lastName(dName(s, d))).filter(Boolean) : []; const names = [...new Set([...grid, ...(s ? Object.values(s.drivers).map(d => lastName(d.name || '')).filter(Boolean) : [])])].slice(0, 30);
  const n = (k) => names[k % Math.max(1, names.length)] || 'Verstappen';
  return `Formula 1 team radio. Gap to ${n(0)}? What's the gap to ${n(1)}? Box this lap. Keep me updated on ${n(2)}. How are the tyres? Where am I losing to ${n(3)}? ${n(4)} lap time? He hit me, that's a penalty. Sidepod and floor damage. Can we undercut him? Gaps to ${n(1)} lap by lap. Where's Max? What does our strategy look like? ${names.join(', ')}. ${(s?.teams || []).map(t => t.name).join(', ')}. Softs, mediums, hards, inters, undercut, safety car, VSC, ERS, DRS.`;
};
// words the speech recognition often gets a little wrong, put right in what's shown
const ENG_SHOW_FIX = [[/\bgab\b/gi, 'gap'], [/\b(bocks|boks|bucks)\b/gi, 'box'], [/\bmedians\b/gi, 'mediums'], [/\bmedian\b/gi, 'medium'], [/\blabs\b/gi, 'laps'], [/\blab\b/gi, 'lap'], [/\bsafety cart\b/gi, 'safety car'], [/\blap[.,]? (bye[- ]?bye|bye lap|by lap)\b/gi, 'lap by lap'], [/\bMatt\b/g, 'Max'], [/\bwear (am I|is|are)\b/gi, 'where $1'], [/\bloosing\b/gi, 'losing'], [/\bup dated\b/gi, 'updated']];
/** What you said as the engineer understood it: the names you meant and those few words put right. */
function engShown(text, E) {
  let out = String(text || '');
  for (const [w, to] of E?.fix || []) out = out.replace(new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu'), (m, a) => a + to);
  for (const [re, to] of ENG_SHOW_FIX) out = out.replace(re, to);
  return out;
}
/** What you said (put right, as the engineer understood it), answered: { text, intent, target, reply }. */
async function engAnswer(text) {
  const t = engNorm(text); const S = engSnap(); const E = engEntities(t, S); const x = engTarget(S, E); text = engShown(text, E);
  let I = engMatch(t);
  // nothing matched (or only a thank-you or a copy): try what you most likely said
  let fixed = null;
  if (!I || (I.low && (E.cars.length || E.team))) { const C = engCorrect(t, S, E); if (C) { fixed = C; I = C.I; } }
  if (fixed) { const t2 = fixed.t; const E2 = engEntities(t2, S); Object.assign(E, E2); return engAnswerAs(fixed.shown(text, E2), t2, S, E2, engTarget(S, E2), I); }
  if (!I && (E.cars.length || E.team)) { if (t.trim().split(' ').length <= 5) I = ENG_INTENTS.find(i => i.id === 'gap'); // just a name: where they are
    else if (!/^ (what|whats|how|where|when|who|which|is|are|can|could|do|does|did|will|should|am|have|has) /.test(t)) return { text, intent: null, target: null, reply: engPick(['Yeah, we saw that.', 'Saw it. Eyes on your own race.', 'Copy. Focus on your own race.']) }; }
  return engAnswerAs(text, t, S, E, x, I);
}
async function engAnswerAs(text, t, S, E, x, I) {
  if (!I) return { text, intent: null, reply: /^ (what|whats|how|where|when|who|which|why|is|are|can|could|do|does|did|will|would|should|am|have|has) /.test(t) ? engPick(['Sorry, say again?', 'Didn’t get that, say again?']) : engPick(['Copy.', 'Understood.', 'Copy that.']) };
  if ((!S || !S.race) && ['raceplan', 'stop', 'finish'].includes(I.id) && !(I.id === 'stop' && S && / box /.test(t) && !/ (when|plan|strategy|window) /.test(t))) { const B = engBriefing(t); if (B) return { text, intent: ENG_INTENTS.find(i => i.id === 'raceplan'), target: null, reply: B }; }
  if (S && I.race && !S.race) return { text, intent: I, target: null, reply: 'That one is for the race.' };
  if (S && I.practice && S.L.kind !== 'practice') return { text, intent: I, target: null, reply: 'Setup changes are for practice. The car is locked in now.' };
  if (!S && I.live !== false) return { text, intent: I, target: null, reply: `${engNoRace} You asked about ${I.title.toLowerCase()}${E.cars.length || E.rel || E.team ? `, for ${E.rel === 'ahead' ? 'the car ahead' : E.rel === 'behind' ? 'the car behind' : E.rel === 'mate' ? 'your teammate' : E.rel === 'leader' ? 'the leader' : 'the car you named'}` : ''}.` };
  if (x && S && x.i !== S.me.i) engLastCar = { uid: S.L.uid, i: x.i };
  let reply = '';
  try { reply = await I.say(S, E, I.car || I.id === 'mate' || I.id === 'who' ? x : null, t); } catch (e) { console.warn('engineer answer', e); reply = 'Say again?'; }
  return { text, intent: I, target: x && S ? S.name(x) : null, reply };
}

// ---- talking back: push to talk from F1 25 ("UDP Action" buttons), a key, or the test button; your microphone recorded
// while it's held (or, tapped, until you stop talking or tap again)
const ENG_REC = { on: false };
let engTest = null; // Settings' live test: { heard, intent, reply, state }
function engPttDown(src) {
  if (!engApi() || (!engCfg().on && src !== 'ui')) return;
  if (ENG_REC.on) { if (ENG_REC.toggle) engRecStop(); return; }
  engRecStart(src);
}
function engPttUp() { if (!ENG_REC.on) return; if (performance.now() - ENG_REC.t0 < 400) { ENG_REC.toggle = true; return; } engRecStop(); }
function engBeep(f = 1400, d = 0.07) { try { const ctx = engAudio(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f; g.gain.value = 0.12; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + d); } catch { } }
/*
  The microphone stays open while you use the radio (closed after 5 minutes without a word, or when the engineer is
  turned off), so nothing you say is lost while it opens: it starts recording the moment you press, with the last
  third of a second before the press, and carries on a quarter of a second after you let go.
*/
const ENG_MIC = { stream: null, node: null, proc: null, sink: null, rate: 48000, dev: null, ring: [], ringN: 0, idleT: null };
async function engMicOpen() {
  const mic = engCfg().mic || ''; if (ENG_MIC.stream && ENG_MIC.dev === mic) return;
  engMicClose();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: mic ? { exact: mic } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = engAudio(); if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const node = ctx.createMediaStreamSource(stream); const proc = ctx.createScriptProcessor(2048, 1, 1); const sink = ctx.createGain(); sink.gain.value = 0;
  proc.onaudioprocess = (e) => {
    const d = new Float32Array(e.inputBuffer.getChannelData(0));
    if (ENG_REC.on) return engRecChunk(d);
    ENG_MIC.ring.push(d); ENG_MIC.ringN += d.length; while (ENG_MIC.ring.length > 1 && ENG_MIC.ringN - ENG_MIC.ring[0].length > ENG_MIC.rate * 0.35) ENG_MIC.ringN -= ENG_MIC.ring.shift().length;
  };
  node.connect(proc).connect(sink).connect(ctx.destination);
  Object.assign(ENG_MIC, { stream, node, proc, sink, rate: ctx.sampleRate, dev: mic, ring: [], ringN: 0 });
}
function engMicClose() {
  clearTimeout(ENG_MIC.idleT);
  try { ENG_MIC.proc && (ENG_MIC.proc.onaudioprocess = null); ENG_MIC.node?.disconnect(); ENG_MIC.proc?.disconnect(); ENG_MIC.sink?.disconnect(); ENG_MIC.stream?.getTracks().forEach(t => t.stop()); } catch { }
  Object.assign(ENG_MIC, { stream: null, node: null, proc: null, sink: null, dev: null, ring: [], ringN: 0 });
}
const engMicIdle = () => { clearTimeout(ENG_MIC.idleT); ENG_MIC.idleT = setTimeout(engMicClose, 5 * 60 * 1000); };
/** A piece of what you're saying: kept, the level shown, and (tapped) stopped after 1.4 s of quiet; 10 s at most. */
function engRecChunk(d) {
  ENG_REC.chunks.push(d);
  let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i]; const rms = Math.sqrt(sum / d.length);
  const lv = document.getElementById('eng-level'); if (lv) lv.style.width = Math.min(100, rms * 600) + '%';
  const now = performance.now(); if (rms > 0.02) { ENG_REC.spoke = now; ENG_REC.quietAt = 0; } else if (ENG_REC.spoke && !ENG_REC.quietAt) ENG_REC.quietAt = now;
  if (ENG_REC.ending && now >= ENG_REC.ending) return engRecStop(true);
  if ((ENG_REC.toggle && ENG_REC.quietAt && now - ENG_REC.quietAt > 1400) || now - ENG_REC.t0 > 10000) engRecStop(true);
}
async function engRecStart(src) {
  Object.assign(ENG_REC, { on: true, t0: performance.now(), toggle: src === 'key', chunks: [...ENG_MIC.ring], spoke: 0, quietAt: 0, ending: 0, src });
  ENG_MIC.ring = []; ENG_MIC.ringN = 0;
  engTestSet({ state: 'Listening…' }); engBeep(1400);
  try { await engMicOpen(); clearTimeout(ENG_MIC.idleT); ENG_REC.rate = ENG_MIC.rate; }
  catch (e) { ENG_REC.on = false; engTestSet({ state: `The microphone couldn’t open: ${e.message || e.name}` }); toast('The microphone couldn’t open'); }
}
/** Let go: a quarter of a second more (the end of the last word), then what you said goes to the speech recognition. */
async function engRecStop(now = false) {
  if (!ENG_REC.on) return;
  if (!now) { if (!ENG_REC.ending) ENG_REC.ending = performance.now() + 250; return; }
  ENG_REC.on = false; engMicIdle();
  engBeep(900, 0.05);
  const lv = document.getElementById('eng-level'); if (lv) lv.style.width = '0%';
  const n = ENG_REC.chunks.reduce((a, b) => a + b.length, 0); const rate = ENG_REC.rate || 48000;
  if (n < rate * 0.3) { engTestSet({ state: 'Too short: hold the button while you talk.' }); return; }
  const x = new Float32Array(n); let o = 0; for (const ch of ENG_REC.chunks) { x.set(ch, o); o += ch.length; }
  { let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(x[i])); if (pk > 0.01 && pk < 0.7) { const g = Math.min(8, 0.85 / pk); for (let i = 0; i < n; i++) x[i] *= g; } } // a quiet microphone brought up to a good level
  // to 16 kHz for the speech recognition (averaged over each step, so it doesn't alias)
  const m = Math.floor(n * 16000 / rate); const y = new Float32Array(m); const step = rate / 16000;
  for (let i = 0; i < m; i++) { const a = Math.floor(i * step), b = Math.min(n, Math.floor((i + 1) * step)); let s = 0; for (let k = a; k < b; k++) s += x[k]; y[i] = b > a ? s / (b - a) : x[a] || 0; }
  const buf = new ArrayBuffer(44 + m * 2); const v = new DataView(buf); const w = (p, str) => [...str].forEach((ch, k) => v.setUint8(p + k, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + m * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, m * 2, true);
  for (let i = 0; i < m; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, y[i])) * 32767, true);
  engTestSet({ state: 'Working out what you said…' });
  let res; try { res = await engApi().hear(new Uint8Array(buf), engPrompt(), engCfg().asr || 'fast'); } catch (e) { res = { ok: false, error: e.message }; }
  if (!res?.ok) { engTestSet({ state: res?.error === 'not_installed' ? 'Speech recognition isn’t downloaded yet.' : 'Couldn’t make that out.' }); return; }
  const heard = res.text.trim(); if (!heard) { engTestSet({ state: 'Didn’t hear anything. Check the microphone.' }); return; }
  const A = await engAnswer(heard);
  engTestSet({ state: '', heard: A.text, intent: A.intent ? A.intent.title + (A.target ? ` · ${A.target}` : '') : 'Nothing matched', reply: A.reply });
  engSay(A.reply, { prio: 1, me: A.text });
  if (!engVoiceReady() && !engRadioHere()) toast(`Engineer: ${A.reply}`);
}
function engTestSet(p) { engTest = { ...(engTest || {}), ...p }; const el = document.getElementById('eng-test'); if (el) el.innerHTML = engTestHtml(); }
const engTestHtml = () => { const T = engTest || {}; return T.state && !T.heard ? `<span class="muted">${esc(T.state)}</span>` : T.heard ? `${T.state ? `<div class="muted">${esc(T.state)}</div>` : ''}<div><span class="label">Heard</span> “${esc(T.heard)}”</div><div><span class="label">Instruction</span> ${esc(T.intent || '')}</div><div><span class="label">Engineer</span> ${esc(T.reply || '')}</div>` : '<span class="muted">Press your button (or hold the one here), say something like “what’s the gap to the car ahead?”, and let go.</span>'; };
// F1 25's buttons: "UDP Action 1" is bit 20 of the button status, up to action 12 at bit 31
let engBtnMask = 0;
function engButtons(mask) {
  const E = engCfg(); const bit = 2 ** (19 + (E.udp || 1)); const down = Math.floor(mask / bit) % 2 === 1; const was = Math.floor(engBtnMask / bit) % 2 === 1; engBtnMask = mask;
  const el = document.getElementById('eng-btn'); if (el) { el.classList.toggle('on', down); el.textContent = down ? 'Pressed' : 'Not pressed'; }
  if (E.ptt !== 'udp') return;
  if (down && !was) engPttDown('udp'); else if (!down && was) engPttUp();
}
function engSyncKey() { const A = engApi(); if (!A) return; const E = engCfg(); A.setKey(E.on && E.ptt === 'key' ? E.key : '').catch?.(() => {}); }
// the test button in Settings: held with the mouse
document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('[data-eng-hold]')) { e.preventDefault(); engPttDown('ui'); } });
document.addEventListener('pointerup', () => { if (ENG_REC.on && ENG_REC.src === 'ui') engPttUp(); });
// the overlay's opacity sliders: the overlay follows as you drag them
document.addEventListener('input', (e) => {
  const k = e.target?.dataset?.ch; if (k !== 'eng-ovl-bg' && k !== 'eng-ovl-text' && k !== 'eng-ovl-lines') return;
  const v = +e.target.value; const lab = document.getElementById(k); if (lab) lab.textContent = k === 'eng-ovl-lines' ? plural(v, 'line') : Math.round(v * 100) + '%';
  engApi()?.overlay?.style({ ...engOvlStyle(), [{ 'eng-ovl-bg': 'bg', 'eng-ovl-text': 'text', 'eng-ovl-lines': 'lines' }[k]]: v });
});
// setting the key: the next one pressed
let engKeyWait = false;
document.addEventListener('keydown', (e) => {
  if (!engKeyWait) return; e.preventDefault(); e.stopPropagation(); if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const k = /^F\d{1,2}$/.test(e.key) ? e.key : e.code.startsWith('Numpad') ? 'num' + e.code.slice(6).toLowerCase().replace('decimal', 'dec').replace('add', 'add').replace('subtract', 'sub').replace('multiply', 'mult').replace('divide', 'div') : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const acc = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+');
  engKeyWait = false; engSet({ key: acc }); render();
}, true);

async function engineerBoot() {
  if (!window.api?.dev) return;
  try { DEV_MODE = !!(await window.api.dev()); } catch { DEV_MODE = false; }
  if (!window.api?.engineer) return;
  await engRefresh(); engSyncKey();
  if (engCfg().ovl && engCfg().on) { await window.api.engineer.overlay?.set(true); window.api.engineer.overlay?.style(engOvlStyle()); }
  window.api.engineer.overlay?.onEdited(() => { engOvlEdit = false; if (ui.view === 'settings') render(); });
  window.api.engineer.onButtons((m) => engButtons(m));
  window.api.engineer.onKey(() => engPttDown('key'));
}

// ---- Settings: the panel (dev mode only, marked BETA)
let engMics = null;
async function engLoadMics(ask = false) {
  try { if (ask) { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); } engMics = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch { engMics = []; }
  if (ui.view === 'settings') render();
}
let engPollT = null;
function engPoll() { clearTimeout(engPollT); engPollT = setTimeout(async () => { await engRefresh(); if (ui.view === 'settings') { const el = document.getElementById('eng-panel'); if (el) el.outerHTML = engineerPanel(); } if (Object.keys(engStatus?.jobs || {}).length) engPoll(); }, 600); }
function engineerPanel() {
  if (!window.api?.engineer) return '';
  if (!engStatus) { engRefresh().then(() => { if (ui.view === 'settings') render(); }); return '<div class="panel" id="eng-panel"><div class="panel-b muted">Loading the race engineer…</div></div>'; }
  if (engMics == null) { engMics = []; engLoadMics(); }
  const E = engCfg(); const J = engStatus.jobs || {}; const pct = (j) => j?.total ? Math.round(j.got / j.total * 100) : 0;
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-act="eng-set" data-k="${k}" data-v="${v}" class="${String(E[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const voices = engStatus.voices.map(v => { const j = J['voice:' + v.id]; const sel = E.voice === v.id;
    return `<div class="eng-voice ${sel ? 'sel' : ''}"><div><b>${esc(v.name)}</b><small class="muted">${esc(v.accent)} · ${esc(v.voice)} · ${v.mb} MB</small></div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="eng-preview" data-v="${v.id}">Preview</button>
      ${j ? `<span class="muted" style="font-size:12px;min-width:110px">Downloading ${pct(j)}%</span>` : v.installed ? (sel ? '<span class="tag">Selected</span>' : `<button class="btn sm" data-act="eng-voice" data-v="${v.id}">Select</button>`) + `<button class="btn sm ghost" data-act="eng-remove" data-v="${v.id}" title="Delete the download">Remove</button>` : `<button class="btn sm" data-act="eng-get" data-v="${v.id}">Download and select</button>`}</div></div>`; }).join('');
  const wj = J.whisper;
  return `<div class="panel" id="eng-panel"><div class="panel-h"><h2>Race engineer <span class="tag beta">BETA</span></h2><span class="muted" style="font-size:12px">Still being tested: it can mishear you or get things wrong</span></div>
    <div class="panel-b stack">
      <div class="row" style="gap:12px;flex-wrap:wrap"><label class="row" style="gap:8px"><input type="checkbox" data-ch="eng-on" ${E.on ? 'checked' : ''}> <b>Race engineer on</b></label>
        <span class="muted" style="font-size:12px">${E.on ? (engVoiceReady() ? 'Live Session talks to you on the radio.' : 'Pick a voice below. Until then, Live Race plays your uploaded sounds.') : 'Off: Live Race plays your uploaded sounds for the pit calls.'}</span></div>
      <h3>Voice</h3><p class="muted" style="font-size:12px;margin:0">Made on this PC, nothing is sent anywhere. Each voice is a one-time download; the preview is a short clip that comes with Pitwall.</p>
      <div class="eng-voices">${voices}</div>
      <div class="row" style="gap:16px;flex-wrap:wrap"><label class="row" style="gap:8px"><input type="checkbox" data-ch="eng-fx" ${E.fx ? 'checked' : ''}> Team radio sound</label>
        <label class="row" style="gap:8px">Volume <input type="range" min="0.2" max="1" step="0.05" value="${E.vol}" data-ch="eng-vol" style="width:120px"></label>
        <span class="row" style="gap:6px"><span class="muted" style="font-size:12px">How much he talks</span>${seg('chat', [[1, 'Just the calls'], [2, 'Normal'], [3, 'Chatty']])}</span>
        ${engVoiceReady() ? '<button class="btn sm ghost" data-act="eng-sample">Say something</button>' : ''}</div>
      <h3 style="margin-top:6px">Radio over the game</h3>
      <div class="row" style="gap:12px;flex-wrap:wrap"><label class="row" style="gap:8px"><input type="checkbox" data-ch="eng-ovl" ${E.ovl ? 'checked' : ''}> Show the radio on screen, over F1 25</label>
        ${E.ovl ? `<button class="btn sm ${engOvlEdit ? 'primary' : ''}" data-act="eng-ovl-edit">${engOvlEdit ? 'Done moving' : 'Move and resize'}</button><button class="btn sm ghost" data-act="eng-ovl-reset">Back to the corner</button><button class="btn sm ghost" data-act="eng-ovl-test">Show a test message</button>` : ''}</div>
      ${E.ovl ? `<div class="row" style="gap:16px;flex-wrap:wrap"><label class="row" style="gap:8px">Background <input type="range" min="0" max="1" step="0.05" value="${E.ovlBg}" data-ch="eng-ovl-bg" style="width:130px"> <span class="muted" id="eng-ovl-bg">${Math.round(E.ovlBg * 100)}%</span></label>
        <label class="row" style="gap:8px">Text <input type="range" min="0.2" max="1" step="0.05" value="${E.ovlText}" data-ch="eng-ovl-text" style="width:130px"> <span class="muted" id="eng-ovl-text">${Math.round(E.ovlText * 100)}%</span></label>
        <label class="row" style="gap:8px">Longest message <input type="range" min="1" max="12" step="1" value="${E.ovlLines}" data-ch="eng-ovl-lines" style="width:130px"> <span class="muted" id="eng-ovl-lines">${plural(E.ovlLines, 'line')}</span></label></div>` : ''}
      <p class="muted" style="font-size:12px;margin:0">The radio graphic in its own see-through window, always on top, with clicks going straight through to the game. It needs F1 25 in borderless or windowed mode: nothing can draw over exclusive fullscreen. It still shows in Live Session too.</p>
      <h3 style="margin-top:6px">Talking back</h3>
      ${engStatus.whisper ? `<p class="muted" style="font-size:12px;margin:0">Speech recognition is downloaded (on this PC, nothing is sent anywhere). What you can say is in Help, under Race engineer.</p>`
        : wj ? `<p class="muted" style="font-size:12px;margin:0">Downloading the speech recognition: ${pct(wj)}%</p>` : `<div class="row" style="gap:8px"><button class="btn sm" data-act="eng-get-whisper">Download speech recognition (${engStatus.whisperMB} MB)</button><span class="muted" style="font-size:12px">Needed to talk to the engineer.</span></div>`}
      ${engStatus.whisper ? `<div class="row" style="gap:10px;flex-wrap:wrap"><span class="muted" style="font-size:12px">Hearing you</span>${seg('asr', [['fast', 'Fast'], ['accurate', 'Accurate'], ...(engStatus.nvidia || E.asr === 'gpu' ? [['gpu', 'Best (NVIDIA)']] : [])])}
        <span class="muted" style="font-size:12px">${E.asr === 'gpu' ? (engStatus.gpu ? 'The best hearing, on your graphics card: about a quarter of a second, about 1 GB of its memory, freed after 30 minutes unused.' : J['whisper-gpu'] ? `Downloading: ${pct(J['whisper-gpu'])}%` : 'The best hearing, on your NVIDIA graphics card.') : E.asr === 'accurate' ? (engStatus.accurate ? 'Hears fast talking better, but takes about 2.5 seconds to answer.' : J['whisper-small'] ? `Downloading: ${pct(J['whisper-small'])}%` : '') : 'Answers in about a second.'}</span>
        ${E.asr === 'accurate' && !engStatus.accurate && !J['whisper-small'] ? `<button class="btn sm" data-act="eng-get-accurate">Download (${engStatus.accurateMB} MB)</button>` : ''}${E.asr === 'gpu' && !engStatus.gpu && !J['whisper-gpu'] ? `<button class="btn sm" data-act="eng-get-gpu">Download (${(engStatus.gpuMB / 1000).toFixed(1)} GB)</button>` : ''}${E.asr === 'accurate' && engStatus.accurate ? '<button class="btn sm ghost" data-act="eng-remove-accurate" title="Delete the download">Remove</button>' : ''}${E.asr === 'gpu' && engStatus.gpu ? '<button class="btn sm ghost" data-act="eng-remove-gpu" title="Delete the download">Remove</button>' : ''}</div>` : ''}
      <div class="form-grid">
        <label class="field"><span>Microphone</span><select data-ch="eng-mic"><option value="">Windows default</option>${(engMics || []).map(d => `<option value="${esc(d.deviceId)}" ${E.mic === d.deviceId ? 'selected' : ''}>${esc(d.label || 'Microphone')}</option>`).join('')}</select></label>
        <label class="field"><span>Push to talk with</span><select data-ch="eng-ptt"><option value="udp" ${E.ptt === 'udp' ? 'selected' : ''}>A wheel or controller button (F1 25)</option><option value="key" ${E.ptt === 'key' ? 'selected' : ''}>A keyboard key</option></select></label>
        ${E.ptt === 'udp' ? `<label class="field"><span>F1 25 button</span><select data-ch="eng-udp">${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}" ${E.udp === k + 1 ? 'selected' : ''}>UDP Action ${k + 1}</option>`).join('')}</select></label>`
          : `<label class="field"><span>Key</span><button class="btn sm" data-act="eng-key">${engKeyWait ? 'Press a key…' : esc(E.key || 'Set a key')}</button></label>`}
      </div>
      ${(engMics || []).length && !(engMics || []).some(d => d.label) ? '<div><button class="btn sm ghost" data-act="eng-mics">Allow the microphone to see its name</button></div>' : ''}
      <p class="muted" style="font-size:12px;margin:0">${E.ptt === 'udp' ? `In F1 25, open Settings → Controls, pick your wheel or controller, and give a button the action “UDP Action ${E.udp}”. The game then sends it to Pitwall with the telemetry (telemetry needs to be on), so it works while you drive, on PC or console. Hold it while you talk, or tap it once and talk: it stops when you do.` : 'The key works while F1 25 is in front (it’s taken from the game while Pitwall runs, so pick one you don’t use there). Press it, talk, and it stops when you do, or press it again.'}</p>
      <div class="eng-test"><div class="row" style="gap:10px;flex-wrap:wrap"><b>Live test</b>${E.ptt === 'udp' ? `<span class="eng-btn" id="eng-btn">Not pressed</span>` : ''}<button class="btn sm primary" data-eng-hold ${engStatus.whisper ? '' : 'disabled'}>Hold to talk</button><span class="eng-level"><i id="eng-level"></i></span></div>
        <div id="eng-test" class="stack" style="gap:4px;font-size:13px">${engTestHtml()}</div></div>
    </div></div>`;
}
let engPrevAudio = null; let engOvlEdit = false;
const ENG_ACTIONS = {
  'eng-set'(el) { engSet({ [el.dataset.k]: isNaN(+el.dataset.v) ? el.dataset.v : +el.dataset.v }); render(); },
  'eng-preview'(el) { try { engPrevAudio?.pause(); engPrevAudio = new Audio(`voices/${el.dataset.v}.wav`); engPrevAudio.volume = engCfg().vol; engPrevAudio.play(); } catch { } },
  async 'eng-get'(el) { const id = el.dataset.v; engApi().install('voice', id).then((r) => { if (r?.ok) { engSet({ voice: id }); toast('Voice downloaded'); } else toast(`The voice couldn’t download: ${r?.error || 'unknown error'}`); engRefresh().then(() => ui.view === 'settings' && render()); }); engPoll(); },
  'eng-voice'(el) { engSet({ voice: el.dataset.v }); render(); },
  async 'eng-remove'(el) { const id = el.dataset.v; engStatus = await engApi().remove('voice', id); if (engCfg().voice === id) engSet({ voice: null }); render(); },
  'eng-get-gpu'() { engApi().install('whisper-gpu').then((r) => { toast(r?.ok ? 'The best speech recognition is downloaded' : `The download failed: ${r?.error || 'unknown error'}`); engRefresh().then(() => ui.view === 'settings' && render()); }); engPoll(); },
  async 'eng-remove-gpu'() { engStatus = await engApi().remove('whisper-gpu'); engSet({ asr: 'fast' }); render(); },
  'eng-get-accurate'() { engApi().install('whisper-small').then((r) => { toast(r?.ok ? 'The accurate speech recognition is downloaded' : `The download failed: ${r?.error || 'unknown error'}`); engRefresh().then(() => ui.view === 'settings' && render()); }); engPoll(); },
  async 'eng-remove-accurate'() { engStatus = await engApi().remove('whisper-small'); engSet({ asr: 'fast' }); render(); },
  'eng-get-whisper'() { engApi().install('whisper').then((r) => { toast(r?.ok ? 'Speech recognition downloaded' : `The download failed: ${r?.error || 'unknown error'}`); engRefresh().then(() => ui.view === 'settings' && render()); }); engPoll(); },
  'eng-sample'() { const lines = ['Radio check. Loud and clear.', 'Box this lap, box box. Mediums.', 'Gap to the car ahead is 1.4. You are closing in, 0.3 a lap.', 'Safety car, safety car.']; engSay(lines[Math.floor(Math.random() * lines.length)], { prio: 1 }); },
  'eng-key'() { engKeyWait = true; render(); },
  'eng-mics'() { engLoadMics(true); },
  async 'eng-ovl-edit'() { engOvlEdit = !engOvlEdit; await engApi()?.overlay?.edit(engOvlEdit); render(); },
  async 'eng-ovl-reset'() { await engApi()?.overlay?.reset(); toast('The radio overlay is back in the bottom-right corner'); },
  'eng-ovl-test'() { engOverlay({ me: 'Radio check', eng: 'Loud and clear. Box this lap, box box. Mediums.', dur: 3.5 }); },
};
const ENG_CHANGES = {
  'eng-on'(el) { if (!el.checked) engMicClose(); engSet({ on: el.checked }); engApi()?.overlay?.set(el.checked && engCfg().ovl); render(); },
  'eng-fx'(el) { engSet({ fx: el.checked }); },
  'eng-vol'(el) { engSet({ vol: +el.value }); },
  'eng-mic'(el) { engSet({ mic: el.value }); },
  'eng-ptt'(el) { engSet({ ptt: el.value }); render(); },
  'eng-udp'(el) { engSet({ udp: +el.value }); render(); },
  async 'eng-ovl'(el) { engSet({ ovl: el.checked }); engOvlEdit = false; await engApi()?.overlay?.set(el.checked && engCfg().on); if (el.checked) engApi()?.overlay?.style(engOvlStyle()); render(); },
  'eng-ovl-bg'(el) { engSet({ ovlBg: +el.value }); },
  'eng-ovl-text'(el) { engSet({ ovlText: +el.value }); },
  'eng-ovl-lines'(el) { engSet({ ovlLines: +el.value }); },
};

// ---- Help: the instructions, from the same list the engineer reads
function renderHelp() {
  const cats = [...new Set(ENG_INTENTS.map(i => i.cat))];
  return `<div class="page"><div class="page-head"><div><h1>Help</h1><div class="sub">Race engineer instructions <span class="tag beta">BETA</span></div></div></div>
    <div class="panel"><div class="panel-b stack" style="gap:8px;font-size:13px">
      <p style="margin:0;max-width:80ch">Talk to the engineer however you like: he listens for keywords, not set sentences. A sentence needs one of an instruction’s keywords, and the longest match wins, so “box this lap” is a request to stop, while “box” on its own asks when the next stop is.</p>
      <p style="margin:0;max-width:80ch"><b>Naming a car.</b> Any driver’s surname (or first name, or a nickname like Checo), a team (“the Ferrari”: the nearest one to you), a place (“P5”, “fifth place”), “the car ahead”, “the car behind”, “the leader” or “my teammate”. Say just a name and you get that car’s gap and pace.</p>
      <p style="margin:0;max-width:80ch"><b>Tyres.</b> Softs, mediums, hards, inters and wets.</p>
      <p style="margin:0;max-width:80ch" class="muted">Pitwall can’t control the game: when you tell the team you’re boxing, it confirms and tells you where you’ll come out, and you still pit in the game.</p></div></div>
    ${cats.map(cat => `<div class="panel"><div class="panel-h"><h2>${esc(cat)}</h2></div><div class="panel-b tight table-wrap"><table class="eng-help"><thead><tr><th>Instruction</th><th>Keywords</th><th>Try saying</th></tr></thead><tbody>
      ${ENG_INTENTS.filter(i => i.cat === cat).map(i => `<tr><td><b>${esc(i.title)}</b>${i.car ? '<br><small class="muted">about any car you name</small>' : ''}</td><td>${i.k.map(g => g.filter(w => !/'/.test(w) || !g.includes(w.replace(/'/g, ''))).map(w => `<code>${esc(w)}</code>`).join(' ')).join('<br>+ ')}</td><td>${i.ex.map(x => `“${esc(x)}”`).join('<br>')}</td></tr>`).join('')}
    </tbody></table></div></div>`).join('')}</div>`;
}
