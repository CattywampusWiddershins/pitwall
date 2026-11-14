// The race engineer's voice and ears (dev mode): speech made by Piper and speech understood by whisper.cpp, both run on
// this PC with nothing sent anywhere. Neither ships with Pitwall: the voice program and each voice download when a voice
// is chosen in Settings, and the speech recognition when talking back is turned on, into the user folder ("engineer").
// Windows only for now (the programs are Windows builds; zips are unpacked with Windows' own tar).
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PIPER_ZIP = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip';
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/';
const WHISPER_ZIP = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip';
const WHISPER_MODEL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
// [id, name, accent, voice, path under VOICE_BASE, MB]
const VOICES = [
  ['gb-north', 'Northern', 'British', 'Male', 'en_GB/northern_english_male/medium/en_GB-northern_english_male-medium', 63],
  ['gb-alan', 'Alan', 'British', 'Male', 'en_GB/alan/medium/en_GB-alan-medium', 63],
  ['gb-jenny', 'Jenny', 'British', 'Female', 'en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium', 63],
  ['gb-cori', 'Cori', 'British', 'Female', 'en_GB/cori/high/en_GB-cori-high', 114],
  ['sc-alba', 'Alba', 'Scottish', 'Female', 'en_GB/alba/medium/en_GB-alba-medium', 63],
  ['us-ryan', 'Ryan', 'American', 'Male', 'en_US/ryan/high/en_US-ryan-high', 121],
  ['us-joe', 'Joe', 'American', 'Male', 'en_US/joe/medium/en_US-joe-medium', 63],
  ['us-hfc', 'Hayden', 'American', 'Male', 'en_US/hfc_male/medium/en_US-hfc_male-medium', 63],
  ['us-lessac', 'Lessac', 'American', 'Female', 'en_US/lessac/high/en_US-lessac-high', 114],
].map(([id, name, accent, voice, p, mb]) => ({ id, name, accent, voice, p, mb }));

// ---- the radio sound: the band a team radio carries, pushed into a soft clip and squashed, with a hiss bed, a short
// tone before the voice and the squelch at both ends
function biquad(x, rate, type, f0, Q) {
  const w = 2 * Math.PI * f0 / rate, cs = Math.cos(w), al = Math.sin(w) / (2 * Q); let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al; const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function radio(x, rate) {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let y = biquad(biquad(x, rate, 'hp', 350, 0.8), rate, 'hp', 350, 0.8);
  y = biquad(biquad(y, rate, 'lp', 3200, 0.8), rate, 'lp', 3200, 0.8);
  const mid = biquad(y, rate, 'bp', 1700, 1.2); y = y.map((v, i) => v + mid[i] * 1.2);
  let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v)); pk = pk || 1; y = y.map(v => Math.tanh(v / pk * 3.2) * 0.75);
  let env = 0; y = y.map(v => { env = Math.max(Math.abs(v), env * 0.9995); return v / Math.max(0.35, env) * 0.5; });
  const pre = Math.round(rate * 0.12), post = Math.round(rate * 0.18), n = pre + y.length + post, z = new Float32Array(n);
  const hiss = biquad(Float32Array.from({ length: n }, rnd), rate, 'bp', 2400, 0.7);
  for (let i = 0; i < n; i++) z[i] = hiss[i] * 0.05;
  for (let i = 0; i < y.length; i++) z[pre + i] += y[i];
  const burst = (at, len, amp) => { for (let i = 0; i < len && at + i < n; i++) z[at + i] += rnd() * amp * (1 - i / len); };
  burst(0, Math.round(rate * 0.04), 0.5); burst(pre + y.length + Math.round(rate * 0.04), Math.round(rate * 0.09), 0.45);
  for (let i = 0; i < rate * 0.06; i++) z[Math.round(rate * 0.05) + i] += Math.sin(2 * Math.PI * 1400 * i / rate) * 0.25;
  return z;
}
// a clean voice: just brought to a steady level
function clean(x) { let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); const g = pk ? 0.8 / pk : 1; return x.map(v => v * g); }
function readWav(b) {
  let o = 12, rate = 22050, data = null;
  while (o + 8 <= b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') rate = b.readUInt32LE(o + 12); if (id === 'data') { data = b.subarray(o + 8, Math.min(b.length, o + 8 + sz)); break; } o += 8 + sz + (sz & 1); }
  const x = new Float32Array(data ? data.length >> 1 : 0); for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768; return { x, rate };
}
function wav(x, rate) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return b;
}

