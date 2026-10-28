// F1 25 telemetry: listens for the game's UDP packets, straight from the game or forwarded by another app (a wheel
// base's software, say), and turns each finished session into a result Pitwall can log. Packet layouts follow EA's
// F1 25 UDP specification: packet format 2025 for the base game (22 cars), 2026 for the 2026 Season Pack (24 cars,
// wider driver/team ids). Only what Pitwall uses is read: session, lap data (grid slots and laps), participants,
// events (penalties, warnings, collisions, overtakes), car damage (tyre wear), session history (laps and sectors) and the final
// classification. In every session of the weekend it also follows your own car (motion, car telemetry and car status) to
// profile the ERS, and in a race it sends that profile on as you drive, so the plan can adapt lap by lap.
const dgram = require('dgram');

const PACKET = { MOTION: 0, SESSION: 1, LAP: 2, EVENT: 3, PARTICIPANTS: 4, TELEMETRY: 6, STATUS: 7, FINAL: 8, DAMAGE: 10, HISTORY: 11, TYRE_SETS: 12 };
const ERS_BIN = 20; // metres: the ERS profile is kept in slices of the lap this long
// the sessions your ERS is profiled in: the whole weekend (practice, qualifying, the sprint and the race), not time trial
const ersSession = (info) => !!info && info.sessionType >= 1 && info.sessionType <= 17;
const raceType = (t) => t >= 15 && t <= 17;
const LIVE_MS = 1000; // a race sends your battery this often, and the whole profile each new lap
const HEADER = 29;
const layout = (format) => format >= 2026 ? { cars: 24, part: 60, wide: true } : { cars: 22, part: 57, wide: false };
const SETTLE_MS = 2500; // after the final classification the game sends every car's lap history once more

function header(b) {
  return { format: b.readUInt16LE(0), year: b.readUInt8(2), type: b.readUInt8(6), uid: b.readBigUInt64LE(7).toString(), time: b.readFloatLE(15), player: b.readUInt8(27) };
}
const cstr = (b, from, len) => { const end = b.indexOf(0, from); return b.toString('utf8', from, end < 0 || end > from + len ? from + len : end).trim(); };

function parseSession(b) {
  if (b.length < 753) return null;
  return {
    totalLaps: b.readUInt8(32), trackLength: b.readUInt16LE(33), sessionType: b.readUInt8(35), track: b.readInt8(36),
    safetyCarNow: b.readUInt8(153), // 0 none, 1 safety car, 2 virtual safety car, 3 formation lap
    gameMode: b.readUInt8(694), sessionLength: b.readUInt8(700),
    seasonLink: b.readUInt32LE(670), weekendLink: b.readUInt32LE(674), sessionLink: b.readUInt32LE(678),
    safetyCars: b.readUInt8(705), virtualSafetyCars: b.readUInt8(706), redFlags: b.readUInt8(707),
    weekend: [...b.subarray(733, 733 + b.readUInt8(732))],
  };
}
// Every slot is read, not just the first numActiveCars: that count drops when a car retires, but the cars keep their
// indexes, so trusting it loses whichever car sits last in the list.
function parseParticipants(b, L) {
  const out = [];
  for (let i = 0; i < L.cars; i++) {
    const o = HEADER + 1 + i * L.part;
    if (o + L.part > b.length) break;
    out.push(L.wide
      ? { idx: i, ai: !!b[o], driver: b.readUInt16LE(o + 1), team: b.readUInt16LE(o + 5), myTeam: !!b[o + 7], number: b[o + 8], nationality: b[o + 9], name: cstr(b, o + 10, 32) }
      : { idx: i, ai: !!b[o], driver: b[o + 1], team: b[o + 3], myTeam: !!b[o + 4], number: b[o + 5], nationality: b[o + 6], name: cstr(b, o + 7, 32) });
  }
  return out.filter(p => p.name || p.number);
}
function parseFinal(b, L) {
  const n = b.readUInt8(HEADER); const out = [];
  for (let i = 0; i < Math.min(n, L.cars); i++) {
    const o = HEADER + 1 + i * 46;
    if (o + 46 > b.length) break;
    const stints = [];
    for (let k = 0; k < Math.min(b[o + 21], 8); k++) stints.push({ actual: b[o + 22 + k], visual: b[o + 30 + k], end: b[o + 38 + k] });
    out.push({ idx: i, position: b[o], laps: b[o + 1], grid: b[o + 2], points: b[o + 3], pits: b[o + 4], status: b[o + 5], reason: b[o + 6],
      best: b.readUInt32LE(o + 7), total: b.readDoubleLE(o + 11), penalty: b[o + 19], penalties: b[o + 20], stints });
  }
  return out;
}
/**
 * Each car's record size, worked out from the packet length. Formats add and drop fields: the 2026 format (24 cars)
 * has 54-byte motion records (60 before), 59-byte car telemetry (60: rearranged after the RPM, the engine temperature
 * down to one byte) and 59-byte car status (55: a field inserted after the harvest). The fields Pitwall reads come before any of the changes. 22 and 24 cars are both
 * tried, an exact fit to the known size first.
 */
