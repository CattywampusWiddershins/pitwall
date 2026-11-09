/* Pitwall — The Next Season tab and calendar stories. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------ next season */
/*
  The Next Season tab, on the Season page: next year's line-up as it stands (this grid with every move signed for next
  season; new ones can be made from here, for next season only), and next year's calendar, which you can reorder, cut
  and add to. Announcing the calendar puts it in the stories, round by round, and a venue that isn't on this year's
  calendar gets its own breaking story. Tracks have contracts: the years left are shown (this season not counted), and
  changing them is announced as a new deal, an extension or a shorter one.
*/
// the year each track's deal runs to (end of that season): roughly the real ones
const TRACK_DEAL = { bhr: 2036, sau: 2030, aus: 2035, jpn: 2029, chn: 2030, mia: 2041, emi: 2025, mon: 2035, esp: 2026, can: 2035, aut: 2030, gbr: 2034, bel: 2031, hun: 2032, ned: 2026, ita: 2031, aze: 2030, sgp: 2028, usa: 2034, mex: 2028, bra: 2030, lvg: 2032, qat: 2032, abu: 2030, mad: 2035 };
const roundTrackId = (r) => r.track || H.roundTrack[r.id] || r.id;
const trackDeal = (c, tid) => c?.trackContracts?.[tid] ?? TRACK_DEAL[tid] ?? null;
const _nextBase = new WeakMap();
/** Next season's grid and calendar as things stand. */
function nextBase(c, s) {
  const v = _nextBase.get(s); if (v?.gen === renderGen) return v.b;
  const b = baseRoster(c, s.index + 1, s); _nextBase.set(s, { gen: renderGen, b }); return b;
}
/**
 * Next season's line-up for the Next Season tab: today's grid with only the moves you've confirmed for next season
 * (re-signings, moves, departures), in the order they were made. Nothing is predicted: no market moves, no rookies.
 */
