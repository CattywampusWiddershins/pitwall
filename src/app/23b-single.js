/* Pitwall — Single weekend. Part of the renderer, split into files that load in order (see index.html).
   One F1 25 weekend outside any career (the game's Grand Prix mode): a year from the first real season to 2026, a
   driver on that year's grid, any circuit (that year's, any other, or one you add) and whether it's a sprint weekend.
   It's saved like a career as that driver with only that round on the calendar, so the weekend, Live Race and the
   debrief work as they do in a career, without the championship. A single weekend's menu has only Current Weekend
   (and Settings, where the telemetry is set up). A track you add is kept for every save; its outline comes from
   practice, as for any track, and is kept for every save too. */
'use strict';
const swSlug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
/** The single weekend's part of New Career: the year, the driver, the track and its format. */
function singleSetupHtml(u) {
  const years = Array.from({ length: 2026 - HIST_FROM + 1 }, (_, k) => HIST_FROM + k); if (u.year > 2026 || u.year < HIST_FROM) u.year = 2026;
  const tpl = templateFor(u.year, null); const grid = setupGrid(u);
  const rounds = (tpl?.cal || []).map(([id, name, venue, sprint, track]) => ({ id, name, venue, sprint, track: track || id }));
  const onCal = new Set(rounds.map(r => r.track));
  // every other circuit: the current ones, the former ones, and those you added
  const others = Object.entries(D.TRACKS).filter(([id]) => !onCal.has(id)).map(([id, t]) => ({ id, name: trackGp(id).name, venue: t.circuit || trackGp(id).venue, track: id, custom: !!t.custom, former: !!t.former }))
    .sort((a, b) => (a.custom - b.custom) || (a.former - b.former) || a.name.localeCompare(b.name));
  const all = [...rounds, ...others];
  if (!all.some(r => r.track === u.singleTrack)) { u.singleTrack = rounds[0]?.track || null; u.singleSprint = null; }
  const pick = all.find(r => r.track === u.singleTrack); if (u.singleSprint == null) u.singleSprint = !!pick?.sprint;
  const drivers = grid.flatMap(t => t.drivers).filter(Boolean); if (!drivers.includes(u.realDriver)) u.realDriver = '';
  const team = grid.find(t => t.drivers.includes(u.realDriver));
  const yearSeg = years.map(y => `<button data-act="setup-year" data-v="${y}" class="${u.year === y ? 'on' : ''}">${y}</button>`).join('');
  const driverOpts = grid.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(Boolean).map(d => `<option value="${d}" ${u.realDriver === d ? 'selected' : ''}>${esc(anyName(d))}</option>`).join('')}</optgroup>`).join('');
  const btn = (x) => `<button class="sw-track ${x.track === u.singleTrack ? 'on' : ''}" data-act="setup-single-track" data-v="${esc(x.track)}">${trackMap(x.track, 46) || '<span class="sw-noimg">?</span>'}<span><b>${esc(x.name)}</b><small>${esc(x.venue || '')}${x.sprint ? ' · sprint' : ''}${x.custom ? ' · added' : x.former ? ' · former' : ''}</small></span></button>`;
  const practice = [['full', 'Full (FP1, FP2, FP3)'], ['short', 'Short (one session)'], ['none', 'None']].map(([v, l]) => `<option value="${v}" ${u.practice === v ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="panel"><div class="panel-h"><h2>The year</h2><span class="muted" style="font-size:12px">That year’s grid and teams</span></div><div class="panel-b"><div class="seg year-seg">${yearSeg}</div></div></div>
    <div class="panel"><div class="panel-h"><h2>Who you race as</h2></div><div class="panel-b stack">
      <label class="field" style="max-width:360px"><span>Driver</span><select data-ch="setup" data-k="realDriver"><option value="">Pick a driver…</option>${driverOpts}</select></label>
      ${u.realDriver ? `<div class="muted" style="font-size:13px"><b style="color:var(--fg)">${esc(anyName(u.realDriver))}</b> · ${esc(team?.name || '')} · ${u.year}</div>` : ''}
    </div></div>
    <div class="panel"><div class="panel-h"><h2>The track</h2><span class="muted" style="font-size:12px">Any circuit, or add one</span></div><div class="panel-b stack">
      <span class="label">On the ${u.year} calendar</span><div class="sw-tracks">${rounds.map(btn).join('')}</div>
      <span class="label">Other circuits</span><div class="sw-tracks">${others.map(btn).join('')}</div>
      <button class="btn sm ghost" data-act="track-add-open" data-v="single" style="align-self:flex-start">+ Add a track</button>
      <label class="row" style="gap:8px"><input type="checkbox" data-ch="setup-single-sprint" ${u.singleSprint ? 'checked' : ''}><span><b>Sprint weekend</b> <span class="muted">(sprint qualifying and a sprint on Saturday)</span></span></label>
      <label class="field" style="max-width:360px"><span>Practice sessions</span><select data-ch="setup" data-k="practice">${practice}</select></label>
    </div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="create-career">Start the ${esc(pick?.name || '')} weekend</button></div>`;
}
/** The single weekend's round: the chosen track (added to the calendar if that year didn't race there), sprint or not, the rest off. */
function swRound(c, u) {
  const s0 = c.seasons[c.seasons.length - 1]; const tid = u.singleTrack;
  let r = s0.calendar.find(x => (x.track || x.id) === tid);
  if (!r) { const g = trackGp(tid); let id = g.id; while (s0.calendar.some(x => x.id === id)) id += '2'; r = { ...g, id, ...(id !== tid ? { track: tid } : {}), sprint: false, off: false }; s0.calendar.push(r); }
  r.sprint = !!u.singleSprint;
  for (const x of s0.calendar) x.off = x !== r;
  c.single = { track: r.id, year: u.year, circuit: tid };
}

/* ------------------------------------------------- adding a track, anywhere */
/** Every nationality and every country Pitwall knows, as lists to type into (the browser narrows them as you type). */
function natDatalist() {
  const all = new Set([...Object.keys(A.nat), ...Object.values(H.allTime || {}).map(x => x.nat).filter(Boolean), ...Object.values(D.DRIVER_BIO).map(b => b.nat).filter(Boolean)]);
  return `<datalist id="dl-nat">${[...all].sort().map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
}
function countryDatalist() {
  const all = new Set([...Object.keys(A.country), ...Object.values(D.TRACKS).map(t => t.country).filter(Boolean)]);
  return `<datalist id="dl-country">${[...all].sort().map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
}
/**
 * A new track, with the details every built-in one has: the Grand Prix's name, the circuit, where it is, its laps,
 * length and corners, and a few words about it. ctx: where it was asked for ('single', 'circuits', or a calendar:
 * 'cal' Settings, 'nc' Next Season, 'fc' a future start), which also gets the track on its calendar.
 */
function trackAddModal(ctx) {
  ui.modal = { kind: 'track-add', ctx, t: ui.modal?.kind === 'track-add' ? ui.modal.t : {} }; drawTrackAddModal();
}
/** The World Map's circuits that aren't a track yet (built in, or added from it before), by name. */
function wmTrackChoices() {
  const used = new Set(Object.values(D.TRACKS).map(t => t.wc).filter(Boolean));
  return (W?.circuits || []).filter(x => !x.track && !used.has(x.id)).sort((a, b) => proseName(a.name).localeCompare(proseName(b.name)));
}
/** A track's details, from what the World Map knows about a circuit: its name and place, the latest race's laps, the
 *  lap length and outline (bacinger/f1-circuits), its first Grand Prix, the fastest race lap there and its story. */
function wmPreset(id) {
  const x = W?.circuits?.find(c => c.id === id); if (!x) return null;
  const country = Object.values(D.TRACKS).find(t => t.country && A.country[t.country] === x.cc)?.country || Object.keys(A.country).find(k => A.country[k] === x.cc) || ccName(x.cc);
  const name = proseName(x.name); const span = x.first === x.last ? `in ${x.first}` : `between ${x.first} and ${x.last}`;
  const top = (x.top || []).filter(w => w[1] > 1); const who = (w) => `${proseName(w[0])} (${w[1]})`;
  const about = `${name} held ${gpWord(x.gps)} ${span}${x.races?.[0] ? `, as the ${x.races.join(', the ')}` : ''}.`
    + (top.length ? ` Its most frequent winner${top.length > 1 ? 's' : ''}: ${top.map(who).join(', ')}.` : '')
    + (x.lastWin ? ` The last, in ${x.lastWin.year}, was won by ${proseName(x.lastWin.name)}.` : '');
  return { wc: x.id, gp: country, circuit: name, city: x.loc || '', country, laps: x.laps || '', km: x.km || '', corners: '', firstGP: x.first || '', about,
    record: x.record || null, map: x.map || null };
}
function drawTrackAddModal() {
  const t = ui.modal.t; const wm = wmTrackChoices(); const yrs = (x) => x.first === x.last ? x.first : `${x.first}–${x.last}`; const f = (k, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input type="${type}" data-ch="track-add" data-k="${k}" value="${esc(t[k] ?? '')}" ${extra}></label>`;
  modal(`<div class="modal-h"><h2>Add a track</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b stack">
      ${wm.length ? `<label class="field"><span>Start from a circuit on the World Map (optional)</span><select data-ch="track-add-wm"><option value="">None: a track of my own</option>${wm.map(x => `<option value="${esc(x.id)}" ${t.wc === x.id ? 'selected' : ''}>${esc(proseName(x.name))} · ${esc(x.loc || '')}, ${esc(x.country)} · ${yrs(x)}</option>`).join('')}</select></label>` : ''}
      ${t.wc ? `<p class="muted" style="font-size:12px;margin:0">Filled in from the World Map${t.map ? ', with its outline' : ''}${t.record ? ` and its fastest race lap (${esc(t.record[0])}, ${esc(t.record[1])}, ${t.record[2]})` : ''}. Change anything you like; corners aren't known, so add them if you know them.</p>` : ''}
      <div class="form-grid">${f('gp', 'Grand Prix name', 'text', 'placeholder="Portugal"')}${f('circuit', 'Circuit', 'text', 'placeholder="Autódromo Internacional do Algarve"')}
        ${f('city', 'City or area', 'text', 'placeholder="Portimão"')}${f('country', 'Country', 'text', 'list="dl-country" placeholder="Start typing…" autocomplete="off"')}
        ${f('laps', 'Race laps (full distance)', 'number', 'min="1" max="200" placeholder="66"')}${f('km', 'Length (km)', 'number', 'min="1" max="10" step="0.001" placeholder="4.653"')}
        ${f('corners', 'Corners', 'number', 'min="1" max="40" placeholder="15"')}${f('firstGP', 'First Grand Prix (year)', 'number', 'min="1950" max="2100" placeholder="2020"')}</div>
      <label class="field"><span>About the track (optional)</span><textarea data-ch="track-add" data-k="about" placeholder="Rollercoaster climbs and blind crests in the Algarve hills…">${esc(t.about || '')}</textarea></label>
      <p class="muted" style="font-size:12px;margin:0">It joins Circuits and the calendars of every save${t.wc ? ', and the World Map links its circuit to it' : ''}. ${t.map ? 'Its outline is the real circuit\'s.' : 'Its outline is drawn'}${t.map ? '' : ' from practice the first time you drive it with telemetry on (as for any track).'} Pitwall learns which F1 25 track it is from your first session there; ${t.map ? 'that is' : 'both are'} kept for every save.</p>
      ${countryDatalist()}
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="track-add-save">Add the track</button></div>`);
}
/** A track added: kept for every save. { id } or { error }. */
function swAddTrack(add) {
  const circuit = (add?.circuit || '').trim(), country = (add?.country || '').trim();
  if (!circuit || !country) return { error: 'Give the track a circuit name and a country' };
  if (!(+add.km > 0)) return { error: 'Give the track its lap length in km (it sets the race distance)' };
  let id = 'x-' + (swSlug(circuit) || 'track'); while (D.TRACKS[id] && !D.TRACKS[id].custom) id += '2';
  const gp = (add.gp || '').trim() || country; const km = +add.km; const year = +add.firstGP || null;
  const t = { circuit, gp, country, city: (add.city || '').trim() || country, laps: Math.max(1, Math.round(+add.laps || 50)), km, corners: +add.corners || null, firstGP: year,
    about: (add.about || '').trim() || `${circuit}${add.city ? `, in ${add.city.trim()}` : ''}: the home of the ${gp} Grand Prix in your Pitwall.`, record: null };
  // from the World Map: the circuit it is, its real outline and the fastest race lap there
  const pre = add.wc ? wmPreset(add.wc) : null; if (pre) { t.wc = pre.wc; if (pre.map) t.map = pre.map; if (pre.record) t.record = pre.record; }
  (state.customTracks ||= {})[id] = t; D.TRACKS[id] = { ...t, history: [], custom: true }; store.save();
  return { id };
}