const stride = (b, L, base, tail = 0) => {
  const fits = [...new Set([L.cars, 22, 24])].map(c => (b.length - HEADER - tail) / c).filter(n => Number.isInteger(n) && n >= base - 8 && n <= base + 64);
  return fits.includes(base) ? base : fits[0] || base;
};
/** Your car's position on the map (world x and z, in metres). */
function playerMotion(b, L, p) { const o = HEADER + p * stride(b, L, 60); return o + 12 > b.length ? null : { x: b.readFloatLE(o), z: b.readFloatLE(o + 8) }; }
/** Your car's speed (km/h), throttle and brake (0 to 1), and whether DRS is open. */
function playerTelemetry(b, L, p) {
  const w = stride(b, L, 60, 3); const o = HEADER + p * w; if (o + 19 > b.length) return null;
  // the 2026 layout has no DRS where it used to be (and no DRS on the car): read it as closed
  return { spd: b.readUInt16LE(o), thr: b.readFloatLE(o + 2), brk: b.readFloatLE(o + 10), drs: w >= 60 && b[o + 18] > 0 };
}
/**
 * Your car's ERS: stored energy, deploy mode, harvested and deployed this lap (joules) and MGU-K power (watts). The
 * 2026 format (59-byte records) inserts a field after the harvest: the energy you may deploy this lap (6.4 MJ in the
 * garage, for one), which moves deployed-this-lap along by four bytes.
 */
function playerStatus(b, L, p) {
  const w = stride(b, L, 55); const o = HEADER + p * w; const wide = w >= 59; if (o + (wide ? 58 : 54) > b.length) return null;
  return { mguk: b.readFloatLE(o + 33), ers: b.readFloatLE(o + 37), mode: b[o + 41], harv: b.readFloatLE(o + 42) + b.readFloatLE(o + 46),
    dep: b.readFloatLE(o + (wide ? 54 : 50)), limit: wide ? b.readFloatLE(o + 50) : null };
}
/** Lap data: each car's race position, current lap, grid slot, result status and whether it is in the pit lane. */
function parseLapData(b, L) {
  const out = [];
  for (let i = 0; i < L.cars; i++) {
    const o = HEADER + i * 57; if (o + 57 > b.length) break;
    out.push({ pos: b[o + 32], lap: b[o + 33], grid: b[o + 43], status: b[o + 45], pit: b[o + 34] > 0 || b[o + 46] > 0, dist: b.readFloatLE(o + 20), invalid: b[o + 37] > 0, lead: b.readUInt16LE(o + 17) + b[o + 19] * 60000, front: b.readUInt16LE(o + 14) + b[o + 16] * 60000 });
  }
  return out;
}
/** Car damage: each car's bodywork damage (front wings, rear wing, floor, diffuser, sidepods), in percent points added up. */
function parseBodyDamage(b, L) {
  const out = []; const w = stride(b, L, 46);
  for (let i = 0; i < L.cars; i++) { const o = HEADER + i * w; if (o + 34 > b.length) break; out.push(b[o + 28] + b[o + 29] + b[o + 30] + b[o + 31] + b[o + 32] + b[o + 33]); }
  return out;
}
/** Car damage: the most worn of each car's four tyres, in percent. */
function parseWear(b, L) {
  const out = []; const w = stride(b, L, 46);
  for (let i = 0; i < L.cars; i++) {
    const o = HEADER + i * w; if (o + 16 > b.length) break;
    out.push(Math.max(b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8), b.readFloatLE(o + 12)));
  }
  return out;
}
/**
 * Tyre sets: one car's 20 sets (13 dry, 7 wet) as the game tracks them: compound, wear (%), still available (or
 * returned), the session the game meant it for, its life, the lap time it gives up to a new set (ms), and whether it is
 * on the car. Each record is 10 bytes; the size is worked out from the packet length in case a format changes it.
 */
