// Builds F1 25 UDP packets to the published layout and sends a whole race (or qualifying) to Pitwall's listener.
//   node scripts/fake-f1-session.js <port> <format 2025|2026> <race|quali>   (sends to a running Pitwall)
// Also runs the listener in-process when out.json is given, and writes the result it produced.
const dgram = require('dgram');
const path = require('path');
const fs = require('fs');
const [port = 20799, format = 2025, kind = 'race', outFile] = process.argv.slice(2).map((v, i) => i < 2 ? +v : v);
const wide = format >= 2026, CARS = wide ? 24 : 22, PART = wide ? 60 : 57;
const uid = BigInt(Date.now());
const grid = [ // name, number, team id
  ['Lando Norris', 4, 8], ['Oscar Piastri', 81, 8], ['Charles Leclerc', 16, 1], ['Lewis Hamilton', 44, 1], ['Max Verstappen', 1, 2], ['Yuki Tsunoda', 22, 2],
  ['George Russell', 63, 0], ['Kimi Antonelli', 12, 0], ['Fernando Alonso', 14, 4], ['Lance Stroll', 18, 4], ['Pierre Gasly', 10, 5], ['Franco Colapinto', 43, 5],
  ['Alexander Albon', 23, 3], ['Test Driver', 27, 3], ['Isack Hadjar', 6, 6], ['Liam Lawson', 30, 6], ['Esteban Ocon', 31, 7], ['Oliver Bearman', 87, 7],
  ['Nico Hulkenberg', 27, 9], ['Gabriel Bortoleto', 5, 9],
];
const PLAYER = 13; // "Test Driver" at Williams
function header(type, size) {
  const b = Buffer.alloc(size);
  b.writeUInt16LE(format, 0); b[2] = format - 2000; b[3] = 1; b[4] = 10; b[5] = 1; b[6] = type;
  b.writeBigUInt64LE(uid, 7); b.writeFloatLE(100, 15); b.writeUInt32LE(1, 19); b.writeUInt32LE(1, 23); b[27] = PLAYER; b[28] = 255;
  return b;
}
const sessionType = kind === 'race' ? 15 : 8;
function session() {
  const b = header(1, wide ? 926 : 753);
  b[32] = kind === 'race' ? 29 : 0; b.writeUInt16LE(5278, 33); b[35] = sessionType; b.writeInt8(0, 36); // Melbourne
  b.writeUInt32LE(111, 670); b.writeUInt32LE(222, 674); b.writeUInt32LE(333, 678);
  b[694] = 28; b[700] = 3; b[705] = 1; b[706] = 1; b[707] = 0; // driver career, short, one SC, one VSC
  b[732] = 3; b[733] = 1; b[734] = 8; b[735] = 15; // weekend: practice, short quali, race
  return b;
}
function participants() {
  const b = header(4, 29 + 1 + CARS * PART); b[29] = grid.length;
  grid.forEach(([name, num, team], i) => {
    const o = 30 + i * PART;
    b[o] = i === PLAYER ? 0 : 1;
    if (wide) { b.writeUInt16LE(i, o + 1); b.writeUInt16LE(team, o + 5); b[o + 7] = 0; b[o + 8] = num; b[o + 9] = 10; b.write(name, o + 10, 'utf8'); }
    else { b[o + 1] = i; b[o + 3] = team; b[o + 4] = 0; b[o + 5] = num; b[o + 6] = 10; b.write(name, o + 7, 'utf8'); }
  });
  return b;
}
// finishing order: index order, except Verstappen 2nd and Ocon retiring; Gasly gets a 5 s penalty
const order = [0, 4, 2, 1, 3, 6, 7, 5, 8, 13, 10, 9, 12, 11, 14, 15, 17, 18, 19, 16];
const raceTime = (pos) => 5400 + pos * 3.217; // seconds
function final() {
  const b = header(8, 29 + 1 + CARS * 46); b[29] = grid.length;
  order.forEach((car, k) => {
    const o = 30 + car * 46; const out = car === 16;
    b[o] = k + 1; b[o + 1] = out ? 12 : car === 19 ? 28 : 29; b[o + 2] = car + 1; b[o + 3] = 0; b[o + 4] = out ? 0 : 1;
    b[o + 5] = out ? 7 : 3; b[o + 6] = out ? 8 : 2;
    b.writeUInt32LE(kind === 'race' ? 81000 + car * 70 : 79000 + k * 95 + (car === 13 ? 7 : 0), o + 7);
    b.writeDoubleLE(kind === 'race' ? raceTime(k) - (car === 10 ? 5 : 0) : 0, o + 11);
    b[o + 19] = car === 10 ? 5 : 0; b[o + 20] = car === 10 ? 1 : 0;
    if (kind === 'race') { b[o + 21] = 2; b[o + 22] = 17; b[o + 23] = 18; b[o + 30] = 17; b[o + 31] = 18; b[o + 38] = 14; b[o + 39] = 29; }
  });
  return b;
}
function history(car) {
  const b = header(11, 1460); b[29] = car; const n = car === 16 ? 12 : 29; b[30] = n; b[31] = 2;
  for (let k = 0; k < n; k++) {
    const o = 36 + k * 14; let ms = 82000 + car * 90 + (k === 0 ? 4000 : 0) + (k === 13 || k === 14 ? 20000 : 0) + (k === 20 ? 30000 : 0);
    b.writeUInt32LE(ms, o); b[o + 13] = 1;
  }
  const so = 36 + 1400; b[so] = 14; b[so + 1] = 17; b[so + 2] = 17; b[so + 3] = 29; b[so + 4] = 18; b[so + 5] = 18;
  return b;
}
function event(code, details) { const b = header(3, 45); b.write(code, 29, 'ascii'); details.forEach((v, i) => { b[33 + i] = v; }); return b; }

const packets = [session(), participants(), event('SSTA', [])];
if (kind === 'race') { packets.push(event('PENA', [4, 7, 10, 255, 5, 9, 0]), event('RTMT', [16, 8])); for (let i = 0; i < grid.length; i++) packets.push(history(i)); }
packets.push(final());
if (kind === 'race') for (let i = 0; i < grid.length; i++) packets.push(history(i));
packets.push(event('SEND', []));

if (outFile) {
  const createTelemetry = require(path.resolve(process.argv[6] || 'telemetry.js'));
  const t = createTelemetry({ onResult: (r) => { fs.writeFileSync(outFile, JSON.stringify(r)); console.log('result:', r.key, r.cars.length, 'cars'); process.exit(0); }, onStatus: (st) => { if (st.listening && !sent) { sent = true; send(); } if (st.error) { console.log('error', st.error); process.exit(1); } } });
  var sent = false;
  t.configure({ enabled: true, port });
  setTimeout(() => { console.log('no result'); process.exit(1); }, 8000);
} else send();
function send() {
  const s = dgram.createSocket('udp4'); let i = 0;
  const next = () => { if (i >= packets.length) { s.close(); return; } s.send(packets[i++], port, '127.0.0.1', next); };
  next();
}
