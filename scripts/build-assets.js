// Builds src/assets.js: circuit outlines (from bacinger/f1-circuits, MIT) as SVG paths, and country flags
// (from the flag-icons package, MIT) for every nationality and host country Pitwall uses.
//   node scripts/build-assets.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-raw', 'circuits', 'f1-circuits.geojson'), 'utf8'));
const FLAG_DIR = path.join(ROOT, 'node_modules', 'flag-icons', 'flags', '4x3');

const CIRCUITS = {
  'au-1953': 'aus', 'bh-2002': 'bhr', 'cn-2004': 'chn', 'es-1991': 'esp', 'mc-1929': 'mon', 'ca-1978': 'can', 'fr-1969': 'fra', 'at-1969': 'aut',
  'gb-1948': 'gbr', 'de-1932': 'ger', 'hu-1986': 'hun', 'be-1925': 'bel', 'it-1922': 'ita', 'sg-2008': 'sgp', 'ru-2014': 'rus', 'jp-1962': 'jpn',
  'us-2012': 'usa', 'mx-1962': 'mex', 'br-1940': 'bra', 'ae-2009': 'abu', 'it-1953': 'emi', 'de-1927': 'eif', 'pt-2008': 'por', 'it-1914': 'tus',
  'my-1999': 'mal', 'tr-2005': 'tur', 'nl-1948': 'ned', 'sa-2021': 'sau', 'us-2022': 'mia', 'qa-2004': 'qat', 'es-2026': 'mad', 'az-2016': 'aze',
  'us-2023': 'lvg',
};

/** Project lon/lat to a 100-unit box (equirectangular around the circuit's centre), keeping the aspect ratio. */
function outline(coords) {
  const lat0 = coords.reduce((a, c) => a + c[1], 0) / coords.length * Math.PI / 180;
  const pts = coords.map(([lon, lat]) => [lon * Math.cos(lat0), -lat]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  const k = 92 / Math.max(w, h);
  const ox = (100 - w * k) / 2, oy = (100 - h * k) / 2;
  const scaled = pts.map(([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k]);
  // drop points closer than 0.6 units to the last kept one
  const kept = [scaled[0]];
  for (const p of scaled.slice(1)) { const q = kept[kept.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.6) kept.push(p); }
  return 'M' + kept.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L') + 'Z';
}
const maps = {};
for (const f of geo.features) {
  const id = CIRCUITS[f.properties.id]; if (!id) continue;
  const g = f.geometry;
  const coords = g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
  maps[id] = outline(coords);
}
for (const [a, b] of [['sty', 'aut'], ['ann', 'gbr'], ['skh', 'bhr']]) maps[a] = maps[b];
const missingMaps = Object.values(CIRCUITS).filter(id => !maps[id]);

// nationality (as used in driver bios) and host country -> flag code
const NAT = {
  British: 'gb', English: 'gb', Scottish: 'gb-sct', Welsh: 'gb-wls', German: 'de', Spanish: 'es', Finnish: 'fi', Brazilian: 'br', Mexican: 'mx', Australian: 'au',
  Dutch: 'nl', French: 'fr', Danish: 'dk', Russian: 'ru', Belgian: 'be', Swedish: 'se', Japanese: 'jp', Swiss: 'ch', 'New Zealander': 'nz',
  Canadian: 'ca', Indonesian: 'id', Thai: 'th', Monegasque: 'mc', 'Monégasque': 'mc', Italian: 'it', Polish: 'pl', Chinese: 'cn', American: 'us',
  Argentine: 'ar', Argentinian: 'ar', Estonian: 'ee', Austrian: 'at', Czech: 'cz', Bulgarian: 'bg', Norwegian: 'no', Colombian: 'co', Indian: 'in',
  Irish: 'ie', Paraguayan: 'py', Barbadian: 'bb', Peruvian: 'pe', Singaporean: 'sg', Portuguese: 'pt', Venezuelan: 've', Hungarian: 'hu',
  'South African': 'za', Malaysian: 'my', Israeli: 'il', Uruguayan: 'uy', Chilean: 'cl', Turkish: 'tr', Emirati: 'ae', Saudi: 'sa', Qatari: 'qa',
  Azerbaijani: 'az', Bahraini: 'bh', Korean: 'kr', Greek: 'gr', Romanian: 'ro', Ukrainian: 'ua', Liechtensteiner: 'li', Rhodesian: 'zw',
};
const COUNTRY = {
  Australia: 'au', China: 'cn', Japan: 'jp', Bahrain: 'bh', 'Saudi Arabia': 'sa', 'United States': 'us', Italy: 'it', Monaco: 'mc', Spain: 'es',
  Canada: 'ca', Austria: 'at', 'Great Britain': 'gb', 'United Kingdom': 'gb', Belgium: 'be', Hungary: 'hu', Netherlands: 'nl', Azerbaijan: 'az',
  Singapore: 'sg', Mexico: 'mx', Brazil: 'br', Qatar: 'qa', 'United Arab Emirates': 'ae', Russia: 'ru', France: 'fr', Germany: 'de', Malaysia: 'my',
  Portugal: 'pt', Turkey: 'tr', 'South Africa': 'za', Argentina: 'ar', Korea: 'kr', India: 'in', Vietnam: 'vn', 'South Korea': 'kr',
};
const codes = [...new Set([...Object.values(NAT), ...Object.values(COUNTRY)])].sort();
const flags = {};
for (const code of codes) {
  const f = path.join(FLAG_DIR, `${code}.svg`);
  if (!fs.existsSync(f)) { console.warn('no flag for', code); continue; }
  flags[code] = fs.readFileSync(f, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
}
// two flags carry very detailed coats of arms (90 KB each): a simplified emblem is plenty at chip size
flags.mx = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#006847" d="M0 0h213.3v480H0z"/><path fill="#fff" d="M213.3 0h213.4v480H213.3z"/><path fill="#ce1126" d="M426.7 0H640v480H426.7z"/><circle cx="320" cy="240" r="58" fill="#8c5b2b"/><path fill="#006847" d="M270 270q50 40 100 0" stroke="#006847" stroke-width="10" fill-opacity="0"/></svg>';
flags.es = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#AA151B" d="M0 0h640v480H0z"/><path fill="#F1BF00" d="M0 120h640v240H0z"/><rect x="150" y="185" width="70" height="90" rx="12" fill="#AA151B" stroke="#C8A013" stroke-width="8"/><path fill="#C8A013" d="M150 170h70v15h-70z"/></svg>';
const out = `// Generated by scripts/build-assets.js. Circuit outlines: bacinger/f1-circuits (MIT, © Tomislav Bacinger).
// Flags: flag-icons (MIT, © Panayiotis Lipiridis). Do not edit.
window.F1ASSETS = ${JSON.stringify({ maps, flags, nat: NAT, country: COUNTRY })};
`;
fs.writeFileSync(path.join(ROOT, 'src', 'assets.js'), out);
const kb = (n) => Math.round(n / 1024);
console.log(`Wrote src/assets.js (${kb(out.length)} KB): ${Object.keys(maps).length} circuit maps, ${Object.keys(flags).length} flags`);
if (missingMaps.length) console.log('No outline for', missingMaps.join(', '));
const big = Object.entries(flags).sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([k, v]) => `${k} ${kb(v.length)} KB`);
console.log('Largest flags:', big.join(', '));
