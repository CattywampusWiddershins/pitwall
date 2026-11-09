// Builds src/world.js for the World Map: the countries (Natural Earth 1:50m, from the world-atlas package), each one's
// two-letter code, and every circuit a world championship race was held at since 1950 (from the raw results that
// scripts/fetch-history.js downloaded): where it is, the years and number of Grands Prix, and its most frequent winners.
// Also copies the small map libraries (d3-geo, d3-array, topojson-client) into src/vendor.
//   node scripts/build-world.js <folder with node_modules holding d3-geo, d3-array, topojson-client, world-atlas, i18n-iso-countries>
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const M = require('./history-meta');
const mods = path.join(process.argv[2] || path.join(__dirname, '..'), 'node_modules');
const RAW = path.join(__dirname, '..', 'data-raw'); const SRC = path.join(__dirname, '..', 'src');

// the countries, with their codes (ISO numeric → two letters, lower case like the flags)
const topo = JSON.parse(fs.readFileSync(path.join(mods, 'world-atlas', 'countries-50m.json'), 'utf8'));
// and the coarser 1:110m shapes, drawn while the globe is moving (a quarter of the points)
const low = JSON.parse(fs.readFileSync(path.join(mods, 'world-atlas', 'countries-110m.json'), 'utf8'));
for (const g of low.objects.countries.geometries) g.properties = {};
const iso = require(path.join(mods, 'i18n-iso-countries'));
const code = {};
for (const g of topo.objects.countries.geometries) { const a2 = g.id && iso.numericToAlpha2(g.id); if (a2) code[g.id] = a2.toLowerCase(); g.properties = { name: g.properties.name }; }
// Kosovo and Northern Cyprus have no numeric code in the atlas
for (const g of topo.objects.countries.geometries) if (!g.id) { if (g.properties.name === 'Kosovo') { g.id = 'XK'; code.XK = 'xk'; } }

// every race's circuit, from the results
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['data.js', 'reference.js', 'assets.js']) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx);
const A = ctx.window.F1ASSETS;
const COUNTRY_FIX = { UK: 'gb', USA: 'us', 'United States': 'us', Switzerland: 'ch', Morocco: 'ma', Sweden: 'se', UAE: 'ae', Korea: 'kr', Russia: 'ru' };
const cc = (country) => COUNTRY_FIX[country] || A.country[country] || null;
const C = {};
const files = fs.readdirSync(RAW).filter(f => /^\d{4}_results\.json/.test(f)).sort();
const seen = new Set();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  for (const r of j.MRData.RaceTable.Races) {
    const k = `${r.season}:${r.round}`; const ci = r.Circuit; const o = C[ci.circuitId] ||= { id: ci.circuitId, name: ci.circuitName, loc: ci.Location.locality, country: ci.Location.country, cc: cc(ci.Location.country), lat: +ci.Location.lat, lon: +ci.Location.long, years: [], races: [], wins: {} };
    if (seen.has(k)) continue; seen.add(k); // a season's results come in pages: each race once
    o.years.push(+r.season); o.races.push(r.raceName);
    const lapsRun = +r.Results[0]?.laps || 0; if (lapsRun) o.laps = lapsRun; // (each race replaces the one before: the latest stands)
    for (const x of r.Results) { const t = x.FastestLap?.Time?.time; if (!t) continue; const m = /^(\d+):(\d+\.\d+)$/.exec(t); const ms = m ? (+m[1] * 60 + +m[2]) * 1000 : null; if (ms && (!o.rec || ms < o.rec.ms)) o.rec = { ms, time: t, name: `${x.Driver.givenName} ${x.Driver.familyName}`, year: +r.season }; }
    const w = r.Results.find(x => x.position === '1'); if (w) { const n = `${w.Driver.givenName} ${w.Driver.familyName}`; o.wins[n] = (o.wins[n] || 0) + 1; o.last = { year: +r.season, name: n, race: r.raceName }; }
  }
}
const circuits = Object.values(C).map(o => {
  const years = [...new Set(o.years)].sort((a, b) => a - b);
  const top = Object.entries(o.wins).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const names = Object.entries(o.races.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  return { id: o.id, name: o.name, loc: o.loc, country: o.country, cc: o.cc, lat: Math.round(o.lat * 1e4) / 1e4, lon: Math.round(o.lon * 1e4) / 1e4, gps: o.years.length, first: years[0], last: years[years.length - 1], years, track: M.TRACK_IDS[o.id] || null, top, lastWin: o.last || null, races: names.slice(0, 3), laps: o.laps || null, record: o.rec ? [o.rec.time, o.rec.name, o.rec.year] : null };
}).sort((a, b) => b.gps - a.gps);
// each circuit's outline and lap length, from bacinger/f1-circuits (MIT, data-raw/circuits): the outline nearest a
// circuit's location (within 4 km), drawn as the circuit maps are (scripts/build-assets.js), for a track added from it
const GEO = JSON.parse(fs.readFileSync(path.join(RAW, 'circuits', 'f1-circuits.geojson'), 'utf8'));
function outline(coords) {
  const lat0 = coords.reduce((a, c) => a + c[1], 0) / coords.length * Math.PI / 180;
  const pts = coords.map(([lon, lat]) => [lon * Math.cos(lat0), -lat]); const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys); const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY; const k = 92 / Math.max(w, h);
  const ox = (100 - w * k) / 2, oy = (100 - h * k) / 2; const sc = pts.map(([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k]);
  const kept = [sc[0]]; for (const q of sc.slice(1)) { const r = kept[kept.length - 1]; if (Math.hypot(q[0] - r[0], q[1] - r[1]) >= 0.6) kept.push(q); }
  return 'M' + kept.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L') + 'Z';
}
const km = (a, b) => { const R = 6371, d = Math.PI / 180; const x = Math.sin((b[1] - a[1]) * d / 2) ** 2 + Math.cos(a[1] * d) * Math.cos(b[1] * d) * Math.sin((b[0] - a[0]) * d / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
let outlines = 0;
for (const f of GEO.features) {
  const coords = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
  const c0 = [coords.reduce((a, q) => a + q[0], 0) / coords.length, coords.reduce((a, q) => a + q[1], 0) / coords.length];
  const near = circuits.map(x => ({ x, d: km(c0, [x.lon, x.lat]) })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > 4) continue;
  near.x.km = Math.round(f.properties.length) / 1000; near.x.map = outline(coords); if (f.properties.opened) near.x.opened = f.properties.opened; outlines++;
}
const missing = circuits.filter(x => !x.cc).map(x => `${x.id} (${x.country})`); if (missing.length) throw new Error('circuits with no country code: ' + missing.join(', '));

const out = { code, circuits, topo, low };
fs.writeFileSync(path.join(SRC, 'world.js'), `// Generated by scripts/build-world.js (Natural Earth 1:50m via world-atlas; circuits from the Jolpica F1 API). Do not edit.\nwindow.F1WORLD = ${JSON.stringify(out)};\n`);
// the libraries
fs.mkdirSync(path.join(SRC, 'vendor'), { recursive: true });
for (const [m, f] of [['d3-array', 'd3-array.min.js'], ['d3-geo', 'd3-geo.min.js'], ['topojson-client', 'topojson-client.min.js']]) fs.copyFileSync(path.join(mods, m, 'dist', f), path.join(SRC, 'vendor', f));
console.log(`Wrote src/world.js (${Math.round(fs.statSync(path.join(SRC, 'world.js')).size / 1024)} KB): ${topo.objects.countries.geometries.length} countries, ${circuits.length} circuits (${outlines} with an outline)`);
