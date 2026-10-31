// node scripts/publish-release.js — publishes a GitHub release for the current version with its installer, using git's saved GitHub sign-in.
// The token is read from git's credential helper and never printed.
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const repo = 'CattywampusWiddershins/pitwall';
const version = require(root + '/package.json').version; const tag = `v${version}`;
const exe = path.join(root, 'dist', `Pitwall-Setup-${version}.exe`);
if (!fs.existsSync(exe)) throw new Error('No installer at ' + exe);

// the notes: this version's section of the changelog, or every version back to the one given
// (`node scripts/publish-release.js 3.16.0` when versions in between weren't published)
const cl = fs.readFileSync(root + '/CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n');
const since = process.argv[2] || version;
const secs = [...cl.matchAll(/\n## (\d+\.\d+(?:\.\d+)?)\n\n([\s\S]*?)(?=\n## |$)/g)].map(x => ({ v: x[1], text: x[2].trim() }));
const at = secs.findIndex(x => x.v === version), to = secs.findIndex(x => x.v === since);
if (at < 0 || to < at) throw new Error(`No changelog entries from ${version} back to ${since}`);
const notes = secs.slice(at, to + 1); const many = notes.length > 1;
const body = notes.map(x => many ? `## ${x.v}\n\n${x.text}` : x.text).join('\n\n') + `\n\n**Install:** download \`Pitwall-Setup-${version}.exe\` below and run it (Windows SmartScreen: More info → Run anyway). Already have Pitwall 3.13 or later? It updates itself.`;

const cred = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const token = (cred.match(/^password=(.*)$/m) || [])[1]; if (!token) throw new Error('No saved GitHub sign-in');
const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Pitwall-release', 'X-GitHub-Api-Version': '2022-11-28' };

(async () => {
  const existing = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers: H });
  if (existing.ok) { const r = await existing.json(); console.log('Release already exists:', r.html_url, (r.assets || []).map(a => a.name)); return; }
  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name: `Pitwall ${version}`, body, draft: false, prerelease: false, make_latest: 'true' }) });
  if (!res.ok) throw new Error(`Creating the release: ${res.status} ${await res.text()}`);
  const rel = await res.json(); console.log('Created', rel.html_url);
  const data = fs.readFileSync(exe);
  const up = await fetch(`https://uploads.github.com/repos/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(path.basename(exe))}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/octet-stream', 'Content-Length': String(data.length) }, body: data });
  if (!up.ok) throw new Error(`Uploading the installer: ${up.status} ${await up.text()}`);
  const a = await up.json(); console.log('Uploaded', a.name, a.size, 'bytes');
  // a file just published downloads slowly until GitHub's servers have a copy: fetch it once now (nothing is saved)
  const t = Date.now(); const dl = await fetch(a.browser_download_url, { headers: { 'User-Agent': 'Pitwall-release' } }); let n = 0;
  if (dl.ok && dl.body) { const r = dl.body.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; } }
  console.log(`Fetched once to warm GitHub's servers: ${(n / 1048576).toFixed(0)} MB in ${Math.round((Date.now() - t) / 1000)} s`);
})().catch(e => { console.error(String(e.message || e).replace(token, '***')); process.exit(1); });
