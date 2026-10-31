/* Pitwall — Buttons and inputs: every data-act and data-ch handler. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ---------------------------------------------------------------- actions */
const actions = {
  'conflict-pick'(el) { ui.conflicts[+el.dataset.i].pick = el.dataset.v; conflictModal(ui.conflicts); },
  'conflict-all'(el) { ui.conflicts.forEach(x => { x.pick = el.dataset.v; }); conflictModal(ui.conflicts); },
  'conflict-done'() {
    // the merge used this device's version; swap in the other side's where that was picked
    for (const x of ui.conflicts || []) if (x.pick === 'remote') setAt(state, x.path, x.remote === undefined ? undefined : JSON.parse(JSON.stringify(x.remote)));
    ui.conflicts = null; closeModal(); store.save(); render(); toast('Both devices are in sync');
  },
  'nav-toggle'() { setNavOpen(!document.body.classList.contains('nav-open')); },
  'nav-close'() { setNavOpen(false); },
  async 'companion-enable'(el) { companion = await window.api.companion.enable(el.dataset.on === '1'); render(); },
  async 'companion-pin'() { companion = await window.api.companion.newPin(); render(); },
  'companion-forget'(el) {
    const one = el.dataset.id;
    confirmBox(one ? 'Disconnect device' : 'Disconnect all devices', one ? 'This device will need a new PIN to connect again.' : 'Every paired phone and tablet will need a new PIN to connect again.', 'Disconnect', async () => { companion = await window.api.companion.forget(one || null); render(); });
  },
  'companion-switch'() { window.api.changeComputer(); },
  'companion-unpair'() { confirmBox('Disconnect this device', 'Stop syncing with your computer? You can connect again with a new PIN.', 'Disconnect', () => window.api.unpair()); },
  nav(el) { setNavOpen(false); ui.view = el.dataset.view; ui.tap = null; if (ui.view === 'now' && isLive()) ui.nowTab = 'live'; if (ui.view !== 'weekend') ui.seasonIdx = ui.view === 'dashboard' ? null : ui.seasonIdx; render(); },
  'new-career'() { ui.setup = defaultSetup(); ui.view = 'setup'; render(); },
  'cancel-setup'() { ui.view = 'dashboard'; render(); },
  'setup-pick'(el) { ui.setup[el.dataset.k] = el.dataset.v; render(); },
  'setup-seat'(el) { ui.setup.teamId = el.dataset.team; ui.setup.seat = el.dataset.seat; render(); },
  'setup-year'(el) { setupYear(+el.dataset.v); },
  'fg-fill'(el) { setupFill(ui.setup, +el.dataset.i, +el.dataset.j); render(); },
  'fg-fill-all'() { const u = ui.setup; u.futureGrid.forEach((t, ti) => t.drivers.forEach((d, si) => { if (retiredBy(u, d)) setupFill(u, ti, si); })); render(); toast('Retired drivers replaced'); },
  'fc-move'(el) { const L = ui.setup.futureCal; const i = +el.dataset.i, j = i + (+el.dataset.dir); if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; render(); },
  'fc-remove'(el) { ui.setup.futureCal.splice(+el.dataset.i, 1); render(); },
  'nd-add'(el) {
    const { scope, key } = el.dataset; const drafts = ndDrafts(scope); const nd = drafts[key] || {};
    const name = (nd.name || '').trim(); if (!name) { toast('Enter the new driver’s name'); return; }
    const d = { id: 'C' + uid().slice(0, 6), name, abbr: ((nd.abbr || '').trim() || name.split(' ').slice(-1)[0].slice(0, 3)).toUpperCase(), number: +nd.number || 0, born: nd.born || null, photo: nd.photo || null, custom: true };
    delete drafts[key];
    if (scope === 'setup') {
      ui.setup.newDrivers.push(d);
      if (/^g/.test(key)) { const [ti, si] = key.slice(1).split('-').map(Number); ui.setup.futureGrid[ti].drivers[si] = d.id; } else ui.setup.team.seats[+key] = d.id;
      render();
    }
    else if (scope === 'pool') { (career().customDrivers ||= []).push(d); closeModal(); store.save(); render(); toast(`${d.name} added to the driver pool`); }
    else { (ui.modal.newDrivers ||= []).push(d); ui.modal.steps[+key].driver = d.id; drawTransferModal(); }
  },
  'autofill-laps'() {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const r = autofillLaps(s, sd, ui.session, ui.round);
    if (r.error) { toast(r.error); return; }
    if (!r.n) { toast(r.skipped ? 'Only rows above your fastest lap are empty: enter the top time first' : 'Every lap time is already filled'); return; }
    sd.done = true; store.save(); render();
    toast(`Filled ${plural(r.n, 'lap time')}${r.skipped ? ` · ${r.skipped} above your fastest lap left empty` : ''}`);
  },
  'tr-new'(el) { transferModal({ driver: el.dataset.driver || null }); },
  'tr-rumour'(el) {
    const rm = (career().rumours || []).find(x => x.id === el.dataset.id); if (!rm) return;
    transferModal({ driver: rm.driver, action: rm.kind === 'retire' ? 'retire' : rm.kind === 'stay' ? 'extend' : 'move', to: rm.team, effective: rm.timing === 'now' ? 'now' : 'next', rumourId: rm.id });
  },
  'tr-confirm'() { confirmTransfer(); },
  'tr-undo'() { confirmBox('Undo transfer', 'Put the drivers back where they were before the latest transfer? Its story is removed too.', 'Undo', undoTransfer); },
  'nd-cancel'(el) { const { scope, key } = el.dataset; delete ndDrafts(scope)[key]; scope === 'setup' ? render() : scope === 'pool' ? closeModal() : drawTransferModal(); },
  'pool-add'() { ui.modal = { kind: 'pool', nd: { 0: {} } }; modal(`<div class="modal-h"><h2>Add a driver to the pool</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div><div class="modal-b">${newDriverForm('pool', 0, ui.modal.nd[0])}<p class="muted" style="font-size:12px">They wait in the pool until a team signs them in Transfers.</p></div>`); },
  'create-career'() {
    const u = ui.setup;
    const principal = u.type === 'myteam' && u.role === 'principal';
    const real = u.type === 'driver' && u.as === 'real' && u.year <= 2026 ? u.realDriver : null;
    if (u.type === 'driver' && u.as === 'real' && !real) { toast('Pick the driver you race as'); return; }
    if (real) {
      // you are that driver: the profile comes from them
      const grid = setupGrid(u); const tpl = templateFor(u.year, null); const nm = anyName(real); const b = D.DRIVER_BIO[real] || {};
      const last = lastName(nm); Object.assign(u, { first: nm.slice(0, nm.length - last.length).trim() || nm, last, abbr: tpl?.drivers?.[real]?.abbr || D.DRIVERS[real]?.abbr || real, number: tpl?.nums?.[real] ?? D.DRIVERS[real]?.number ?? 27,
        nationality: u.nationality || b.nat || '', born: u.born || b.born || null, teamId: grid.find(t => t.drivers.includes(real))?.id, seat: null });
    }
    if (!u.first.trim() || !u.last.trim()) { toast(principal ? 'Enter your first and last name' : 'Enter your driver’s first and last name'); return; }
    if (u.type === 'myteam' && !u.team.name.trim()) { toast('Give your team a name'); return; }
    if (principal && (!u.team.seats[0] || !u.team.seats[1] || u.team.seats[0] === u.team.seats[1])) { toast('Sign two different drivers'); return; }
    const old = u.year > 2026 ? u.futureGrid.flatMap(t => t.drivers).filter(d => retiredBy(u, d)) : [];
    if (old.length) { toast(`${listJoin(old.map(anyName))} will have retired by ${u.year}. Auto-fill or pick someone else.`); return; }
    const abbr = (u.abbr || u.last.slice(0, 3)).toUpperCase();
    const c = {
      id: uid(), createdAt: new Date().toISOString(), type: u.type,
      profile: { first: u.first.trim(), last: u.last.trim(), abbr, number: +u.number || 27, nationality: u.nationality.trim(), archetype: u.archetype, personality: u.personality, bio: u.bio.trim(), rival: '', rivalTeam: null, photo: u.photo || null, born: u.born || null },
      customDrivers: u.newDrivers.filter(d => !d.generated && ((principal && u.team.seats.includes(d.id)) || (u.year > 2026 && u.futureGrid.some(t => t.drivers.includes(d.id))))), media: [], seasons: [], rumours: [],
      generated: Object.fromEntries(u.newDrivers.filter(d => d.generated && u.year > 2026 && u.futureGrid.some(t => t.drivers.includes(d.id))).map(d => [d.id, d])),
      startYear: u.year, ...(real ? { realDriver: real } : {}),
      // the 2025 11th team: asked now for a 2025 start, when 2025 comes for an earlier one, never after
      extraTeam2025: u.year === 2025 ? (u.type === 'myteam' ? null : u.extra || null) : u.year > 2025 ? null : undefined,
    };
    if (u.type === 'myteam') {
      const { seats, ...t } = u.team;
      c.myTeam = { ...t, name: t.name.trim(), short: (t.short || t.name.trim().slice(0, 3)).toUpperCase(), base: t.base.trim(), principal: `${c.profile.first} ${c.profile.last}`, founded: u.year, budget: 30, ledger: [], sponsors: [], upgrades: [], ratings: {},
        role: principal ? 'principal' : 'owner', ...(principal ? { seats: [...seats], lead: seats[0] } : {}) };
    }
    // a principal's driver goals start with the lead driver
    if (principal) for (const g of u.goals) if (goalScope(g) === 'driver' && !g.driver) g.driver = u.team.seats[0];
    // every real season before yours, then (for a start after 2026) the simulated years up to it
    for (let y = HIST_FROM; y < Math.min(u.year, HIST_TO + 1); y++) c.seasons.push(histSeason(y, c.seasons.length));
    if (u.year > 2026) {
      c.startGrid = u.futureGrid.map(t => ({ id: t.id, name: t.name.trim() || t.id, color: t.color, drivers: [...t.drivers] }));
      c.startCal = u.futureCal.map(r => [r.id, r.name, r.venue, !!r.sprint, r.track || null]);
      if (u.year - 1 > HIST_TO) simulateGap(c, u.year, c.startGrid, u.futureCal);
    }
    c.seasons.push(newSeason(c, c.seasons.length, u.type === 'myteam' ? { teamId: MYTEAM, seatDriverId: null, goals: u.goals, practice: u.practice } : { teamId: u.teamId, seatDriverId: u.seat, goals: u.goals, practice: u.practice }));
    realTransfers(c);
    state.careers.push(c); state.activeCareerId = c.id; syncNumbers(c);
    ui.setup = null; ui.view = 'dashboard'; ui.seasonIdx = null;
    const first = activeRounds(latestSeason())[0];
    store.save(); render(); toast(`Career created. Good luck in ${first?.venue || 'the first race'}.`);
    if (!c.profile.photo && !isPrincipal(c) && !real) photoModal(PLAYER_ID);
  },
  'pick-season'(el) { ui.seasonIdx = +el.dataset.idx; render(); },
  'open-round'(el) { if (!el.dataset.round) return; ui.round = el.dataset.round; ui.session = null; ui.tap = null; if (ui.view !== 'weekend' && ui.view !== 'calendar') ui.seasonIdx = null; ui.view = 'weekend'; render(); },
  'pick-session'(el) { ui.session = el.dataset.key; ui.tap = null; render(); },
  move(el) {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const i = +el.dataset.i, j = i + (+el.dataset.dir);
    if (j < 0 || j >= sd.results.length) return;
    [sd.results[i], sd.results[j]] = [sd.results[j], sd.results[i]];
    sd.done = true; store.save(); render();
  },
  'tap-start'() { ui.tap = { key: ui.session, order: [] }; render(); },
  'tap-pick'(el) { ui.tap.order.push(el.dataset.d); render(); },
  'tap-undo'() { ui.tap.order.pop(); render(); },
  'tap-cancel'() { ui.tap = null; render(); },
  'tap-apply'() {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const byId = Object.fromEntries(sd.results.map(r => [r.d, r]));
    const rest = sd.results.filter(r => !ui.tap.order.includes(r.d));
    sd.results = [...ui.tap.order.map(d => byId[d]), ...rest];
    sd.done = true; ui.tap = null; store.save(); render(); toast('Order applied');
  },
  'clear-session'() {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    sd.results.forEach(r => { r.lap = ''; r.gap = ''; r.st = 'FIN'; }); sd.fl = null; store.save(); render();
  },
  'standings-tab'(el) { ui.standingsTab = el.dataset.tab; render(); },
  'open-driver'(el) { ui.driverId = el.dataset.id; ui.view = 'driver'; render(); },
  'drv-sort'(el) { ui.drv.sort = el.dataset.k; render(); },
  'drv-scope'(el) { ui.drv.scope = el.dataset.v; render(); },
  'driver-h2h'(el) { const id = el.dataset.id; ui.h2h = { scope: 'all', a: PLAYER, b: id === PLAYER ? null : id }; ui.view = 'h2h'; render(); },
  'open-track'(el) { ui.trackId = el.dataset.track; ui.trackAll = false; ui.view = 'track'; render(); },
  'track-all'() { ui.trackAll = !ui.trackAll; render(); },
  'hof-view'(el) { ui.hof.view = el.dataset.v; render(); },
  'hof-sort'(el) { ui.hof.sort = el.dataset.v; render(); },
  'new-career-myteam'() { ui.setup = { ...defaultSetup(), type: 'myteam' }; ui.view = 'setup'; render(); },
  'mt-tab'(el) { ui.mt = el.dataset.tab; render(); },
  'mt-logo-clear'(el) { mtTarget(el).logo = null; mtCommit(el); },
  async 'mt-logo-colors'(el) {
    const t = mtTarget(el); const cols = await logoColors(t.logo);
    if (!cols) { toast('Could not find colours in that logo'); return; }
    [t.color, t.color2] = cols; mtCommit(el); toast('Team colours taken from the logo');
  },
  'mt-add-upgrade'() {
    const c = career(); const m = c.myTeam; const s = latestSeason();
    const part = $('#up-part').value.trim(); if (!part) { toast('Name the part you upgraded'); return; }
    const cost = Math.max(0, +$('#up-cost').value || 0);
    const u = { id: uid(), seasonIdx: s.index, roundId: $('#up-round').value, dept: $('#up-dept').value, part, notes: $('#up-notes').value.trim(), cost };
    m.upgrades.push(u);
    if (cost && $('#up-ledger').checked) m.ledger.push({ id: uid(), seasonIdx: s.index, roundId: u.roundId, cat: 'R&D', amount: -cost, note: `Upgrade: ${part}` });
    store.save(); render(); toast('Upgrade logged');
  },
  'mt-add-ledger'() {
    const c = career(); const s = latestSeason();
    const amt = Math.abs(+$('#lg-amt').value || 0); if (!amt) { toast('Enter an amount'); return; }
    c.myTeam.ledger.push({ id: uid(), seasonIdx: s.index, roundId: $('#lg-round').value, cat: $('#lg-cat').value, amount: $('#lg-type').value === 'out' ? -amt : amt, note: $('#lg-note').value.trim() });
    store.save(); render();
  },
  'mt-add-sponsor'() {
    const c = career(); const s = latestSeason();
    const name = $('#sp-name').value.trim(); if (!name) { toast('Enter the sponsor name'); return; }
    c.myTeam.sponsors.push({ id: uid(), seasonIdx: s.index, name, tier: $('#sp-tier').value, value: Math.max(0, +$('#sp-value').value || 0), goal: $('#sp-goal').value.trim(), status: 'Active' });
    store.save(); render(); toast(`${name} signed`);
  },
  'mt-sponsor-pay'(el) {
    const c = career(); const s = latestSeason(); const sp = c.myTeam.sponsors.find(x => x.id === el.dataset.id);
    if (!sp.value) { toast('Set a value for this sponsor first'); return; }
    c.myTeam.ledger.push({ id: uid(), seasonIdx: s.index, roundId: nextRound(s)?.id || '', cat: 'Sponsorship', amount: +sp.value, note: `${sp.name} (${sp.tier.toLowerCase()} sponsor)` });
    store.save(); render(); toast(`${fmtM(+sp.value)} from ${sp.name} added to finances`);
  },
  'mt-del'(el) { const m = career().myTeam; m[el.dataset.list] = m[el.dataset.list].filter(x => x.id !== el.dataset.id); store.save(); render(); },
  'set-theme'(el) { state.prefs = { ...(state.prefs || {}), theme: el.dataset.v }; store.save(); render(); },
  'edit-goals'() { goalsModal(); },
  'goal-add'(el) {
    const list = el.dataset.scope === 'setup' ? ui.setup.goals : ui.modal.goals;
    const kind = el.dataset.kind || 'driver'; const ctx = goalCtx(el.dataset.scope);
    list.push(kind === 'team' ? { id: uid(), scope: 'team', type: 'constructor_pos', target: 5 } : { id: uid(), scope: 'driver', type: 'podiums', target: 1, driver: ctx.drivers?.[0]?.[0] || null });
    el.dataset.scope === 'setup' ? render() : redrawModal();
  },
  'goal-remove'(el) {
    const list = el.dataset.scope === 'setup' ? ui.setup.goals : ui.modal.goals;
    const i = list.findIndex(g => g.id === el.dataset.id); if (i >= 0) list.splice(i, 1);
    el.dataset.scope === 'setup' ? render() : redrawModal();
  },
  'goals-save'() { const s = curSeason(); s.goals = ui.modal.goals; closeModal(); store.save(); render(); },
  'modal-close'() { closeModal(); },
  'modal-bg'(el, e) { if (e.target === el) closeModal(); },
  'confirm-ok'() { const f = ui.confirmFn; closeModal(); f && f(); },
  'next-season'() { nextSeasonModal(); },
  'next-seat'(el) { ui.modal.teamId = el.dataset.team; ui.modal.seat = el.dataset.seat || null; ui.modal.seatIdx = +el.dataset.i; drawNextSeasonModal(); },
  'next-extra'(el) { const c = career(); const m = ui.modal; m.extra = el.dataset.v; c.extraTeam2025 = el.dataset.v || null; const keep = { goals: m.goals, extra: m.extra }; nextSeasonModal(); Object.assign(ui.modal, keep); drawNextSeasonModal(); },
  'next-confirm'() {
    const c = career(); const m = ui.modal;
    if (latestSeason().year + 1 === 2025 && c.extraTeam2025 === undefined) c.extraTeam2025 = null; // asked: neither
    backupNow('season');
    const s = newSeason(c, m.index, { teamId: m.teamId, seatDriverId: m.seat, goals: m.goals });
    c.seasons.push(s); syncNumbers(c);
    closeModal(); ui.seasonIdx = null; ui.view = 'dashboard'; store.save(); render();
    toast(`${s.year} season started with ${s.teams.find(t => t.id === s.playerTeamId).name}`);
  },
  'new-media'(el) { newMediaModal(el.dataset.round || null); },
  'media-kind'(el) { ui.modal.mkind = el.dataset.v; drawMediaModal(); },
  async 'media-start'() {
    const c = career(); const m = ui.modal;
    const needsRound = m.mkind === 'quali' || m.mkind === 'race';
    ui.busy = true; drawMediaModal();
    const { questions } = await generateQuestions(c, m.seasonIdx, needsRound ? m.roundId : null, m.mkind);
    ui.busy = false;
    const entry = { id: uid(), seasonIdx: m.seasonIdx, roundId: needsRound ? m.roundId : null, kind: m.mkind, createdAt: new Date().toISOString(), questions, article: null, reactions: [], rep: 0 };
    c.media.push(entry); ui.mediaOpen = entry.id;
    closeModal(); ui.view = 'media'; store.save(); render();
  },
  'media-quick'(el) {
    const c = career(); const m = c.media.find(x => x.id === el.dataset.id);
    m.questions[+el.dataset.i].answer = el.dataset.t; store.save();
    const ta = document.getElementById(`ans-${m.id}-${el.dataset.i}`); if (ta) ta.value = el.dataset.t;
  },
  async 'media-publish'(el) {
    const c = career(); const m = c.media.find(x => x.id === el.dataset.id);
    ui.busy = true; render();
    const out = await generateArticle(c, m);
    ui.busy = false;
    Object.assign(m, out); ui.mediaOpen = null; store.save(); render(); toast('Article published');
  },
  'media-discard'(el) { const c = career(); c.media = c.media.filter(x => x.id !== el.dataset.id); ui.mediaOpen = null; store.save(); render(); },
  'media-delete'(el) { confirmBox('Delete article', 'Remove this article and its transcript? Its reputation effect is removed too.', 'Delete', () => { const c = career(); c.media = c.media.filter(x => x.id !== el.dataset.id); store.save(); render(); }); },
  async 'save-ai'() {
    const key = $('#set-key').value.trim(); const model = $('#set-model').value.trim();
    if (!window.api) { toast('AI needs the desktop app'); return; }
    await window.api.setSettings({ apiKey: key, model });
    settings = await window.api.getSettings(); render(); toast('AI settings saved');
  },
  async 'clear-key'() { await window.api.setSettings({ clearKey: true }); settings = await window.api.getSettings(); render(); toast('API key removed'); },
  async 'test-ai'(el) {
    if (!window.api) { toast('AI needs the desktop app'); return; }
    el.disabled = true; el.textContent = 'Testing…';
    const r = await window.api.ai({ system: 'Reply with the single word OK.', prompt: 'Ping', maxTokens: 10 });
    el.disabled = false; el.textContent = 'Test connection';
    toast(r.ok ? 'Connected to Claude' : r.error === 'no_key' ? 'Save an API key first' : 'Failed: ' + r.error);
  },
  'save-profile'() {
    const c = career(); const p = c.profile;
    p.first = $('#pf-first').value.trim() || p.first; p.last = $('#pf-last').value.trim() || p.last;
    if ($('#pf-abbr')) { p.abbr = ($('#pf-abbr').value.trim() || p.abbr).toUpperCase(); p.number = +$('#pf-number').value || p.number; p.archetype = $('#pf-arch').value; }
    p.nationality = $('#pf-nat').value.trim(); p.born = $('#pf-born').value || null; p.personality = $('#pf-pers').value; p.bio = $('#pf-bio').value.trim();
    if (!isPrincipal(c)) for (const s of playedSeasons(c)) s.drivers[PLAYER_ID] = playerDriver(c);
    store.save(); render(); toast('Profile saved');
  },
  'add-driver'() {
    const c = career(); const s = latestSeason();
    const name = $('#nd-name').value.trim(); if (!name) { toast('Enter a name'); return; }
    const abbr = ($('#nd-abbr').value.trim() || name.split(' ').slice(-1)[0].slice(0, 3)).toUpperCase();
    const d = { id: 'C' + uid().slice(0, 6), name, abbr, number: +$('#nd-num').value || 0, born: $('#nd-born').value || null, custom: true };
    (c.customDrivers ||= []).push(d); s.drivers[d.id] = { ...d };
    store.save(); render(); toast(`${name} added. Pick them in a seat above.`);
    photoModal(d.id);
  },
  'cal-del'(el) { latestSeason().calendar.splice(+el.dataset.i, 1); store.save(); render(); },
  'cal-move'(el) {
    const s = latestSeason(); const i = +el.dataset.i, j = i + (+el.dataset.dir);
    if (j < 0 || j >= s.calendar.length) return;
    [s.calendar[i], s.calendar[j]] = [s.calendar[j], s.calendar[i]]; store.save(); render();
  },
  async export() {
    if (window.api) { const ok = await window.api.exportData(state); if (ok) toast('Backup exported'); }
    else toast('Export needs the desktop app');
  },
  async import() {
    if (!window.api) { toast('Import needs the desktop app'); return; }
    const data = await window.api.importData();
    if (!data || !Array.isArray(data.careers)) { if (data !== null) toast('That file is not a Pitwall backup'); return; }
    confirmBox('Import backup', `Replace all current data with this backup (${data.careers.length} career${data.careers.length === 1 ? '' : 's'})?`, 'Import', async () => {
      await backupNow('import'); state = hydrateState(data); ui.seasonIdx = null; ui.view = 'dashboard'; store.save(); render(); toast('Backup imported');
    });
  },
  async 'backup-now'() { if (await backupNow('manual')) { toast('Backed up'); render(); } },
  'backup-folder'() { window.api?.backups?.folder(); },
  async 'backup-restore'(el) {
    const data = await window.api?.backups?.read(el.dataset.f);
    if (!data || !Array.isArray(data.careers)) { toast('That backup couldn’t be read'); return; }
    confirmBox('Restore backup', `Replace all current data with this backup (${plural(data.careers.length, 'career')})? What you have now is backed up first.`, 'Restore', async () => {
      await backupNow('restore'); state = hydrateState(data); ui.seasonIdx = null; ui.view = 'dashboard'; store.save(); backupList = null; render(); toast('Backup restored');
    });
  },
  'delete-career'() {
    const c = career();
    confirmBox('Delete career', `Permanently delete ${c.profile.first} ${c.profile.last}'s career and all its results? Export a backup first if you might want it back.`, 'Delete career', () => {
      state.careers = state.careers.filter(x => x.id !== c.id);
      state.activeCareerId = state.careers[0]?.id || null;
      ui.view = state.careers.length ? 'dashboard' : 'setup'; ui.setup = state.careers.length ? null : defaultSetup();
      store.save(); render();
    });
  },
};
function redrawModal() { if (ui.modal?.kind === 'goals') drawGoalsModal(); else if (ui.modal?.kind === 'next') drawNextSeasonModal(); }

