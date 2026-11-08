/* Pitwall — My Team and the Hall of Fame. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ---------------------------------------------------------------- my team */
const fmtM = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
function teamBadge(t, size = 40) {
  if (t?.logo) return `<img class="team-logo" src="${esc(t.logo)}" alt="${esc(t.name || '')} logo" style="width:${size}px;height:${size}px">`;
  const col = t?.color || '#5E6A82';
  const col2 = t?.color2 || contrastInk(col);
  const short = (t?.short || t?.name || '?').slice(0, 3).toUpperCase();
  return `<span class="team-logo initials" style="width:${size}px;height:${size}px;background:linear-gradient(135deg, ${col} 0 64%, ${col2} 64% 72%, ${col} 72%);color:${contrastInk(col)};font-size:${Math.max(7, Math.round(size * 0.3))}px">${esc(short)}</span>`;
}
/** Team logo for tables. */
function teamMark(c, t) { return teamLogo(c, t, 22); }

const hex2 = (n) => n.toString(16).padStart(2, '0');
/** The two most prominent colours in a logo, favouring saturated ones over white/black/grey. */
function logoColors(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 48;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 48, 48);
      const px = g.getImageData(0, 0, 48, 48).data;
      const buckets = {};
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        const r = px[i] & 0xF0, gg = px[i + 1] & 0xF0, b = px[i + 2] & 0xF0;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        const sat = mx ? (mx - mn) / mx : 0;
        const k = `${r},${gg},${b}`;
        (buckets[k] ||= { r, g: gg, b, n: 0, w: 0.25 + sat }).n++;
      }
      const list = Object.values(buckets).sort((a, b) => b.n * b.w - a.n * a.w);
      if (!list.length) { resolve(null); return; }
      const toHex = (x) => '#' + [x.r, x.g, x.b].map(v => hex2(Math.min(255, v + 8))).join('');
      const a = list[0];
      const far = list.find(x => Math.abs(x.r - a.r) + Math.abs(x.g - a.g) + Math.abs(x.b - a.b) > 160);
      resolve([toHex(a), far ? toHex(far) : '#F2F2F2']);
    };
    img.src = dataUrl;
  });
}

