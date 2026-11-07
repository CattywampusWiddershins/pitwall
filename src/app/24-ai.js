/* Pitwall — Context for AI-written text. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------ AI context */
function mediaContext(c, seasonIdx, roundId, kind) {
  const s = c.seasons[seasonIdx];
  const st = seasonStats(s);
  const ds = driverStandings(s, st);
  const me = st[PLAYER] || emptyStat();
  const mate = teammateOf(s);
  const team = s.teams.find(t => t.id === s.playerTeamId);
  const rounds = activeRounds(s);
  const r = rounds.find(x => x.id === roundId);
  const lines = [];
  if (isPrincipal(c)) lines.push(`Interviewee: ${c.profile.first} ${c.profile.last}, owner and team principal of ${team?.name} (${c.profile.nationality || 'nationality not given'}). Not a driver: the team's drivers are ${listJoin((team?.drivers || []).filter(Boolean).map(d => dName(s, d)))}.`);
  else { lines.push(`Driver: ${c.profile.first} ${c.profile.last} (#${c.profile.number}, ${c.profile.nationality || 'nationality not given'})`) }
  if (c.profile.bio) lines.push(`Backstory: ${c.profile.bio}`);
  lines.push(isPrincipal(c) ? `Season: ${s.year} (career season ${seasonIdx + 1}). Team: ${team?.name}.` : `Season: ${s.year} (career season ${seasonIdx + 1}). Team: ${team?.name}. Teammate: ${dName(s, mate)}.`);
  { const rv = rivalsAt(c, s, roundsDone(s) - 1); for (const x of rv.active) lines.push(`Title rivals (${x.kind === 'team' ? 'constructors' : 'drivers'}): ${x.kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === x.a) || {}).name : dName(s, x.a)} v ${x.kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === x.b) || {}).name : dName(s, x.b)}, ${x.gap} points apart`); const a = rv.arch.driver[PLAYER]; if (a) lines.push(`Archrival: ${dName(s, a.rival)} (since ${a.year})`); for (const fd of feudsAt(c, s, roundsDone(s))) lines.push(`Running feud: ${dName(s, fd.a)} v ${dName(s, fd.b)} (${fd.reason})`); }
  if (c.myTeam && s.playerTeamId === MYTEAM) {
    const m = c.myTeam;
    lines.push(`${isPrincipal(c) ? 'The team principal' : 'The driver also'} owns and runs the team: ${m.name}, a new team founded in ${m.founded || 2025}${m.base ? `, based in ${m.base}` : ''}, with ${m.engine} engines. Budget: ${fmtM(m.budget + ledgerTotals(m).net)}.${m.story ? ' Team story: ' + m.story : ''}`);
  }
  if (seasonIdx > 0) {
    const prev = c.seasons[seasonIdx - 1]; const pds = driverStandings(prev);
    lines.push(`Previous season (${prev.year}): finished P${pds.find(x => x.id === PLAYER)?.pos} with ${prev.teams.find(t => t.id === prev.playerTeamId)?.name}. Champion: ${dName(prev, pds[0]?.id)}.`);
  }
  const myPos = ds.find(x => x.id === PLAYER)?.pos;
  lines.push(`Championship after ${roundsDone(s)} of ${rounds.length} rounds: ${isPrincipal(c) ? dName(s, PLAYER) + " (the team's focus driver)" : "the driver"} P${myPos} with ${me.pts} pts. Leader: ${dName(s, ds[0]?.id)} on ${ds[0]?.pts} pts. Season so far: ${me.wins} wins, ${me.podiums} podiums, ${me.poles} poles, ${me.dnfs} DNFs.`);
  lines.push(`Top 5: ${ds.slice(0, 5).map(x => `${x.pos}. ${dName(s, x.id)} (${teamOf(s, x.id)?.name}) ${x.pts}`).join('; ')}`);
  const h = h2hCompare([s], PLAYER, mate);
  if (!isPrincipal(c)) lines.push(`Teammate battle vs ${dName(s, mate)}: qualifying ${h.q[0]}-${h.q[1]}, races ${h.r[0]}-${h.r[1]}, points ${h.pts[0]}-${h.pts[1]}.`);
  for (const l of memoryFacts(c, s, r ? rounds.indexOf(r) : roundsDone(s), kind)) lines.push(l);
  const cs = constructorStandings(s, st);
  lines.push(`Team in constructors' championship: P${cs.find(x => x.team.id === s.playerTeamId)?.pos}.`);
  if (s.goals.length) lines.push(`Season goals: ${s.goals.map(g => `${goalTitle(g)} (${evalGoal(g, s).ok ? 'on target' : 'not yet'})`).join('; ')}`);
  if (r) {
    const w = s.weekends[r.id];
    lines.push(`This event: Round ${rounds.indexOf(r) + 1}, ${r.name} Grand Prix at ${r.venue}${r.sprint ? ' (sprint weekend)' : ''}.`);
    for (const k of sessionsFor(s, r)) {
      const sd = w?.sessions[k];
      if (!sd?.done) continue;
      const ix = sd.results.findIndex(x => x.d === PLAYER);
      const my = sd.results[ix];
      const fl = fastestOf(sd);
      const top3 = sd.results.slice(0, 3).map((x, i) => `${i + 1}. ${dName(s, x.d)}`).join(', ');
      const mi = sd.results.findIndex(x => x.d === mate);
      lines.push(`${SESSION_LABEL[k]}: player ${OUT.includes(my?.st) ? my.st : 'P' + (ix + 1)}${my?.lap ? ` (best lap ${my.lap})` : ''}${my?.gap ? ` gap ${my.gap}` : ''}; teammate P${mi + 1}${OUT.includes(sd.results[mi]?.st) ? ' ' + sd.results[mi].st : ''}; top 3: ${top3}${fl ? `; fastest lap ${dName(s, fl)}` : ''}${isRaceKind(k) ? `; player scored ${pointsFor(k, ix + 1, my?.st, my?.pts)} pts` : ''}.`);
    }
    if (w?.notes) lines.push(`Driver's own notes on the weekend: ${w.notes}`);
  }
  const recent = c.media.filter(m => m.article).slice(-3);
  if (recent.length) lines.push(`Recent headlines about the driver: ${recent.map(m => `"${m.article.headline}"`).join(' | ')}`);
  const answers = c.media.filter(m => m.article).slice(-2).flatMap(m => m.questions.map(q => q.answer).filter(Boolean)).slice(-3);
  if (answers.length) lines.push(`Things the driver said recently: ${answers.map(a => `"${a}"`).join(' | ')}`);
  lines.push(`Media reputation score (−10 hostile to +10 adored): ${reputation(c)}`);
  const ang = mediaAngles(c, seasonIdx, roundId, kind).filter(a => a.fact).sort((a, b) => b.w - a.w);
  if (ang.length) lines.push(`ANGLES worth asking about, strongest first:\n${ang.slice(0, 10).map(a => `- ${a.fact}`).join('\n')}`);
  return lines.join('\n');
}