const changes = {
  'nc-sprint'(el) { const c = career(); const s = latestSeason(); ncList(c, s)[+el.dataset.i].sprint = el.checked; store.save(); render(); },
  'nc-add'(el) { if (!el.value) return; const c = career(); const s = latestSeason(); const g = trackGp(el.value); ncList(c, s).push({ ...g, sprint: false, off: false, ...(H.roundTrack[g.id] ? { track: H.roundTrack[g.id] } : {}) }); store.save(); render(); },
  'nc-contract'(el) {
    const c = career(); const s = latestSeason(); const tid = el.dataset.track; const from = trackDeal(c, tid);
    const to = el.value === '' ? null : s.year + Math.max(0, Math.min(20, Math.round(+el.value)));
    if (to === from) return;
    (c.trackContracts ||= {})[tid] = to;
    if (to != null) {
      // one story per deal: changing it again before another race just updates it
      const ri = Math.max(0, roundsDone(s) - 1); c.trackDeals ||= [];
      const k = c.trackDeals.findIndex(d => d.tid === tid && d.si === s.index && d.ri === ri);
      if (k >= 0) { c.trackDeals[k].to = to; if (c.trackDeals[k].from === to) c.trackDeals.splice(k, 1); }
      else c.trackDeals.push({ tid, from, to, si: s.index, ri, at: new Date().toISOString() });
    }
    store.save(); render();
  },
  'font-local'(el) {
    const v = el.value.trim(); if (!v) return;
    const hit = sysFonts?.find(x => x.full.toLowerCase() === v.toLowerCase() || x.family.toLowerCase() === v.toLowerCase());
    const k = el.dataset.k; (state.fonts ||= {})[k] = { local: hit?.full || v, family: hit?.family || v }; store.save(); render();
    localFontData(hit?.full || v).then(data => { if (data && state.fonts[k]?.local === (hit?.full || v)) { state.fonts[k].data = data; store.save(); render(); toast('Font set, and copied with your data so your phone shows it too'); } else toast('Font set (on this PC only: its file couldn’t be copied)'); });
  },
  'font-upload'(el) {
    const file = el.files?.[0]; if (!file) return;
    if (file.size > 3e6) { toast('That font file is too big: keep it under 3 MB'); return; }
    const fr = new FileReader(); fr.onload = () => { (state.fonts ||= {})[el.dataset.k] = { name: file.name, data: fr.result }; store.save(); render(); toast('Font saved'); }; fr.readAsDataURL(file);
  },
  'sound-upload'(el) {
    const file = el.files?.[0]; if (!file) return;
    if (file.size > 1.5e6) { toast('That sound is too big: keep it under 1 MB'); return; }
    const fr = new FileReader(); fr.onload = () => { (state.sounds ||= {})[el.dataset.k] = { name: file.name, data: fr.result }; store.save(); render(); toast('Sound saved'); }; fr.readAsDataURL(file);
  },
  'tyre-count'(el) { const c = career(); const { fmt, c: cp } = el.dataset; (c.tyreCounts ||= {})[fmt] = { ...countsOf(c, fmt), [cp]: Math.max(0, Math.min(13, Math.round(+el.value || 0))) }; store.save(); tyrePresetsModal(); render(); },
  'rp-keep'(el) { const c = career(); c.replayKeep = +el.value || 0; store.save(); replayPrune.done = null; render(); },
  'rp-seek'(el) { if (!RP) return; RP.T = +el.value; replayShow(true); },
  'rp-speed'(el) { if (!RP) return; RP.speed = +el.value; const b = document.getElementById('rp-speed'); if (b) b.textContent = RP.speed + 'x'; },
  'overtake'(el) { const c = career(); (c.overtake ||= {})[el.dataset.track] = Math.max(0, Math.min(100, +el.value || 0)); store.save(); render(); },
  'pit-loss'(el) {
    const c = career(); const tid = el.dataset.track; const cur = pitLoss(c, tid); const v = Math.max(0, Math.min(60, +el.value || 0));
    c.pitLoss ||= {}; c.pitLoss[tid] = { green: cur.green / 1000, vsc: cur.vsc / 1000, sc: cur.sc / 1000, [el.dataset.k]: v }; store.save(); render();
  },
  'drv-sort-sel'(el) { ui.drv.sort = el.value; render(); },
  'tm-sort-sel'(el) { ui.tms.sort = el.value; render(); },
  'setup-year'(el) { setupYear(Math.max(2027, Math.min(2060, +el.value || 2027))); },
  'fg-name'(el) { ui.setup.futureGrid[+el.dataset.i].name = el.value; },
  'fg-color'(el) { ui.setup.futureGrid[+el.dataset.i].color = el.value; render(); },
  'fg-seat'(el) {
    const u = ui.setup; const key = 'g' + el.dataset.i + '-' + el.dataset.j;
    if (el.value === '__new') { u.nd[key] ||= {}; } else { u.futureGrid[+el.dataset.i].drivers[+el.dataset.j] = el.value; delete u.nd[key]; }
    render();
  },
  'fc-sprint'(el) { ui.setup.futureCal[+el.dataset.i].sprint = el.checked; },
  'fc-add'(el) { if (!el.value) return; const tr = trackGp(el.value); ui.setup.futureCal.push({ ...tr, sprint: false, ...(H.roundTrack[tr.id] ? { track: H.roundTrack[tr.id] } : {}) }); render(); },
  'season-sel'(el) { actions[el.dataset.to]({ dataset: { idx: el.value } }); },
  'switch-career'(el) { state.activeCareerId = el.value; ui.seasonIdx = null; ui.view = 'dashboard'; store.save(); render(); },
  setup(el) { ui.setup[el.dataset.k] = el.value; if (el.dataset.k === 'realDriver') render(); },
  'mt-seat'(el) {
    const u = ui.setup; const i = +el.dataset.i;
    if (el.value === '__new') { u.nd[i] ||= {}; } else { u.team.seats[i] = el.value; delete u.nd[i]; }
    render();
  },
  'tr-field'(el) {
    const m = ui.modal; const { i, k } = el.dataset;
    if (k === 'effective') m.effective = el.value;
    else {
      const st = m.steps[+i];
      if (k === 'driver') { if (el.value === '__new') { m.nd[0] ||= {}; st.driver = null; } else { delete m.nd[0]; st.driver = el.value || null; } }
      else st[k] = k === 'until' ? +el.value : el.value;
      // anything but the contract length changes who is displaced, so the rest of the chain starts again
      if (k !== 'until') m.steps.splice(+i + 1);
    }
    drawTransferModal();
  },
  'fv-round'(el) { ui.fvRound = +el.value; render(); },
  'num-one'(el) { const c = career(); (c.numberOne ||= {})[el.dataset.year] = el.checked; syncNumbers(c); store.save(); render(); toast(el.checked ? 'Number 1 it is' : 'Back to their own number'); },
  'nd-field'(el) { const { scope, key, k } = el.dataset; (ndDrafts(scope)[key] ||= {})[k] = el.value; },
  'goal-type'(el) { const g = goalList(el).find(x => x.id === el.dataset.id); g.scope = goalScope(g); g.type = el.value; const gt = D.GOAL_TYPES.find(x => x.id === g.type); if (gt?.needsTarget && g.target == null) g.target = 1; if (gt?.needsTeam && !g.team) g.team = goalCtx(el.dataset.scope).teams[0]?.[0]; el.dataset.scope === 'setup' ? render() : redrawModal(); },
  'goal-driver'(el) { goalList(el).find(x => x.id === el.dataset.id).driver = el.value; },
  'goal-team'(el) { goalList(el).find(x => x.id === el.dataset.id).team = el.value; },
  'goal-target'(el) { goalList(el).find(x => x.id === el.dataset.id).target = +el.value; },
  'goal-text'(el) { goalList(el).find(x => x.id === el.dataset.id).text = el.value; },
  'goal-done'(el) { const g = curSeason().goals.find(x => x.id === el.dataset.id); g.done = el.checked; store.save(); render(); },
  'res-field'(el) {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const i = +el.dataset.i; const r = sd.results[i]; const f = el.dataset.f;
    const race = isRaceKind(ui.session);
    let v = el.value.trim();
    if (f === 'lap' && v) { const ms = parseLap(v); if (ms != null) v = fmtLap(ms); }
    if (f === 'gap' && v) { const ms = parseDur(v); if (ms != null) v = fmtDur(ms, !(race && i === 0)); }
    if (f === 'laps') v = Math.max(0, parseInt(v, 10) || 0) || '';
    r[f] = v;
    if (!race) {
      // timed sessions: a gap to the fastest sets the lap time, and a lap time sets the gap
      const best = parseLap(sd.results[0]?.lap);
      const sync = (x) => { const g = parseDur(x.gap); if (best != null && g != null) x.lap = fmtLap(best + g); };
      if (f === 'gap' && i > 0) sync(r);
      if (f === 'lap' && i === 0) sd.results.slice(1).forEach(x => { if (x.gap) sync(x); else { const ms = parseLap(x.lap); if (best != null && ms != null && ms >= best) x.gap = fmtDur(ms - best, true); } });
      if (f === 'lap' && i > 0) { const ms = parseLap(v); r.gap = best != null && ms != null && ms >= best ? fmtDur(ms - best, true) : r.gap; }
    }
    sd.done = true; store.save();
    if (f === 'st') {
      // retired drivers drop below classified finishers
      const fin = sd.results.filter(x => !OUT.includes(x.st)); const out = sd.results.filter(x => OUT.includes(x.st));
      sd.results = [...fin, ...out];
    }
    render();
  },
  'sess-done'(el) { const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true); sd.done = el.checked; store.save(); render(); },
  'fl-override'(el) { const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true); sd.fl = el.value || null; store.save(); render(); },
  notes(el) { const s = curSeason(); weekend(s, ui.round, true).notes = el.value; store.save(); },
  'copy-order'(el) {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const v = el.value; if (!v) return;
    let order;
    if (v.startsWith('sess:')) order = sessionData(s, ui.round, v.slice(5)).results.map(r => r.d);
    else if (v === 'champ') order = driverStandings(s).map(x => x.id);
    else order = gridIds(s);
    const byId = Object.fromEntries(sd.results.map(r => [r.d, r]));
    sd.results = [...order.filter(d => byId[d]).map(d => byId[d]), ...sd.results.filter(r => !order.includes(r.d))];
    sd.done = true; store.save(); render();
  },
  'h2h-a'(el) { ui.h2h.a = el.value; render(); },
  'h2h-b'(el) { ui.h2h.b = el.value; render(); },
  'h2h-scope'(el) { ui.h2h.scope = el.value; ui.h2h.b = null; render(); },
  'media-answer'(el) { const m = career().media.find(x => x.id === el.dataset.id); m.questions[+el.dataset.i].answer = el.value; store.save(); },
  'media-season'(el) { ui.modal.seasonIdx = +el.value; const s = career().seasons[+el.value]; ui.modal.roundId = activeRounds(s)[0]?.id; drawMediaModal(); },
  'media-round'(el) { ui.modal.roundId = el.value; },
  roster(el) {
    const s = latestSeason(); const t = s.teams.find(x => x.id === el.dataset.team); const seat = +el.dataset.seat;
    const id = el.value;
    // if the driver already has a seat elsewhere, swap them
    for (const o of s.teams) { const k = o.drivers.indexOf(id); if (k >= 0 && !(o === t && k === seat)) o.drivers[k] = t.drivers[seat]; }
    t.drivers[seat] = id;
    if (!s.drivers[id]) s.drivers[id] = { ...allKnownDrivers(career(), s)[id] };
    store.save(); render();
  },
  practice(el) { latestSeason().format.practice = el.value; store.save(); render(); },
  'cal-sprint'(el) { latestSeason().calendar[+el.dataset.i].sprint = el.checked; store.save(); render(); },
  'cal-on'(el) { latestSeason().calendar[+el.dataset.i].off = !el.checked; store.save(); render(); },
  'cal-add'(el) { if (!el.value) return; const s = latestSeason(); const g = trackGp(el.value); let id = g.id; while (s.calendar.some(r => r.id === id)) id += '2'; s.calendar.push({ ...g, id, ...(id !== g.id ? { track: g.id } : {}), sprint: false, off: false, added: true }); store.save(); render(); toast(`${g.name} added to the ${s.year} calendar`); },
};
function goalList(el) { return el.dataset.scope === 'setup' ? ui.setup.goals : ui.modal.goals; }
// team identity fields live on the setup form or on the active career's team
function mtTarget(el) { return el.dataset.scope === 'setup' ? ui.setup.team : career().myTeam; }
function mtCommit(el) { if (el.dataset.scope !== 'setup') { syncMyTeam(career()); store.save(); } render(); }
Object.assign(changes, {
  'mt-field'(el) {
    const t = mtTarget(el); const k = el.dataset.k;
    t[k] = k === 'short' ? el.value.trim().toUpperCase() : k === 'founded' ? +el.value || 2025 : el.value;
    mtCommit(el);
  },
  async 'mt-logo'(el) {
    const file = el.files?.[0]; if (!file) return;
    try { mtTarget(el).logo = await readLogo(file); mtCommit(el); toast('Logo imported'); } catch (e) { toast(e.message); }
  },
  'mt-rating'(el) {
    const c = career(); const s = latestSeason(); const r = (c.myTeam.ratings[s.index] ||= {});
    if (el.value === '') delete r[el.dataset.k]; else r[el.dataset.k] = Math.max(0, Math.min(100, Math.round(+el.value)));
    store.save(); render();
  },
  'mt-budget'(el) { career().myTeam.budget = +el.value || 0; store.save(); render(); },
  'mt-sponsor-status'(el) { career().myTeam.sponsors.find(x => x.id === el.dataset.id).status = el.value; store.save(); render(); },
  async 'gfx-logo'(el) {
    const file = el.files?.[0]; if (!file) return;
    try { state.gfxLogo = await readImage(file, { max: 700 }); store.save(); render(); toast('Logo saved'); } catch (e) { toast(e.message); }
  },
  async 'pic-upload'(el) {
    const file = el.files?.[0]; if (!file) return;
    const { kind, id } = el.dataset; const c = career();
    try {
      if (kind === 'car') {
        const url = await readCar(file);
        if (id === MYTEAM) c.myTeam.car = url; else setPic('cars', id, url);
      } else if (kind === 'team') {
        const url = await readLogo(file);
        if (id === MYTEAM) { c.myTeam.logo = url; syncMyTeam(c); } else setPic('teams', id, url);
      } else {
        const url = await readPhoto(file);
        if (kind === 'newdriver') { const [scope, key] = id.split(':'); (ndDrafts(scope)[key] ||= {}).photo = url; }
        else if (kind === 'setup') ui.setup.photo = url; else setDriverPhoto(c, id, url);
      }
      if (kind !== 'setup' && kind !== 'newdriver') store.save();
      if (ui.modal?.kind === 'transfer') drawTransferModal(); else render();
      if (ui.modal?.kind === 'photo') drawPhotoModal();
      toast(kind === 'team' ? 'Logo saved' : kind === 'car' ? 'Car picture saved' : 'Photo saved');
    } catch (e) { toast(e.message); }
  },
  'rm-field'(el) { ui.modal[el.dataset.k] = el.value; drawRumourModal(); },
  'rv-field'(el) { ui.modal[el.dataset.k] = el.value; drawRivalryModal(); },
  dob(el) {
    const c = career(); const id = el.dataset.id; const v = el.value || null;
    if (id === PLAYER_ID) c.profile.born = v;
    else { const cd = c.customDrivers.find(x => x.id === id); cd.born = v; for (const s of c.seasons) if (s.drivers[id]) s.drivers[id].born = v; }
    store.save(); render();
  },
});
Object.assign(actions, {
  'open-team'(el) { if (!el.dataset.id) return; ui.teamId = el.dataset.id; ui.view = 'team'; render(); },
  'tm-sort'(el) { ui.tms.sort = el.dataset.k; render(); },
  'tm-scope'(el) { ui.tms.scope = el.dataset.v; render(); },
  'fc-kind'(el) { ui.fc = el.dataset.v; render(); },
  'race-length'(el) { const s = curSeason(); weekend(s, ui.round, true).raceLength = +el.dataset.v; store.save(); render(); },
  'perf-mode'(el) { ui.perf = el.dataset.v; render(); },
  'perf-view'(el) { ui.perfView = el.dataset.v; render(); },
  'fv-open'(el) { ui.view = 'performance'; ui.perfView = 'drivers'; ui.fvRound = +el.dataset.ri; render(); },
  'lb-sort'(el) { ui.lb.sort = el.dataset.k; render(); },
  'lb-scope'(el) { ui.lb.scope = el.dataset.v; render(); },
  'add-scope'(el) { state.addScope = el.dataset.v; store.save(); render(); },
  'standings-detail'(el) { ui.standingsDetail = el.dataset.v; render(); },
  'stories-filter'(el) { ui.stories = el.dataset.v; render(); },
  // a penalty the game reported that didn't stand (a flashback undid it): off the record, and off any incident it made
  'pen-remove'(el) {
    const s = curSeason() || latestSeason(); const sd = s.weekends[el.dataset.round]?.sessions?.[el.dataset.key]; const g = sd?.game; const i = +el.dataset.i;
    const p = g?.penalties?.[i]; if (!p) return;
    g.penalties.splice(i, 1);
    for (const inc of g.incidents || []) if (inc.pen && inc.a === p.d && inc.b === p.other && (inc.t == null || p.t == null || Math.abs(inc.t - p.t) < 1)) { inc.pen = null; inc.major = false; }
    renderGen++; store.save(); render(); toast(`Penalty removed for ${dName(s, p.d)}`);
  },
  'cal-tab'(el) { ui.calTab = el.dataset.v; render(); },
  'tr-new-next'() { transferModal({ nextOnly: true }); },
  'nc-move'(el) { const c = career(); const s = latestSeason(); const L = ncList(c, s); const i = +el.dataset.i, j = i + (+el.dataset.dir); if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; store.save(); render(); },
  'nc-remove'(el) { const c = career(); const s = latestSeason(); ncList(c, s).splice(+el.dataset.i, 1); store.save(); render(); },
  'nc-reset'() { const c = career(); const s = latestSeason(); delete c.nextCal?.[s.year + 1]; store.save(); render(); },
  'nc-announce'() {
    const c = career(); const s = latestSeason(); const cal = nextCal(c, s); const onNow = new Set(activeRounds(s).map(roundTrackId));
    (c.calAnnounced ||= {})[s.year + 1] = { si: s.index, ri: Math.max(0, roundsDone(s) - 1), at: new Date().toISOString(), cal: clone(cal), newTracks: [...new Set(cal.map(roundTrackId).filter(t => !onNow.has(t)))] };
    store.save(); render(); toast(`The ${s.year + 1} calendar is announced: it’s in Stories`);
  },
  'now-tab'(el) { ui.nowTab = el.dataset.v; render(); },
  'live-follow'(el) { ui.liveFollow = el.dataset.v; render(); },
  'live-pick'(el) {
    const s = latestSeason(); const r = s.calendar.find(x => x.id === el.dataset.round); const c = career(); const w = weekend(s, r.id, true);
    const plans = optimalStrategies(strategyRuns(s, r).mine, raceLaps(s, r.id), { loss: pitLoss(c, trackOf(r)).green, sets: setsLeft(c, s, r).sets }); const p = plans[+el.dataset.i];
    if (!p) return; w.liveStrategy = w.liveStrategy?.seq.join() === p.seq.join() ? null : { seq: p.seq, lens: p.lens }; store.save(); render();
  },
  async 'font-embed'(el) {
    const F = state.fonts?.[el.dataset.k]; if (!F?.local) return;
    const data = await localFontData(F.local); if (!data) { toast('Couldn’t read that font’s file: upload it instead'); return; }
    F.data = data; store.save(); render(); toast('Copied: your phone shows it once it syncs');
  },
  async 'font-list'() {
    try {
      const list = await window.queryLocalFonts();
      const seen = new Set(); sysFonts = list.map(x => ({ full: x.fullName, family: x.family })).filter(x => !seen.has(x.full) && seen.add(x.full)).sort((a, b) => a.full.localeCompare(b.full));
      render(); toast(`${plural(sysFonts.length, 'installed font')} found`);
    } catch { toast('Couldn’t list the installed fonts here: type the font’s name instead'); }
  },
  'font-clear'(el) { delete (state.fonts ||= {})[el.dataset.k]; store.save(); render(); },
  'sound-play'(el) { playSounds([el.dataset.k]); },
  'sound-clear'(el) { delete (state.sounds ||= {})[el.dataset.k]; store.save(); render(); },
  'tyre-preset'(el) { const s = curSeason(); weekend(s, el.dataset.round || ui.round, true).tyrePreset = el.dataset.v; store.save(); render(); },
  'tyre-presets'(el) { if (el.dataset.fmt) { ui.tpFmt = el.dataset.fmt; ui.tpPreset = el.dataset.p; } tyrePresetsModal(); },
  'tp-fmt'(el) { ui.tpFmt = el.dataset.v; tyrePresetsModal(); },
  'tp-preset'(el) { ui.tpPreset = el.dataset.v; tyrePresetsModal(); },
  'tyre-cycle'(el) {
    const c = career(); const { fmt, p, k } = el.dataset; const plan = planOf(c, fmt, p); const j = +el.dataset.j;
    const next = { [S_]: M_, [M_]: H_, [H_]: null }[plan[k][j]];
    if (next == null) plan[k].splice(j, 1); else plan[k][j] = next;
    ((c.tyrePlans ||= {})[fmt] ||= {})[p] = plan; store.save(); tyrePresetsModal(); render();
  },
  'tyre-add'(el) { const c = career(); const { fmt, p, k } = el.dataset; const plan = planOf(c, fmt, p); plan[k].push(S_); ((c.tyrePlans ||= {})[fmt] ||= {})[p] = plan; store.save(); tyrePresetsModal(); render(); },
  'tyre-presets-reset'(el) { const c = career(); const { fmt, p } = el.dataset; if (c.tyrePlans?.[fmt]) delete c.tyrePlans[fmt][p]; if (c.tyreCounts) delete c.tyreCounts[fmt]; store.save(); tyrePresetsModal(); render(); },
  'tyre-hand'(el) { const s = latestSeason(); const w = weekend(s, el.dataset.round, true); (w.tyreHand ||= {})[el.dataset.id] = el.dataset.v === '1'; store.save(); render(); },
  async 'rp-open'(el) { const item = replaysHere(career()).find(x => x.x.key === el.dataset.k); if (item) await openReplay(item); },
  'rp-flt'(el) { if (RP) replayToggle(+el.dataset.i); },
  'rp-flt-mode'(el) { if (!RP) return; RP.flt = { mode: el.dataset.v, hide: new Set() }; replayTrack(); },
  'rp-close'() { if (RP) clearInterval(RP.timer); RP = null; render(); },
  'rp-play'() { if (!RP) return; if (RP.T >= RP.dur) RP.T = 0; RP.playing = !RP.playing; replayLoop(); replayShow(); },
  async 'rp-del-season'(el) {
    const xs = replaysHere(career()).filter(x => !x.x.rebuilt && String(x.s.year) === el.dataset.y); if (!xs.length || !confirm(`Delete all ${xs.length} recordings from ${el.dataset.y}? It can’t be undone.`)) return;
    for (const x of xs) await replayApi().remove(x.x.key); replayList = null; render();
  },
  async 'rp-orphans'() {
    const owned = new Set(state.careers.flatMap(cc => replaysHere(cc).filter(x => !x.x.rebuilt).map(x => x.x.key))); const xs = (replayList || []).filter(x => !owned.has(x.key));
    if (!xs.length || !confirm(`Delete ${plural(xs.length, 'recording')} that belong to no career here (deleted careers, or sessions never logged)? It can’t be undone.`)) return;
    for (const x of xs) await replayApi().remove(x.key); replayList = null; render();
  },
  async 'rp-story'(el) {
    if (replayList == null) replayList = await replayApi().list().catch(() => []) || [];
    const item = replaysHere(career()).find(x => x.x.key === el.dataset.k); if (!item) { toast('That recording is gone'); return; }
    ui.view = 'replay'; await openReplay(item);
    const ds = (el.dataset.ds || '').split(',').filter(Boolean); if (ds.length && RP) replayOnly(ds);
    const lap = +el.dataset.lap || 0; if (lap > 1 && RP) { const S = RP.data.samples; const k = S.findIndex(x => Math.max(...x.f.filter(y => y[1] === 1).map(y => y[2])) >= lap); if (k > 0) { RP.T = Math.max(0, S[k].t - 15); replayShow(true); } }
  },
  async 'rp-del'(el) { if (!confirm('Delete this race recording? It can’t be undone.')) return; await replayApi().remove(el.dataset.k); replayList = null; render(); },
  'overtake-use'(el) { const c = career(); (c.overtake ||= {})[el.dataset.track] = +el.dataset.v; store.save(); render(); toast('Overtaking difficulty set'); },
  'overtake-reset'(el) { const c = career(); delete c.overtake?.[el.dataset.track]; store.save(); render(); },
  'pit-loss-reset'(el) { const c = career(); delete c.pitLoss?.[el.dataset.track]; store.save(); render(); },
  'ers-view'(el) { ui[el.dataset.k || 'ersView'] = el.dataset.v; render(); },
  async 'ers-diag'(el) {
    const s = latestSeason(); const w = s.weekends[el.dataset.round];
    const d = [...new Set(ERS_RACE_KEYS.concat(ERS_QUALI_KEYS))].map(k => w?.sessions?.[k]?.game?.ers?.diag ? { session: k, ...w.sessions[k].game.ers.diag } : null).filter(Boolean);
    const text = JSON.stringify({ track: el.dataset.round, diag: d });
    try { await navigator.clipboard.writeText(text); toast('Diagnostics copied: paste them in a message'); }
    catch { modal(`<div class="modal-h"><h2>Diagnostics</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div><div class="modal-b"><p class="muted">Copy all of this and send it over.</p><textarea readonly style="width:100%;height:260px;font-family:var(--font-mono);font-size:11px">${esc(text)}</textarea></div>`); }
  },
  'ers-flip'(el) { const c = career(); (c.ersFlip ||= {})[el.dataset.track] = !c.ersFlip[el.dataset.track]; store.save(); render(); },
  'pic-clear'(el) {
    const { kind, id } = el.dataset; const c = career();
    if (kind === 'setup') ui.setup.photo = null;
    else if (kind === 'team') { if (id === MYTEAM) { c.myTeam.logo = null; syncMyTeam(c); } else setPic('teams', id, null); }
    else if (kind === 'car') { if (id === MYTEAM) c.myTeam.car = null; else setPic('cars', id, null); }
    else setDriverPhoto(c, id, null);
    if (kind !== 'setup') store.save();
    render(); if (ui.modal?.kind === 'photo') drawPhotoModal();
  },
  'update-check'() { checkUpdates(true); },
  'update-get'() { if (updateInfo?.download) window.api.updates.open(updateInfo.download); },
  'update-restart'() { store.save(); window.api.updates.apply(); },
  'update-retry'() { if (updateInfo) { updateInfo.dlError = null; downloadUpdate(); } },
  'update-skip'() { state.updateSkip = updateInfo?.latest || null; store.save(); render(); },
  'update-page'() { if (updateInfo?.page) window.api.updates.open(updateInfo.page); },
  'update-notes'() { updateNotesModal(); },
  'update-later'() { if (updateInfo) updateInfo.later = true; render(); toast('The update installs when you close Pitwall'); },
  'pic-default'(el) { restorePic(el.dataset.kind, el.dataset.id); store.save(); render(); if (ui.modal?.kind === 'photo') drawPhotoModal(); },
  'driver-photo'(el) { photoModal(el.dataset.id); },
  'rm-new'() { rumourModal(); },
  async 'tm-save'() {
    telemetryStatus = await window.api.telemetry.configure({ enabled: $('#tm-on').checked, port: +$('#tm-port').value || 20778 });
    render(); toast(telemetryStatus.enabled ? `Listening for F1 25 on port ${telemetryStatus.port}` : 'F1 25 telemetry off');
  },
  'game-apply'() {
    const q = gameQueue.shift(); const c = career(); if (!q) return closeModal();
    let place = q.place;
    if (q.why === 'place') { const s = latestSeason(); const round = activeRounds(s).find(x => x.id === $('#game-round').value); const key = $('#game-key').value; if (!round || !sessionsFor(s, round).includes(key)) { gameQueue.unshift(q); toast('That weekend doesn’t have that session'); return; } place = { s, round, key }; }
    closeModal(); applyGameResult(c, q.r, place); setTimeout(nextGameDecision, 300);
  },
  'game-skip'() { gameQueue.shift(); closeModal(); toast('Left as it was'); setTimeout(nextGameDecision, 300); },
  'game-open'() { const g = gameNotice; if (!g) return; ui.view = 'weekend'; ui.seasonIdx = null; ui.round = g.roundId; ui.session = g.key; render(); },
  'game-undo'() {
    const g = gameNotice; const c = state.careers.find(x => x.id === g?.careerId); if (!c) return;
    const s = c.seasons[g.seasonIdx]; const w = s?.weekends[g.roundId]; if (!w) return;
    if (g.prev) w.sessions[g.key] = JSON.parse(g.prev); else delete w.sessions[g.key];
    w.raceLength = g.prevLen; if (g.prevLen === undefined) delete w.raceLength;
    gameNotice = null; store.save(); render(); toast('Import undone');
  },
  'game-dismiss'() { gameNotice = null; render(); },
  'gd-open'(el) { gameDriverModal(el.dataset.round, el.dataset.key, el.dataset.d); },
  'rv-new'() { rivalryModal(); },
  'rv-create'() {
    const c = career(); const s = latestSeason(); const m = ui.modal; if (m.a === m.b) return;
    (c.rivalries ||= []).push({ id: uid(), seasonIdx: s.index, after: roundsDone(s), a: m.a, b: m.b, reason: m.reason, createdAt: new Date().toISOString() });
    closeModal(); ui.view = 'stories'; ui.seasonIdx = null; ui.stories = 'all'; store.save(); render(); toast('Rivalry started. The press has the story.');
  },
  'weekend-card'(el) { weekendCardModal(el.dataset.round); },
  'gfx-open'(el) { gfxModal(el.dataset.gfx); },
  'ui-style'(el) { state.uiStyle = el.dataset.v; store.save(); applyTheme(); render(); },
  'gfx-logo-clear'() { delete state.gfxLogo; store.save(); render(); },
  'award-card'(el) { awardCardModal(el.dataset.kind, el.dataset.ri != null ? +el.dataset.ri : null); },
  async 'card-save'() {
    const m = ui.modal; if (!m?.url) return;
    if (window.api?.saveImage) { if (await window.api.saveImage(m.url, m.name)) toast('Image saved'); return; }
    const a = document.createElement('a'); a.href = m.url; a.download = m.name; document.body.appendChild(a); a.click(); a.remove();
  },
  'open-review'(el) { if (el.dataset.idx != null) ui.seasonIdx = +el.dataset.idx; ui.view = 'review'; render(); },
  'rm-create'() {
    const c = career(); const s = latestSeason(); const m = ui.modal;
    const rounds = activeRounds(s);
    let after = -1; rounds.forEach((r, i) => { if (s.weekends[r.id]?.sessions?.R?.done) after = i; });
    const kind = m.rkind;
    (c.rumours ||= []).push({ id: uid(), seasonIdx: s.index, after, driver: m.driver, kind, team: kind === 'stay' ? teamOf(s, m.driver)?.id : kind === 'move' ? m.team : null, strength: m.strength, timing: kind === 'stay' ? 'next' : m.timing, status: 'open', createdAt: new Date().toISOString() });
    closeModal(); ui.view = 'stories'; ui.seasonIdx = null; ui.stories = 'all'; store.save(); render(); toast('Rumour published');
  },
  'rm-status'(el) { const rm = career().rumours.find(x => x.id === el.dataset.id); rm.status = el.dataset.v; store.save(); render(); },
  'rm-del'(el) { const c = career(); c.rumours = c.rumours.filter(x => x.id !== el.dataset.id); store.save(); render(); },
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { if (el.tagName === 'BUTTON') e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-ch]');
  if (!el) return;
  const fn = changes[el.dataset.ch];
  if (fn) fn(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset?.mask) el.value = maskTime(el.dataset.mask, el.value, (e.inputType || '').startsWith('delete'));
  if (el.dataset?.ch === 'setup' && el.tagName !== 'SELECT') ui.setup[el.dataset.k] = el.value;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
  // Enter in a lap/gap field jumps to the same field in the next row
  if (e.key === 'Enter' && e.target.matches('.res-table input[type=text]')) {
    e.preventDefault();
    const i = +e.target.dataset.i, f = e.target.dataset.f;
    e.target.blur();
    setTimeout(() => { const nx = document.querySelector(`.res-table input[data-f="${f}"][data-i="${i + 1}"]`); if (nx) { nx.focus(); nx.select(); } }, 0);
  }
});

