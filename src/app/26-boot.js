/* Pitwall — Start-up. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------------ boot */
(async function boot() {
  try { const loaded = await store.load(); if (loaded && Array.isArray(loaded.careers)) state = hydrateState(loaded); } catch (e) { console.error(e); }
  if (window.api) { try { settings = await window.api.getSettings(); } catch { } }
  if (window.api?.companion?.status) {
    try { companion = await window.api.companion.status(); } catch { }
    window.api.companion.onStatus((st) => {
      companion = st;
      const a = document.activeElement;
      if (ui.view === 'settings' && !$('#modal-root').innerHTML && !(a && a.matches('input, textarea, select'))) render();
    });
  }
  try { ui.liveCompact = localStorage.getItem('pitwall.liveCompact') === '1'; } catch { /* Full, then */ }
  setTimeout(() => learnWetFromReplays(), 15000); // wet-weather crossovers from races recorded before // Live Race and Race Replay: compact or full
  if (!state.careers.length) { ui.view = 'setup'; ui.setup = defaultSetup(); }
  else if (!career()) state.activeCareerId = state.careers[0].id;
  // the number 1 follows your career's champions (older saves had it fixed to the real 2025 champion)
  let renumbered = false;
  for (const cc of state.careers) { try { renumbered = syncNumbers(cc) || renumbered; } catch { } }
  // qualifying sessions that lost the drivers knocked out in Q1 and Q2 (before 2.0.2): rebuilt from their parts
  for (const cc of state.careers) { try { renumbered = repairQualiParts(cc) || renumbered; } catch (e) { console.error(e); } }
  for (const cc of state.careers) { try { renumbered = repairLappedGaps(cc) || renumbered; } catch (e) { console.error(e); } }
  render();
  if (renumbered || store.dirty()) store.save(); // also saves an older career that just gained its real seasons
  window.api?.onRemote?.(applyRemote);
  // F1 25 telemetry: results that finished while the window was loading, then anything new
  if (window.api?.telemetry) {
    try { telemetryStatus = await window.api.telemetry.status(); } catch { }
    window.api.telemetry.onStatus((st) => { telemetryStatus = st; const a = document.activeElement; if (ui.view === 'settings' && !$('#modal-root').innerHTML && !(a && a.matches('input, textarea, select'))) render(); });
    window.api.telemetry.onResult(handleGameResult);
    // the race you're driving: the ERS plan redraws each new lap; your battery updates every second in place
    try { liveErs = await window.api.telemetry.live?.() || null; } catch { }
    window.api.telemetry.onLive?.(onLiveMsg);
    try { for (const r of await window.api.telemetry.pending()) handleGameResult(r); } catch { }
  }
  // a new version of Pitwall, a few seconds after it opens
  if (window.api?.updates) setTimeout(() => checkUpdates(), 4000);
})();
