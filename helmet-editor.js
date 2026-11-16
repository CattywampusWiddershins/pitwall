// The helmet editor's main-process side (dev mode): F1 25's helmet read from the player's own game files, and a design
// written back out as a mod for SWOFTY's Helmet Exchange addon. Nothing from the game ships with Pitwall: the shell,
// its texture layout and the trim are read from the install on this PC and cached in the user folder.
//
// What the game keeps, as far as the editor needs it:
//  - Archives (.erp, "ERPK" v3): a table of resources, each in fragments. A fragment is stored (code 145) or zstd (17).
//  - A design's helmet: 2025_asset_groups/livery_package/unassigned/<design>/<design>_helmet.erp. Its mesh
//    helmet_arai_gp_6_01 (lod 0; positions float3 in vb0, texture coordinates half2 in vb3, 16-bit indices; the
//    painted shell is the first part) and the colour texture's header and small mip levels (<design>_helmet_d.tif.image).
//  - The colour texture itself: livery_package_shared/unassigned/<design>/textures/<design>_helmet_d.tif.mipmaps, BC1
//    at 2048 x 1024, its three biggest levels each one LZ4 block. 256 x 128 down to 8 x 4 sit in the archive (21840 bytes).
//  - The trim (the face seal, the rubber edge): the pixels that are the same in every design the game has.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DESIGN = 'unassigned_livery17'; // the design the editor's helmet is based on (any player design has the same shell)
const W = 2048, H = 1024, SMALL = 21840;
const CACHE_V = 1;