module.exports = function createEngineer({ dir }) {
  const root = () => path.join(dir(), 'engineer');
  const P = {
    piper: () => path.join(root(), 'piper', 'piper', 'piper.exe'),
    voice: (id) => path.join(root(), 'voices', id + '.onnx'),
    whisper: () => path.join(root(), 'whisper', 'Release', 'whisper-cli.exe'),
    model: () => path.join(root(), 'whisper', 'ggml-base.en.bin'),
    tmp: () => path.join(root(), 'tmp'),
  };
  const has = (f) => { try { return fs.statSync(f).size > 0; } catch { return false; } };
  const jobs = {}; // what's downloading: { [key]: { got, total } }

  async function download(url, file, key) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const res = await fetch(url, { headers: { 'User-Agent': 'Pitwall' } });
    if (!res.ok || !res.body) throw new Error(`The download said ${res.status}`);
    const total = +res.headers.get('content-length') || 0; const part = file + '.part'; const fh = await fs.promises.open(part, 'w');
    let got = 0; jobs[key] = { got, total };
    try { const rd = res.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; await fh.write(value); got += value.length; jobs[key] = { got, total }; } }
    finally { await fh.close(); }
    if (total && got !== total) { fs.rmSync(part, { force: true }); throw new Error('The download was incomplete'); }
    fs.renameSync(part, file);
  }
  const unzip = (zip, to) => new Promise((ok, no) => { fs.mkdirSync(to, { recursive: true }); execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', to], (e) => e ? no(new Error('Could not unpack the download')) : ok()); });

  async function install(kind, id) {
    const key = kind === 'voice' ? 'voice:' + id : kind;
    if (jobs[key]?.busy) return { ok: false, error: 'Already downloading' };
    jobs[key] = { got: 0, total: 0, busy: true };
    try {
      if (kind === 'voice' || kind === 'piper') {
        if (!has(P.piper())) { const z = path.join(root(), 'piper.zip'); await download(PIPER_ZIP, z, key); await unzip(z, path.join(root(), 'piper')); fs.rmSync(z, { force: true }); }
        if (kind === 'voice') {
          const v = VOICES.find(x => x.id === id); if (!v) throw new Error('No such voice');
          if (!has(P.voice(id) + '.json')) await download(VOICE_BASE + v.p + '.onnx.json', P.voice(id) + '.json', key);
          if (!has(P.voice(id))) await download(VOICE_BASE + v.p + '.onnx', P.voice(id), key);
        }
      } else if (kind === 'whisper') {
        if (!has(P.whisper())) { const z = path.join(root(), 'whisper.zip'); await download(WHISPER_ZIP, z, key); await unzip(z, path.join(root(), 'whisper')); fs.rmSync(z, { force: true }); }
        if (!has(P.model())) await download(WHISPER_MODEL, P.model(), key);
      }
      delete jobs[key]; return { ok: true, status: status() };
    } catch (e) { delete jobs[key]; return { ok: false, error: e.message || String(e) }; }
  }
  function remove(kind, id) {
    stopVoice();
    try { if (kind === 'voice') { fs.rmSync(P.voice(id), { force: true }); fs.rmSync(P.voice(id) + '.json', { force: true }); } else if (kind === 'whisper') fs.rmSync(path.join(root(), 'whisper'), { recursive: true, force: true }); } catch { /* already gone */ }
    return status();
  }
  function status() {
    return { voices: VOICES.map(v => ({ ...v, installed: has(P.voice(v.id)) && has(P.voice(v.id) + '.json') })), piper: has(P.piper()), whisper: has(P.whisper()) && has(P.model()), whisperMB: 157,
      jobs: Object.fromEntries(Object.entries(jobs).map(([k, j]) => [k, { got: j.got, total: j.total }])) };
  }

  // ---- speaking: one Piper process per voice, kept running (the voice loads once), a line in and a file out
  let proc = null; let waiting = []; let buf = '';
  function stopVoice() { if (proc) { try { proc.p.kill(); } catch { } proc = null; } waiting.forEach(w => w.no(new Error('The voice stopped'))); waiting = []; buf = ''; }
  function voiceProc(id) {
    if (proc?.id === id && proc.p.exitCode == null) return proc;
    stopVoice(); fs.mkdirSync(P.tmp(), { recursive: true });
    const p = spawn(P.piper(), ['-m', P.voice(id), '-d', P.tmp(), '-q', '--length_scale', '0.92', '--sentence_silence', '0.12'], { windowsHide: true });
    p.stdout.on('data', (d) => { buf += d.toString(); let k; while ((k = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1); if (line) waiting.shift()?.ok(line); } });
    p.on('exit', () => { if (proc?.p === p) { proc = null; waiting.forEach(w => w.no(new Error('The voice stopped'))); waiting = []; } });
    p.on('error', () => {});
    proc = { id, p }; return proc;
  }
  async function speak(text, id, { fx = true } = {}) {
    if (!has(P.piper()) || !has(P.voice(id))) return { ok: false, error: 'not_installed' };
    const line = String(text || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 400); if (!line) return { ok: false, error: 'empty' };
    try {
      const pr = voiceProc(id);
      const file = await new Promise((ok, no) => { waiting.push({ ok, no }); pr.p.stdin.write(line + '\n'); setTimeout(() => no(new Error('The voice took too long')), 15000); });
      const raw = fs.readFileSync(file); fs.rmSync(file, { force: true });
      const { x, rate } = readWav(raw);
      return { ok: true, wav: wav(fx ? radio(x, rate) : clean(x), rate) };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // ---- hearing: a clip of you talking (16 kHz WAV from the window), turned into text; the prompt carries the names
  // the race might bring up, so whisper spells them as F1 does
  function hear(bytes, prompt) {
    if (!has(P.whisper()) || !has(P.model())) return Promise.resolve({ ok: false, error: 'not_installed' });
    fs.mkdirSync(P.tmp(), { recursive: true }); const f = path.join(P.tmp(), `in-${Date.now()}.wav`); fs.writeFileSync(f, Buffer.from(bytes));
    const threads = String(Math.max(2, Math.min(8, require('os').cpus().length - 2)));
    return new Promise((ok) => {
      execFile(P.whisper(), ['-m', P.model(), '-f', f, '-nt', '-np', '-l', 'en', '-t', threads, '--prompt', String(prompt || '').slice(0, 600)], { windowsHide: true, timeout: 20000, maxBuffer: 1 << 20 }, (e, out) => {
        fs.rmSync(f, { force: true });
        if (e) return ok({ ok: false, error: 'The speech recognition failed' });
        const text = String(out || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        ok({ ok: true, text });
      });
    });
  }

  return { status, install, remove, speak, hear, stop: stopVoice, VOICES, _radio: radio, _readWav: readWav, _wav: wav };
};