/*
  Interview angles. Every interview looks at what actually happened and what the paddock remembers: the result and
  where it came from (places made up, the car's real pace), the teammate, incidents and penalties, the strategy, the
  title fight and rivalries (a new one, a close one, the archrival, a feud), and memory (last time out, the last few
  races, this race a year ago, streaks and firsts). Each angle has a weight, so the strongest stories get asked about
  first, and carries a fact line for the AI and questions for the built-in set. A team principal is asked about the
  team and both drivers, never about their own driving.
*/
const qPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function mediaAngles(c, seasonIdx, roundId, kind) {
  const s = c.seasons[seasonIdx]; const rounds = activeRounds(s);
  const r = rounds.find(x => x.id === roundId); const ri = r ? rounds.indexOf(r) : roundsDone(s) - 1;
  const tp = isPrincipal(c); const team = s.teams.find(t => t.id === s.playerTeamId);
  const ours = tp ? (team?.drivers || []).filter(Boolean) : [PLAYER];
  const mate = tp ? null : teammateOf(s);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const you = (id) => tp ? L(id) : 'you';
  const A = []; const add = (key, w, fact, qs) => { if (w > 0 && qs.length) A.push({ key, w, fact, qs }); };
  const ses = r ? s.weekends[r.id]?.sessions || {} : {};
  const at = (sd, d) => { const k = sd?.done ? sd.results.findIndex(x => x.d === d) : -1; return k < 0 ? null : { pos: k + 1, st: sd.results[k].st, out: OUT.includes(sd.results[k].st) }; };
  const grid = (d) => ses.R?.game?.grid?.[d] || at(ses.Q, d)?.pos || null;
  // the car's real pace: where the team ranks on race pace so far, as a finishing position
  const paceRank = (() => { const P = paceTable(s, kind === 'quali' ? 'quali' : 'race'); const k = P.rows.findIndex(o => o.team.id === s.playerTeamId); return k < 0 ? null : k + 1; })();
  const expect = paceRank ? paceRank * 2 - 0.5 : null;
  const careerCount = (id, key) => playedSeasons(c).filter(x => x.index <= s.index).reduce((a, x) => a + ((x.index === s.index ? seasonStats(x, ri + 1) : seasonStatsCache(x))[id]?.[key] || 0), 0) + (id === PLAYER_ID || D.DRIVER_BIO[id]?.fictional ? 0 : (D.DRIVER_BIO[id]?.[key] || 0));

  if (kind === 'race' && ses.R?.done) {
    for (const d of ours) {
      const x = at(ses.R, d); if (!x) continue; const g = grid(d); const nm = you(d);
      if (x.out) add('dnf-' + d, 9, `${dName(s, d)} ${outVerb(x.st)} (${x.st}).`, x.st === 'DNS' ? [tp ? `${L(d)} didn't even make the start. What went wrong?` : `You didn't make the start today. What happened?`, `How frustrating is it to watch a race you should have been in?`]
        : x.st === 'DSQ' ? [tp ? `${L(d)} was disqualified. Do you accept the stewards' decision?` : `You've been disqualified. Do you accept the decision?`, `How much does losing that result hurt?`]
        : [tp ? `${L(d)} retired today. What happened, and how much does it hurt the team?` : `A ${x.st} today. Talk us through what happened.`, tp ? `Another car out of the race. Is reliability a worry for you?` : `How much does today's ${x.st} cost you?`]);
      else {
        add('result-' + d, 5 + (x.pos <= 3 ? 3 : 0), `${dName(s, d)} finished P${x.pos}${g ? ` from P${g} on the grid` : ''}.`, [tp ? `P${x.pos} for ${L(d)}. How do you rate the drive?` : `P${x.pos} at the flag. How do you sum up your afternoon?`]);
        if (g && g - x.pos >= 4) add('climb-' + d, 6 + Math.min(4, (g - x.pos) / 2), `${dName(s, d)} gained ${g - x.pos} places, P${g} to P${x.pos}.`, [`From P${g} to P${x.pos}: where did ${nm === 'you' ? 'you' : nm} find all those places?`, `${g - x.pos} places made up today. Was that the plan, or did the race come to ${nm === 'you' ? 'you' : nm}?`]);
        if (g && x.pos - g >= 4) add('drop-' + d, 6, `${dName(s, d)} lost ${x.pos - g} places, P${g} to P${x.pos}.`, [`${nm === 'you' ? 'You' : nm} started P${g} and finished P${x.pos}. Where did it go wrong?`, `Lost ${x.pos - g} places from the grid. Was it pace, strategy or traffic?`]);
        if (expect && x.pos <= expect - 4 && x.pos <= 10) add('beatcar-' + d, 7, `${dName(s, d)} finished P${x.pos} in what has been the ${ordWord(paceRank)}-fastest car on race pace.`, [`On pace this has been the ${ordWord(paceRank)}-quickest car, yet ${nm === 'you' ? 'you' : nm} finished P${x.pos}. How?`, tp ? `${L(d)} is getting more out of the car than it has in it. How do you keep hold of a driver like that?` : `Are you outperforming this car right now?`]);
        if (expect && x.pos >= expect + 5) add('undercar-' + d, 6, `${dName(s, d)} finished P${x.pos}, well below the car's usual pace (${ordWord(paceRank)}-fastest).`, [`The car has been the ${ordWord(paceRank)}-fastest, but P${x.pos} today. What was missing?`]);
        const before = careerCount(d, 'wins') - (x.pos === 1 ? 1 : 0), podB = careerCount(d, 'podiums') - (x.pos <= 3 ? 1 : 0);
        if (x.pos === 1 && before === 0) add('firstwin-' + d, 12, `It was ${dName(s, d)}'s first Grand Prix win.`, [tp ? `A first Grand Prix win for ${L(d)}, and for the team with ${L(d)}. What does it mean?` : `Your first Grand Prix win! What goes through your mind?`]);
        else if (x.pos <= 3 && podB === 0) add('firstpod-' + d, 10, `It was ${dName(s, d)}'s first podium.`, [tp ? `A first podium for ${L(d)}. How big a day is this for everyone?` : `Your first Formula 1 podium. Describe the feeling.`]);
      }
      // incidents and penalties
      for (const inc of (ses.R.game?.incidents || []).filter(o => o.a === d || o.b === d)) {
        const other = inc.a === d ? inc.b : inc.a; const blame = !inc.noFault && inc.a === d;
        add('inc-' + d + other, inc.major ? 9 : 5, `Lap ${inc.lap || '?'}: ${incidentLine(inc, L)}`, inc.noFault ? [`${nm === 'you' ? 'You' : nm} and ${L(other)} touched on lap ${inc.lap}. Racing incident?`]
          : blame ? [inc.major ? `The stewards blamed ${nm === 'you' ? 'you' : nm} for the collision with ${L(other)}. Fair call?` : `A bit of contact with ${L(other)}. Was that on ${nm === 'you' ? 'you' : nm}?`, inc.major ? `${L(other)} wasn't happy after the contact. What do you say to that?` : `Have ${nm === 'you' ? 'you' : nm} spoken to ${L(other)} about the contact?`]
          : [inc.major ? `${L(other)} hit ${nm === 'you' ? 'you' : nm}${inc.pen ? ` and got ${inc.pen}` : ''}. Is that enough?` : `${L(other)} gave ${nm === 'you' ? 'you' : nm} a tap on lap ${inc.lap}. Any damage?`, `How do ${nm === 'you' ? 'you' : 'you'} feel about ${L(other)} after today?`]);
      }
      const pens = (ses.R.game?.penalties || []).filter(p => p.d === d && PENALTY_NAMES[p.type] && !COLLISION_INFR.includes(p.infr));
      if (pens.length) add('pen-' + d, 6, `${dName(s, d)} was penalised: ${listJoin(pens.map(p => `${p.type === 4 ? `${p.time} s` : PENALTY_NAMES[p.type]}${INFRINGEMENTS[p.infr] ? ` for ${INFRINGEMENTS[p.infr]}` : ''}`))}.`, [`A penalty for ${INFRINGEMENTS[pens[0].infr] || 'an infringement'}. Avoidable?`]);
      const g2 = ses.R.game; if (g2?.pits?.[d] != null && !x.out) add('strat-' + d, 3 + (g2.pits[d] >= 3 ? 2 : 0), `${dName(s, d)} made ${plural(g2.pits[d], 'stop')}: ${stintsOf(ses.R, d).map(o => (COMPOUNDS[o.c] || [])[1] || '?').join(', ')}.`, [`${plural(g2.pits[d], 'stop')} today. Did the strategy work?`, `Talk us through the tyre calls.`]);
    }
    for (const d of ours) for (const b of raceBattles(ses.R) || []) {
      if (b.a !== d && b.b !== d) continue;
      const o = b.a === d ? b.b : b.a; const won = b.ahead === d;
      const born = duels(s).events.some(e => e.type === 'duelStart' && e.i === ri && e.key === 'R' && pairKey(e.a, e.b) === pairKey(d, o));
      add('battle-' + d + o, 6 + Math.min(3, (b.n - 8) / 2) + (b.forLead ? 3 : 0) + (born ? 2 : 0), `${dName(s, d)} and ${dName(s, o)} had a great battle${b.forLead ? ` for the lead (it changed hands ${b.leadN || 1} times)` : ''}; ${dName(s, b.ahead)} finished ahead.${born ? ' They keep meeting on track: a rivalry is forming.' : ''}`, born
        ? [tp ? `${L(d)} and ${L(o)} keep ending up wheel to wheel. Is this a rivalry?` : `You and ${L(o)} keep ending up wheel to wheel. Is this becoming a rivalry?`, tp ? `Do you worry ${L(d)} and ${L(o)} will end up taking each other out?` : `Do you enjoy racing ${L(o)}, or is it getting personal?`]
        : [tp ? `${L(d)} and ${L(o)} had a real battle out there. Were you enjoying it on the pit wall?` : `You and ${L(o)} had a real battle out there. What was that fight like from the cockpit?`, won ? (tp ? `${L(d)} came out on top against ${L(o)}. What made the difference?` : `You came out on top against ${L(o)} in the end. Where did you make it stick?`) : (tp ? `${L(o)} got the better of ${L(d)} in the end. What was missing?` : `${L(o)} got the better of you in the end. What was missing?`)]);
    }
    if (!tp && mate) {
      const a = at(ses.R, PLAYER), b = at(ses.R, mate);
      if (a && b) add('mate', 4 + (b.pos < a.pos ? 3 : 0), `Teammate ${dName(s, mate)} finished ${b.out ? b.st : 'P' + b.pos}.`, [b.pos < a.pos ? `${L(mate)} beat you today. Does that sting?` : `You finished ahead of ${L(mate)}. How important is that?`]);
    }
    if (tp && ours.length === 2) {
      const [a, b] = ours.map(d => at(ses.R, d));
      if (a && b && !a.out && !b.out && Math.abs(a.pos - b.pos) === 1) add('teamfight', 5, `${dName(s, ours[0])} and ${dName(s, ours[1])} finished next to each other.`, [`Your drivers finished side by side. Did you have to manage them?`]);
      const pts = ours.reduce((n, d) => { const x = at(ses.R, d); return n + (x ? pointsFor('R', x.pos, x.st) : 0); }, 0);
      add('teampts', 4, `The team scored ${plural(pts, 'point')} in the race.`, [pts ? `${plural(pts, 'point')} for the team today. Satisfied?` : `No points today. What does the team need to find?`]);
    }
    const dd = driverOfTheDay(s, ri); if (dd && ours.includes(dd.id)) add('dotd', 6, `${dName(s, dd.id)} was voted Driver of the Day.`, [tp ? `${L(dd.id)} is Driver of the Day. Was it the best drive of the year for the team?` : `You've been voted Driver of the Day. Your best drive of the season?`]);
  }
  if (kind === 'quali' && ses.Q?.done) {
    for (const d of ours) {
      const x = at(ses.Q, d); if (!x) continue; const nm = you(d);
      const exit = x.pos > 15 ? 'Q1' : x.pos > 10 ? 'Q2' : null;
      add('grid-' + d, 5 + (x.pos === 1 ? 5 : x.pos <= 3 ? 2 : 0), `${dName(s, d)} qualified P${x.pos}${ses.Q.results[x.pos - 1]?.gap ? ` (${ses.Q.results[x.pos - 1].gap} off pole)` : ''}.`, [x.pos === 1 ? (tp ? `Pole for ${L(d)}! How did the team pull that off?` : `Pole position! Talk us through the lap.`) : `P${x.pos} on the grid for ${nm === 'you' ? 'you' : nm}. Is that where the car belongs?`]);
      if (exit) add('exit-' + d, 6, `${dName(s, d)} went out in ${exit}.`, [tp ? `${L(d)} went out in ${exit}. What went wrong?` : `Out in ${exit}. What went wrong?`, `${nm === 'you' ? 'You' : nm} didn't make it past ${exit}. How much harder does that make tomorrow?`]);
      if (expect && x.pos <= expect - 4) add('qbeat-' + d, 7, `${dName(s, d)} qualified P${x.pos}, well above the car's usual ${ordWord(paceRank)} place on one-lap pace.`, [`P${x.pos} in a car that usually qualifies around ${ordWord(Math.round(expect))}. Where did that come from?`]);
    }
    if (!tp && mate) { const a = at(ses.Q, PLAYER), b = at(ses.Q, mate); if (a && b) add('qmate', 4, `${dName(s, mate)} qualified P${b.pos}.`, [b.pos < a.pos ? `${L(mate)} out-qualified you. What did ${L(mate)} find?` : `Ahead of ${L(mate)} again. Is the qualifying battle won?`]); }
  }
  if (kind === 'sprint' && ses.SPR?.done) {
    for (const d of ours) {
      const x = at(ses.SPR, d); if (!x) continue; const g = at(ses.SQ, d)?.pos; const nm = you(d);
      if (x.out) add('sdnf-' + d, 8, `${dName(s, d)} did not finish the sprint (${x.st}).`, [tp ? `${L(d)} is out of the sprint. How much does it hurt tomorrow?` : `An early end to the sprint. What happened?`]);
      else {
        add('sresult-' + d, 5 + (x.pos <= 3 ? 3 : 0) + (x.pos === 1 ? 3 : 0), `${dName(s, d)} finished the sprint P${x.pos}${g ? ` from P${g}` : ''}.`, [x.pos === 1 ? (tp ? `A sprint win for ${L(d)}. Does that set the tone for tomorrow?` : `Sprint winner! Does that set the tone for the Grand Prix?`) : `P${x.pos} in the sprint for ${nm === 'you' ? 'you' : nm}. What did you learn for tomorrow?`, `How much does today's sprint tell you about race pace?`]);
        if (g && g - x.pos >= 3) add('sclimb-' + d, 6, `${dName(s, d)} gained ${g - x.pos} places in the sprint.`, [`${g - x.pos} places made up in the sprint. Can you do that again tomorrow?`]);
        if (g && x.pos - g >= 3) add('sdrop-' + d, 6, `${dName(s, d)} lost ${x.pos - g} places in the sprint.`, [`Down from P${g} to P${x.pos} in the sprint. What went wrong?`]);
      }
    }
    if (!tp && mate) { const a = at(ses.SPR, PLAYER), b = at(ses.SPR, mate); if (a && b) add('smate', 4, `${dName(s, mate)} finished the sprint P${b.pos}.`, [b.pos < a.pos ? `${L(mate)} beat you in the sprint. Is the teammate fight getting tighter?` : `Ahead of ${L(mate)} in the sprint. A sign of things to come tomorrow?`]); }
  }
  // the championship: who moved past whom, gaps closing, a title won, a title that can be won before the weekend is out
  if (!tp && ri >= 0 && ['race', 'sprint', 'quali'].includes(kind)) {
    const before = titleMath(s, 'driver', ri), after = kind === 'race' && ses.R?.done ? titleMath(s, 'driver', ri + 1) : kind === 'sprint' && ses.SPR?.done ? titleMath(s, 'driver', ri, { afterSprint: true }) : null;
    const posOf = (m, id) => m.rows.find(x => x.id === id);
    const b0 = posOf(before, PLAYER), a0 = after && posOf(after, PLAYER);
    if (b0 && a0) {
      const passed = after.rows.filter(x => x.id !== PLAYER && x.pos < a0.pos && (posOf(before, x.id)?.pos ?? 99) > b0.pos);
      const gained = before.rows.filter(x => x.id !== PLAYER && x.pos < b0.pos && (posOf(after, x.id)?.pos ?? 0) > a0.pos);
      if (a0.pos === 1 && b0.pos > 1) add('wdc-lead', 10, `The player has taken the championship lead from ${dName(s, before.rows[0].id)}.`, [`You lead the world championship now. What does it feel like to be the hunted?`, `Top of the standings after today. Is this where it gets harder?`]);
      else if (gained.length) add('wdc-up', 6, `The player moved up to P${a0.pos} in the championship, past ${listJoin(gained.map(x => dName(s, x.id)))}.`, [`You've moved past ${listJoin(gained.map(x => L(x.id)))} into P${a0.pos} in the championship. How far up can you go?`]);
      if (b0.pos === 1 && a0.pos > 1) add('wdc-lost', 11, `${dName(s, after.rows[0].id)} took the championship lead from the player.`, [`${L(after.rows[0].id)} has taken the championship lead off you. How do you respond?`, `You're no longer leading the championship. Is this a setback or a wake-up call?`]);
      else if (passed.length) add('wdc-passed', 8, `${listJoin(passed.map(x => dName(s, x.id)))} moved ahead of the player in the championship.`, [`${listJoin(passed.map(x => L(x.id)))} ${passed.length > 1 ? 'have' : 'has'} moved ahead of you in the standings. How much does that hurt?`]);
      // the car behind closing in
      const nb = after.rows[a0.pos], nbBefore = nb && posOf(before, nb.id);
      if (nb && nbBefore && nbBefore.pos > b0.pos && !passed.length) {
        const g0 = b0.pts - nbBefore.pts, g1 = a0.pts - nb.pts;
        if (g0 - g1 >= 7 && g1 <= 20) add('wdc-closing', 7 + (a0.pos === 1 ? 2 : 0), `${dName(s, nb.id)} closed the gap to the player from ${g0} to ${g1} points.`, [`${L(nb.id)} has cut the gap to ${plural(g1, 'point')}. Can you feel the pressure building?`, `${g0} points became ${g1} today. Is ${L(nb.id)} coming for you?`]);
      }
      // the car ahead within reach
      const na = a0.pos > 1 ? after.rows[a0.pos - 2] : null, naBefore = na && posOf(before, na.id);
      if (na && naBefore && naBefore.pos < b0.pos) { const g0 = naBefore.pts - b0.pts, g1 = na.pts - a0.pts; if (g0 - g1 >= 7 && g1 <= 15) add('wdc-catching', 6, `The player closed to ${g1} points behind ${dName(s, na.id)}.`, [`Only ${plural(g1, 'point')} behind ${L(na.id)} now. Is that a target?`]); }
    }
    // a title won today
    const td = kind === 'race' ? titleDecision(s, 'driver') : null;
    if (td && td.i === ri) {
      const champ = td.m.rows[0].id;
      if (champ === PLAYER) add('champ', 20, 'The player won the world championship today.', [`World champion! What goes through your mind?`, `You're the world champion. Who do you want to thank first?`]);
      else if (td.contenders.some(x => x.id === PLAYER)) add('champ', 14, `${dName(s, champ)} won the world championship today; the player was still in the fight.`, [`${L(champ)} is world champion. How hard is it to take after fighting for it?`, `It's over: ${L(champ)} takes the title. What will you take from this season?`]);
      else add('champ', 7, `${dName(s, champ)} won the world championship today.`, [`${L(champ)} is the new world champion. Do they deserve it?`]);
    }
    // a decider still to come this weekend
    if (kind !== 'race' && !before.decided) {
      const m = kind === 'sprint' ? titleMath(s, 'driver', ri, { afterSprint: true }) : before;
      const P = roundPerms(m); const can = (P?.clinch || []).map(t => t.x.id);
      const mine = can.includes(PLAYER), alive = m.rows.find(x => x.id === PLAYER)?.alive;
      const final = m.left.length === 1;
      if (mine) add('decider', 12, `The player can be world champion in tomorrow's race.`, [final ? `It all comes down to tomorrow. How do you sleep tonight?` : `You can be world champion tomorrow. Are you thinking about it?`, `One race from the title. What's the plan?`]);
      else if (can.length && alive) add('decider', 10, `${listJoin(can.map(id => dName(s, id)))} can clinch the title tomorrow; the player is still in contention.`, [`${listJoin(can.map(L))} can wrap up the title tomorrow. Can you stop ${can.length > 1 ? 'them' : 'it'}?`, final ? `It's the final race. What do you need to happen?` : `Your title hopes are on the line tomorrow. How do you approach it?`]);
      else if (can.length) add('decider', 5, `${listJoin(can.map(id => dName(s, id)))} can clinch the title tomorrow.`, [`${listJoin(can.map(L))} could be champion tomorrow. Would you like to play a part in that fight?`]);
    }
  }
  // the title fight and rivalries (before a race interview, as they stood going into the weekend)
  const rri = kind === 'race' ? ri : ri - 1;
  if (ri >= 0 && kind !== 'preseason') {
    const R = rivalries(c); const rv = rivalsAt(c, s, rri);
    const me = (id, k) => k === 'team' ? teamRoot(s.playerTeamId) === id : ours.includes(id);
    const nmK = (k, id) => k === 'team' ? (s.teams.find(t => teamRoot(t.id) === id) || {}).name : dName(s, id);
    const both = (x) => x.kind === 'driver' && me(x.a, 'driver') && me(x.b, 'driver');
    // who "you" are in a rivalry: yourself, or for a team principal the team or its driver
    const side = (x) => !tp ? 'you' : x.kind === 'team' ? 'the team' : L(me(x.a, x.kind) ? x.a : x.b);
    const starts = kind === 'race' ? R.events.filter(e => e.type === 'start' && e.si === s.index && e.ri === ri && (me(e.a, e.kind) || me(e.b, e.kind))) : [];
    for (const e of starts) {
      const other = me(e.a, e.kind) ? e.b : e.a;
      add('rivalry-start', 9, `A title rivalry started this round: ${nmK(e.kind, e.a)} v ${nmK(e.kind, e.b)}, ${plural(e.gap, 'point')} apart.`, both(e)
        ? [`Your two drivers are now fighting each other for the title, ${plural(e.gap, 'point')} apart. Will you let them race?`, `${L(e.a)} and ${L(e.b)} are title rivals now. Is there a number one at this team?`]
        : [`It's ${side(e)} against ${nmK(e.kind, other)} for the title now, ${plural(e.gap, 'point')} apart. Ready for that fight?`, `People are calling it a two-way fight between ${side(e) === 'you' ? 'you' : side(e)} and ${nmK(e.kind, other)}. Fair?`]);
    }
    for (const x of rv.active.filter(x => me(x.a, x.kind) || me(x.b, x.kind))) {
      const other = me(x.a, x.kind) ? x.b : x.a; const leading = me(x.a, x.kind); const who = side(x);
      add('rivalry', 5 + (x.heat || 0) * 4, `Title rivalry: ${nmK(x.kind, x.a)} leads ${nmK(x.kind, x.b)} by ${plural(x.gap, 'point')}.`, both(x)
        ? [`${L(x.a)} leads ${L(x.b)} by ${plural(x.gap, 'point')}. How do you manage two drivers fighting for the title?`, `Do team orders come into it if ${L(x.b)} falls further behind ${L(x.a)}?`]
        : who === 'you' ? [leading ? `${plural(x.gap, 'point')} ahead of ${nmK(x.kind, other)}. Can they catch you?` : `${plural(x.gap, 'point')} behind ${nmK(x.kind, other)}. Where do you make that up?`, x.gap <= 10 ? `It could hardly be closer with ${nmK(x.kind, other)}. Feeling the pressure?` : `How do you rate the fight with ${nmK(x.kind, other)} so far?`]
        : [leading ? `${who[0].toUpperCase() + who.slice(1)} ${who === 'the team' ? 'leads' : 'leads'} ${nmK(x.kind, other)} by ${plural(x.gap, 'point')}. Can you hold on?` : `${who[0].toUpperCase() + who.slice(1)} trails ${nmK(x.kind, other)} by ${plural(x.gap, 'point')}. What does the team need to find?`]);
    }
    const arch = tp ? archRivalTeam(c, s, rri) : (() => { const a = archRivalOf(c, s, rri); return a ? { id: a } : null; })();
    if (arch) {
      const name = tp ? arch.name : dName(s, arch.id);
      let line = '', qs = [`${name} is ${tp ? 'your team\'s' : 'your'} archrival now. Does beating them matter more than anything?`];
      if (kind === 'race' && ses.R?.done) {
        const best = (ids) => Math.min(...ids.map(d => at(ses.R, d)).filter(x => x && !x.out).map(x => x.pos), 99);
        const mine = best(ours), theirs = tp ? best(arch.drivers.filter(Boolean)) : best([arch.id]);
        if (mine < 99 && theirs < 99) { line = ` Today: ${mine < theirs ? 'ahead' : 'behind'}, P${mine} to P${theirs}.`; qs = [mine < theirs ? `One up on ${name} today. How good does that feel?` : `${name} came out ahead today. Does that hurt more than the result itself?`]; }
      }
      add('arch', 6, `Archrival: ${name}.${line}`, qs);
    }
    for (const fd of feudsAt(c, s, ri + 1).filter(fd => ours.includes(fd.a) || ours.includes(fd.b))) {
      const other = ours.includes(fd.a) ? fd.b : fd.a;
      add('feud', 6, `Running feud with ${dName(s, other)} (${fd.reason}).`, [`Things are still tense with ${L(other)}. Have you cleared the air?`]);
    }
  }
  // memory: last time out, recent form, a year ago, streaks
  if (kind !== 'preseason') {
    const focus = tp ? ours[0] : PLAYER;
    const prevR = ri - (kind === 'race' ? 1 : 1) >= 0 ? rounds[kind === 'race' ? ri - 1 : ri - 1] : null;
    const prevRes = prevR && at(s.weekends[prevR.id]?.sessions?.R, focus);
    const nowRes = kind === 'race' ? at(ses.R, focus) : null;
    if (prevRes && nowRes && !prevRes.out && !nowRes.out && Math.abs(prevRes.pos - nowRes.pos) >= 5) add('lasttime', 5, `Last race (${prevR.name}) ${dName(s, focus)} finished P${prevRes.pos}.`, [`${tp ? L(focus) + ": " : ""}${nowRes.pos < prevRes.pos ? `P${prevRes.pos} in ${prevR.name}, P${nowRes.pos} today. What changed?` : `P${prevRes.pos} last time in ${prevR.name}, only P${nowRes.pos} today. Why the drop?`}`]);
    const lastN = rounds.slice(Math.max(0, ri - 3 + (kind === 'race' ? 1 : 0)), ri + (kind === 'race' ? 1 : 0)).map(x => at(s.weekends[x.id]?.sessions?.R, focus)).filter(x => x && !x.out).map(x => x.pos);
    const all = rounds.slice(0, ri + (kind === 'race' ? 1 : 0)).map(x => at(s.weekends[x.id]?.sessions?.R, focus)).filter(x => x && !x.out).map(x => x.pos);
    if (lastN.length >= 3 && all.length >= 6) { const a = avg(lastN), b = avg(all); if (b - a >= 2.5) add('form', 5, `Form: an average of P${a.toFixed(1)} over the last ${lastN.length} races against P${b.toFixed(1)} for the season.`, [`Your last ${lastN.length} races have been your best of the year. What clicked?`]); else if (a - b >= 2.5) add('form', 5, `Form: an average of P${a.toFixed(1)} over the last ${lastN.length} races, down on P${b.toFixed(1)} for the season.`, [`The results have dipped over the last few races. What's going on?`]); }
    // this race a year ago
    if (r) {
      const py = c.seasons[s.index - 1]; const pr = py && activeRounds(py).find(x => trackOf(x) === trackOf(r));
      const px = pr && at(py.weekends[pr.id]?.sessions?.R, focus);
      if (px) add('yearago', 4 + (px.pos === 1 ? 3 : 0), `A year ago here, ${dName(s, focus)} finished ${px.out ? px.st : 'P' + px.pos}.`, tp ? [px.pos === 1 ? `${L(focus)} won here last year. Can the team repeat it?` : `${L(focus)} was ${px.out ? "out of the race" : "P" + px.pos} here a year ago. How much further on is the team now?`] : [px.pos === 1 ? `You won here last year. Does coming back feel different?` : px.out ? `Last year here ended in a ${px.st}. Any demons to put to rest?` : `P${px.pos} here a year ago. How much further on are you now?`]);
    }
    const mq = !tp ? memoryQuestion(c, s, ri, kind) : null;
    if (mq) add('memory', 6, '', [mq]);
  }
  // the season: where it stands, goals, the teammate
  if (kind !== 'preseason') {
    const st = seasonStats(s, kind === 'race' || kind === 'quali' ? ri + 1 : Infinity);
    if (tp) {
      const cs = constructorStandings(s, st); const pos = cs.find(x => x.team.id === s.playerTeamId)?.pos;
      add('wcc', 3, `${team?.name} are P${pos} in the constructors' championship.`, [`P${pos} in the constructors' championship. Where should this team be by the end of the year?`]);
    } else {
      const ds = driverStandings(s, st); const me = ds.find(x => x.id === PLAYER);
      if (me) add('wdc', 3, `Championship: P${me.pos} on ${me.pts} points.`, [`You're P${me.pos} in the championship on ${me.pts} points. Where you expected to be?`]);
      if (mate) { const h = h2hCompare([s], PLAYER, mate); add('h2h', 3 + (h.r[1] > h.r[0] ? 2 : 0), `Teammate battle with ${dName(s, mate)}: races ${h.r[0]}-${h.r[1]}, qualifying ${h.q[0]}-${h.q[1]}.`, [`It's ${h.r[0]}-${h.r[1]} in races against ${L(mate)}. Who has the upper hand?`]); }
    }
    const goals = s.goals.filter(g => !g.driver || ours.includes(g.driver));
    const off = goals.filter(g => !evalGoal(g, s).ok);
    if (goals.length) add('goals', kind === 'midseason' || kind === 'endseason' ? 6 : 2, `Season goals: ${goals.map(g => `${goalTitle(g)} (${evalGoal(g, s).ok ? 'on target' : 'not yet'})`).join('; ')}.`, [off.length ? `One of the goals was “${goalTitle(off[0])}”. Is that still realistic?` : `Every target is on track. Time to aim higher?`]);
  }
  if (kind === 'preseason') {
    const prev = c.seasons[s.index - 1];
    const was = prev && !isHist(prev) ? prev.teams.find(t => t.drivers.includes(PLAYER))?.id : null;
    if (!tp && was && was !== s.playerTeamId) add('newteam', 8, `New team this year: ${team?.name}.`, [`Welcome to ${team?.name}. Why this move, and why now?`]);
    if (!tp && mate) add('newmate', 4, `Teammate: ${dName(s, mate)}.`, [`How do you expect to measure up against ${L(mate)}?`]);
    if (tp) add('lineup', 6, `Line-up: ${listJoin(ours.map(d => dName(s, d)))}.`, [`Talk us through your line-up of ${listJoin(ours.map(L))}. Why these two?`]);
    if (prev && !isHist(prev)) { const pd = driverStandings(prev).find(x => x.id === (tp ? ours[0] : PLAYER)); const pc = constructorStandings(prev).find(x => x.team.id === s.playerTeamId); if (tp ? pc : pd) add('lastyear', 5, tp ? `Last year: P${pc.pos} in the constructors' championship.` : `Last year: P${pd.pos} in the drivers' championship.`, [tp ? `P${pc.pos} last year. What is the target this time?` : `P${pd.pos} last season. What does progress look like this year?`]); }
    const arch = tp ? archRivalTeam(c, s, -1) : archRivalOf(c, s, -1);
    if (arch) add('arch', 5, `Archrival: ${tp ? arch.name : dName(s, arch)}.`, [`Round two with ${tp ? arch.name : dName(s, arch)}. Have you thought about them over the winter?`]);
    const mq = !tp ? memoryQuestion(c, s, 0, kind) : null; if (mq) add('memory', 5, '', [mq]);
    add('goals', 4, `Season goals: ${s.goals.map(g => goalTitle(g)).join('; ') || 'none set'}.`, [s.goals.length ? `The goal this year: “${goalTitle(s.goals[0])}”. Realistic?` : `What does success look like this year?`]);
  }
  if (kind === 'endseason' || kind === 'midseason') {
    const focus = tp ? ours[0] : PLAYER; const st = seasonStats(s)[focus];
    if (st) add('summary', 6, `Season so far for ${dName(s, focus)}: ${plural(st.wins, 'win')}, ${plural(st.podiums, 'podium')}, ${plural(st.pts, 'point')}.`, [kind === 'endseason' ? `The season is done. Your verdict?` : `Halfway report: what grade do you give ${tp ? 'the team' : 'yourself'}?`, `What was the best weekend of the year, and why?`]);
  }
  return A;
}
/** The questions for an interview: the strongest angles, one question each, with a little variety; nothing asked earlier in the season. */
function angleQuestions(A, n, asked = new Set()) {
  const seen = new Set(); const out = [];
  const ranked = A.map(a => ({ ...a, qs: a.qs.filter(q => !asked.has(q)), r: a.w * (0.7 + Math.random() * 0.6) })).filter(a => a.qs.length).sort((p, q) => q.r - p.r);
  for (const a of ranked) { const fam = a.key.split('-')[0]; if (seen.has(fam)) continue; seen.add(fam); out.push(qPick(a.qs)); if (out.length >= n) break; }
  return out;
}
/** Memory for interviews: streaks, last time out, the defending champion and ratings, as plain facts. */
function memoryFacts(c, s, ri, kind) {
  const after = kind === 'race' ? ri + 1 : ri; // a post-race interview already counts today's result
  const mem = raceMemory(c, s, Math.max(0, after));
  const out = [];
  if (mem.defending) out.push(`Defending world champion: ${dName(s, mem.defending) || mem.defending}${mem.defending === PLAYER ? ' (the player)' : ''}.`);
  if (mem.lastRound && kind !== 'race') out.push(`Last round (${mem.lastRound.name}): won by ${dName(s, mem.lastWinner)}${mem.lastPole ? `, pole ${dName(s, mem.lastPole)}` : ''}${mem.lastDotd ? `, Driver of the Day ${dName(s, mem.lastDotd)}` : ''}.`);
  const run = mem.run(PLAYER);
  const mine = [['wins', 'consecutive wins'], ['podiums', 'consecutive podiums'], ['poles', 'consecutive poles'], ['points', 'consecutive points finishes'], ['dotd', 'consecutive Driver of the Day awards']].filter(([k]) => run[k] >= 2).map(([k, l]) => `${run[k]} ${l}`);
  if (mine.length) out.push(`Player's current streaks: ${mine.join(', ')}.`);
  const others = gridIds(s).filter(d => d !== PLAYER && mem.run(d).wins >= 2).map(d => `${dName(s, d)} (${mem.run(d).wins} wins in a row)`);
  if (others.length) out.push(`Other drivers on a winning run: ${others.join(', ')}.`);
  if (kind === 'race' && ri >= 0) {
    const R = raceRatings(s, ri), dd = driverOfTheDay(s, ri);
    if (R?.[PLAYER]) out.push(`Pitwall rating for the player this race: ${R[PLAYER].rating.toFixed(1)}/10${R[PLAYER].pub.length ? ` (${R[PLAYER].pub.join('; ')})` : ''}.`);
    if (dd) out.push(`Driver of the Day: ${dName(s, dd.id)} (${dd.rating.toFixed(1)}/10)${dd.id === PLAYER ? ', the player' : ''}.`);
  }
  const SR = seasonRatings(s).by[PLAYER];
  if (SR?.list.length) out.push(`Player's season rating so far: ${SR.avg.toFixed(1)}/10 average${SR.dotd ? `, ${SR.dotd} Driver of the Day award${SR.dotd > 1 ? 's' : ''}` : ''}.`);
  return out;
}
/** One interview question drawn from memory, when there is something worth remembering. */
function memoryQuestion(c, s, ri, kind) {
  const after = kind === 'race' ? ri + 1 : ri;
  const mem = raceMemory(c, s, Math.max(0, after));
  const run = mem.run(PLAYER);
  const before = raceMemory(c, s, Math.max(0, ri));
  const ses = s.weekends[activeRounds(s)[ri]?.id]?.sessions || {};
  const myR = ses.R?.done ? ses.R.results.findIndex(x => x.d === PLAYER) : -1;
  const dd = kind === 'race' && ri >= 0 ? driverOfTheDay(s, ri) : null;
  const opts = [];
  if (kind === 'race' && run.wins >= 2) opts.push(`That's ${streakWord(run.wins)} wins in a row. How do you keep this run going?`);
  if (kind === 'race' && before.run(PLAYER).wins >= 2 && myR > 0) opts.push(`Your run of ${streakWord(before.run(PLAYER).wins)} straight wins ends today. How do you take that?`);
  if (kind === 'race' && before.lastWinner === PLAYER && myR > 0) opts.push(`You won last time out. P${myR + 1} today: what changed?`);
  if (kind === 'race' && dd?.id === PLAYER) opts.push(`You've been voted Driver of the Day. Was that your best drive of the season?`);
  if (kind === 'race' && dd && dd.id !== PLAYER) opts.push(`${dName(s, dd.id)} was Driver of the Day. Did you see that drive?`);
  if (kind === 'race' && run.podiums >= 3) opts.push(`${streakWord(run.podiums)} podiums in a row now. What is behind the consistency?`);
  if (kind === 'quali' && run.poles >= 1) opts.push(`Another pole after last time out. What makes you so strong over one lap at the moment?`);
  if (kind !== 'preseason' && mem.defending === PLAYER) opts.push(`As defending champion, does it feel like everyone is chasing you?`);
  if (kind === 'preseason' && mem.defending && mem.defending !== PLAYER) opts.push(`${dName(s, mem.defending) || mem.defending} starts the year as defending champion. Who is the favourite?`);
  if (kind !== 'race' && before.lastWinner && before.lastWinner !== PLAYER) opts.push(`${dName(s, before.lastWinner)} won last time out. Can you turn the tables this weekend?`);
  const others = gridIds(s).find(d => d !== PLAYER && mem.run(d).wins >= 3);
  if (others) opts.push(`${dName(s, others)} has won ${streakWord(mem.run(others).wins)} in a row. How do you stop that?`);
  const asked = askedThisSeason(c, s.index); const fresh = opts.filter(q => !asked.has(q));
  return fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : null;
}