// ---- archives
function readErp(b) {
  let o = 0; const u32 = () => { const v = b.readUInt32LE(o); o += 4; return v; }, u64 = () => { const v = Number(b.readBigUInt64LE(o)); o += 8; return v; }, u16 = () => { const v = b.readUInt16LE(o); o += 2; return v; }, u8 = () => b[o++];
  if (b.toString('ascii', 0, 4) !== 'ERPK') throw new Error('Not a game archive');
  o = 4; const version = u32(); u32(); u32(); const infoOff = u64(); u64(); const dataOff = u64(); u64();
  o = infoOff; const nFiles = u32(); u32(); const res = [];
  for (let k = 0; k < nFiles; k++) {
    const start = o; const len = u32(); const idLen = u16(); const id = b.toString('latin1', o, o + idLen - 1); o += idLen; const type = b.toString('latin1', o, o + 16).replace(/\0.*$/, ''); o += 16; u32(); const nFrag = u8(); const frags = [];
    for (let f = 0; f < nFrag; f++) { o += 4; const at = o; const off = u64(), size = u64(); u32(); let comp = 0, packed = size, atPacked = null; if (version > 2) { comp = u8(); atPacked = o; packed = u64(); } frags.push({ off, size, comp, packed, at, atPacked }); }
    res.push({ id, type, frags }); o = start + 4 + len;
  }
  return { dataOff, res };
}
// zstd: Node's own where it has it (Node 22.15 and later), else fzstd (Electron 33's Node 20 has none). Written as
// stored blocks (no compression, a valid zstd frame any reader takes): the game's small mips are only 21840 bytes.
function zstdRead(buf) { if (zlib.zstdDecompressSync) return zlib.zstdDecompressSync(buf); return Buffer.from(require('./vendor-fzstd').decompress(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))); }
function zstdWrite(data) {
  // frame: magic, a descriptor (single segment, 4-byte content size), the size, then blocks of up to 128 KB (raw)
  const parts = [Buffer.from([0x28, 0xB5, 0x2F, 0xFD, 0xA0]), Buffer.alloc(4)]; parts[1].writeUInt32LE(data.length);
  for (let o = 0; o < data.length || o === 0; o += 131072) { const n = Math.min(131072, data.length - o); const last = o + n >= data.length ? 1 : 0; const h = (n << 3) | last; parts.push(Buffer.from([h & 255, (h >> 8) & 255, (h >> 16) & 255]), data.subarray(o, o + n)); if (!data.length) break; }
  return Buffer.concat(parts);
}
// ---- a zip of a folder (deflated; CRC-32 worked out here, as Node 20 has no zlib.crc32)
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (~c) >>> 0; };
/** Writes a zip of everything in `dir` (paths inside it, with forward slashes) to `file`. */
function zipFolder(dir, file) {
  const files = []; const walk = (d, rel) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel ? rel + '/' + f : f; if (fs.statSync(p).isDirectory()) walk(p, r); else files.push([p, r]); } }; walk(dir, '');
  const local = [], central = []; let off = 0; const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff, dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const [p, r] of files) {
    const data = fs.readFileSync(p); const comp = zlib.deflateRawSync(data, { level: 6 }); const name = Buffer.from(r, 'utf8'); const crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    local.push(h, name, comp); central.push(c, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  fs.writeFileSync(file + '.tmp', Buffer.concat([...local, cd, end])); fs.renameSync(file + '.tmp', file);
  return files.length;
}
const fragOf = (b, E, f) => { const raw = b.subarray(E.dataOff + f.off, E.dataOff + f.off + f.packed); return f.packed === f.size ? raw : zstdRead(raw); };

// ---- LZ4 (one block per mip level) and BC1
function lz4Block(src, i0, want) {
  const o = Buffer.alloc(want); let i = i0, p = 0;
  while (p < want) {
    const t = src[i++]; if (t === undefined) throw new Error('lz4'); let ll = t >> 4; if (ll === 15) { let b; do { b = src[i++]; ll += b; } while (b === 255); }
    if (p + ll > want) throw new Error('lz4'); src.copy(o, p, i, i + ll); p += ll; i += ll; if (p === want) break;
    const off = src[i] | (src[i + 1] << 8); i += 2; if (!off || off > p) throw new Error('lz4'); let ml = t & 15; if (ml === 15) { let b; do { b = src[i++]; ml += b; } while (b === 255); } ml += 4;
    if (p + ml > want) throw new Error('lz4'); for (let k = 0; k < ml; k++) { o[p] = o[p - off]; p++; }
  }
  return [o, i];
}
/** The top mip level of a BC1 2048 x 1024 .mipmaps file, or null if it isn't one. */
function topLevel(buf) { try { return lz4Block(buf, 0, W * H / 2)[0]; } catch { return null; } }
// an LZ4 block that's all literals: valid for any LZ4 reader
function lz4Literal(data) { const n = data.length; const ext = []; if (n >= 15) { let r = n - 15; while (r >= 255) { ext.push(255); r -= 255; } ext.push(r); } return Buffer.concat([Buffer.from([Math.min(n, 15) << 4]), Buffer.from(ext), data]); }
const c565 = (v) => [((v >> 11) & 31) * 255 / 31 | 0, ((v >> 5) & 63) * 255 / 63 | 0, (v & 31) * 255 / 31 | 0];
function bc1Decode(src, w, h) {
  const o = Buffer.alloc(w * h * 4); let p = 0;
  for (let by = 0; by < h / 4; by++) for (let bx = 0; bx < w / 4; bx++) {
    const a = src.readUInt16LE(p), b = src.readUInt16LE(p + 2), bits = src.readUInt32LE(p + 4); p += 8; const A = c565(a), B = c565(b);
    const C = a > b ? [A, B, A.map((x, i) => (2 * x + B[i]) / 3 | 0), A.map((x, i) => (x + 2 * B[i]) / 3 | 0)] : [A, B, A.map((x, i) => (x + B[i]) / 2 | 0), [0, 0, 0]];
    for (let k = 0; k < 16; k++) { const col = C[(bits >> (2 * k)) & 3]; const q = ((by * 4 + (k >> 2)) * w + bx * 4 + (k & 3)) * 4; o[q] = col[0]; o[q + 1] = col[1]; o[q + 2] = col[2]; o[q + 3] = 255; }
  }
  return o;
}
const to565 = (r, g, b) => ((Math.round(r * 31 / 255) & 31) << 11) | ((Math.round(g * 63 / 255) & 63) << 5) | (Math.round(b * 31 / 255) & 31);
/** BC1, each 4 x 4 block's end colours along its main colour axis (good for flat colours and hard edges). */
function bc1Encode(px, w, h) {
  const bw = Math.max(1, w / 4), bh = Math.max(1, h / 4); const out = Buffer.alloc(bw * bh * 8); let o = 0; const blk = new Float32Array(48);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let mr = 0, mg = 0, mb = 0;
    for (let k = 0; k < 16; k++) { const x = Math.min(w - 1, bx * 4 + (k & 3)), y = Math.min(h - 1, by * 4 + (k >> 2)), q = (y * w + x) * 4; blk[k * 3] = px[q]; blk[k * 3 + 1] = px[q + 1]; blk[k * 3 + 2] = px[q + 2]; mr += px[q]; mg += px[q + 1]; mb += px[q + 2]; }
    mr /= 16; mg /= 16; mb /= 16;
    let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
    for (let k = 0; k < 16; k++) { const r = blk[k * 3] - mr, g = blk[k * 3 + 1] - mg, b = blk[k * 3 + 2] - mb; cxx += r * r; cxy += r * g; cxz += r * b; cyy += g * g; cyz += g * b; czz += b * b; }
    let ax = [0.577, 0.577, 0.577];
    for (let it = 0; it < 6; it++) { const nx = cxx * ax[0] + cxy * ax[1] + cxz * ax[2], ny = cxy * ax[0] + cyy * ax[1] + cyz * ax[2], nz = cxz * ax[0] + cyz * ax[1] + czz * ax[2]; const L = Math.hypot(nx, ny, nz); if (L < 1e-6) break; ax = [nx / L, ny / L, nz / L]; }
    let lo = 1e9, hi = -1e9; for (let k = 0; k < 16; k++) { const t = (blk[k * 3] - mr) * ax[0] + (blk[k * 3 + 1] - mg) * ax[1] + (blk[k * 3 + 2] - mb) * ax[2]; if (t < lo) lo = t; if (t > hi) hi = t; }
    const cl = (v) => Math.max(0, Math.min(255, v));
    let c0 = to565(cl(mr + ax[0] * hi), cl(mg + ax[1] * hi), cl(mb + ax[2] * hi)), c1 = to565(cl(mr + ax[0] * lo), cl(mg + ax[1] * lo), cl(mb + ax[2] * lo));
    if (c0 < c1) [c0, c1] = [c1, c0];
    let bits = 0;
    if (c0 !== c1) {
      const A = c565(c0), B = c565(c1); const P = [A, B, A.map((v, i) => (2 * v + B[i]) / 3), A.map((v, i) => (v + 2 * B[i]) / 3)];
      for (let k = 0; k < 16; k++) { let best = 0, bd = 1e12; for (let j = 0; j < 4; j++) { const d = (blk[k * 3] - P[j][0]) ** 2 + (blk[k * 3 + 1] - P[j][1]) ** 2 + (blk[k * 3 + 2] - P[j][2]) ** 2; if (d < bd) { bd = d; best = j; } } bits |= best << (2 * k); }
    }
    out.writeUInt16LE(c0, o); out.writeUInt16LE(c1, o + 2); out.writeUInt32LE(bits >>> 0, o + 4); o += 8;
  }
  return out;
}
const halve = (px, w, h) => { const w2 = w >> 1, h2 = h >> 1, o = Buffer.alloc(w2 * h2 * 4); for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < 4; c++) { const q = (a, b) => px[((y * 2 + b) * w + x * 2 + a) * 4 + c]; o[(y * w2 + x) * 4 + c] = (q(0, 0) + q(1, 0) + q(0, 1) + q(1, 1) + 2) >> 2; } return o; };
const half2float = (h) => { const s = h >> 15, e = (h >> 10) & 31, f = h & 1023; return (s ? -1 : 1) * (e === 0 ? f / 1024 * 2 ** -14 : (1 + f / 1024) * 2 ** (e - 15)); };

