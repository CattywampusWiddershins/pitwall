/* Pitwall — Setup advisor (dev mode, BETA). Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  The setup advisor: in practice, tell the race engineer how the car feels ("I have a lot of understeer on entry", "my
  front is too sharp", "a loose rear at turn 10", "rear locking") and get a setup change back, worked out from your
  setup as the game sends it. A change already at the end of its range is skipped ("front wing is already at 50, so a
  little more front toe-out instead"). Naming a turn looks up how fast it is on your own lap: fast corners get aero
  changes, slow ones mechanical.

  Every suggestion is kept as a setup note for the weekend: on the practice dashboard and the post-practice and
  post-qualifying screens, until that setting changes in the game (or you dismiss it). Pitwall can't change the setup:
  you make the change in the garage.

  Built to come out cleanly. To remove it: delete this file and its <script> line in index.html, and the block marked
  "setup advisor" in telemetry.js. Everything else only calls in here behind a typeof check.

  The ranges below are F1 25's as best known. Where the game sends a value outside one, that end is treated as unknown,
  so it never claims a setting is at its limit when it isn't.
*/
// [name, min, max, step a click, how it's said, decimals]
const SETUP_KEYS = {
  fw: ['front wing', 0, 50, 1, '', 0], rw: ['rear wing', 0, 50, 1, '', 0],
  on: ['on-throttle differential', 10, 100, 5, '%', 0], off: ['off-throttle differential', 10, 100, 5, '%', 0],
  fCam: ['front camber', -3.5, -2.5, 0.1, '°', 1], rCam: ['rear camber', -2.2, -0.7, 0.1, '°', 1],
  fToe: ['front toe-out', 0, 0.5, 0.02, '°', 2], rToe: ['rear toe-in', 0.1, 0.25, 0.01, '°', 2],
  fSus: ['front suspension', 1, 41, 1, '', 0], rSus: ['rear suspension', 1, 41, 1, '', 0],
  fArb: ['front anti-roll bar', 1, 21, 1, '', 0], rArb: ['rear anti-roll bar', 1, 21, 1, '', 0],
  fRh: ['front ride height', null, null, 1, '', 0], rRh: ['rear ride height', null, null, 1, '', 0],
  bp: ['brake pressure', 80, 100, 1, '%', 0], bb: ['brake bias', 50, 70, 1, '%', 0], eb: ['engine braking', 0, 100, 10, '%', 0],
  fP: ['front tyre pressures', 22.5, 29.5, 0.1, ' psi', 1], rP: ['rear tyre pressures', 20.5, 26.5, 0.1, ' psi', 1],
};
// what a change is called, by direction
const SETUP_SAY = {
  fw: ['less front wing', 'more front wing'], rw: ['less rear wing', 'more rear wing'],
  on: ['open the on-throttle diff', 'lock the on-throttle diff more'], off: ['open the off-throttle diff', 'lock the off-throttle diff more'],
  fCam: ['more front camber', 'less front camber'], rCam: ['more rear camber', 'less rear camber'],
  fToe: ['less front toe-out', 'more front toe-out'], rToe: ['less rear toe-in', 'more rear toe-in'],
  fSus: ['soften the front suspension', 'stiffen the front suspension'], rSus: ['soften the rear suspension', 'stiffen the rear suspension'],
  fArb: ['soften the front anti-roll bar', 'stiffen the front anti-roll bar'], rArb: ['soften the rear anti-roll bar', 'stiffen the rear anti-roll bar'],
  fRh: ['lower the front', 'raise the front'], rRh: ['lower the rear', 'raise the rear'],
  bp: ['less brake pressure', 'more brake pressure'], bb: ['brake bias rearward', 'brake bias forward'], eb: ['less engine braking', 'more engine braking'],
  fP: ['lower the front tyre pressures', 'raise the front tyre pressures'], rP: ['lower the rear tyre pressures', 'raise the rear tyre pressures'],
};
/*
  The complaints and what fixes them, in the order to try: [setting, direction (+1 up, −1 down), clicks]. Corners by
  phase (entry, mid, exit) and speed (slow corners lean on the mechanical grip, fast ones on the aero).
*/
const SETUP_FIX = {
  understeer: {
    entry: [['fw', 1, 2], ['fToe', 1, 2], ['off', -1, 1], ['fArb', -1, 2], ['bb', -1, 1]],
    mid: [['fArb', -1, 2], ['fw', 1, 2], ['fSus', -1, 3], ['fCam', -1, 1], ['rArb', 1, 1]],
    exit: [['on', -1, 1], ['rArb', 1, 1], ['fw', 1, 2], ['rSus', 1, 2]],
    fast: [['fw', 1, 2], ['rw', -1, 1], ['fRh', -1, 1]],
    slow: [['fArb', -1, 2], ['fSus', -1, 3], ['fToe', 1, 2], ['on', -1, 1]],
  },
  oversteer: {
    entry: [['off', 1, 1], ['bb', 1, 1], ['eb', -1, 1], ['rw', 1, 2], ['rArb', -1, 1]],
    mid: [['rArb', -1, 2], ['rw', 1, 2], ['rSus', -1, 3], ['fArb', 1, 1]],
    exit: [['rSus', -1, 3], ['rw', 1, 2], ['on', -1, 1], ['rP', -1, 2]],
    fast: [['rw', 1, 2], ['fw', -1, 1], ['rRh', 1, 1]],
    slow: [['rArb', -1, 2], ['rSus', -1, 3], ['on', -1, 1], ['rToe', 1, 1]],
  },
  sharp: { any: [['fToe', -1, 2], ['fArb', -1, 1], ['fw', -1, 2]] },
  rlock: { any: [['bb', 1, 1], ['eb', -1, 1], ['bp', -1, 2]] },
  flock: { any: [['bb', -1, 1], ['bp', -1, 2]] },
  traction: { any: [['on', -1, 1], ['rSus', -1, 3], ['rP', -1, 2], ['rw', 1, 2]] },
  speed: { any: [['rw', -1, 2], ['fw', -1, 2], ['rRh', -1, 1]] },
  bottoming: { any: [['fRh', 1, 1], ['rRh', 1, 1], ['fSus', 1, 2]] },
  kerbs: { any: [['fSus', -1, 2], ['rSus', -1, 2], ['fRh', 1, 1]] },
  hotRear: { any: [['rP', -1, 2], ['rCam', 1, 1], ['on', -1, 1]] },
  hotFront: { any: [['fP', -1, 2], ['fCam', 1, 1]] },
};
const SETUP_ISSUE_NAME = { understeer: 'Understeer', oversteer: 'Oversteer', sharp: 'Front too sharp', rlock: 'Rear locking', flock: 'Front locking', traction: 'Wheelspin', speed: 'Top speed', bottoming: 'Bottoming out', kerbs: 'Kerbs', hotRear: 'Rear tyres hot', hotFront: 'Front tyres hot' };
const SETUP_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, 'twenty one': 21, 'twenty two': 22, 'twenty three': 23, 'twenty four': 24, 'twenty five': 25, 'twenty six': 26, 'twenty seven': 27 };
/** What you said: the complaint, the phase, the speed and a turn named. */
function setupRead(t) {
  const has = (re) => re.test(t); let issue = null;
  if (has(/rear\w* .{0,14}lock|lock\w* .{0,10}rear/)) issue = 'rlock';
  else if (has(/front\w* .{0,14}lock|lock\w* .{0,10}front/)) issue = 'flock';
  else if (has(/lock(ing)? ?up|locking/)) issue = 'lock?';
  else if (has(/unstable .{0,12}brak|rear .{0,12}brak/)) issue = 'oversteer';
  else if (has(/too sharp|twitchy|pointy|nervous front|front .{0,8}too (sharp|responsive|grippy)/)) issue = 'sharp';
  else if (has(/wheel ?spin|traction|spinning the rear|rears spin/)) issue = 'traction';
  else if (has(/understeer|under steer|washing out|wash out|won'?t turn|doesn'?t turn|not turning|pushing|no front|front .{0,10}(sliding|washing|not biting)/)) issue = 'understeer';
  else if (has(/oversteer|over steer|loose|snap|rear .{0,12}(sliding|stepping|nervous|out)|rear end|unstable rear|spinning/)) issue = 'oversteer';
  else if (has(/top speed|straight ?line|slow on the straights|no speed|too much drag/)) issue = 'speed';
  else if (has(/bottom(ing)?|porpois|bouncing/)) issue = 'bottoming';
  else if (has(/kerb|curb/)) issue = 'kerbs';
  else if (has(/overheat|too hot|hot tyres|tyres are hot|temperatures? .{0,8}high/)) issue = has(/front/) ? 'hotFront' : 'hotRear';
  const phase = has(/entry|turn ?in|braking|into the corner|on the brakes|turning in/) ? 'entry' : has(/exit|out of|on (the )?throttle|on power|accelerat/) ? 'exit' : has(/mid|apex|middle|through the corner/) ? 'mid' : null;
  const speed = has(/high speed|fast corner|quick corner/) ? 'fast' : has(/low speed|slow corner|hairpin|tight corner/) ? 'slow' : null;
  let turn = null; const m = t.match(/(?:turn|corner|t) ?(\d{1,2})\b/); if (m) turn = +m[1];
  else for (const [w, n] of Object.entries(SETUP_NUM).sort((a, b) => b[0].length - a[0].length)) if (t.includes(` turn ${w} `) || t.includes(` corner ${w} `)) { turn = n; break; }
  return { issue, phase, speed, turn };
}
const setupFmt = (k, v) => { const K = SETUP_KEYS[k]; return v == null ? '?' : `${(+v).toFixed(K[5])}${K[4]}`; };
const setupRange = (k, v) => { const K = SETUP_KEYS[k]; let lo = K[1], hi = K[2]; if (v != null && lo != null && v < lo - 1e-6) lo = null; if (v != null && hi != null && v > hi + 1e-6) hi = null; return [lo, hi]; };
/** One change: from the setting now, the clicks asked, kept inside the range. null when it's already at that end. */
function setupStep(S, [k, dir, n]) {
  const K = SETUP_KEYS[k]; const v = S ? S[k] : null; if (v == null) return { k, dir, n, from: null, to: null, say: SETUP_SAY[k][dir > 0 ? 1 : 0] };
  const [lo, hi] = setupRange(k, v); const step = K[3];
  let to = Math.round((v + dir * n * step) / step) * step; if (lo != null) to = Math.max(lo, to); if (hi != null) to = Math.min(hi, to); to = Math.round(to * 100) / 100;
  if (Math.abs(to - v) < step / 2) return { k, dir, at: dir > 0 ? hi : lo, limit: true };
  return { k, dir, n, from: v, to, say: SETUP_SAY[k][dir > 0 ? 1 : 0] };
}
/** How fast a turn is on your own lap: 'slow', 'medium' or 'fast' (its slowest point), from your quickest whole lap this weekend. */
async function setupTurnSpeed(S, turn) {
  const W = S.s.weekends[S.r.id]?.traces || {}; const cand = [W[PLAYER]];
  if (window.api?.telemetry?.traces) { try { const T = await window.api.telemetry.traces(S.L.uid, [S.me.i]); cand.push(T?.cars?.[S.me.i]); } catch { } }
  const ok = cand.filter(t => t?.spd?.length); const n = Math.max(0, ...ok.map(t => t.spd.length)); const A = ok.filter(t => flWhole(t, n)).sort((a, b) => a.ms - b.ms)[0]; if (!A) return null;
  const target = D.TRACKS[trackOf(S.r)]?.corners || 0; if (!target) return null;
  const sp = flSmooth(flFill(A.spd)); const turns = flTurns(flFill(A.x), flFill(A.z), target, A.bin || 25); const b = flBands(turns, sp, A.bin || 25)[turn - 1]; if (!b) return null;
  return { min: Math.round(b.min), kind: b.min < 120 ? 'slow' : b.min < 200 ? 'medium' : 'fast' };
}
const setupNotes = (s, r) => ((s.weekends[r.id] ||= {}).setupNotes ||= []);
/**
 * The engineer's answer to a complaint, and the notes it leaves: the first change that can be made (one at its limit is
 * named and skipped), and a second to try if it's still there. A complaint whose last suggestion hasn't been made yet
 * gets reminded of it first.
 */