function parseTyreSets(b) {
  if (b.length < HEADER + 1 + 20 * 10) return null;
  const w = Math.floor((b.length - HEADER - 2) / 20); const sets = [];
  for (let k = 0; k < 20; k++) {
    const o = HEADER + 1 + k * w;
    sets.push({ c: b[o + 1], actual: b[o], wear: b[o + 2], avail: !!b[o + 3], rec: b[o + 4], life: b[o + 5], usable: b[o + 6], delta: b.readInt16LE(o + 7), fitted: !!b[o + 9] });
  }
  return { car: b[HEADER], sets, fitted: b[HEADER + 1 + 20 * w] };
}
function parseHistory(b) {
  if (b.length < 1460) return null;
  const car = b[HEADER], n = Math.min(b[HEADER + 1], 100), ns = Math.min(b[HEADER + 2], 8);
  const laps = [];
  for (let k = 0; k < n; k++) {
    const o = HEADER + 7 + k * 14; const ms = b.readUInt32LE(o);
    const sec = (at) => b.readUInt16LE(at) + b[at + 2] * 60000;
    // [lap time, lap valid, sector 1, sector 2, sector 3, validity flags (bit 1-3: each sector)]
    if (ms) laps.push([ms, b[o + 13] & 1, sec(o + 4), sec(o + 7), sec(o + 10), b[o + 13]]);
  }
  const stints = [];
  for (let k = 0; k < ns; k++) { const o = HEADER + 7 + 1400 + k * 3; stints.push({ end: b[o], actual: b[o + 1], visual: b[o + 2] }); }
  return { car, laps, stints };
}

