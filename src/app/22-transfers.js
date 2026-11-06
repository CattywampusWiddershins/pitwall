/* Pitwall — Transfers and media. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* -------------------------------------------------------------- transfers */
// A transfer is a chain: a driver joins a team, the driver they replace goes somewhere, and so on, until someone
// takes an empty seat, becomes a free agent or retires. Contracts always run to the end of a season and are only
// for show: in the game the AI signs whoever it likes, so a contract never blocks a move.
function contractUntil(c, s, id) {
  const own = c.contracts?.[id];
  const u = own !== undefined ? own : D.CONTRACTS[s.year]?.[id] ?? D.CONTRACTS[2025]?.[id] ?? null;
  return u != null && u >= s.year ? u : null;
}
/** The move a driver has signed for next season, if any: the last step about them in a transfer that takes effect then. */
function nextMoveOf(c, s, id) { return (s.transfers || []).filter(tr => tr.effective === 'next').flatMap(tr => tr.steps).filter(m => m.driver === id).pop() || null; }
function contractTxt(c, s, id) {
  if (c.pending?.[id]) return 'Future undecided';
  const nm = nextMoveOf(c, s, id);
  if (nm && nm.kind === 'move' && nm.to === 'free') return `Leaving at the end of ${s.year}`;
  if (nm && nm.kind === 'move' && !['retire', 'pending'].includes(nm.to) && nm.to !== teamOf(s, id)?.id) return `Joins ${trTeam(c, s, nm.to)} for ${s.year + 1}${nm.until ? `, until the end of ${nm.until}` : ''}`;
  if (c.retired?.[id] != null && !gridIds(s).includes(id)) return `Retired (${c.retired[id]})`;
  if (!gridIds(s).includes(id)) return 'Free agent';
  const u = contractUntil(c, s, id);
  return u == null ? 'Not known' : u === s.year ? `End of ${u} · final year` : `End of ${u}`;
}
const trName = (c, s, id) => id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : s.drivers[id]?.name || driverEntry(c, id)?.name || id;
const trTeam = (c, s, tid) => (s.teams.find(t => t.id === tid) || teamMeta(c, tid))?.name || tid;
// in a Driver Career you can sign for another team yourself; an owner-driver stays with the team they own
const canMoveYou = (c) => c.type !== 'myteam';
const trPick = (c, id) => id !== PLAYER_ID || canMoveYou(c);
const trLabel = (c, s, id) => `${trName(c, s, id)}${id === PLAYER_ID ? ' (you)' : ''}`;
/** A step as recorded: what the move does to the grid. */
const stepMove = (st) => ({ kind: st.action === 'extend' ? 'extend' : 'move', driver: st.driver, to: st.action === 'move' ? st.to : st.action, replaces: st.action === 'move' ? st.replaces || null : null });
/** The grid as it would be after the first n steps of the chain being built. */
function trSim(c, s, steps, n, base = s.teams) {
  const teams = base.map(t => ({ ...t, drivers: [...t.drivers] }));
  for (const st of steps.slice(0, n)) if (st.driver) applyMove(c, teams, {}, stepMove(st));
  return teams;
}

