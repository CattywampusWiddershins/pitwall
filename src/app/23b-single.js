/* Pitwall — Single weekend. Part of the renderer, split into files that load in order (see index.html).
   One F1 25 weekend outside any career (the game's Grand Prix mode): a year from the first real season to 2026, a
   driver on that year's grid and one of that year's tracks. It's saved like a career as that driver with only that
   round on the calendar, so the weekend, Live Race and the debrief work as they do in a career, without the
   championship. A single weekend's menu has only Current Weekend (and Settings, where the telemetry is set up). */
'use strict';
/** The single weekend's part of New Career: the year, the driver, the track. */
function singleSetupHtml(u) {
  const years = Array.from({ length: 2026 - HIST_FROM + 1 }, (_, k) => HIST_FROM + k); if (u.year > 2026 || u.year < HIST_FROM) u.year = 2026;
  const tpl = templateFor(u.year, null); const grid = setupGrid(u);
  const rounds = (tpl?.cal || []).map(([id, name, venue, sprint, track]) => ({ id, name, venue, sprint, track }));
  if (!rounds.some(r => r.id === u.singleTrack)) u.singleTrack = rounds[0]?.id || null;
  const drivers = grid.flatMap(t => t.drivers).filter(Boolean); if (!drivers.includes(u.realDriver)) u.realDriver = '';
  const r = rounds.find(x => x.id === u.singleTrack); const team = grid.find(t => t.drivers.includes(u.realDriver));
  const yearSeg = years.map(y => `<button data-act="setup-year" data-v="${y}" class="${u.year === y ? 'on' : ''}">${y}</button>`).join('');
  const driverOpts = grid.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(Boolean).map(d => `<option value="${d}" ${u.realDriver === d ? 'selected' : ''}>${esc(anyName(d))}</option>`).join('')}</optgroup>`).join('');
  const trackBtns = rounds.map(x => `<button class="sw-track ${x.id === u.singleTrack ? 'on' : ''}" data-act="setup-single-track" data-v="${x.id}">${trackMap(x.track || x.id, 46)}<span><b>${esc(x.name)}</b><small>${esc(x.venue || '')}${x.sprint ? ' · sprint' : ''}</small></span></button>`).join('');
  const practice = [['full', 'Full (FP1, FP2, FP3)'], ['short', 'Short (one session)'], ['none', 'None']].map(([v, l]) => `<option value="${v}" ${u.practice === v ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="panel"><div class="panel-h"><h2>The year</h2><span class="muted" style="font-size:12px">That year’s grid, teams and tracks</span></div><div class="panel-b"><div class="seg year-seg">${yearSeg}</div></div></div>
    <div class="panel"><div class="panel-h"><h2>Who you race as</h2></div><div class="panel-b stack">
      <label class="field" style="max-width:360px"><span>Driver</span><select data-ch="setup" data-k="realDriver"><option value="">Pick a driver…</option>${driverOpts}</select></label>
      ${u.realDriver ? `<div class="muted" style="font-size:13px"><b style="color:var(--fg)">${esc(anyName(u.realDriver))}</b> · ${esc(team?.name || '')} · ${u.year}</div>` : ''}
    </div></div>
    <div class="panel"><div class="panel-h"><h2>The track</h2><span class="muted" style="font-size:12px">${plural(rounds.length, 'round')} on the ${u.year} calendar</span></div><div class="panel-b stack">
      <div class="sw-tracks">${trackBtns}</div>
      <label class="field" style="max-width:360px"><span>Practice sessions</span><select data-ch="setup" data-k="practice">${practice}</select></label>
    </div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="create-career">Start the ${esc(r?.name || '')} weekend</button></div>`;
}
