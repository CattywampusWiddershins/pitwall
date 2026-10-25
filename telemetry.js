// F1 25 telemetry: listens for the game's UDP packets, straight from the game or forwarded by another app (a wheel
// base's software, say), and turns each finished session into a result Pitwall can log. Packet layouts follow EA's
// F1 25 UDP specification: packet format 2025 for the base game (22 cars), 2026 for the 2026 Season Pack (24 cars,
// wider driver/team ids). Only what Pitwall uses is read: session, participants, events, session history and the
// final classification.
const dgram = require('dgram');

const PACKET = { SESSION: 1, EVENT: 3, PARTICIPANTS: 4, FINAL: 8, HISTORY: 11 };
const HEADER = 29;
const layout = (format) => format >= 2026 ? { cars: 24, part: 60, wide: true } : { cars: 22, part: 57, wide: false };
const SETTLE_MS = 2500; // after the final classification the game sends every car's lap history once more

function header(b) {
  return { format: b.readUInt16LE(0), year: b.readUInt8(2), type: b.readUInt8(6), uid: b.readBigUInt64LE(7).toString(), player: b.readUInt8(27) };
}
const cstr = (b, from, len) => { const end = b.indexOf(0, from); return b.toString('utf8', from, end < 0 || end > from + len ? from + len : end).trim(); };

function parseSession(b) {
  if (b.length < 753) return null;
  return {
    totalLaps: b.readUInt8(32), trackLength: b.readUInt16LE(33), sessionType: b.readUInt8(35), track: b.readInt8(36),
    gameMode: b.readUInt8(694), sessionLength: b.readUInt8(700),
    seasonLink: b.readUInt32LE(670), weekendLink: b.readUInt32LE(674), sessionLink: b.readUInt32LE(678),
    safetyCars: b.readUInt8(705), virtualSafetyCars: b.readUInt8(706), redFlags: b.readUInt8(707),
    weekend: [...b.subarray(733, 733 + b.readUInt8(732))],
  };
}
function parseParticipants(b, L) {
  const n = b.readUInt8(HEADER); const out = [];
  for (let i = 0; i < Math.min(n, L.cars); i++) {
    const o = HEADER + 1 + i * L.part;
    if (o + L.part > b.length) break;
    out.push(L.wide
      ? { idx: i, ai: !!b[o], driver: b.readUInt16LE(o + 1), team: b.readUInt16LE(o + 5), myTeam: !!b[o + 7], number: b[o + 8], nationality: b[o + 9], name: cstr(b, o + 10, 32) }
      : { idx: i, ai: !!b[o], driver: b[o + 1], team: b[o + 3], myTeam: !!b[o + 4], number: b[o + 5], nationality: b[o + 6], name: cstr(b, o + 7, 32) });
  }
  return out;
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
function parseHistory(b) {
  if (b.length < 1460) return null;
  const car = b[HEADER], n = Math.min(b[HEADER + 1], 100), ns = Math.min(b[HEADER + 2], 8);
  const laps = [];
  for (let k = 0; k < n; k++) {
    const o = HEADER + 7 + k * 14; const ms = b.readUInt32LE(o);
    if (ms) laps.push([ms, b[o + 13] & 1]); // [lap time, lap valid]
  }
  const stints = [];
  for (let k = 0; k < ns; k++) { const o = HEADER + 7 + 1400 + k * 3; stints.push({ end: b[o], actual: b[o + 1], visual: b[o + 2] }); }
  return { car, laps, stints };
}

module.exports = function createTelemetry({ onResult, onStatus }) {
  let sock = null; let cfg = { enabled: false, port: 20778 };
  const st = { listening: false, error: null, packets: 0, lastAt: null, format: null, session: null };
  const sessions = new Map();
  const status = () => ({ ...cfg, ...st });
  let statusTimer = null;
  const pushStatus = () => { if (statusTimer) return; statusTimer = setTimeout(() => { statusTimer = null; onStatus(status()); }, 1000); };
  const sessionOf = (h) => {
    let s = sessions.get(h.uid);
    if (!s) {
      s = { uid: h.uid, format: h.format, info: null, parts: null, laps: {}, stints: {}, penalties: [], retirements: [], final: null, timer: null, sent: false, seen: Date.now() };
      sessions.set(h.uid, s);
      for (const [k, v] of sessions) if (Date.now() - v.seen > 6 * 3600e3) sessions.delete(k); // forget sessions from hours ago
    }
    s.player = h.player; s.seen = Date.now();
    return s;
  };
  function emit(s) {
    if (s.sent || !s.final || !s.info) return;
    s.sent = true;
    const parts = s.parts || [];
    const cars = s.final.filter(x => x.position > 0).map(x => {
      const p = parts.find(q => q.idx === x.idx) || {};
      return { ...x, name: p.name || '', number: p.number || 0, team: p.team ?? null, myTeam: !!p.myTeam, ai: p.ai !== false, driver: p.driver ?? null,
        lapTimes: s.laps[x.idx] || [], stints: s.stints[x.idx]?.length ? s.stints[x.idx] : x.stints };
    });
    onResult({ key: `${s.uid}:${s.info.sessionType}`, uid: s.uid, format: s.format, at: new Date().toISOString(), player: s.player, ...s.info, cars,
      penaltyEvents: s.penalties, retirements: s.retirements });
  }
  function onPacket(b) {
    if (b.length < HEADER) return;
    const h = header(b);
    if (h.format < 2025 || h.format > 2030) return; // not F1 25
    st.packets++; st.lastAt = new Date().toISOString(); st.format = h.format;
    const L = layout(h.format);
    if (![PACKET.SESSION, PACKET.EVENT, PACKET.PARTICIPANTS, PACKET.FINAL, PACKET.HISTORY].includes(h.type)) { pushStatus(); return; }
    const s = sessionOf(h);
    if (h.type === PACKET.SESSION) {
      const info = parseSession(b); if (!info) return;
      s.info = info; st.session = { track: info.track, sessionType: info.sessionType, gameMode: info.gameMode };
    } else if (h.type === PACKET.PARTICIPANTS) s.parts = parseParticipants(b, L);
    else if (h.type === PACKET.HISTORY) { const x = parseHistory(b); if (x) { s.laps[x.car] = x.laps; s.stints[x.car] = x.stints; } }
    else if (h.type === PACKET.EVENT) {
      const code = b.toString('ascii', HEADER, HEADER + 4);
      if (code === 'PENA' && b.length >= HEADER + 11) s.penalties.push({ type: b[33], infringement: b[34], car: b[35], other: b[36], time: b[37], lap: b[38], places: b[39] });
      else if (code === 'RTMT' && b.length >= HEADER + 6) s.retirements.push({ car: b[33], reason: b[34] });
    } else if (h.type === PACKET.FINAL) {
      s.final = parseFinal(b, L);
      clearTimeout(s.timer); s.timer = setTimeout(() => emit(s), SETTLE_MS);
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
