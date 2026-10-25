// Downloads the raw Formula 1 results Pitwall's history is built from, from the Jolpica F1 API
// (https://github.com/jolpica/jolpica-f1, the successor of Ergast). Every response is cached in data-raw/,
// so re-running only fetches what is missing. Requests are spaced to stay inside the public rate limit.
//   node scripts/fetch-history.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const API = 'https://api.jolpi.ca/ergast/f1';
const CACHE = path.join(__dirname, '..', 'data-raw');
const GAP_MS = 7600; // ~470 requests an hour, under the 500/hour limit
const FIRST = 1950, DETAIL_FROM = 2016, LAST = 2025;

fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let last = 0, fetched = 0;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Pitwall career tracker (history build)' } }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body, retry: +res.headers['retry-after'] || 0 }));
    }).on('error', reject);
  });
}

async function cached(rel) {
  const file = path.join(CACHE, rel.replace(/[/?&=]+/g, '_') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await get(`${API}/${rel}`).catch(e => ({ status: 0, body: String(e) }));
    if (r.status === 200) {
      fs.writeFileSync(file, r.body);
      fetched++;
      return JSON.parse(r.body);
    }
    const pause = r.status === 429 ? Math.max(r.retry * 1000, 5 * 60000) : 30000 * (attempt + 1);
    console.log(`  ${r.status} on ${rel}, waiting ${Math.round(pause / 1000)} s`);
    if (attempt > 8) throw new Error(`giving up on ${rel}`);
    await sleep(pause);
  }
}

/** Every page of a paged endpoint (limit 100). */
async function all(rel) {
  const pages = [];
  for (let offset = 0; ; offset += 100) {
    const j = await cached(`${rel}.json?limit=100&offset=${offset}`);
    pages.push(j);
    if (offset + 100 >= +j.MRData.total) break;
  }
  return pages;
}

(async () => {
  const years = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // the detailed era first: what careers start from
  for (const y of years(DETAIL_FROM, LAST)) {
    await cached(`${y}.json?limit=100`);
    await all(`${y}/results`);
    await all(`${y}/qualifying`);
    if (y >= 2021) await all(`${y}/sprint`);
    console.log(`${y} done (${fetched} fetched)`);
  }
  // everything before, for career totals, team records and all-time records
  for (const y of years(FIRST, DETAIL_FROM - 1).reverse()) {
    await all(`${y}/results`);
    if (y % 5 === 0) console.log(`${y} done (${fetched} fetched)`);
  }
  // every driver's and team's season-by-season championship finishes
  for (const y of years(FIRST, LAST)) {
    await all(`${y}/driverStandings`);
    if (y >= 1958) await all(`${y}/constructorStandings`);
  }
  console.log(`All done. ${fetched} requests made.`);
})().catch(e => { console.error(e); process.exit(1); });