const _nextLineup = new WeakMap();
function nextLineup(c, s) {
  const v = _nextLineup.get(s); if (v?.gen === renderGen) return v.b;
  let teams, drivers;
  if (templateFor(s.year + 1, c)) ({ teams, drivers } = nextBase(c, s)); // a real season: its real grid, with your moves on top
  else { teams = clone(s.teams); drivers = clone(s.drivers); for (const tr of s.transfers || []) if (tr.effective === 'next') for (const m of tr.steps) applyMove(c, teams, drivers, m); }
  const b = { teams, drivers }; _nextLineup.set(s, { gen: renderGen, b }); return b;
}
/** Next season's calendar: yours if you've changed it, else the one it would start with. */
const nextCal = (c, s) => c.nextCal?.[s.year + 1] || nextBase(c, s).calendar.filter(r => !r.off);
/** A track's history in this career: the winners there, latest first: [{ year, d, s }]. */
function trackWinners(c, tid) {
  const out = [];
  for (const s of c.seasons) for (const r of activeRounds(s)) {
    if (roundTrackId(r) !== tid) continue;
    const sd = s.weekends[r.id]?.sessions?.R; const W = sd?.done ? sd.results.find(x => !OUT.includes(x.st))?.d : null;
    if (W) out.push({ year: s.year, d: W, s });
  }
  return out.reverse();
}
/** The last year a track was raced, in this career or in real life before it. */
function lastHeld(c, tid, before) {
  let y = null;
  for (const s of c.seasons) if (s.year < before && activeRounds(s).some(r => roundTrackId(r) === tid)) y = Math.max(y || 0, s.year);
  for (const [yr, h] of Object.entries(H.seasons || {})) if (+yr < before && h.rounds.some(r => (r.track || H.roundTrack[r.id] || r.id) === tid)) y = Math.max(y || 0, +yr);
  return y;
}
function renderNextSeason(c, s, only = null) {
  const year = s.year + 1; const base = nextLineup(c, s); const cal = nextCal(c, s);
  const onNow = new Set(activeRounds(s).map(roundTrackId));
  const own = !!c.nextCal?.[year]; const ann = c.calAnnounced?.[year];
  const changedSince = ann && JSON.stringify(ann.cal.map(r => [r.id, !!r.sprint])) !== JSON.stringify(cal.map(r => [r.id, !!r.sprint]));
  const onCal = new Set(cal.map(roundTrackId));
  const addable = [...new Set([...Object.keys(D.TRACKS), ...Object.values(H.seasons || {}).flatMap(h => h.rounds.map(r => r.track || H.roundTrack[r.id] || r.id))])].filter(tid => !onCal.has(tid) && (D.TRACKS[tid] || trackGp(tid).name !== tid)).sort((a, b) => trackGp(a).name.localeCompare(trackGp(b).name));
  const rows = cal.map((r, i) => {
    const tid = roundTrackId(r); const until = trackDeal(c, tid); const left = until != null ? Math.max(0, until - s.year) : null;
    return `<tr><td class="muted num">${i + 1}</td><td>${countryFlag(D.TRACKS[tid]?.country, 12)} <b>${esc(r.name)}</b> <span class="muted">${esc(r.venue || '')}</span>${onNow.has(tid) ? '' : ' <span class="tag sprint">New</span>'}</td>
      <td><label class="row" style="gap:4px"><input type="checkbox" ${r.sprint ? 'checked' : ''} data-ch="nc-sprint" data-i="${i}"> Sprint</label></td>
      <td style="white-space:nowrap"><label class="row" style="gap:4px;flex-wrap:nowrap" title="Seasons left on the deal, not counting ${s.year}"><input type="number" min="0" max="20" value="${left ?? ''}" placeholder="–" data-ch="nc-contract" data-track="${tid}" style="width:56px"> ${left != null ? `yr${left === 1 ? '' : 's'}${until ? ` <span class="muted">(${left > 0 ? `${s.year + 1}–${until}` : until < s.year ? `ended ${until}` : `ends ${until}`})</span>` : ''}` : '<span class="muted">no deal</span>'}</label></td>
      <td><div class="row" style="gap:2px;flex-wrap:nowrap;justify-content:flex-end"><button class="icon-btn sm" data-act="nc-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Earlier">↑</button><button class="icon-btn sm" data-act="nc-move" data-i="${i}" data-dir="1" ${i === cal.length - 1 ? 'disabled' : ''} title="Later">↓</button><button class="icon-btn sm" data-act="nc-remove" data-i="${i}" title="Remove">${ICON.x}</button></div></td></tr>`;
  }).join('');
  const lineup = `<div class="panel"><div class="panel-h"><h2>${year} line-up, as it stands</h2><button class="btn sm primary" data-act="tr-new-next">New transfer for ${year}</button></div>
      <div class="panel-b">${gridCards(c, s, base.teams, base.drivers, { act: 'tr-new-next-d', year })}<p class="muted" style="font-size:12px;margin:8px 0 0">This season’s grid with only the moves confirmed for ${year}: nothing is predicted. Transfers made here take effect from ${year}, never mid-season.</p></div></div>`;
  const calendar = `<div class="panel"><div class="panel-h"><h2>The ${year} calendar</h2><div class="row" style="gap:6px">${own ? `<button class="btn sm ghost" data-act="nc-reset">Back to the default</button>` : ''}<button class="btn sm ${ann && !changedSince ? '' : 'primary'}" data-act="nc-announce">${ann ? (changedSince ? 'Announce the changes' : 'Announced') : 'Announce'}</button></div></div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th class="num">#</th><th>Grand Prix</th><th></th><th>Contract</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="panel-b row" style="gap:8px"><select data-ch="nc-add"><option value="">+ Add a track…</option><option value="__new">+ A new track…</option>${addable.map(tid => `<option value="${tid}">${esc(trackGp(tid).name)}${D.TRACKS[tid]?.circuit ? ` · ${esc(D.TRACKS[tid].circuit)}` : ''}</option>`).join('')}</select><span class="muted" style="font-size:12px">${plural(cal.length, 'round')} · ${cal.filter(r => r.sprint).length} sprints</span></div>
      <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">Contracts: seasons left after ${s.year}. Change one and the press reports the new deal. Announce the calendar and it goes in the stories, round by round${addable.length ? ', with a breaking story for any venue new to the calendar' : ''}.</div></div>`;
  return only === 'cal' ? calendar : only === 'lineup' ? lineup : `<div class="stack">${lineup}${calendar}</div>`;
}
/** The calendar announcement, new venues and track deals, as stories in the season they happened. */
function calendarStories(c, s) {
  const out = []; const rounds = activeRounds(s);
  const ann = c.calAnnounced?.[s.year + 1];
  // a driver's name as of a season they raced (they may not be on this year's grid)
  const told = new Set(); // track deals already told in a new venue's story
  const name = (d, s2 = s) => d === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : (s2.drivers[d] ? dName(s2, d) : null) || refName(d);
  // the announcement for next season, and a fresh one when this season started on a calendar never announced or changed since
  for (const [ann, y] of [[c.calAnnounced?.[s.year + 1], s.year + 1], [c.calReannounced?.[s.year], s.year]]) if (ann && ann.si === s.index) { const rnd = seeded(`cal-${y}-${ann.at}`); const r0 = rounds[ann.ri] || null;
    const lines = ann.cal.map((r, k) => {
      const tid = roundTrackId(r); const W = trackWinners(c, tid); const most = Object.entries(W.reduce((a, x) => (a[x.d] = (a[x.d] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1])[0];
      const isNew = ann.newTracks.includes(tid); const last = isNew ? lastHeld(c, tid, y) : null;
      return `Round ${k + 1}: ${r.name}${r.venue ? ` (${r.venue})` : ''}${r.sprint ? ', a sprint weekend' : ''}.${isNew ? (last ? ` Back on the calendar for the first time since ${last}.` : ' A new venue for Formula 1.') : ''}${W[0] ? ` Last winner: ${name(W[0].d, W[0].s)} (${W[0].year}).` : ''}${most && most[1] >= 2 ? ` Most wins: ${name(most[0], W.find(x => x.d === most[0]).s)}, ${most[1]}.` : ''}`;
    });
    out.push({ id: `cal-${y}${ann.ri < 0 ? '-re' : ''}`, seq: ann.ri * 10 + 9, kind: 'calendar', i: ann.ri, r: r0, subject: null, calGfx: { year: y, cal: ann.cal.map(r => [r.id, r.name, r.venue, roundTrackId(r), !!r.sprint]), fresh: ann.cal.map((r, k) => ann.newTracks.includes(roundTrackId(r)) ? k : -1).filter(k => k >= 0) }, outlet: choose(rnd, D.OUTLETS), kicker: 'Calendar', massive: true,
      headline: choose(rnd, [`F1 reveals the ${y} calendar: ${ann.cal.length} rounds`, `${ann.cal.length} races, ${ann.cal.filter(r => r.sprint).length} sprints: the ${y} calendar is out`, `From ${ann.cal[0].name} to ${ann.cal[ann.cal.length - 1].name}: F1’s ${y} schedule`]),
      standfirst: `The ${y} season opens in ${ann.cal[0].name} and ends in ${ann.cal[ann.cal.length - 1].name}${ann.newTracks.length ? `, with ${listJoin(ann.newTracks.map(t => trackGp(t).name))} new to the calendar` : ''}.`, body: [], more: { title: 'Round by round', lines }, quotes: [] });
    for (const tid of ann.newTracks) {
      const last = lastHeld(c, tid, y); const deal = (c.trackDeals || []).filter(d => d.tid === tid && d.si === s.index).pop(); const T = D.TRACKS[tid]; const nm = trackGp(tid).name;
      if (deal) told.add(deal); // one story for the new venue and its deal, not two
      const yrs = deal ? deal.to - s.year : 0;
      out.push({ id: `cal-new-${y}-${tid}${ann.ri < 0 ? '-re' : ''}`, seq: ann.ri * 10 + 9.1, kind: 'calendar', i: ann.ri, r: r0, subject: null, outlet: choose(rnd, D.OUTLETS), kicker: 'Breaking', massive: true,
        headline: `BREAKING: F1 to race in ${T?.country || nm}${deal && yrs > 0 ? ` on a ${yrs}-year deal` : ''}`, standfirst: `${nm}${T?.circuit ? ` (${T.circuit})` : ''} joins the ${y} calendar${last ? `, the first race there since ${last}` : ', a brand-new venue for Formula 1'}${deal ? `, ${yrs > 0 ? `on a ${yrs}-year contract` : 'on a contract'} running to the end of ${deal.to}` : ''}.`, body: [], quotes: [] });
    }
  }
  for (const d of (c.trackDeals || []).filter(x => x.si === s.index && !told.has(x))) {
    const nm = trackGp(d.tid).name; const rnd = seeded(`deal-${d.tid}-${d.at}`); const years = d.to - s.year;
    const longer = d.from == null || d.to > d.from;
    out.push({ id: `deal-${d.tid}-${d.at}`, seq: d.ri * 10 + 9.2, kind: 'calendar', i: d.ri, r: rounds[d.ri] || null, subject: null, outlet: choose(rnd, D.OUTLETS), kicker: longer ? 'Breaking' : 'Calendar',
      headline: d.from == null ? `BREAKING: ${nm} seals ${years}-year deal with F1` : longer ? choose(rnd, [`BREAKING: ${nm} extends F1 deal to ${d.to}`, `${nm} stays on the calendar until ${d.to}`]) : choose(rnd, [`${nm}’s F1 deal cut short`, `${nm} to leave the calendar sooner: deal now ends in ${d.to}`]),
      standfirst: d.from == null ? `${nm} has signed a ${years}-year contract to host Formula 1, running to the end of ${d.to}.` : longer ? `${nm}’s contract, due to end in ${d.from}, now runs to the end of ${d.to}: ${plural(years, 'more season')} after ${s.year}.` : `${nm}’s contract was due to run until ${d.from}. It now ends after ${d.to}${d.to <= s.year ? ', this season' : ''}.`, body: [], quotes: [] });
  }
  return out;
}
