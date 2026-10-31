/* Pitwall — Dashboard, calendar, weekends, award cards, standings. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------- dashboard */
function renderDashboard() {
  const c = career(); const s = curSeason();
  if (c.type === 'myteam' && c.myTeam) return renderMyTeam();
  const stats = seasonStats(s);
  const ds = driverStandings(s, stats);
  const me = stats[PLAYER] || emptyStat();
  const myRow = ds.find(x => x.id === PLAYER);
  const team = s.teams.find(t => t.id === s.playerTeamId);
  const mate = teammateOf(s);
  const nr = nextRound(s);
  const done = roundsDone(s);
  const total = activeRounds(s).length;
  const leader = ds[0];
  const gap = myRow && leader ? leader.pts - myRow.pts : 0;
  const h = h2hCompare([s], PLAYER, mate);
  const lastArticle = [...c.media].reverse().find(m => m.article && m.seasonIdx === s.index);
  const top = ds.slice(0, 6);
  if (myRow && !top.some(x => x.id === PLAYER)) top.push(myRow);

  return `<div class="page">
    <section class="hero">
      <div class="stripes"></div>${carPhoto(c, team?.id) ? `<img class="hero-car" src="${esc(carPhoto(c, team.id))}" alt="">` : ''}
      <div class="hero-pic">${avatar(c, s, PLAYER, 96)}<div class="big-num">${esc(s.drivers[PLAYER]?.number ?? c.profile.number)}</div></div>
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">${s.year} season · ${esc(team?.name)}${isPrincipal(c) ? ' · lead driver' : ''}</span>
        <div class="name">${esc(dName(s, PLAYER))}</div>
        <div class="meta">${isPrincipal(c) ? `<span>Team principal: ${esc(c.profile.first)} ${esc(c.profile.last)}</span>` : ''}<span>Teammate: ${esc(dName(s, mate))}</span>${(() => { const a = !isPrincipal(c) && archRivalOf(c, s); return a ? `<span>Archrival: ${esc(dName(s, a))}</span>` : ''; })()}</div>
      </div>
      <div class="next-card">
        ${nr ? `<span class="label">Next up · Round ${activeRounds(s).indexOf(nr) + 1} of ${total}</span>
          <div style="font-family:var(--font-display);font-size:20px;font-weight:600">${esc(nr.name)} ${nr.sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div>
          <span class="muted">${esc(nr.venue)} · ${weekendTxt(s, nr)}</span>
          <button class="btn primary" data-act="open-round" data-round="${nr.id}">Log weekend</button>`
        : `<span class="label">Season complete</span><div style="font-family:var(--font-display);font-size:20px;font-weight:600">All ${total} rounds logged</div>
           <button class="btn" data-act="open-review" data-idx="${s.index}">Season review</button>
           ${s.index === c.seasons.length - 1 ? `<button class="btn primary" data-act="next-season">Start ${s.year + 1} season</button>` : ''}`}
      </div>
    </section>

    <div class="tiles">
      <div class="tile"><span class="label">Championship</span><span class="v">${myRow && done ? 'P' + myRow.pos : '–'}<small> / ${ds.length}</small></span></div>
      ${(() => { const fl = `<div class="tile"><span class="label">Fastest laps</span><span class="v">${me.fls}</span></div>`; try { const m = titleMath(s, 'driver'); if (!m.left.length || !done) return fl; const Pj = projection(c, s, m); if (!Pj.hasForm) return fl; const k = Pj.rows.findIndex(x => x.id === PLAYER); return k < 0 ? fl : `<div class="tile" data-act="nav" data-view="forecast" style="cursor:pointer" title="From the title forecast, on current form"><span class="label">Predicted finish</span><span class="v">P${k + 1}<small> on form</small></span></div>`; } catch { return fl; } })()}
      <div class="tile"><span class="label">Points</span><span class="v">${me.pts}<small>${gap > 0 ? ` −${gap}` : ''}</small></span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${me.wins}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${me.podiums}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${me.poles}</span></div>
      <div class="tile"><span class="label">Rounds</span><span class="v">${done}<small> / ${total}</small></span></div>
      <div class="tile"><span class="label">Avg finish</span><span class="v">${me.finPos.length ? 'P' + fmtAvg(avg(me.finPos)) : '–'}<small>${me.best ? ' best P' + me.best : ''}</small></span></div>
      <div class="tile"><span class="label">Avg qualifying</span><span class="v">${me.qPos.length ? 'P' + fmtAvg(avg(me.qPos)) : '–'}<small>${me.bestQ ? ' best P' + me.bestQ : ''}</small></span></div>
      ${(() => { const g = Object.values(me.byRound).filter(b => typeof b.q === 'number' && typeof b.r === 'number').reduce((a, b) => a + b.q - b.r, 0); return `<div class="tile" title="Places gained from the grid to the flag, in races you finished"><span class="label">Positions gained</span><span class="v" style="color:${g > 0 ? 'var(--green)' : g < 0 ? 'var(--red)' : 'inherit'}">${g > 0 ? '+' + g : g}</span></div>`; })()}
      <div class="tile"><span class="label">DNFs</span><span class="v">${me.dnfs}</span></div>
      ${(() => { const f = activeRounds(s).map(r => me.byRound[r.id]?.r).filter(v => v != null && v !== 'DNS').slice(-5); return `<div class="tile" title="Your last five races, oldest first"><span class="label">Form</span><span class="form-row">${f.length ? f.map(v => typeof v === 'number' ? `<span class="form-chip ${v === 1 ? 'p1' : v <= 3 ? 'pod' : v <= 10 ? 'pts' : ''}">${v}</span>` : `<span class="form-chip out">${esc(v)}</span>`).join('') : '<span class="v">–</span>'}</span></div>`; })()}
    </div>

    <div class="grid-main">
      <div class="stack">
        ${goalsPanel(c, s)}

        <div class="panel">
          <div class="panel-h"><h2>Recent results</h2><button class="btn sm ghost" data-act="nav" data-view="calendar">Full calendar</button></div>
          <div class="panel-b tight table-wrap"><table>
            <thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Sprint</th><th class="num">Race</th><th class="num">Pts</th></tr></thead>
            <tbody>${(() => {
              const rows = activeRounds(s).map((r, i) => ({ r, i, br: me.byRound[r.id] })).filter(x => x.br && (x.br.r != null || x.br.q != null)).slice(-6).reverse();
              if (!rows.length) return `<tr><td colspan="6"><div class="empty">No sessions logged yet.</div></td></tr>`;
              return rows.map(({ r, i, br }) => {
                const w = s.weekends[r.id];
                const pts = ['R', 'SPR'].reduce((a, k) => { const sd = w.sessions[k]; if (!sd?.done) return a; const ix = sd.results.findIndex(x => x.d === PLAYER); return a + (ix >= 0 ? pointsFor(k, ix + 1, sd.results[ix].st, sd.results[ix].pts) : 0); }, 0);
                return `<tr data-act="open-round" data-round="${r.id}" style="cursor:pointer"><td class="muted num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${br.q ? 'P' + br.q : '–'}</td><td class="num">${br.s != null ? (typeof br.s === 'number' ? 'P' + br.s : br.s) : '–'}</td><td class="num">${br.r != null ? (typeof br.r === 'number' ? `<b>P${br.r}</b>` : `<span class="tag dnf">${br.r}</span>`) : '–'}${br.fl ? ' <span class="fl-tag">FL</span>' : ''}</td><td class="num">${pts}</td></tr>`;
              }).join('');
            })()}</tbody></table></div>
        </div>
      </div>

      <div class="stack">
        <div class="panel">
          <div class="panel-h"><h2>Drivers' standings</h2><button class="btn sm ghost" data-act="nav" data-view="standings">All</button></div>
          <div class="panel-b tight"><table><tbody>${top.map(x => `<tr class="${x.id === PLAYER ? 'me' : ''}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${drvCell(s, x.id)}</td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div>
        </div>
        ${rivalryPanel(c, s, { mineOnly: true })}
        <div class="panel">
          <div class="panel-h"><h2>Teammate battle</h2><button class="btn sm ghost" data-act="nav" data-view="h2h">Details</button></div>
          <div class="panel-b stack">
            ${miniH2H('Qualifying', h.q[0], h.q[1], s, mate)}
            ${miniH2H('Race', h.r[0], h.r[1], s, mate)}
            ${miniH2H('Points', h.pts[0], h.pts[1], s, mate)}
          </div>
        </div>
        <div class="panel">
          <div class="panel-h"><h2>Latest from the paddock</h2><button class="btn sm ghost" data-act="nav" data-view="media">Media</button></div>
          ${lastArticle ? `<div class="article"><span class="outlet">${esc(lastArticle.article.outlet)}</span><div class="headline" style="font-size:18px">${esc(lastArticle.article.headline)}</div><div class="body" style="font-size:13px">${esc(lastArticle.article.summary || lastArticle.article.body?.[0] || '')}</div></div>`
          : `<div class="empty">No media sessions yet. Face the press after a qualifying or race.<button class="btn sm" data-act="new-media">Start a media session</button></div>`}
        </div>
      </div>
    </div>
  </div>`;
}
function miniH2H(label, a, b, s, mate) {
  const tot = a + b || 1;
  return `<div style="display:grid;gap:6px">
    <div class="row" style="justify-content:space-between"><span><b class="tnum">${a}</b> <span class="muted">You</span></span><span class="label">${label}</span><span><span class="muted">${esc(dAbbr(s, mate))}</span> <b class="tnum">${b}</b></span></div>
    <div class="h2h-bar"><i style="--c:var(--team);width:${a / tot * 100}%"></i><i style="--c:var(--panel-3);width:${b / tot * 100}%;background:var(--dim)"></i></div>
  </div>`;
}

/* -------------------------------------------------------------- calendar */
function renderCalendar() {
  const c = career(); const s = curSeason();
  const stats = seasonStats(s);
  const me = stats[PLAYER] || emptyStat();
  const nr = nextRound(s);
  const rounds = activeRounds(s);
  const isLatest = s.index === c.seasons.length - 1;
  const calTabs = () => `<div class="seg">${[['now', `${s.year}`], ['next', `Next season`]].map(([v, l]) => `<button data-act="cal-tab" data-v="${v}" class="${(ui.calTab || 'now') === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (isLatest && ui.calTab === 'next') return `<div class="page"><div class="page-head"><div><h1>${s.year + 1} season</h1><div class="sub">Next season as it stands: the line-up, the calendar and the track deals</div></div><div class="row">${calTabs()}</div></div>${renderNextSeason(c, s)}</div>`;
  return `<div class="page">
    <div class="page-head">
      <div><h1>${s.year} Calendar</h1><div class="sub">${rounds.length} rounds · ${rounds.filter(r => r.sprint).length} sprint weekends · ${roundsDone(s)} logged</div></div>
      <div class="row">${isLatest ? calTabs() : ''}${seasonPicker(c, s.index)}${roundsDone(s) ? `<button class="btn" data-act="open-review" data-idx="${s.index}">Season review</button>` : ''}${isLatest ? `<button class="btn ${nr ? '' : 'primary'}" data-act="next-season">Start ${s.year + 1} season</button>` : ''}</div>
    </div>
    <div class="rounds">${rounds.map((r, i) => {
      const w = s.weekends[r.id];
      const keys = sessionsFor(s, r);
      const doneN = keys.filter(k => w?.sessions[k]?.done).length;
      const br = me.byRound[r.id] || {};
      const isDone = w?.sessions?.R?.done;
      return `<button class="round ${nr?.id === r.id ? 'is-next' : ''}" data-act="open-round" data-round="${r.id}">
        <div class="row" style="justify-content:space-between"><span class="rn">Round ${i + 1}</span>
        <span class="row" style="gap:6px">${r.sprint ? '<span class="tag sprint">Sprint</span>' : ''}${isDone ? '<span class="tag done">Done</span>' : nr?.id === r.id ? '<span class="tag next">Next</span>' : doneN ? `<span class="tag">${doneN}/${keys.length}</span>` : ''}</span></div>
        <div><div class="gp">${countryFlag(D.TRACKS[trackOf(r)]?.country, 13)} ${esc(r.name)}</div><div class="muted" style="font-size:12px">${esc(r.venue)} · ${weekendTxt(s, r)}</div></div>
        <div class="res"><span>Q <b>${br.q ? 'P' + br.q : '–'}</b></span>${r.sprint ? `<span>Spr <b>${br.s != null ? (typeof br.s === 'number' ? 'P' + br.s : br.s) : '–'}</b></span>` : ''}<span>Race <b>${br.r != null ? (typeof br.r === 'number' ? 'P' + br.r : br.r) : '–'}</b></span>${br.fl ? '<span class="fl-tag">FL</span>' : ''}</div>
      </button>`;
    }).join('')}</div>
  </div>`;
}

/* --------------------------------------------------------------- weekend */
function renderWeekend() {
  const s = curSeason();
  const rounds = activeRounds(s);
  const ri = rounds.findIndex(r => r.id === ui.round);
  const r = rounds[ri];
  if (!r) { ui.view = 'calendar'; return renderCalendar(); }
  if (isHist(s)) return renderHistWeekend(s, rounds, ri, r);
  const keys = sessionsFor(s, r);
  if (!keys.includes(ui.session)) ui.session = keys.find(k => !s.weekends[r.id]?.sessions[k]?.done) || keys[0];
  const key = ui.session;
  const sd = sessionData(s, r.id, key, true);
  const fl = fastestOf(sd);
  const race = isRaceKind(key);
  const w = weekend(s, r.id);
  const media = career().media.filter(m => m.seasonIdx === s.index && m.roundId === r.id);

  const copyOpts = keys.filter(k => k !== key && w.sessions[k]).map(k => `<option value="sess:${k}">Order from ${SESSION_LABEL[k]}</option>`).join('');
  const tapping = ui.tap && ui.tap.key === key;

  return `<div class="page">
    <div class="page-head">
      <div class="row" style="gap:14px">
        <button class="icon-btn" title="Previous round" data-act="open-round" data-round="${rounds[ri - 1]?.id || ''}" ${ri === 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.left}</button>
        <div><span class="label">${s.year} · Round ${ri + 1} of ${rounds.length}</span><h1>${esc(r.name)} Grand Prix ${r.sprint ? '<span class="tag sprint" style="vertical-align:middle">Sprint weekend</span>' : ''}</h1><div class="sub">${esc(r.venue)} · ${weekendTxt(s, r)}</div></div>
        <button class="icon-btn" title="Next round" data-act="open-round" data-round="${rounds[ri + 1]?.id || ''}" ${ri === rounds.length - 1 ? 'disabled style="opacity:.3"' : ''}>${ICON.right}</button>
      </div>
      <div class="row">
        <div class="seg" title="Race distance you run in the game. Race pace is worked out per lap at this distance.">${RACE_LENGTHS.map(p => `<button data-act="race-length" data-v="${p}" class="${raceLength(s, r.id) === p ? 'on' : ''}">${p}%</button>`).join('')}</div>
        <span class="muted">${raceLaps(s, r.id)} laps</span>
        <div class="seg" title="The tyre allocation preset you picked in F1 25 for this weekend">${TYRE_PRESETS.map(p => `<button data-act="tyre-preset" data-round="${r.id}" data-v="${p}" class="${tyrePreset(s, r.id) === p ? 'on' : ''}">${PRESET_NAME[p]}</button>`).join('')}</div>
        ${media.length ? `<span class="muted">${media.length} media session${media.length > 1 ? 's' : ''}</span>` : ''}
        ${D.TRACKS[trackOf(r)] ? `<button class="btn" data-act="open-track" data-track="${trackOf(r)}">${ICON.track} Circuit guide</button>` : ''}
        ${Object.values(w.sessions).some(x => x.done) ? `<button class="btn" data-act="weekend-card" data-round="${r.id}">${ICON.camera} Weekend summary</button>` : ''}
        <button class="btn" data-act="new-media" data-round="${r.id}">${ICON.mic} Media session</button>
      </div>
    </div>

    <div class="panel">
      <div class="session-tabs">${keys.map(k => `<button data-act="pick-session" data-key="${k}" class="${k === key ? 'on' : ''}">${w.sessions[k]?.done ? '<span class="ok"></span>' : ''}${SESSION_LABEL[k]}</button>`).join('')}</div>
      <div class="panel-h">
        <div class="row">
          <select data-ch="copy-order" style="width:auto"><option value="">Fill order…</option>${copyOpts}<option value="champ">Championship order</option><option value="grid">Team order</option></select>
          <button class="btn sm" data-act="tap-start">${tapping ? 'Tapping…' : 'Tap finishing order'}</button>
          <button class="btn sm" data-act="autofill-laps" title="Fill the empty lap times from the fastest one you entered">Auto-fill laps</button>
          <button class="btn sm ghost" data-act="clear-session">Clear times</button>
        </div>
        <div class="row">
          <label class="check"><input type="checkbox" data-ch="sess-done" ${sd.done ? 'checked' : ''}> Session complete</label>
        </div>
      </div>
      ${tapping ? renderTap(s, sd) : ''}
      <div class="panel-b tight table-wrap">
        <table class="res-table">
          <thead><tr><th></th><th>Pos</th><th>Driver</th><th>${key === 'Q' || key === 'SQ' ? 'Best lap' : 'Fastest lap'}</th><th title="Relative to the leader">${race ? 'Race time / gap to winner' : 'Gap to fastest'}</th>${race ? '<th title="Laps behind the winner">Laps down</th><th>Status</th><th class="num">Pts</th>' : ''}<th></th></tr></thead>
          <tbody>${sd.results.map((x, i) => {
            const isFl = x.d === fl;
            return `<tr draggable="true" data-drag="${i}" class="${x.d === PLAYER ? 'me' : ''} ${isFl ? 'is-fl' : ''}">
              <td class="handle" title="Drag to reorder">${ICON.grip}</td>
              <td class="pos ${i < 3 && !OUT.includes(x.st) ? 'p' + (i + 1) : ''}">${OUT.includes(x.st) ? `<span class="tag dnf">${x.st}</span>` : i + 1}</td>
              <td>${drvCell(s, x.d, { team: true })}</td>
              <td class="w-lap"><input type="text" inputmode="numeric" class="lap-in" placeholder="${i === 0 ? '1:23.456' : ''}" value="${esc(x.lap)}" data-ch="res-field" data-f="lap" data-i="${i}" data-mask="lap"></td>
              <td class="w-gap">${!race && i === 0 ? '<span class="muted" style="font-size:12px">Fastest</span>'
                : `<input type="text" inputmode="numeric" placeholder="${i === 0 ? '1:32:15.120' : i === 1 ? (race ? '+5.123' : '+0.123') : ''}" value="${esc(x.gap)}" data-ch="res-field" data-f="gap" data-i="${i}" data-mask="${race ? (i === 0 ? 'rtime' : 'rgap') : 'qgap'}" ${race && +x.laps > 0 ? 'disabled title="Lapped: the gap is not needed"' : ''}>`}</td>
              ${race ? `<td class="w-laps">${i === 0 ? '' : `<input type="number" min="0" max="99" placeholder="0" value="${+x.laps > 0 ? +x.laps : ''}" data-ch="res-field" data-f="laps" data-i="${i}">`}</td><td class="w-st"><select data-ch="res-field" data-f="st" data-i="${i}">${['FIN', ...OUT].map(o => `<option ${x.st === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
              <td class="num">${pointsFor(key, i + 1, x.st, x.pts) || ''}</td>` : ''}
              <td><div class="row" style="gap:2px;flex-wrap:nowrap"><button class="icon-btn" title="Move up" data-act="move" data-i="${i}" data-dir="-1">${ICON.up}</button><button class="icon-btn" title="Move down" data-act="move" data-i="${i}" data-dir="1">${ICON.down}</button></div></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      <div class="panel-h" style="border-top:1px solid var(--line);border-bottom:0">
        <div class="row"><span class="fl-tag">Fastest lap</span>
          ${fl ? `<b>${esc(dName(s, fl))}</b><span class="mono fl">${esc(sd.results.find(x => x.d === fl)?.lap || '')}</span>` : '<span class="muted">Enter lap times to detect it automatically</span>'}
        </div>
        <label class="row muted" style="font-size:13px">Override
          <select data-ch="fl-override" style="width:auto"><option value="">Auto (quickest time)</option>${sd.results.map(x => `<option value="${x.d}" ${sd.fl === x.d ? 'selected' : ''}>${esc(dName(s, x.d))}</option>`).join('')}</select>
        </label>
      </div>
    </div>

    ${sd.estimated ? `<div class="callout">Estimated from ${key === 'FP' || key.startsWith('FP') ? 'qualifying' : ''}: this practice session wasn't logged, so Pitwall filled it in, about seven tenths off each driver's qualifying time. Edit it like any session.</div>` : ''}
    ${isRaceKind(key) ? positionChartPanel(s, sd) : ''}
    ${key !== 'Q' && key !== 'SQ' ? strategyPanel(s, sd, key, r.id) : ''}

    <div class="panel">
      <div class="panel-h"><h3>Weekend notes</h3><span class="muted" style="font-size:12px">Setups, strategy, incidents. These feed into your media sessions.</span></div>
      <div class="panel-b"><textarea data-ch="notes" placeholder="e.g. Two-stop medium-hard-medium, lost a place to the safety car on lap 31.">${esc(w.notes || '')}</textarea></div>
    </div>
  </div>`;
}

/** A weekend of a real (or simulated) season: the results as they were, read-only. */
function renderHistWeekend(s, rounds, ri, r) {
  const w = s.weekends[r.id] || { sessions: {} };
  const keys = ['Q', 'SPR', 'R'].filter(k => w.sessions[k]?.done);
  if (!keys.includes(ui.session)) ui.session = keys[keys.length - 1];
  const key = ui.session; const sd = w.sessions[key]; const race = isRaceKind(key);
  const fl = race ? fastestOf(sd) : null;
  const t = D.TRACKS[trackOf(r)];
  return `<div class="page">
    <div class="page-head">
      <div class="row" style="gap:14px">
        <button class="icon-btn" title="Previous round" data-act="open-round" data-round="${rounds[ri - 1]?.id || ''}" ${ri === 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.left}</button>
        <div><span class="label">${s.year} · Round ${ri + 1} of ${rounds.length} · ${s.historic === 'sim' ? 'Simulated season' : 'Real result'}</span><h1>${t ? countryFlag(t.country, 22) + ' ' : ''}${esc(r.name)} Grand Prix ${r.sprint ? '<span class="tag sprint" style="vertical-align:middle">Sprint weekend</span>' : ''}</h1><div class="sub">${esc(r.venue)} · ${weekendTxt(s, r)}${r.laps ? ` · ${r.laps} laps` : ''}</div></div>
        <button class="icon-btn" title="Next round" data-act="open-round" data-round="${rounds[ri + 1]?.id || ''}" ${ri === rounds.length - 1 ? 'disabled style="opacity:.3"' : ''}>${ICON.right}</button>
      </div>
      <div class="row">
        ${t ? `<button class="btn" data-act="open-track" data-track="${trackOf(r)}">${ICON.track} Circuit guide</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="session-tabs">${keys.map(k => `<button data-act="pick-session" data-key="${k}" class="${k === key ? 'on' : ''}"><span class="ok"></span>${SESSION_LABEL[k]}</button>`).join('')}</div>
      ${sd ? `<div class="panel-b tight table-wrap"><table class="res-table">
        <thead><tr><th>Pos</th><th>Driver</th><th>${race ? 'Fastest lap' : 'Best lap'}</th><th>${race ? 'Time / gap' : 'Gap to pole'}</th>${race ? '<th class="num">Pts</th>' : ''}</tr></thead>
        <tbody>${sd.results.map((x, i) => `<tr class="${x.d === fl ? 'is-fl' : ''}">
          <td class="pos ${i < 3 && !OUT.includes(x.st) ? 'p' + (i + 1) : ''}">${OUT.includes(x.st) ? `<span class="tag dnf">${x.st}</span>` : i + 1}</td>
          <td>${drvCell(s, x.d, { team: true })}</td>
          <td class="mono">${esc(x.lap || '')}${x.d === fl ? ' <span class="fl-tag">FL</span>' : ''}</td>
          <td class="mono">${OUT.includes(x.st) ? '' : +x.laps > 0 ? `+${x.laps} lap${+x.laps > 1 ? 's' : ''}` : esc(x.gap || (i === 0 && !race ? 'Pole' : ''))}</td>
          ${race ? `<td class="num">${pointsFor(key, i + 1, x.st, x.pts) || ''}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No results for this weekend.</div>'}
      <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">${s.historic === 'sim' ? 'Simulated before your career began. It cannot be edited.' : 'Real results, from before your career began. They cannot be edited.'}</div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------- weekend card */
const loadImg = (src) => new Promise(res => { if (!src) { res(null); return; } const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function hexA(hex, a) { const h = String(hex || '#5E6A82').replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; }
/** A shareable 1200×675 summary of your weekend, drawn on a canvas. */
async function drawWeekendCard(c, s, r) {
  const W = 1200, H = 675;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const F = '"Bahnschrift", "DIN Alternate", "Barlow Condensed", "Roboto Condensed", "Arial Narrow", sans-serif';
  const rounds = activeRounds(s); const ri = rounds.indexOf(r);
  const ses = s.weekends[r.id]?.sessions || {};
  const team = teamOf(s, PLAYER); const col = team?.color || '#E10600';
  const col2 = (team && (team.id === MYTEAM ? c.myTeam?.color2 : D.TEAM_BIO[team.id]?.color2)) || '#FFFFFF';
  const text = (t, x, y, { size = 20, weight = 400, color = '#E7ECF5', align = 'left', font = F } = {}) => { g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); };
  const fit = (t, size, maxW, weight = 600) => { let sz = size; g.font = `${weight} ${sz}px ${F}`; while (sz > 12 && g.measureText(t).width > maxW) { sz -= 2; g.font = `${weight} ${sz}px ${F}`; } return sz; };
  const circlePic = async (id, x, y, rad, ring) => {
    const img = await loadImg(driverPhoto(c, id));
    const tc = teamColor(s, id);
    g.save(); g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.closePath();
    if (img) { g.clip(); const k = Math.max(rad * 2 / img.width, rad * 2 / img.height); g.drawImage(img, x - img.width * k / 2, y - rad, img.width * k, img.height * k); }
    else { const gr = g.createRadialGradient(x - rad * 0.4, y - rad * 0.5, rad * 0.1, x, y, rad); gr.addColorStop(0, mixHex(tc, '#FFFFFF', 0.35)); gr.addColorStop(1, mixHex(tc, '#000000', 0.35)); g.fillStyle = gr; g.fill();
      text(initials(id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : dName(s, id)), x, y + rad * 0.3, { size: Math.round(rad * 0.8), weight: 700, color: contrastInk(tc), align: 'center' }); }
    g.restore();
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.lineWidth = ring; g.strokeStyle = tc; g.stroke();
  };
  // backdrop: dark base, team-colour wash and livery stripes
  g.fillStyle = '#0B0F17'; g.fillRect(0, 0, W, H);
  const wash = g.createLinearGradient(0, 0, W, 0); wash.addColorStop(0, hexA(col, 0.42)); wash.addColorStop(0.62, hexA(col, 0)); g.fillStyle = wash; g.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = 0.1; g.strokeStyle = col2; g.lineWidth = 6;
  for (let x = 820; x < W + 400; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 300, H); g.stroke(); }
  g.restore();
  g.fillStyle = col; g.fillRect(0, 0, 14, H);
  // header
  text(`ROUND ${ri + 1} OF ${rounds.length}  ·  ${weekendTxt(s, r).toUpperCase()}`, 60, 70, { size: 20, weight: 600, color: '#8B97AF' });
  text(`${r.name} Grand Prix`, 60, 130, { size: fit(`${r.name} Grand Prix`, 60, 1080), weight: 700 });
  text(r.venue, 60, 168, { size: 24, color: '#8B97AF' });
  // you
  await circlePic(PLAYER, 150, 300, 86, 6);
  const me = dName(s, PLAYER);
  text(me, 262, 288, { size: fit(me, 46, 430, 700), weight: 700 });
  text(`${team?.name || ''}  ·  #${s.drivers[PLAYER]?.number ?? c.profile.number}`, 262, 326, { size: 22, color: '#8B97AF' });
  // results tiles
  const at = (k) => { const sd = ses[k]; if (!sd?.done) return null; const i = sd.results.findIndex(x => x.d === PLAYER); return i < 0 ? null : OUT.includes(sd.results[i].st) ? sd.results[i].st : 'P' + (i + 1); };
  const pts = ['SPR', 'R'].reduce((a, k) => { const sd = ses[k]; if (!sd?.done) return a; const i = sd.results.findIndex(x => x.d === PLAYER); return a + (i >= 0 ? pointsFor(k, i + 1, sd.results[i].st, sd.results[i].pts) : 0); }, 0);
  const before = driverStandings(s, seasonStats(s, ri)).find(x => x.id === PLAYER)?.pos;
  const after = driverStandings(s, seasonStats(s, ri + 1)).find(x => x.id === PLAYER)?.pos;
  const move = ri > 0 && before && after && before !== after ? (after < before ? `▲${before - after}` : `▼${after - before}`) : '';
  const tiles = [['QUALIFYING', at('Q') || '–'], ...(r.sprint ? [['SPRINT', at('SPR') || '–']] : []), ['RACE', at('R') || '–'], ['POINTS', `+${pts}`], ['CHAMPIONSHIP', after ? `P${after}` : '–', move]];
  const tw = 128, gap = 10; let tx = 60;
  for (const [lab, val, extra] of tiles) {
    g.fillStyle = 'rgba(18,24,38,0.85)'; g.fillRect(tx, 420, tw, 104); g.fillStyle = col; g.fillRect(tx, 420, tw, 3);
    text(lab, tx + 14, 448, { size: 14, weight: 600, color: '#8B97AF' });
    text(val, tx + 14, 500, { size: 42, weight: 700, color: val === 'P1' ? '#E9C46A' : '#E7ECF5' });
    if (extra) text(extra, tx + tw - 12, 500, { size: 18, weight: 700, color: extra.startsWith('▲') ? '#2FD07A' : '#F0535A', align: 'right' });
    tx += tw + gap;
  }
  // teammate
  const mate = teammateOf(s);
  if (mate) {
    const cmp = (k) => { const sd = ses[k]; if (!sd?.done) return null; const a = sd.results.findIndex(x => x.d === PLAYER), b = sd.results.findIndex(x => x.d === mate); return a >= 0 && b >= 0 ? a < b : null; };
    const q = cmp('Q'), rr = cmp('R');
    const bits = [q != null ? `${q ? 'ahead' : 'behind'} in qualifying` : null, rr != null ? `${rr ? 'ahead' : 'behind'} in the race` : null].filter(Boolean);
    if (bits.length) text(`vs ${dName(s, mate)}: ${bits.join(', ')}`, 60, 560, { size: 22, color: '#C9D1E0' });
  }
  // podium
  const fin = ses.R?.done ? ses.R.results.filter(x => !OUT.includes(x.st)).slice(0, 3) : [];
  text('PODIUM', 820, 232, { size: 16, weight: 600, color: '#8B97AF' });
  for (const [k, x] of fin.entries()) {
    const y = 270 + k * 62;
    g.fillStyle = 'rgba(18,24,38,0.8)'; g.fillRect(820, y - 26, 320, 52);
    g.fillStyle = teamColor(s, x.d); g.fillRect(820, y - 26, 4, 52);
    text(String(k + 1), 846, y + 9, { size: 26, weight: 700, color: ['#E9C46A', '#C7CED9', '#CD8A5A'][k], align: 'center' });
    await circlePic(x.d, 892, y, 20, 2);
    text(dName(s, x.d), 924, y + 7, { size: fit(dName(s, x.d), 22, 205, 600), weight: 600, color: x.d === PLAYER ? '#FFFFFF' : '#E7ECF5' });
  }
  if (!fin.length) text('Race not logged yet', 820, 270, { size: 20, color: '#5E6A82' });
  // headline from the race report
  const story = buildStories(c, s).find(x => x.kind === 'race' && x.r === r);
  if (story) {
    g.font = `italic 500 24px ${F}`; g.fillStyle = '#E7ECF5'; g.textAlign = 'left';
    const words = `“${story.headline}”`.split(' '); let line = ''; let y = 618; const lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > 900) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.slice(0, 2).forEach((l, i) => g.fillText(l, 60, y + i * 30 - (lines.length > 1 ? 30 : 0)));
  }
  text('PITWALL', W - 40, H - 32, { size: 22, weight: 700, color: col, align: 'right' });
  return cv;
}
async function weekendCardModal(roundId) {
  const c = career(); const s = curSeason(); const r = activeRounds(s).find(x => x.id === roundId);
  if (!r) return;
  modal(`<div class="modal-h"><h2>Weekend summary</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div><div class="modal-b"><div class="row"><span class="spinner"></span><span class="muted">Drawing the card…</span></div></div>`, 'wide');
  const cv = await drawWeekendCard(c, s, r);
  const url = cv.toDataURL('image/png');
  ui.modal = { kind: 'card', url, name: `pitwall-${s.year}-r${activeRounds(s).indexOf(r) + 1}-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png` };
  modal(`<div class="modal-h"><h2>${esc(r.name)} Grand Prix · weekend summary</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><img src="${url}" alt="Weekend summary card" style="width:100%;border-radius:6px;border:1px solid var(--line)"></div>
    <div class="modal-f"><span class="muted" style="font-size:12px;margin-right:auto">1200 × 675 PNG, sized for social posts.</span><button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="card-save">Save image</button></div>`, 'wide');
}

/* ------------------------------------------------------------ award cards */
/** Driver of the Day (round ri) or Driver of the Season, drawn in the story-graphics style (gfxAward), to save. */
async function awardCardModal(kind, ri) {
  const c = career(); const s = curSeason();
  const title = kind === 'dots' ? `${s.year} Driver of the Season` : `Driver of the Day · ${activeRounds(s)[ri]?.name} Grand Prix`;
  modal(`<div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div><div class="modal-b"><div class="row"><span class="spinner"></span><span class="muted">Drawing the card…</span></div></div>`, 'wide');
  const cv = await gfxAward(c, s, kind, ri);
  if (!cv) { closeModal(); toast('Nothing to show yet'); return; }
  const url = cv.toDataURL('image/png');
  ui.modal = { kind: 'card', url, name: kind === 'dots' ? `pitwall-${s.year}-driver-of-the-season.png` : `pitwall-${s.year}-r${ri + 1}-driver-of-the-day.png` };
  modal(`<div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><img src="${url}" alt="${esc(title)}" style="width:100%;max-width:540px;display:block;margin:0 auto;border-radius:6px"></div>
    <div class="modal-f"><span class="muted" style="font-size:12px;margin-right:auto">1080 × 1350 PNG, sized for social posts.</span><button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="card-save">Save image</button></div>`, 'wide');
}

function renderTap(s, sd) {
  const taken = ui.tap.order;
  return `<div class="panel-b" style="border-bottom:1px solid var(--line);display:grid;gap:12px;background:var(--panel-2)">
    <div class="row" style="justify-content:space-between"><span>Tap drivers in finishing order. <span class="muted">${taken.length} of ${sd.results.length} placed. Untapped drivers keep their current order behind them.</span></span>
    <div class="row"><button class="btn sm ghost" data-act="tap-undo">Undo</button><button class="btn sm ghost" data-act="tap-cancel">Cancel</button><button class="btn sm primary" data-act="tap-apply">Apply order</button></div></div>
    <div class="tap-grid">${sd.results.map(x => {
      const p = taken.indexOf(x.d);
      return `<button class="tap ${p >= 0 ? 'taken' : ''}" data-act="tap-pick" data-d="${x.d}" ${p >= 0 ? 'disabled' : ''}><span class="chip" style="--c:${teamColor(s, x.d)}"></span><span class="p">${p >= 0 ? p + 1 : ''}</span><span>${esc(dAbbr(s, x.d))}</span><span class="muted" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(dName(s, x.d).split(' ').slice(-1)[0])}</span></button>`;
    }).join('')}</div>
  </div>`;
}

/* ------------------------------------------------------------- standings */
/** The tabs along the top of Standings (the title forecast is one of them). */
const standingsTabs = (tab) => `<div class="seg">${[['drivers', 'Drivers'], ['constructors', 'Constructors'], ['progress', 'Progress'], ['grid', 'Results grid'], ['forecast', 'Title forecast']].map(([id, l]) => `<button data-act="standings-tab" data-tab="${id}" class="${tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function renderStandings() {
  if (ui.standingsTab === 'forecast') return renderForecast();
  const c = career(); const s = curSeason();
  const stats = seasonStats(s);
  const ds = driverStandings(s, stats);
  const cs = constructorStandings(s, stats);
  const rounds = activeRounds(s);
  const tab = ui.standingsTab;
  let body = '';
  const simple = ui.standingsDetail === 'simple';
  if (simple && tab === 'drivers') {
    body = `<table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th class="num">Pts</th></tr></thead><tbody>${ds.map(x => `<tr class="${x.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${x.id}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${drvCell(s, x.id)}</td><td class="muted">${esc(teamOf(s, x.id)?.name || '')}</td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table>`;
  } else if (simple && tab === 'constructors') {
    body = `<table><thead><tr><th>Pos</th><th>Team</th><th class="num">Pts</th></tr></thead><tbody>${cs.map(x => `<tr class="${x.team.id === s.playerTeamId ? 'me' : ''}" data-act="open-team" data-id="${x.team.id}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td><div class="drv">${teamMark(c, x.team)}<b>${esc(x.team.name)}</b></div></td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table>`;
  } else if (tab === 'drivers') {
    body = `<table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Poles</th><th class="num">FL</th><th class="num">DNF</th><th class="num">Avg Q</th><th class="num">Avg finish</th><th class="num">Pts</th></tr></thead><tbody>
      ${ds.map(x => `<tr class="${x.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${x.id}" title="Driver profile"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${drvCell(s, x.id)}</td><td class="muted">${esc(teamOf(s, x.id)?.name || '')}</td>
      <td class="num">${x.wins}</td><td class="num">${x.podiums}</td><td class="num">${x.poles}</td><td class="num">${x.fls ? `<span class="fl">${x.fls}</span>` : 0}</td><td class="num">${x.dnfs}</td><td class="num">${fmtAvg(avg(x.qPos))}</td><td class="num">${fmtAvg(avg(x.finPos))}</td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}
    </tbody></table>`;
  } else if (tab === 'constructors') {
    const max = cs[0]?.pts || 1;
    body = `<table><thead><tr><th>Pos</th><th>Team</th><th>Drivers</th><th class="num">Wins</th><th class="num">Podiums</th><th style="width:30%"></th><th class="num">Pts</th></tr></thead><tbody>
      ${cs.map(x => `<tr class="${x.team.id === s.playerTeamId ? 'me' : ''}" data-act="open-team" data-id="${x.team.id}" title="Team profile"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td><div class="drv">${teamMark(c, x.team)}<b>${esc(x.team.name)}</b></div></td>
      <td class="muted">${x.team.drivers.filter(Boolean).map(d => esc(dAbbr(s, d))).join(' · ')}</td><td class="num">${x.wins}</td><td class="num">${x.podiums}</td>
      <td><div class="h2h-bar"><i style="--c:${x.team.color};width:${x.pts / max * 100}%"></i></div></td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}
    </tbody></table>`;
  } else if (tab === 'progress') {
    const dp = progression(s, 'driver'); const tp = progression(s, 'team');
    body = !dp.n ? '<div class="empty">Log a race to see how the championship develops.</div>' : `<div class="panel-b stack">
      <div><h3>Drivers’ points</h3><p class="muted" style="font-size:12px;margin:2px 0 6px">Top eight plus you. Second driver of a team is dashed.</p>${lineChart(driverSeries(s, dp, 'pts'), dp.labels, { names: dp.names })}</div>
      <div><h3>Drivers’ championship position</h3>${lineChart(driverSeries(s, dp, 'pos'), dp.labels, { invert: true, names: dp.names })}</div>
      <div><h3>Constructors’ points</h3>${lineChart(s.teams.map(t => ({ label: D.TEAM_BIO[t.id]?.short || (t.id === MYTEAM ? c.myTeam?.short : t.name.slice(0, 3).toUpperCase()), name: t.name, color: t.color, bold: t.id === s.playerTeamId, vals: tp.by[t.id]?.pts || [] })), tp.labels, { names: tp.names })}</div>
    </div>`;
  } else {
    body = `<table class="matrix"><thead><tr><th>Driver</th>${rounds.map((r, i) => `<th title="${esc(r.name)}">${i + 1}<br><span class="dim">${esc(r.id.toUpperCase())}</span></th>`).join('')}<th class="num">Pts</th></tr></thead><tbody>
      ${ds.map(x => `<tr class="${x.id === PLAYER ? 'me' : ''}"><td>${drvCell(s, x.id)}</td>${rounds.map(r => {
        const br = stats[x.id].byRound[r.id] || {};
        const v = br.r;
        if (v == null) return '<td><span class="cell nopts">·</span></td>';
        const cls = typeof v !== 'number' ? 'dnf' : v === 1 ? 'p1' : v === 2 ? 'p2' : v === 3 ? 'p3' : v <= 10 ? 'pts' : 'nopts';
        return `<td><span class="cell ${cls} ${br.fl ? 'flb' : ''}" title="${esc(r.name)}${br.s != null ? ' · Sprint ' + br.s : ''}${br.q ? ' · Quali P' + br.q : ''}">${typeof v === 'number' ? v : v === 'DNS' ? 'NS' : v === 'DSQ' ? 'DQ' : 'R'}</span></td>`;
      }).join('')}<td class="num"><b>${x.pts}</b></td></tr>`).join('')}
    </tbody></table>
    <div class="row muted" style="padding:12px 16px;font-size:12px;gap:16px"><span><span class="cell p1">1</span> Win</span><span><span class="cell pts">7</span> Points</span><span><span class="cell dnf">R</span> Retired</span><span><span class="cell flb nopts">12</span> Fastest lap</span></div>`;
  }
  return `<div class="page">
    <div class="page-head"><div><h1>${s.year} Standings</h1><div class="sub">After ${roundsDone(s)} of ${rounds.length} rounds</div></div>
    <div class="row">${seasonPicker(c, s.index)}${tab === 'drivers' || tab === 'constructors' ? `<div class="seg">${[['simple', 'Simple'], ['detailed', 'Detailed']].map(([v, l]) => `<button data-act="standings-detail" data-v="${v}" class="${(ui.standingsDetail || 'detailed') === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}${standingsTabs(tab)}</div></div>
    <div class="panel"><div class="panel-b tight table-wrap">${body}</div></div>
  </div>`;
}