module.exports = function createTelemetry({ onResult, onStatus, onLive = () => {} }) {
  let sock = null; let cfg = { enabled: false, port: 20778 };
  const st = { listening: false, error: null, packets: 0, lastAt: null, format: null, session: null };
  const sessions = new Map();
  const status = () => ({ ...cfg, ...st });
  let statusTimer = null;
  const pushStatus = () => { if (statusTimer) return; statusTimer = setTimeout(() => { statusTimer = null; onStatus(status()); }, 1000); };
  const sessionOf = (h) => {
    let s = sessions.get(h.uid);
    if (!s) {
      s = { uid: h.uid, format: h.format, info: null, parts: null, laps: {}, stints: {}, penalties: [], retirements: [], final: null, timer: null, sent: false, seen: Date.now(),
        curLap: [], wearNow: [], wear: {}, gridSent: false, pos: [], collisions: [], pit: [], live: [], overtakes: [], swaps: [], lead: [], leadFin: [],
        body: null, damage: [], sc: { now: 0, sc: 0, vsc: 0, periods: [] } };
      sessions.set(h.uid, s);
      for (const [k, v] of sessions) if (Date.now() - v.seen > 6 * 3600e3) sessions.delete(k); // forget sessions from hours ago
    }
    s.player = h.player; s.seen = Date.now();
    return s;
  };
  // Every pass as it happens, anywhere on the lap: two cars swapping places between one lap data packet and the next
  // (the game sends them many times a second). The game's own overtake event stands in if a session never shows a
  // swap. Passes in or out of the pit lane, or of a car that has stopped, don't count. A pass counts once it has held
  // for 2 s: retaken sooner, it was the timing flickering and both cancel out; retaken later, the two are racing
  // wheel to wheel and both count.
  const FLICKER = 2;
  function pass(s, list, a, b, t) {
    if (a === b || a == null || b == null || s.pit[a] || s.pit[b] || s.live[a] === false || s.live[b] === false) return;
    for (let k = list.length - 1; k >= 0 && t - list[k].t < FLICKER; k--) {
      const x = list[k];
      if (x.a === b && x.b === a) { list.splice(k, 1); return; } // straight back again: noise
      if (x.a === a && x.b === b) return; // the same pass, reported twice
    }
    list.push({ a, b, t, lap: s.curLap[a] || 0 });
  }
  // Your car only: every lap data packet adds a sample (throttle, brake, speed, ERS store, mode, deployed
  // and harvested so far this lap, MGU-K power, position) to the 20 m slice of the lap you're in.
  function logErs(s, c) {
    if (c?.pit && c.lap) ((s.ers ||= {})[c.lap] ||= { bins: {}, invalid: false }).pit = true; // a stop: not a lap to measure the race on
    if (!c || !s.tel || !s.stat || c.dist < 0 || c.pit || !c.lap) return;
    const lap = (s.ers ||= {})[c.lap] ||= { bins: {}, invalid: false };
    const o = lap.bins[Math.floor(c.dist / ERS_BIN)] ||= { n: 0, thr: 0, brk: 0, spd: 0, ers: 0, pw: 0, nm: 0, x: 0, z: 0, modes: {} };
    o.n++; o.thr += s.tel.thr; o.brk += s.tel.brk; o.spd += s.tel.spd; o.ers += s.stat.ers; o.pw += s.stat.mguk;
    o.dep = s.stat.dep; o.harv = s.stat.harv; if (s.stat.limit) o.limit = s.stat.limit; o.modes[s.stat.mode] = (o.modes[s.stat.mode] || 0) + 1;
    // DRS (or, under the 2026 rules, straight-mode aero) open, and within a second of the car ahead (the slipstream):
    // kept apart, since which one matters depends on the season's rules
    if (s.tel.drs) o.drs = 1;
    if (c.front > 0 && c.front < 1000) o.close = 1;
    if (s.mot) { o.nm++; o.x += s.mot.x; o.z += s.mot.z; }
    if (c.invalid) lap.invalid = true;
  }
  /** The ERS profile, packed: per lap one array per measure (one value per slice), and the track outline. */
  function packErs(s) {
    if (!s.ers || !s.info?.trackLength) return null;
    const nb = Math.ceil(s.info.trackLength / ERS_BIN); const r = (v, k = 1) => v == null ? null : Math.round(v * k) / k;
    const laps = []; const mx = Array(nb).fill(0), mz = Array(nb).fill(0), mn = Array(nb).fill(0);
    for (const [lapNo, lap] of Object.entries(s.ers)) {
      const have = Object.keys(lap.bins).length; if (have < nb * 0.8) continue; // a partial lap (out-lap, or the session ended)
      const col = (fn) => Array.from({ length: nb }, (_, i) => { const o = lap.bins[i]; return o ? fn(o) : null; });
      laps.push({ lap: +lapNo, invalid: lap.invalid, ...(lap.pit ? { pit: true } : {}),
        thr: col(o => Math.round(o.thr / o.n * 100)), brk: col(o => Math.round(o.brk / o.n * 100)), spd: col(o => Math.round(o.spd / o.n)),
        ers: col(o => Math.round(o.ers / o.n / 1000)), dep: col(o => Math.round(o.dep / 1000)), limit: col(o => o.limit ? Math.round(o.limit / 1000) : null), harv: col(o => Math.round(o.harv / 1000)), pw: col(o => Math.round(o.pw / o.n / 1000)),
        mode: col(o => +Object.entries(o.modes).sort((a, b) => b[1] - a[1])[0][0]), drs: col(o => o.drs ? 1 : 0), close: col(o => o.close ? 1 : 0) });
      for (let i = 0; i < nb; i++) { const o = lap.bins[i]; if (o?.nm) { mx[i] += o.x / o.nm; mz[i] += o.z / o.nm; mn[i]++; } }
    }
    if (!laps.length) return null;
    const diag = s.diag ? { format: s.diag.format, player: s.diag.player, lens: s.diag.lens, raw: s.diag.raw } : null;
    // v: how this version reads the packets (3: the 2026 record sizes and status layout)
    return { v: 3, player: s.player, bin: ERS_BIN, length: s.info.trackLength, laps, diag, map: mx.map((x, i) => mn[i] ? [r(x / mn[i], 10), r(mz[i] / mn[i], 10)] : null) };
  }
  /** In a race: your battery now (every second), and the whole profile when a new lap starts. */
  function live(s, c) {
    if (!c || !s.info || !raceType(s.info.sessionType)) return;
    const now = Date.now(); const newLap = c.lap !== s.liveLap;
    if (!newLap && now - (s.liveAt || 0) < LIVE_MS) return;
    s.liveAt = now;
    const msg = { uid: s.uid, format: s.format, sessionType: s.info.sessionType, track: s.info.track, weekend: s.info.weekend, totalLaps: s.info.totalLaps,
      lap: c.lap, dist: Math.round(c.dist), pit: !!c.pit, store: s.stat ? Math.round(s.stat.ers / 1000) : null, mode: s.stat?.mode ?? null,
      dep: s.stat ? Math.round(s.stat.dep / 1000) : null, limit: s.stat?.limit ? Math.round(s.stat.limit / 1000) : null, at: new Date().toISOString() };
    if (newLap) { s.liveLap = c.lap; msg.pack = packErs(s); }
    onLive(msg);
  }
  function emit(s) {
    if (s.sent || !s.final || !s.info) return;
    s.sent = true;
    const parts = s.parts || [];
    // the lap that was running at the end
    s.curLap.forEach((lap, i) => { if (lap && s.wearNow[i] != null && (s.wear[i] ||= [])[lap - 1] == null) s.wear[i][lap - 1] = Math.round(s.wearNow[i] * 10) / 10; });
    // contact and what came of it: damage within a second of it, a retirement within a lap of it
    for (const x of s.collisions) {
      x.dmg = [...new Set(s.damage.filter(d => (d.car === x.a || d.car === x.b) && d.t >= x.t - 0.2 && d.t <= x.t + 1).map(d => d.car))];
      x.out = null;
    }
    // a retirement is put down to the last contact that car had, if it came within a lap of it
    for (const r of s.retirements) { if (r.t == null) continue; const x = s.collisions.filter(o => (o.a === r.car || o.b === r.car) && o.t <= r.t && r.lap <= o.lap + 1).pop(); if (x) x.out = r.car; }
    const open = s.sc.periods[s.sc.periods.length - 1]; if (open && open.to == null) open.to = s.curLap[s.player] || null;
    const cars = s.final.filter(x => x.position > 0).map(x => {
      const p = parts.find(q => q.idx === x.idx) || {};
      // the stint still running at the flag (or when the car stopped) ends on lap 255: it really ends on the car's last lap
      const stints = (s.stints[x.idx]?.length ? s.stints[x.idx] : x.stints).map(t => ({ ...t, end: Math.min(t.end, x.laps || t.end) }));
      return { ...x, name: p.name || '', number: p.number || 0, team: p.team ?? null, myTeam: !!p.myTeam, ai: p.ai !== false, driver: p.driver ?? null,
        lapTimes: s.laps[x.idx] || [], stints, wear: s.wear[x.idx] || [], leadGap: s.leadFin[x.idx] ?? null };
    });
    onResult({ key: `${s.uid}:${s.info.sessionType}`, uid: s.uid, format: s.format, at: new Date().toISOString(), player: s.player, ...s.info, cars,
      penaltyEvents: s.penalties, retirements: s.retirements, collisions: s.collisions,
      tyreSets: s.tyreSets || null,
      safetyCars: Math.max(s.info.safetyCars || 0, s.sc.sc), virtualSafetyCars: Math.max(s.info.virtualSafetyCars || 0, s.sc.vsc), scPeriods: s.sc.periods,
      overtakes: s.swaps.length ? s.swaps : s.overtakes, passSource: s.swaps.length ? 'positions' : s.overtakes.length ? 'event' : null,
      ers: ersSession(s.info) ? packErs(s) : null });
  }
  function onPacket(b) {
    if (b.length < HEADER) return;
    const h = header(b);
    if (h.format < 2025 || h.format > 2030) return; // not F1 25
    st.packets++; st.lastAt = new Date().toISOString(); st.format = h.format;
    const L = layout(h.format);
    if (!Object.values(PACKET).includes(h.type)) { pushStatus(); return; }
    const s = sessionOf(h);
    if (h.type === PACKET.SESSION) {
      const info = parseSession(b); if (!info) return;
      s.info = info; st.session = { track: info.track, sessionType: info.sessionType, gameMode: info.gameMode };
      // safety cars, counted as they come out (the game's own count at the end has been seen to stay at zero)
      const sc = info.safetyCarNow === 1 || info.safetyCarNow === 2 ? info.safetyCarNow : 0;
      if (sc !== s.sc.now) {
        const lap = s.curLap[h.player] || 0; const open = s.sc.periods[s.sc.periods.length - 1];
        if (open && open.to == null) open.to = lap;
        if (sc) { s.sc[sc === 1 ? 'sc' : 'vsc']++; s.sc.periods.push({ kind: sc === 1 ? 'sc' : 'vsc', from: lap, to: null }); }
        s.sc.now = sc;
      }
    } else if (h.type === PACKET.PARTICIPANTS) {
      // keep every car seen this session: a later packet may leave some out
      const byIdx = new Map((s.parts || []).map(p => [p.idx, p]));
      for (const p of parseParticipants(b, L)) byIdx.set(p.idx, p);
      s.parts = [...byIdx.values()].sort((a, b) => a.idx - b.idx);
    }
    if (ersSession(s.info) && (h.type === PACKET.MOTION || h.type === PACKET.TELEMETRY || h.type === PACKET.STATUS || h.type === PACKET.LAP)) {
      // a few whole packets, 20 s apart, while you're on track and flat out (not in the garage), for the diagnostics
      const D = s.diag ||= { format: h.format, player: h.player, lens: {}, raw: {}, last: {} };
      D.lens[h.type] = b.length; D.player = h.player;
      const list = D.raw[h.type] ||= [];
      if (list.length < 4 && h.time - (D.last[h.type] ?? -99) > 20 && (s.tel?.spd || 0) > 150 && !s.pit[h.player]) { D.last[h.type] = h.time; list.push({ t: Math.round(h.time * 10) / 10, b64: b.toString('base64') }); }
    }
    if (h.type === PACKET.MOTION) s.mot = playerMotion(b, L, h.player) || s.mot;
    else if (h.type === PACKET.TELEMETRY) s.tel = playerTelemetry(b, L, h.player) || s.tel;
    else if (h.type === PACKET.STATUS) s.stat = playerStatus(b, L, h.player) || s.stat;
    else if (h.type === PACKET.TYRE_SETS) { const x = parseTyreSets(b); if (x && x.car === h.player) s.tyreSets = { sets: x.sets, fitted: x.fitted }; }
    else if (h.type === PACKET.HISTORY) { const x = parseHistory(b); if (x) { s.laps[x.car] = x.laps; s.stints[x.car] = x.stints; } }
    else if (h.type === PACKET.DAMAGE) {
      s.wearNow = parseWear(b, L);
      const body = parseBodyDamage(b, L);
      if (s.body) body.forEach((v, i) => { if (v - (s.body[i] || 0) >= 2) s.damage.push({ car: i, t: h.time }); });
      s.body = body;
    }
    else if (h.type === PACKET.LAP) {
      const lap = parseLapData(b, L);
      const before = s.pos.slice();
      lap.forEach((c, i) => {
        // a new lap: note the tyre wear at the end of the one just finished
        if (s.curLap[i] && c.lap > s.curLap[i] && s.wearNow[i] != null) (s.wear[i] ||= [])[s.curLap[i] - 1] = Math.round(s.wearNow[i] * 10) / 10;
        s.curLap[i] = c.lap; s.pos[i] = c.pos; s.pit[i] = c.pit; s.live[i] = c.status === 2;
        // the gap to the leader as the car takes the flag (the game's own interval, so a lapped car has one too)
        if (c.status === 2 && c.lead) s.lead[i] = c.lead;
        else if (c.status === 3 && s.leadFin[i] == null) s.leadFin[i] = c.lead || s.lead[i] || null;
      });
      if (ersSession(s.info)) { logErs(s, lap[h.player]); live(s, lap[h.player]); }
      // two cars that swapped places since the last packet (a stand-in for the overtake event)
      const race = s.info && (s.info.sessionType === 15 || s.info.sessionType === 16);
      if (race) lap.forEach((c, i) => {
        const was = before[i]; if (!was || !c.pos || c.pos >= was) return;
        const j = lap.findIndex((o, k) => k !== i && before[k] === c.pos && o.pos === was);
        if (j >= 0) pass(s, s.swaps, i, j, h.time);
      });
      // a race or sprint has started: the starting grid settles qualifying (whoever was eliminated, whatever was simulated)
      const n = s.parts?.length || 0;
      if (!s.gridSent && s.info && (s.info.sessionType === 15 || s.info.sessionType === 16) && n && lap.slice(0, n).every(c => c.grid > 0)) {
        s.gridSent = true;
        onResult({ kind: 'grid', key: `${s.uid}:grid`, uid: s.uid, at: new Date().toISOString(), player: s.player, ...s.info,
          cars: s.parts.map(p => ({ idx: p.idx, name: p.name, number: p.number, team: p.team, grid: lap[p.idx]?.grid || 0 })) });
      }
    }
    else if (h.type === PACKET.EVENT) {
      const code = b.toString('ascii', HEADER, HEADER + 4);
      if (code === 'PENA' && b.length >= HEADER + 11) s.penalties.push({ type: b[33], infringement: b[34], car: b[35], other: b[36], time: b[37], lap: b[38], places: b[39], t: h.time });
      else if (code === 'COLL' && b.length >= HEADER + 6) {
        // the game reports contact every frame it lasts: keep one per pair every 10 seconds, with who was ahead
        const a = b[33], c2 = b[34]; const last = s.collisions.find(x => ((x.a === a && x.b === c2) || (x.a === c2 && x.b === a)) && h.time - x.t < 10);
        if (!last && a !== c2) s.collisions.push({ a, b: c2, t: h.time, lap: s.curLap[a] || 0, posA: s.pos[a] || 0, posB: s.pos[c2] || 0 });
      }
      else if (code === 'OVTK' && b.length >= HEADER + 6) pass(s, s.overtakes, b[33], b[34], h.time);
      else if (code === 'RTMT' && b.length >= HEADER + 6) s.retirements.push({ car: b[33], reason: b[34], t: h.time, lap: s.curLap[b[33]] || 0 });
    } else if (h.type === PACKET.FINAL) {
      s.final = parseFinal(b, L);
      clearTimeout(s.timer); s.timer = setTimeout(() => emit(s), SETTLE_MS);
      if (raceType(s.info?.sessionType)) onLive({ uid: s.uid, done: true });
    }
    pushStatus();
  }
  function stop() {
    if (sock) { try { sock.close(); } catch { } sock = null; }
    st.listening = false;
  }
  function start() {
    stop(); st.error = null;
    if (!cfg.enabled) { onStatus(status()); return status(); }
    sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('message', (b) => { try { onPacket(b); } catch (e) { st.error = 'A packet could not be read: ' + e.message; } });
    sock.on('error', (e) => { st.error = e.code === 'EADDRINUSE' ? `Port ${cfg.port} is already in use by another app. Pick another port, and forward to it.` : e.message; stop(); onStatus(status()); });
    sock.on('listening', () => { st.listening = true; onStatus(status()); });
    sock.bind(cfg.port, '0.0.0.0');
    return status();
  }
  return {
    configure(next = {}) { cfg = { enabled: !!next.enabled, port: Math.max(1024, Math.min(65535, +next.port || 20778)) }; return start(); },
    status,
    stop,
    // test hook: feed a raw packet as if it arrived over the network
    _feed: onPacket,
  };
};
