/*
  Race replays. Every race driven with telemetry on is recorded from the live feed, a sample a second: each car's
  position, lap, gaps, tyres, wear and fuel, plus every lap time as it's set. A race is kept gzipped in the data
  folder (replays/), about half a megabyte for a 50% race, so a whole career fits. A race that never got going (under
  a minute of samples) isn't kept.
*/
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const SAVE_EVERY = 60e3; // ms: the race so far is written this often, so a crash loses at most a minute
const MIN_SAMPLES = 60;

module.exports = function createReplays(dir) {
  const folder = () => { const d = path.join(dir(), 'replays'); fs.mkdirSync(d, { recursive: true }); return d; };
  const indexFile = () => path.join(folder(), 'index.json');
  const fileOf = (key) => path.join(folder(), key.replace(/[^\w-]/g, '-') + '.json.gz');
  const readIndex = () => { try { return JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch { return []; } };
  const writeIndex = (list) => { const f = indexFile(); fs.writeFileSync(f + '.tmp', JSON.stringify(list)); fs.renameSync(f + '.tmp', f); };
  let rec = null; let writing = Promise.resolve(); let closed = false;

  function store(R, buf, final) {
    const f = fileOf(R.meta.key); fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f);
    writeIndex([...readIndex().filter(x => x.key !== R.meta.key), { ...R.meta, parts: undefined, bytes: buf.length, samples: R.samples.length, laps: Math.max(0, ...R.samples[R.samples.length - 1].f.map(x => x[2])), done: !!final }]);
  }
  function write(final) {
    const R = rec; if (!R) return;
    R.lastWrite = Date.now();
    if (final && R.samples.length < MIN_SAMPLES) return;
    const body = { meta: R.meta, samples: R.samples, laps: R.laps, fuel: R.fuel };
    writing = writing.then(() => new Promise((res) => zlib.gzip(JSON.stringify(body), (err, buf) => {
      if (!err && !closed) try { store(R, buf, final); } catch { /* the next write tries again */ }
      res();
    })));
  }
  /** As Pitwall closes: the race being recorded is written now, all at once, so a race saved and quit keeps its last minute. */
  function flush() {
    const R = rec; closed = true; if (!R?.samples.length) return;
    try { store(R, zlib.gzipSync(JSON.stringify({ meta: R.meta, samples: R.samples, laps: R.laps, fuel: R.fuel })), false); } catch { /* kept as last written */ }
  }

  /** A live message from the telemetry. */
  function onLive(m) {
    if (m.done) { if (rec && rec.uid === m.uid) { write(true); rec = null; } return; }
    if (!m.field?.length) return;
    const key = `${m.uid}:${m.sessionType}`;
    if (!rec || rec.meta.key !== key) {
      // a race saved mid-way and carried on comes back as a new session, past lap 1, with the same session link: the
      // recording carries on (from memory, or from disk if Pitwall was closed in between) under the new session's key
      const lead = Math.max(0, ...m.field.map(x => x.lap || 0));
      const same = (meta) => meta && meta.track === m.track && meta.sessionType === m.sessionType && meta.link && meta.link === m.link;
      let prev = lead > 1 && rec && same(rec.meta) ? rec : null;
      if (!prev && lead > 1 && m.link) {
        const old = readIndex().filter(x => same(x) && Date.now() - Date.parse(x.at || 0) < 48 * 3600e3).pop();
        if (old) try { const body = JSON.parse(zlib.gunzipSync(fs.readFileSync(fileOf(old.key))).toString('utf8'));
          prev = { uid: old.uid, start: Date.now(), lastWrite: Date.now(), samples: body.samples || [], laps: body.laps || {}, fuel: body.fuel || {}, last: {}, meta: { ...body.meta, key: old.key } };
          prev.shift = -((prev.samples[prev.samples.length - 1]?.t ?? -1) + 1); } catch { prev = null; }
      }
      if (prev) {
        const was = prev.meta.key; try { fs.unlinkSync(fileOf(was)); } catch { /* not written yet */ } writeIndex(readIndex().filter(x => x.key !== was));
        if (prev === rec) prev.shift = (Date.now() - prev.start) / 1000 - ((prev.samples[prev.samples.length - 1]?.t ?? -1) + 1);
        prev.uid = m.uid; prev.meta = { ...prev.meta, key, uid: m.uid }; rec = prev;
      } else if (rec) write(true);
    }
    if (!rec || rec.meta.key !== key) {
      rec = { uid: m.uid, start: Date.now(), lastWrite: Date.now(), samples: [], laps: {}, fuel: {}, last: {},
        meta: { key, uid: m.uid, sessionType: m.sessionType, track: m.track, weekend: m.weekend, link: m.link || null, totalLaps: m.totalLaps, at: new Date().toISOString() } };
    }
    const R = rec; R.meta.parts = m.parts; R.meta.player = m.player; R.meta.totalLaps = m.totalLaps || R.meta.totalLaps;
    // a flashback: the session clock went back, so the samples after that moment never happened; the replay carries
    // on from the last one kept, a second later, as if the race had simply gone on
    const last = R.samples[R.samples.length - 1];
    if (m.clock != null && last?.k != null && m.clock < last.k - 1) {
      while (R.samples.length && R.samples[R.samples.length - 1].k > m.clock) R.samples.pop();
      R.shift = (Date.now() - R.start) / 1000 - ((R.samples[R.samples.length - 1]?.t ?? -1) + 1);
    }
    const S = { t: Math.round(((Date.now() - R.start) / 1000 - (R.shift || 0)) * 10) / 10, k: m.clock ?? null, sc: m.sc || 0,
      f: m.field.map(x => [x.i, x.pos, x.lap, x.dist, x.gapL, x.gapF, x.pit ? 1 : 0, x.st, x.stops || 0, x.c ?? -1, x.age ?? -1, x.wear == null ? -1 : Math.round(x.wear * 10), x.fuel == null ? -1 : Math.round(x.fuel * 10)]) };
    // the weather and your tyre sets only when they change
    const w = JSON.stringify(m.weather || null); if (w !== R.last.w) { S.w = m.weather || null; R.last.w = w; }
    const ts = JSON.stringify(m.tyreSets || null); if (ts !== R.last.ts) { S.ts = m.tyreSets || null; R.last.ts = ts; }
    R.samples.push(S);
    // every lap time (and the fuel at the end of each lap) as the history comes in
    for (const x of m.field) {
      if (x.laps?.length && x.nLaps) { const first = x.nLaps - x.laps.length; const A = (R.laps[x.i] ||= []); x.laps.forEach((l, k) => { A[first + k] = l; }); }
      if (x.fuelLaps?.length && x.fuelN) { const first = x.fuelN - x.fuelLaps.length; const A = (R.fuel[x.i] ||= []); x.fuelLaps.forEach((v, k) => { A[first + k] = v; }); }
    }
    if (Date.now() - R.lastWrite > SAVE_EVERY) write(false);
  }

  return {
    onLive,
    flush,
    list: () => readIndex().filter(x => fs.existsSync(fileOf(x.key))),
    load: (key) => new Promise((res) => fs.readFile(fileOf(key), (err, buf) => { if (err) return res(null); zlib.gunzip(buf, (e2, out) => res(e2 ? null : JSON.parse(out.toString('utf8')))); })),
    remove: (key) => { try { fs.unlinkSync(fileOf(key)); } catch { /* already gone */ } writeIndex(readIndex().filter(x => x.key !== key)); return true; },
  };
};