async function setupAdvise(S, text) {
  const R = setupRead(text); if (!R.issue) return null;
  if (R.issue === 'lock?') return 'Front or rear locking?';
  const set = S.L.setup || null; const notes = setupNotes(S.s, S.r);
  let speed = R.speed, where = '';
  if (R.turn) { let T = null; try { T = await setupTurnSpeed(S, R.turn); } catch { } if (T) { speed = T.kind === 'medium' ? null : T.kind; where = ` Turn ${R.turn} is a ${T.kind} corner, about ${T.min} km/h.`; } else where = ` I can't see turn ${R.turn} on your laps yet, so this is general.`; }
  const F = SETUP_FIX[R.issue]; const list = (F.any || (speed && F[speed]) || F[R.phase || 'mid'] || F.mid);
  const label = `${SETUP_ISSUE_NAME[R.issue]}${R.phase && !F.any ? ` on ${R.phase}` : ''}${R.turn ? ` at turn ${R.turn}` : speed ? ` in ${speed} corners` : ''}`;
  // a suggestion for this complaint still waiting to be made
  const open = notes.find(x => x.status === 'open' && x.label === label && !x.backup && x.from != null && set && Math.abs((set[x.key] ?? x.from) - x.from) < 1e-6);
  if (open) return `You haven't made the last change yet: ${SETUP_SAY[open.key][open.to > open.from ? 1 : 0]}, ${setupFmt(open.key, open.from)} to ${setupFmt(open.key, open.to)}. Try that first.`;
  const tried = new Set(notes.filter(x => x.label === label).map(x => x.key));
  const steps = list.filter(c => !tried.has(c[0])).map(c => setupStep(set, c));
  const limits = steps.filter(x => x.limit); const go = steps.filter(x => !x.limit).slice(0, 2);
  if (!go.length) return `${label}: I've run out of the usual changes${limits.length ? `, ${limits.map(x => `${SETUP_KEYS[x.k][0]} is at ${setupFmt(x.k, x.at)}`).join(', ')}` : ''}. Worth a bigger look at the balance after the session.`;
  const firstLimit = limits.find(l => list.findIndex(c => c[0] === l.k) < list.findIndex(c => c[0] === go[0].k));
  const say1 = (x) => `${x.say}${x.from != null ? `, ${setupFmt(x.k, x.from)} to ${setupFmt(x.k, x.to)}` : ''}`;
  const at = new Date().toISOString();
  // a newer suggestion for a setting replaces one still waiting on it (the car has told you something new)
  for (const x of go) for (let k = notes.length - 1; k >= 0; k--) if (notes[k].status === 'open' && notes[k].key === x.k) notes.splice(k, 1);
  go.forEach((x, j) => notes.push({ id: `${Date.now()}-${j}`, issue: R.issue, label, key: x.k, from: x.from, to: x.to, say: x.say, at, session: S.L.key, status: 'open', backup: j > 0 }));
  store.save(); setupRedraw();
  return `${where ? where.trim() + ' ' : ''}${firstLimit ? `${cap1(SETUP_KEYS[firstLimit.k][0])} is already at ${setupFmt(firstLimit.k, firstLimit.at)}, so ` : ''}${firstLimit ? say1(go[0]) : cap1(say1(go[0]))}.${go[1] ? ` If it's still there, ${say1(go[1])}.` : ''}${set ? '' : ' I can’t see your setup from here, so check the numbers in the garage.'}`;
}
/** Notes done: a setting that's changed in the game since it was suggested closes its note. */
function setupTick() {
  const c = career(); const s = c && latestSeason(); const r = s && nextRound(s); if (!r || !liveErs?.setup) return;
  if (gameTrack(liveErs.track) !== trackOf(r)) return;
  const set = liveErs.setup; const w = s.weekends[r.id]; let changed = false;
  for (const x of w?.setupNotes || []) if (x.status === 'open' && x.from != null && set[x.key] != null && Math.abs(set[x.key] - x.from) > 1e-6) { x.status = 'done'; x.now = set[x.key]; x.doneAt = new Date().toISOString(); changed = true; }
  if (JSON.stringify(w?.setupNow) !== JSON.stringify(set)) { (s.weekends[r.id] ||= {}).setupNow = set; changed = true; }
  if (changed) { store.save(); setupRedraw(); }
}
function setupRedraw() { const el = document.getElementById('setup-notes'); if (el) { const c = career(), s = latestSeason(), r = nextRound(s); if (r) el.outerHTML = setupNotesPanel(c, s, r); } }
/** The setup notes for this weekend: the ones still to make, and the last few made. */
function setupNotesPanel(c, s, r) {
  if (!DEV_MODE) return '';
  const notes = s.weekends[r.id]?.setupNotes || []; const open = notes.filter(x => x.status === 'open'); const done = notes.filter(x => x.status === 'done').slice(-4).reverse();
  const row = (x) => `<div class="su-note ${x.status}"><div><b>${esc(x.label)}</b><small class="muted">${esc(SESSION_SHORT[x.session] || x.session || '')}${x.backup ? ' · if it’s still there' : ''}</small></div>
    <div>${esc(cap1(x.say))}${x.from != null ? ` <span class="mono">${setupFmt(x.key, x.from)} → ${setupFmt(x.key, x.to)}</span>` : ''}${x.status === 'done' ? ` <span class="muted">· now ${setupFmt(x.key, x.now)}</span>` : ''}</div>
    ${x.status === 'open' ? `<button class="btn sm ghost" data-act="setup-dismiss" data-id="${esc(x.id)}" title="Remove this note">Dismiss</button>` : '<span class="tag done">Done</span>'}</div>`;
  return `<div class="panel live-card" id="setup-notes"><div class="panel-h"><h2>Setup notes <span class="tag beta">BETA</span></h2><span class="muted" style="font-size:12px">${open.length ? 'Each stays until that setting changes in the game' : 'Tell the engineer how the car feels in practice'}</span></div>
    <div class="panel-b stack" style="gap:6px">${open.length ? open.map(row).join('') : '<div class="muted" style="font-size:13px">No changes waiting. Say something like “I’ve got understeer on entry” or “loose rear at turn 10”.</div>'}${done.length ? `<div class="label" style="margin-top:4px">Made</div>${done.map(row).join('')}` : ''}</div></div>`;
}
// the engineer's instruction (practice only), and the Dismiss button
ENG_INTENTS.push({ id: 'setup', cat: 'Setup (practice)', title: 'Setup feedback', practice: true,
  k: [['understeer', 'under steer', 'washing out', 'wont turn', "won't turn", 'doesnt turn', "doesn't turn", 'pushing', 'oversteer', 'over steer', 'loose', 'snappy', 'snap', 'sliding', 'stepping out', 'too sharp', 'twitchy', 'pointy', 'locking', 'lock up', 'locks up', 'wheelspin', 'wheel spin', 'traction', 'top speed', 'straight line', 'bottoming', 'bouncing', 'kerbs', 'curbs', 'overheating', 'too hot', 'unstable']],
  ex: ['I have a lot of understeer on entry', 'My front is too sharp', 'I have a lot of rear locking', 'Loose rear at turn 10', 'Too much wheelspin out of the hairpin'],
  say: async (S, E, x, text) => (await setupAdvise(S, text)) || 'Tell me more: understeer or oversteer, and where?' });
ENG_ACTIONS['setup-dismiss'] = (el) => { const c = career(), s = latestSeason(), r = nextRound(s); const n = r && (s.weekends[r.id]?.setupNotes || []); const k = n ? n.findIndex(x => x.id === el.dataset.id) : -1; if (k >= 0) { n.splice(k, 1); store.save(); setupRedraw(); } };