const MEDIA_SYSTEM = `You are the media engine for a Formula 1 video-game career companion app (the player is a fictional driver racing in EA's F1 25 career mode). You play the paddock press: realistic F1 journalists from fictional outlets with fictional reporter names. Be specific to the data provided: reference actual positions, gaps, teammates, rivals, standings and goals. Never invent quotes or private statements from real-world people; you may describe real drivers' on-track results as given. Write in British English. Respond with JSON only, no markdown fences.`;

function extractJson(text) {
  const t = text.replace(/```(?:json)?/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('No JSON in reply');
  return JSON.parse(t.slice(a, b + 1));
}

async function aiCall(prompt, maxTokens) {
  if (!window.api) return { ok: false, error: 'no_key' };
  return await window.api.ai({ system: MEDIA_SYSTEM, prompt, maxTokens });
}

const KIND_BRIEF = {
  preseason: 'a pre-season media day before the first race',
  quali: 'the post-qualifying press conference',
  race: 'the post-race press conference',
  sprint: 'the post-sprint interviews, with the Grand Prix still to come',
  midseason: 'a sit-down mid-season interview',
  endseason: 'an end-of-season interview reviewing the year',
};

async function generateQuestions(c, seasonIdx, roundId, kind) {
  const asked = [...askedThisSeason(c, seasonIdx)];
  const ctx = mediaContext(c, seasonIdx, roundId, kind) + (asked.length ? `\nALREADY ASKED THIS SEASON:\n${asked.slice(-30).map(q => `- ${q}`).join('\n')}` : '');
  const res = await aiCall(`CONTEXT\n${ctx}\n\nTASK\nWrite 4 questions for ${KIND_BRIEF[kind]}.${isPrincipal(c) ? ' The interviewee is the team principal, not a driver: ask about the team, its two drivers, strategy, the car and the business, never about their own driving.' : ''} Build each question on a different item from ANGLES, strongest first (places made up or lost, beating or trailing the car's real pace, incidents and who was to blame, rivalries starting or heating up, the archrival, last race, a year ago, form and streaks). Never repeat a question, or the angle of a question, already asked this season (listed under ALREADY ASKED). Use 3 or 4 different outlets and reporters. Mix tones: one warm, one analytical about the data, at least one pointed or awkward. Keep each question to 1–3 sentences.\n\nReturn {"questions":[{"outlet":"","reporter":"","question":""}]}`, 1200);
  if (res.ok) {
    try {
      const j = extractJson(res.text);
      if (Array.isArray(j.questions) && j.questions.length) return { questions: j.questions.slice(0, 5).map(q => ({ outlet: q.outlet || 'Paddock Pass', reporter: q.reporter || 'Reporter', question: q.question, answer: '' })), ai: true };
    } catch (e) { console.warn(e); }
    toast('AI reply could not be read, using built-in questions');
  } else if (res.error !== 'no_key') {
    toast('AI unavailable: ' + res.error);
  }
  return { questions: templateQuestions(c, seasonIdx, roundId, kind), ai: false };
}

async function generateArticle(c, m) {
  const ctx = mediaContext(c, m.seasonIdx, m.roundId, m.kind);
  const qa = m.questions.map((q, i) => `Q${i + 1} (${q.reporter}, ${q.outlet}): ${q.question}\nA: ${q.answer || '[declined to answer]'}`).join('\n\n');
  const res = await aiCall(`CONTEXT\n${ctx}\n\nTRANSCRIPT of ${KIND_BRIEF[m.kind]}\n${qa}\n\nTASK\nWrite the story one outlet runs from this interview. Quote the driver's actual answers where useful (you may lightly tidy grammar). Judge how the answers land given the driver's results: humble or gracious answers after a bad day earn respect; arrogance after a poor result or digs at the team cost goodwill; bland answers are neutral. Add 2–3 short paddock reactions from fictional or role-based sources (e.g. "Team Principal", "Former champion turned pundit", "Fan forum") — never named real people.\n\nReturn {"outlet":"","headline":"","summary":"one sentence","body":["paragraph","paragraph","paragraph"],"reactions":[{"who":"","text":""}],"reputation":<integer -2..2>}`, 1600);
  if (res.ok) {
    try {
      const j = extractJson(res.text);
      return { article: { outlet: j.outlet || m.questions[0]?.outlet, headline: j.headline, summary: j.summary, body: Array.isArray(j.body) ? j.body : [String(j.body || '')] }, reactions: Array.isArray(j.reactions) ? j.reactions.slice(0, 4) : [], rep: Math.max(-2, Math.min(2, Math.round(+j.reputation || 0))) };
    } catch (e) { console.warn(e); }
    toast('AI reply could not be read, using a template article');
  } else if (res.error !== 'no_key') {
    toast('AI unavailable: ' + res.error);
  }
  return templateArticle(c, m);
}

/* Offline fallback, built from the same data */
/** Every question already put to the player this season, so an interview never asks the same thing twice. */
const askedThisSeason = (c, si) => new Set(c.media.filter(m => m.seasonIdx === si).flatMap(m => (m.questions || []).map(q => q.question)));
function pick(arr, n) { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; }
function templateQuestions(c, seasonIdx, roundId, kind) {
  const s = c.seasons[seasonIdx]; const tp = isPrincipal(c);
  const team = s.teams.find(t => t.id === s.playerTeamId)?.name;
  // fillers for when the data has little to say
  const filler = {
    preseason: [`What does success look like for ${team} in ${s.year}?`, tp ? 'Where has the team improved most over the winter?' : 'What has the team told you about the car’s strengths and weaknesses?'],
    quali: ['Talk us through the final runs. Was there anything left out there?', 'What is the plan for the start tomorrow?', 'How confident are you in the long-run pace?'],
    race: ['How did the strategy play out?', 'Which moment of the race will you remember most?'],
    sprint: ['What did the sprint teach you about tomorrow?', 'How do the tyres look after the sprint?'],
    midseason: [tp ? 'What does the car need for the second half?' : 'What does the team need to bring in upgrades for the second half?'],
    endseason: ['If you could rerun one weekend, which would it be?', 'What changes for next season?'],
  }[kind];
  const asked = askedThisSeason(c, seasonIdx);
  const qs = angleQuestions(mediaAngles(c, seasonIdx, roundId, kind), 4, asked);
  for (const q of [...pick(filler.filter(q => !asked.has(q)), filler.length), ...pick(filler, filler.length)]) { if (qs.length >= 4) break; if (!qs.includes(q)) qs.push(q); }
  const outlets = pick(D.OUTLETS, 4);
  const names = pick(['Maria Kowalski', 'James Holloway', 'Sofia Brandt', 'Tom Achterberg', 'Priya Nair', 'Luca Ferrante', 'Hannah Clarke', 'Diego Ortega'], 4);
  return qs.map((q, i) => ({ outlet: outlets[i], reporter: names[i], question: q, answer: '' }));
}
function templateArticle(c, m) {
  const s = c.seasons[m.seasonIdx];
  const name = `${c.profile.first} ${c.profile.last}`.trim();
  const answered = m.questions.filter(q => q.answer && q.answer.trim() && !/^no comment/i.test(q.answer.trim()));
  const best = answered.sort((a, b) => b.answer.length - a.answer.length)[0];
  const r = s.calendar.find(x => x.id === m.roundId);
  const head = best ? `${c.profile.last}: “${best.answer.split(/[.!?]/)[0].slice(0, 80)}”` : `${c.profile.last} keeps cards close to chest${r ? ' in ' + r.name : ''}`;
  const body = [
    `${name} spoke to the media ${r ? 'after the ' + r.name + ' Grand Prix weekend' : 'during ' + s.year} and ${answered.length >= 3 ? 'was in a talkative mood' : answered.length ? 'gave a few measured answers' : 'had little to say'}.`,
    ...answered.slice(0, 2).map(q => `Asked “${q.question}”, the ${s.teams.find(t => t.id === s.playerTeamId)?.name} driver replied: “${q.answer.trim()}”`),
  ];
  return { article: { outlet: m.questions[0]?.outlet || 'Paddock Pass', headline: head, summary: body[0], body }, reactions: [], rep: answered.length ? 0 : -1 };
}
