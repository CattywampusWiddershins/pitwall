/* Pitwall — The season review and auto-filled laps. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* --------------------------------------------------------- season review */
// The season told race by race, once every round is in. Each race gets a lead line about the winner (a first win, a
// climb from far back, a streak, a one-two, a close finish or a rout) and then the two or three things that mattered
// most that day, by weight: the title changing hands or being settled, contenders retiring, big incidents, battles,
// great drives, first podiums. The races are grouped into chapters named after what happened in them, and the piece
// opens on what kind of season it was and closes with the numbers, the battles of the year and your own season.
const _reviewCache = new WeakMap();
function seasonReview(c, s) {
  const rounds = activeRounds(s); const N = rounds.length;
  if (!N || roundsDone(s) < N) return null;
  let v = _reviewCache.get(s); if (v && v.gen === renderGen) return v.rv;
  const rv = buildSeasonReview(c, s, rounds);
  _reviewCache.set(s, { gen: renderGen, rv });
  return rv;
}
function buildSeasonReview(c, s, rounds) {
  const N = rounds.length; const rnd = seeded(`${s.index}-${s.year}-review`); const w = phrasebook(rnd);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const full = (id) => dName(s, id);
  const facts = rounds.map((r, i) => raceFacts(c, s, i));
  const F0 = facts.filter(Boolean); if (!F0.length) return null;
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st);
  const champ = ds[0], run = ds[1]; const C = champ.id;
  const dec = titleDecision(s, 'driver');
  const champTeam = teamOf(s, C);
  const year = s.year;
  // the shape of the season
  const leaders = F0.map(F => F.dA.rows[0]?.id);
  const changes = F0.filter(F => F.title.change).length;
  const leaderSet = [...new Set(leaders)];
  const winners = F0.map(F => F.W); const winSet = [...new Set(winners)];
  const poleSet = [...new Set(F0.map(F => F.pole).filter(Boolean))];
  let maxDef = 0, defAt = null;
  for (const F of F0) { const row = F.dA.rows.find(x => x.id === C); const gap = (F.dA.rows[0]?.pts || 0) - (row?.pts || 0); if (F.i >= 2 && gap > maxDef) { maxDef = gap; defAt = F; } }
  const titles = (C === PLAYER_ID ? 0 : (D.DRIVER_BIO[C]?.titles?.length || 0)) + c.seasons.slice(0, s.index).filter(se => roundsDone(se) === activeRounds(se).length && driverStandings(se)[0]?.id === C).length + 1;
  const prev = c.seasons[s.index - 1];
  const defending = prev && roundsDone(prev) === activeRounds(prev).length ? driverStandings(prev)[0]?.id : Object.entries(D.DRIVER_BIO).find(([, b]) => b.titles?.includes(year - 1))?.[0];
  const final = !!dec?.final, spare = dec ? dec.m.left.length : 0;
  const dominant = champ.wins >= N * 0.5 && champ.pts - run.pts >= 60;
  const character = final ? 'decider' : maxDef >= 30 ? 'comeback' : dominant ? 'dominant' : titles === 1 && !isHist(s) ? 'first' : winSet.length >= 6 ? 'open' : defending === C ? 'repeat' : 'plain';
  const headline = w('h-' + character, {
    decider: [`Down to the wire: the ${year} season in review`, `${year} reviewed: the title that went to the last race`, `One race to decide it all: ${year}, race by race`, `How ${L(C)} won the ${year} title at the death`],
    comeback: [`From ${maxDef} points down: the ${year} season in review`, `${year} reviewed: ${L(C)}’s great comeback`, `The fightback: how ${L(C)} turned ${year} around`],
    dominant: [`Untouchable: ${L(C)}’s ${year}, race by race`, `${year} in review: the season ${L(C)} made their own`, `${champ.wins} wins and a title: ${year} reviewed`, `The ${year} season, and the year nobody could stop ${L(C)}`],
    first: [`${L(C)}’s breakthrough year: ${year} in review`, `A new champion: the ${year} season race by race`, `${year} reviewed: how ${L(C)} became world champion`],
    open: [`${winSet.length} winners, one champion: the ${year} season reviewed`, `${year} in review: anybody’s season, ${L(C)}’s title`, `The year everyone won: ${year}, race by race`],
    repeat: [`${L(C)} again: the ${year} season in review`, `${year} reviewed: ${L(C)} defends the crown`, `Back-to-back: how ${L(C)} won ${year} too`],
    plain: [`The ${year} season, race by race`, `${year} in review: every Grand Prix, every twist`, `Race by race: how ${year} unfolded`, `The story of ${year}`],
  }[character]);
  const standfirst = w('sf', [`All ${N} rounds of the ${year} season, one by one: the wins, the flashpoints, the battles and how the title was won.`, `From ${rounds[0].name} to ${rounds[N - 1].name}: every race of ${year}, and what each one meant.`, `${N} Grands Prix, ${winSet.length === 1 ? 'one winner' : `${winSet.length} different winners`} and one champion. This is how ${year} played out.`]);
  // the opening: what kind of season it was
  const intro = [];
  const shape = [];
  const decGp = dec ? gpThe(dec.r.name) : '';
  if (final) shape.push(w('in-dec', [`The ${year} title went all the way to ${decGp}, the last race of the year.`, `It took until the very last race, in ${decGp}, to settle the ${year} championship.`, `Nobody knew who would be champion until the flag fell in ${decGp}.`]));
  else if (spare >= 3) shape.push(w('in-early', [`${L(C)} had the title wrapped up in ${decGp}, with ${pw(spare, 'round')} still to run.`, `The championship was settled early: ${decGp}, ${pw(spare, 'race')} before the end.`]));
  else if (dec) shape.push(w('in-late', [`The title was decided in ${decGp}, with ${pw(spare, 'round')} to go.`, `It went late: ${cap(decGp)} settled it, ${pw(spare, 'race')} from the end.`]));
  if (leaderSet.length === 1) shape.push(w('in-wire', [`${L(C)} led the championship from the first race to the last.`, `${L(C)} was top of the standings after every single round.`]));
  else if (changes >= 3) shape.push(w('in-swaps', [`The lead changed hands ${nw(changes)} times between ${listJoin(leaderSet.map(L))}.`, `${listJoin(leaderSet.map(L))} all led the championship at some point, and the lead changed ${nw(changes)} times.`]));
  else if (changes) shape.push(w('in-swap', [`${listJoin(leaderSet.map(L))} took turns at the top of the table.`, `The championship lead changed hands ${changes === 1 ? 'once' : 'twice'}.`]));
  if (character === 'comeback' && defAt) shape.push(w('in-cb', [`After ${defAt.gp}, ${L(C)} was ${maxDef} points behind ${L(defAt.dA.rows[0].id)}. It didn’t matter in the end.`, `${L(C)} was ${maxDef} points down after ${defAt.gp}, and still came back to win it.`]));
  if (winSet.length === 1) shape.push(`${L(winSet[0])} won every single race.`);
  else shape.push(w('in-win', [`${numWord(winSet.length)[0].toUpperCase() + numWord(winSet.length).slice(1)} different drivers won Grands Prix${winSet.length >= 6 ? ', and on any given Sunday it could have been almost anyone' : ''}.`, `There were ${numWord(winSet.length)} different winners${poleSet.length ? ` and ${numWord(poleSet.length)} different pole-sitters` : ''}.`]));
  intro.push(shape.join(' '));
  intro.push(`${full(C)} took ${titles === 1 ? 'a first world title' : `a ${ordWord(titles)} world title`}${champTeam ? ` for ${champTeam.name}` : ''}${defending === C ? ', defending the crown' : ''}: ${plural(champ.wins, 'win')}, ${plural(champ.podiums, 'podium')} and ${plural(champ.poles, 'pole')} from ${plural(N, 'round')}, and ${plural(champ.pts, 'point')}, ${champ.pts - run.pts ? `${plural(champ.pts - run.pts, 'point')} clear of ${full(run.id)}` : `level with ${full(run.id)} and ahead on countback`}.`);
  if (cs[0]) intro.push(cs[0].team.id === champTeam?.id
    ? w('in-dbl', [`${cs[0].team.name} completed the double, taking the constructors’ title by ${plural(cs[0].pts - (cs[1]?.pts || 0), 'point')} from ${cs[1]?.team.name}.`, `It was a double for ${cs[0].team.name}: the constructors’ championship came too, ${plural(cs[0].pts - (cs[1]?.pts || 0), 'point')} ahead of ${cs[1]?.team.name}.`])
    : w('in-cc', [`The constructors’ title went elsewhere: ${cs[0].team.name} took it, ${plural(cs[0].pts - (cs[1]?.pts || 0), 'point')} clear of ${cs[1]?.team.name}.`, `${cs[0].team.name} won the constructors’ championship on ${cs[0].pts} points, the stronger pairing over the season.`]));

  // the wheel-to-wheel rivalries, so a race can say when one was born
  const DU = duels(s);
  const bornAt = (i) => new Set(DU.events.filter(e => e.type === 'duelStart' && e.i === i && e.key === 'R').map(e => pairKey(e.a, e.b)));
  const onAt = (i) => new Set(duelsAt(s, i - 1).map(x => pairKey(x.a, x.b)));

  // each race: the lead line, then what mattered
  const lead = (F) => {
    const W = L(F.W), P2 = F.P2 && L(F.P2), P3 = F.P3 && L(F.P3), gp = F.gp, GP = cap(F.gp); const tn = F.team(F.W)?.name || '';
    const from = F.gpos(F.W); const gap = F.gap2;
    const pod = P2 && P3 ? w('pod', [`, ahead of ${P2} and ${P3}`, `, from ${P2} and ${P3}`, `, with ${P2} and ${P3} completing the podium`, '', '']) : '';
    if (F.latePass) { const LP = F.latePass; const P0 = L(LP.prev); return LP.left === 0
      ? w('w-lastlap', [`${GP} was won on the last lap: ${W} got past ${P0} for the lead and took the flag.`, `${W} stole ${gp} from ${P0} on the very last lap.`, `Last lap, last chance: ${W} passed ${P0} to win ${gp}.`])
      : w('w-late', [`${W} won ${gp} with a late pass on ${P0}, taking the lead on lap ${LP.lap} of ${LP.N}${LP.fight >= 3 ? ` after ${nw(LP.fight)} passes between them` : ''}.`, `With ${pw(LP.left + 1, 'lap')} to go in ${gp}, ${W} passed ${P0} for the lead, and the win.`, `${P0} looked set to win ${gp} until lap ${LP.lap}, when ${W} found a way past.`]); }
    if (F.firstWin) return w('w-first', [`${GP} belonged to ${W}, who finally broke through for a first Grand Prix win.`, `${W} became a Grand Prix winner for the first time in ${gp}${pod}.`, `A first career win for ${W} made ${gp} a day to remember for ${tn}.`, `${W} took a long-awaited maiden victory in ${gp}${pod}.`]);
    if (from >= 10) return w('w-back', [`${W} won ${gp} from ${ordWord(from)} on the grid, picking off the cars ahead one by one.`, `${GP} was a comeback for the ages: ${W} went from ${ordWord(from)} to the top step.`, `Few gave ${W} a chance from ${ordWord(from)} on the grid in ${gp}, but the win came all the same.`, `From ${ordWord(from)} to first: ${W}’s drive in ${gp} will be remembered for years.`]);
    if (from >= 5) return w('w-up', [`Starting ${ordWord(from)}, ${W} still found a way to win ${gp}${pod}.`, `${W} came from ${ordWord(from)} on the grid to win ${gp}.`, `${W} worked forward from ${ordWord(from)} and took the win in ${gp}${pod}.`, `${ordWord(from)[0].toUpperCase() + ordWord(from).slice(1)} on the grid, first at the flag: ${W} in ${gp}.`]);
    if (F.i === 0) return w('w-open', [`The season opened in ${gp} with victory for ${W}${pod}.`, `${W} drew first blood in ${gp}${pod}.`, `${GP} kicked the year off, and ${W} won it${pod}.`, `${W} started the season the way everyone else wanted to: with a win, in ${gp}${pod}.`]);
    if (F.oneTwo) return w('w-12', [`${tn} locked out the top two in ${gp}, ${W} leading ${P2} home.`, `A ${tn} one-two in ${gp}, with ${W} ahead of ${P2}.`, `${GP} was a ${tn} party: ${W} won, ${P2} was second.`, `${tn} were in a class of their own in ${gp}: ${W} first, ${P2} second.`]);
    if (F.streak >= 3) return w('w-run', [`${W} made it ${nw(F.streak)} wins in a row in ${gp}.`, `The winning run went on in ${gp}: ${numWord(F.streak)} straight for ${W}.`, `${GP} brought win number ${F.streak} on the bounce for ${W}.`, `${W} kept on winning: ${gp} made it ${numWord(F.streak)} in a row.`]);
    if (F.streak === 2 && rnd() < 0.6) return w('w-run2', [`${W} made it back-to-back wins in ${gp}${pod}.`, `${W} followed it up with another win in ${gp}${pod}.`, `Two in a row for ${W}, this time in ${gp}.`]);
    if (gap != null && gap < 1) return w('w-close', [`${W} held off ${P2} by just ${gap.toFixed(3)}s in ${gp}.`, `${GP} went to the wire, ${W} beating ${P2} by ${gap.toFixed(3)} seconds.`, `${W} survived a late charge from ${P2} to win ${gp} by ${gap.toFixed(3)}s.`, `Only ${gap.toFixed(3)} seconds covered ${W} and ${P2} at the flag in ${gp}.`]);
    if (gap != null && gap >= 10) return w('w-dom', [`${W} was in a race of one in ${gp}, winning by ${gap.toFixed(1)}s.`, `${GP} was a demolition job: ${W} won by ${gap.toFixed(1)} seconds.`, `Nobody could live with ${W} in ${gp}; the margin at the flag was ${gap.toFixed(1)}s.`, `${W} cruised to victory in ${gp}, ${gap.toFixed(1)} seconds clear of ${P2}.`]);
    if (F.i === N - 1) return w('w-fin', [`The finale in ${gp} went to ${W}${pod}.`, `${W} signed off the year with victory in ${gp}${pod}.`, `${W} won the last race of the year, in ${gp}${pod}.`]);
    if (F.pole === F.W) return w('w-pole', [`${W} converted pole into victory in ${gp}${pod}.`, `Lights to flag in ${gp}: ${W} led from pole.`, `From pole, ${W} controlled ${gp}${pod}.`]);
    return w('w', [`${W} won ${gp}${pod}.`, `Victory in ${gp} went to ${W}${pod}.`, `${GP} fell to ${W}${pod}.`, `${W} took the honours in ${gp}${pod}.`, `${W} was the class of the field in ${gp}${pod}.`, `${GP} was ${W}’s day${pod}.`, `${W} got the job done in ${gp}${pod}.`, `It was ${W} who stood on the top step in ${gp}${pod}.`, `${W} had the measure of everyone in ${gp}${pod}.`, `${W} timed it right in ${gp} and won${pod}.`]);
  };
  const titleBeats = (F) => {
    const out = []; const A0 = F.dA.rows[0], A1 = F.dA.rows[1]; const T = F.title;
    if (T.decided) out.push({ tag: 'title', w: 12, text: F.dA.left.length
      ? w('t-dec', [`That settled the title: ${L(A0.id)} was world champion with ${pw(F.dA.left.length, 'round')} to spare.`, `${L(A0.id)} sealed the championship there and then, ${pw(F.dA.left.length, 'race')} early.`, `And with that, the ${year} title belonged to ${L(A0.id)}.`])
      : w('t-decF', [`${L(A0.id)} left as world champion, the title decided at the very last race.`, `It was enough: ${L(A0.id)} was champion, by ${plural(F.dA.margin, 'point')}.`, `The title, at the last, went to ${L(A0.id)}.`]) });
    else if (T.change) out.push({ tag: 'title', w: 8, text: w('t-chg', [`The result put ${L(A0.id)} top of the standings${F.dA.margin ? `, ${plural(F.dA.margin, 'point')} clear` : ', level on points'}.`, `${L(F.dB.rows[0].id)} lost the championship lead to ${L(A0.id)}.`, `${L(A0.id)} took over at the top of the championship.`, `It was enough to lift ${L(A0.id)} into the championship lead.`]) });
    else if (F.i > 0 && A1 && !F.dB.decided) {
      const d = F.dA.margin - F.dB.margin;
      if (d <= -10) out.push({ tag: 'title', w: 4 + Math.min(3, -d / 8), text: w('t-cut', [`${L(A1.id)} cut the gap at the top to ${plural(F.dA.margin, 'point')}.`, `${L(A0.id)}’s lead was down to ${plural(F.dA.margin, 'point')}.`, `The margin at the top shrank to ${plural(F.dA.margin, 'point')}.`]) });
      else if (d >= 15) out.push({ tag: 'title', w: 3.5 + Math.min(2.5, d / 15), text: w('t-grow', [`${L(A0.id)} stretched the championship lead to ${plural(F.dA.margin, 'point')}.`, `The gap to ${L(A1.id)} grew to ${plural(F.dA.margin, 'point')}.`, `It pushed ${L(A0.id)}’s lead out to ${plural(F.dA.margin, 'point')}.`]) });
    }
    if (T.out.length) { const nm = listJoin(T.out.map(L)); out.push({ tag: 'title', w: 6, text: w('t-out', [`It ended ${nm}’s title hopes.`, `${nm} ${T.out.length > 1 ? 'were' : 'was'} now mathematically out of the running.`, `For ${nm}, the title was gone.`]) }); }
    if (T.teamDecided) out.push({ tag: 'title', w: 7, text: w('t-tdec', [`${F.tA.rows[0].name} wrapped up the constructors’ championship.`, `The constructors’ title was ${F.tA.rows[0].name}’s.`, `${F.tA.rows[0].name} clinched the teams’ title.`]) });
    else if (T.teamChange) out.push({ tag: 'title', w: 4, text: w('t-tchg', [`${F.tA.rows[0].name} took over at the top of the constructors’ table.`, `In the constructors’ race, ${F.tA.rows[0].name} moved to the front.`]) });
    return out;
  };
  const ORDER = ['lap1', 'safety', 'incident', 'battle', 'climber', 'firstpod', 'pole', 'dnf', 'sprint', 'dotd', 'player', 'title'];
  const raceText = (F) => {
    const cands = [...raceBeats(F, w, L, { duelsNow: bornAt(F.i), duelsOn: onAt(F.i) }), ...titleBeats(F)].map(b => ({ ...b, score: b.w + rnd() * 1.5 }));
    cands.sort((a, b) => b.score - a.score);
    const pick = []; const per = {};
    for (const b of cands) {
      if (pick.length >= 3) break;
      if (b.w < 3 && pick.length >= 1) continue;
      if ((per[b.tag] = (per[b.tag] || 0) + 1) > (b.tag === 'title' ? 2 : 1)) continue;
      pick.push(b);
    }
    pick.sort((a, b) => ORDER.indexOf(a.tag) - ORDER.indexOf(b.tag));
    return [lead(F), ...pick.map(b => b.text)].join(' ');
  };

  // chapters: quarters of the season (thirds or halves for a short one), the final race on its own if it decided the title
  const k = N <= 6 ? 2 : N <= 12 ? 3 : 4;
  const cuts = Array.from({ length: k + 1 }, (_, j) => Math.round(N * j / k));
  const segs = [];
  for (let j = 0; j < k; j++) segs.push([cuts[j], cuts[j + 1]]);
  if (final && N >= 8) { segs[segs.length - 1][1] = N - 1; segs.push([N - 1, N]); }
  const decI = dec?.i ?? -1;
  const chapters = segs.filter(([a, b]) => b > a).map(([a, b], j, all) => {
    const Fs = facts.slice(a, b).filter(Boolean); if (!Fs.length) return null;
    const first = Fs[0], lastF = Fs[Fs.length - 1];
    const wins = {}; for (const F of Fs) wins[F.W] = (wins[F.W] || 0) + 1;
    const [top, topWins] = Object.entries(wins).sort((x, y) => y[1] - x[1])[0];
    const leadB = first.i ? first.dB.rows[0]?.id : null, leadA = lastF.dA.rows[0]?.id, second = lastF.dA.rows[1]?.id;
    const mB = first.i ? first.dB.margin : 0, mA = lastF.dA.margin;
    const isLast = j === all.length - 1;
    let title;
    if (final && isLast && b - a === 1 && N >= 8) title = w('ch-final', ['The decider', 'Down to the wire', 'One race, one title', `Showdown in ${first.gp}`]);
    else if (decI >= a && decI < b) title = w('ch-dec', [`${L(C)} closes it out`, 'Sealing the deal', `${L(C)} gets it done`, 'Mission accomplished']);
    else if (isLast && decI >= 0 && decI < a) title = w('ch-after', ['Playing for pride', 'After the title', 'The final act', 'Lap of honour']);
    else if (isLast) title = w('ch-runin', ['The run-in', 'The final stretch', 'Into the closing rounds', 'Crunch time']);
    else if (j === 0) title = topWins >= 2 && top === leadA ? w('ch-open-dom', [`${L(top)} sets the pace`, `A flying start for ${L(top)}`, `${L(top)} out of the blocks`])
      : Object.keys(wins).length >= 3 ? w('ch-open-mix', ['An open start', 'Everyone gets a turn', 'No clear favourite']) : w('ch-open', ['The opening rounds', 'Early skirmishes', 'First impressions']);
    else if (leadB && leadA !== leadB) title = w('ch-swap', [`${L(leadA)} takes charge`, 'A change at the top', `${L(leadA)} hits the front`]);
    else if (topWins >= 3) title = w('ch-roll', [`${L(top)} on a roll`, `The ${L(top)} show`, `${L(top)} hits form`]);
    else if (mA <= 10) title = w('ch-close', ['Neck and neck', 'Nothing in it', 'Trading blows']);
    else if (mA - mB >= 20) title = w('ch-clear', [`${L(leadA)} pulls clear`, `${L(leadA)} tightens the grip`, 'Daylight at the top']);
    else if (mA <= mB - 15) title = w('ch-back', ['The fightback', `${L(second)} hits back`, 'The gap comes down']);
    else title = w('ch-mid', ['The middle of the season', 'Midseason', 'Settling in', 'The long middle stretch']);
    const decided = decI >= 0 && decI < b;
    const close = isLast ? '' : decided ? '' : mA ? w('ch-cl', [`After ${lastF.gp}, ${L(leadA)} led ${L(second)} by ${plural(mA, 'point')}.`, `That left ${L(leadA)} ${plural(mA, 'point')} clear of ${L(second)}.`, `The standings after ${lastF.gp}: ${L(leadA)} on ${lastF.dA.rows[0].pts}, ${L(second)} on ${lastF.dA.rows[1].pts}.`])
      : `After ${lastF.gp}, ${L(leadA)} and ${L(second)} were level on points.`;
    return { title, sub: b - a === 1 ? `Round ${a + 1}` : `Rounds ${a + 1}–${b}`, items: Fs.map(F => {
      const SD = final && F.i === decI ? showdownTold(c, s, F.i, L, w) : null;
      return SD ? { ri: F.i, label: `R${F.i + 1} · ${F.r.name} · the decider`, text: lead(F), paras: [SD.scene, SD.needs.join(' '), SD.race.join(' '), SD.outcome], chart: SD.chart }
        : { ri: F.i, label: `R${F.i + 1} · ${F.r.name}`, text: raceText(F) };
    }), close };
  }).filter(Boolean);

  // the numbers, the battles and the flashpoints
  const lists = [];
  const ids = Object.keys(st).filter(id => s.drivers[id] && st[id].starts);
  const best = (fn) => ids.map(id => ({ id, v: fn(id) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0] || null;
  const nums = [];
  const mw = best(id => st[id].wins); if (mw) nums.push({ id: mw.id, text: `Most wins: ${full(mw.id)}, ${mw.v}` });
  const mp = best(id => st[id].poles); if (mp) nums.push({ id: mp.id, text: `Most poles: ${full(mp.id)}, ${mp.v}` });
  const mpo = best(id => st[id].podiums); if (mpo) nums.push({ id: mpo.id, text: `Most podiums: ${full(mpo.id)}, ${mpo.v}` });
  const made = {}, atFault = {};
  for (const F of F0) { if (F.passes) for (const [d, n] of Object.entries(F.passes.made)) made[d] = (made[d] || 0) + n; for (const inc of F.incidents) if (!inc.noFault) atFault[inc.a] = (atFault[inc.a] || 0) + 1; }
  const mo = Object.entries(made).sort((a, b) => b[1] - a[1])[0]; if (mo) nums.push({ id: mo[0], text: `Most overtakes: ${full(mo[0])}, ${mo[1]}` });
  const climb = {}; for (const F of F0) for (const x of F.climbers) climb[x.d] = (climb[x.d] || 0) + x.g;
  const mc = Object.entries(climb).sort((a, b) => b[1] - a[1])[0]; if (mc) nums.push({ id: mc[0], text: `Places made up in big climbs: ${full(mc[0])}, ${mc[1]}` });
  const md = best(id => st[id].dnfs); if (md && md.v >= 2) nums.push({ id: md.id, text: `Most retirements: ${full(md.id)}, ${md.v}` });
  const mf = Object.entries(atFault).sort((a, b) => b[1] - a[1])[0]; if (mf && mf[1] >= 2) nums.push({ id: mf[0], text: `Most incidents at fault: ${full(mf[0])}, ${mf[1]}` });
  nums.push({ text: `${plural(winSet.length, 'different winner')}${poleSet.length ? `, ${plural(poleSet.length, 'different pole-sitter')}` : ''}${changes ? `, ${changes} changes of championship leader` : ''}` });
  lists.push({ title: 'By the numbers', items: nums });
  const fights = [];
  for (const e of DU.events.filter(e => e.type === 'duelStart')) {
    const end = DU.events.find(x => x.type === 'duelEnd' && pairKey(x.a, x.b) === pairKey(e.a, e.b) && (x.i > e.i || (x.i === e.i && x.key === 'R' && e.key === 'SPR')));
    const bt = DU.all.filter(b => pairKey(b.a, b.b) === pairKey(e.a, e.b) && b.i >= e.battles[0].i && (!end || b.i <= end.i));
    const sc = bt.reduce((o, b) => { o[b.ahead] = (o[b.ahead] || 0) + 1; return o; }, {}); const ahead = (sc[e.a] || 0) >= (sc[e.b] || 0) ? e.a : e.b;
    const where = [...new Set(bt.map(b => rounds[b.i].name))];
    fights.push({ id: ahead, w: bt.reduce((a, b) => a + b.n, 0), text: `${L(e.a)} v ${L(e.b)}: wheel to wheel in ${bt.length} races (${where.length > 3 ? `${where[0]} to ${where[where.length - 1]}` : listJoin(where)}), ${bt.reduce((a, b) => a + b.n, 0)} passes, ${sc[e.a] === sc[e.b] ? 'honours even' : `${L(ahead)} ahead ${sc[ahead]}–${bt.length - sc[ahead]}`}` });
  }
  for (const b of DU.all.slice().sort((x, y) => y.n - x.n).slice(0, 3)) if (!fights.some(f => f.text.startsWith(`${L(b.a)} v ${L(b.b)}`) || f.text.startsWith(`${L(b.b)} v ${L(b.a)}`)))
    fights.push({ id: b.ahead, w: b.n, text: `${L(b.ahead)} v ${L(b.behind)}, ${rounds[b.i].name}${b.key === 'SPR' ? ' sprint' : ''}: ${b.n} changes of position` });
  if (fights.length) lists.push({ title: 'Battles of the year', items: fights.sort((a, b) => b.w - a.w).slice(0, 5) });

  // the close: Driver of the Season, your season, and next year
  const outro = [];
  const dots = driverOfTheSeason(s);
  if (dots?.final) outro.push(dots.id === C ? w('o-dots', [`${L(C)} was Driver of the Season too, with ${plural(dots.dotd, 'Driver of the Day award')}.`, `The fans agreed: ${L(C)} was also their Driver of the Season.`])
    : w('o-dots2', [`The fans’ Driver of the Season, though, was ${full(dots.id)}, with ${plural(dots.dotd, 'Driver of the Day award')}.`, `Not the champion, but the fans’ pick: ${full(dots.id)} was Driver of the Season.`]));
  if (isPrincipal(c)) {
    const T = cs.find(x => x.team.id === s.playerTeamId);
    const pc = prev ? constructorStandings(prev).find(x => x.team.id === s.playerTeamId)?.pos : null;
    if (T && T.pos !== 1) {
      const dr = ds.filter(x => teamOf(s, x.id)?.id === s.playerTeamId);
      outro.push(w('o-team', [`${T.team.name} finished ${ordWord(T.pos)} in the constructors’ championship with ${plural(T.pts, 'point')}${pc ? (pc > T.pos ? `, up from ${ordWord(pc)} in ${prev.year}` : pc < T.pos ? `, down from ${ordWord(pc)} in ${prev.year}` : `, the same as in ${prev.year}`) : ''}.`, `For ${T.team.name}, ${year} ended ${ordWord(T.pos)} of ${cs.length} teams, on ${plural(T.pts, 'point')}.`])
        + (dr.length ? ` In the drivers’ standings, ${listJoin(dr.map(x => `${full(x.id)} was ${ordWord(x.pos)}`))}.` : ''));
    }
  }
  const me = isPrincipal(c) ? null : ds.find(x => x.id === PLAYER);
  if (me && me.id !== C) {
    const pPrev = prev ? driverStandings(prev).find(x => x.id === PLAYER)?.pos : null;
    const trend = pPrev ? (pPrev > me.pos ? `, up from ${ordWord(pPrev)} in ${prev.year}` : pPrev < me.pos ? `, down from ${ordWord(pPrev)} in ${prev.year}` : `, the same as in ${prev.year}`) : '';
    outro.push(w('o-me', [`${full(PLAYER)} finished ${ordWord(me.pos)} in the championship with ${plural(me.pts, 'point')}${me.wins ? ` and ${plural(me.wins, 'win')}` : me.podiums ? ` and ${plural(me.podiums, 'podium')}` : ''}${trend}.`,
      `For ${full(PLAYER)}, ${year} ended in ${ordWord(me.pos)} place, on ${plural(me.pts, 'point')}${me.wins ? `, with ${plural(me.wins, 'win')}` : ''}${trend}.`]));
  }
  outro.push(w('o-next', [`Roll on ${year + 1}.`, `${L(C)} carries the number one into ${year + 1}. Everyone else has a winter to work out how to stop that.`, `The ${year + 1} season can’t come soon enough.`, champ.wins >= N / 2 ? `The question for ${year + 1} is simple: can anyone stop ${L(C)}?` : `If ${year} is anything to go by, ${year + 1} will be worth watching.`]));
  return { headline, standfirst, intro, chapters, lists, outro, n: N, champ: C };
}
/** The race-by-race part of a season review, as HTML. */
function reviewHtml(c, s, RV) {
  return `<div class="review-body">
    ${RV.chapters.map(ch => `<section class="rv-ch"><h3>${esc(ch.title)} <span class="muted">· ${esc(ch.sub)}</span></h3>
      ${ch.items.map(it => `<p><b class="rv-r">${esc(it.label)}</b> ${esc(it.text)}</p>${(it.paras || []).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}${it.chart || ''}`).join('')}${ch.close ? `<p class="rv-close">${esc(ch.close)}</p>` : ''}</section>`).join('')}
    ${RV.lists.length ? `<div class="grid-2">${RV.lists.map(l => `<div class="story-sec"><h3>${esc(l.title)}</h3><ul class="ms-list">${l.items.map(o => `<li>${o.id ? avatar(c, s, o.id, 24) : ''}<span>${esc(o.text)}</span></li>`).join('')}</ul></div>`).join('')}</div>` : ''}
    ${RV.outro.length ? `<div class="body">${RV.outro.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
  </div>`;
}
/** The battle of a race or sprint as a story of its own: the biggest one, when it was near the front or involved you. */
const BATTLE_QUOTES = {
  won: ['That was some of the best racing I’ve had. Hard, but fair.', 'We went back and forth for laps. I’m glad I came out ahead in the end.', 'Every time I got past, they came straight back. I loved it.', 'You have to respect a fight like that. It made the result feel earned.'],
  lost: ['I gave it everything. It was fun, even if I ended up on the wrong side of it.', 'We were racing hard all afternoon. Next time it goes my way.', 'It was a proper fight. I just didn’t have quite enough at the end.', 'Great racing. A shame about the result, but I enjoyed it.'],
  wonNeedle: ['It got a bit physical at times. I’m glad it’s over.', 'Some of those moves were on the limit. But I came out ahead.'],
  lostNeedle: ['There was contact, and I don’t think it was all on me.', 'They made it very hard. Maybe too hard.'],
};
function battleStory(c, s, i, r, key, sd, h) {
  const B = raceBattles(sd); const b = B?.[0]; if (!b) return null;
  const mine = [b.a, b.b].some(d => d === PLAYER || teamOf(s, d)?.id === s.playerTeamId);
  if (b.posW > 10 && !mine && !b.forLead) return null;
  if (duels(s).events.some(e => e.type === 'duelStart' && e.i === i && e.key === key && pairKey(e.a, e.b) === pairKey(b.a, b.b))) return null; // the rivalry story tells it
  const rnd = seeded(`${s.index}-${r.id}-${key}-battle`); const sprint = key === 'SPR';
  const A = h.last(b.ahead), Bn = h.last(b.behind);
  const touched = (sd.game?.incidents || []).some(x => pairKey(x.a, x.b) === pairKey(b.a, b.b));
  // a fight for the lead that didn't end in the win is told as one that cost them
  const lost = b.forLead && b.posW > 1; const times = (n) => n === 1 ? 'once' : n === 2 ? 'twice' : `${nw(n)} times`;
  const at = b.forLead ? 'for the lead' : b.posW <= 3 ? 'for a podium place' : b.posW <= 10 ? 'for points' : 'deep in the pack';
  const LP = key === 'R' && b.forLead ? lateWinPass(sd, sd.results.find(x => !OUT.includes(x.st))?.d) : null; const late = LP && pairKey(LP.prev, b.ahead) === pairKey(b.a, b.b);
  return { id: `${s.index}-${r.id}${key}battle`, seq: i * 10 + (sprint ? 2 : 4) + 0.4, kind: 'battle', i, r, replay: { k: key, lap: b.from, ds: [b.ahead, b.behind] }, subject: b.ahead === PLAYER ? b.behind : b.ahead, outlet: choose(rnd, D.OUTLETS), kicker: b.forLead && !lost ? (sprint ? 'Battle for the sprint win' : 'Battle for the win') : lost ? (sprint ? 'Battle of the sprint' : 'Battle of the race') : sprint ? 'Battle of the sprint' : 'Battle of the race', massive: !!late,
    headline: lost ? choose(rnd, [`${A} and ${Bn} fight for the lead, and both lose out`, `Did ${A} and ${Bn} fight each other out of the win?`]) : choose(rnd, [`${A} v ${Bn}: a fight ${at}`, `${A} and ${Bn} light up ${r.name}${sprint ? ' sprint' : ''}`, `Wheel to wheel: ${A} beats ${Bn}`, `${A} edges ${Bn} in a great battle ${at}`]),
    standfirst: `${b.forLead ? `${A} and ${Bn} fought ${at}${b.to > b.from ? ` between laps ${b.from} and ${b.to}` : ` on lap ${b.from}`}, the lead changing hands ${times(b.leadN || 1)}${lost ? ', but the fight may have cost them both the win' : ''}.` : `${A} and ${Bn} had a great battle ${b.to > b.from ? `between laps ${b.from} and ${b.to}` : `on lap ${b.from}`} ${at}.`} ${A} finished ${OUT.includes(sd.results.find(x => x.d === b.ahead)?.st) ? 'ahead' : ordWord(b.posW)}, ${Bn} ${b.posL < 99 ? ordWord(b.posL) : 'did not finish'}.`,
    body: touched ? ['It wasn’t all clean: the two made contact along the way.'] : [],
    quotes: [[b.ahead, touched ? 'wonNeedle' : 'won'], [b.behind, touched ? 'lostNeedle' : 'lost']].filter(([d]) => d !== PLAYER).map(([d, k]) => ({ id: d, text: choose(rnd, BATTLE_QUOTES[k]) })) };
}

function buildStories(c, s) {
  const out = [];
  const rounds = activeRounds(s);
  const nr = nextRound(s); const nri = nr ? rounds.indexOf(nr) : rounds.length;
  const name = (id) => dName(s, id);
  const last = (id) => id === PLAYER_ID ? c.profile.last : lastName(name(id));
  const tName = (id) => teamOf(s, id)?.name || '';
  const outletFor = (rnd) => choose(rnd, D.OUTLETS);
  const prevWins = (id) => (D.DRIVER_BIO[id]?.wins || 0) + c.seasons.slice(0, s.index).reduce((a, se) => a + (seasonStatsCache(se)[id]?.wins || 0), 0);
  for (let i = 0; i < rounds.length && i <= nri; i++) {
    const r = rounds[i]; const ses = s.weekends[r.id]?.sessions || {};
    const gp = r.name; const rid = `${s.index}-${r.id}`;
    const mem = raceMemory(c, s, i);
    // title deciders ahead of the weekend
    // A sprint weekend has two: before the sprint, only when the title can be won in the sprint itself; after it, the
    // race's (the standings with the sprint's points in), unless the sprint settled it.
    for (const kind of ['driver', 'team']) for (const { m, P, stage } of (() => {
      const out2 = [];
      if (r.sprint) {
        const pre = titleMath(s, kind, i);
        if (!pre.decided && pre.left[0]?.i === i && pre.left[0].spr) { const SP = sprintPerms(pre); if (SP?.clinch.length) out2.push({ m: pre, P: SP, stage: 'sprint' }); }
        if (ses.SPR?.done) { const post = titleMath(s, kind, i, { afterSprint: true }); if (!post.decided && post.left[0]?.i === i) { const RP = roundPerms(post); if (RP?.clinch.length) out2.push({ m: post, P: RP, stage: 'race' }); } }
      } else {
        const m0 = i === nri ? titleMath(s, kind) : titleMath(s, kind, i);
        if (!m0.decided && m0.left[0]?.i === i) { const P0 = roundPerms(m0); if (P0?.clinch.length) out2.push({ m: m0, P: P0, stage: '' }); }
      }
      return out2;
    })()) {
      const rnd = seeded(rid + kind + 'pre' + stage);
      const L = m.rows[0], R2 = m.rows[1];
      const solo = P.clinch.length === 1 ? P.clinch[0].x : null;
      const who = (x) => kind === 'team' ? x.name : last(x.id);
      // the last race with more than one contender left is an event of its own
      const alive = m.rows.filter(x => x.alive);
      const showdown = m.left.length === 1 && alive.length >= 2;
      const showHead = !showdown ? null : alive.length >= 3
        ? `${numWord(alive.length)[0].toUpperCase() + numWord(alive.length).slice(1)} ${kind === 'team' ? 'teams' : 'drivers'}, one title: the ${gp} showdown`
        : `${who(alive[0])} v ${who(alive[1])}: the ${kind === 'team' ? 'constructors’ title' : 'title'} comes down to ${gp}`;
      const SD = showdown && kind === 'driver' ? showdownPreviewLines(c, s, i, last) : null;
      const inSprint = stage === 'sprint', afterSpr = stage === 'race';
      const where = inSprint ? `the ${gp} sprint` : afterSpr ? `the ${gp} Grand Prix` : gp;
      out.push({
        id: rid + kind + 'pre' + stage, seq: i * 10 + (afterSpr ? 3 : 0), kind: 'preview', i, r, subject: kind === 'driver' ? (solo || L).id : null, outlet: outletFor(rnd), massive: showdown && !inSprint,
        kicker: inSprint ? (kind === 'team' ? 'Constructors’ title · Sprint' : 'Title decider · Sprint') : showdown ? (kind === 'team' ? 'Constructors’ showdown · Final race' : 'Title showdown · Final race') : kind === 'team' ? 'Constructors’ title' : afterSpr ? 'Title decider · After the sprint' : 'Title decider',
        list: showdown && kind === 'driver' && !inSprint ? alive.map(x => ({ id: x.id, text: `${x.name}: ${x.pts} points${x.gap ? `, ${x.gap} behind` : x === alive[0] ? ', leads' : ', level on points'}` })) : null,
        headline: (!inSprint && showHead) || (solo ? (kind === 'team' ? `${solo.name} can seal the constructors’ crown in ${where}` : `${who(solo)} can clinch the title in ${where}`) : `${kind === 'team' ? 'Constructors’ title' : 'Championship'} could be settled in ${where}`),
        standfirst: `${L.name} ${afterSpr ? `lead${kind === 'team' ? '' : 's'} after the sprint` : `arrive${kind === 'team' ? '' : 's'} at ${r.venue}`} ${m.margin ? `with a ${m.margin}-point lead over ${R2.name}` : `level on points with ${R2.name}`}, and ${m.R} points are left to play for. Here is what has to happen${inSprint ? ' in the sprint' : ''}.`,
        body: SD && !inSprint ? SD.lines : [`${afterSpr ? 'After the sprint' : `Going into round ${i + 1}`}, the top three are ${listJoin(m.rows.slice(0, 3).map(x => `${x.name} (${x.pts})`))}. ${P.G} points are available ${inSprint ? 'in the sprint' : afterSpr ? 'in the race' : 'this weekend'}${P.nx.spr && !inSprint ? ' across the sprint and the race' : ''}, leaving ${P.Rp} after it.`,
          P.clinch.length > 1 ? `${listJoin(P.clinch.map(x => x.x.name))} can all leave ${where} as champion${kind === 'team' ? 's' : ''}.` : '',
          showdown && !inSprint ? `It is the final race of the season and nothing is settled. ${alive.length >= 3 ? `A ${numWord(alive.length)}-way decider is the stuff of legend: the last one in Formula 1 was 2010.` : 'One race, winner takes all.'}` : ''].filter(Boolean),
        permsHtml: inSprint || (kind === 'team' && P.clinch.some(t => t.table)) ? tablePermsHtml(m, P) : permsHtml(m, P, { compact: true }),
        permGfx: { kind, stage, who: (P.clinch || []).filter(t => t.table?.length).map(t => t.x.id) },
        quotes: SD ? (() => { const qw = phrasebook(rnd); return SD.N.rows.filter(o => o.id !== PLAYER).map(o => ({ id: o.id, text: qw(o.leader ? 'l' : 'c', SHOWDOWN_QUOTES[o.leader ? 'preLead' : 'preChase']) })); })() : kind === 'driver' ? [{ id: L.id, text: choose(rnd, QUOTES.preLead) }, ...(R2 && R2.alive && R2.id !== PLAYER ? [{ id: R2.id, text: choose(rnd, QUOTES.preChase) }] : [])].filter(q => q.id !== PLAYER) : [],
      });
    }
    // the next round: a preview built from what has happened so far (unless a title decider preview covers it)
    if (i === nri && i > 0 && !ses.Q?.done && !out.some(x => x.kind === 'preview' && x.i === i)) {
      const pv = previewStory(c, s, i, mem, { name, last, tName });
      if (pv) out.push(pv);
    }
    // qualifying
    if (ses.Q?.done) {
      const q = ses.Q.results.filter(x => !OUT.includes(x.st)); const pole = q[0]?.d;
      if (pole) {
        const rnd = seeded(rid + 'q');
        const lap = ses.Q.results[0]?.lap; const gap2 = parseGap(ses.Q.results[1]?.gap);
        out.push({
          id: rid + 'q', seq: i * 10 + 1, kind: 'quali', i, r, subject: pole, outlet: outletFor(rnd), kicker: 'Qualifying',
          headline: pole === PLAYER ? `Pole position for ${last(pole)} in ${gp}` : choose(rnd, [`${last(pole)} takes pole in ${gp}`, `${last(pole)} quickest in ${gp} qualifying`, `${gp}: pole for ${last(pole)}`]),
          standfirst: `${name(pole)} (${tName(pole)}) will start the ${gp} Grand Prix from pole${lap ? ` after a ${lap}` : ''}${gap2 != null ? `, ${gap2.toFixed(3)}s clear of ${name(q[1]?.d)}` : q[1] ? `, ahead of ${name(q[1].d)}` : ''}.`,
          body: [`The top ten: ${q.slice(0, 10).map((x, k) => `${k + 1}. ${last(x.d)}`).join(', ')}.`,
            qualiMemory(mem, q, pole, last, rnd),
            ...rivalryQualiLines(c, s, i, q, last, rnd),
            q.findIndex(x => x.d === PLAYER) >= 10 ? `${name(PLAYER)} qualified ${ordWord(q.findIndex(x => x.d === PLAYER) + 1)}.` : ''].filter(Boolean),
        });
      }
    }
    // sprint
    if (r.sprint && ses.SPR?.done) {
      const fin = ses.SPR.results.filter(x => !OUT.includes(x.st));
      if (fin[0]) {
        const rnd = seeded(rid + 'spr');
        out.push({
          id: rid + 'spr', seq: i * 10 + 2, kind: 'sprint', i, r, subject: fin[0].d, outlet: outletFor(rnd), kicker: 'Sprint',
          headline: choose(rnd, [`${last(fin[0].d)} wins the ${gp} sprint`, `Sprint victory for ${last(fin[0].d)} in ${gp}`]),
          standfirst: `${name(fin[0].d)} took the eight points for winning the ${gp} sprint${fin[1] ? `, from ${name(fin[1].d)}${fin[2] ? ` and ${name(fin[2].d)}` : ''}` : ''}.`,
          body: [fin.length > 3 ? `Also in the points: ${fin.slice(3, 8).map((x, k) => `${last(x.d)} (${ordWord(k + 4)})`).join(', ')}.` : ''].filter(Boolean),
          results: ses.SPR.results.slice(0, 8).map((x, k) => ({ d: x.d, pos: k + 1, st: x.st, pts: pointsFor('SPR', k + 1, x.st, x.pts) })),
        });
      }
      out.push(...incidentStories(c, s, i, r, 'SPR', ses.SPR, { name, last, tName }));
      { const bs = battleStory(c, s, i, r, 'SPR', ses.SPR, { name, last, tName }); if (bs) out.push(bs); }
    }
    if (!ses.R?.done) continue;
    // race report
    const res = ses.R.results; const fin = res.filter(x => !OUT.includes(x.st));
    const W = fin[0]?.d; if (!W) continue;
    const rnd = seeded(rid + 'r');
    const grid = ses.Q?.done ? ses.Q.results.map(x => x.d) : null;
    const gpos = (id) => grid ? grid.indexOf(id) + 1 || null : null;
    const pole = grid?.[0];
    const gap2 = parseGap(res[1]?.gap);
    const fl = fastestOf(ses.R);
    const sameTeam = fin[1] && teamOf(s, W)?.id === teamOf(s, fin[1].d)?.id;
    const firstWin = prevWins(W) + (seasonStats(s, i)[W]?.wins || 0) === 0 && !D.DRIVER_BIO[W]?.fictional;
    let headline; const LP = lateWinPass(ses.R, W);
    if (LP) headline = choose(rnd, LP.left === 0 ? [`Last-lap pass hands ${last(W)} victory in ${gp}`, `${last(W)} passes ${last(LP.prev)} on the final lap to win in ${gp}`, `${last(W)} snatches ${gp} on the last lap`]
      : [`${last(W)} snatches ${gp} win with a late pass on ${last(LP.prev)}`, `Lap ${LP.lap} of ${LP.N}: ${last(W)} passes ${last(LP.prev)} for victory in ${gp}`, `${last(W)} steals it late from ${last(LP.prev)} in ${gp}`]);
    else if (W === PLAYER) headline = firstWin ? `${last(W)} takes a first Grand Prix win in ${gp}` : choose(rnd, [`${last(W)} wins the ${gp} Grand Prix`, `Victory for ${last(W)} in ${gp}`]);
    else if (firstWin) headline = `${last(W)} takes a maiden Grand Prix win in ${gp}`;
    else if (sameTeam) headline = `${tName(W)} one-two in ${gp} as ${last(W)} leads ${last(fin[1].d)} home`;
    else if (gpos(W) >= 6) headline = `${last(W)} charges from ${ordWord(gpos(W))} on the grid to win in ${gp}`;
    else if (gap2 != null && gap2 < 1) headline = `${last(W)} holds off ${last(fin[1].d)} in a ${gp} thriller`;
    else if (gap2 != null && gap2 > 10) headline = `${last(W)} dominates in ${gp}`;
    else if (pole === W) headline = choose(rnd, [`${last(W)} converts pole into ${gp} victory`, `Lights to flag for ${last(W)} in ${gp}`]);
    else headline = choose(rnd, [`${last(W)} wins in ${gp}`, `${last(W)} takes the ${gp} Grand Prix`, `${gp} glory for ${last(W)}`]);
    const body = [];
    body.push(`${name(W)} (${tName(W)}) finished top in ${gp}${fin[1] ? ` from ${name(fin[1].d)}${gap2 != null ? `, ${gap2.toFixed(3)} seconds behind` : ''}` : ''}${fin[2] ? `, with ${name(fin[2].d)} (${tName(fin[2].d)}) completing the podium` : ''}.`
      + (fin.length > 3 ? ` Behind them, ${last(fin[3].d)} took fourth${fin.length > 4 ? ` ahead of ${listJoin(fin.slice(4, fin.length >= 10 ? 9 : 10).map(x => last(x.d)))}` : ''}${fin.length >= 10 ? `, with ${last(fin[9].d)} taking the final point` : ''}.` : ''));
    const notes = [];
    if (pole && pole !== W) { const pp = res.findIndex(x => x.d === pole); notes.push(OUT.includes(res[pp]?.st) ? `Pole-sitter ${name(pole)} did not finish.` : `Pole-sitter ${name(pole)} had to settle for ${ordWord(pp + 1)}.`); }
    if (pole === W) notes.push(`${last(W)} started from pole.`);
    else if (gpos(W)) notes.push(`${last(W)} started ${ordWord(gpos(W))}.`);
    const dnfs = res.filter(x => x.st === 'DNF'); const dsq = res.filter(x => x.st === 'DSQ');
    if (dnfs.length) notes.push(`${listJoin(dnfs.map(x => name(x.d)))} failed to finish.`);
    if (dsq.length) notes.push(`${listJoin(dsq.map(x => name(x.d)))} ${dsq.length > 1 ? 'were' : 'was'} disqualified.`);
    // penalties, when the race came from the game
    const pens = (ses.R.game?.penalties || []).filter(p => (p.type === 4 || p.type <= 1) && !COLLISION_INFR.includes(p.infr)); // collisions get their own line
    if (pens.length) notes.push(`Penalties: ${listJoin(pens.slice(0, 4).map(p => `${last(p.d)} ${p.type === 4 ? `${p.time} seconds` : `a ${PENALTY_NAMES[p.type]}`}${INFRINGEMENTS[p.infr] && !COLLISION_INFR.includes(p.infr) ? ` for ${INFRINGEMENTS[p.infr]}` : ''}${p.lap ? ` on lap ${p.lap}` : ''}`))}${pens.length > 4 ? `, and ${plural(pens.length - 4, 'more')}` : ''}.`);
    if (fl) notes.push(`${name(fl)} set the fastest lap${res.find(x => x.d === fl)?.lap ? ` with a ${res.find(x => x.d === fl).lap}` : ''}.`);
    const sprW = r.sprint && ses.SPR?.done ? ses.SPR.results.find(x => !OUT.includes(x.st))?.d : null;
    if (sprW) notes.push(sprW === W ? `It completes a sprint and Grand Prix double for ${last(W)}.` : `${name(sprW)} had won the sprint.`);
    if (LP) body.push(`The win was decided ${LP.left === 0 ? 'on the very last lap' : `with ${pw(LP.left + 1, 'lap')} to go`}: ${name(W)} passed ${name(LP.prev)} for the lead on lap ${LP.lap}${LP.fight >= 3 ? `, after ${nw(LP.fight)} passes between the two` : ''}, and ${LP.left === 0 ? 'took the flag' : 'held on to the flag'}${gap2 != null ? ` ${gap2.toFixed(3)} seconds ahead` : ''}.`);
    const RF = raceFacts(c, s, i);
    const narr = RF ? raceNarrative(RF, last, seeded(rid + 'narr'), { duelsNow: new Set(duels(s).events.filter(e => e.type === 'duelStart' && e.i === i && e.key === 'R').map(e => pairKey(e.a, e.b))), duelsOn: new Set(duelsAt(s, i - 1).map(x => pairKey(x.a, x.b))) }) : '';
    if (narr) body.push(narr);
    body.push(notes.join(' '));
    const memLine = raceMemoryLine(mem, res, W, last, name, rnd);
    if (memLine) body.push(memLine);
    const rivLines = rivalryRaceLines(c, s, i, res, last, rnd); if (rivLines.length) body.push(rivLines.join(' '));
    const dd = driverOfTheDay(s, i);
    if (dd) body.push(`Driver of the Day: ${name(dd.id)} (${dd.rating.toFixed(1)}/10)${dd.pub.length ? `, who ${listJoin(dd.pub)}` : ''}.`);
    // the player and their teammate
    const pi = res.findIndex(x => x.d === PLAYER);
    if (pi >= 3 || (pi >= 0 && OUT.includes(res[pi].st))) {
      const mate = teammateOf(s); const mi = res.findIndex(x => x.d === mate);
      const meOut = OUT.includes(res[pi].st), mateOut = mi >= 0 && OUT.includes(res[mi].st);
      body.push(meOut ? `${name(PLAYER)}’s race ended early${res[pi].st === 'DSQ' ? ' with a disqualification' : ''}${mate && !mateOut ? `, while ${name(mate)} came home ${ordWord(mi + 1)}` : ''}.`
        : `${name(PLAYER)} finished ${ordWord(pi + 1)} for ${tName(PLAYER)}${mate ? (mateOut ? `, with teammate ${name(mate)} out of the race` : mi > pi ? `, ${mi - pi === 1 ? 'one place' : plural(mi - pi, 'place')} ahead of teammate ${name(mate)}` : `, behind teammate ${name(mate)} in ${ordWord(mi + 1)}`) : ''}.`);
    }
    // championship picture before and after the weekend
    const dB = titleMath(s, 'driver', i), dA = titleMath(s, 'driver', i + 1);
    const tB = titleMath(s, 'team', i), tA = titleMath(s, 'team', i + 1);
    const champ = [];
    const A0 = dA.rows[0], A1 = dA.rows[1], B0 = dB.rows[0];
    const posB = Object.fromEntries(dB.rows.map(x => [x.id, x.pos]));
    if (i === 0) champ.push(`${name(A0.id)} leads the championship after the opening round${A1 ? `, ${dA.margin ? `${plural(dA.margin, 'point')} clear of ${name(A1.id)}` : `level with ${name(A1.id)}`}` : ''}.`);
    else if (A0.id !== B0.id) champ.push(`${name(A0.id)} takes the championship lead from ${name(B0.id)}${dA.margin ? ` and now leads by ${plural(dA.margin, 'point')}` : ', the two level on points'}.`);
    else if (dA.margin > dB.margin) champ.push(`${last(A0.id)} extends the championship lead to ${plural(dA.margin, 'point')} over ${name(A1.id)}${posB[A1.id] !== 2 ? `, who moves up to second` : ''}.`);
    else if (dA.margin < dB.margin) champ.push(dA.margin ? `${name(A1.id)} cuts ${last(A0.id)}’s championship lead to ${plural(dA.margin, 'point')}${posB[A1.id] !== 2 ? ` after moving up to second` : ''}.` : `${name(A1.id)} draws level with ${last(A0.id)} on points, ${last(A0.id)} staying ahead on countback.`);
    else champ.push(`${last(A0.id)}’s lead over ${name(A1.id)} stays at ${plural(dA.margin, 'point')}.`);
    if (i > 0) {
      const moves = dA.rows.slice(2, 6).filter(x => posB[x.id] && posB[x.id] !== x.pos).map(x => `${last(x.id)} ${posB[x.id] > x.pos ? 'moves up to' : 'drops to'} ${ordWord(x.pos)}`);
      if (moves.length) champ.push(`Further back, ${listJoin(moves)}.`);
    }
    const cB0 = tB.rows[0], cA0 = tA.rows[0];
    if (cA0) champ.push(i > 0 && cA0.id !== cB0?.id ? `In the constructors’ championship, ${cA0.name} take over at the top, ${plural(tA.margin, 'point')} ahead of ${tA.rows[1].name}.` : `${cA0.name} lead the constructors’ championship by ${plural(tA.margin, 'point')} from ${tA.rows[1]?.name}.`);
    // knocked out of the title fight: named only if they were near the top (a dozen names at once is no story)
    const droppedAll = dB.rows.filter(x => x.alive && !dA.rows.find(y => y.id === x.id)?.alive && !dA.decided);
    const dropped = droppedAll.filter(x => x.pos <= 6);
    if (dropped.length) champ.push(`The result ends ${listJoin(dropped.map(x => last(x.id)))}’s title hopes.`);
    else if (droppedAll.length) { const left = dA.rows.filter(x => x.alive); if (left.length <= 4) champ.push(`Only ${listJoin(left.map(x => last(x.id)))} can still win the title.`); }
    if (dA.decided && !dB.decided) champ.push(`${name(A0.id)} is the ${s.year} world champion.`);
    if (tA.decided && !tB.decided) champ.push(`${cA0.name} are the ${s.year} constructors’ champions.`);
    body.push(champ.join(' '));
    // what they said
    const quotes = [{ id: W, text: choose(rnd, QUOTES.win) }];
    if (fin[1]) quotes.push({ id: fin[1].d, text: choose(rnd, QUOTES.p2) });
    if (fin[2]) quotes.push({ id: fin[2].d, text: choose(rnd, QUOTES.p3) });
    if (dnfs[0]) quotes.push({ id: dnfs[0].d, text: choose(rnd, QUOTES.dnf) });
    const mine = c.media.find(x => x.article && x.seasonIdx === s.index && x.roundId === r.id && x.kind === 'race');
    const myLine = mine?.questions.map(q => q.answer?.trim()).find(a => a && a.length > 20 && !/^no comment/i.test(a));
    const qs = quotes.filter(q => q.id !== PLAYER);
    if (myLine) qs.push({ id: PLAYER, text: myLine, real: true });
    const TL = dB.left.length > 1 && roundPerms(dB)?.clinch.length ? titleByLap(s, i) : null;
    out.push({ id: rid + 'r', seq: i * 10 + 4, kind: 'race', chartHtml: TL ? titleChartHtml(s, TL, last) : '', i, r, subject: W, outlet: outletFor(rnd), kicker: 'Race report', headline, standfirst: `Round ${i + 1} of ${rounds.length} · ${r.venue}`, body, quotes: qs, results: res.slice(0, 10).map((x, k) => ({ d: x.d, pos: k + 1, st: x.st, pts: pointsFor('R', k + 1, x.st, x.pts), gap: x.gap })), standings: standingsAfter(s, i) });
    if (dd) out.push(dotdStory(c, s, i, dd, mem, { name, last, tName }));
    out.push(...incidentStories(c, s, i, r, 'R', ses.R, { name, last, tName }));
    { const bs = battleStory(c, s, i, r, 'R', ses.R, { name, last, tName }); if (bs) out.push(bs); }
    const fv = fanVoiceStory(c, s, i); if (fv) out.push(fv);

    // an interview with someone from the race
    const gained = fin.map((x, k) => ({ d: x.d, g: (gpos(x.d) || 0) - (k + 1), f: k + 1 })).filter(x => x.g >= 4 && x.d !== PLAYER).sort((a, b) => b.g - a.g)[0];
    const rival = (() => { const a = archRivalOf(c, s, i); return a && res.some(x => x.d === a) ? a : null; })();
    // rotate who faces the press: the winner, the biggest climber, then someone who retired or your rival
    const subj = i % 3 === 1 && gained ? gained.d : i % 3 === 2 && dnfs[0] && dnfs[0].d !== PLAYER ? dnfs[0].d : i % 3 === 2 && rival ? rival : W;
    if (subj && subj !== PLAYER) {
      const pr = seeded(rid + 'pen');
      const fpos = res.findIndex(x => x.d === subj) + 1; const isOut = OUT.includes(res[fpos - 1]?.st);
      const sp = dA.rows.find(x => x.id === subj);
      const qa = [];
      if (isOut) qa.push(['What happened out there?', choose(pr, QUOTES.dnf)], ['How costly is this for your season?', sp?.alive && !dA.decided ? 'It hurts, but there are still plenty of points out there. We go again.' : 'We just have to reset and make sure it doesn’t happen again.']);
      else if (subj === W) qa.push(['Talk us through the race from the cockpit.', choose(pr, QUOTES.win)], [`That puts you ${ordWord(sp?.pos)} in the championship. What is the target now?`, sp?.pos === 1 ? 'We take it one race at a time, but of course the title is the goal.' : 'There is a long way to go. We keep collecting points and see where it leaves us.']);
      else if (gained?.d === subj) qa.push([`From ${ordWord(gpos(subj))} on the grid to ${ordWord(fpos)} at the flag. Where did you find the places?`, choose(pr, QUOTES.comeback)], ['Could you have gone even further?', 'Maybe with a cleaner first lap, but I’m happy with that recovery.']);
      else qa.push([`${ordWord(fpos)[0].toUpperCase() + ordWord(fpos).slice(1)} today. How do you rate it?`, fpos <= 3 ? choose(pr, QUOTES.p3) : fpos <= 10 ? 'Points on the board. Not spectacular, but we keep building.' : 'Not our day. We were missing pace and need to understand why.']);
      const mq = penMemoryQuestion(mem, subj, fpos, isOut, last, pr);
      if (mq) qa.push(mq);
      if (subj === rival) qa.push([`How do you rate your battle with ${name(PLAYER)}?`, choose(pr, [`${last(PLAYER)} is quick, no doubt about it. We race hard but fair.`, `It’s good racing. We will see who comes out on top over the season.`, `I don’t focus on one driver. I just try to beat everyone.`])]);
      out.push({ id: rid + 'pen', seq: i * 10 + 6, kind: 'pen', i, r, outlet: outletFor(pr), kicker: 'In the pen', headline: `${name(subj)}: “${qa[0][1].split(/(?<=[.!?])\s/)[0]}”`, standfirst: `${name(subj)} (${tName(subj)}) spoke to the media after the ${gp} Grand Prix.`, body: [], qa, subject: subj });
    }

    // championship stories when something changed
    if (dA.decided && !dB.decided) {
      const st = seasonStats(s, i + 1)[A0.id];
      const n = (A0.id === PLAYER_ID ? 0 : (D.DRIVER_BIO[A0.id]?.titles?.length || 0)) + c.seasons.slice(0, s.index).filter(se => roundsDone(se) === activeRounds(se).length && driverStandings(se)[0]?.id === A0.id).length + 1;
      const atFinal = !dA.left.length, rivals = dB.rows.filter(x => x.alive && x.id !== A0.id);
      // settled in the sprint: told after the sprint, before the race
      const atSprint = !!r.sprint && !!ses.SPR?.done && titleMath(s, 'driver', i, { afterSprint: true }).decided;
      const SDT = atFinal && !atSprint ? showdownTold(c, s, i, last, phrasebook(seeded(rid + 'sdt'))) : null;
      out.push({ id: rid + 'wdc', seq: i * 10 + (atSprint ? 2 : 5), kind: 'title', i, r, subject: A0.id, outlet: outletFor(rnd), massive: atFinal,
        kicker: atSprint ? 'World champion · Sprint' : atFinal ? 'World champion · Final-race decider' : 'World champion',
        headline: SDT?.twist ? SDT.twist.headline : atFinal ? (rivals.length >= 2 ? `${name(A0.id)} wins a ${numWord(rivals.length + 1)}-way title showdown in ${gp}` : `${name(A0.id)} beats ${last(rivals[0]?.id || A1.id)} to the title in a ${gp} decider`) : A0.id === PLAYER ? `${name(A0.id)} is world champion` : `${name(A0.id)} is the ${s.year} world champion`,
        standfirst: `${last(A0.id)} sealed ${n > 1 ? `a ${ordWord(n)} title` : 'the title'} in ${atSprint ? `the ${gp} sprint` : gp}${atSprint ? ', with the Grand Prix still to come' : ''}${dA.left.length ? `${atSprint ? ' and' : ' with'} ${plural(dA.left.length, 'round')} to spare` : atSprint ? '' : ' at the final round'}.`,
        chartHtml: SDT?.chart || '',
        body: SDT ? [SDT.scene, SDT.needs.join(' '), SDT.race.join(' '), `${SDT.outcome} ${last(A0.id)} finished the year with ${plural(st.wins, 'win')}, ${plural(st.podiums, 'podium')} and ${plural(A0.pts, 'point')} for ${tName(A0.id)}.`] : [atFinal ? `The title went down to the last race${rivals.length >= 2 ? `, with ${listJoin([A0.id, ...rivals.map(x => x.id)].map(id => name(id)))} all still able to win it` : ''}. ${last(A0.id)} arrived ${dB.rows[0].id === A0.id ? `leading by ${plural(dB.margin, 'point')}` : `${plural(dB.rows[0].pts - (dB.rows.find(x => x.id === A0.id)?.pts || 0), 'point')} behind ${name(dB.rows[0].id)}`} and left as champion.` : '',
          `${last(A0.id)} has ${plural(st.wins, 'win')}, ${plural(st.podiums, 'podium')} and ${plural(A0.pts, 'point')} this season for ${tName(A0.id)}, ${plural(dA.margin, 'point')} clear of ${name(A1.id)}.`].filter(Boolean),
        quotes: SDT ? (() => { const qw = phrasebook(rnd); return [...(A0.id === PLAYER ? [] : [{ id: A0.id, text: qw('won', SHOWDOWN_QUOTES.won) }]), ...SDT.losers.filter(d => d !== PLAYER).map(d => ({ id: d, text: qw('lost', SHOWDOWN_QUOTES.lost) }))]; })() : A0.id === PLAYER ? [] : [{ id: A0.id, text: choose(rnd, atFinal ? ['I can’t breathe. That was the longest race of my life.', 'To do it at the last race, under that pressure… this is everything.', ...QUOTES.champion] : QUOTES.champion) }] });
      const T = titleRetro(c, s, 'driver'); if (T && T.dec.i === i) out.push(titleRetroStory(c, s, T));
    } else if (i > 0 && A0.id !== B0.id) {
      out.push({ id: rid + 'lead', seq: i * 10 + 5, kind: 'title', i, r, subject: A0.id, outlet: outletFor(rnd), kicker: 'Championship', headline: `${last(A0.id)} takes over at the top of the championship`,
        standfirst: `${name(A0.id)} leaves ${gp} leading the standings${dA.margin ? ` by ${plural(dA.margin, 'point')}` : ' on countback'}, with ${plural(dA.R, 'point')} still to play for.`,
        body: [`The standings after round ${i + 1}: ${dA.rows.slice(0, 5).map(x => `${x.pos}. ${x.name} ${x.pts}`).join(', ')}.`],
        quotes: A0.id === PLAYER ? [] : [{ id: A0.id, text: choose(rnd, QUOTES.leader) }] });
    }
    if (dropped.length && !dA.decided) out.push({ id: rid + 'out', seq: i * 10 + 5, kind: 'title', i, r, outlet: outletFor(rnd), kicker: 'Championship', headline: `Title hopes over for ${listJoin(dropped.map(x => last(x.id)))}`,
      standfirst: `With ${plural(dA.R, 'point')} left, ${listJoin(dropped.map(x => name(x.id)))} can no longer catch ${name(A0.id)}.`,
      body: [`${dA.rows.filter(x => x.alive).length} ${dA.rows.filter(x => x.alive).length === 1 ? 'driver remains' : 'drivers remain'} in the fight: ${listJoin(dA.rows.filter(x => x.alive).map(x => `${x.name} (${x.pts})`))}.`],
      quotes: dropped.filter(x => x.id !== PLAYER).slice(0, 1).map(x => ({ id: x.id, text: choose(rnd, QUOTES.out) })) });
    if (tA.decided && !tB.decided) {
      const atFinal = !tA.left.length, rivals = tB.rows.filter(x => x.alive && x.id !== cA0.id);
      const atSprint = !!r.sprint && !!ses.SPR?.done && titleMath(s, 'team', i, { afterSprint: true }).decided;
      out.push({ id: rid + 'wcc', seq: i * 10 + (atSprint ? 2 : 5), kind: 'title', i, r, outlet: outletFor(rnd), massive: atFinal,
        kicker: atSprint ? 'Constructors’ champions · Sprint' : atFinal ? 'Constructors’ champions · Final-race decider' : 'Constructors’ champions',
        headline: atFinal ? `${cA0.name} edge ${rivals.length >= 2 ? `a ${numWord(rivals.length + 1)}-team` : 'the'} constructors’ showdown in ${gp}` : `${cA0.name} win the ${s.year} constructors’ championship`,
        standfirst: `${cA0.name} wrapped up the teams’ title in ${atSprint ? `the ${gp} sprint, with the Grand Prix still to come` : gp}${tA.left.length ? `${atSprint ? ' and' : ' with'} ${plural(tA.left.length, 'round')} to go` : atSprint ? '' : ', at the very last race'}, ${plural(tA.margin, 'point')} ahead of ${tA.rows[1]?.name}.`, body: [], quotes: [] });
      const T = titleRetro(c, s, 'team'); if (T && T.dec.i === i) out.push(titleRetroStory(c, s, T));
    }
  }
  // the season's best driver, once every round is in
  const dots = driverOfTheSeason(s);
  if (dots?.final) {
    const rnd = seeded(`${s.index}-dots`);
    out.push({ id: `${s.index}-dots`, seq: rounds.length * 10 + 1, kind: 'dotd', dots: true, i: rounds.length - 1, r: rounds[rounds.length - 1], subject: dots.id, outlet: choose(rnd, D.OUTLETS), kicker: 'Driver of the Season',
      headline: `${dName(s, dots.id)} is the ${s.year} Driver of the Season`,
      standfirst: `${plural(dots.dotd, 'Driver of the Day award')} from ${plural(dots.SR.rated, 'race')}, and an average rating of ${dots.avg.toFixed(1)}/10.`,
      body: [`The awards: ${dots.SR.dotd.filter(x => x.id === dots.id).map(x => `${x.r.name} (${x.rating.toFixed(1)})`).join(', ')}.`,
        (() => { const rest = Object.values(dots.SR.by).filter(o => o.id !== dots.id && o.dotd).sort((a, b) => b.dotd - a.dotd || b.avg - a.avg).slice(0, 3); return rest.length ? `Next best: ${listJoin(rest.map(o => `${dName(s, o.id)} (${plural(o.dotd, 'award')})`))}.` : ''; })()].filter(Boolean),
      quotes: dots.id === PLAYER ? [] : [{ id: dots.id, text: choose(rnd, ['It means a lot. You can only drive the car you have, and I tried to get everything out of it every weekend.', 'I’m proud of that. Some of those drives felt better than results that looked bigger.', 'The best thing is that it came over a whole season, not one good weekend.']) }] });
  }
  const RV = seasonReview(c, s);
  if (RV) {
    const rnd = seeded(`${s.index}-review-story`);
    out.push({ id: `${s.index}-review`, seq: rounds.length * 10 + 2, kind: 'review', i: rounds.length - 1, r: rounds[rounds.length - 1], subject: RV.champ, outlet: choose(rnd, D.OUTLETS), kicker: 'Season review', massive: true,
      headline: RV.headline, standfirst: RV.standfirst, body: RV.intro, review: RV });
  }
  // your own interviews
  for (const m of c.media) {
    if (!m.article || m.seasonIdx !== s.index) continue;
    const ri = m.roundId ? rounds.findIndex(x => x.id === m.roundId) : m.kind === 'preseason' ? -1 : m.kind === 'endseason' ? rounds.length : Math.max(0, Math.floor(rounds.length / 2) - 1);
    out.push({ id: 'm' + m.id, seq: ri * 10 + (m.kind === 'quali' ? 3 : 7), kind: 'interview', i: ri, r: rounds[ri] || null, outlet: m.article.outlet, kicker: 'Your interview', headline: m.article.headline, standfirst: m.article.summary || mediaTitle(c, m), body: (m.article.body || []).slice(0, 2), media: m });
  }
  // milestones and records from the career timeline
  const tl = careerTimeline(c);
  for (const e of tl.events) {
    if (e.seasonIdx !== s.index) continue;
    const rnd = seeded(`${s.index}-${e.r.id}-${e.type}-${e.rid || ''}-${e.id || ''}`);
    if (e.type === 'milestones') {
      const top = e.items[0];
      out.push({ id: `${s.index}-${e.r.id}-ms`, seq: e.ri * 10 + 5, kind: 'milestone', i: e.ri, r: e.r, subject: top.id, outlet: choose(rnd, D.OUTLETS), kicker: 'Milestones',
        headline: e.items.length > 1 ? `${e.r.name} milestones: ${top.text} and more` : `${top.text} in ${e.r.name}`, standfirst: '', list: e.items.length > 1 ? e.items.map(x => ({ id: x.id, text: x.text })) : null });
    } else {
      const R = tl.recs[e.rid];
      const who = e.team ? e.team.name : tl.nameOf(e.id);
      const short = e.team ? e.team.name : e.id === PLAYER_ID ? c.profile.last : lastName(who);
      const disp = R.group === 'age' ? e.disp : R.pct ? `${e.value.toFixed(1)}%` : fmtPts(e.value);
      const prevNames = listJoin(e.prev.holders.filter(h => h.id !== e.id).map(h => h.name));
      const prevDisp = R.group === 'age' ? e.prev.holders[0]?.disp : e.prev.value == null ? null : R.pct ? `${e.prev.value.toFixed(1)}%` : fmtPts(e.prev.value);
      const prevWhen = e.prev.holders.filter(h => h.id !== e.id).map(h => h.when).filter(Boolean)[0];
      const verb = e.team ? (e.kind === 'broken' ? 'break' : 'equal') : (e.kind === 'broken' ? 'breaks' : 'equals');
      out.push({ id: `${s.index}-${e.r.id}-${e.rid}-${e.id}`, seq: e.ri * 10 + 5, kind: 'record', i: e.ri, r: e.r, subject: e.team ? null : e.id, outlet: choose(rnd, D.OUTLETS), kicker: e.kind === 'broken' ? 'Record broken' : 'Record equalled',
        headline: e.rid === 'youngTitle8' ? `${short} becomes the first eight-time world champion` : `${short} ${verb} the record for the ${R.label}`,
        standfirst: e.kind === 'broken'
          ? `${who} now ${e.team ? 'hold' : 'holds'} the record for the ${R.label}: ${disp}, set at the ${e.r.name} Grand Prix.${prevNames ? ` The previous record${prevDisp ? ` of ${prevDisp}` : ''} belonged to ${prevNames}${prevWhen ? ` (${prevWhen})` : ''}.` : ''}`
          : `${who} ${e.team ? 'have' : 'has'} matched ${prevNames || 'the record'} for the ${R.label}, with ${disp}.`,
        body: [] });
    }
  }
  for (const rm of c.rumours || []) if (rm.seasonIdx === s.index) {
    out.push({ ...rumourStory(c, s, rm), t: Date.parse(rm.createdAt) || 0 });
    const f = rumourFollowUp(c, s, rm); if (f) out.push(f);
  }
  out.push(...rivalryStories(c, s));
  out.push(...calendarStories(c, s));
  for (const tr of s.transfers || []) out.push(transferStory(c, s, tr));
  return out.sort((a, b) => (b.seq - a.seq) || (b.t || 0) - (a.t || 0));
}

function rumourStory(c, s, rm) {
  const rnd = seeded(rm.id);
  const known = allKnownDrivers(c, s);
  const isMe = rm.driver === PLAYER_ID;
  const nm = isMe ? `${c.profile.first} ${c.profile.last}` : known[rm.driver]?.name || rm.driver;
  const L = isMe ? c.profile.last : lastName(nm);
  const cur = teamOf(s, rm.driver);
  const tgt = s.teams.find(t => t.id === rm.team) || teamMeta(c, rm.team);
  const ds = driverStandings(s, seasonStatsCache(s)); const row = ds.find(x => x.id === rm.driver);
  const { tot, bio } = driverRecord(c, rm.driver, careerCtxTo(c, c.seasons[rm.seasonIdx] || s, rm.after ?? Infinity));
  const nat = isMe ? c.profile.nationality : bio?.nat;
  const age = ageNow(c, rm.driver);
  const strong = rm.strength === 'strong';
  const when = rm.timing === 'now' ? 'before the end of the season' : `for ${s.year + 1}`;
  const rounds = activeRounds(s);
  const form = row && roundsDone(s) ? `${L} is ${ordWord(row.pos)} in the championship on ${plural(row.pts, 'point')}${row.wins ? ` with ${plural(row.wins, 'win')} this season` : ''}.` : '';
  const career = tot.starts ? `Across ${plural(tot.starts, 'Grand Prix start')}, the ${nat ? nat + ' ' : ''}driver has ${plural(tot.wins, 'win')} and ${plural(tot.podiums, 'podium')}${tot.titles.length ? `, plus ${plural(tot.titles.length, 'world title')}` : ''}.` : `${L} is still waiting for a first Grand Prix start.`;
  let headline, body;
  if (rm.kind === 'retire') {
    headline = strong ? choose(rnd, [`${L} set to call time on F1 career`, `${L} to retire ${rm.timing === 'now' ? 'with immediate effect' : `at the end of ${s.year}`}`]) : choose(rnd, [`Retirement talk grows around ${L}`, `Is ${s.year} ${L}’s final season?`]);
    const pool = FREE_AGENTS.filter(id => !gridIds(s).includes(id) && known[id]).slice(0, 2).map(id => known[id].name);
    body = [strong ? `${nm} is expected to announce a retirement from Formula 1 ${rm.timing === 'now' ? 'with immediate effect' : `at the end of the ${s.year} season`}, according to people close to the driver.` : `Speculation is building in the paddock that ${s.year} could be ${L}’s last season in Formula 1. Nothing has been announced.`,
      [age ? `At ${age}, ${L} has had a long career to reflect on.` : '', career].filter(Boolean).join(' '),
      [form, cur ? `${cur.name} would need a replacement${pool.length ? `, with ${listJoin(pool)} among the names said to be in the frame` : ''}.` : ''].filter(Boolean).join(' ')];
  } else if (rm.kind === 'stay') {
    headline = strong ? `${L} set to commit future to ${cur?.name || tgt.name}` : `${cur?.name || tgt.name} keen to keep ${L}`;
    body = [strong ? `${nm} is close to agreeing a new deal with ${cur?.name || tgt.name}, ending talk of a move elsewhere.` : `${cur?.name || tgt.name} are understood to want ${L} to stay beyond this season, though no new contract has been signed yet.`, [form, career].filter(Boolean).join(' ')];
  } else {
    const there = (tgt.drivers || []).filter(Boolean);
    headline = strong ? choose(rnd, [`${L} closing in on ${tgt.name} switch`, `${L} to ${tgt.name}: deal said to be close`]) : choose(rnd, [`Paddock whispers link ${L} with ${tgt.name}`, `Is ${L} eyeing a move to ${tgt.name}?`]);
    const tcs = constructorStandings(s, seasonStatsCache(s)).find(x => x.team.id === tgt.id);
    body = [strong ? `${nm} is in advanced talks over a move ${cur ? `from ${cur.name} ` : ''}to ${tgt.name} ${when}, according to several sources in the paddock.` : `${nm} has been linked with a move ${cur ? `from ${cur.name} ` : ''}to ${tgt.name} ${when}. Nothing is signed, and neither side would comment.`,
      [form, career].filter(Boolean).join(' '),
      there.length ? (there.includes(PLAYER) ? `That would put ${L} alongside ${dName(s, PLAYER)} and leave ${there.filter(d => d !== PLAYER).map(d => known[d]?.name || d).join('') || 'the other seat'} looking for a drive.` : `${tgt.name} currently run ${listJoin(there.map(d => known[d]?.name || d))}, so a deal would leave one of them looking for a seat.`) + (tcs && roundsDone(s) ? ` The team sit ${ordWord(tcs.pos)} in the constructors’ championship.` : '') + (rm.timing === 'now' ? ' A mid-season switch would be rare in modern F1.' : '') : ''].filter(Boolean);
  }
  // who the report leans on: firm sourcing for a strong rumour, hearsay for a whisper
  const outlet = choose(rnd, D.OUTLETS);
  const sourced = strong ? choose(rnd, [`${outlet} understands that`, `Several sources have told ${outlet} that`, `People with knowledge of the talks say that`]) : choose(rnd, [`One paddock source suggests that`, `There is talk in the paddock that`, `${outlet} has heard that`]);
  body.splice(1, 0, `${sourced} ${rumourClaim(rm, L, tgt, cur, s)}.`);
  const { quotes, lines } = rumourVoices(c, s, rm, rnd, { L, cur, tgt, strong, salt: 0 });
  body.splice(2, 0, ...lines);
  if (rm.status === 'confirmed') body.push(rm.kind === 'retire' ? `Update: it is official. ${nm} will retire ${rm.timing === 'now' ? 'straight away' : `after the ${s.year} season`}.` : rm.kind === 'stay' ? `Update: confirmed. ${nm} has signed a new contract with ${cur?.name || tgt.name}.` : `Update: it is official. ${nm} will race for ${tgt.name} ${when}.`);
  if (rm.status === 'denied') body.push(`Update: ${L}’s camp has denied the report, dismissing it as speculation.`);
  const ri = rm.after ?? -1;
  return { id: 'rm' + rm.id, seq: ri * 10 + 8, kind: 'rumour', i: ri, r: rounds[ri] || null, outlet, kicker: rm.status === 'confirmed' ? 'Confirmed' : rm.status === 'denied' ? 'Denied' : strong ? 'Transfer talk' : 'Rumour', headline, standfirst: body[0], body: body.slice(1), quotes, rumour: rm, subject: rm.driver };
}
/** What the source is said to claim, in a few words. */
/**
 * Rumours settled by what really happened: once a transfer moves a driver somewhere a rumour didn't say (re-signing
 * when they were meant to retire or move, say), the rumour is false and is marked denied. A transfer that fits it
 * confirms it. Undo the transfer and the rumour opens again. Returns true if anything changed.
 */
function settleRumours(c) {
  const all = c.seasons.flatMap(s => (s.transfers || []).map(tr => ({ tr, si: s.index })));
  const ids = new Set(all.map(x => x.tr.id)); let changed = false;
  for (const rm of c.rumours || []) {
    if (rm.autoBy && !ids.has(rm.autoBy)) { rm.status = 'open'; delete rm.autoBy; changed = true; }
    if (rm.status !== 'open') continue;
    const fits = (st) => rm.kind === 'retire' ? st.to === 'retire' : st.to === rm.team || (st.to && rm.team && teamRoot(st.to) === teamRoot(rm.team));
    for (const { tr, si } of all) {
      if (si < rm.seasonIdx || !(tr.createdAt > (rm.createdAt || ''))) continue;
      const st = tr.steps.find(x => x.driver === rm.driver && x.to !== 'pending'); if (!st) continue;
      rm.status = fits(st) ? 'confirmed' : 'denied'; rm.autoBy = tr.id; changed = true; break;
    }
  }
  return changed;
}
function rumourClaim(rm, L, tgt, cur, s) {
  const strong = rm.strength === 'strong';
  if (rm.kind === 'retire') return strong ? `${L} has told the team of a decision to stop` : `${L} has been weighing up the future`;
  if (rm.kind === 'stay') return strong ? `the two sides have agreed terms` : `early talks about a new deal have taken place`;
  // leaving before the contract is up: say so
  const until = career()?.contracts?.[rm.driver]; const early = rm.kind === 'move' && cur && until != null && until >= (rm.timing === 'now' ? s.year : s.year + 1);
  const breakIt = early ? `, even though ${L}’s contract with ${cur.name} runs until the end of ${until}` : '';
  return strong ? `${tgt.name} have made ${L} an offer${rm.timing === 'now' ? ' to join mid-season' : ` for ${s.year + 1}`}${breakIt}` : `${tgt.name} have asked about ${L}’s availability${breakIt}`;
}
/**
 * The paddock's reaction to a rumour: a vague answer from the driver or a team, and for a move, a word from the
 * driver whose seat would be at risk. Mostly they shrug it off; now and then the rumour clearly gets to them.
 * Quotes are invented for your career. `salt` picks fresh lines for a follow-up report.
 */
function rumourVoices(c, s, rm, rnd, { L, cur, tgt, strong, salt }) {
  const pick = (arr) => arr[(Math.floor(rnd() * arr.length) + salt) % arr.length];
  const fill = (t) => t.replace(/\{L\}/g, L);
  const quotes = [], lines = [];
  const DRIVER = {
    move: { strong: ['There are always conversations at this time of year. When there is something to say, I will say it.', 'I can’t comment on that right now. My focus is this weekend.', 'I’m not going to pretend nobody has talked to me. That’s all I’ll say for now.'],
      whisper: ['I read that too. Honestly, it’s news to me.', 'People like to talk. I’m just focused on the car.', 'I don’t know where that came from. I’m happy where I am.'] },
    retire: { strong: ['It’s a big decision and I’m taking my time with it. You’ll know when I know.', 'I’m not ready to talk about that yet.', 'I’ll sit down with the people close to me and decide what’s next.'],
      whisper: ['Retire? I still feel as quick as ever.', 'I have a lot left to give. I’m not going anywhere just yet.', 'I’ll keep going as long as I’m enjoying it, and I am.'] },
    stay: { strong: ['We’re talking and it’s going in the right direction.', 'I’m happy here. I think everyone can guess where this is heading.'],
      whisper: ['Nothing to announce. We’ll see.', 'I’m focused on racing. The contract will sort itself out.'] },
  };
  const TEAM = {
    cur: { strong: ['{L} is under contract with us, and we don’t discuss contracts in public.', 'Our focus is the next race. We’ll talk about next year when the time is right.'],
      whisper: ['We’re very happy with {L}. There’s nothing in this.', 'That’s speculation, and we don’t pay attention to it.'] },
    tgt: { strong: ['We don’t comment on drivers who are under contract elsewhere.', 'We are always looking at the market. That’s all we’ll say.'],
      whisper: ['It’s the first we’ve heard of it.', 'Our line-up is our business. We won’t add to the speculation.'] },
    retire: { strong: ['It’s {L}’s decision to make, and we’ll respect whatever it is.', 'We’re aware of the talk. We’ll let {L} speak when the time is right.'],
      whisper: ['As far as we’re concerned, {L} is fully focused on racing.', 'We haven’t had that conversation.'] },
    stay: { strong: ['We’d like to continue together, and the talks are going well.'], whisper: ['We’re happy with {L}. Contracts are discussed privately.'] },
  };
  const grade = strong ? 'strong' : 'whisper';
  // the driver answers unless it's you (you speak for yourself in Media) or the team got there first
  const teamFirst = rm.driver === PLAYER_ID || rnd() < (strong ? 0.4 : 0.5);
  if (!teamFirst) {
    quotes.push({ id: rm.driver, text: pick(DRIVER[rm.kind === 'move' ? 'move' : rm.kind][grade]) });
    lines.push(strong ? `Asked about the report, ${L} did not deny it.` : `${L} played it down.`);
  } else {
    const side = rm.kind === 'move' ? (cur && rnd() < 0.5 ? 'cur' : 'tgt') : rm.kind;
    const team = side === 'tgt' ? tgt : cur || tgt;
    if (team) {
      quotes.push({ team: team.id, role: strong ? 'Team principal' : 'Spokesperson', text: fill(pick(TEAM[side][grade])) });
      lines.push(strong ? `${team.name} gave little away.` : `${team.name} brushed it off.`);
    }
  }
  // a move puts someone's seat at risk: the weaker of the target team's drivers, if one isn't you
  if (rm.kind === 'move') {
    const st = seasonStatsCache(s);
    const there = (s.teams.find(t => t.id === tgt.id)?.drivers || []).filter(d => d && d !== rm.driver);
    const risk = there.filter(d => d !== PLAYER_ID).sort((a, b) => (st[a]?.pts || 0) - (st[b]?.pts || 0))[0];
    if (risk) {
      const shaken = rnd() < (strong ? 0.35 : 0.15);
      const SHRUG = ['I don’t read the rumours. My job is to drive the car, and that’s what I’m doing.', 'Honestly, I don’t think about it. I have a contract and I’m focused on results.', 'There’s always noise in F1. It doesn’t change how I go about my weekend.', 'I’m not worried. I just need to keep doing my job.'];
      const SHAKEN = ['Of course it’s not nice to read. I want to stay here, and I think I’ve shown what I can do.', 'If the team wants to go another way, that’s their call. But I’ll make it a hard decision for them.', 'It does put pressure on you, I won’t lie. The only answer is results on track.'];
      quotes.push({ id: risk, text: pick(shaken ? SHAKEN : SHRUG) });
      lines.push(shaken ? `${lastName(dName(s, risk))}, whose seat would be at risk, sounded less relaxed about it.` : `${lastName(dName(s, risk))}, whose seat would be the one at risk, was asked about the reports.`);
    }
  }
  return { quotes, lines };
}
/** A later report on a rumour nobody has settled yet: firmer if it was strong, fading if it was a whisper. */
function rumourFollowUp(c, s, rm) {
  const rounds = activeRounds(s);
  const ri = (rm.after ?? -1) + 1;
  if (rm.status !== 'open' || !rounds[ri] || !s.weekends[rounds[ri].id]?.sessions?.R?.done) return null;
  const rnd = seeded(rm.id + 'f');
  const strong = rm.strength === 'strong';
  const nm = trName(c, s, rm.driver), L = lastName(nm);
  const cur = teamOf(s, rm.driver);
  const tgt = s.teams.find(t => t.id === rm.team) || teamMeta(c, rm.team) || cur;
  const outlet = choose(rnd, D.OUTLETS);
  const T = { move: tgt?.name, retire: cur?.name || 'the team', stay: cur?.name || tgt?.name };
  const team = T[rm.kind] || T.move;
  const report = {
    move: strong ? [`${outlet} reports that talks between ${L} and ${team} are continuing, with a decision expected soon.`, `The story will not go away: ${outlet} says ${L}’s camp has met ${team} again.`]
      : [`The ${L}–${team} story has gone quiet. ${outlet} could find nobody willing to back it up.`, `${outlet} hears that any talks between ${L} and ${team} have cooled.`],
    retire: strong ? [`${outlet} says ${L} is now expected to confirm the decision before the season is out.`] : [`Nobody close to ${L} is talking about retirement any more, according to ${outlet}.`],
    stay: strong ? [`${outlet} reports the paperwork on ${L}’s new ${team} deal is close to being signed.`] : [`Contract talks between ${L} and ${team} are said to be slow going, according to ${outlet}.`],
  }[rm.kind] || [];
  const headline = {
    move: strong ? `${L} and ${team}: talks continue` : `${L} to ${team} talk fades`,
    retire: strong ? `${L} retirement decision draws closer` : `${L} retirement talk dies down`,
    stay: strong ? `${L} close to signing new ${team} deal` : `No breakthrough in ${L} contract talks`,
  }[rm.kind];
  const { quotes, lines } = rumourVoices(c, s, rm, rnd, { L, cur, tgt, strong, salt: 1 });
  return { id: 'rmf' + rm.id, seq: ri * 10 + 8, kind: 'rumour', i: ri, r: rounds[ri], outlet, kicker: 'Rumour update', headline, standfirst: choose(rnd, report), body: lines, quotes, subject: rm.driver, t: (Date.parse(rm.createdAt) || 0) + 1 };
}

const STORY_FILTERS = [['all', 'All', null], ['races', 'Race reports', ['race', 'sprint', 'quali', 'dotd', 'preview', 'incident', 'battle', 'review']], ['ratings', 'Fan Voice', ['ratings', 'dotd']], ['title', 'Championship', ['title', 'preview', 'review']], ['records', 'Records & milestones', ['record', 'milestone']], ['interviews', 'Interviews', ['interview', 'pen']], ['rivalries', 'Rivalries', ['rivalry']], ['rumours', 'Transfers & rumours', ['transfer', 'rumour']], ['calendar', 'Calendar', ['calendar']]];
/** The championships after round i, top ten, with each place's move since the round before. */
function standingsAfter(s, i) {
  const b = seasonStats(s, i), a = seasonStats(s, i + 1);
  const dB = driverStandings(s, b), dA = driverStandings(s, a), tB = constructorStandings(s, b), tA = constructorStandings(s, a);
  const mv = (list, id, pos) => { const k = list.findIndex(x => (x.id ?? x.team?.id) === id); return k < 0 || !i ? 0 : k + 1 - pos; };
  return { drivers: dA.slice(0, 10).map(x => ({ id: x.id, pos: x.pos, pts: x.pts, mv: mv(dB, x.id, x.pos) })), teams: tA.slice(0, 10).map(x => ({ team: x.team, pos: x.pos, pts: x.pts, mv: mv(tB, x.team.id, x.pos) })) };
}
// stories about a race that was recorded get a link to it (contact and battles: from the lap it happened)
const REPLAY_KINDS = new Set(['race', 'sprint', 'incident', 'battle', 'pen', 'dotd']);
function storyReplay(s, x) {
  if (!x.r || !REPLAY_KINDS.has(x.kind)) return '';
  if (replayList == null) { if (!storyReplay.asked) { storyReplay.asked = true; replayApi().list().then(l => { replayList = l || []; render(); }).catch(() => { replayList = []; }); } return ''; }
  const k = x.replay?.k || (x.kind === 'sprint' ? 'SPR' : 'R'); const g = s.weekends[x.r.id]?.sessions?.[k]?.game;
  const key = g?.key && replayList.some(y => y.key === g.key) ? g.key : g?.laps && Object.values(g.laps).some(L => L?.length > 1) && !isHist(s) ? `lap:${s.index}:${x.r.id}:${k}` : null;
  if (!key) return '';
  // a battle or a clash: the map shows just the two drivers (a battle saved before 3.10.1: you and the other driver)
  const ds = x.replay?.ds || (x.kind === 'battle' && x.subject ? [PLAYER, x.subject] : []);
  const lap = x.replay?.lap; return `<div><button class="btn sm ghost" data-act="rp-story" data-k="${esc(key)}" data-lap="${lap || ''}" data-ds="${esc(ds.filter(Boolean).join(','))}">${ICON.play} ${lap > 1 ? `Watch from lap ${lap}` : 'Watch the replay'}</button></div>`;
}
/** The graphics that go with a story: results, standings, ratings and each contender's permutations. */
function storyGfx(s, x) {
  if (!x.r || isHist(s)) return [];
  const base = { si: s.index, ri: x.i }; const out = [];
  if (x.kind === 'quali') out.push({ type: 'results', k: 'Q', ...base });
  if (x.kind === 'sprint' && x.results) out.push({ type: 'results', k: 'SPR', ...base });
  if (x.kind === 'race' && x.results) out.push({ type: 'results', k: 'R', ...base }, { type: 'standings', kind: 'driver', ...base }, { type: 'standings', kind: 'team', ...base });
  if (x.fanVoice?.race?.length) out.push({ type: 'ratings', rows: x.fanVoice.race.slice(0, 10).map(o => ({ id: o.id, rating: +o.rating.toFixed(1) })), ...base });
  if (x.fanVoice?.season?.length) out.push({ type: 'ratings', season: true, rows: x.fanVoice.season.slice(0, 10).map(o => ({ id: o.id, rating: +o.rating.toFixed(1) })), ...base });
  for (const who of x.permGfx?.who || []) out.push({ type: 'perm', kind: x.permGfx.kind, stage: x.permGfx.stage || '', who, ...base });
  return out;
}
function storyHtml(c, s, x, lead = false) {
  const G = storyGfx(s, x); const has = (t) => G.some(o => o.type === t);
  const when = x.r ? `R${x.i + 1} · ${esc(x.r.name)} · ${fmtDay(roundDate(s, x.r))}` : x.i < 0 ? 'Pre-season' : '';
  const kcls = { race: 'done', title: 'next', preview: 'sprint', rumour: 'dnf', record: 'next', milestone: 'done', transfer: 'breaking', dotd: 'next', rivalry: 'dnf', incident: 'dnf', battle: 'sprint', review: 'next' }[x.kind] || '';
  const q = (x.quotes || []).filter(Boolean);
  return `<article class="article story ${lead ? 'lead' : ''} ${x.kind === 'transfer' ? 'breaking' : ''} ${x.massive ? 'massive' : ''} ${x.fanVoice ? 'fan-voice' : ''}">
    <div class="row" style="justify-content:space-between">${x.fanVoice ? fvMark(true) : `<span class="outlet">${esc(x.outlet)}</span>`}<span class="row" style="gap:8px"><span class="tag ${kcls}">${esc(x.kicker)}</span><span class="muted" style="font-size:12px">${when}</span></span></div>
    <div class="row" style="gap:14px;flex-wrap:nowrap;align-items:flex-start">${x.subject ? avatar(c, s, x.subject, lead ? 64 : 48) : ''}<div style="min-width:0;display:grid;gap:6px"><div class="headline">${esc(x.headline)}</div>${x.standfirst ? `<p class="standfirst">${esc(x.standfirst)}</p>` : ''}</div></div>
    ${x.body?.length ? `<div class="body">${x.body.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
    ${x.chartHtml || ''}
    ${x.review ? `<details class="review-more"><summary>Read it race by race: all ${x.review.n} rounds</summary>${reviewHtml(c, s, x.review)}</details><div><button class="btn sm ghost" data-act="open-review" data-idx="${s.index}">Open the season review</button></div>` : ''}
    ${x.list ? `<ul class="ms-list">${x.list.map(o => `<li>${avatar(c, s, o.id, 26)}<span>${esc(o.text)}</span></li>`).join('')}</ul>` : ''}
    ${x.sections ? x.sections.map(sec => `<div class="story-sec"><h3>${esc(sec.title)}</h3><ul class="ms-list">${sec.items.map(o => `<li>${o.id ? avatar(c, s, o.id, 26) : ''}<span>${esc(o.text)}</span></li>`).join('')}</ul></div>`).join('') : ''}
    ${x.fanVoice && has('ratings') ? `<div class="row" style="gap:6px"><button class="btn sm ghost" data-act="fv-open" data-ri="${x.fanVoice.round}">All ratings</button></div>` : x.fanVoice ? `<div class="fv-cols"><div><span class="label">Top 10 · ${esc(x.r.name)}</span>${fvList(c, s, x.fanVoice.race)}</div><div><span class="label">Season so far · average</span>${fvList(c, s, x.fanVoice.season)}</div></div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="fv-open" data-ri="${x.fanVoice.round}">All ratings</button></div>` : ''}
    ${G.length ? `<div class="gfx-row">${G.map(gfxSlot).join('')}</div>` : ''}
    ${x.permsHtml ? (has('perm') ? `<details class="perms-more"><summary>Read the permutations as text</summary><div class="perms-box">${x.permsHtml}</div></details>` : `<div class="perms-box">${x.permsHtml}</div>`) : ''}
    ${x.qa ? `<div class="qa">${x.qa.map(([qq, a]) => `<div class="q"><div class="qt">${esc(qq)}</div><div class="ans">“${esc(a)}”</div></div>`).join('')}</div>` : ''}
    ${x.results && !has('results') ? `<div class="mini-results">${x.results.map(r => `<div class="${r.d === PLAYER ? 'me' : ''}"><span class="p">${OUT.includes(r.st) ? r.st : r.pos}</span>${avatar(c, s, r.d, 20)}<span class="nm">${esc(dName(s, r.d))}</span><span class="muted">${r.pts ? '+' + r.pts : ''}</span></div>`).join('')}</div>` : ''}
    ${x.standings && !has('standings') ? (() => { const mv = (n) => n > 0 ? `<span class="pos-up">▲${n}</span>` : n < 0 ? `<span class="neg">▼${-n}</span>` : ''; return `<div class="fv-cols"><div><span class="label">Drivers’ championship</span><div class="mini-results">${x.standings.drivers.map(r => `<div class="${r.id === PLAYER ? 'me' : ''}"><span class="p">${r.pos}</span>${avatar(c, s, r.id, 20)}<span class="nm">${esc(dName(s, r.id))} ${mv(r.mv)}</span><span class="muted">${r.pts}</span></div>`).join('')}</div></div><div><span class="label">Constructors’ championship</span><div class="mini-results">${x.standings.teams.map(r => `<div class="${r.team.id === s.playerTeamId ? 'me' : ''}"><span class="p">${r.pos}</span>${teamLogo(c, r.team, 20)}<span class="nm">${esc(r.team.name)} ${mv(r.mv)}</span><span class="muted">${r.pts}</span></div>`).join('')}</div></div></div>`; })() : ''}
    ${q.length ? `<div class="quotes">${q.map(o => o.team
      ? `<blockquote>${teamLogo(c, s.teams.find(t => t.id === o.team) || teamMeta(c, o.team), 30)}<div><p>“${esc(o.text)}”</p><cite>${esc((s.teams.find(t => t.id === o.team) || teamMeta(c, o.team))?.name || '')} · ${esc(o.role || 'Spokesperson')}</cite></div></blockquote>`
      : `<blockquote>${avatar(c, s, o.id, 30)}<div><p>“${esc(o.text)}”</p><cite>${esc(dName(s, o.id))}${o.real ? ' · from your interview' : ''}</cite></div></blockquote>`).join('')}</div>` : ''}
    ${x.media ? `<div><button class="btn sm ghost" data-act="nav" data-view="media">Read the full interview</button></div>` : ''}
    ${storyReplay(s, x)}
    ${x.dotd ? `<div><button class="btn sm ghost" data-act="award-card" data-kind="dotd" data-ri="${x.dotd.ri}">${ICON.camera} Image</button></div>` : x.dots ? `<div><button class="btn sm ghost" data-act="award-card" data-kind="dots">${ICON.camera} Image</button></div>` : ''}
    ${x.rumour ? `<div class="row" style="gap:6px"><span class="muted" style="font-size:12px">Your rumour.${x.rumour.status === 'open' ? ' If it comes true, make it official in Transfers.' : ''}</span>${x.rumour.status === 'open' && trPick(c, x.rumour.driver) ? `<button class="btn sm" data-act="tr-rumour" data-id="${x.rumour.id}">Make it official</button>` : ''}<button class="btn sm ghost danger" data-act="rm-del" data-id="${x.rumour.id}">Delete</button></div>` : ''}
  </article>`;
}
function renderStories() {
  const c = career(); const s = curSeason();
  const all = buildStories(c, s);
  const f = STORY_FILTERS.find(x => x[0] === ui.stories) || STORY_FILTERS[0];
  const list = f[2] ? all.filter(x => f[2].includes(x.kind)) : all;
  const nr = nextRound(s); const rounds = activeRounds(s);
  const dm = titleMath(s, 'driver'); const P = roundPerms(dm);
  const tm = titleMath(s, 'team'); const TP = roundPerms(tm);
  const rumours = (c.rumours || []).filter(x => x.seasonIdx === s.index).slice().reverse();
  const known = allKnownDrivers(c, s);
  return `<div class="page">
    <div class="page-head"><div><h1>Stories</h1><div class="sub">The ${s.year} season as the paddock press tells it: race reports, the title fight, interviews and rumours. Articles update when you edit results.</div></div>
      <div class="row">${seasonPicker(c, s.index)}${isHist(s) ? '' : '<button class="btn" data-act="rv-new">Start a rivalry</button><button class="btn primary" data-act="rm-new">Start a rumour</button>'}</div></div>
    <div class="row"><div class="seg">${STORY_FILTERS.map(([id, l]) => `<button data-act="stories-filter" data-v="${id}" class="${f[0] === id ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="grid-main">
      <div class="panel">${list.length ? list.map((x, k) => storyHtml(c, s, x, k === 0)).join('') : `<div class="empty">No stories yet. Log a qualifying session or race and the press will write it up.</div>`}
        ${list.some(x => x.quotes?.length || x.qa) ? '<div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">Quotes from other drivers are invented for your career and are not real statements.</div>' : ''}</div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h2>Up next</h2>${nr ? `<button class="btn sm ghost" data-act="nav" data-view="forecast">Forecast</button>` : ''}</div><div class="panel-b stack">
          ${nr ? `<div><span class="label">Round ${rounds.indexOf(nr) + 1} of ${rounds.length}</span><div class="hof-name">${esc(nr.name)} Grand Prix ${nr.sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div><span class="muted">${esc(nr.venue)}</span></div>
            ${P?.clinch.length ? permsHtml(dm, P, { compact: true }) : dm.decided ? `<p class="muted">The drivers’ title is decided: ${esc(dm.rows[0].name)} is champion.</p>` : `<p class="muted">The drivers’ title cannot be decided here.${P?.out.length ? ` ${listJoin(P.out.map(o => esc(o.j.name)))} could drop out of the fight.` : ''}</p>`}
            ${TP?.clinch.length ? permsHtml(tm, TP, { compact: true }) : ''}`
          : '<p class="muted">Season complete.</p>'}
        </div></div>
        <div class="panel"><div class="panel-h"><h2>Rumour mill</h2><button class="btn sm" data-act="rm-new">New rumour</button></div>
          ${rumours.length ? `<div class="panel-b tight"><table><tbody>${rumours.map(rm => `<tr><td>${avatar(c, s, rm.driver, 26)}</td><td><b>${esc(rm.driver === PLAYER_ID ? c.profile.last : lastName(known[rm.driver]?.name || rm.driver))}</b> <span class="muted">${rm.kind === 'retire' ? 'to retire' : rm.kind === 'stay' ? 'to stay' : '→ ' + esc((s.teams.find(t => t.id === rm.team) || teamMeta(c, rm.team)).name)}</span></td><td><span class="tag ${rm.status === 'confirmed' ? 'done' : rm.status === 'denied' ? 'dnf' : ''}">${rm.status === 'open' ? (rm.strength === 'strong' ? 'Strong' : 'Whisper') : rm.status}</span></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">Start a rumour about a driver moving team or retiring, and the press will run the story.</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

function rumourModal() {
  const s = latestSeason();
  const first = gridIds(s).find(id => id !== PLAYER);
  ui.modal = { kind: 'rumour', driver: first, rkind: 'move', team: s.teams.find(t => !t.drivers.includes(first))?.id, strength: 'strong', timing: 'next' };
  drawRumourModal();
}
function drawRumourModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const cur = teamOf(s, m.driver);
  const targets = s.teams.filter(t => t.id !== cur?.id);
  if (m.rkind === 'move' && !targets.some(t => t.id === m.team)) m.team = targets[0]?.id;
  const preview = rumourStory(c, s, { id: 'preview', driver: m.driver, kind: m.rkind, team: m.rkind === 'stay' ? cur?.id : m.team, strength: m.strength, timing: m.timing, status: 'open', after: -1 });
  const opt = (k, v, l) => `<option value="${v}" ${m[k] === v ? 'selected' : ''}>${esc(l)}</option>`;
  modal(`<div class="modal-h"><h2>Start a rumour</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="form-grid">
        <label class="field"><span>Driver</span><select data-ch="rm-field" data-k="driver">${s.teams.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(Boolean).map(d => opt('driver', d, d === PLAYER_ID ? `${c.profile.first} ${c.profile.last} (you)` : dName(s, d))).join('')}</optgroup>`).join('')}</select></label>
        <label class="field"><span>The rumour</span><select data-ch="rm-field" data-k="rkind">${opt('rkind', 'move', 'Moving to another team')}${opt('rkind', 'stay', 'Signing a new contract')}${opt('rkind', 'retire', 'Retiring from F1')}</select></label>
        ${m.rkind === 'move' ? `<label class="field"><span>Moving to</span><select data-ch="rm-field" data-k="team">${targets.map(t => opt('team', t.id, t.name)).join('')}</select></label>` : ''}
        ${m.rkind !== 'stay' ? `<label class="field"><span>When</span><select data-ch="rm-field" data-k="timing">${opt('timing', 'next', m.rkind === 'retire' ? `At the end of ${s.year}` : `For ${s.year + 1}`)}${opt('timing', 'now', m.rkind === 'retire' ? 'With immediate effect' : 'Mid-season')}</select></label>` : ''}
        <label class="field"><span>How strong</span><select data-ch="rm-field" data-k="strength">${opt('strength', 'strong', 'Deal said to be close')}${opt('strength', 'whisper', 'Just a whisper')}</select></label>
      </div>
      <div class="callout" style="border-left-color:var(--team)"><span class="label">Preview headline</span><div style="color:var(--fg);font-family:var(--font-display);font-size:18px;margin-top:4px">${esc(preview.headline)}</div></div>
      <p class="muted" style="font-size:13px">The story goes into Stories after the latest round. Rumours do not change the grid: when the move happens in your save, make it official in Transfers, where the rumour waits as a shortcut.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="rm-create">Publish the rumour</button></div>`);
}

/* --------------------------------------------------------- auto-fill laps */
/**
 * Fill the empty lap times from the fastest lap entered. Every car is placed off that lap by its pace relative to
 * the entered car's team (this season's measured gap to the fastest car, or BASE_PACE before there is any), so a
 * quick lap in a slow car still spreads the field sensibly, plus a little noise to split teammates. Practice and
 * qualifying times then follow the order on screen and stay within 2 s; race fastest laps stay within 4 s.
 */
function autofillLaps(s, sd, key, rid) {
  const race = isRaceKind(key);
  const max = race ? 4000 : 2000;
  const rows = sd.results;
  const ri = activeRounds(s).findIndex(r => r.id === rid);
  const timed = rows.map(x => parseLap(x.lap));
  let refI = -1;
  timed.forEach((t, i) => { if (t != null && (refI < 0 || t < timed[refI])) refI = i; });
  if (refI < 0) return { error: 'Enter at least one lap time first (the fastest you know)' };
  const ref = timed[refI];
  // the season's measured pace, leaving this weekend out (a single entered lap would make that team look fastest)
  const others = { ...s, weekends: { ...s.weekends, [rid]: undefined } };
  const measured = {};
  for (const o of paceTable(others, race ? 'race' : 'quali', false).rows) if (o.rel != null) measured[o.team.id] = o.rel;
  const floor = Math.max(0, ...Object.values(measured));
  const pace = (tid) => measured[tid] ?? (Object.keys(measured).length ? floor + 300 : (D.BASE_PACE[tid] ?? 0.8) * 1000);
  const team = (d) => teamAt(s, d, ri)?.id;
  const refPace = pace(team(rows[refI].d));
  const rnd = seeded(`${s.index}-${rid}-${key}-${ref}`);
  const expect = (x, i) => {
    let e = ref + Math.max(40, pace(team(x.d)) - refPace + 60) + (rnd() - 0.5) * (race ? 700 : 240);
    if (race) e += (i / Math.max(1, rows.length - 1)) * 500 + (x.st === 'DNF' ? 400 : 0); // the finishing order says something about pace too
    return e;
  };
  let n = 0, skipped = 0;
  const set = (i, v) => { rows[i].lap = fmtLap(Math.round(v)); n++; };
  if (race) {
    rows.forEach((x, i) => {
      if (timed[i] != null || x.st === 'DNS') return;
      set(i, Math.min(ref + max, Math.max(ref + 30, expect(x, i))));
    });
  } else {
    // only rows below the fastest entered lap can be slower than it and still match the order
    const fill = rows.map((x, i) => i).filter(i => timed[i] == null && !OUT.includes(rows[i].st) && i > refI);
    skipped = rows.filter((x, i) => i < refI && timed[i] == null && !OUT.includes(x.st)).length;
    // a normal field's spread by position (every car's pace off the fastest car, sorted), blended with each car's
    // pace off the car you entered: a surprise pole squeezes the gaps behind it a little, not to nothing
    const curve = rows.filter(x => !OUT.includes(x.st)).map(x => pace(team(x.d)) + (rnd() - 0.5) * 120).sort((a, b) => a - b);
    const lowest = curve[0] ?? 0;
    const wanted = fill.map(i => {
      const typical = (curve[Math.min(curve.length - 1, i - refI)] ?? 0) - lowest;
      return ref + 40 + 0.5 * typical + 0.5 * Math.max(0, expect(rows[i], i) - ref - 40);
    }).sort((a, b) => a - b);
    const t = {}; fill.forEach((i, k) => { t[i] = wanted[k]; });
    let prev = ref;
    for (let i = refI + 1; i < rows.length; i++) {
      if (timed[i] != null) { prev = Math.max(prev, timed[i]); continue; }
      if (t[i] == null) continue;
      const nextFixed = timed.slice(i + 1).find(v => v != null);
      const hi = Math.min(ref + max, nextFixed != null ? nextFixed - 1 : Infinity);
      const v = Math.min(hi, Math.max(t[i], prev + 5 + rnd() * 40));
      set(i, Math.max(v, prev + 1)); prev = parseLap(rows[i].lap);
    }
    // keep the gap column in step with the leader's lap
    const lead = parseLap(rows[0].lap);
    if (lead != null) rows.forEach((x, i) => { const ms = parseLap(x.lap); if (i > 0 && ms != null && fill.includes(i)) x.gap = fmtDur(ms - lead, true); });
  }
  return { n, skipped };
}
