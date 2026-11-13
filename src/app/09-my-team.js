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
      <div class="panel"><div class="empty" style="padding:40px 16px">This save is a Driver Career with ${esc(t?.name || 'a works team')}. My Team runs as its own career, where you start your own team (the 11th, or the 12th from 2026) and drive for it or run it.<button class="btn primary" data-act="new-career-myteam">Start a My Team career</button></div></div></div>`;
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

/** The season at a glance for a My Team dashboard, as the Driver Career dashboard has it: both championships as bars
 *  side by side (your drivers always on), goals and the title fights, the latest from the paddock and the graphics. */
function mtSeasonPanels(c, m, s) {
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st); const done = roundsDone(s);
  const mine = new Set(s.teams.find(t => t.id === MYTEAM)?.drivers.filter(Boolean) || []);
  const top = ds.slice(0, 10); for (const id of mine) { const r = ds.find(x => x.id === id); if (r && !top.includes(r)) top.push(r); }
  const prevD = done > 1 ? driverStandings(s, seasonStats(s, done - 1)) : null;
  const lastArticle = [...c.media].reverse().find(x => x.article && x.seasonIdx === s.index);
  const G = latestGraphics(c, s, 5);
  return `<div class="dash-row two">
      <div class="panel"><div class="panel-h"><h2>Drivers' standings</h2><button class="btn sm ghost" data-act="nav" data-view="standings">All</button></div><div class="panel-b">${standingsBars(c, s, top, false, prevD)}</div></div>
      <div class="panel"><div class="panel-h"><h2>Constructors' standings</h2><button class="btn sm ghost" data-act="nav" data-view="standings">All</button></div><div class="panel-b">${standingsBars(c, s, cs, true, null)}</div></div>
    </div>
    <div class="dash-row two">${goalsPanel(c, s)}${rivalryPanel(c, s)}</div>
    <div class="dash-row two">
      ${lastArticle ? `<div class="panel"><div class="panel-h"><h2>Latest from the paddock</h2><button class="btn sm ghost" data-act="nav" data-view="media">Media</button></div><div class="article"><span class="outlet">${esc(lastArticle.article.outlet)}</span><div class="headline">${esc(lastArticle.article.headline)}</div>${lastArticle.article.summary ? `<p>${esc(lastArticle.article.summary)}</p>` : ''}</div></div>` : ''}
      <div class="panel"><div class="panel-h"><h2>Latest graphics</h2><button class="btn sm ghost" data-act="nav" data-view="stories">Stories</button></div>${G.length ? `<div class="panel-b dash-gfx">${G.map(gfxSlot).join('')}</div>` : '<div class="empty">The graphics made in Stories show up here as your season goes.</div>'}</div>
    </div>`;
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

/* ---------------------------------------------------------- car development */
/*
  Car development, as F1 25's My Team runs it: the four areas the game rates (copied across whenever you like, each
  update kept so the season becomes a line), parts researched with research points and then built for one car or
  both, the three facilities, and the power unit and gearbox wear the game reports during sessions.
*/
const MT_AREA_COL = { aero: '#4FA3FF', chassis: '#F5C518', powertrain: '#E10600', durability: '#2FD07A' };
const mtRounds = (s) => activeRounds(s);
/** "After R4", or "Pre-season" before any round has run. */
const mtWhen = (s, ri) => ri == null || ri < 0 ? 'Pre-season' : `After R${ri + 1} ${mtRounds(s)[ri]?.name || ''}`.trim();
/** The rating updates of a season, in order: [{ ri, aero, chassis, powertrain, durability }] (the season's set if none were logged). */
function mtRatingLog(m, s) {
  const log = (m.ratingLog || []).filter(x => x.si === s.index).sort((a, b) => (a.ri ?? -1) - (b.ri ?? -1));
  if (log.length) return log;
  const r = m.ratings?.[s.index]; return r && Object.keys(r).length ? [{ ri: -1, ...r }] : [];
}
function mtWearCol(v) { return v >= 70 ? 'var(--red)' : v >= 50 ? 'var(--yellow)' : 'var(--green)'; }
function renderMtDev(c, m, s) {
  const r = m.ratings[s.index] || {}; const log = mtRatingLog(m, s); const first = log[0] || {};
  const prevSeason = m.ratings[s.index - 1] || null;
  const P = (() => { try { return paceTable(s, 'race').rows.findIndex(o => o.team.id === MYTEAM) + 1; } catch { return 0; } })();
  const cards = D.DEPARTMENTS.map(d => {
    const v = r[d.id]; const base = log.length > 1 ? first[d.id] : prevSeason?.[d.id]; const delta = v != null && base != null ? v - base : null;
    const sub = d.id === 'powertrain' ? `${esc(m.engine)} engine` : delta ? `<span class="${delta > 0 ? 'pos-money' : 'neg'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span> ${log.length > 1 ? (first.ri < 0 ? 'since the season began' : `since ${esc(mtWhen(s, first.ri).replace('After ', ''))}`) : 'on last season'}` : '<span class="muted">No change logged yet</span>';
    return `<div class="mt-area" style="--c:${MT_AREA_COL[d.id]}"><span class="k">${d.name}</span><span class="v">${v ?? '–'}</span><span class="d">${sub}</span><div class="bar-track"><div class="bar-fill" style="width:${v || 0}%;background:${MT_AREA_COL[d.id]}"></div></div></div>`;
  }).join('');
  // the ratings as a line through the season, with the parts fitted marked on it
  const chart = (() => {
    if (log.length < 2) return `<div class="empty">Update the ratings now and then (after a part is fitted, say) and they make a line here.</div>`;
    const W = 520, H = 210, L = 36, R = 14, T = 14, B = 26; const vals = log.flatMap(x => D.DEPARTMENTS.map(d => x[d.id]).filter(v => v != null));
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 3) / 10) * 10), hi = Math.min(100, Math.ceil((Math.max(...vals) + 3) / 10) * 10);
    const n = mtRounds(s).length; const X = (ri) => L + ((ri ?? -1) + 1) / Math.max(1, n) * (W - L - R); const Y = (v) => T + (hi - v) / Math.max(1, hi - lo) * (H - T - B);
    let o = ''; for (let v = lo; v <= hi; v += 10) o += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#263149"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="11" fill="#8B97AF" text-anchor="end">${v}</text>`;
    for (let ri = 0; ri < n; ri += Math.max(1, Math.round(n / 6))) o += `<text x="${X(ri)}" y="${H - 8}" font-size="11" fill="#8B97AF" text-anchor="middle">R${ri + 1}</text>`;
    for (const p of (m.projects || []).filter(p => p.status === 'fitted' && p.fsi === s.index && p.fri != null)) o += `<line x1="${X(p.fri)}" x2="${X(p.fri)}" y1="${T}" y2="${H - B}" stroke="${MT_AREA_COL[p.area] || '#8B97AF'}" stroke-dasharray="3 3" opacity=".7"><title>${esc(p.name)}</title></line>`;
    for (const d of D.DEPARTMENTS) { const pts = log.filter(x => x[d.id] != null).map(x => `${X(x.ri).toFixed(1)},${Y(x[d.id]).toFixed(1)}`); if (pts.length) o += `<polyline fill="none" stroke="${MT_AREA_COL[d.id]}" stroke-width="3" stroke-linejoin="round" points="${pts.join(' ')}"/>`; }
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${o}</svg><div class="mt-legend">${D.DEPARTMENTS.map(d => `<span><i style="background:${MT_AREA_COL[d.id]}"></i>${d.name}</span>`).join('')}<span>┆ a part fitted</span></div>`;
  })();
  const ratingsForm = ui.mtRate ? `<div class="panel-b stack" style="border-top:1px solid var(--line)"><div class="form-grid">${D.DEPARTMENTS.map(d => `<label class="field"><span>${d.name}</span><input type="number" min="0" max="100" id="rt-${d.id}" value="${r[d.id] ?? ''}" placeholder="0–100"></label>`).join('')}</div>
      <div class="row" style="gap:8px"><button class="btn primary" data-act="mt-ratings-save">Save · ${esc(mtWhen(s, roundsDone(s) - 1))}</button><button class="btn ghost" data-act="mt-rate-toggle">Cancel</button><span class="muted" style="font-size:12px">From the car performance screen in the game.</span></div></div>` : '';
  // power unit and gearbox wear, as the game reported it at the last session
  const ids = (s.teams.find(t => t.id === MYTEAM)?.drivers || []).filter(Boolean);
  const PU = [['ice', 'Engine (ICE)'], ['tc', 'Turbocharger'], ['mguh', 'MGU-H'], ['mguk', 'MGU-K'], ['es', 'Energy store'], ['ce', 'Control electronics'], ['gb', 'Gearbox']];
  const withPu = ids.filter(id => m.pu?.[id]);
  const puPanel = `<div class="panel"><div class="panel-h"><h2>Power unit &amp; gearbox <span class="mt-auto">auto</span></h2><span class="muted" style="font-size:12px">${withPu.length ? `As the game reported it, ${esc(mtWhen(c.seasons[m.pu[withPu[0]].si] || s, m.pu[withPu[0]].ri))}` : 'Read from the game during sessions'}</span></div><div class="panel-b">
      ${withPu.length ? `<div class="mt-pu">${withPu.map(id => `<div class="stack" style="gap:6px"><b>${esc(dName(s, id))}</b>${PU.map(([k, l]) => { const v = m.pu[id][k] ?? 0; return `<div class="mt-wear"><span>${l}</span><div class="bar-track"><div class="bar-fill" style="width:${v}%;background:${mtWearCol(v)}"></div></div><span class="num">${v}%</span></div>`; }).join('')}</div>`).join('')}</div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">From 70% a part is close to the end of its life. Each can only be fitted so many times before replacements cost extra.</p>`
      : '<div class="empty">Drive a session with telemetry on and the wear of both cars’ engine parts and gearboxes shows up here.</div>'}
    </div></div>`;
  // research and build
  const P2 = m.projects || []; const legacy = (m.upgrades || []).map(u => ({ id: u.id, legacy: true, name: u.part, area: u.dept, status: 'fitted', fsi: u.seasonIdx, fri: mtRounds(c.seasons[u.seasonIdx] || s).findIndex(x => x.id === u.roundId), cost: u.cost, notes: u.notes }));
  const col = (st) => [...P2, ...legacy].filter(p => p.status === st);
  const areaName = (a) => D.DEPARTMENTS.find(d => d.id === a)?.name || a;
  const chips = (p) => (p.drivers || []).map((id, k) => `<span class="mt-chip ${k ? 'c2' : 'c1'}">${esc(lastName(dName(s, id) || anyName(id)))}</span>`).join('');
  const card = (p) => {
    const c0 = MT_AREA_COL[p.area] || '#8B97AF'; const ps = c.seasons[p.si ?? p.fsi] || s;
    if (p.status === 'research') return `<div class="mt-card" style="--c:${c0}"><div class="row" style="justify-content:space-between"><b>${esc(p.name)}</b><button class="icon-btn sm" data-act="mt-del" data-list="projects" data-id="${p.id}" title="Remove">${ICON.x}</button></div>
      <span class="meta"><span>${areaName(p.area)}</span>${p.rp ? `<span>${Number(p.rp).toLocaleString()} RP</span>` : ''}${p.dueRi != null ? `<span class="${p.delayed ? 'neg' : ''}">${p.delayed ? 'Delayed: was due' : 'Due'} before ${esc(mtRounds(ps)[p.dueRi]?.name || 'the next round')}</span>` : ''}</span>
      <div class="row" style="gap:6px"><button class="btn sm" data-act="mt-proj-done" data-id="${p.id}">Research done</button><button class="btn sm ghost" data-act="mt-proj-delay" data-id="${p.id}">${p.delayed ? 'Back on time' : 'Delayed'}</button></div></div>`;
    if (p.status === 'ready') return `<div class="mt-card" style="--c:${c0}"><div class="row" style="justify-content:space-between"><b>${esc(p.name)}</b><button class="icon-btn sm" data-act="mt-del" data-list="projects" data-id="${p.id}" title="Remove">${ICON.x}</button></div>
      <span class="meta"><span>${areaName(p.area)}</span><span>Researched ${esc(mtWhen(ps, p.readyRi).replace('After ', 'after ').replace('Pre-season', 'before the season'))}</span></span>
      <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))"><label class="field"><span>Build</span><select id="pb-cars-${p.id}"><option value="2">Both cars</option>${ids.map(id => `<option value="${id}">${esc(lastName(dName(s, id)))}'s car</option>`).join('')}</select></label><label class="field"><span>Cost ($M)</span><input type="number" min="0" step="0.1" id="pb-cost-${p.id}" placeholder="1.0"></label><label class="field"><span>Rating gain</span><input type="number" step="1" id="pb-gain-${p.id}" placeholder="+3"></label></div>
      <button class="btn sm primary" data-act="mt-proj-build" data-id="${p.id}">Build and fit</button></div>`;
    return `<div class="mt-card" style="--c:${c0}"><div class="row" style="justify-content:space-between"><b>${esc(p.name)}</b><button class="icon-btn sm" data-act="mt-del" data-list="${p.legacy ? 'upgrades' : 'projects'}" data-id="${p.id}" title="Remove">${ICON.x}</button></div>
      <span class="meta"><span>${areaName(p.area)}${p.gain ? ` · ${p.gain > 0 ? '+' : ''}${p.gain}` : ''}</span><span>${p.fri == null || p.fri < 0 ? 'Fitted before the season' : `Fitted after R${p.fri + 1}`}</span>${p.notes ? `<span>${esc(p.notes)}</span>` : ''}</span>
      <div class="row" style="gap:6px">${chips(p)}${p.cost ? `<span class="muted" style="font-size:12px">${p.drivers?.length === 1 ? 'one car · ' : ''}${fmtM(p.cost)}</span>` : ''}</div></div>`;
  };
  const researchForm = ui.mtNewProj ? `<div class="panel-b stack" style="border-top:1px solid var(--line)"><div class="form-grid">
      <label class="field"><span>Part</span><input type="text" id="pj-name" placeholder="Floor, spec C"></label>
      <label class="field"><span>Area</span><select id="pj-area">${D.DEPARTMENTS.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></label>
      <label class="field"><span>Research points</span><input type="number" min="0" id="pj-rp" placeholder="1450"></label>
      <label class="field"><span>Due before</span><select id="pj-due"><option value="">Not known</option>${mtRounds(s).map((x, i) => i >= roundsDone(s) ? `<option value="${i}">R${i + 1} · ${esc(x.name)}</option>` : '').join('')}</select></label></div>
      <div class="row" style="gap:8px"><button class="btn primary" data-act="mt-proj-add">Start research</button><button class="btn ghost" data-act="mt-proj-toggle">Cancel</button></div></div>` : '';
  // the facilities
  const F = m.facilities || {}; const fac = [['engineering', 'Engineering', 'Earns the research points: more staff, more points, higher running costs'], ['personnel', 'Personnel', 'Staff, training and morale'], ['corporate', 'Corporate', 'Sponsors, the budget and the livery']];
  const facPanel = `<div class="panel"><div class="panel-h"><h2>Facilities <span class="mt-entered">entered</span></h2><button class="btn sm ghost" data-act="mt-fac-toggle">${ui.mtFac ? 'Done' : 'Edit'}</button></div><div class="panel-b"><div class="mt-g3">${fac.map(([k, n, about]) => { const f = F[k] || {}; const pct = f.max ? Math.min(100, (f.staff || 0) / f.max * 100) : 0;
      return ui.mtFac ? `<div class="stack" style="gap:6px"><b>${n}</b><div class="form-grid" style="grid-template-columns:repeat(2,1fr)"><label class="field"><span>Level</span><input type="number" min="0" max="10" value="${f.level ?? ''}" data-ch="mt-fac" data-f="${k}" data-k="level"></label><label class="field"><span>Staff</span><input type="number" min="0" value="${f.staff ?? ''}" data-ch="mt-fac" data-f="${k}" data-k="staff"></label><label class="field"><span>Most staff</span><input type="number" min="0" value="${f.max ?? ''}" data-ch="mt-fac" data-f="${k}" data-k="max"></label>${k === 'engineering' ? `<label class="field"><span>RP a week</span><input type="number" min="0" value="${f.rp ?? ''}" data-ch="mt-fac" data-f="${k}" data-k="rp"></label>` : `<label class="field"><span>Note</span><input type="text" value="${esc(f.note || '')}" data-ch="mt-fac" data-f="${k}" data-k="note" placeholder="Upgrade done after Imola"></label>`}</div></div>`
        : `<div class="stack" style="gap:6px"><div class="row" style="justify-content:space-between"><b>${n}</b><span class="muted">${f.level != null ? `Level ${f.level}` : '–'}</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="muted" style="font-size:12px">${f.staff != null ? `${f.staff}${f.max ? ` of ${f.max}` : ''} staff` : about}${k === 'engineering' && f.rp ? ` · ${f.rp} research points a week` : ''}${f.note ? ` · ${esc(f.note)}` : ''}</span></div>`; }).join('')}</div></div></div>`;
  return `<div class="mt-g4">${cards}</div>
    ${P ? `<p class="muted" style="font-size:12px;margin:-4px 0 0">On race pace so far, ${esc(m.name)} is the ${ordWord(P)}-quickest team (from your results).</p>` : ''}
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Ratings through the season <span class="mt-entered">entered</span></h2><button class="btn sm primary" data-act="mt-rate-toggle">Update ratings</button></div><div class="panel-b">${chart}</div>${ratingsForm}</div>
      ${puPanel}
    </div>
    <div class="panel"><div class="panel-h"><h2>Research &amp; build <span class="mt-entered">entered</span></h2><button class="btn sm primary" data-act="mt-proj-toggle">+ Start research</button></div>${researchForm}<div class="panel-b">
      <div class="mt-kan">${[['research', 'Researching'], ['ready', 'Ready to build'], ['fitted', 'Fitted']].map(([st, l]) => { const L0 = col(st); return `<div class="mt-kcol"><h3>${l} <span class="muted">${L0.length}</span></h3>${L0.length ? L0.slice().reverse().map(card).join('') : '<span class="muted" style="font-size:12px">Nothing here yet.</span>'}</div>`; }).join('')}</div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Building a part goes into Finances by itself, under parts. A part fitted to one car shows which driver has it, as in the game.</p>
    </div></div>
    ${facPanel}`;
}

/* ---------------------------------------------------------------- finances */
/*
  The money: every entry you log, plus the ones Pitwall works out (each active sponsor's weekly income for every race
  week, its signing bonus when it signed, and the engine contract at the start of each season), the balance through
  the season, where it comes from and goes, and the cost cap (driver salaries don't count towards it, as in F1).
*/
const MT_CAP = 135;
/** Every money movement of the team, oldest first: [{ seasonIdx, roundId, cat, note, amount, auto, id? }]. */
function mtLedger(c, m) {
  const out = []; const played = playedSeasons(c);
  for (const se of played) {
    const rs = activeRounds(se); const done = roundsDone(se);
    if (m.engineCost) out.push({ seasonIdx: se.index, roundId: '', cat: 'Engine', note: `${m.engine} engine contract`, amount: -m.engineCost, auto: true, k: -1 });
    for (const x of m.sponsors || []) {
      if (!x.weekly && !x.bonus) continue; if (se.index < x.seasonIdx) continue; if (x.until && se.year > x.until) continue;
      const from = se.index === x.seasonIdx ? Math.max(0, rs.findIndex(r => r.id === x.roundId) + 1) : 0;
      const to = x.status === 'Ended' && x.endSi === se.index ? Math.min(done, (x.endRi ?? done - 1) + 1) : x.status === 'Ended' && x.endSi != null && x.endSi < se.index ? 0 : done;
      if (x.bonus && se.index === x.seasonIdx) out.push({ seasonIdx: se.index, roundId: x.roundId || '', cat: 'Sponsorship', note: `${x.name}, signing bonus`, amount: +x.bonus, auto: true, k: from - 1 });
      if (x.weekly) for (let ri = from; ri < to; ri++) out.push({ seasonIdx: se.index, roundId: rs[ri].id, cat: 'Sponsorship', note: `${x.name}, weekly`, amount: +x.weekly, auto: true, k: ri });
    }
  }
  for (const e of m.ledger || []) { const se = c.seasons[e.seasonIdx]; out.push({ ...e, k: se ? activeRounds(se).findIndex(r => r.id === e.roundId) : -1 }); }
  return out.sort((a, b) => a.seasonIdx - b.seasonIdx || a.k - b.k);
}
function ledgerTotals(m, seasonIdx = null) {
  let income = 0, expense = 0; const c = career();
  for (const e of c ? mtLedger(c, m) : m.ledger) { if (seasonIdx != null && e.seasonIdx !== seasonIdx) continue; if (e.amount >= 0) income += e.amount; else expense -= e.amount; }
  return { income, expense, net: income - expense };
}
function renderMtFinance(c, m, s, balance) {
  const all = mtLedger(c, m); const season = all.filter(e => e.seasonIdx === s.index);
  const tot = ledgerTotals(m, s.index); const rs = activeRounds(s); const done = roundsDone(s);
  const weekly = (m.sponsors || []).filter(x => x.status === 'Active' && (!x.until || x.until >= s.year)).reduce((a, x) => a + (+x.weekly || 0), 0);
  const cap = m.cap ?? MT_CAP; const capUsed = season.filter(e => e.amount < 0 && e.cat !== 'Driver salary').reduce((a, e) => a - e.amount, 0);
  const proj = done ? capUsed / done * rs.length : capUsed;
  // the balance through the season: where it stood going in, then after each round
  const before = m.budget + all.filter(e => e.seasonIdx < s.index).reduce((a, e) => a + e.amount, 0);
  const per = rs.map((r, i) => ({ inc: season.filter(e => e.k === i && e.amount > 0).reduce((a, e) => a + e.amount, 0), out: season.filter(e => e.k === i && e.amount < 0).reduce((a, e) => a - e.amount, 0) }));
  const start = before + season.filter(e => e.k < 0).reduce((a, e) => a + e.amount, 0);
  let run = start; const bal = per.map(p => (run += p.inc - p.out));
  const chart = (() => {
    const W = 520, H = 220, L = 52, R = 12, T = 14, B = 28; const n = Math.max(1, done);
    const vals = [start, ...bal.slice(0, done)]; const maxBar = Math.max(1, ...per.slice(0, done).flatMap(p => [p.inc, p.out]));
    const pad = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.4); const lo = Math.min(...vals) - pad, hi = Math.max(...vals) + pad; const Y = (v) => T + (hi - v) / (hi - lo || 1) * (H - T - B); const X = (i) => L + (i + 0.5) / Math.max(n, 1) * (W - L - R);
    let o = ''; for (const v of [lo, (lo + hi) / 2, hi]) o += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#263149"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="11" fill="#8B97AF" text-anchor="end">${fmtM(Math.round(v * 10) / 10)}</text>`;
    const bh = (v) => v / maxBar * (H - T - B) * 0.35; const bw = Math.max(3, Math.min(10, (W - L - R) / n / 3));
    for (let i = 0; i < done; i++) { o += `<rect x="${X(i) - bw - 1}" y="${H - B - bh(per[i].inc)}" width="${bw}" height="${bh(per[i].inc)}" fill="#2FD07A" opacity=".8"/><rect x="${X(i) + 1}" y="${H - B - bh(per[i].out)}" width="${bw}" height="${bh(per[i].out)}" fill="#F0535A" opacity=".8"/>`; if (n <= 12 || i % 2 === 0) o += `<text x="${X(i)}" y="${H - 9}" font-size="11" fill="#8B97AF" text-anchor="middle">R${i + 1}</text>`; }
    o += `<polyline fill="none" stroke="#E7ECF5" stroke-width="3" stroke-linejoin="round" points="${[`${L},${Y(start)}`, ...bal.slice(0, done).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)].join(' ')}"/>`;
    return done ? `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${o}</svg><div class="mt-legend"><span><i style="background:#E7ECF5"></i>Balance</span><span><i style="background:#2FD07A"></i>Income</span><span><i style="background:#F0535A"></i>Spending</span></div>` : '<div class="empty">The balance shows here round by round as the season goes.</div>';
  })();
  const cats = (sign) => { const by = {}; for (const e of season) if (Math.sign(e.amount) === sign) by[e.cat] = (by[e.cat] || 0) + Math.abs(e.amount); return Object.entries(by).sort((a, b) => b[1] - a[1]); };
  const inc = cats(1), out = cats(-1); const big = Math.max(1, ...inc.map(x => x[1]), ...out.map(x => x[1]));
  const bars = (L0, col) => L0.length ? L0.map(([k, v]) => `<div class="mt-wear"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${v / big * 100}%;background:${col}"></div></div><span class="num">${fmtM(Math.round(v * 100) / 100)}</span></div>`).join('') : '<span class="muted" style="font-size:12px">Nothing yet.</span>';
  const rows = (() => { let r0 = m.budget; return all.map(e => ({ ...e, after: (r0 += e.amount) })).reverse(); })();
  return `<div class="tiles">
      <div class="tile"><span class="label">Balance</span><span class="v" style="font-size:26px;color:${balance < 0 ? 'var(--red)' : 'inherit'}">${fmtM(Math.round(balance * 100) / 100)}</span></div>
      <div class="tile"><span class="label">Cost cap used</span><span class="v" style="font-size:26px;color:${capUsed > cap ? 'var(--red)' : 'inherit'}">${fmtM(Math.round(capUsed * 10) / 10)}<small> / ${fmtM(cap)}</small></span></div>
      <div class="tile"><span class="label">Income a week</span><span class="v pos-money" style="font-size:26px">+${fmtM(weekly)}</span></div>
      <div class="tile"><span class="label">${s.year} income</span><span class="v pos-money" style="font-size:26px">${fmtM(Math.round(tot.income * 100) / 100)}</span></div>
      <div class="tile"><span class="label">${s.year} spending</span><span class="v neg" style="font-size:26px">${fmtM(Math.round(tot.expense * 100) / 100)}</span></div>
      <div class="tile"><span class="label">Engine</span><span class="v" style="font-size:20px">${esc(m.engine)}${m.engineCost ? ` · ${fmtM(m.engineCost)}` : ''}</span></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Balance through the season</h2><span class="muted" style="font-size:12px">bars: income and spending each round</span></div><div class="panel-b">${chart}</div></div>
      <div class="panel"><div class="panel-h"><h2>Where it comes from, where it goes</h2><span class="muted" style="font-size:12px">${s.year}</span></div><div class="panel-b stack"><span class="label">Income</span>${bars(inc, '#2FD07A')}<span class="label" style="margin-top:6px">Spending</span>${bars(out, '#F0535A')}</div></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Cost cap</h2><span class="muted" style="font-size:12px">What counts towards it this season (driver salaries don't, as in F1)</span></div><div class="panel-b stack">
      <div class="bar-track" style="height:16px"><div class="bar-fill" style="width:${Math.min(100, capUsed / cap * 100)}%;background:${proj > cap ? 'var(--red)' : 'var(--yellow)'}"></div></div>
      <div class="row" style="justify-content:space-between;font-size:13px;flex-wrap:wrap;gap:6px"><span>${fmtM(Math.round(capUsed * 10) / 10)} spent of ${fmtM(cap)}${done ? ` after ${done} of ${rs.length} rounds` : ''}</span>${done ? `<span class="muted">At this rate: ${fmtM(Math.round(proj))} by ${esc(rs[rs.length - 1]?.name || 'the end')}, <span class="${proj > cap ? 'neg' : 'pos-money'}">${fmtM(Math.abs(Math.round(cap - proj)))} ${proj > cap ? 'over' : 'under'}</span></span>` : ''}</div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Add an entry</h2><div class="row muted" style="gap:10px;flex-wrap:wrap;font-size:12px"><label class="row" style="gap:6px">Starting budget ($M) <input type="number" step="0.1" style="width:90px" value="${m.budget}" data-ch="mt-budget"></label><label class="row" style="gap:6px">Engine a season ($M) <input type="number" step="0.1" style="width:80px" value="${m.engineCost ?? ''}" data-ch="mt-fin" data-k="engineCost" placeholder="2.8"></label><label class="row" style="gap:6px">Cost cap ($M) <input type="number" step="1" style="width:80px" value="${m.cap ?? ''}" data-ch="mt-fin" data-k="cap" placeholder="${MT_CAP}"></label></div></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>When</span>${roundSelect(s, 'lg-round')}</label>
        <label class="field"><span>Type</span><select id="lg-type"><option value="in">Income</option><option value="out">Expense</option></select></label>
        <label class="field"><span>Category</span><select id="lg-cat">${D.LEDGER_CATS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Amount ($M)</span><input type="number" id="lg-amt" min="0" step="0.01" placeholder="2.5"></label>
      </div>
      <label class="field"><span>Note</span><input type="text" id="lg-note" placeholder="Prize money for P6 in the constructors"></label>
      <div><button class="btn primary" data-act="mt-add-ledger">Add entry</button></div>
      <p class="muted" style="font-size:12px;margin:0">Sponsors' weekly income and signing bonuses, part builds and the engine contract go in by themselves.</p>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Ledger</h2></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>When</th><th>Category</th><th>Note</th><th class="num">Amount</th><th class="num">Balance</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.slice(0, 120).map(e => `<tr><td class="muted">${esc(roundLabel(c, e.seasonIdx, e.roundId))}</td><td>${esc(e.cat)}${e.auto ? ' <span class="mt-auto">auto</span>' : ''}</td><td class="muted">${esc(e.note || '')}</td><td class="num ${e.amount < 0 ? 'neg' : 'pos-money'}"><b>${e.amount > 0 ? '+' : ''}${fmtM(Math.round(e.amount * 100) / 100)}</b></td><td class="num">${fmtM(Math.round(e.after * 100) / 100)}</td><td>${e.id && !(e.auto && !e.removable) ? `<button class="icon-btn" title="Remove" data-act="mt-del" data-list="ledger" data-id="${e.id}">${ICON.x}</button>` : ''}</td></tr>`).join('')
        : '<tr><td colspan="6"><div class="empty">No entries yet. Sign a sponsor, build a part, or log prize money and spending as the season goes.</div></td></tr>'}</tbody>
    </table></div></div>`;
}