module.exports = function createHelmetEditor({ dataDir }) {
  const root = () => path.join(dataDir(), 'editor');
  const cacheDir = () => path.join(root(), 'cache');
  const settingsFile = () => path.join(root(), 'settings.json');
  const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } };
  const saveSettings = (s) => { fs.mkdirSync(root(), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); };
  const isGame = (dir) => { try { return !!dir && fs.existsSync(path.join(dir, 'livery_package_shared', 'unassigned', DESIGN)) && fs.existsSync(path.join(dir, '2025_asset_groups', 'livery_package', 'unassigned', DESIGN)); } catch { return false; } };
  /** The F1 25 install: the one picked, else the usual places on each drive (Xbox app, Steam, EA app). */
  function findGame() {
    const s = readSettings(); if (isGame(s.game)) return s.game;
    const tails = ['Xbox\\F1 25', 'XboxGames\\F1 25\\Content', 'XboxGames\\F1® 25\\Content', 'Program Files (x86)\\Steam\\steamapps\\common\\F1 25', 'Program Files\\Steam\\steamapps\\common\\F1 25', 'SteamLibrary\\steamapps\\common\\F1 25', 'Steam\\steamapps\\common\\F1 25', 'Program Files\\EA Games\\F1 25', 'EA Games\\F1 25'];
    for (const d of 'CDEFGHIJ') for (const t of tails) { const p = `${d}:\\${t}`; if (isGame(p)) { saveSettings({ ...s, game: p }); return p; } }
    return null;
  }
  function setGame(dir) { if (!isGame(dir)) return { ok: false, error: 'That folder doesn’t look like F1 25 (it needs livery_package_shared and 2025_asset_groups).' }; saveSettings({ ...readSettings(), game: dir }); return { ok: true, game: dir }; }
  const erpPath = (g) => path.join(g, '2025_asset_groups', 'livery_package', 'unassigned', DESIGN, `${DESIGN}_helmet.erp`);
  const texDir = (g) => path.join(g, 'livery_package_shared', 'unassigned', DESIGN, 'textures');

  /** Builds the cache from the game: the shell's mesh, the base texture (the design's own, for the parts inside the helmet) and the trim. */
  function buildCache(game) {
    const b = fs.readFileSync(erpPath(game)); const E = readErp(b);
    const get = (key) => { const r = E.res.find(x => x.id.includes(key)); if (!r) throw new Error('Missing ' + key); return fragOf(b, E, r.frags[1]); };
    const ib = get('gp_6_01.idf?lod=all&ib=0'), vb0 = get('gp_6_01.idf?lod=all&vb=0'), vb3 = get('gp_6_01.idf?lod=all&vb=3');
    const mesh = E.res.find(x => x.id.includes('gp_6_01.idf?lod=0&mesh')); const m = fragOf(b, E, mesh.frags[0]);
    // lod 0's parts: index start and count (the first is the painted shell)
    const n = vb0.length / 12; const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { pos[i * 3] = vb0.readFloatLE(i * 12); pos[i * 3 + 1] = vb0.readFloatLE(i * 12 + 4); pos[i * 3 + 2] = vb0.readFloatLE(i * 12 + 8); uv[i * 2] = half2float(vb3.readUInt16LE(i * 4)); uv[i * 2 + 1] = half2float(vb3.readUInt16LE(i * 4 + 2)); }
    // the shell is the first draw call: the first (start 0, count) pair in the mesh record that's a big run of
    // triangles; this design is known to have 45156 indices there
    let count = 45156; { const idx = new Uint16Array(ib.buffer, ib.byteOffset, ib.length / 2); for (let o = 0; o + 8 <= m.length; o += 4) { const s = m.readUInt32LE(o), c = m.readUInt32LE(o + 4); if (s === 0 && c > 30000 && c < idx.length && c % 3 === 0) { count = c; break; } } }
    const idx = new Uint16Array(count); for (let i = 0; i < count; i++) idx[i] = ib.readUInt16LE(i * 2);
    // the texture: the design's own (kept inside the helmet and on the trim)
    const top = topLevel(fs.readFileSync(path.join(texDir(game), `${DESIGN}_helmet_d.tif.mipmaps`))); if (!top) throw new Error('The helmet texture isn’t in the expected format');
    const base = bc1Decode(top, W, H);
    // the trim: pixels that hardly change across the game's designs
    const shared = path.join(game, 'livery_package_shared'); const imgs = [];
    for (const g of fs.readdirSync(shared)) { let dirs = []; try { dirs = fs.readdirSync(path.join(shared, g)); } catch { continue; }
      for (const d of dirs) { const f = path.join(shared, g, d, 'textures', `${d}_helmet_d.tif.mipmaps`); if (!fs.existsSync(f)) continue; const t = topLevel(fs.readFileSync(f)); if (t) imgs.push(bc1Decode(t, W, H)); if (imgs.length >= 14) break; }
      if (imgs.length >= 14) break; }
    const trim = Buffer.alloc(W * H); const trimCol = Buffer.alloc(W * H * 4);
    for (let p = 0; p < W * H; p++) { let spread = 0; for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const im of imgs) { const v = im[p * 4 + c]; if (v < lo) lo = v; if (v > hi) hi = v; } spread = Math.max(spread, hi - lo); }
      if (imgs.length >= 4 && spread < 40) { trim[p] = 255; for (let c = 0; c < 3; c++) { let s = 0; for (const im of imgs) s += im[p * 4 + c]; trimCol[p * 4 + c] = s / imgs.length; } trimCol[p * 4 + 3] = 255; } }
    // the parts inside the helmet (seen through the face opening) keep the design's own colours: the base, with the trim on it
    for (let p = 0; p < W * H; p++) if (trim[p]) trimCol.copy(base, p * 4, p * 4, p * 4 + 3);
    const dir = cacheDir(); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pos.bin'), Buffer.from(pos.buffer)); fs.writeFileSync(path.join(dir, 'uv.bin'), Buffer.from(uv.buffer)); fs.writeFileSync(path.join(dir, 'idx.bin'), Buffer.from(idx.buffer));
    fs.writeFileSync(path.join(dir, 'base.bin'), base); fs.writeFileSync(path.join(dir, 'trim.bin'), trim);
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ v: CACHE_V, game, design: DESIGN, designs: imgs.length, at: new Date().toISOString() }));
  }
  /** The helmet for the editor: { ok, game, pos, uv, idx, base (RGBA 2048 x 1024), trim (one byte a pixel) } or { ok: false, error, needGame }. */
  function load() {
    const game = findGame(); if (!game) return { ok: false, needGame: true, error: 'F1 25 wasn’t found. Pick its folder (the one with F1_25.exe).' };
    let meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(cacheDir(), 'meta.json'), 'utf8')); } catch { }
    try { if (!meta || meta.v !== CACHE_V || meta.game !== game) buildCache(game); } catch (e) { return { ok: false, error: 'Couldn’t read the helmet from F1 25: ' + e.message }; }
    const r = (f) => fs.readFileSync(path.join(cacheDir(), f));
    return { ok: true, game, pos: r('pos.bin'), uv: r('uv.bin'), idx: r('idx.bin'), base: r('base.bin'), trim: r('trim.bin'), w: W, h: H };
  }
  /**
   * A finished texture (RGBA, 2048 x 1024, rows top to bottom) as a Helmet Exchange mod folder: the design's archive
   * with the new small mip levels, the new colour texture, and the design's other helmet textures as the game has them.
   */
  function exportMod(rgba, name) {
    const game = findGame(); if (!game) return { ok: false, error: 'F1 25 wasn’t found.' };
    const px = Buffer.from(rgba.buffer ? Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength) : rgba); if (px.length !== W * H * 4) return { ok: false, error: 'The texture is the wrong size.' };
    const safe = String(name || 'Helmet').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'Helmet';
    const out = path.join(root(), 'exports', '.building', safe); fs.rmSync(out, { recursive: true, force: true }); // (zipped below, then removed)
    const levels = []; let cur = px, w = W, h = H; for (let k = 0; k < 9; k++) { levels.push(bc1Encode(cur, w, h)); if (k < 8) { cur = halve(cur, w, h); w >>= 1; h >>= 1; } }
    const small = Buffer.concat(levels.slice(3)); if (small.length !== SMALL) return { ok: false, error: 'Unexpected mip sizes.' };
    const td = path.join(out, 'livery_package_shared', 'unassigned', DESIGN, 'textures'); fs.mkdirSync(td, { recursive: true });
    fs.writeFileSync(path.join(td, `${DESIGN}_helmet_d.tif.mipmaps`), Buffer.concat(levels.slice(0, 3).map(lz4Literal)));
    for (const f of fs.readdirSync(texDir(game))) if (/_(helmet|visor_attachments)/.test(f) && !f.endsWith('_helmet_d.tif.mipmaps')) fs.copyFileSync(path.join(texDir(game), f), path.join(td, f));
    const b = Buffer.from(fs.readFileSync(erpPath(game))); const E = readErp(b);
    const R = E.res.find(x => x.id.endsWith(`/${DESIGN}_helmet_d.tif.image`)); const F = R && R.frags[1]; if (!F || F.size !== SMALL) return { ok: false, error: 'The game’s helmet archive isn’t laid out as expected.' };
    const packed = zstdWrite(small); b.writeBigUInt64LE(BigInt(b.length - E.dataOff), F.at); b.writeBigUInt64LE(BigInt(packed.length), F.atPacked);
    const ed = path.join(out, '2025_asset_groups', 'livery_package', 'unassigned', DESIGN); fs.mkdirSync(ed, { recursive: true });
    fs.writeFileSync(path.join(ed, `${DESIGN}_helmet.erp`), Buffer.concat([b, packed]));
    // read back: the texture and the small levels as the game will read them
    const back = topLevel(fs.readFileSync(path.join(td, `${DESIGN}_helmet_d.tif.mipmaps`))); const b2 = fs.readFileSync(path.join(ed, `${DESIGN}_helmet.erp`)); const E2 = readErp(b2);
    const F2 = E2.res.find(x => x.id.endsWith(`/${DESIGN}_helmet_d.tif.image`)).frags[1];
    if (!back || !back.equals(levels[0]) || !fragOf(b2, E2, F2).equals(small)) return { ok: false, error: 'The written files didn’t read back correctly.' };
    fs.writeFileSync(path.join(out, 'README.txt'), `${safe}: a helmet made in Pitwall's editor.\r\n\r\nIn SWOFTY Launcher, open Helmets (the Helmet Exchange addon), press "Import file..." and pick this zip.\r\nSet "Who can pick it" to Any driver for a created driver, press Play, then in your career open\r\nTeam HQ > Driver Details > Helmets and equip it. It shows with (HX) after its name.\r\n`);
    // the mod as one zip named after the helmet (SWOFTY imports zips best), the game's folders at its root
    const zip = path.join(root(), 'exports', `${safe}.zip`);
    try { zipFolder(out, zip); } catch (e) { return { ok: false, error: 'Couldn’t write the zip: ' + e.message }; } finally { fs.rmSync(out, { recursive: true, force: true }); }
    return { ok: true, file: zip, dir: path.dirname(zip) };
  }
  // ---- designs, one file each (images inside can be big, so they stay out of the career data)
  const designsDir = () => path.join(root(), 'designs');
  const okId = (id) => /^[\w-]{1,64}$/.test(String(id));
  function list() { try { return fs.readdirSync(designsDir()).filter(f => f.endsWith('.json')).map(f => { try { const d = JSON.parse(fs.readFileSync(path.join(designsDir(), f), 'utf8')); return { id: d.id, name: d.name, at: d.at, thumb: d.thumb || null }; } catch { return null; } }).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at))); } catch { return []; } }
  function save(d) { if (!d || !okId(d.id)) return { ok: false }; fs.mkdirSync(designsDir(), { recursive: true }); const f = path.join(designsDir(), d.id + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(d)); fs.renameSync(f + '.tmp', f); return { ok: true }; }
  function open(id) { if (!okId(id)) return null; try { return JSON.parse(fs.readFileSync(path.join(designsDir(), id + '.json'), 'utf8')); } catch { return null; } }
  function remove(id) { if (!okId(id)) return false; try { fs.rmSync(path.join(designsDir(), id + '.json'), { force: true }); return true; } catch { return false; } }
  return { load, findGame, setGame, exportMod, list, save, open, remove, _bc1Encode: bc1Encode, _bc1Decode: bc1Decode };
};