function transferModal(pre = {}) {
  const s = latestSeason();
  const done = roundsDone(s), total = activeRounds(s).length;
  ui.modal = { kind: 'transfer', nextOnly: !!pre.nextOnly, effective: pre.nextOnly ? 'next' : pre.effective || (done >= total ? 'next' : 'now'), steps: [{ driver: pre.driver || null, action: pre.action || 'move', to: pre.to || null, until: null, replaces: null }], newDrivers: [], nd: {}, rumourId: pre.rumourId || null };
  drawTransferModal();
}
function drawTransferModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const known = allKnownDrivers(c, s);
  // a transfer for next season starts from next season's line-up (moves already signed), not this one
  const baseTeams = m.effective === 'next' ? nextLineup(c, s).teams : s.teams;
  const grid = baseTeams.flatMap(t => t.drivers).filter(Boolean);
  const startYear = m.effective === 'next' ? s.year + 1 : s.year;
  const years = Array.from({ length: 6 }, (_, k) => startYear + k);
  const opt = (v, l, on) => `<option value="${esc(v)}" ${on ? 'selected' : ''}>${esc(l)}</option>`;
  // the chain: each step after the first is the driver displaced by the step before
  const html = [];
  for (let i = 0; i < m.steps.length; i++) {
    const st = m.steps[i];
    const before = trSim(c, s, m.steps, i, baseTeams);
    const curTeam = before.find(t => t.drivers.includes(st.driver));
    const chainIds = m.steps.slice(0, i).map(x => x.driver);
    if (st.action === 'extend' && !curTeam) st.action = 'move';
    let body = '';
    if (i === 0) {
      const extra = [...new Set([...Object.keys(known), ...Object.keys(FEEDER)])].filter(id => id !== PLAYER_ID && !grid.includes(id));
      const pool = [...extra, ...m.newDrivers.map(d => d.id).filter(id => !extra.includes(id))];
      body += `<label class="field"><span>Driver</span><select data-ch="tr-field" data-i="0" data-k="driver">
        ${!st.driver ? opt('', 'Pick a driver…', true) : ''}
        ${baseTeams.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(d => d && trPick(c, d)).map(d => opt(d, trLabel(c, s, d), st.driver === d)).join('')}</optgroup>`).join('')}
        ${poolGroups(c, s, pool, (d) => opt(d, trName(c, s, d), st.driver === d))}
        <option value="__new" ${m.nd[0] ? 'selected' : ''}>+ A new driver entering F1…</option></select></label>`;
    }
    if (m.nd[i]) { html.push(`<div class="tr-step">${body}${newDriverForm('transfer', i, m.nd[i])}</div>`); break; }
    if (!st.driver) { html.push(`<div class="tr-step">${body}</div>`); break; }
    // you can move or re-sign; losing your seat or retiring isn't something the game does to you
    const you = st.driver === PLAYER_ID;
    const acts = [['move', curTeam || i ? 'Joins another team' : 'Joins a team'],
      ...(curTeam && i === 0 ? [['extend', `Signs a new contract with ${curTeam.name}`]] : []),
      ...(you ? [] : [['free', i ? 'Becomes a free agent' : curTeam ? 'Released: becomes a free agent' : 'Stays a free agent'], ['retire', 'Retires from F1']]),
      ...(you || (i === 0 && !curTeam) ? [] : [['pending', i ? 'Not decided yet: without a seat for now' : `Leaves ${curTeam.name}, next move not decided yet`]])];
    if (!acts.some(a => a[0] === st.action)) st.action = acts[0][0];
    // a displaced driver can't go straight back to the team that just replaced them
    const targets = before.filter(t => t.id !== curTeam?.id && (i === 0 || t.id !== m.steps[i - 1].to));
    if (st.action === 'move' && !targets.some(t => t.id === st.to)) st.to = targets[0]?.id || null;
    if ((st.action === 'move' || st.action === 'extend') && !years.includes(st.until)) st.until = Math.min(startYear + 1, years[years.length - 1]);
    body += `<div class="form-grid">
      <label class="field"><span>${i === 0 ? 'What happens' : `What happens to ${esc(trName(c, s, st.driver))}?`}</span><select data-ch="tr-field" data-i="${i}" data-k="action">${acts.map(([v, l]) => opt(v, l, st.action === v)).join('')}</select></label>
      ${st.action === 'move' ? `<label class="field"><span>Joins</span><select data-ch="tr-field" data-i="${i}" data-k="to">${targets.map(t => opt(t.id, t.name, st.to === t.id)).join('')}</select></label>` : ''}
      ${st.action === 'move' || st.action === 'extend' ? `<label class="field"><span>Contract until</span><select data-ch="tr-field" data-i="${i}" data-k="until">${years.map(y => opt(y, `End of ${y}`, st.until === y)).join('')}</select></label>` : ''}
    </div>`;
    // a full team means someone makes way, and the chain continues with them
    let next = null;
    if (st.action === 'move' && st.to) {
      const tgt = before.find(t => t.id === st.to);
      const seats = tgt.drivers.filter(Boolean);
      if (seats.length >= 2) {
        const out = seats.filter(d => d !== PLAYER_ID && !chainIds.includes(d) && d !== st.driver);
        if (!out.includes(st.replaces)) st.replaces = out[0] || null;
        body += `<label class="field"><span>Replacing</span><select data-ch="tr-field" data-i="${i}" data-k="replaces">${out.map(d => opt(d, trName(c, s, d), st.replaces === d)).join('')}</select></label>`;
        next = st.replaces;
      } else { st.replaces = null; body += `<p class="muted" style="font-size:13px">${esc(tgt.name)} have a free seat, so nobody is replaced.</p>`; }
    } else st.replaces = null;
    html.push(`<div class="tr-step">${i ? `<span class="label">Then</span>` : ''}${body}</div>`);
    if (next) {
      // a replaced driver's next move is usually not known straight away
      if (!m.steps[i + 1] || m.steps[i + 1].driver !== next) m.steps.splice(i + 1, m.steps.length, { driver: next, action: 'pending', to: null, until: null, replaces: null });
    } else m.steps.splice(i + 1);
  }
  const ready = m.steps.every(x => x.driver) && !Object.keys(m.nd).length;
  modal(`<div class="modal-h"><h2>New transfer</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      ${m.rumourId ? '<div class="callout" style="border-left-color:var(--team)">Making a rumour official. It is marked confirmed when you save.</div>' : ''}
      <label class="field" style="max-width:360px"><span>Takes effect</span><select data-ch="tr-field" data-k="effective">${m.nextOnly ? '' : opt('now', `Now, from the next race${roundsDone(s) >= activeRounds(s).length ? ' (season over)' : ''}`, m.effective === 'now')}${opt('next', `From the ${s.year + 1} season`, m.effective === 'next')}</select></label>
      <div class="stack">${html.join('')}</div>
      <p class="muted" style="font-size:12px">Contracts always run to the end of a season. They are for show only, so a driver under contract can still move, just as the AI does in the game. Drivers whose next move is not decided wait in Transfers until you resolve them.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="tr-confirm" ${ready ? '' : 'disabled'}>Confirm transfer</button></div>`, 'wide');
}

function confirmTransfer() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  for (const d of m.newDrivers) if (m.steps.some(x => x.driver === d.id)) { (c.customDrivers ||= []).push(d); s.drivers[d.id] = { ...d }; }
  const before = { teams: s.teams.map(t => ({ id: t.id, drivers: [...t.drivers] })), contracts: { ...(c.contracts || {}) }, retired: { ...(c.retired || {}) }, pending: { ...(c.pending || {}) }, playerTeamId: s.playerTeamId, benched: s.benched };
  // record each step with the team the driver was at before the chain and what their old deal was
  const steps = m.steps.map(st => {
    const base = m.effective === 'next' ? nextLineup(c, s).teams : s.teams;
    const rec = { ...stepMove(st), from: base.find(t => t.drivers.includes(st.driver))?.id ?? (m.effective === 'next' ? null : teamOf(s, st.driver)?.id ?? null), until: st.action === 'move' || st.action === 'extend' ? st.until : null, prevUntil: contractUntil(c, s, st.driver), wasPending: !!c.pending?.[st.driver] };
    if (rec.kind === 'extend') rec.to = rec.from;
    return rec;
  });
  const tr = { id: uid(), at: roundsDone(s), effective: m.effective, createdAt: new Date().toISOString(), steps, rumourId: m.rumourId || null, before };
  if (m.effective === 'now') {
    for (const st of steps) applyMove(c, s.teams, s.drivers, st);
    // you changed teams: the seat you took is yours now, and nobody waits to get your old one back
    if (steps.some(st => st.driver === PLAYER_ID && st.kind === 'move')) { s.playerTeamId = teamOf(s, PLAYER_ID)?.id || s.playerTeamId; s.benched = null; }
  }
  c.contracts ||= {}; c.retired ||= {}; c.pending ||= {};
  for (const st of steps) {
    c.contracts[st.driver] = st.until ?? null;
    if (st.to === 'retire') c.retired[st.driver] = s.year; else delete c.retired[st.driver];
    // an undecided driver waits in Transfers; any later move settles it
    if (st.to === 'pending') c.pending[st.driver] = { seasonIdx: s.index, trId: tr.id, from: st.from }; else delete c.pending[st.driver];
  }
  const rm = (c.rumours || []).find(x => x.id === m.rumourId); if (rm) rm.status = 'confirmed';
  (s.transfers ||= []).push(tr);
  closeModal(); store.save(); render(); toast('Transfer confirmed. The press has the story.');
  if (ui.nextKeep) nextSeasonModal(); // back to the start-of-season window it came from
}
function undoTransfer() {
  const c = career(); const s = latestSeason(); const tr = s.transfers?.[s.transfers.length - 1]; if (!tr) return;
  for (const b of tr.before.teams) { const t = s.teams.find(x => x.id === b.id); if (t) t.drivers = [...b.drivers]; }
  c.contracts = { ...tr.before.contracts }; c.retired = { ...tr.before.retired }; c.pending = { ...(tr.before.pending || {}) };
  if (tr.before.playerTeamId) { s.playerTeamId = tr.before.playerTeamId; s.benched = tr.before.benched ?? s.benched; }
  const rm = (c.rumours || []).find(x => x.id === tr.rumourId); if (rm) rm.status = 'open';
  s.transfers.pop(); store.save(); render(); toast('Transfer undone');
}
const trLine = (c, s, st) => st.kind === 'extend' ? `${trName(c, s, st.driver)} stays at ${trTeam(c, s, st.to)} until the end of ${st.until}`
  : st.to === 'free' ? `${trName(c, s, st.driver)} becomes a free agent` : st.to === 'retire' ? `${trName(c, s, st.driver)} retires`
  : st.to === 'pending' ? `${trName(c, s, st.driver)} ${st.from ? `leaves ${trTeam(c, s, st.from)}` : 'is without a seat'}, next move not decided yet`
  : `${trName(c, s, st.driver)} joins ${trTeam(c, s, st.to)}${st.replaces ? `, replacing ${lastName(trName(c, s, st.replaces))}` : ''}${st.until ? ` (until ${st.until})` : ''}`;

/** The pool as <optgroup>s for a driver picker. ids limits it to those (anyone else known lands in "Others"). */
function poolGroups(c, s, ids, opt) {
  const P = driverPool(c, s); const pick = new Set(ids);
  const seen = new Set();
  const group = (label, list) => { const l = list.filter(d => pick.has(d) && !seen.has(d)); l.forEach(d => seen.add(d)); return l.length ? `<optgroup label="${esc(label)}">${l.map(opt).join('')}</optgroup>` : ''; };
  return group('Free agents', P.free) + group('Your drivers', P.custom) + group('F2 & F3 (2024–25)', P.feeder) + group('Retired', P.retired) + group('Others', ids);
}
/** Transfers: everyone who could be signed besides the grid. */
function poolPanel(c, s) {
  const P = driverPool(c, s);
  const btn = (id, extra = '') => `<button class="btn sm ghost" data-act="tr-new" data-driver="${id}">${avatar(c, s, id, 20)} ${esc(trName(c, s, id))}${extra}</button>`;
  const sec = (title, note, ids, extra) => `<details class="panel-b" style="border-top:1px solid var(--line)"><summary><span class="label">${title}</span> <span class="muted" style="font-size:12px">${plural(ids.length, 'driver')}${note ? ` · ${note}` : ''}</span></summary>
    <div class="row" style="gap:6px;margin-top:8px">${ids.length ? ids.map(id => btn(id, extra ? extra(id) : '')).join('') : '<span class="muted" style="font-size:13px">Nobody</span>'}</div></details>`;
  return `<div class="panel"><div class="panel-h"><div><h2>Driver pool</h2><span class="muted" style="font-size:12px">Tap anyone to sign them</span></div><button class="btn sm" data-act="pool-add">+ Add a driver</button></div>
    ${sec('Free agents', 'raced in the last two seasons', P.free)}
    ${sec('Your drivers', 'added by you', P.custom)}
    ${sec('F2 & F3', c.feeder ? 'new talent replaces anyone who moves up' : '', P.feeder, (id) => ` <span class="muted">· ${esc(feederLabel(c, id) || '')}</span>`)}
    <details class="panel-b" style="border-top:1px solid var(--line)"><summary><span class="label">Retired</span> <span class="muted" style="font-size:12px">${P.retired.length} drivers · a comeback is rare, but possible</span></summary>
      <div class="row" style="gap:6px;margin-top:8px">${P.retired.map(id => btn(id)).join('')}</div></details>
  </div>`;
}
/**
 * The grid as F1 shows it: a card per team in its colours, both drivers with their picture, number, nationality and
 * contract (yellow: the deal ends this season; black: retiring; grey: future undecided). Clicking a driver opens a
 * transfer for them. teams/drivers: the line-up to show (this season's, or next season's as it stands).
 */
function gridCards(c, s, teams, drivers, { act = 'tr-new', year = s.year } = {}) {
  const name = (d) => d === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : drivers[d]?.name || anyName(d);
  const card = (t) => {
    const col = t.color || '#5E6A82'; const ink = contrastInk(col);
    const seat = (d) => {
      if (!d) return `<div class="gc-d gc-empty"><span>Empty seat</span></div>`;
      // their own full body, else their photo, else the team's (or the default) driver
      const photo = !bodyOf(c, d) && driverPhoto(c, d); const pic = !photo && bodyFor(c, d, s)?.url; const head = photo || (!pic && headOf(c, d, s));
      // on this season's grid, a move signed for next season shows instead of the contract: joining another team, or leaving
      const nm = year === s.year ? nextMoveOf(c, s, d) : null;
      const goes = nm && nm.kind === 'move' && !['retire', 'pending', 'free'].includes(nm.to) && nm.to !== t.id ? (s.teams.find(x => x.id === nm.to) || teamMeta(c, nm.to)) : null;
      const leaves = nm && nm.kind === 'move' && nm.to === 'free';
      const u = c.retired?.[d] != null ? 'ret' : c.pending?.[d] ? 'pend' : null; const until = u || goes || leaves ? null : contractUntil(c, s, d);
      const tag = u === 'ret' ? 'RETIRING' : u === 'pend' ? 'UNDECIDED' : goes ? `JOINING ${goes.name.replace(/\s+(Racing|F1 Team|Formula One Team)$/i, '').toUpperCase()}` : leaves ? `LEAVING FOR ${s.year + 1}` : until == null ? '' : until <= year ? `FINAL YEAR` : `TO ${until}`;
      const cls = u === 'ret' ? 'ret' : u === 'pend' ? 'pend' : goes ? 'move' : leaves ? 'pend' : until != null && until <= year ? 'exp' : '';
      const tagStyle = goes ? ` style="background:${goes.color || '#fff'};color:${contrastInk(goes.color || '#ffffff')}"` : '';
      const num = drivers[d]?.number ?? (d === PLAYER_ID ? c.profile.number : '');
      return `<button class="gc-d ${d === PLAYER ? 'me' : ''}" data-act="${trPick(c, d) ? act : 'open-driver'}" data-driver="${d}" data-id="${d}" title="${esc(contractTxt(c, s, d))}">
        <span class="gc-num">${esc(String(num ?? ''))}</span>${tag ? `<span class="gc-ctr ${cls}"${tagStyle}>${tag}</span>` : ''}
        ${pic ? `<img class="gc-body" src="${esc(pic)}" alt="">` : head ? `<img class="gc-head" src="${esc(head)}" alt="">` : ''}
        <span class="gc-lbl">${natFlag(gfxNat(c, d), 11)}<b>${esc(lastName(name(d)))}</b><small>${esc(name(d).split(' ').slice(0, -1).join(' '))}</small></span></button>`;
    };
    return `<div class="gc-team ${t.id === s.playerTeamId ? 'me' : ''}" style="--c:${col};--i:${ink}"><div class="gc-h">${teamLogo(c, t, 24)}<b>${esc(t.name)}</b></div><div class="gc-ds">${(t.drivers.length ? t.drivers : [null, null]).slice(0, 2).map(seat).join('')}</div></div>`;
  };
  return `<div class="gc-grid">${teams.map(card).join('')}</div>`;
}
function renderTransfers() {
  const c = career(); const s = latestSeason();
  const open = (c.rumours || []).filter(rm => rm.seasonIdx === s.index && rm.status === 'open' && trPick(c, rm.driver));
  const grid = gridIds(s);
  const known = allKnownDrivers(c, s);
  const pending = Object.entries(c.pending || {}).map(([id, p]) => ({ id, ...p }));
  const bench = Object.keys(known).filter(id => id !== PLAYER_ID && !grid.includes(id) && !c.pending?.[id]);
  const history = (s.transfers || []).slice().reverse().map(tr => ({ se: s, tr })); // this season's only
  const last = s.transfers?.[s.transfers.length - 1];
  return `<div class="page">
    <div class="page-head"><div><h1>Transfers</h1><div class="sub">The ${s.year} driver market. Moves update the grid now or from ${s.year + 1}, and the press reports every one.</div></div>
      <button class="btn primary" data-act="tr-new">New transfer</button></div>
    ${pending.length ? `<div class="panel"><div class="panel-h"><h2>Awaiting a decision</h2><span class="muted" style="font-size:12px">Resolve each one when the driver’s next move is known</span></div><div class="panel-b"><div class="tr-picks">
      ${pending.map(p => `<button class="tr-pick" data-act="tr-new" data-driver="${p.id}">${avatar(c, s, p.id, 30)}<span><b>${esc(trName(c, s, p.id))}</b> <span class="muted">${grid.includes(p.id) ? `leaving ${esc(trTeam(c, s, teamOf(s, p.id)?.id))} after ${s.year}` : p.from ? `was at ${esc(trTeam(c, s, p.from))}` : 'without a seat'}</span></span><span class="tag sprint">Resolve</span></button>`).join('')}
    </div></div></div>` : ''}
    ${open.length ? `<div class="panel"><div class="panel-h"><h2>From the rumour mill</h2><span class="muted" style="font-size:12px">Tap one to make it official</span></div><div class="panel-b"><div class="tr-picks">
      ${open.map(rm => `<button class="tr-pick" data-act="tr-rumour" data-id="${rm.id}">${avatar(c, s, rm.driver, 30)}<span><b>${esc(lastName(trName(c, s, rm.driver)))}</b> <span class="muted">${rm.kind === 'retire' ? 'retires' : rm.kind === 'stay' ? 'signs a new deal' : '→ ' + esc(trTeam(c, s, rm.team))}</span></span><span class="tag ${rm.strength === 'strong' ? 'sprint' : ''}">${rm.strength === 'strong' ? 'Strong' : 'Whisper'}</span></button>`).join('')}
    </div></div></div>` : ''}
    <div class="panel"><div class="panel-h"><h2>${s.year} grid & contracts</h2><span class="muted" style="font-size:12px">Tap a driver to move them · yellow: final year · black: retiring</span></div>
      <div class="panel-b">${gridCards(c, s, s.teams, s.drivers)}</div>
    </div>
    ${poolPanel(c, s)}
    <div class="panel"><div class="panel-h"><h2>${s.year} transfers</h2></div>
      ${history.length ? `<div class="panel-b tight">${history.map(({ se, tr }) => `<div class="tr-hist">
        <div class="row" style="justify-content:space-between"><span class="label">${se.year} · ${tr.at ? `after round ${tr.at}` : 'pre-season'} · ${tr.effective === 'next' ? `from ${se.year + 1}` : 'immediate'}</span>
          ${tr === last && se === s ? '<button class="btn sm ghost danger" data-act="tr-undo">Undo</button>' : ''}</div>
        <ul class="ms-list">${tr.steps.map(st => `<li>${avatar(c, se, st.driver, 24)}<span>${esc(trLine(c, se, st))}</span></li>`).join('')}</ul></div>`).join('')}</div>`
      : '<div class="empty">No transfers yet. When a driver moves in your save, log it here and the grid, standings and stories follow.</div>'}
    </div>
  </div>`;
}

/** BREAKING: the press on a transfer. World champions moving, retiring or left without a seat is huge news. */
function transferStory(c, s, tr) {
  const rnd = seeded(tr.id);
  const rounds = activeRounds(s);
  const m0 = tr.steps[0];
  const nm = trName(c, s, m0.driver), L = lastName(nm);
  const { tot } = driverRecord(c, m0.driver, careerCtxTo(c, s, tr.at)); // the record when the move was announced
  const titles = tot.titles.length;
  const champ = titles ? (titles === 1 ? 'world champion' : `${numWord(titles)}-time world champion`) : '';
  const Champ = champ ? champ[0].toUpperCase() + champ.slice(1) : '';
  const from = m0.from ? trTeam(c, s, m0.from) : null;
  const to = m0.to && !['free', 'retire', 'pending'].includes(m0.to) ? trTeam(c, s, m0.to) : null;
  const when = tr.effective === 'next' ? `from the start of ${s.year + 1}` : 'with immediate effect';
  const start = tr.effective === 'next' ? s.year + 1 : s.year;
  const length = (u) => { const n = u - start + 1; return n <= 1 ? `until the end of ${u}` : `until the end of ${u}, a ${numWord(n)}-season deal`; };
  const left = m0.prevUntil != null && m0.prevUntil > s.year ? m0.prevUntil - s.year : 0; // seasons still to run on the old deal
  const leftTxt = left === 1 ? 'a full season still to run' : `${numWord(left)} more seasons still to run`;
  const career = tot.starts ? `${L} has ${plural(tot.starts, 'Grand Prix start')}, ${plural(tot.wins, 'win')} and ${plural(tot.podiums, 'podium')}${titles ? `, plus ${plural(titles, 'world title')} (${tot.titles.join(', ')})` : ''}.` : '';
  const debut = !tot.starts && !m0.from;
  let headline, standfirst, body = [], kicker = 'BREAKING', massive = false;
  // signing after announcing a retirement this season, the first deal since: the retirement is off
  const k0 = (s.transfers || []).indexOf(tr);
  const retTr = k0 > 0 ? s.transfers.slice(0, k0).filter(x => x.steps.some(st => st.driver === m0.driver)).pop() : null;
  const unretire = retTr && retTr.steps.find(st => st.driver === m0.driver)?.to === 'retire' && (m0.kind === 'extend' || (to && m0.kind === 'move'));
  if (unretire) {
    const team = to || trTeam(c, s, m0.to); const rr = rounds[retTr.at - 1];
    kicker = 'BREAKING · U-turn'; massive = !!champ;
    headline = champ ? `BREAKING: ${Champ} ${L} unretires` : choose(rnd, [`BREAKING: ${L} unretires`, `BREAKING: ${L} U-turns on retirement`, `BREAKING: ${L} is staying in F1 after all`]);
    standfirst = `Despite announcing a retirement earlier this season, ${nm} will race on in ${s.year + 1}${m0.kind === 'extend' ? `, having signed a new contract with ${team}` : `, with ${team}`}${m0.until ? ` that runs ${length(m0.until)}` : ''}.`;
    body = [`The retirement was announced ${rr ? `after the ${rr.name} Grand Prix` : 'earlier in the year'}, and the paddock had started saying its goodbyes. Now ${L} has changed course.`,
      career, champ ? `A ${champ} back for more: the grid is all the better for it.` : choose(rnd, ['Few drivers walk back a retirement. Fewer still do it within the same season.', `${team} clearly think there is plenty left in the tank.`])];
  } else if (m0.kind === 'extend') {
    headline = champ ? `BREAKING: ${Champ} ${L} commits future to ${to}` : choose(rnd, [`BREAKING: ${L} signs new ${to} deal`, `BREAKING: ${L} commits future to ${to}`]);
    standfirst = `${nm} has agreed a new contract with ${to}${m0.until ? ` that runs ${length(m0.until)}` : ''}.`;
    body = [career];
  } else if (m0.to === 'retire') {
    massive = !!champ;
    headline = champ ? `BREAKING: ${Champ} ${nm} announces retirement` : choose(rnd, [`BREAKING: ${L} to retire from Formula 1`, `BREAKING: ${L} calls time on F1 career`]);
    standfirst = champ ? `It is the end of an era. ${nm} is retiring from Formula 1 ${tr.effective === 'next' ? `at the end of ${s.year}` : 'with immediate effect'}, bringing down the curtain on the career of a ${champ}.`
      : `${nm} is retiring from Formula 1 ${tr.effective === 'next' ? `at the end of ${s.year}` : 'with immediate effect'}${from ? `, leaving ${from}` : ''}.`;
    body = [career, archRetireLine(c, s, m0.driver, tr.at), left ? `The decision comes with ${leftTxt} on the contract with ${from}.` : '', champ ? `The paddock will be a quieter place without one of the sport’s champions.` : ''];
  } else if (m0.to === 'pending') {
    if (champ) kicker = 'BREAKING · World champion';
    headline = champ ? `BREAKING: ${Champ} ${L} to leave ${from}, future unclear` : choose(rnd, [`BREAKING: ${L} to leave ${from}`, `BREAKING: ${L} and ${from} to go separate ways`]);
    standfirst = `${nm} will leave ${from} ${tr.effective === 'next' ? `at the end of ${s.year}` : 'with immediate effect'}, and where ${L} goes next has not been decided.`;
    body = [left ? `It is an early exit: ${L} still had ${leftTxt} on the contract.` : '', career, champ ? `A ${champ} on the market is a rare thing, and several teams are bound to be interested.` : `Talks with other teams are expected in the coming weeks.`];
  } else if (m0.to === 'free') {
    massive = !!champ;
    headline = champ ? `BREAKING: ${Champ} ${L} left without a seat` : left ? `BREAKING: ${from} drop ${L} despite contract` : choose(rnd, [`BREAKING: ${from || 'Team'} part ways with ${L}`, `BREAKING: ${L} out at ${from || 'the team'}`]);
    standfirst = champ ? `A ${champ} without a drive: ${nm} is now a free agent after ${from ? `leaving ${from}` : 'failing to find a seat'}, a situation almost unheard of in modern Formula 1.`
      : `${nm} is a free agent ${when}${from ? ` after leaving ${from}` : ''}.`;
    body = [left ? `That is a surprise: ${L} had ${leftTxt} on the contract with ${from}.` : '', career];
  } else {
    if (champ) { kicker = 'BREAKING · World champion'; headline = `BREAKING: ${Champ} ${L} signs for ${to}`; }
    else if (debut) headline = choose(rnd, [`BREAKING: ${to} hand ${nm} an F1 debut`, `BREAKING: ${nm} gets an F1 chance with ${to}`]);
    else if (left) headline = choose(rnd, [`BREAKING: Shock as ${L} walks out on ${from} for ${to}`, `BREAKING: ${L} breaks ${from} contract to join ${to}`]);
    else headline = choose(rnd, [`BREAKING: ${L} joins ${to}`, `BREAKING: ${to} sign ${L}`]);
    standfirst = `${nm} will race for ${to} ${when}${from ? `, leaving ${from}` : ''}${m0.until ? `, on a deal that runs ${length(m0.until)}` : ''}.`;
    body = [left ? `Nobody saw this coming. ${L} was under contract with ${from} until the end of ${m0.prevUntil}, with ${leftTxt}, and walking away from a deal like that is rare in Formula 1.` : '',
      champ ? `World champions hardly ever change teams these days, which makes this one of the biggest moves the sport has seen in years.` : '',
      debut ? `${nm} makes the step up to Formula 1 for the first time.` : career,
      m0.replaces ? `${L} takes the seat of ${trName(c, s, m0.replaces)}.` : ''];
  }
  if (massive) kicker = 'BREAKING · Massive news';
  if (m0.wasPending && m0.to !== 'pending') standfirst += ` It ends the uncertainty over ${L}’s future.`;
  const chain = tr.steps.length > 1 ? tr.steps.slice(1).map(st => ({ id: st.driver, text: trLine(c, s, st) })) : null;
  if (chain) body.push('The knock-on effects:');
  const ri = tr.at - 1;
  return { id: 'tr' + tr.id, trId: tr.id, seq: ri * 10 + 9, kind: 'transfer', i: ri, r: rounds[ri] || null, outlet: choose(rnd, D.OUTLETS), kicker, headline, standfirst, body: body.filter(Boolean), list: chain, subject: m0.driver, massive, t: Date.parse(tr.createdAt) || 0 };
}

/* ------------------------------------------------------------------ media */
function reputation(c) {
  const v = c.media.filter(m => m.article).reduce((a, m) => a + (+m.rep || 0), 0);
  return Math.max(-10, Math.min(10, v));
}
function renderMedia() {
  const c = career();
  const open = c.media.find(m => m.id === ui.mediaOpen) || c.media.find(m => !m.article && m.questions?.length);
  const published = c.media.filter(m => m.article).slice().reverse();
  const rep = reputation(c);
  const repLabel = rep >= 6 ? 'Paddock favourite' : rep >= 2 ? 'Well liked' : rep > -2 ? 'Neutral' : rep > -6 ? 'Divisive' : 'Villain of the paddock';
  return `<div class="page">
    <div class="page-head"><div><h1>Media</h1><div class="sub">Press conferences shaped by your results.</div></div>
      <div class="row">${!settings.hasKey && window.api ? '<span class="muted" style="font-size:12px">Offline questions · add an API key in Settings for AI journalists</span>' : ''}<button class="btn primary" data-act="new-media">${ICON.mic} New media session</button></div></div>
    <div class="panel"><div class="panel-b"><div class="rep-meter"><span class="label" style="width:130px">Media reputation</span><div class="track"><span class="knob" style="left:${(rep + 10) / 20 * 100}%"></span></div><b style="width:170px;text-align:right;font-family:var(--font-display)">${repLabel}</b></div></div></div>
    ${open ? renderMediaSession(c, open) : ''}
    <div class="panel"><div class="panel-h"><h2>Press clippings</h2><span class="muted">${published.length} article${published.length === 1 ? '' : 's'}</span></div>
      ${published.length ? published.map(m => renderArticle(c, m)).join('') : '<div class="empty">Your published interviews will appear here.</div>'}
    </div>
  </div>`;
}
function mediaTitle(c, m) {
  const s = c.seasons[m.seasonIdx];
  const r = s?.calendar.find(x => x.id === m.roundId);
  const kind = { preseason: 'Pre-season media day', quali: 'Post-qualifying press conference', sprint: 'Post-sprint interview', race: 'Post-race press conference', midseason: 'Mid-season interview', endseason: 'End-of-season interview' }[m.kind] || 'Media session';
  return `${kind}${r ? ' · ' + r.name : ''} · ${s?.year || ''}`;
}
function renderMediaSession(c, m) {
  return `<div class="panel">
    <div class="panel-h"><div><span class="label">In progress</span><h2>${esc(mediaTitle(c, m))}</h2></div>
      <div class="row"><button class="btn sm ghost danger" data-act="media-discard" data-id="${m.id}">Discard</button></div></div>
    <div class="panel-b qa">
      ${m.questions.map((q, i) => `<div class="q">
        <div class="who"><b>${esc(q.reporter)}</b> · ${esc(q.outlet)}</div>
        <div class="qt">${esc(q.question)}</div>
        <textarea id="ans-${m.id}-${i}" data-ch="media-answer" data-id="${m.id}" data-i="${i}" placeholder="Your answer…" style="min-height:70px">${esc(q.answer || '')}</textarea>
        <div class="tone-picks">${['No comment.', 'I’d rather focus on the next race.', 'Credit to the team, they did a great job.'].map(t => `<button class="btn sm ghost" data-act="media-quick" data-id="${m.id}" data-i="${i}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      </div>`).join('')}
      <div class="row" style="justify-content:flex-end">${ui.busy ? '<span class="spinner"></span><span class="muted">Writing up the story…</span>' : ''}<button class="btn primary" data-act="media-publish" data-id="${m.id}" ${ui.busy ? 'disabled' : ''}>Finish interview & publish</button></div>
    </div>
  </div>`;
}
function renderArticle(c, m) {
  const a = m.article;
  return `<article class="article">
    <div class="row" style="justify-content:space-between"><span class="outlet">${esc(a.outlet)}</span><span class="muted" style="font-size:12px">${esc(mediaTitle(c, m))} ${m.rep > 0 ? '<span class="tag done">Rep +' + m.rep + '</span>' : m.rep < 0 ? '<span class="tag dnf">Rep ' + m.rep + '</span>' : ''}</span></div>
    <div class="headline">${esc(a.headline)}</div>
    <div class="body">${(a.body || []).map(p => `<p>${esc(p)}</p>`).join('')}</div>
    ${m.reactions?.length ? `<div class="reactions">${m.reactions.map(r => `<div class="reaction"><b>${esc(r.who)}:</b> ${esc(r.text)}</div>`).join('')}</div>` : ''}
    <details><summary class="muted" style="cursor:pointer;font-size:13px">Interview transcript</summary><div class="qa" style="margin-top:10px">${m.questions.map(q => `<div class="q"><div class="who"><b>${esc(q.reporter)}</b> · ${esc(q.outlet)}</div><div class="qt">${esc(q.question)}</div><div class="ans">${esc(q.answer || 'No answer.')}</div></div>`).join('')}</div></details>
    <div><button class="btn sm ghost danger" data-act="media-delete" data-id="${m.id}">Delete article</button></div>
  </article>`;
}