function teamIdentityForm(t, scope) {
  return `<div class="identity">
    <div class="livery" style="--c1:${t.color};--c2:${t.color2}">
      ${teamBadge(t, 84)}
      <div style="min-width:0"><div class="livery-name">${esc(t.name || 'Your team')}</div><div class="muted" style="font-size:13px">${esc([t.base, t.engine && t.engine + ' power'].filter(Boolean).join(' · ') || 'Base and engine')}</div></div>
    </div>
    <div class="form-grid">
      <label class="field"><span>Team name</span><input type="text" data-ch="mt-field" data-scope="${scope}" data-k="name" value="${esc(t.name)}" placeholder="Kestrel Racing"></label>
      <label class="field"><span>Short name</span><input type="text" maxlength="3" data-ch="mt-field" data-scope="${scope}" data-k="short" value="${esc(t.short)}" placeholder="KES"></label>
      <label class="field"><span>Base</span><input type="text" data-ch="mt-field" data-scope="${scope}" data-k="base" value="${esc(t.base)}" placeholder="Silverstone, UK"></label>
      <label class="field"><span>Engine supplier</span><select data-ch="mt-field" data-scope="${scope}" data-k="engine">${D.ENGINES.map(e => `<option ${t.engine === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <label class="field"><span>Primary colour</span><input type="color" data-ch="mt-field" data-scope="${scope}" data-k="color" value="${esc(t.color)}"></label>
      <label class="field"><span>Secondary colour</span><input type="color" data-ch="mt-field" data-scope="${scope}" data-k="color2" value="${esc(t.color2)}"></label>
    </div>
    <div class="row">
      <label class="btn sm file-btn">${t.logo ? 'Replace logo' : 'Import logo'}<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" data-ch="mt-logo" data-scope="${scope}" hidden></label>
      ${t.logo ? `<button class="btn sm" data-act="mt-logo-colors" data-scope="${scope}">Use logo colours</button><button class="btn sm ghost danger" data-act="mt-logo-clear" data-scope="${scope}">Remove logo</button>` : ''}
      <span class="muted" style="font-size:12px">PNG with a transparent background works best. Images are resized to 256 px and kept in your save file.</span>
    </div>
  </div>`;
}

function myTeamSeason(c, s, st = seasonStats(s)) {
  const cs = constructorStandings(s, st);
  const row = cs.find(x => x.team.id === MYTEAM);
  const team = s.teams.find(t => t.id === MYTEAM);
  const ids = (team?.drivers || []).filter(Boolean);
  return { s, row, team, ids, teams: cs.length, poles: ids.reduce((a, id) => a + (st[id]?.poles || 0), 0), st };
}
function ledgerTotals(m, seasonIdx = null) {
  let income = 0, expense = 0;
  for (const e of m.ledger) { if (seasonIdx != null && e.seasonIdx !== seasonIdx) continue; if (e.amount >= 0) income += e.amount; else expense -= e.amount; }
  return { income, expense, net: income - expense };
}
function roundLabel(c, seasonIdx, roundId) {
  const s = c.seasons[seasonIdx]; if (!s) return '';
  const rs = activeRounds(s); const i = rs.findIndex(r => r.id === roundId);
  return i >= 0 ? `${s.year} · R${i + 1} ${rs[i].name}` : `${s.year} · Off-season`;
}
function roundSelect(s, id, sel) {
  const nr = nextRound(s);
  return `<select id="${id}"><option value="">Off-season</option>${activeRounds(s).map((r, i) => `<option value="${r.id}" ${(sel ?? nr?.id) === r.id ? 'selected' : ''}>R${i + 1} · ${esc(r.name)}</option>`).join('')}</select>`;
}

function renderMyTeam() {
  const c = career();
  if (c.type !== 'myteam' || !c.myTeam) {
    const t = latestSeason().teams.find(x => x.id === latestSeason().playerTeamId);
    return `<div class="page"><div class="page-head"><div><h1>My Team</h1><div class="sub">Found and run your own team: identity and logo, car development, finances and sponsors.</div></div></div>
      <div class="panel"><div class="empty" style="padding:40px 16px">This save is a Driver Career with ${esc(t?.name || 'a works team')}. My Team runs as its own career, where you start the 11th team and drive for it.<button class="btn primary" data-act="new-career-myteam">Start a My Team career</button></div></div></div>`;
  }
  const m = c.myTeam; const s = latestSeason();
  const cur = myTeamSeason(c, s);
  const balance = m.budget + ledgerTotals(m).net;
  const tab = ui.mt;
  const tabs = [['overview', 'Overview'], ['identity', 'Identity'], ['development', 'Car development'], ['finance', 'Finances'], ['sponsors', 'Sponsors']];
  let body = '';
  if (tab === 'identity') body = renderMtIdentity(c, m);
  else if (tab === 'development') body = renderMtDev(c, m, s);
  else if (tab === 'finance') body = renderMtFinance(c, m, s, balance);
  else if (tab === 'sponsors') body = renderMtSponsors(c, m, s);
  else body = renderMtOverview(c, m, s, cur, balance);
  return `<div class="page">
    <section class="hero" style="--team:${m.color};--team-2:${m.color2}">
      <div class="stripes"></div>
      ${teamBadge(m, 92)}
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">My Team · est. ${m.founded || 2025}</span>
        <div class="name">${esc(m.name)}</div>
        <div class="meta">${m.base ? `<span>${esc(m.base)}</span>` : ''}<span>${esc(m.engine)} power</span><span>Team principal: ${esc(m.principal || `${c.profile.first} ${c.profile.last}`)}</span>${(() => { const a = archRivalTeam(c, s); return a ? `<span>Archrival: ${esc(a.name)}</span>` : ''; })()}</div>
        <div class="meta" style="margin-top:6px"><span><b>${cur.row && roundsDone(s) ? 'P' + cur.row.pos : '–'}</b> of ${cur.teams} in the constructors</span><span>${cur.row?.pts || 0} points</span><span>Budget ${fmtM(balance)}</span></div>
      </div>
      <div class="next-card">${(() => { const nr = nextRound(s); const total = activeRounds(s).length; return nr
        ? `<span class="label">Next up · Round ${activeRounds(s).indexOf(nr) + 1} of ${total}</span><div style="font-family:var(--font-display);font-size:20px;font-weight:600">${esc(nr.name)} ${nr.sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div><span class="muted">${esc(nr.venue)} · ${weekendTxt(s, nr)}</span><button class="btn primary" data-act="open-round" data-round="${nr.id}">Log weekend</button>`
        : `<span class="label">Season complete</span><div style="font-family:var(--font-display);font-size:20px;font-weight:600">All ${total} rounds logged</div><button class="btn" data-act="open-review" data-idx="${s.index}">Season review</button><button class="btn primary" data-act="next-season">Start ${s.year + 1} season</button>`; })()}</div>
    </section>
    <div class="row"><div class="seg">${tabs.map(([id, l]) => `<button data-act="mt-tab" data-tab="${id}" class="${tab === id ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    ${body}
  </div>`;
}

/** The season at a glance for a My Team dashboard: goals, the title fights and both championships. */
function mtSeasonPanels(c, m, s) {
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st);
  const mine = new Set(s.teams.find(t => t.id === MYTEAM)?.drivers.filter(Boolean) || []);
  const top = ds.slice(0, 6); for (const id of mine) { const r = ds.find(x => x.id === id); if (r && !top.includes(r)) top.push(r); }
  const lastArticle = [...c.media].reverse().find(x => x.article && x.seasonIdx === s.index);
  return `<div class="grid-main">
      <div class="stack">${goalsPanel(c, s)}${rivalryPanel(c, s)}</div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h2>Constructors</h2><button class="btn sm ghost" data-act="nav" data-view="standings">All</button></div>
          <div class="panel-b tight"><table><tbody>${cs.slice(0, 6).concat(cs.slice(6).filter(x => x.team.id === MYTEAM)).map(x => `<tr class="${x.team.id === MYTEAM ? 'me' : ''}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td><div class="drv">${teamLogo(c, x.team, 20)}<b>${esc(x.team.name)}</b></div></td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div></div>
        <div class="panel"><div class="panel-h"><h2>Drivers</h2></div>
          <div class="panel-b tight"><table><tbody>${top.map(x => `<tr class="${mine.has(x.id) ? 'me' : ''}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${drvCell(s, x.id)}</td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div></div>
        ${lastArticle ? `<div class="panel"><div class="panel-h"><h2>Latest from the paddock</h2><button class="btn sm ghost" data-act="nav" data-view="media">Media</button></div><div class="article"><span class="outlet">${esc(lastArticle.article.outlet)}</span><div class="headline" style="font-size:18px">${esc(lastArticle.article.headline)}</div></div></div>` : ''}
      </div></div>`;
}
function renderMtOverview(c, m, s, cur, balance) {
  const hist = playedSeasons(c).map(x => myTeamSeason(c, x));
  const all = hist.reduce((a, h) => ({ pts: a.pts + (h.row?.pts || 0), wins: a.wins + (h.row?.wins || 0), podiums: a.podiums + (h.row?.podiums || 0), poles: a.poles + h.poles }), { pts: 0, wins: 0, podiums: 0, poles: 0 });
  const titles = hist.filter(h => h.row && decidedChamps(h.s, roundsDone(h.s), driverStandings(h.s), constructorStandings(h.s)).champT === h.row.team?.id).map(h => h.s.year);
  const ids = cur.ids;
  const h = ids.length === 2 ? h2hCompare([s], ids[0], ids[1]) : null;
  const r = m.ratings[s.index] || {};
  const rated = D.DEPARTMENTS.filter(d => r[d.id] != null);
  return `
    <div class="tiles">
      <div class="tile"><span class="label">${s.year} points</span><span class="v">${cur.row?.pts || 0}</span></div>
      <div class="tile"><span class="label">${s.year} wins</span><span class="v">${cur.row?.wins || 0}</span></div>
      <div class="tile"><span class="label">${s.year} podiums</span><span class="v">${cur.row?.podiums || 0}</span></div>
      <div class="tile"><span class="label">${s.year} poles</span><span class="v">${cur.poles}</span></div>
      <div class="tile"><span class="label">Constructors' titles</span><span class="v">${titles.length}</span></div>
      <div class="tile"><span class="label">Budget</span><span class="v" style="font-size:26px;color:${balance < 0 ? 'var(--red)' : 'inherit'}">${fmtM(balance)}</span></div>
    </div>
    ${mtSeasonPanels(c, m, s)}
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>${s.year} line-up</h2></div><div class="panel-b tight"><table>
        <thead><tr><th>Driver</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Best</th></tr></thead>
        <tbody>${ids.map(id => { const o = cur.st[id] || emptyStat(); return `<tr class="${id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${id}"><td>${drvCell(s, id)}</td><td class="num"><b>${o.pts}</b></td><td class="num">${o.wins}</td><td class="num">${o.podiums}</td><td class="num">${o.best ? 'P' + o.best : '–'}</td></tr>`; }).join('')}</tbody>
      </table>
      ${h ? `<div class="panel-b stack" style="border-top:1px solid var(--line)">${miniH2H('Qualifying', h.q[0], h.q[1], s, ids[1])}${miniH2H('Race', h.r[0], h.r[1], s, ids[1])}</div>` : ''}
      <div class="panel-b muted" style="font-size:13px;border-top:1px solid var(--line)">Change your teammate in Settings → ${s.year} roster.</div></div></div>
      <div class="panel"><div class="panel-h"><h2>Car performance</h2><button class="btn sm ghost" data-act="mt-tab" data-tab="development">Update</button></div><div class="panel-b stack">
        ${rated.length ? D.DEPARTMENTS.map(d => `<div style="display:grid;gap:5px"><div class="row" style="justify-content:space-between"><span>${d.name}</span><b class="tnum">${r[d.id] ?? '–'}</b></div><div class="bar-track"><div class="bar-fill" style="width:${r[d.id] || 0}%"></div></div></div>`).join('')
          : '<div class="empty">Copy your department ratings from the game to track how the car develops.<button class="btn sm" data-act="mt-tab" data-tab="development">Add ratings</button></div>'}
      </div></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Team history</h2><span class="muted" style="font-size:12px">All time: ${all.pts} pts · ${all.wins} wins · ${all.podiums} podiums · ${all.poles} poles${titles.length ? ' · champions ' + titles.join(', ') : ''}</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th class="num">Pos</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Poles</th><th>Drivers</th><th class="num">Net spend</th></tr></thead>
      <tbody>${hist.slice().reverse().map(x => { const lt = ledgerTotals(m, x.s.index); const done = roundsDone(x.s); return `<tr><td><b>${x.s.year}</b>${done < activeRounds(x.s).length ? ` <span class="muted" style="font-size:12px">${done}/${activeRounds(x.s).length}</span>` : ''}</td>
        <td class="num">${x.row && done ? `<span class="pos ${x.row.pos <= 3 ? 'p' + x.row.pos : ''}" style="font-size:14px">P${x.row.pos}</span>` : '–'}</td><td class="num"><b>${x.row?.pts || 0}</b></td><td class="num">${x.row?.wins || 0}</td><td class="num">${x.row?.podiums || 0}</td><td class="num">${x.poles}</td>
        <td class="muted">${x.ids.map(id => esc(dName(x.s, id))).join(' · ')}</td><td class="num ${lt.net < 0 ? 'neg' : 'pos-money'}">${m.ledger.some(e => e.seasonIdx === x.s.index) ? fmtM(lt.net) : '–'}</td></tr>`; }).join('')}</tbody>
    </table></div></div>`;
}

function renderMtIdentity(c, m) {
  return `<div class="panel"><div class="panel-h"><h2>Team identity</h2><span class="muted" style="font-size:12px">Changes apply to every season of this career and to the theme when it matches your team</span></div><div class="panel-b stack">
    ${teamIdentityForm(m, 'team')}
    <div class="form-grid">
      <label class="field"><span>Team principal</span><input type="text" data-ch="mt-field" data-scope="team" data-k="principal" value="${esc(m.principal || '')}"></label>
      <label class="field"><span>Founded</span><input type="number" data-ch="mt-field" data-scope="team" data-k="founded" value="${esc(m.founded || 2025)}"></label>
    </div>
    <label class="field"><span>Team story (used by the media)</span><textarea data-ch="mt-field" data-scope="team" data-k="story" placeholder="Backed by a Cape Town investment group, the team set up shop at Silverstone…">${esc(m.story || '')}</textarea></label>
  </div></div>`;
}

function renderMtDev(c, m, s) {
  const r = m.ratings[s.index] || {};
  const prev = m.ratings[s.index - 1] || null;
  const vals = D.DEPARTMENTS.map(d => r[d.id]).filter(v => v != null);
  const overall = vals.length ? Math.round(avg(vals)) : null;
  const ups = m.upgrades.slice().reverse();
  return `<div class="grid-2">
    <div class="panel"><div class="panel-h"><h2>${s.year} department ratings</h2><span class="muted" style="font-size:12px">Overall ${overall ?? '–'}${prev ? ' · vs last season' : ''}</span></div><div class="panel-b stack">
      ${D.DEPARTMENTS.map(d => {
        const v = r[d.id]; const p = prev?.[d.id]; const delta = v != null && p != null ? v - p : null;
        return `<div style="display:grid;gap:6px"><div class="row" style="justify-content:space-between"><span>${d.name}</span>
          <span class="row" style="gap:8px">${delta ? `<span class="${delta > 0 ? 'pos-money' : 'neg'}" style="font-size:12px">${delta > 0 ? '+' : ''}${delta}</span>` : ''}<input type="number" min="0" max="100" style="width:80px" value="${v ?? ''}" placeholder="0–100" data-ch="mt-rating" data-k="${d.id}"></span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${v || 0}%"></div></div></div>`;
      }).join('')}
      <p class="muted" style="font-size:13px">Copy the ratings from the car performance screen in-game. Each season keeps its own set, so you can see the gains year on year.</p>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Log an upgrade</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>When</span>${roundSelect(s, 'up-round')}</label>
        <label class="field"><span>Department</span><select id="up-dept">${D.DEPARTMENTS.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></label>
        <label class="field"><span>Part</span><input type="text" id="up-part" placeholder="Front wing, spec B"></label>
        <label class="field"><span>Cost ($M)</span><input type="number" id="up-cost" min="0" step="0.1" placeholder="Optional"></label>
      </div>
      <label class="field"><span>Notes</span><input type="text" id="up-notes" placeholder="+0.15s per lap in high-speed corners"></label>
      <div class="row"><button class="btn primary" data-act="mt-add-upgrade">Add upgrade</button><label class="check"><input type="checkbox" id="up-ledger" checked> Add the cost to finances</label></div>
    </div></div>
  </div>
  <div class="panel"><div class="panel-h"><h2>Upgrade history</h2><span class="muted">${m.upgrades.length} upgrade${m.upgrades.length === 1 ? '' : 's'}</span></div><div class="panel-b tight table-wrap"><table>
    <thead><tr><th>When</th><th>Department</th><th>Part</th><th>Notes</th><th class="num">Cost</th><th></th></tr></thead>
    <tbody>${ups.length ? ups.map(u => `<tr><td class="muted">${esc(roundLabel(c, u.seasonIdx, u.roundId))}</td><td>${esc(D.DEPARTMENTS.find(d => d.id === u.dept)?.name || u.dept)}</td><td><b>${esc(u.part)}</b></td><td class="muted">${esc(u.notes)}</td><td class="num">${u.cost ? fmtM(u.cost) : '–'}</td><td><button class="icon-btn" title="Remove" data-act="mt-del" data-list="upgrades" data-id="${u.id}">${ICON.x}</button></td></tr>`).join('')
      : '<tr><td colspan="6"><div class="empty">No upgrades logged yet.</div></td></tr>'}</tbody>
  </table></div></div>`;
}

function renderMtFinance(c, m, s, balance) {
  const season = ledgerTotals(m, s.index);
  let run = m.budget;
  const rows = m.ledger.map(e => ({ ...e, after: (run += e.amount) })).reverse();
  return `<div class="tiles">
      <div class="tile"><span class="label">Balance</span><span class="v" style="font-size:26px;color:${balance < 0 ? 'var(--red)' : 'inherit'}">${fmtM(balance)}</span></div>
      <div class="tile"><span class="label">Starting budget</span><span class="v" style="font-size:26px">${fmtM(m.budget)}</span></div>
      <div class="tile"><span class="label">${s.year} income</span><span class="v pos-money" style="font-size:26px">${fmtM(season.income)}</span></div>
      <div class="tile"><span class="label">${s.year} spending</span><span class="v neg" style="font-size:26px">${fmtM(season.expense)}</span></div>
      <div class="tile"><span class="label">${s.year} net</span><span class="v" style="font-size:26px">${fmtM(season.net)}</span></div>
      <div class="tile"><span class="label">Entries</span><span class="v" style="font-size:26px">${m.ledger.length}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Add an entry</h2>
      <label class="row muted">Starting budget ($M) <input type="number" step="0.1" style="width:110px" value="${m.budget}" data-ch="mt-budget"></label></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>When</span>${roundSelect(s, 'lg-round')}</label>
        <label class="field"><span>Type</span><select id="lg-type"><option value="in">Income</option><option value="out">Expense</option></select></label>
        <label class="field"><span>Category</span><select id="lg-cat">${D.LEDGER_CATS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Amount ($M)</span><input type="number" id="lg-amt" min="0" step="0.01" placeholder="2.5"></label>
      </div>
      <label class="field"><span>Note</span><input type="text" id="lg-note" placeholder="Prize money for P6 in the 2025 constructors"></label>
      <div><button class="btn primary" data-act="mt-add-ledger">Add entry</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Ledger</h2></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>When</th><th>Category</th><th>Note</th><th class="num">Amount</th><th class="num">Balance</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(e => `<tr><td class="muted">${esc(roundLabel(c, e.seasonIdx, e.roundId))}</td><td>${esc(e.cat)}</td><td class="muted">${esc(e.note)}</td><td class="num ${e.amount < 0 ? 'neg' : 'pos-money'}"><b>${e.amount > 0 ? '+' : ''}${fmtM(e.amount)}</b></td><td class="num">${fmtM(e.after)}</td><td><button class="icon-btn" title="Remove" data-act="mt-del" data-list="ledger" data-id="${e.id}">${ICON.x}</button></td></tr>`).join('')
        : '<tr><td colspan="6"><div class="empty">No entries yet. Log sponsor payments, prize money and spending as the season goes.</div></td></tr>'}</tbody>
    </table></div></div>`;
}

function renderMtSponsors(c, m, s) {
  const active = m.sponsors.filter(x => x.status === 'Active');
  return `<div class="tiles">
      <div class="tile"><span class="label">Active sponsors</span><span class="v">${active.length}</span></div>
      <div class="tile"><span class="label">Value per season</span><span class="v" style="font-size:26px">${fmtM(active.reduce((a, x) => a + (+x.value || 0), 0))}</span></div>
      <div class="tile"><span class="label">Title sponsor</span><span class="v" style="font-size:20px">${esc(active.find(x => x.tier === 'Title')?.name || '–')}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Sign a sponsor</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>Sponsor</span><input type="text" id="sp-name" placeholder="Apex Energy"></label>
        <label class="field"><span>Tier</span><select id="sp-tier">${D.SPONSOR_TIERS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Value ($M per season)</span><input type="number" id="sp-value" min="0" step="0.1"></label>
        <label class="field"><span>Objective</span><input type="text" id="sp-goal" placeholder="Score points in 5 races"></label>
      </div>
      <div><button class="btn primary" data-act="mt-add-sponsor">Add sponsor</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Sponsor portfolio</h2></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Sponsor</th><th>Tier</th><th class="num">Value</th><th>Objective</th><th>Since</th><th>Status</th><th></th></tr></thead>
      <tbody>${m.sponsors.length ? m.sponsors.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.tier)}</td><td class="num">${fmtM(+x.value || 0)}</td><td class="muted">${esc(x.goal)}</td><td class="muted">${c.seasons[x.seasonIdx]?.year || ''}</td>
        <td><select data-ch="mt-sponsor-status" data-id="${x.id}" style="width:auto">${['Active', 'Objective met', 'Objective missed', 'Ended'].map(o => `<option ${x.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm ghost" data-act="mt-sponsor-pay" data-id="${x.id}" title="Add this season's payment to finances">Log payment</button><button class="icon-btn" title="Remove" data-act="mt-del" data-list="sponsors" data-id="${x.id}">${ICON.x}</button></div></td></tr>`).join('')
        : '<tr><td colspan="7"><div class="empty">No sponsors signed yet.</div></td></tr>'}</tbody>
    </table></div></div>`;
}

/* ------------------------------------------------------------ hall of fame */
/**
 * What a champion did in this career, written from the career itself: each title won in it (the team, the title's
 * number, a rookie's title, one won on countback, how early it was settled, back to back) and the records that came
 * with them. Sentences without pronouns, by last name. '' for a champion with no title in the career.
 */
function champNotes(c, key, ctx) {
  const mine = ctx.filter(x => x.champ === key && !isHist(x.s)); if (!mine.length) return '';
  const name = key === PLAYER_ID ? c.profile.last : lastName(dName(latestSeason(), key) || D.CHAMP_BIO[key]?.name || key);
  const all = ctx.filter(x => x.champ); const realBefore = D.CHAMPIONS.filter(([y]) => y < (ctx.find(x => !isHist(x.s))?.s.year ?? 9999)).filter(([, k]) => k === key).length;
  const before = (x) => realBefore + ctx.filter(y => y.champ === key && isHist(y.s) && y.s.year < x.s.year).length + mine.filter(y => y.s.year < x.s.year).length;
  // the rookie champions in history: a title in the first season with a start (every driver ever, then the career)
  const firstYear = {}; for (const [id, A] of Object.entries(H.allTime || {})) { const ys = Object.keys(A.y).filter(y => A.y[y][0] > 0).map(Number); if (ys.length) firstYear[id] = Math.min(...ys); }
  for (const x of ctx) for (const [id, o] of Object.entries(x.st)) if (o.starts && x.s.drivers[id] && firstYear[id] == null && !(D.DRIVER_BIO[id]?.starts > 0 && !H.allTime?.[id])) firstYear[id] = x.s.year;
  const rookieTitles = [...D.CHAMPIONS.filter(([y]) => y < HIST_FROM).map(([y, k]) => ({ y, k })), ...all.map(x => ({ y: x.s.year, k: x.champ }))].filter(t => firstYear[t.k] === t.y).sort((a, b) => a.y - b.y);
  const nameOf = (k) => k === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : D.CHAMP_BIO[k]?.name || dName(latestSeason(), k) || H.allTime?.[k]?.n || k;
  const cbTitles = all.filter(x => { const ds = x.ds; return ds.length > 1 && ds[0].pts === ds[1].pts; }); // no real title was ever settled on countback
  const out = []; let lastTeam = null;
  mine.forEach((x) => {
    const n = before(x) + 1; const t = teamOf(x.s, key); const rounds = activeRounds(x.s).length; const fh = fightHistory(x.s, 'driver');
    const left = fh.decidedAt ? rounds - 1 - fh.decidedAt.i : 0; const ds = x.ds; const tie = ds.length > 1 && ds[0].pts === ds[1].pts;
    const prevYear = all.some(y => y.champ === key && y.s.year === x.s.year - 1);
    let line = n === 1 ? `${name} became world champion in ${x.s.year}` : `${name} won a ${prevYear ? `${n === 2 ? 'second' : ordWord(n)} title in a row` : `${ordWord(n)} world title`} in ${x.s.year}`;
    if (t) line += t.name === lastTeam ? `, again with ${t.name}` : lastTeam ? `, this time with ${t.name}` : ` with ${t.name}`;
    lastTeam = t?.name || lastTeam;
    const wins = x.st[key]?.wins || 0; if (wins) line += `, winning ${wins} of ${rounds} races`;
    out.push(line + '.');
    if (firstYear[key] === x.s.year) {
      const k = rookieTitles.findIndex(r => r.y === x.s.year && r.k === key); const earlier = rookieTitles.slice(0, k);
      out.push(earlier.length ? `It came in a first Formula 1 season: only the ${ordWord(k + 1)} rookie champion, after ${listJoin(earlier.map(r => `${nameOf(r.k)} in ${r.y}`))}${earlier.some(r => r.y === 1950) ? ' (the first championship, when every driver was new to it)' : ''}.` : 'It came in a first Formula 1 season: the first rookie champion.');
    }
    if (tie) { const k = cbTitles.findIndex(y => y.s.year === x.s.year); const w2 = x.st[ds[1].id]?.wins || 0;
      out.push(`The title was level on points with ${nameOf(ds[1].id)} at the end and settled on countback, ${wins} wins to ${w2}: ${k === 0 ? 'the first world title ever decided that way' : `only the ${ordWord(k + 1)} title decided that way`}.`); }
    else if (left >= 1) out.push(`It was settled with ${left === 1 ? 'a round' : `${left} rounds`} to spare, by ${fmtPts(ds[0].pts - ds[1].pts)} points in the end.`);
    else if (fh.decidedAt) out.push(`It went down to the final round${ds[1] ? `, ahead of ${nameOf(ds[1].id)} by ${fmtPts(ds[0].pts - ds[1].pts)} points` : ''}.`);
  });
  // the records the titles brought, from the career's record book
  const tl = careerTimeline(c); const REC = { titles: 'the most world titles of anyone', titleStreak: 'the longest run of titles in a row', youngTitle1: 'the youngest world champion', titleMargin: 'the biggest title-winning margin', seasonWins: 'the most wins in a season', seasonPts: 'the most points in a season' };
  const recs = tl.events.filter(e => e.type === 'record' && e.id === key && !e.hist && REC[e.rid]).map(e => `${e.kind === 'equalled' ? 'equalled' : 'set'} the record for ${REC[e.rid]} (${e.when || e.year})`);
  const uniq = [...new Set(recs)].slice(0, 4); if (uniq.length) out.push(`Along the way, ${name} ${listJoin(uniq)}.`);
  return out.join(' ');
}
/* ---------------------------------------------------------------- the hall */
function hallOfFame(c) {
  const ctx = careerCtx(c);
  const years = D.CHAMPIONS.map(([year, key, team]) => ({ year, key, team, career: false }));
  for (const x of ctx) if (x.champ) { // a champion goes in once the title is won, not at the end of the season
    const id = x.champ; const t = teamOf(x.s, id);
    years.push({ year: x.s.year, key: id, team: t?.name || '', color: t?.color, career: !isHist(x.s) });
  }
  const known = allKnownDrivers(c, latestSeason());
  const byKey = {};
  for (const y of years) (byKey[y.key] ||= []).push(y);
  const champs = Object.entries(byKey).map(([key, ys]) => {
    const cb = D.CHAMP_BIO[key];
    const live = key === PLAYER || D.DRIVER_BIO[key] || (!cb && known[key]);
    let stats, nat;
    if (live) {
      const { tot, bio } = driverRecord(c, key, ctx);
      stats = tot; nat = key === PLAYER_ID ? c.profile.nationality : bio?.nat;
    } else { stats = cb; nat = cb.nat; }
    const name = key === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : cb?.name || known[key]?.name || key;
    // the champion's story, with what they did in this career written in (yours from your career, not your profile)
    const notes = champNotes(c, key, ctx);
    const about = key === PLAYER_ID ? (notes || c.profile.bio || 'Crowned world champion in your career.') : [cb?.about || D.DRIVER_BIO[key]?.note || '', notes ? (cb?.about ? `In this career: ${notes}` : notes) : ''].filter(Boolean).join(' ') || 'World champion in your career.';
    const last = ys[ys.length - 1];
    return { key, name, nat, years: ys, titles: ys.length, stats, about, life: cb?.life || (D.DRIVER_BIO[key]?.born ? 'b. ' + D.DRIVER_BIO[key].born.slice(0, 4) : ''), color: last.color || D.TITLE_TEAM_COLORS[last.team] || '#5E6A82', active: key === PLAYER || gridIds(latestSeason()).includes(key), career: ys.some(y => y.career) };
  });
  return { years: years.sort((a, b) => b.year - a.year), champs, byKey };
}

function renderHof() {
  const c = career();
  const { years, champs } = hallOfFame(c);
  const sort = ui.hof.sort;
  champs.sort(sort === 'first' ? (a, b) => a.years[0].year - b.years[0].year : (a, b) => b.titles - a.titles || a.years[0].year - b.years[0].year);
  const nameOf = (key) => champs.find(x => x.key === key)?.name || key;
  const nations = {};
  for (const y of years) { const n = champs.find(x => x.key === y.key)?.nat || '—'; nations[n] = (nations[n] || 0) + 1; }
  const topNation = Object.entries(nations).sort((a, b) => b[1] - a[1])[0];
  const mine = champs.find(x => x.key === PLAYER);
  const view = ui.hof.view;
  return `<div class="page">
    <div class="page-head"><div><h1>Hall of Fame</h1><div class="sub">Every Formula One World Drivers' Champion since 1950. Champions crowned in your career join them when a season is fully logged.</div></div>
      <div class="row">${view === 'champions' ? `<div class="seg">${[['titles', 'Most titles'], ['first', 'Chronological']].map(([v, l]) => `<button data-act="hof-sort" data-v="${v}" class="${sort === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="seg">${[['champions', 'Champions'], ['years', 'Year by year']].map(([v, l]) => `<button data-act="hof-view" data-v="${v}" class="${view === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="tiles">
      <div class="tile"><span class="label">Champions</span><span class="v">${champs.length}</span></div>
      <div class="tile"><span class="label">Seasons</span><span class="v">${years.length}</span></div>
      <div class="tile"><span class="label">Most titles</span><span class="v" style="font-size:20px">${esc(champs.slice().sort((a, b) => b.titles - a.titles)[0]?.name || '')}</span></div>
      <div class="tile"><span class="label">Most titles by nation</span><span class="v" style="font-size:20px">${esc(topNation?.[0] || '')}<small> ${topNation?.[1] || ''}</small></span></div>
      <div class="tile"><span class="label">Latest champion</span><span class="v" style="font-size:20px">${esc(nameOf(years[0]?.key))}<small> ${years[0]?.year || ''}</small></span></div>
      <div class="tile"><span class="label">Your titles</span><span class="v">${mine ? mine.titles : 0}</span></div>
    </div>
    ${view === 'years' ? `<div class="panel"><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Champion</th><th>Nationality</th><th>Team</th><th class="num">Title no.</th></tr></thead>
      <tbody>${years.map(y => {
        const ch = champs.find(x => x.key === y.key);
        const n = ch.years.slice().sort((a, b) => a.year - b.year).findIndex(z => z.year === y.year) + 1;
        return `<tr class="${y.key === PLAYER ? 'me' : ''}"><td><b>${y.year}</b>${y.career ? ' <span class="tag done">Career</span>' : ''}</td><td><b>${esc(ch.name)}</b></td><td class="muted">${esc(ch.nat || '')}</td>
          <td><div class="drv"><span class="chip" style="--c:${y.color || D.TITLE_TEAM_COLORS[y.team] || '#5E6A82'}"></span>${esc(y.team)}</div></td><td class="num">${n}</td></tr>`;
      }).join('')}</tbody></table></div></div>`
    : `<div class="hof-grid">${champs.map(ch => `<article class="hof-card ${ch.key === PLAYER ? 'is-me' : ''}" style="--c:${ch.color}">
        <div class="hof-top"><div style="min-width:0"><div class="hof-name">${esc(ch.name)}</div><div class="muted" style="font-size:12px">${[esc(ch.nat || ''), esc(ch.life || ''), ch.active ? '<span class="tag">Active</span>' : ''].filter(Boolean).join(' · ')}</div></div>
          <div class="hof-titles"><b>${ch.titles}</b><span class="label">title${ch.titles > 1 ? 's' : ''}</span></div></div>
        <div class="hof-years">${ch.years.map(y => `<span class="yr ${y.career ? 'career' : ''}" title="${esc(y.team)}">${y.year}</span>`).join('')}</div>
        <div class="hof-stats">${[['Starts', ch.stats.starts], ['Wins', ch.stats.wins], ['Poles', ch.stats.poles], ['Podiums', ch.stats.podiums]].map(([l, v]) => `<div><span class="label">${l}</span><b>${v ?? '–'}</b></div>`).join('')}</div>
        <p class="hof-about">${esc(ch.about)}</p>
      </article>`).join('')}</div>`}
  </div>`;
}