/* ---------------------------------------------------------------- sponsors */
/*
  Sponsors as F1 25 offers them: a signing bonus, weekly income, a contract to a season, a core value and a seasonal
  goal, and loyalty that grows as goals are met. A goal Pitwall can measure (points, podiums, wins, the constructors'
  position, finishing ahead of a team) is tracked from your results; any other is ticked off by hand.
*/
const MT_TRACKABLE = ['team_points', 'team_podiums', 'team_wins', 'constructor_pos', 'beat_team'];
const MT_CORE = ['Performance', 'Fan engagement', 'Rivalry', 'Innovation', 'Consistency', 'Sustainability'];
/** A sponsor's seasonal goal, now: { text, pct, ok, tracked }. */
function mtGoal(s, x) {
  const g = x.goal; if (!g) return null;
  if (g.type && g.type !== 'custom') { const gt = D.GOAL_TYPES.find(t => t.id === g.type); const e = evalGoal({ type: g.type, target: g.target, team: g.team }, s);
    const label = g.type === 'beat_team' ? `Finish ahead of ${(s.teams.find(t => t.id === g.team) || {}).name || 'them'}` : `${gt?.label || g.type}${gt?.needsTarget ? ` ${g.target}` : ''}`; return { label, text: e.text, pct: e.pct, ok: e.ok, tracked: true }; }
  const n = +g.count || 0, t = +g.target || 0; return { label: g.text || 'Seasonal goal', text: t ? `${n} / ${t}` : (g.done ? 'Done' : 'Not yet'), pct: t ? n / t * 100 : g.done ? 100 : 0, ok: t ? n >= t : !!g.done, tracked: false };
}
function mtLoyal(x, click = true) { const n = +x.loyalty || 0; return `<span class="mt-loyal">${[1, 2, 3, 4, 5].map(k => click ? `<button class="${k <= n ? 'on' : ''}" data-act="mt-sp-loyal" data-id="${x.id}" data-v="${k === n ? k - 1 : k}" title="Loyalty ${k}"></button>` : `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`; }
function mtSponsorTerms(x) { return [x.weekly ? `${fmtM(+x.weekly)} a week` : x.value ? `${fmtM(+x.value)} a season` : '', x.bonus ? `signed for ${fmtM(+x.bonus)}` : '', x.until ? `to the end of ${x.until}` : ''].filter(Boolean).join(' · '); }
function mtGoalHtml(s, x) {
  const G = mtGoal(s, x); if (!G) return x.goalText ? `<span class="muted" style="font-size:12px">${esc(x.goalText)}</span>` : '';
  return `<div class="mt-goal"><div class="row" style="justify-content:space-between"><span>${esc(G.label)}${G.tracked ? ' <span class="mt-auto">tracked</span>' : ''}</span><span>${esc(G.text)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${G.pct}%;background:${G.ok ? 'var(--green)' : 'var(--yellow)'}"></div></div>
    ${!G.tracked && x.goal?.target ? `<div class="row" style="gap:6px"><button class="btn sm ghost" data-act="mt-sp-count" data-id="${x.id}" data-v="1">+1</button><button class="btn sm ghost" data-act="mt-sp-count" data-id="${x.id}" data-v="-1">−1</button></div>` : ''}</div>`;
}
function mtSponsorForm(s, kind) {
  const teams = s.teams.filter(t => t.id !== MYTEAM);
  return `<div class="panel-b stack" style="border-top:1px solid var(--line)"><div class="form-grid">
      <label class="field"><span>Sponsor</span><input type="text" id="sp-name" placeholder="Apex Energy"></label>
      <label class="field"><span>Slot</span><select id="sp-tier">${D.SPONSOR_TIERS.map(x => `<option ${x === 'Secondary' ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field"><span>Signing bonus ($M)</span><input type="number" id="sp-bonus" min="0" step="0.1" placeholder="1.0"></label>
      <label class="field"><span>A week ($M)</span><input type="number" id="sp-weekly" min="0" step="0.01" placeholder="0.08"></label>
      <label class="field"><span>Until the end of</span><input type="number" id="sp-until" min="${s.year}" max="${s.year + 10}" value="${s.year + 1}"></label>
      <label class="field"><span>Core value</span><input type="text" id="sp-core" list="dl-core" placeholder="Performance"><datalist id="dl-core">${MT_CORE.map(x => `<option value="${x}">`).join('')}</datalist></label>
      <label class="field"><span>Seasonal goal</span><select id="sp-gtype">${MT_TRACKABLE.map(id => `<option value="${id}">${esc(D.GOAL_TYPES.find(t => t.id === id)?.label || id)} (tracked)</option>`).join('')}<option value="custom">Something else: I'll tick it off</option></select></label>
      <label class="field"><span>Goal target</span><input type="number" id="sp-gtarget" min="0" placeholder="8"></label>
      <label class="field"><span>Team (finish ahead of)</span><select id="sp-gteam">${teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Goal, in words (for one you tick off)</span><input type="text" id="sp-gtext" placeholder="Hold 3 fan events"></label>
    </div><div class="row" style="gap:8px"><button class="btn primary" data-act="mt-sp-add" data-kind="${kind}">${kind === 'offer' ? 'Add the offer' : 'Sign the sponsor'}</button><button class="btn ghost" data-act="mt-sp-toggle" data-kind="${kind}">Cancel</button></div></div>`;
}
function renderMtSponsors(c, m, s) {
  const active = (m.sponsors || []).filter(x => x.status === 'Active');
  const title = active.find(x => x.tier === 'Title'); const others = (m.sponsors || []).filter(x => x !== title);
  const fans = m.fans?.[s.index] || {};
  const worth = (x) => (+x.bonus || 0) + (+x.weekly || 0) * activeRounds(s).length * Math.max(1, (+x.until || s.year) - s.year + 1);
  const card = (x) => `<div class="panel"><div class="panel-b stack">
      <div class="row" style="justify-content:space-between"><b>${esc(x.name)}</b><span class="row" style="gap:6px"><span class="mt-chip">${esc(x.tier)}</span><button class="icon-btn sm" data-act="mt-del" data-list="sponsors" data-id="${x.id}" title="Remove">${ICON.x}</button></span></div>
      <span class="muted" style="font-size:12px">${esc(mtSponsorTerms(x)) || 'No terms logged'}</span>
      ${x.core ? `<span style="font-size:13px">Core value: <b>${esc(x.core)}</b></span>` : ''}
      ${mtGoalHtml(s, x)}
      <div class="row" style="gap:8px;justify-content:space-between;flex-wrap:wrap">${mtLoyal(x)}<span class="row" style="gap:6px">${x.value && !x.weekly ? `<button class="btn sm ghost" data-act="mt-sponsor-pay" data-id="${x.id}" title="Add this season's payment to finances">Log payment</button>` : ''}<select data-ch="mt-sponsor-status" data-id="${x.id}" style="width:auto">${['Active', 'Objective met', 'Objective missed', 'Ended'].map(o => `<option ${x.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></span></div>
    </div></div>`;
  return `<div class="tiles">
      <div class="tile"><span class="label">Active sponsors</span><span class="v">${active.length}</span></div>
      <div class="tile"><span class="label">Income a week</span><span class="v pos-money" style="font-size:26px">+${fmtM(active.reduce((a, x) => a + (+x.weekly || 0), 0))}</span></div>
      <div class="tile"><span class="label">Goals met</span><span class="v">${active.filter(x => mtGoal(s, x)?.ok).length}<small> / ${active.filter(x => x.goal).length}</small></span></div>
    </div>
    ${title ? `<div class="mt-title"><div class="mt-logo">${esc(title.name.split(' ')[0].toUpperCase().slice(0, 8))}</div>
      <div class="stack" style="gap:6px;min-width:0"><span class="label" style="color:#F5C518">Title sponsor${title.until ? ` · to the end of ${title.until}` : ''}</span><b style="font:700 26px var(--font-display)">${esc(title.name)}</b>
        <div class="row" style="gap:14px;flex-wrap:wrap;font-size:13px">${title.weekly ? `<span>${fmtM(+title.weekly)} a week</span>` : title.value ? `<span>${fmtM(+title.value)} a season</span>` : ''}${title.bonus ? `<span>Signed for ${fmtM(+title.bonus)}</span>` : ''}${title.core ? `<span>Core value: <b>${esc(title.core)}</b></span>` : ''}</div>
        ${mtGoalHtml(s, title)}</div>
      <div class="stack" style="gap:6px;justify-items:end"><span class="label">Loyalty</span>${mtLoyal(title)}<button class="icon-btn sm" data-act="mt-del" data-list="sponsors" data-id="${title.id}" title="Remove">${ICON.x}</button></div></div>` : ''}
    <div class="panel"><div class="panel-h"><h2>${title ? 'More sponsors' : 'Sponsors'}</h2><button class="btn sm primary" data-act="mt-sp-toggle" data-kind="sponsor">+ Sign a sponsor</button></div>${ui.mtSp === 'sponsor' ? mtSponsorForm(s, 'sponsor') : ''}
      ${others.length ? `<div class="panel-b"><div class="mt-g3">${others.map(card).join('')}</div></div>` : `<div class="empty">${title ? 'No other sponsors yet.' : 'No sponsors signed yet. A title sponsor shows at the top.'}</div>`}</div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Fans &amp; reputation <span class="mt-entered">entered</span></h2><span class="muted" style="font-size:12px">${s.year}</span></div><div class="panel-b stack">
        <div class="form-grid"><label class="field"><span>Fan rating</span><input type="number" min="0" max="100" value="${fans.rating ?? ''}" data-ch="mt-fans" data-k="rating" placeholder="0–100"></label><label class="field"><span>Sentiment</span><input type="text" list="dl-sent" value="${esc(fans.sentiment || '')}" data-ch="mt-fans" data-k="sentiment" placeholder="Positive"><datalist id="dl-sent">${['Very negative', 'Negative', 'Neutral', 'Positive', 'Very positive'].map(x => `<option value="${x}">`).join('')}</datalist></label></div>
        ${fans.rating != null ? `<div class="bar-track"><div class="bar-fill" style="width:${fans.rating}%"></div></div>` : ''}
        <span class="muted" style="font-size:12px">From the Corporate screen in the game. Sentiment shapes what drivers ask for in contract talks.</span></div></div>
      <div class="panel"><div class="panel-h"><h2>Offers to compare</h2><button class="btn sm primary" data-act="mt-sp-toggle" data-kind="offer">+ Offer</button></div>${ui.mtSp === 'offer' ? mtSponsorForm(s, 'offer') : ''}
        <div class="panel-b tight table-wrap"><table><thead><tr><th>Sponsor</th><th class="num">Signing</th><th class="num">A week</th><th>Goal</th><th class="num">Worth</th><th></th></tr></thead><tbody>
        ${(m.offers || []).length ? m.offers.map(x => { const G = mtGoal(s, x); return `<tr><td><b>${esc(x.name)}</b><div class="muted" style="font-size:12px">${esc(x.tier)}${x.core ? ` · ${esc(x.core)}` : ''}${x.until ? ` · to ${x.until}` : ''}</div></td><td class="num">${fmtM(+x.bonus || 0)}</td><td class="num">${fmtM(+x.weekly || 0)}</td><td class="muted" style="font-size:12px">${G ? esc(G.label) + (G.tracked ? ' <span class="mt-auto">tracked</span>' : '') : '–'}</td><td class="num"><b>${fmtM(Math.round(worth(x) * 10) / 10)}</b></td><td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-act="mt-sp-sign" data-id="${x.id}">Sign</button><button class="icon-btn sm" data-act="mt-del" data-list="offers" data-id="${x.id}" title="Remove">${ICON.x}</button></div></td></tr>`; }).join('')
          : '<tr><td colspan="6"><div class="empty">Add the offers you\'re weighing to compare them.</div></td></tr>'}</tbody></table></div>
        <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">Worth = signing bonus plus the weekly income for every race of the seasons it runs. Signing one puts its bonus and weekly income into Finances.</div></div>
    </div>`;
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
