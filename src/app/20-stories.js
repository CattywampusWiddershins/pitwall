/* Pitwall — Stories, title retrospectives, showdowns and race facts. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ---------------------------------------------------------------- stories */
// Stories are rebuilt from the results every time, so editing a result rewrites its article.
// A seeded picker keeps the wording stable between renders.
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const choose = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
// family name: "de Vries", "van Hoepen"; Zhou Guanyu is written family name first
const lastName = (n) => {
  const w = String(n || '').trim().split(' ');
  if (w[0] === 'Zhou') return 'Zhou';
  return w.length > 2 && /^(de|van|von|di|da|del|der)$/.test(w[w.length - 2]) ? w.slice(-2).join(' ') : w[w.length - 1];
};
const listJoin = (a) => a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ordWord = (n) => ORD[n - 1] || `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const numWord = (n) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n);
function parseGap(g) { const m = String(g || '').match(/^\+?\s*(\d+(?:[.,]\d+)?)\s*s?$/); return m ? parseFloat(m[1].replace(',', '.')) : null; }

// Fictional, deliberately generic lines for the drivers of your career world.
const QUOTES = {
  win: ['What a day. The car was mega from the first lap and the team nailed the strategy.', 'I’m so proud of everyone back at the factory. We managed the tyres perfectly.', 'That one feels special. We had to fight for it, but it all came together.', 'Clean race, no drama. That’s exactly what we needed.', 'The pace was there all weekend. To convert it into a win is the best feeling.'],
  p2: ['Second is a good result, but we came here to win.', 'We pushed all the way but didn’t quite have the pace for the win today.', 'Solid points. We’ll take it and go again next weekend.', 'I gave it everything in the last stint. Close, but not close enough.'],
  p3: ['A podium is always nice. We maximised what we had today.', 'Happy to be up here. The car felt better as the race went on.', 'Not the fastest car today, but we made it count.'],
  dnf: ['Really frustrating. We had the pace for a good result.', 'It’s a shame. These things happen, but it hurts.', 'Not the afternoon we wanted. We’ll look into what happened.', 'Big zero today. We have to bounce back quickly.'],
  champion: ['I don’t have the words. This is for everyone who believed in me.', 'A dream come true. Every lap this year led to this moment.', 'We did it. The whole team deserves this as much as I do.'],
  teamChamp: ['Every person in the factory built this. A championship is the ultimate reward.', 'This title belongs to the whole team, from the drivers to the people working nights at the factory.'],
  out: ['The title is gone, but we’ll keep fighting for wins.', 'Mathematically it’s over, but there’s plenty left to race for.', 'Disappointing, of course. Now we race for pride.'],
  leader: ['It’s nice to be at the top, but there’s a long way to go.', 'Leading means nothing until the last race. We keep our heads down.'],
  preLead: ['I’m not thinking about the championship. Just focus on doing my job this weekend.', 'We know what’s at stake. Nothing changes in how we approach it.', 'If it happens here, great. If not, we go again next time.'],
  preChase: ['It’s not over until it’s over. We’ll go for it.', 'We have nothing to lose. Full attack.', 'Stranger things have happened. We keep pushing.'],
  comeback: ['The start was mega and the car was strong on the long runs.', 'We went long on the first stint and it paid off at the end.', 'I just kept my head down and picked them off one by one.'],
};

/* ------------------------------------------------------ title retrospectives */
/** When a title was settled: { i, r, m (standings after it), final, contenders (still alive going into that round) } */
function titleDecision(s, kind) {
  const rounds = activeRounds(s);
  for (let i = 0; i < rounds.length; i++) {
    if (!s.weekends[rounds[i].id]?.sessions?.R?.done) continue;
    const m = titleMath(s, kind, i + 1);
    if (m.decided) return { i, r: rounds[i], m, final: !m.left.length, contenders: titleMath(s, kind, i).rows.filter(x => x.alive) };
  }
  return null;
}
/** Sprint and Grand Prix points scored at round ri by the given drivers. */
function weekendPoints(s, ri, ids) {
  const ses = s.weekends[activeRounds(s)[ri]?.id]?.sessions || {}; let p = 0;
  for (const k of ['SPR', 'R']) { const sd = ses[k]; if (sd?.done) sd.results.forEach((x, j) => { if (ids.includes(x.d)) p += pointsFor(k, j + 1, x.st, x.pts); }); }
  return p;
}
/**
 * How a title was won. Champion's drives come first: recoveries from far back to the front, races rated far above
 * the car, qualifying laps well beyond it. Then the weekends that swung the most points against the runner-up.
 * If there were no standout drives, the most dominant weekends stand in. For a team, either car counts.
 */
function titleRetro(c, s, kind) {
  const dec = titleDecision(s, kind); if (!dec) return null;
  const team = kind === 'team';
  const rounds = activeRounds(s);
  const champ = dec.m.rows[0], rival = dec.m.rows[1];
  const idsAt = (who, ri) => {
    if (!who) return [];
    if (!team) return [who.id];
    const R = s.weekends[rounds[ri].id]?.sessions?.R;
    return (R?.results || []).map(x => x.d).filter(d => teamAt(s, d, ri)?.id === who.id);
  };
  const short = (id) => lastName(trName(c, s, id));
  const rows = [];
  for (let ri = 0; ri <= dec.i; ri++) {
    const ses = s.weekends[rounds[ri].id]?.sessions; if (!ses?.R?.done) continue;
    const mine = idsAt(champ, ri);
    const cp = weekendPoints(s, ri, mine), rp = weekendPoints(s, ri, idsAt(rival, ri));
    const R = raceRatings(s, ri) || {};
    let score = 0, margin = 0; const bits = [];
    for (const d of mine) {
      const x = R[d]; if (!x || x.dnf) continue;
      const big = x.grid && x.grid >= 10 && x.finish <= 3, climb = x.gained >= 8 && x.finish <= 6;
      const who = team ? `${short(d)}: ` : '';
      if (big || climb) { score += (big ? 6 + (x.grid - x.finish) * 0.3 : 0) + (climb ? 3 + x.gained * 0.25 : 0); bits.push(`${who}from ${ordWord(x.grid)} on the grid to ${x.finish === 1 ? 'victory' : ordWord(x.finish)}`); }
      else if (x.rating >= 9.3) { score += (x.rating - 9) * 6; bits.push(`${who}${x.finish === 1 ? 'the win' : ordWord(x.finish)}, rated ${x.rating.toFixed(1)} by the fans`); }
      if (x.quali != null && x.quali >= 9.5 && x.grid && x.grid <= 3) { score += 2; if (!bits.length) bits.push(`${who}${x.grid === 1 ? 'pole' : ordWord(x.grid)} in qualifying and ${x.finish === 1 ? 'the win' : ordWord(x.finish)}`); }
      if (x.finish === 1) margin = Math.max(margin, x.margin || 0);
    }
    const resTxt = (ids) => { const b = ids.map(d => { const k = ses.R.results.findIndex(y => y.d === d); return k < 0 ? null : OUT.includes(ses.R.results[k].st) ? ses.R.results[k].st : k === 0 ? 'won' : 'P' + (k + 1); }).filter(Boolean); return b.join(' & ') || '–'; };
    rows.push({ ri, r: rounds[ri], cp, rp, swing: cp - rp, score, bits, margin, mine, champRes: resTxt(mine), rivalRes: resTxt(idsAt(rival, ri)) });
  }
  const drives = rows.filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 4);
  const swings = rows.filter(x => x.swing > 0).sort((a, b) => b.swing - a.swing).slice(0, 5);
  const dominant = drives.length ? [] : rows.slice().sort((a, b) => b.cp - a.cp || b.margin - a.margin).slice(0, 3);
  const st = seasonStats(s, dec.i + 1);
  const tally = (ids, k) => ids.reduce((a, d) => a + (st[d]?.[k] || 0), 0);
  const allIds = team ? [...new Set(rows.flatMap(x => x.mine))] : [champ.id];
  return { kind, dec, champ, rival, drives, swings, dominant, wins: tally(allIds, 'wins'), podiums: tally(allIds, 'podiums'), poles: tally(allIds, 'poles'),
    name: team ? champ.name : trName(c, s, champ.id), rivalName: rival ? (team ? rival.name : trName(c, s, rival.id)) : null, short: team ? champ.name : short(champ.id), rivalShort: rival ? (team ? rival.name : short(rival.id)) : null };
}
/** The retrospective as a list of sections ({ title, items: [{ id, text }] }) shared by the story and the season review. */
function retroSections(c, s, T) {
  const sec = [];
  const who = (x) => T.kind === 'team' ? (x.mine[0] || null) : T.champ.id;
  if (T.drives.length) sec.push({ title: T.kind === 'team' ? 'The drives that won it' : 'Champion’s drives', items: T.drives.map(x => ({ id: who(x), text: `R${x.ri + 1} ${x.r.name}: ${x.bits.join('; ')}` })) });
  else if (T.dominant.length) sec.push({ title: 'The most dominant weekends', items: T.dominant.map(x => ({ id: who(x), text: `R${x.ri + 1} ${x.r.name}: ${x.champRes}, ${plural(x.cp, 'point')}${x.margin >= 5 ? `, won by ${x.margin.toFixed(1)} s` : ''}` })) });
  if (T.swings.length && T.rival) sec.push({ title: `Where it was won: five swings against ${T.rivalShort}`, items: T.swings.map(x => ({ id: who(x), text: `R${x.ri + 1} ${x.r.name}: +${x.swing} on ${T.rivalShort} (${T.short} ${x.champRes}, ${T.rivalShort} ${x.rivalRes})` })) });
  return sec;
}
function titleRetroStory(c, s, T) {
  const team = T.kind === 'team'; const d = T.dec; const rnd = seeded(`${s.index}-${T.kind}-retro`);
  const left = d.m.left.length;
  const finalTxt = d.final ? (d.contenders.length >= 3 ? `at the final race, in a ${numWord(d.contenders.length)}-way showdown` : 'at the final race') : `with ${plural(left, 'round')} to spare`;
  const headline = team
    ? (d.final ? `Down to the wire: how ${T.name} won the ${s.year} constructors’ title` : `How ${T.name} won the ${s.year} constructors’ championship`)
    : d.final ? `Down to the wire: how ${T.short} won the ${s.year} title` : T.drives.length ? `${T.short}’s ${s.year} title: the drives that won it` : `How ${T.short} won the ${s.year} world championship`;
  const standfirst = `${T.name} sealed the ${team ? 'constructors’ ' : ''}championship in ${d.r.name} ${finalTxt}${T.rival ? `, ${plural(d.m.margin, 'point')} clear of ${T.rivalName}` : ''}. Along the way: ${plural(T.wins, 'win')}, ${plural(T.podiums, 'podium')} and ${plural(T.poles, 'pole')}.`;
  const body = [];
  if (T.drives.length) body.push(team ? `Titles are built on the days the cars outperformed themselves. These were ${T.name}’s.` : `Every championship has days that define it. Without these, ${T.short} might not be champion.`);
  else body.push(`There was no single rescue act this year. ${T.short} won it by dominating.`);
  if (d.final) body.push(d.contenders.length >= 3 ? `It went to the last race with ${listJoin(d.contenders.map(x => team ? x.name : lastName(trName(c, s, x.id))))} all still in contention.` : `It came down to the final race against ${T.rivalName}.`);
  // interviews: the champion (never you: you speak for yourself in Media) and the team
  const top = T.drives[0] || T.dominant[0] || T.swings[0];
  const qa = [];
  if (!team && T.champ.id !== PLAYER) {
    qa.push(['Which drive won you this title?', top ? choose(rnd, [`${top.r.name}. ${T.drives.length ? 'Where we started, nobody expected anything from us. That day changed the season.' : 'We had everything under control that weekend, and it set the tone.'}`, `I keep coming back to ${top.r.name}. If we don’t get that result, I’m not sure we’re sitting here.`]) : 'All of them. Every point counted.']);
    qa.push(d.final ? ['It came down to the last race. What was that like?', choose(rnd, ['Brutal. I don’t think I’ve ever been that nervous in a car.', 'You try to treat it like any other race. It isn’t. It’s the hardest race of the year.'])] : ['When did you know it was yours?', choose(rnd, [`Not until the flag in ${d.r.name}. You never relax in this sport.`, 'Honestly, only when the maths said so.'])]);
    if (T.rival) qa.push([`What do you say to ${T.rivalName}?`, choose(rnd, ['They pushed me all season. Huge respect.', 'It was a proper fight. That makes it mean more.'])]);
  }
  const teamId = team ? T.champ.id : teamAt(s, T.champ.id, d.i)?.id;
  const quotes = teamId ? [{ team: teamId, role: 'Team principal', text: team
    ? choose(rnd, ['This belongs to everyone in the factory. Both drivers delivered when it mattered.', d.final ? 'We made it hard for ourselves, but we got there in the end.' : 'We built this one race at a time.'])
    : choose(rnd, [`${T.short} delivered when it counted. That’s what champions do.`, d.final ? 'I aged ten years in that last race. What a driver.' : 'A complete season. We’re incredibly proud.']) }] : [];
  return { id: `${s.index}-${T.kind}-retro`, seq: d.i * 10 + 6, kind: 'title', i: d.i, r: d.r, subject: team ? null : T.champ.id, outlet: choose(rnd, D.OUTLETS),
    kicker: d.final ? 'Title review · Final-race decider' : 'Title review', headline, standfirst, body, sections: retroSections(c, s, T), qa: qa.length ? qa : null, quotes, massive: d.final };
}

/* -------------------------------------------------------- title showdowns */
// A drivers' title that goes to the final race gets told properly, before and after: the scene (who leads, by how
// much, their form, the last time it came to this), what each contender needs (the leader's minimum: "only needs
// third"; a chaser's: "at least second, and results going their way", with the actual permutation), how the race
// played out for the title (lap by lap, from the logged lap times) and how it ended.
/** What each title contender needs at round i (the last round): [{ id, pts, gap, leader, sure, maxP, cond, margins }] or null. */
function titleNeeds(s, i) {
  const m = titleMath(s, 'driver', i); if (m.decided || m.left.length !== 1) return null;
  const P = roundPerms(m); if (!P) return null;
  const alive = m.rows.filter(x => x.alive); if (alive.length < 2) return null;
  const lead = m.rows[0];
  return { m, P, rows: alive.map(x => {
    const cl = P.clinch.find(o => o.x === x);
    const o = { id: x.id, pts: x.pts, gap: lead.pts - x.pts, leader: x === lead, wins: x.wins };
    if (P.exact && cl?.table?.length) {
      const t = cl.table; let sure = 0;
      for (const r of t) { if (r.conds.every(cc => !cc.q)) sure = r.p; else break; }
      o.sure = sure || null; o.maxP = t.length;
      o.cond = t[sure] || null; // the first finish that needs help from the others
      o.top = t[0];
    } else if (cl) o.margins = cl.rivals;
    return o;
  }) };
}
/** The conditions on the others in a permutation row, in words: "Hamilton finishes fourth or lower". */
function condTxt(row, L, past) {
  return listJoin(row.conds.filter(c => c.q).map(c => `${L(c.y.id)} ${past ? 'finished' : 'finishes'} ${c.q >= NO_PTS ? 'outside the points' : `${ordWord(c.q)} or lower`}`));
}
/** One sentence per contender: what they needed (past) or need (present) to be champion. */
function needsLines(N, L, past = true) {
  const v = (pres, pst) => past ? pst : pres;
  return N.rows.map(o => {
    const who = L(o.id);
    if (o.margins) return `${who} ${v('needs', 'needed')} ${listJoin(o.margins.map(m => m.need > 0 ? `to outscore ${L(m.y.id)} by ${plural(m.need, 'point')}` : m.need === 0 ? `to match ${L(m.y.id)}’s score` : `to stay within ${plural(-m.need, 'point')} of ${L(m.y.id)}`))} across the weekend.`;
    if (o.sure) {
      const base = o.sure === 1 ? `${who} ${v('has', 'had')} to win to be sure of the title`
        : `${who} only ${v('needs', 'needed')} ${ordWord(o.sure)} place to be champion, whatever ${v('happens', 'happened')} behind`;
      const extra = o.cond ? `; ${ordWord(o.cond.p)} ${v('would', 'would')} also do, as long as ${condTxt(o.cond, L, past)}` : '';
      return `${base}${extra}.`;
    }
    if (!o.top) return `${who} ${v('cannot', 'could not')} win it any more.`;
    const helped = o.top.conds.some(c => c.q);
    return o.maxP === 1
      ? `${who} ${v('has', 'had')} to win${helped ? `, and even that ${v('is', 'was')} only enough if ${condTxt(o.top, L, past)}` : ''}.`
      : `${who} ${v('needs', 'needed')} at least ${ordWord(o.maxP)} place and for results to go ${v('their', 'their')} way: ${helped ? `a win ${v('is', 'would be')} enough only if ${condTxt(o.top, L, past)}` : `a win ${v('does', 'would do')} it`}.`;
  });
}
/** The scene going in: the gaps, in a sentence. */
function sceneLine(N, L, gp, past = true) {
  const [a, ...rest] = N.rows; const v = (pres, pst) => past ? pst : pres;
  const level = rest.filter(o => !o.gap), behind = rest.filter(o => o.gap);
  const gaps = behind.map(o => `${L(o.id)} ${plural(o.gap, 'point')} behind`);
  const head = level.length
    ? `${listJoin([a, ...level].map(o => L(o.id)))} ${v('arrive', 'arrived')} in ${gp} level on ${plural(a.pts, 'point')}, ${L(a.id)} ahead on countback`
    : `${L(a.id)} ${v('arrives', 'arrived')} in ${gp} leading the championship on ${plural(a.pts, 'point')}`;
  return `${head}${gaps.length ? `, with ${listJoin(gaps)}` : ''}.${rest.length >= 2 ? ` ${cap(numWord(N.rows.length))} drivers, one title.` : ''}`;
}
/**
 * The title, lap by lap, from the logged lap times: everyone's running order at the end of each lap (cumulative time;
 * the last lap is the official result, penalties included) turned into points for the contenders. In the final race
 * it says who was champion on the road. { ids, rows: [{ k, pts, pos, champ }], final } or null.
 */
function titleByLap(s, i) {
  const r = activeRounds(s)[i]; const ses = s.weekends[r?.id]?.sessions; const sd = ses?.R; const g = sd?.game;
  if (!sd?.done || !g?.laps || Object.keys(g.laps).length < 2) return null;
  const m = titleMath(s, 'driver', i); const alive = m.rows.filter(x => x.alive);
  if (m.decided || alive.length < 2) return null;
  const spr = {}; if (ses.SPR?.done) ses.SPR.results.forEach((x, k) => { spr[x.d] = pointsFor('SPR', k + 1, x.st, x.pts); });
  const cum = {}; for (const [d, laps] of Object.entries(g.laps)) { let t = 0; cum[d] = laps.map(l => (t += l[0] || 0)); }
  const N = Math.max(...Object.values(g.finished || {}), ...Object.values(cum).map(x => x.length)); if (!N) return null;
  const finalOrder = sd.results.filter(x => !OUT.includes(x.st)).map(x => x.d);
  const roadOrder = (k) => Object.keys(cum).filter(d => cum[d].length >= k).sort((a, b) => cum[a][k - 1] - cum[b][k - 1]);
  /** The contenders' points and the champion if the race ended with this running order. */
  const standing = (order) => {
    const pos = (d) => order.indexOf(d) + 1;
    const pts = Object.fromEntries(alive.map(x => [x.id, x.pts + (spr[x.id] || 0) + (pos(x.id) ? pointsFor('R', pos(x.id), 'FIN') : 0)]));
    // most points; level, the countback (with this race's place added)
    const cb = (x) => { const v = (x.posCount || []).slice(); const p = pos(x.id); if (p) v[p - 1] = (v[p - 1] || 0) + 1; return v; };
    const champ = alive.slice().sort((a, b) => { if (pts[b.id] !== pts[a.id]) return pts[b.id] - pts[a.id]; const A = cb(a), B = cb(b); for (let q = 0; q < 30; q++) if ((A[q] || 0) !== (B[q] || 0)) return (B[q] || 0) - (A[q] || 0); return 0; })[0].id;
    return { pts, pos: Object.fromEntries(alive.map(x => [x.id, pos(x.id)])), champ };
  };
  const rows = [];
  for (let k = 1; k <= N; k++) { const order = k === N ? finalOrder : roadOrder(k); rows.push({ k, order, ...standing(order) }); }
  return { ids: alive.map(x => x.id), rows, final: m.left.length === 1, N, cum, sd, champOf: (order) => standing(order).champ, roadN: roadOrder(N) };
}
/**
 * How the title swung during the final race, in words: who was champion on the road and when it changed, and for each
 * change what did it: an overtake (with what led to it: a gap closed down, fresher tyres, a long fight), a pass on the
 * leader of the moment, a pit stop, a car ahead retiring, a title rival retiring, or a penalty after the flag. A late
 * swing (or one a rival's retirement decided) gets the full story: how the title looked going in to those last laps,
 * what the eventual champion still needed, and the moment it turned. { lines, twist } (twist: a headline for a late
 * or rival-retirement decider).
 */
function titleSwingStory(s, i, T, L, w = (k, v) => v[0]) {
  if (!T?.final) return { lines: [], twist: null };
  const { sd, N, cum } = T; const g = sd.game || {}; const row = (k) => T.rows[k - 1];
  const gp = gpThe(activeRounds(s)[i].name);
  const seg = []; for (const r of T.rows) { const lst = seg[seg.length - 1]; if (lst && lst.id === r.champ) lst.to = r.k; else seg.push({ id: r.champ, from: r.k, to: r.k }); }
  const stintEnds = (d, k) => { const st = stintsOf(sd, d); return st.some((x, j) => x.to === k && j < st.length - 1); };
  const tyre = (d, k) => stintsOf(sd, d).find(x => k >= x.from && k <= x.to) || null;
  // what led to a pass by a on b on lap k
  const context = (a, b, k) => {
    const bits = [];
    const gap = (q) => cum[a]?.[q - 1] != null && cum[b]?.[q - 1] != null ? (cum[a][q - 1] - cum[b][q - 1]) / 1000 : null;
    const q0 = Math.max(1, k - 6), g0 = gap(q0), g1 = gap(k - 1);
    if (g0 != null && g1 != null && g0 >= 1 && g0 - g1 >= 1) bits.push(`having cut a ${g0.toFixed(1)}-second gap in ${pw(k - 1 - q0, 'lap')}`);
    const ta = tyre(a, k), tb = tyre(b, k);
    if (ta && tb) { const d = (k - ta.from) - (k - tb.from); if (d <= -6) bits.push(`on ${(COMPOUNDS[ta.c]?.[1] || '').toLowerCase()} tyres ${-d} laps fresher`); }
    const n = (g.overtakes || []).filter(([x, y]) => (x === a && y === b) || (x === b && y === a)).length;
    if (n >= 3) bits.push(`at the end of a fight that saw ${nw(n)} passes between them`);
    return listJoin(bits);
  };
  const timePen = (d) => (g.penalties || []).find(p => p.d === d && p.type === 4);
  // what turned the title from P to C on lap k
  const cause = (k, P, C) => {
    const a = row(k - 1), b = row(k); const oa = a.order, ob = b.order;
    const atN = k === N; const road = atN ? T.roadN : ob;
    if (a.pos[P] && !b.pos[P]) return { kind: 'rival-dnf', who: P };
    const gone = oa.filter(d => !ob.includes(d) && oa.indexOf(d) < oa.indexOf(C) && T.ids.includes(d));
    if (gone.length) return { kind: 'rival-dnf', who: gone[0] };
    if (b.pos[P] > a.pos[P]) {
      if (atN && timePen(P) && road.indexOf(P) < ob.indexOf(P)) return { kind: 'penalty', who: P, pen: timePen(P), to: b.pos[P] };
      if (stintEnds(P, k)) return { kind: 'pit', who: P, to: b.pos[P] };
      const by = ob.filter(d => oa.includes(d) && oa.indexOf(d) > oa.indexOf(P) && ob.indexOf(d) < ob.indexOf(P));
      if (by.length) return { kind: by[0] === C ? 'overtake' : 'passed', who: by[0] === C ? P : by[0], victim: P, to: b.pos[by[0] === C ? C : P], ctx: context(by[0], P, k) };
    }
    if (b.pos[C] < a.pos[C]) {
      const ahead = oa.filter(d => !ob.includes(d) && oa.indexOf(d) < oa.indexOf(C));
      if (ahead.length) return { kind: 'dnf-ahead', who: ahead[0], to: b.pos[C] };
      const passed = oa.filter(d => ob.includes(d) && oa.indexOf(d) < oa.indexOf(C) && ob.indexOf(d) > ob.indexOf(C));
      if (atN && passed.length && timePen(passed[0]) && road.indexOf(passed[0]) < road.indexOf(C)) return { kind: 'penalty', who: passed[0], pen: timePen(passed[0]), to: b.pos[C] };
      if (passed.length && passed.every(d => stintEnds(d, k))) return { kind: 'pit-ahead', who: passed[0], to: b.pos[C] };
      if (passed.length) return { kind: 'overtake', who: passed[0], to: b.pos[C], ctx: context(C, passed[0], k) };
    }
    return { kind: 'other' };
  };
  // just before lap k: what C still needed (places to gain, or places P had to lose)
  const needed = (k, C, P) => {
    const a = row(k - 1); let gain = null, drop = null;
    for (let j = 1; j <= 6 && gain == null; j++) { const o = a.order.slice(); const p = o.indexOf(C); if (p < 0 || p - j < 0) break; o.splice(p, 1); o.splice(p - j, 0, C); if (T.champOf(o) === C) gain = j; }
    for (let j = 1; j <= 6 && drop == null; j++) { const o = a.order.slice(); const p = o.indexOf(P); if (p < 0 || p + j >= o.length) break; o.splice(p, 1); o.splice(p + j, 0, P); if (T.champOf(o) === C) drop = j; }
    return { gain, drop, pos: a.pos[C], ppos: a.pos[P] };
  };
  const ordPos = (p) => p ? ordWord(p) : 'out';
  // the moment itself, in a sentence
  const moment = (k, x, C, P, full) => {
    const lap = k === N ? 'on the final lap' : `on lap ${k}`;
    const sub = (d, ctx) => ctx ? `${L(d)}, ${ctx},` : L(d);
    switch (x.kind) {
      case 'rival-dnf': return x.who === P
        ? w('m-rdnf', [`Then, ${lap}, it was ripped from ${L(P)}: the car ground to a halt, and ${L(C)} was champion on the road.`, `And then, ${lap}, ${L(P)}’s car stopped. Just like that, the title was ${L(C)}’s.`, `${cap(lap)}, it all turned on its head: ${L(P)} retired, and the championship fell to ${L(C)}.`])
        : `Then, ${lap}, ${L(x.who)} retired, and the title swung to ${L(C)}.`;
      case 'passed': return w('m-passed', [`Then ${sub(x.who, x.ctx)} got past ${L(P)} ${lap}. One place, and the title was ${L(C)}’s.`, `${cap(lap)}, ${sub(x.who, x.ctx)} passed ${L(P)} for ${ordWord(x.to - 1)}, and that one place handed the title to ${L(C)}.`]);
      case 'overtake': return x.victim
        ? w('m-ovP', [`Then ${sub(C, x.ctx)} passed ${L(P)} ${lap}, and took the title with the place.`, `${cap(lap)}, ${sub(C, x.ctx)} went past ${L(P)}: ${ordWord(x.to)}, and champion on the road.`])
        : w('m-ov', [`Then, ${lap}, ${sub(C, x.ctx)} passed ${L(x.who)} for ${ordWord(x.to)}, and that was enough.`, `${cap(lap)}, ${sub(C, x.ctx)} found a way past ${L(x.who)}: ${ordWord(x.to)}, and champion on the road.`, `${L(C)} got the place that mattered ${lap}${x.ctx ? `, ${x.ctx}` : ''}, passing ${L(x.who)} for ${ordWord(x.to)}.`]);
      case 'pit': return w('m-pit', [`Then ${L(P)} had to stop ${lap}, dropped to ${ordWord(x.to)}, and the title went with it.`, `${L(P)}’s stop ${lap} dropped them to ${ordWord(x.to)}, and handed the title to ${L(C)}.`]);
      case 'pit-ahead': return `${L(x.who)}’s stop ${lap} handed ${L(C)} ${ordWord(x.to)}, and with it the title.`;
      case 'dnf-ahead': return w('m-dnfa', [`Then ${L(x.who)}, running ahead of ${L(C)}, retired ${lap}. The place, and the title, fell to ${L(C)}.`, `${cap(lap)}, ${L(x.who)} stopped on track ahead of ${L(C)}: ${ordWord(x.to)}, and the title.`]);
      case 'penalty': return x.who === P ? `It was settled after the flag: ${L(P)}’s ${x.pen.time}-second penalty dropped them to ${ordWord(x.to)}, and the title went to ${L(C)}.` : `It was settled after the flag: ${L(x.who)}’s ${x.pen.time}-second penalty promoted ${L(C)} to ${ordWord(x.to)}, and that was the title.`;
      default: return full ? `${cap(lap)}, the title swung to ${L(C)}.` : `${cap(lap)}, the title swung to ${L(C)}.`;
    }
  };
  // a swing in a few words, for the earlier swings and one that wasn't late
  const short = (x, C, P) => ({ 'rival-dnf': `${L(x.who)} retired`, passed: `${L(x.who)} passed ${L(P)}`, overtake: x.victim ? `${L(C)} passed ${L(P)}` : `${L(C)} passed ${L(x.who)}`, pit: `${L(P)} pitted`, 'pit-ahead': `${L(x.who)} pitted`, 'dnf-ahead': `${L(x.who)} retired ahead of ${L(C)}`, penalty: `${L(x.who)}’s time penalty was applied` }[x.kind] || 'the order shuffled');
  const lines = [];
  if (seg.length === 1) {
    lines.push(`${L(seg[0].id)} was champion on the road from the first lap to the last.`);
  } else {
    const swings = seg.length - 1;
    lines.push(`The title changed hands ${swings === 1 ? 'once' : swings === 2 ? 'twice' : `${nw(swings)} times`} out on track, with ${L(seg[0].id)} holding it at the start.`);
    // the earlier swings, briefly
    const early = seg.slice(1, -1); const shown = early.length > 3 ? [early[0], early[1]] : early;
    for (const x of shown) { const k0 = seg.indexOf(x); const P0 = seg[k0 - 1].id; lines.push(`On lap ${x.from}, ${short(cause(x.from, P0, x.id), x.id, P0)}, and it swung to ${L(x.id)}.`); }
    if (early.length > 3) lines.push(`It went back and forth ${nw(early.length - 2)} more times after that.`);
  }
  // the decisive swing
  let twist = null;
  if (seg.length > 1) {
    const last = seg[seg.length - 1], prev = seg[seg.length - 2]; const C = last.id, P = prev.id, k = last.from;
    const why = cause(k, P, C); const left = N - (k - 1);
    const late = left <= Math.max(5, Math.round(N * 0.15));
    if (late || why.kind === 'rival-dnf') {
      const nd = needed(k, C, P);
      const held = prev.to - prev.from + 1;
      const inHand = held >= N * 0.4 || prev.from <= 3;
      const ask = [nd.gain ? `${pw(nd.gain, 'more place')}` : null, nd.drop ? `${L(P)} to lose ${pw(nd.drop, 'place')}` : null].filter(Boolean);
      const where = `${L(C)} was ${ordPos(nd.pos)}${nd.pos && nd.ppos ? `, ${L(P)} ${ordPos(nd.ppos)}` : ''}`;
      const had = seg.slice(0, -1).some(x => x.id === C);
      lines.push(w(had ? 'm-setup' : 'm-setup2', [
        `With ${pw(left, 'lap')} to go, ${inHand ? `it seemed ${L(P)} had the title in hand` : `${L(P)} held the title`}: ${where}${ask.length ? `, and ${L(C)} needed ${ask.join(', or for ')}` : ''}.`,
        `${L(C)}’s hopes were dim${inHand ? `, and ${L(P)} had looked the likely champion for ${pw(held, 'lap')}` : ''}. With ${pw(left, 'lap')} left, ${where}${ask.length ? `; ${L(C)} needed ${ask.join(', or for ')}` : ''}.`,
        had ? `${L(C)}’s grip on the title had slipped, and with ${pw(left, 'lap')} to go it looked gone: ${where}${ask.length ? `. ${L(C)} needed ${ask.join(', or for ')}` : ''}.` : null]));
      lines.push(moment(k, why, C, P, true));
      twist = { kind: why.kind, C, P, k, left, late,
        headline: why.kind === 'rival-dnf' && why.who === P ? w('h-rdnf', [`Heartbreak for ${L(P)} as ${L(C)} takes the title in ${gp}`, `Ripped away: ${L(P)} retires and ${L(C)} is champion`, `${L(P)}’s car stops, and the title goes to ${L(C)}`])
          : why.kind === 'penalty' ? w('h-pen', [`A penalty for ${L(why.who)} hands ${L(C)} the title`, `Decided by the stewards: ${L(C)} is champion`])
          : left <= 2 ? w('h-last', [`${L(C)} snatches the title at the death in ${gp}`, `${cap(lapWord(left))} from glory: ${L(P)} loses the title to ${L(C)}`, `Last-gasp ${L(C)} takes the title`])
          : w('h-late', [`${L(C)} turns it round late to take the title in ${gp}`, `${pw(left, 'lap')} from the end, the title swings to ${L(C)}`, `A late twist hands ${L(C)} the title in ${gp}`]) };
    } else lines.push(`The decisive moment came ${k === N ? 'on the final lap' : `on lap ${k}`}: ${short(why, C, P)}, and the title was ${L(C)}’s for good.`);
  }
  // a rival's retirement that ended their challenge, when it wasn't the swing itself
  const final = T.rows[T.rows.length - 1].champ;
  for (const d of T.ids.filter(d => d !== final)) {
    const k = T.rows.findIndex((r, j) => j && T.rows[j - 1].pos[d] && !r.pos[d]);
    if (k > 0 && !(twist?.kind === 'rival-dnf' && (twist.P === d))) lines.push(`${L(d)}’s challenge ended on lap ${k + 1}, when the car stopped.`);
  }
  return { lines: [lines.join(' ')], twist };
}
const lapWord = (n) => n === 1 ? 'one lap' : `${nw(n)} laps`;
/** A chart of the contenders' championship points, lap by lap, with a legend. */
function titleChartHtml(s, T, L) {
  if (!T) return '';
  const seen = {};
  const series = T.ids.slice(0, 4).map(id => { const col = teamColor(s, id); const dashed = !!seen[col]; seen[col] = 1; return { id, color: col, dashed, pts: T.rows.map(r => [r.k, r.pts[id]]) }; });
  const flips = T.final ? T.rows.filter((r, k) => k && r.champ !== T.rows[k - 1].champ).map(r => r.k) : [];
  return `<div class="title-chart"><div class="label">The title, lap by lap${T.final ? ' · points if the race ended there' : ' · projected points'}</div>
    ${svgChart(series, { h: 190, yFmt: (v) => Math.round(v), xLabel: 'Lap' })}
    <div class="chart-legend">${series.map(x => `<span><i style="background:${x.color};${x.dashed ? 'opacity:.6' : ''}"></i>${esc(L(x.id))}</span>`).join('')}${flips.length ? `<span class="muted">Title changed hands on lap ${listJoin(flips.map(String))}</span>` : ''}</div></div>`;
}
/** The last title in this career that went to the final race (before season s). */
function lastShowdown(c, s) {
  for (let k = s.index - 1; k >= 0; k--) {
    const se = c.seasons[k]; if (roundsDone(se) < activeRounds(se).length) continue;
    const d = titleDecision(se, 'driver'); if (d?.final) return { s: se, d, champ: d.m.rows[0], runner: d.m.rows[1] };
  }
  return null;
}
// what the contenders say before and after a final-race decider
const SHOWDOWN_QUOTES = {
  preLead: ['I’m in the best position, but I know nothing is done until the flag.', 'We just have to do our job. If we do that, the rest takes care of itself.', 'I won’t be doing maths in the car. Just driving.', 'Of course I’m nervous. Anyone who says they aren’t is lying.'],
  preChase: ['We have nothing to lose. I’m going for the win and we’ll see what happens.', 'I need some help, I know that. But I can only control my own race.', 'Pressure? The pressure is all on them.', 'All I can do is win. Then we look at the screens.'],
  won: ['I don’t have words. The longest race of my life.', 'I couldn’t look at the screens. My engineer just told me to keep pushing, and then… champion.', 'To do it in the last race, under that pressure, this is everything.', 'All year we fought for this, and it came down to one afternoon.'],
  lost: ['It hurts. We gave everything, and it wasn’t enough today.', 'Congratulations to them. This one will sting for a while.', 'Second in the world sounds good, but right now it doesn’t feel like it.', 'We came so close. I’ll be back next year, stronger.', 'That’s racing. Sometimes it goes your way and sometimes it doesn’t.'],
};
/** The preview of a final-race showdown: scene, form, head-to-head, what each needs, last year here and history. */
function showdownPreviewLines(c, s, i, L) {
  const N = titleNeeds(s, i); if (!N) return null;
  const rounds = activeRounds(s); const r = rounds[i]; const gp = gpThe(r.name);
  const lines = [sceneLine(N, L, gp, false)];
  const st = seasonStats(s, i);
  // form: the last three races
  const form = N.rows.map(o => { const res = rounds.slice(Math.max(0, i - 3), i).map(x => st[o.id]?.byRound[x.id]?.r).filter(x => x != null).map(x => typeof x === 'number' ? 'P' + x : x); return res.length ? `${L(o.id)} ${res.join(', ')}` : null; }).filter(Boolean);
  if (form.length) lines.push(`Form over the last three races: ${listJoin(form)}. Wins this season: ${listJoin(N.rows.map(o => `${L(o.id)} ${st[o.id]?.wins || 0}`))}.`);
  // head to head, the top two
  const [a, b] = N.rows; let ahead = 0, both = 0;
  for (const x of rounds.slice(0, i)) { const ra = st[a.id]?.byRound[x.id]?.r, rb = st[b.id]?.byRound[x.id]?.r; if (typeof ra === 'number' && typeof rb === 'number') { both++; if (ra < rb) ahead++; } }
  if (both >= 3) lines.push(`On track, ${L(a.id)} has finished ahead of ${L(b.id)} in ${ahead} of the ${both} races both completed.`);
  lines.push(...needsLines(N, L, false));
  if (N.P.exact) lines.push('If they finish level on points, the countback decides it: most wins, then most second places, and so on.');
  // last year at this circuit
  const prev = c.seasons[s.index - 1]; const pr = prev && activeRounds(prev).find(x => trackOf(x) === trackOf(r));
  const pres = pr && prev.weekends[pr.id]?.sessions?.R;
  if (pres?.done) {
    const W = pres.results.find(x => !OUT.includes(x.st))?.d; const at = (id) => { const k = pres.results.findIndex(x => x.d === id); return k < 0 ? null : OUT.includes(pres.results[k].st) ? 'retired' : `finished ${ordWord(k + 1)}`; };
    const bits = N.rows.filter(o => o.id !== W && at(o.id)).map(o => `${L(o.id)} ${at(o.id)}`);
    if (W) lines.push(`A year ago here, ${N.rows.some(o => o.id === W) ? `${L(W)} won` : `the win went to ${lastName(dName(prev, W))}`}${bits.length ? `; ${listJoin(bits)}` : ''}.`);
  }
  const H = lastShowdown(c, s);
  if (H) lines.push(`The last time the title went to the final race was ${H.s.year}, when ${lastName(dName(H.s, H.champ.id))} beat ${lastName(dName(H.s, H.runner.id))} to it in ${gpThe(H.d.r.name)}${H.d.m.margin ? ` by ${plural(H.d.m.margin, 'point')}` : ' on countback'}.`);
  return { lines, N };
}
/**
 * The final race of a title that went the distance, told after the fact (for the title story and the season review):
 * { scene, needs, race, outcome, chart }.
 */
function showdownTold(c, s, i, L, w = (k, v) => v[0]) {
  const N = titleNeeds(s, i); if (!N) return null;
  const rounds = activeRounds(s); const r = rounds[i]; const gp = gpThe(r.name);
  const ses = s.weekends[r.id]?.sessions; const res = ses?.R?.results || [];
  const m = titleMath(s, 'driver', i + 1); const champ = m.rows[0]; const runner = m.rows[1];
  const was = N.rows.find(o => o.id === champ.id);
  const at = (id) => { const k = res.findIndex(x => x.d === id); return k < 0 ? null : OUT.includes(res[k].st) ? res[k].st : k + 1; };
  const grid = (id) => ses?.R?.game?.grid?.[id] || (ses?.Q?.done ? ses.Q.results.findIndex(x => x.d === id) + 1 || null : null);
  const scene = sceneLine(N, L, gp, true);
  const needs = needsLines(N, L, true);
  const race = [];
  // the contenders' afternoons
  race.push(listJoin(N.rows.map(o => { const p = at(o.id), g = grid(o.id); return typeof p === 'number' ? `${L(o.id)} ${g === p ? `started and finished ${ordWord(p)}` : g ? `went from ${ordWord(g)} on the grid to ${ordWord(p)}` : `finished ${ordWord(p)}`}` : `${L(o.id)} ${p === 'DSQ' ? 'was disqualified' : 'retired'}`; })) + '.');
  const T = titleByLap(s, i); const SW = titleSwingStory(s, i, T, L, w); race.push(...SW.lines);
  // the moments that involved the contenders
  const F = raceFacts(c, s, i);
  if (F) {
    const ids = new Set(N.rows.map(o => o.id));
    const B = raceBeats(F, phrasebook(seeded(`${s.index}-${r.id}-showdown`)), L).filter(b => ['incident', 'battle', 'lap1', 'safety', ...(T ? [] : ['dnf']), 'pole'].includes(b.tag) && (b.tag === 'safety' || b.ids.some(d => ids.has(d))));
    race.push(...B.slice(0, 3).map(b => b.text));
  }
  const margin = champ.pts - runner.pts;
  const turned = !was?.leader;
  const outcome = turned && !was.gap
    ? w('sd-level', [`Level on points coming in, ${L(champ.id)} left as champion, ${margin ? `${plural(margin, 'point')} clear` : 'ahead on countback'}. Heartbreak for ${L(N.rows[0].id)}.`, `From level on points to world champion: ${L(champ.id)} won it by ${margin ? plural(margin, 'point') : 'countback'}.`])
    : turned
    ? w('sd-turn', [`${L(champ.id)} came from ${plural(was.gap, 'point')} behind to take the title by ${margin ? plural(margin, 'point') : 'countback'}. Heartbreak for ${L(N.rows[0].id)}.`, `A turnaround at the last: ${L(champ.id)}, ${plural(was.gap, 'point')} down coming in, left as champion, ${margin ? `${plural(margin, 'point')} clear` : 'ahead on countback'}.`, `It was ${L(champ.id)}’s title in the end, overturning a ${was.gap}-point deficit${margin ? ` to win by ${plural(margin, 'point')}` : ' on countback'}.`])
    : w('sd-hold', [`${L(champ.id)} held on to take the title by ${margin ? plural(margin, 'point') : 'countback'}.`, `Job done: ${L(champ.id)} was champion, ${margin ? `${plural(margin, 'point')} clear of ${L(runner.id)}` : `level with ${L(runner.id)} but ahead on countback`}.`, `${L(champ.id)} kept their nerve and the title, by ${margin ? plural(margin, 'point') : 'countback'} from ${L(runner.id)}.`]);
  return { N, scene, needs, race, outcome, chart: titleChartHtml(s, T, L), T, twist: SW.twist, champ: champ.id, losers: N.rows.filter(o => o.id !== champ.id).map(o => o.id) };
}

/* Memory in the press: streaks, last time out, the defending champion. Each returns a line or null. */
function qualiMemory(mem, q, pole, last, rnd) {
  const run = mem.run(pole);
  const bits = [];
  if (run.poles >= 1) bits.push(run.poles + 1 >= 3 ? `That is ${ordWord(run.poles + 1)} pole in a row for ${last(pole)}.` : `${last(pole)} makes it back-to-back poles.`);
  else if (mem.lastPole && mem.lastPole !== pole) { const k = q.findIndex(x => x.d === mem.lastPole); if (k >= 0) bits.push(`Last time out’s pole-sitter ${last(mem.lastPole)} will start ${ordWord(k + 1)}.`); }
  if (mem.defending && mem.defending === pole) bits.push(`The defending champion is on pole.`);
  else if (mem.defending) { const k = q.findIndex(x => x.d === mem.defending); if (k >= 3) bits.push(`Defending champion ${last(mem.defending)} lines up only ${ordWord(k + 1)}.`); }
  const streaker = q.slice(0, 22).map(x => x.d).find(d => mem.run(d).wins >= 2 && d !== pole);
  if (streaker && rnd() < 0.8) bits.push(`${last(streaker)}, on a run of ${streakWord(mem.run(streaker).wins)} straight wins, starts ${ordWord(q.findIndex(x => x.d === streaker) + 1)}.`);
  return bits.join(' ') || null;
}
function raceMemoryLine(mem, res, W, last, name, rnd) {
  const bits = [];
  const runW = mem.run(W);
  if (runW.wins >= 1) bits.push(runW.wins + 1 >= 3 ? `${last(W)} has now won ${streakWord(runW.wins + 1)} in a row.` : `It is back-to-back wins for ${last(W)}.`);
  // streaks that ended today
  for (const x of res) {
    if (x.d === W) continue;
    const run = mem.run(x.d); const k = res.indexOf(x);
    if (run.wins >= 2) { bits.push(`${last(x.d)}’s run of ${streakWord(run.wins)} straight wins ends with ${OUT.includes(x.st) ? 'a retirement' : ordWord(k + 1)}.`); break; }
  }
  const pod = res.slice(1, 3).find(x => !OUT.includes(x.st) && mem.run(x.d).podiums >= 2);
  if (pod) bits.push(`${last(pod.d)} is on the podium for a ${ordWord(mem.run(pod.d).podiums + 1)} race running.`);
  if (mem.lastWinner && mem.lastWinner !== W) { const x = res.find(y => y.d === mem.lastWinner); if (x) bits.push(`${mem.lastRound ? `${mem.lastRound.name} winner` : 'Last time out’s winner'} ${last(x.d)} ${OUT.includes(x.st) ? 'did not finish' : `finished ${ordWord(res.indexOf(x) + 1)}`} this time.`); }
  if (mem.defending && mem.defending !== W && mem.defending !== mem.lastWinner) { const x = res.find(y => y.d === mem.defending); if (x && rnd() < 0.7) bits.push(`Defending champion ${name(x.d)} ${OUT.includes(x.st) ? 'retired' : `came home ${ordWord(res.indexOf(x) + 1)}`}.`); }
  else if (mem.defending && mem.defending === W) bits.unshift(`Defending champion ${last(W)} is showing why the title is theirs.`);
  return bits.slice(0, 3).join(' ') || null;
}
function penMemoryQuestion(mem, subj, fpos, isOut, last, rnd) {
  const run = mem.run(subj);
  if (!isOut && fpos === 1 && run.wins >= 1) return [`That’s ${streakWord(run.wins + 1)} wins in a row. Does it feel like nobody can stop you right now?`, choose(rnd, ['You never think like that. The moment you relax, someone beats you.', 'It’s a great run, but every weekend starts from zero.', 'I’m enjoying it, believe me. But the others will come back at us.'])];
  if (run.wins >= 2 && fpos !== 1) return [`Your winning run ends here. How much does that sting?`, choose(rnd, ['Streaks end. The important thing is we still scored.', 'It hurts a bit, but nobody wins every race.', 'We knew it would happen at some point. Now we start a new one.'])];
  if (mem.lastWinner === subj && fpos !== 1) return [`You won last time out. What was different this weekend?`, choose(rnd, ['We just didn’t have the same pace. We’ll look at why.', 'Small margins. A few things didn’t go our way.', 'Every track is different. This one suited the others more.'])];
  if (mem.defending === subj) return [`As the defending champion, how do you judge your form at the moment?`, choose(rnd, ['I don’t think about the number on the car. I just want to win races.', 'We know what we’re capable of. It’s about putting it together every weekend.', 'There is always pressure as champion, but it’s the good kind.'])];
  if (run.podiums >= 2 && fpos <= 3) return [`Another podium: that’s ${streakWord(run.podiums + 1)} in a row. Is the win next?`, choose(rnd, ['That’s the plan. We’re knocking on the door.', 'The consistency is there. Now we need a bit more pace.'])];
  return null;
}
function previewStory(c, s, i, mem, { name, last, tName }) {
  const rounds = activeRounds(s); const r = rounds[i]; const rnd = seeded(`${s.index}-${r.id}-pv`);
  const ds = driverStandings(s, seasonStats(s, i));
  const hot = ds.map(x => x.id).find(d => mem.run(d).wins >= 2);
  const lead = ds[0]?.id;
  let headline, standfirst;
  if (hot) { headline = choose(rnd, [`Can anyone stop ${last(hot)}?`, `${last(hot)} chases win number ${mem.run(hot).wins + 1} in a row at ${r.name}`]); standfirst = `${name(hot)} arrives at ${r.venue} on a run of ${streakWord(mem.run(hot).wins)} straight wins.`; }
  else if (mem.lastWinner) { headline = choose(rnd, [`${last(mem.lastWinner)} looks to repeat in ${r.name}`, `${r.name} next: can ${last(mem.lastWinner)} make it two?`]); standfirst = `${name(mem.lastWinner)} won ${mem.lastRound ? `in ${mem.lastRound.name}` : 'last time out'}, and the circus moves on to ${r.venue}.`; }
  else return null;
  const body = [];
  if (lead) body.push(`${name(lead)} leads the championship on ${plural(ds[0].pts, 'point')}${ds[1] ? `, ${plural(ds[0].pts - ds[1].pts, 'point')} clear of ${name(ds[1].id)}` : ''}.`);
  if (mem.lastPole && mem.lastPole !== mem.lastWinner) body.push(`${last(mem.lastPole)} took pole last time and will want to turn it into a win.`);
  const pods = ds.map(x => x.id).filter(d => d !== hot && mem.run(d).podiums >= 3).slice(0, 1);
  if (pods.length) body.push(`${last(pods[0])} has been on the podium ${streakWord(mem.run(pods[0]).podiums)} races running.`);
  if (mem.defending && mem.defending !== lead && mem.defending !== hot) { const p = ds.find(x => x.id === mem.defending)?.pos; if (p) body.push(`Defending champion ${name(mem.defending)} sits ${ordWord(p)} in the standings.`); }
  if (mem.lastDotd && mem.lastDotd !== mem.lastWinner) body.push(`${last(mem.lastDotd)} was Driver of the Day last time out.`);
  return { id: `${s.index}-${r.id}-pv`, seq: i * 10, kind: 'preview', i, r, subject: hot || mem.lastWinner, outlet: choose(rnd, D.OUTLETS), kicker: 'Preview', headline, standfirst, body };
}
function dotdStory(c, s, i, dd, mem, { name, last, tName }) {
  const r = activeRounds(s)[i]; const rnd = seeded(`${s.index}-${r.id}-dotd`);
  const R = raceRatings(s, i);
  const runners = Object.values(R).filter(x => !x.dnf && x.id !== dd.id).sort((a, b) => b.rating - a.rating).slice(0, 3);
  const repeat = mem.run(dd.id).dotd;
  // their drive of the season: better than every earlier rating they've had this year
  const before = []; for (let j = 0; j < i; j++) { const v = raceRatings(s, j)?.[dd.id]; if (v) before.push(v.rating); }
  const best = before.length > 0 && dd.rating > Math.max(...before);
  const headline = best ? choose(rnd, [`${last(dd.id)}’s drive of the season`, `${r.name}: ${last(dd.id)}’s drive of the season`, `Drive of the season: ${last(dd.id)} in ${r.name}`])
    : choose(rnd, [`${last(dd.id)} voted Driver of the Day`, `${last(dd.id)} voted Driver of the Day in ${r.name}`, `Fans vote ${last(dd.id)} Driver of the Day`, `${r.name}: ${last(dd.id)} is the fans’ Driver of the Day`]);
  const body = [
    `Pitwall rates the drive ${dd.rating.toFixed(1)} out of 10.${dd.grid ? ` From ${ordWord(dd.grid)} on the grid to ${ordWord(dd.finish)} at the flag.` : ` ${ordWord(dd.finish)[0].toUpperCase() + ordWord(dd.finish).slice(1)} at the flag.`}`,
    repeat ? `It is ${repeat + 1 >= 3 ? `a ${ordWord(repeat + 1)} straight award` : 'back-to-back awards'} for ${last(dd.id)}.` : '',
    runners.length ? `Also highly rated: ${listJoin(runners.map(x => `${name(x.id)} (${x.rating.toFixed(1)})`))}.` : '',
  ].filter(Boolean);
  return { id: `${s.index}-${r.id}-dotd`, seq: i * 10 + 4, kind: 'dotd', i, r, subject: dd.id, outlet: choose(rnd, D.OUTLETS), kicker: 'Driver of the Day', headline,
    standfirst: dd.pub.length ? `${name(dd.id)} (${tName(dd.id)}) ${listJoin(dd.pub)}.` : `${name(dd.id)} (${tName(dd.id)}) was the standout driver of the race.`, body, dotd: { ri: i } };
}

/* ------------------------------------------------------------ race facts */
/**
 * Everything worth telling about one Grand Prix, for the race report's account of the race and the season review:
 * the result, where people started, first wins and podiums, streaks, the title before and after, incidents, battles,
 * passes on the opening lap, safety cars, retirements, the sprint and Driver of the Day.
 */
function raceFacts(c, s, i) {
  const r = activeRounds(s)[i]; const ses = (r && s.weekends[r.id]?.sessions) || {};
  if (!ses.R?.done) return null;
  const res = ses.R.results; const fin = res.filter(x => !OUT.includes(x.st)); const W = fin[0]?.d; if (!W) return null;
  const g = ses.R.game || null;
  const gridG = g?.grid && Object.values(g.grid).some(Boolean) ? g.grid : null;
  const qOrder = ses.Q?.done ? ses.Q.results.filter(x => !OUT.includes(x.st)).map(x => x.d) : null;
  const gpos = (d) => gridG?.[d] || (qOrder ? qOrder.indexOf(d) + 1 || null : null);
  const pos = (d) => { const k = res.findIndex(x => x.d === d); return k < 0 ? null : OUT.includes(res[k].st) ? res[k].st : k + 1; };
  // career tallies going into the race (real seasons count from the record books, so no "first win" claims there)
  const hist = isHist(s); const stB = seasonStats(s, i);
  const prior = (id, key) => (id === PLAYER_ID || D.DRIVER_BIO[id]?.fictional ? 0 : (D.DRIVER_BIO[id]?.[key] || 0)) + c.seasons.slice(0, s.index).reduce((a, x) => a + (seasonStatsCache(x)[id]?.[key] || 0), 0) + (stB[id]?.[key] || 0);
  const dB = titleMath(s, 'driver', i), dA = titleMath(s, 'driver', i + 1);
  const tB = titleMath(s, 'team', i), tA = titleMath(s, 'team', i + 1);
  const mem = raceMemory(c, s, i);
  const sprint = r.sprint && ses.SPR?.done ? ses.SPR : null;
  return { c, s, i, r, gp: gpThe(r.name), ses, res, fin, W, P2: fin[1]?.d || null, P3: fin[2]?.d || null, gap2: parseGap(res[1]?.gap), pole: qOrder?.[0] || null, gpos, pos,
    firstWin: !hist && !D.DRIVER_BIO[W]?.fictional && prior(W, 'wins') === 0,
    firstPods: hist ? [] : fin.slice(1, 3).map(x => x.d).filter(d => !D.DRIVER_BIO[d]?.fictional && prior(d, 'podiums') === 0),
    streak: mem.run(W).wins + 1, mem, dB, dA, tB, tA, latePass: lateWinPass(ses.R, W),
    // the title contenders going in (from the third race: before that, everyone is)
    contenders: i < 2 ? [] : dB.rows.filter(x => x.alive && x.pts > 0 && (x.pos <= 2 || x.gap <= 25)).slice(0, 4).map(x => x.id),
    climbers: fin.map((x, k) => ({ d: x.d, from: gpos(x.d), to: k + 1 })).filter(x => x.from && x.from - x.to >= 5).map(x => ({ ...x, g: x.from - x.to })).sort((a, b) => b.g - a.g || a.to - b.to),
    dnfs: res.filter(x => x.st === 'DNF').map(x => x.d), dsq: res.filter(x => x.st === 'DSQ').map(x => x.d),
    incidents: g?.incidents || [], battles: raceBattles(ses.R) || [], passes: racePasses(ses.R), safety: g?.safety || null,
    sprW: sprint?.results.find(x => !OUT.includes(x.st))?.d || null,
    dotd: driverOfTheDay(s, i), team: (d) => teamAt(s, d, i),
    oneTwo: !!fin[1] && teamAt(s, W, i)?.id === teamAt(s, fin[1].d, i)?.id,
    title: { change: i > 0 && dA.rows[0]?.id !== dB.rows[0]?.id, decided: dA.decided && !dB.decided,
      out: dA.decided ? [] : dB.rows.filter(x => x.alive && x.pos <= 5 && !dA.rows.find(y => y.id === x.id)?.alive).map(x => x.id),
      teamChange: i > 0 && tA.rows[0]?.id !== tB.rows[0]?.id, teamDecided: tA.decided && !tB.decided } };
}
// Grand Prix names that take "the" in a sentence
const GP_THE = ['Netherlands', 'United States', 'United Kingdom', 'Americas'];
const gpThe = (n) => GP_THE.includes(n) ? 'the ' + n : n;
const cap = (x) => x ? x[0].toUpperCase() + x.slice(1) : x;
/** A count in words up to ten: "three places", "one round". */
const pw = (n, w) => `${nw(n)} ${w}${n === 1 ? '' : 's'}`;
const nw = (n) => n <= 10 ? numWord(n) : String(n);
/** A phrase picker that works through every variant of a kind before it repeats one, so a long piece doesn't echo. */
function phrasebook(rnd) {
  const used = {};
  return (key, variants) => {
    const list = variants.filter(x => x != null && x !== false); if (!list.length) return '';
    const u = used[key] ||= new Set();
    let free = list.map((_, k) => k).filter(k => !u.has(list[k]));
    if (!free.length) { u.clear(); free = list.map((_, k) => k); }
    const k = free[Math.floor(rnd() * free.length)]; u.add(list[k]);
    return list[k];
  };
}
/**
 * The things that happened in a race, each a sentence with a weight for how much it matters: { tag, w, text, ids }.
 * Tags: lap1, safety, incident, battle, climber, firstpod, pole, dnf, sprint, dotd, player.
 * duelsNow / duelsOn: pair keys of wheel-to-wheel rivalries born in this race, and already running.
 */
function raceBeats(F, w, L, { duelsNow = new Set(), duelsOn = new Set() } = {}) {
  const out = []; const add = (tag, wt, text, ids = []) => { if (text) out.push({ tag, w: wt, text, ids }); };
  const o = ordWord; const isC = (d) => F.contenders.includes(d); const num = (d) => typeof F.pos(d) === 'number' ? F.pos(d) : null;
  const out_ = (d) => !!F.pos(d) && typeof F.pos(d) !== 'number';
  const mine = (d) => d === PLAYER || F.team(d)?.id === F.s.playerTeamId;
  const onLap = (l) => l ? ` on lap ${l}` : '';
  // the start
  if (F.passes) {
    const L1 = Object.entries(F.passes.lap1).sort((a, b) => b[1] - a[1]);
    const up = L1[0], down = L1[L1.length - 1];
    if (up && up[1] >= 3) { const n = pw(up[1], 'place'); add('lap1', 1 + up[1] / 2 + (mine(up[0]) ? 1 : 0), w('lap1', [`${L(up[0])} made a flying start, ${n} better off by the end of lap one.`, `${L(up[0])} gained ${n} on the opening lap.`, `The start belonged to ${L(up[0])}, up ${n} in the first few corners.`, `${L(up[0])} was the star of lap one, climbing ${n}.`, `${L(up[0])} got the jump on the field and made up ${n} before the first lap was out.`, `A brilliant getaway lifted ${L(up[0])} ${n}.`, `${L(up[0])} picked off ${n} on the run to the first corners.`]), [up[0]]); }
    if (down && down[1] <= -4) { const n = pw(-down[1], 'place'); add('lap1', 1 - down[1] / 3 + (isC(down[0]) ? 2 : 0), w('lap1-lost', [`${L(down[0])} had a nightmare start, losing ${n} on the first lap.`, `Lap one went badly wrong for ${L(down[0])}, down ${n}.`, `${L(down[0])} was swallowed up at the start and lost ${n}.`, `${L(down[0])} bogged down off the line and dropped ${n}.`]), [down[0]]); }
  }
  // safety cars and red flags
  const sf = F.safety || {};
  if (sf.red) add('safety', 4.5, w('red', ['A red flag stopped the race, and it had to be restarted.', 'The race was red-flagged at one point, bunching everyone up for the restart.', 'Proceedings were halted by a red flag.']));
  else if (sf.sc >= 2) add('safety', 3, w('sc2', [`${numWord(sf.sc)[0].toUpperCase() + numWord(sf.sc).slice(1)} safety car periods kept bunching the field up.`, `The safety car came out ${sf.sc} times.`, `It was a stop-start race, with ${numWord(sf.sc)} safety cars.`]));
  else if (sf.sc === 1) add('safety', 2.2, w('sc1', ['A safety car period shuffled the order.', 'One safety car bunched the field up.', 'The safety car made an appearance and closed the gaps.']));
  else if (sf.vsc) add('safety', 1.2, w('vsc', ['A virtual safety car briefly neutralised the race.', `The race went under a virtual safety car${sf.vsc > 1 ? ` ${sf.vsc} times` : ''}.`]));
  // incidents: the ones that matter most first
  const ended = new Set();
  const incs = F.incidents.map(inc => {
    const big = isC(inc.a) || isC(inc.b) || [inc.a, inc.b].some(d => num(d) && num(d) <= 3);
    const bOut = inc.out === inc.b; const hurt = !bOut && inc.dmg?.includes(inc.b);
    return { inc, wt: (inc.major ? 6 : 2.5) + (big ? 3 : 0) + (bOut ? 2 : hurt ? 1 : 0) + ([inc.a, inc.b].some(mine) ? 1.5 : 0), bOut, hurt };
  }).sort((a, b) => b.wt - a.wt).slice(0, 1); // only the most serious contact
  for (const { inc, wt, bOut, hurt } of incs) {
    const A = L(inc.a), B = L(inc.b); const lp = onLap(inc.lap);
    const end = bOut ? w('inc-end', [`, ending ${B}’s race`, `, and ${B} did not make it to the flag`, `, which put ${B} out`]) : hurt ? w('inc-dmg', [`, damaging ${B}’s car`, `, and ${B} came away with damage`, `, leaving ${B} nursing a damaged car`]) : '';
    if (bOut) ended.add(inc.b);
    const text = inc.noFault ? w('inc-even', [`${A} and ${B} tangled${lp}${end}, a racing incident in the stewards’ eyes.`, `${A} and ${B} made contact${lp}${end}; nobody was blamed.`, inc.lap ? `Lap ${inc.lap} brought contact between ${A} and ${B}${end}, put down as a racing incident.` : null])
      : inc.pen && inc.pen !== 'a warning' ? w('inc-pen', [`${A} was handed ${inc.pen} for hitting ${B}${lp}${end}.`, `Contact with ${B}${lp} earned ${A} ${inc.pen}${end}.`, `The stewards hit ${A} with ${inc.pen} after a clash with ${B}${lp}${end}.`, `${A} went for a gap that wasn’t there${lp}, hit ${B} and collected ${inc.pen}${end}.`])
      : inc.major ? w('inc-major', [`${A} and ${B} collided${lp}${end}, and ${A} was given ${inc.pen || 'the blame'}.`, `A heavy clash between ${A} and ${B}${lp}${end} drew ${inc.pen || 'a reprimand'} for ${A}.`])
      : w('inc-minor', [`${A} tagged ${B}${lp}${end || ', with no lasting harm done'}.`, `There was a brush between ${A} and ${B}${lp}${end}.`, `${A} and ${B} touched${lp}${end || ', but both carried on'}.`, `${A} nudged ${B}${lp}${end}; the stewards let it go.`]);
    add('incident', wt, text, [inc.a, inc.b]);
  }
  // battles
  for (const b of F.battles.slice(0, 3)) {
    const A = L(b.ahead), B = L(b.behind); const k = pairKey(b.a, b.b);
    const span = b.to > b.from ? ` between laps ${b.from} and ${b.to}` : b.from ? ` on lap ${b.from}` : '';
    const where = b.posW < 99 ? ` in ${o(b.posW)}` : '';
    const times = (n) => n === 1 ? 'once' : n === 2 ? 'twice' : `${nw(n)} times`;
    let t = b.forLead && b.posW === 1 ? w('battle-lead', [`${A} and ${B} fought over the lead${span}, the lead changing hands ${times(b.leadN || 1)} before ${A} came out in front.`, `Up front, ${A} and ${B} traded the lead ${times(b.leadN || 1)}${span}, ${A} ending up ahead.`, `The battle for the lead between ${A} and ${B}${span} went ${A}’s way in the end, after the lead changed hands ${times(b.leadN || 1)}.`])
      : b.forLead ? w('battle-lead-lost', [`${A} and ${B} fought over the lead${span}, but the fight may have cost them both the win: ${A} finished ${o(b.posW)}${b.posL < 99 ? `, ${B} ${o(b.posL)}` : ''}.`, `${A} and ${B} went toe to toe for first${span}, yet slipped down the order: ${A} ended up ${o(b.posW)}${b.posL < 99 ? ` and ${B} ${o(b.posL)}` : ''}.`, `For a while, ${A} and ${B} were fighting for the win${span}. It didn’t last: ${A} came home ${o(b.posW)}.`])
      : w('battle', [`${A} and ${B} had a great battle${span}, ${A} coming out on top${where}.`, `The fight of the race was ${A} against ${B}${span}, and ${A} had the last word${where}.`, `${B} and ${A} went at it wheel to wheel${span} before ${A} made it stick${where}.`, `${A} and ${B} put on a show${span}; ${A} finished ahead${where}.`, `${A} and ${B} could not shake each other off${span}, ${A} ahead at the end${where}.`, `Lap after lap, ${A} and ${B} fought it out${span} before ${A} came out in front${where}.`]);
    if (duelsNow.has(k)) t += ' ' + w('duel-born', ['They had gone wheel to wheel in each of the last two races too, and we can’t wait for the next round.', 'It’s becoming a habit: a third race running with these two at it.', 'Another fight between them, and already we’re looking forward to the next one.']);
    else if (duelsOn.has(k)) t += ' ' + w('duel-on', ['The two rivals battled on track once more.', 'These two just keep finding each other.', 'Another chapter between two drivers who never give an inch to each other.']);
    add('battle', 3.5 + Math.min(4, (b.n - 8) / 2) + (b.forLead ? 4 : b.posW <= 5 ? 2 : 0) + (duelsNow.has(k) ? 3 : 0) + (isC(b.a) || isC(b.b) ? 2 : 0) + ([b.a, b.b].some(mine) ? 1.5 : 0), t, [b.a, b.b]);
  }
  // great drives: the climbers (the winner's climb belongs to the winner's line)
  for (const x of F.climbers.filter(x => x.d !== F.W).slice(0, 2)) {
    add('climber', 1.5 + x.g / 3 + (x.to <= 3 ? 3 : x.to <= 10 ? 1 : 0) + (mine(x.d) ? 1.5 : 0), w('climber', [`${L(x.d)} charged from ${o(x.from)} on the grid to ${o(x.to)}.`, `${L(x.d)} made up ${pw(x.g, 'place')}, ${o(x.from)} to ${o(x.to)}.`, x.to <= 10 ? `${L(x.d)} started ${o(x.from)} and still scored, finishing ${o(x.to)}.` : `${L(x.d)} gained ${pw(x.g, 'place')} on the day, though ${o(x.to)} was still out of the points.`, `${L(x.d)} quietly worked through from ${o(x.from)} to ${o(x.to)}.`, `Up from ${o(x.from)} to ${o(x.to)}: a fine afternoon’s work by ${L(x.d)}.`, `A storming drive took ${L(x.d)} from ${o(x.from)} to ${o(x.to)}.`, `${L(x.d)} was the climber of the day, starting ${o(x.from)} and finishing ${o(x.to)}.`, `From ${o(x.from)} on the grid, ${L(x.d)} carved through to ${o(x.to)}.`]), [x.d]);
  }
  for (const d of F.firstPods) add('firstpod', 6, w('firstpod', [`${L(d)} took a first career podium in ${o(num(d))}.`, `There was a maiden podium for ${L(d)}.`, `${L(d)} stood on a Formula 1 podium for the first time.`, `${o(num(d))[0].toUpperCase() + o(num(d)).slice(1)} meant a first trip to the podium for ${L(d)}.`]), [d]);
  // pole that came to nothing
  if (F.pole && F.pole !== F.W) {
    const p = F.pos(F.pole);
    if (out_(F.pole) && !ended.has(F.pole)) { ended.add(F.pole); add('pole', 4, w('pole-out', [`Pole-sitter ${L(F.pole)} retired.`, `${L(F.pole)} started from pole but did not see the flag.`, `Pole came to nothing for ${L(F.pole)}, out of the race.`]), [F.pole]); }
    else if (num(F.pole) >= 4) add('pole', 3, w('pole-lost', [`${L(F.pole)} could only turn pole into ${o(p)}.`, `Pole-sitter ${L(F.pole)} slipped back to ${o(p)}.`, `${L(F.pole)} started at the front but finished ${o(p)}.`]), [F.pole]);
  }
  // retirements: a title contender's is a story; so is a race that ate cars
  for (const d of F.dnfs.filter(d => !ended.has(d))) {
    if (isC(d)) add('dnf', 6.5, w('dnf-c', [`${L(d)} retired, a heavy blow to the title bid.`, `A retirement for ${L(d)} was a costly zero in the title race.`, `${L(d)} failed to finish, and the championship picture shifted with it.`]), [d]);
    else if (mine(d)) add('dnf', 3.5, w('dnf-m', [`${L(d)} retired.`, `${L(d)}’s race ended early.`, `It was a retirement for ${L(d)}.`]), [d]);
  }
  if (F.dnfs.length >= 4) add('dnf', 3, w('attrition', [`It was a race of attrition: ${F.dnfs.length} cars failed to finish.`, `${F.dnfs.length} drivers retired, ${listJoin(F.dnfs.slice(0, 4).map(L))} among them.`, `Only ${F.fin.length} cars made it to the flag.`]));
  // the sprint
  if (F.sprW) {
    if (F.sprW === F.W) add('sprint', 4, w('spr-dbl', [`It completed a sprint and Grand Prix double for ${L(F.W)}.`, `${L(F.W)} had won the sprint too, for a perfect weekend.`, `Add the sprint win, and it was ${L(F.W)}’s weekend from start to finish.`]), [F.W]);
    else add('sprint', 2, w('spr', [`${L(F.sprW)} had taken the sprint.`, `The sprint had gone to ${L(F.sprW)}.`, `${L(F.sprW)} won the sprint the day before.`]), [F.sprW]);
  }
  // the fans' standout, when it wasn't the winner
  if (F.dotd && F.dotd.id !== F.W && F.dotd.rating >= 9) add('dotd', 3.5, w('dotd', [`${L(F.dotd.id)}’s drive to ${o(F.dotd.finish)} was rated the best of the day.`, `Fans voted ${L(F.dotd.id)} Driver of the Day for the run to ${o(F.dotd.finish)}.`, `The drive of the day was ${L(F.dotd.id)}’s, to ${o(F.dotd.finish)}.`]), [F.dotd.id]);
  // you, when you're not already in the story
  const pp = F.pos(PLAYER);
  if (pp && ![F.W, F.P2, F.P3].includes(PLAYER) && !out.some(b => b.ids.includes(PLAYER))) {
    if (typeof pp === 'number') add('player', pp <= 10 ? 3 : 1.5, pp <= 10 ? w('player', [`${L(PLAYER)} came home ${o(pp)}.`, `${L(PLAYER)} took ${o(pp)} for ${F.team(PLAYER)?.name || 'the team'}.`, `${o(pp)[0].toUpperCase() + o(pp).slice(1)} for ${L(PLAYER)}.`, `${L(PLAYER)} brought it home in ${o(pp)}.`]) : w('player-out', [`${L(PLAYER)} finished ${o(pp)}, outside the points.`, `${L(PLAYER)} could only manage ${o(pp)}.`]), [PLAYER]);
    else if (!ended.has(PLAYER)) add('player', 3.5, w('player-dnf', [`${L(PLAYER)} retired.`, `${L(PLAYER)}’s race ended early.`]), [PLAYER]);
  }
  return out;
}
/** How the race unfolded, for the race report: the start, safety cars, incidents, battles and the big climbs. */
function raceNarrative(F, L, rnd, opts) {
  const w = phrasebook(rnd);
  const B = raceBeats(F, w, L, opts);
  const take = (tag, n, min = 0) => B.filter(b => b.tag === tag && b.w >= min).sort((a, b) => b.w - a.w).slice(0, n);
  const parts = [...take('lap1', 1), ...take('safety', 1), ...take('incident', 3, 3.5), ...take('battle', 2), ...take('climber', 2), ...take('firstpod', 2)];
  return parts.map(b => b.text).join(' ');
}
