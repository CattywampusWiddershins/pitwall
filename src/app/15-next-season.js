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
  if (followsReal(c, s.year + 1)) ({ teams, drivers } = nextBase(c, s)); // a real season: its real grid, with your moves on top
  else { teams = clone(s.teams); drivers = clone(s.drivers); applyTeamEdits(c, s.year + 1, teams); for (const tr of s.transfers || []) if (tr.effective === 'next') for (const m of tr.steps) applyMove(c, teams, drivers, m); }
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
  const tplY = !!templateFor(year, c); const mode = gridMode(c, year); const locked = !!(c.realSeason || realDriverOf(c));
  const added = new Set(c.teamEdits?.[year]?.add || []); const empty = base.teams.reduce((a, t) => a + [0, 1].filter(i => !t.drivers[i]).length, 0);
  const teamsPanel = `<div class="panel"><div class="panel-h"><h2>${year} teams</h2>${locked ? `<span class="muted" style="font-size:12px">Follows the real ${year} grid</span>`
      : `<div class="seg"><button data-act="ns-gridmode" data-v="keep" class="${mode === 'keep' || !tplY ? 'on' : ''}">Keep the ${s.year} teams</button><button data-act="ns-gridmode" data-v="real" class="${mode === 'real' && tplY ? 'on' : ''}" ${tplY ? '' : `disabled title="There's no real data for ${year}"`}>Follow the real ${year} grid</button></div>`}</div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th>Team</th><th>Drivers</th><th></th></tr></thead><tbody>${base.teams.map(t => `<tr><td><div class="drv"><span class="chip" style="--c:${t.color}"></span><b>${esc(t.name)}</b>${added.has(t.id) ? ' <span class="tag sprint">New</span>' : ''}</div></td>
        <td>${[0, 1].map(i => t.drivers[i] ? esc(t.drivers[i] === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : base.drivers[t.drivers[i]]?.name || anyName(t.drivers[i])) : '<span class="muted">Empty seat</span>').join(' · ')}</td>
        <td style="text-align:right">${t.id === MYTEAM || locked ? '' : `<button class="icon-btn sm" data-act="team-remove" data-scope="nc" data-id="${t.id}" title="Take ${esc(t.name)} off the ${year} grid">${ICON.x}</button>`}</td></tr>`).join('')}</tbody></table></div>
      ${locked ? '' : `<div class="panel-b row" style="gap:8px">${teamAddSelect(c, new Set(base.teams.map(t => t.id)), 'nc')}<span class="muted" style="font-size:12px">${plural(base.teams.length, 'team')} · ${plural(base.teams.length * 2, 'seat')}${empty ? ` (${empty} empty)` : ''}</span></div>`}
      <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">${locked ? 'A real season’s teams come from real life.' : `${tplY ? `Keeping the teams carries this season’s grid over as it ends (with the moves you’ve signed); following the real grid brings in ${year}’s real teams and line-ups. ` : ''}A team added here is announced in the stories with its own graphic, and its seats start empty: sign drivers for it from the line-up below. A team taken off leaves its drivers free to sign.`}</div></div>`;
  const lineup = `<div class="panel"><div class="panel-h"><h2>${year} line-up, as it stands</h2><button class="btn sm primary" data-act="tr-new-next">New transfer for ${year}</button></div>
      <div class="panel-b">${gridCards(c, s, base.teams, base.drivers, { act: 'tr-new-next-d', year })}<p class="muted" style="font-size:12px;margin:8px 0 0">This season’s grid with only the moves confirmed for ${year}: nothing is predicted. Transfers made here take effect from ${year}, never mid-season.</p></div></div>`;
  const calendar = `<div class="panel"><div class="panel-h"><h2>The ${year} calendar</h2><div class="row" style="gap:6px">${own ? `<button class="btn sm ghost" data-act="nc-reset">Back to the default</button>` : ''}<button class="btn sm ${ann && !changedSince ? '' : 'primary'}" data-act="nc-announce">${ann ? (changedSince ? 'Announce the changes' : 'Announced') : 'Announce'}</button></div></div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th class="num">#</th><th>Grand Prix</th><th></th><th>Contract</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="panel-b row" style="gap:8px"><select data-ch="nc-add"><option value="">+ Add a track…</option><option value="__new">+ A new track…</option>${addable.map(tid => `<option value="${tid}">${esc(trackGp(tid).name)}${D.TRACKS[tid]?.circuit ? ` · ${esc(D.TRACKS[tid].circuit)}` : ''}</option>`).join('')}</select><span class="muted" style="font-size:12px">${plural(cal.length, 'round')} · ${cal.filter(r => r.sprint).length} sprints</span></div>
      <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">Contracts: seasons left after ${s.year}. Change one and the press reports the new deal. Announce the calendar and it goes in the stories, round by round${addable.length ? ', with a breaking story for any venue new to the calendar' : ''}.</div></div>`;
  return only === 'cal' ? calendar : only === 'lineup' ? lineup : only === 'teams' ? teamsPanel : `<div class="stack">${teamsPanel}${lineup}${calendar}</div>`;
}
/* ------------------------------------------------------------ teams */
// F1's classic teams before 2016 (the results Pitwall holds start then): [id, name, first season, last, colour, second colour]
const CLASSIC_TEAMS = [
  ['cooper', 'Cooper', 1950, 1969, '#1F6B3A', '#FFFFFF'], ['maserati', 'Maserati', 1950, 1960, '#1E4FA3', '#E10600'], ['brm', 'BRM', 1951, 1977, '#2F6B47', '#F28C28'],
  ['vanwall', 'Vanwall', 1954, 1960, '#004225', '#FFFFFF'], ['lotus', 'Lotus', 1958, 1994, '#004225', '#FFD100'], ['brabham', 'Brabham', 1962, 1992, '#0B3D91', '#FFFFFF'],
  ['matra', 'Matra', 1967, 1972, '#2F5EA8', '#FFFFFF'], ['tyrrell', 'Tyrrell', 1970, 1998, '#1F3E8C', '#FFFFFF'], ['shadow', 'Shadow', 1973, 1980, '#15151E', '#F2F2F2'],
  ['hesketh', 'Hesketh', 1974, 1978, '#F2F2F2', '#E10600'], ['ligier', 'Ligier', 1976, 1996, '#1E5BC6', '#FFFFFF'], ['arrows', 'Arrows', 1978, 2002, '#FF6A13', '#15151E'],
  ['minardi', 'Minardi', 1985, 2005, '#15151E', '#FFD100'], ['benetton', 'Benetton', 1986, 2001, '#28A745', '#00A3E0'], ['jordan', 'Jordan', 1991, 2005, '#F7D117', '#15151E'],
  ['stewart', 'Stewart', 1997, 1999, '#F2F2F2', '#1F3E8C'], ['prost', 'Prost', 1997, 2001, '#1E5BC6', '#F2F2F2'], ['bar', 'BAR', 1999, 2005, '#F2F2F2', '#E10600'],
  ['jaguar', 'Jaguar', 2000, 2004, '#00563F', '#FFFFFF'], ['toyota', 'Toyota', 2002, 2009, '#E10600', '#FFFFFF'], ['honda', 'Honda', 2006, 2008, '#F2F2F2', '#E10600'],
  ['superaguri', 'Super Aguri', 2006, 2008, '#E10600', '#FFFFFF'], ['brawn', 'Brawn', 2009, 2009, '#D6F03C', '#F2F2F2'], ['caterham', 'Caterham', 2012, 2014, '#005030', '#FFD100'],
];
const classicTeam = (id) => { const t = CLASSIC_TEAMS.find(x => x[0] === id); return t && { id: t[0], name: t[1], first: t[2], last: t[3], color: t[4], color2: t[5] }; };
/** Every team that can go on a grid: F1's since 1950, today's, and the career's own. { hist: [...], own: [...] } */
function teamChoices(c) {
  const by = {}; for (const t of CLASSIC_TEAMS) by[t[0]] = classicTeam(t[0]);
  for (const y of Object.keys(H.seasons || {}).map(Number).sort((a, b) => a - b)) for (const t of H.seasons[y].teams) { const o = by[t.id] ||= { id: t.id, name: t.name, first: y }; o.name = t.name; o.last = y; }
  for (const t of [...D.GRID_2025, ...D.GRID_2026, ...Object.values(D.EXTRA_2025)]) { const o = by[t.id] ||= { id: t.id }; o.name = t.name; }
  const own = Object.values(c.customTeams || {});
  return { hist: Object.values(by).filter(t => t.id !== MYTEAM && !c.customTeams?.[t.id]).sort((a, b) => a.name.localeCompare(b.name)), own };
}
function teamAddSelect(c, on, scope) {
  const { hist, own } = teamChoices(c); const ok = (t) => !on.has(t.id);
  const yrs = (t) => t.first ? ` (${t.first === t.last ? t.first : `${t.first}–${t.last}`})` : '';
  return `<select data-ch="team-add" data-scope="${scope}" style="width:auto"><option value="">+ Add a team…</option><option value="__new">+ A new team…</option>${own.filter(ok).length ? `<optgroup label="Your teams">${own.filter(ok).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</optgroup>` : ''}<optgroup label="From F1’s history">${hist.filter(ok).map(t => `<option value="${esc(t.id)}">${esc(t.name)}${yrs(t)}</option>`).join('')}</optgroup></select>`;
}
/** Whether a team has run in any session of a season logged so far (it can't be taken off it then). */
const teamRaced = (s, id) => activeRounds(s).some((r, ri) => Object.values(s.weekends[r.id]?.sessions || {}).some(sd => sd?.done && sd.results?.some(x => teamAt(s, x.d, ri)?.id === id)));
/** A team on a grid: 'nc' next season's (announced in the stories), 'cur' the season you're in (from the next race). */
function teamAdd(scope, id) {
  if (!id) return; const c = career(); const s = latestSeason();
  if (scope === 'cur') { if (!s.teams.some(t => t.id === id)) { const m = teamMeta(c, id); s.teams.push({ id, name: m.name, color: m.color, drivers: [null, null] }); toast(`${m.name} joins the ${s.year} grid: give it its drivers above`); } }
  else {
    const y = s.year + 1; const E = (c.teamEdits ||= {})[y] ||= { add: [], remove: [] };
    if (E.remove.includes(id)) E.remove = E.remove.filter(x => x !== id);
    else if (!E.add.includes(id)) { E.add.push(id); (c.teamNews ||= []).push({ id, year: y, si: s.index, ri: Math.max(0, roundsDone(s) - 1), at: new Date().toISOString() }); }
  }
  store.save(); render();
}
function teamRemove(scope, id) {
  const c = career(); const s = latestSeason();
  if (scope === 'cur') {
    if (id === s.playerTeamId || id === MYTEAM) { toast('That’s your own team'); return; }
    if (teamRaced(s, id)) { toast('That team has raced this season: its results would go with it'); return; }
    s.teams = s.teams.filter(t => t.id !== id);
  } else {
    const y = s.year + 1; const E = (c.teamEdits ||= {})[y] ||= { add: [], remove: [] };
    if (E.add.includes(id)) { E.add = E.add.filter(x => x !== id); c.teamNews = (c.teamNews || []).filter(n => !(n.id === id && n.year === y)); }
    else if (!E.remove.includes(id)) E.remove.push(id);
  }
  store.save(); render();
}
/** A team of your own: its name, colours (the main one for its banner, the second behind its logo) and logo. */
function teamAddModal(scope) {
  ui.modal = { kind: 'team-add', scope, t: ui.modal?.kind === 'team-add' ? ui.modal.t : { color: '#E10600', color2: '#15151E' } }; drawTeamAddModal();
}
function drawTeamAddModal() {
  const t = ui.modal.t; const f = (k, label, extra = '') => `<label class="field"><span>${label}</span><input data-ch="team-field" data-k="${k}" value="${esc(t[k] ?? '')}" ${extra}></label>`;
  const col = (k, label) => `<label class="field"><span>${label}</span><span class="row" style="gap:8px"><input type="color" data-ch="team-field" data-k="${k}" value="${esc(t[k])}"><span class="mono muted">${esc(t[k])}</span></span></label>`;
  const short = (t.short || t.name || '').trim().slice(0, 3).toUpperCase();
  modal(`<div class="modal-h"><h2>A new team</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b stack">
      <div class="form-grid">${f('name', 'Name', 'placeholder="Pitwall Racing"')}${f('short', 'Short name (3 letters)', 'maxlength="3" placeholder="PWR"')}
        ${col('color', 'Main colour (its banner)')}${col('color2', 'Second colour (behind its logo)')}
        ${f('base', 'Base (optional)', 'placeholder="Silverstone, United Kingdom"')}${f('engine', 'Engine (optional)', 'placeholder="Mercedes"')}</div>
      <div class="row" style="gap:10px">${t.logo ? `<img src="${esc(t.logo)}" alt="" style="height:36px;max-width:90px;object-fit:contain">` : `<span style="display:inline-grid;place-items:center;min-width:52px;height:30px;padding:0 6px;border-radius:4px;background:${esc(t.color)};color:${contrastInk(t.color)};font:700 13px var(--font-display)">${esc(short || 'ABC')}</span>`}
        <label class="btn sm">${t.logo ? 'Change the logo' : 'Upload a logo'}<input type="file" accept="image/*" data-ch="team-logo" hidden></label>${t.logo ? '<button class="btn sm ghost" data-act="team-logo-clear">Remove</button>' : ''}<span class="muted" style="font-size:12px">Without one, its short name stands in.</span></div>
      <p class="muted" style="font-size:12px;margin:0">It's kept with this career, so it can go on any season's grid. Its seats start empty.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="team-add-save">Add the team</button></div>`);
}
function teamAddSave() {
  const c = career(); const t = ui.modal.t; const name = (t.name || '').trim(); if (!name) { toast('Give the team a name'); return; }
  const taken = new Set([...teamChoices(c).hist.map(x => x.id), ...Object.keys(c.customTeams || {}), MYTEAM]);
  let id = 'T-' + (swSlug(name) || 'team'); while (taken.has(id)) id += '2';
  (c.customTeams ||= {})[id] = { id, name, short: ((t.short || '').trim() || name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase(), color: t.color || '#E10600', color2: t.color2 || '#15151E', base: (t.base || '').trim() || null, engine: (t.engine || '').trim() || null, logo: t.logo || null, custom: true };
  const scope = ui.modal.scope; closeModal(); teamAdd(scope, id);
}
/** A team's second colour (the background of its graphic). */
const teamColor2 = (c, id) => c?.customTeams?.[id]?.color2 || D.TEAM_BIO[id]?.color2 || H.oldTeams?.[id]?.color2 || classicTeam(id)?.color2 || null;

/** A team added to next season's grid on the Next Season tab: breaking news the weekend it was added. */
function teamStories(c, s) {
  const out = []; const rounds = activeRounds(s);
  for (const n of (c.teamNews || []).filter(x => x.si === s.index)) {
    if (!(c.teamEdits?.[n.year]?.add || []).includes(n.id)) continue; // taken off again since
    const m = teamMeta(c, n.id); const rnd = seeded(`team-${n.id}-${n.year}`);
    // the last season it raced: in this career, or in real life before it
    let last = null; for (const se of c.seasons) if (se.year < n.year && se.teams.some(t => t.id === n.id) && (isHist(se) || roundsDone(se))) last = Math.max(last || 0, se.year);
    for (const [y, h] of Object.entries(H.seasons || {})) if (+y < n.year && h.teams.some(t => t.id === n.id)) last = Math.max(last || 0, +y);
    if (classicTeam(n.id)) last = Math.max(last || 0, classicTeam(n.id).last);
    const ct = c.customTeams?.[n.id]; const bio = D.TEAM_BIO[n.id] || H.oldTeams?.[n.id];
    const count = nextLineup(c, s).teams.length; const extra = [ct?.base || bio?.base ? `based in ${ct?.base || bio.base}` : '', ct?.engine ? `with ${ct.engine} power` : ''].filter(Boolean).join(', ');
    out.push({ id: `team-${n.id}-${n.year}`, seq: n.ri * 10 + 9.05, kind: 'transfer', i: n.ri, r: rounds[n.ri] || null, subject: null, outlet: choose(rnd, D.OUTLETS), kicker: 'Breaking', massive: true,
      teamGfx: { id: n.id, line: last ? `Returns to the grid in ${n.year}` : `Joins the grid in ${n.year}` },
      headline: last ? choose(rnd, [`BREAKING: ${m.name} returns to the grid in ${n.year}`, `${m.name} is back: F1 return confirmed for ${n.year}`]) : choose(rnd, [`BREAKING: ${m.name} to join the grid in ${n.year}`, `${m.name} confirmed as F1’s newest team for ${n.year}`]),
      standfirst: last ? `${m.name} will be back on the Formula 1 grid in ${n.year}${n.year - last > 1 ? `, its first season since ${last}` : ''}${extra ? `, ${extra}` : ''}.`
        : `${m.name} will make its Formula 1 debut in ${n.year}${extra ? `, ${extra}` : ''}, one of ${count} teams on the grid.`,
      body: [`Its two seats are yet to be filled.`], quotes: [] });
  }
  return out;
}

/** The calendar announcement, new venues and track deals, as stories in the season they happened. */
function calendarStories(c, s) {
  const out = []; const rounds = activeRounds(s);
  const ann = c.calAnnounced?.[s.year + 1];
  // a driver's name as of a season they raced (they may not be on this year's grid)
  const told = new Set(); // track deals already told in a new venue's story
  // When the news comes out. The next season's calendar is decided when you announce it, but the paddock hears it over
  // the season: each new venue on a weekend of its own after that (in the first 70% of what's left), then the full
  // calendar on a weekend after the last of them. A deal for a track on this season's calendar is announced on its
  // race weekend (or straight away, if that's been and gone); any other deal on a weekend after it was made. Each
  // weekend is picked at random but always the same one, and a story waits until its weekend's race has been run.
  const lastI = rounds.length - 1; const showTo = Math.max(0, roundsDone(s) - 1);
  const pickIn = (key, a, b) => b <= a ? a : a + Math.floor(seeded(key)() * (b - a + 1));
  const name = (d, s2 = s) => d === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : (s2.drivers[d] ? dName(s2, d) : null) || refName(d);
  // the announcement for next season, and a fresh one when this season started on a calendar never announced or changed since
  for (const [ann, y] of [[c.calAnnounced?.[s.year + 1], s.year + 1], [c.calReannounced?.[s.year], s.year]]) if (ann && ann.si === s.index) { const rnd = seeded(`cal-${y}-${ann.at}`);
    // (a calendar announced again at the start of its own season comes out at once, as before)
    const spread = y === s.year + 1 && ann.ri >= 0 && lastI >= 0; const a0 = Math.max(0, Math.min(ann.ri, lastI)); const kNew = {}; let kCal = ann.ri;
    if (spread) {
      const newTo = a0 + Math.floor((lastI - a0) * 0.7);
      for (const tid of ann.newTracks) kNew[tid] = pickIn(`cal-new-at-${y}-${tid}`, a0, newTo);
      const after = ann.newTracks.length ? Math.min(lastI, Math.max(...Object.values(kNew)) + 1) : a0;
      kCal = pickIn(`cal-at-${y}`, after, lastI);
    }
    const r0 = rounds[kCal] || null;
    const lines = ann.cal.map((r, k) => {
      const tid = roundTrackId(r); const W = trackWinners(c, tid); const most = Object.entries(W.reduce((a, x) => (a[x.d] = (a[x.d] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1])[0];
      const isNew = ann.newTracks.includes(tid); const last = isNew ? lastHeld(c, tid, y) : null;
      return `Round ${k + 1}: ${r.name}${r.venue ? ` (${r.venue})` : ''}${r.sprint ? ', a sprint weekend' : ''}.${isNew ? (last ? ` Back on the calendar for the first time since ${last}.` : ' A new venue for Formula 1.') : ''}${W[0] ? ` Last winner: ${name(W[0].d, W[0].s)} (${W[0].year}).` : ''}${most && most[1] >= 2 ? ` Most wins: ${name(most[0], W.find(x => x.d === most[0]).s)}, ${most[1]}.` : ''}`;
    });
    if (!spread || kCal <= showTo) out.push({ id: `cal-${y}${ann.ri < 0 ? '-re' : ''}`, seq: kCal * 10 + 9.3, kind: 'calendar', i: kCal, r: r0, subject: null, calGfx: { year: y, cal: ann.cal.map(r => [r.id, r.name, r.venue, roundTrackId(r), !!r.sprint]), fresh: ann.cal.map((r, k) => ann.newTracks.includes(roundTrackId(r)) ? k : -1).filter(k => k >= 0) }, outlet: choose(rnd, D.OUTLETS), kicker: 'Calendar', massive: true,
      headline: choose(rnd, [`F1 reveals the ${y} calendar: ${ann.cal.length} rounds`, `${ann.cal.length} races, ${ann.cal.filter(r => r.sprint).length} sprints: the ${y} calendar is out`, `From ${ann.cal[0].name} to ${ann.cal[ann.cal.length - 1].name}: F1’s ${y} schedule`]),
      standfirst: `The ${y} season opens in ${ann.cal[0].name} and ends in ${ann.cal[ann.cal.length - 1].name}${ann.newTracks.length ? `, with ${listJoin(ann.newTracks.map(t => trackGp(t).name))} new to the calendar` : ''}.`, body: [], more: { title: 'Round by round', lines }, quotes: [] });
    for (const tid of ann.newTracks) {
      const last = lastHeld(c, tid, y); const deal = (c.trackDeals || []).filter(d => d.tid === tid && d.si === s.index).pop(); const T = D.TRACKS[tid]; const nm = trackGp(tid).name;
      if (deal) told.add(deal); // one story for the new venue and its deal, not two
      const yrs = deal ? deal.to - s.year : 0; const k = spread ? kNew[tid] : ann.ri; if (spread && k > showTo) continue;
      out.push({ id: `cal-new-${y}-${tid}${ann.ri < 0 ? '-re' : ''}`, seq: k * 10 + 9.1, kind: 'calendar', i: k, r: rounds[k] || null,
        trackGfx: { tid, kick: 'Breaking', line: `${last ? `Back in ${y}, the first race there since ${last}` : `New to the calendar in ${y}`}${deal ? ` · deal to ${deal.to}` : ''}` }, subject: null, outlet: choose(rnd, D.OUTLETS), kicker: 'Breaking', massive: true,
        headline: `BREAKING: F1 to race in ${T?.country || nm}${deal && yrs > 0 ? ` on a ${yrs}-year deal` : ''}`, standfirst: `${nm}${T?.circuit ? ` (${T.circuit})` : ''} joins the ${y} calendar${last ? `, the first race there since ${last}` : ', a brand-new venue for Formula 1'}${deal ? `, ${yrs > 0 ? `on a ${yrs}-year contract` : 'on a contract'} running to the end of ${deal.to}` : ''}.`, body: [], quotes: [] });
    }
  }
  for (const d of (c.trackDeals || []).filter(x => x.si === s.index && !told.has(x))) {
    const nm = trackGp(d.tid).name; const rnd = seeded(`deal-${d.tid}-${d.at}`); const years = d.to - s.year;
    const longer = d.from == null || d.to > d.from;
    const kt = rounds.findIndex(r => roundTrackId(r) === d.tid); const k = kt >= d.ri ? kt : pickIn(`deal-at-${d.tid}-${d.at}`, Math.min(d.ri, lastI), lastI);
    if (k > showTo) continue;
    out.push({ id: `deal-${d.tid}-${d.at}`, seq: k * 10 + 9.2, kind: 'calendar', i: k, r: rounds[k] || null,
      trackGfx: { tid: d.tid, kick: longer ? 'Breaking' : 'Calendar', line: d.from == null ? `Signs a ${years}-year deal, to ${d.to}` : longer ? `Extends its F1 deal to ${d.to}` : `Deal cut short: now ends in ${d.to}` }, subject: null, outlet: choose(rnd, D.OUTLETS), kicker: longer ? 'Breaking' : 'Calendar',
      headline: d.from == null ? `BREAKING: ${nm} seals ${years}-year deal with F1` : longer ? choose(rnd, [`BREAKING: ${nm} extends F1 deal to ${d.to}`, `${nm} stays on the calendar until ${d.to}`]) : choose(rnd, [`${nm}’s F1 deal cut short`, `${nm} to leave the calendar sooner: deal now ends in ${d.to}`]),
      standfirst: d.from == null ? `${nm} has signed a ${years}-year contract to host Formula 1, running to the end of ${d.to}.` : longer ? `${nm}’s contract, due to end in ${d.from}, now runs to the end of ${d.to}: ${plural(years, 'more season')} after ${s.year}.` : `${nm}’s contract was due to run until ${d.from}. It now ends after ${d.to}${d.to <= s.year ? ', this season' : ''}.`, body: [], quotes: [] });
  }
  return out;
}