// drag to reorder result rows
document.addEventListener('dragstart', (e) => { const tr = e.target.closest?.('tr[data-drag]'); if (!tr) return; ui.dragIdx = +tr.dataset.drag; e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragover', (e) => { const tr = e.target.closest?.('tr[data-drag]'); if (!tr || ui.dragIdx == null) return; e.preventDefault(); document.querySelectorAll('tr.drag-over').forEach(x => x.classList.remove('drag-over')); tr.classList.add('drag-over'); });
document.addEventListener('drop', (e) => {
  const tr = e.target.closest?.('tr[data-drag]'); if (!tr || ui.dragIdx == null) return;
  e.preventDefault();
  const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
  const to = +tr.dataset.drag; const [row] = sd.results.splice(ui.dragIdx, 1); sd.results.splice(to, 0, row);
  ui.dragIdx = null; sd.done = true; store.save(); render();
});
document.addEventListener('dragend', () => { ui.dragIdx = null; document.querySelectorAll('tr.drag-over').forEach(x => x.classList.remove('drag-over')); });

/** The Android back button: close the menu or dialog, then step back to the parent page. False when there's nowhere to go. */
window.pitwallBack = () => {
  if (document.body.classList.contains('nav-open')) { setNavOpen(false); return true; }
  if ($('#modal-root').innerHTML) { closeModal(); return true; }
  if (ui.view === 'setup' || !career()) return false;
  if (ui.tap) { ui.tap = null; render(); return true; }
  const parent = { weekend: 'calendar', driver: 'drivers', team: 'teams', track: 'tracks', review: 'stats' }[ui.view];
  if (parent) { ui.view = parent; render(); return true; }
  if (ui.view !== 'dashboard') { ui.view = 'dashboard'; ui.seasonIdx = null; render(); return true; }
  return false;
};
