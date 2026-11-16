/* Pitwall — the Editor tab (dev mode only, 7.0): a helmet editor for F1 25. Part of the renderer, loaded after the other pages. */
'use strict';
/*
  F1 25's own helmet shell, read from the game on this PC (helmet-editor.js in the main process), painted in layers and
  exported as a mod for SWOFTY's Helmet Exchange addon.

  How it draws: the design is baked on the graphics card into the game's texture layout (2048 x 1024, helmet_d). Each
  layer is drawn by rendering the shell in texture space, so every pixel knows where it is on the helmet:
   - "stick" layers are projected onto the surface from a point and direction (a sticker); only the side facing that way
     takes it, so nothing comes through on the inside or the far side.
   - "wrap" layers are laid round the shell from front to back (x across, distance round the curve along), for stripes
     over the top.
   - "uv" layers are a whole texture in the game's layout (a design made in Blender), laid on as it is.
  The base colour (and a fade to a second colour) goes under everything; the trim (face seal, rubber edge) and the parts
  inside the helmet keep the game's own colours, on top of everything.

  The editor's page is one element kept alive across Pitwall's redraws (render() replaces #main): renderEditor() leaves a
  slot and edMount() puts the element back into it, so the 3D view, its camera and the selection survive a redraw.
*/
const ED = { root: null, ready: false, loading: false, err: null, needGame: false, three: null, design: null, sel: null, undo: [], redo: [], lib: 'shapes', view: '3d', dirty: false, saveT: null, list: [], text: null, bg: null };
const ED_W = 2048, ED_H = 1024;

// ---- the library: shapes as SVG, F fill, O outline, A accent (viewBox 0 0 100 100 unless vb says otherwise)
const ED_SHAPES = [
  { id: 'stripe', cat: 'Stripes and lines', name: 'Stripe', vb: [20, 100], svg: '<rect x="0" y="0" width="20" height="100" fill="F"/>' },
  { id: 'stripe3', cat: 'Stripes and lines', name: 'Triple stripe', vb: [60, 100], svg: '<rect x="0" width="16" height="100" fill="F"/><rect x="22" width="16" height="100" fill="A"/><rect x="44" width="16" height="100" fill="F"/>' },
  { id: 'pin', cat: 'Stripes and lines', name: 'Pinstripe pair', vb: [40, 100], svg: '<rect x="0" width="10" height="100" fill="F"/><rect x="30" width="10" height="100" fill="F"/>' },
  { id: 'slash', cat: 'Stripes and lines', name: 'Slash', svg: '<path d="M0 80 L70 10 L100 10 L30 80Z" fill="F"/>' },
  { id: 'swoosh', cat: 'Stripes and lines', name: 'Swoosh', vb: [200, 100], svg: '<path d="M0 90 Q90 10 200 25 L200 45 Q100 35 0 100Z" fill="F"/>' },
  { id: 'chevron', cat: 'Stripes and lines', name: 'Chevron', svg: '<path d="M0 30 L50 70 L100 30 L100 55 L50 95 L0 55Z" fill="F"/>' },
  { id: 'zigzag', cat: 'Stripes and lines', name: 'Zigzag', vb: [200, 60], svg: '<path d="M0 50 L40 10 L80 50 L120 10 L160 50 L200 10" fill="none" stroke="F" stroke-width="12" stroke-linejoin="miter"/>' },
  { id: 'speed', cat: 'Stripes and lines', name: 'Speed lines', vb: [200, 80], svg: '<path d="M0 10 H200 L180 22 H0Z M0 34 H170 L150 46 H0Z M0 58 H140 L120 70 H0Z" fill="F"/>' },
  { id: 'circle', cat: 'Basic', name: 'Circle', svg: '<circle cx="50" cy="50" r="48" fill="F"/>' },
  { id: 'ring', cat: 'Basic', name: 'Ring', svg: '<circle cx="50" cy="50" r="42" fill="none" stroke="F" stroke-width="12"/>' },
  { id: 'square', cat: 'Basic', name: 'Square', svg: '<rect x="2" y="2" width="96" height="96" fill="F"/>' },
  { id: 'rounded', cat: 'Basic', name: 'Rounded box', vb: [160, 100], svg: '<rect x="2" y="2" width="156" height="96" rx="22" fill="F"/>' },
  { id: 'triangle', cat: 'Basic', name: 'Triangle', svg: '<path d="M50 2 L98 98 H2Z" fill="F"/>' },
  { id: 'diamond', cat: 'Basic', name: 'Diamond', svg: '<path d="M50 2 L98 50 L50 98 L2 50Z" fill="F"/>' },
  { id: 'star', cat: 'Basic', name: 'Star', svg: '<path d="M50 4l13.5 27.4 30.2 4.4-21.9 21.3 5.2 30.1L50 73 23 87.2l5.2-30.1L6.3 35.8l30.2-4.4z" fill="F"/>' },
  { id: 'starline', cat: 'Basic', name: 'Star outline', svg: '<path d="M50 8l12.4 25.1 27.7 4-20 19.6 4.7 27.6L50 71.3 25.2 84.3l4.7-27.6-20-19.6 27.7-4z" fill="none" stroke="F" stroke-width="5" stroke-linejoin="round"/>' },
  { id: 'arrow', cat: 'Basic', name: 'Arrow', vb: [140, 100], svg: '<path d="M0 35 H85 V10 L140 50 L85 90 V65 H0Z" fill="F"/>' },
  { id: 'heart', cat: 'Basic', name: 'Heart', svg: '<path d="M50 90 C10 60 0 40 12 22 C24 6 44 12 50 26 C56 12 76 6 88 22 C100 40 90 60 50 90Z" fill="F"/>' },
  { id: 'bolt', cat: 'Racing', name: 'Lightning', vb: [70, 100], svg: '<path d="M42 0 L6 58 H32 L22 100 L66 36 H40Z" fill="F"/>' },
  { id: 'chequer', cat: 'Racing', name: 'Chequers', svg: '<rect width="100" height="100" fill="A"/><g fill="F"><rect width="25" height="25"/><rect x="50" width="25" height="25"/><rect x="25" y="25" width="25" height="25"/><rect x="75" y="25" width="25" height="25"/><rect y="50" width="25" height="25"/><rect x="50" y="50" width="25" height="25"/><rect x="25" y="75" width="25" height="25"/><rect x="75" y="75" width="25" height="25"/></g>' },
  { id: 'chequerfade', cat: 'Racing', name: 'Chequer fade', vb: [200, 50], svg: '<g fill="F"><rect width="12" height="12"/><rect y="24" width="12" height="12"/><rect x="12" y="12" width="12" height="12"/><rect x="12" y="36" width="12" height="12"/><rect x="24" width="12" height="12"/><rect x="24" y="24" width="12" height="12"/><rect x="40" y="12" width="10" height="10"/><rect x="40" y="34" width="10" height="10"/><rect x="56" width="9" height="9"/><rect x="56" y="24" width="9" height="9"/><rect x="72" y="12" width="7" height="7"/><rect x="72" y="34" width="7" height="7"/><rect x="88" y="3" width="5" height="5"/><rect x="88" y="26" width="5" height="5"/><rect x="102" y="15" width="3" height="3"/><rect x="102" y="38" width="3" height="3"/></g>' },
  { id: 'flame', cat: 'Racing', name: 'Flame', vb: [200, 100], svg: '<path d="M0 60 C40 55 50 20 80 30 C70 45 90 50 110 35 C105 55 130 55 150 40 C145 60 170 60 200 50 C170 75 120 90 60 85 C30 82 10 75 0 60Z" fill="F"/>' },
  { id: 'wing', cat: 'Racing', name: 'Wing', vb: [200, 80], svg: '<path d="M0 40 C50 0 120 0 200 10 C150 20 120 30 110 40 C130 40 160 42 180 50 C130 55 90 60 60 75 C40 60 20 50 0 40Z" fill="F"/>' },
  { id: 'compass', cat: 'Racing', name: 'Compass star', svg: '<path d="M50 2 L58 42 L98 50 L58 58 L50 98 L42 58 L2 50 L42 42Z" fill="F"/><path d="M2 50 L42 42 L42 58Z" fill="A"/>' },
  { id: 'number-plate', cat: 'Racing', name: 'Number plate', vb: [140, 100], svg: '<rect x="2" y="2" width="136" height="96" rx="14" fill="F" stroke="O" stroke-width="6"/>' },
  { id: 'splat', cat: 'Racing', name: 'Splatter', svg: '<path d="M50 10 C58 30 75 18 70 36 C90 34 92 50 74 54 C88 70 72 80 62 68 C60 90 42 88 44 70 C26 84 18 70 30 60 C10 58 12 42 30 42 C18 26 34 18 44 32 C42 18 46 10 50 10Z" fill="F"/>' },
  { id: 'halftone', cat: 'Racing', name: 'Halftone', vb: [200, 100], svg: '<g fill="F">' + Array.from({ length: 10 }, (_, i) => Array.from({ length: 5 }, (_, j) => `<circle cx="${10 + i * 20}" cy="${10 + j * 20}" r="${Math.max(1, 9 - i * 0.85)}"/>`).join('')).join('') + '</g>' },
  { id: 'flag-za', cat: 'Flags', name: 'South Africa', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#002395"/><rect width="150" height="50" fill="#E03C31"/><path d="M0 0 L60 50 L0 100Z" fill="#000"/><path d="M0 0 L60 50 H150 M60 50 L0 100" fill="none" stroke="#fff" stroke-width="33"/><path d="M0 0 L60 50 H150 M60 50 L0 100" fill="none" stroke="#007A4D" stroke-width="20"/><path d="M0 12 L46 50 L0 88" fill="none" stroke="#FFB81C" stroke-width="6"/><path d="M0 22 L34 50 L0 78Z" fill="#000"/>' },
  { id: 'flag-gb', cat: 'Flags', name: 'United Kingdom', vb: [200, 100], fixed: true, svg: '<rect width="200" height="100" fill="#012169"/><path d="M0 0 L200 100 M200 0 L0 100" stroke="#fff" stroke-width="20"/><path d="M0 0 L200 100 M200 0 L0 100" stroke="#C8102E" stroke-width="7"/><path d="M100 0 V100 M0 50 H200" stroke="#fff" stroke-width="33"/><path d="M100 0 V100 M0 50 H200" stroke="#C8102E" stroke-width="20"/>' },
  { id: 'flag-nl', cat: 'Flags', name: 'Netherlands', vb: [150, 100], fixed: true, svg: '<rect width="150" height="34" fill="#AE1C28"/><rect y="33" width="150" height="34" fill="#fff"/><rect y="66" width="150" height="34" fill="#21468B"/>' },
  { id: 'flag-de', cat: 'Flags', name: 'Germany', vb: [166, 100], fixed: true, svg: '<rect width="166" height="34" fill="#000"/><rect y="33" width="166" height="34" fill="#DD0000"/><rect y="66" width="166" height="34" fill="#FFCE00"/>' },
  { id: 'flag-fr', cat: 'Flags', name: 'France', vb: [150, 100], fixed: true, svg: '<rect width="50" height="100" fill="#0055A4"/><rect x="50" width="50" height="100" fill="#fff"/><rect x="100" width="50" height="100" fill="#EF4135"/>' },
  { id: 'flag-it', cat: 'Flags', name: 'Italy', vb: [150, 100], fixed: true, svg: '<rect width="50" height="100" fill="#009246"/><rect x="50" width="50" height="100" fill="#fff"/><rect x="100" width="50" height="100" fill="#CE2B37"/>' },
  { id: 'flag-es', cat: 'Flags', name: 'Spain', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#AA151B"/><rect y="25" width="150" height="50" fill="#F1BF00"/>' },
  { id: 'flag-mc', cat: 'Flags', name: 'Monaco', vb: [125, 100], fixed: true, svg: '<rect width="125" height="50" fill="#CE1126"/><rect y="50" width="125" height="50" fill="#fff"/>' },
  { id: 'flag-jp', cat: 'Flags', name: 'Japan', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#fff"/><circle cx="75" cy="50" r="30" fill="#BC002D"/>' },
  { id: 'flag-br', cat: 'Flags', name: 'Brazil', vb: [143, 100], fixed: true, svg: '<rect width="143" height="100" fill="#009C3B"/><path d="M71.5 9 L134 50 L71.5 91 L9 50Z" fill="#FFDF00"/><circle cx="71.5" cy="50" r="21" fill="#002776"/>' },
  { id: 'flag-us', cat: 'Flags', name: 'United States', vb: [190, 100], fixed: true, svg: '<rect width="190" height="100" fill="#fff"/>' + Array.from({ length: 7 }, (_, i) => `<rect y="${i * 15.38}" width="190" height="7.69" fill="#B22234"/>`).join('') + '<rect width="76" height="53.8" fill="#3C3B6E"/>' },
  { id: 'flag-au', cat: 'Flags', name: 'Australia', vb: [200, 100], fixed: true, svg: '<rect width="200" height="100" fill="#012169"/><path d="M0 0 L100 50 M100 0 L0 50" stroke="#fff" stroke-width="10"/><path d="M50 0 V50 M0 25 H100" stroke="#fff" stroke-width="16"/><path d="M50 0 V50 M0 25 H100" stroke="#C8102E" stroke-width="9"/><circle cx="50" cy="76" r="9" fill="#fff"/><circle cx="150" cy="22" r="5" fill="#fff"/><circle cx="170" cy="50" r="5" fill="#fff"/><circle cx="150" cy="82" r="5" fill="#fff"/><circle cx="130" cy="46" r="5" fill="#fff"/>' },
];
const ED_FONTS = [['Bahnschrift', 'Racing'], ['Arial Black', 'Heavy'], ['Impact', 'Condensed'], ['Franklin Gothic Medium', 'Sport'], ['Segoe UI', 'Clean'], ['Trebuchet MS', 'Rounded'], ['Georgia', 'Serif'], ['Consolas', 'Mono'], ['Segoe Script', 'Script'], ['Comic Sans MS', 'Casual']];
const ED_SWATCH = ['#f4f4f1', '#111111', '#E10600', '#C8102E', '#001E6E', '#0055A4', '#007A4D', '#2FD07A', '#FFB81C', '#FF6A00', '#B44CEB', '#9aa0a6'];

const edApi = () => window.api?.editor || window.__edStub || null; // (__edStub: the browser copy's stand-in, for testing)
const edUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const edEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const edNew = () => ({ id: edUid(), name: 'New helmet', at: new Date().toISOString(), base: { color: '#f4f4f1', color2: '#001E6E', fade: false, dir: 'tb' }, layers: [], images: {} });

/** The page: a slot for the editor (kept alive across redraws), or why it can't open. */
function renderEditor() {
  if (!DEV_MODE || !edApi()) return `<div class="page-head"><h1>Editor</h1></div><div class="panel"><div class="panel-b muted">The editor is a dev-mode feature of the desktop app.</div></div>`;
  return `<div id="ed-slot"></div>`;
}
/** After each redraw: the editor's element back into its slot (built the first time). */
function edMount() {
  const slot = document.getElementById('ed-slot'); if (!slot) return;
  if (!ED.root) edBuild();
  slot.replaceWith(ED.root);
  if (!ED.ready && !ED.loading) edLoad();
  edResize();
}
function edBuild() {
  const el = document.createElement('div'); el.className = 'he'; el.id = 'ed-root';
  el.innerHTML = `
    <div class="he-head">
      <div><h1>Editor <span class="tag beta">BETA</span> <span class="tag he-dev">DEV</span></h1><div class="muted">Design your own helmet for F1 25, exported for SWOFTY's Helmet Exchange.</div></div>
      <div class="he-row"><div class="he-designs"><button class="btn ghost" data-ed="designs">My designs ▾</button><div class="he-menu" id="ed-menu"></div></div><button class="btn" data-ed="new">New helmet</button></div>
    </div>
    <div class="he-tabs"><button class="he-tab on">Helmet</button><button class="he-tab off" title="Coming later">Car livery</button></div>
    <div class="he-ed">
      <section class="panel he-panel">
        <div class="he-ph"><span class="label">Add</span></div>
        <div class="he-pb">
          <div class="seg he-seg" id="ed-libtabs"><button data-lib="shapes" class="on">Shapes</button><button data-lib="text">Text</button><button data-lib="images">Images</button></div>
          <div id="ed-lib"></div>
        </div>
      </section>
      <section class="panel he-view" id="ed-view">
        <canvas id="ed-canvas"></canvas>
        <canvas id="ed-flat" class="he-flat"></canvas>
        <svg id="ed-gizmo" class="he-gizmo"></svg>
        <div class="he-vbar">
          <div class="he-row"><button class="btn sm" data-cam="front">Front</button><button class="btn sm" data-cam="left">Left</button><button class="btn sm" data-cam="right">Right</button><button class="btn sm" data-cam="back">Back</button><button class="btn sm" data-cam="top">Top</button></div>
          <div class="he-row"><div class="seg he-seg" id="ed-mode"><button data-mode="3d" class="on">3D</button><button data-mode="flat">Flat</button></div><button class="btn sm" data-ed="undo" title="Undo (Ctrl+Z)">↶</button><button class="btn sm" data-ed="redo" title="Redo (Ctrl+Y)">↷</button></div>
        </div>
        <div class="he-msg" id="ed-msg"></div>
        <div class="he-foot"><span class="he-hint" id="ed-hint">Pick something from Add · drag it on the helmet · corners size it · the top handle turns it · drag empty space to turn the helmet</span></div>
      </section>
      <section class="panel he-panel">
        <div class="he-ph"><span class="label">Helmet base</span><span class="muted he-small">under every layer</span></div>
        <div class="he-pb he-props" id="ed-base" style="flex:0 0 auto"></div>
        <div class="he-ph he-bt"><span class="label">Layers</span><div class="he-row"><button class="btn sm ghost" data-ed="dup" title="Duplicate">⎘</button><button class="btn sm ghost" data-ed="up" title="Move up">▲</button><button class="btn sm ghost" data-ed="down" title="Move down">▼</button><button class="btn sm ghost" data-ed="del" title="Delete">✕</button></div></div>
        <div class="he-pb" id="ed-layers" style="flex:0 1 auto;max-height:260px"></div>
        <div class="he-ph he-bt"><span class="label" id="ed-ptitle">Layer</span><span class="muted he-small" id="ed-pkind"></span></div>
        <div class="he-pb he-props" id="ed-props"></div>
      </section>
    </div>
    <div class="he-bottom">
      <div class="he-row"><input class="he-name" id="ed-name" maxlength="40" title="The helmet's name"><span class="muted he-small" id="ed-status"></span></div>
      <div class="he-row"><button class="btn" data-ed="save">Save</button><button class="btn" data-ed="import-tex" title="A whole texture in the game's layout (2048 x 1024), made in Blender or Photoshop">Load texture…</button><button class="btn" data-ed="png">Export PNG</button><button class="btn primary" data-ed="export">Export for Helmet Exchange</button></div>
    </div>
    <div class="he-modal" id="ed-modal"></div>
    <input type="file" id="ed-file" accept="image/png,image/webp,image/jpeg" hidden>
    <input type="file" id="ed-texfile" accept="image/png" hidden>`;
  ED.root = el;
  el.addEventListener('click', edClick);
  el.addEventListener('input', edInput);
  el.addEventListener('change', edInput);
  el.querySelector('#ed-file').addEventListener('change', edImportImage);
  el.querySelector('#ed-texfile').addEventListener('change', edImportTexture);
  document.addEventListener('keydown', edKey);
  if (!ED.design) ED.design = edNew();
  edLib(); edPanels();
}

// ---- loading the helmet and the 3D view
async function edLoad() {
  ED.loading = true; edMsg('Reading the helmet from F1 25…');
  let r = null; try { r = await edApi().load(); } catch (e) { r = { ok: false, error: e.message }; }
  ED.loading = false;
  if (!r?.ok) { ED.err = r?.error || 'Couldn’t read the helmet.'; ED.needGame = !!r?.needGame; edMsg(`${edEsc(ED.err)}${ED.needGame ? '<br><button class="btn" data-ed="pick-game" style="margin-top:8px">Pick the F1 25 folder…</button>' : ''}`); return; }
  try { edThree(r); ED.ready = true; edMsg(''); edBake(); edList(); } catch (e) { console.error('editor', e); edMsg('The 3D view couldn’t start: ' + edEsc(e.message)); }
}
function edMsg(html) { const m = ED.root?.querySelector('#ed-msg'); if (m) { m.innerHTML = html; m.style.display = html ? '' : 'none'; } }
function edThree(r) {
  const cv = ED.root.querySelector('#ed-canvas');
  const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); R.setPixelRatio(window.devicePixelRatio || 1); R.outputEncoding = THREE.sRGBEncoding;
  const f32 = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const pos = f32(r.pos), uv = f32(r.uv); const idx = new Uint16Array(r.idx.buffer.slice(r.idx.byteOffset, r.idx.byteOffset + r.idx.byteLength));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); g.computeBoundingBox();
  const bb = g.boundingBox; const C = new THREE.Vector3(); bb.getCenter(C); const RAD = (bb.max.z - bb.min.z) / 2;
  // which way the normals point (most of the shell faces outwards)
  let side = 0; const P = g.attributes.position.array, N = g.attributes.normal.array; for (let i = 0; i < P.length; i += 21) side += Math.sign((P[i] - C.x) * N[i] + (P[i + 1] - C.y) * N[i + 1] + (P[i + 2] - C.z) * N[i + 2]); side = side >= 0 ? 1 : -1;
  // the game's own texture (the inside and the trim) and where the trim is
  const baseTex = new THREE.DataTexture(new Uint8Array(r.base.buffer.slice(r.base.byteOffset, r.base.byteOffset + r.base.byteLength)), ED_W, ED_H, THREE.RGBAFormat); baseTex.needsUpdate = true; baseTex.flipY = false;
  const trimRGBA = new Uint8Array(ED_W * ED_H * 4); const tr = new Uint8Array(r.trim.buffer.slice(r.trim.byteOffset, r.trim.byteOffset + r.trim.byteLength)); for (let p = 0; p < ED_W * ED_H; p++) trimRGBA[p * 4 + 3] = tr[p];
  const trimTex = new THREE.DataTexture(trimRGBA, ED_W, ED_H, THREE.RGBAFormat); trimTex.needsUpdate = true; trimTex.flipY = false;
  // the baked texture
  const RT = new THREE.WebGLRenderTarget(ED_W, ED_H, { depthBuffer: false, stencilBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  RT.texture.encoding = THREE.sRGBEncoding; RT.texture.anisotropy = 8;
  const bakeVS = `varying vec3 vP; varying vec3 vN; varying vec2 vUv; void main(){ vP = position; vN = normal; vUv = uv; gl_Position = vec4(uv.x * 2.0 - 1.0, uv.y * 2.0 - 1.0, 0.0, 1.0); }`;
  const quadVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const common = { uC: { value: C }, uR: { value: RAD }, uSide: { value: side }, uBase: { value: baseTex }, uTrim: { value: trimTex } };
  // 1: everything starts as the base colour, the trim as the game has it
  const fillMat = new THREE.ShaderMaterial({ vertexShader: quadVS, uniforms: { ...common, uCol: { value: new THREE.Color() } }, depthTest: false, depthWrite: false,
    fragmentShader: `uniform vec3 uCol; uniform sampler2D uBase; uniform sampler2D uTrim; varying vec2 vUv; void main(){ float t = texture2D(uTrim, vUv).a; gl_FragColor = vec4(mix(uCol, texture2D(uBase, vUv).rgb, t), 1.0); }` });
  // 2: the base on the shell (the fade), the inside as the game has it
  const baseMat = new THREE.ShaderMaterial({ vertexShader: bakeVS, side: THREE.DoubleSide, depthTest: false, depthWrite: false, uniforms: { ...common, uCol: { value: new THREE.Color() }, uCol2: { value: new THREE.Color() }, uFade: { value: 0 }, uDir: { value: 0 }, uMin: { value: bb.min }, uMax: { value: bb.max } },
    fragmentShader: `uniform vec3 uC; uniform float uSide; uniform sampler2D uBase; uniform vec3 uCol; uniform vec3 uCol2; uniform float uFade; uniform float uDir; uniform vec3 uMin; uniform vec3 uMax; varying vec3 vP; varying vec3 vN; varying vec2 vUv;
      void main(){ if (dot(normalize(vN), vP - uC) * uSide < 0.0) { gl_FragColor = vec4(texture2D(uBase, vUv).rgb, 1.0); return; }
        float t = uDir < 0.5 ? (uMax.y - vP.y) / (uMax.y - uMin.y) : (uMax.z - vP.z) / (uMax.z - uMin.z); t = smoothstep(0.15, 0.85, t);
        gl_FragColor = vec4(mix(uCol, uCol2, t * uFade), 1.0); }` });
  // 3: a layer
  const layerMat = new THREE.ShaderMaterial({ vertexShader: bakeVS, side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { ...common, uTex: { value: null }, uMode: { value: 0 }, uP: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uT: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2(0.1, 0.1) }, uRot: { value: new THREE.Vector2(1, 0) }, uFlip: { value: new THREE.Vector2(1, 1) }, uW: { value: new THREE.Vector2() }, uOp: { value: 1 } },
    fragmentShader: `uniform vec3 uC; uniform float uR; uniform float uSide; uniform sampler2D uTex; uniform float uMode; uniform vec3 uP; uniform vec3 uN; uniform vec3 uT; uniform vec3 uU; uniform vec2 uSize; uniform vec2 uRot; uniform vec2 uFlip; uniform vec2 uW; uniform float uOp; varying vec3 vP; varying vec3 vN; varying vec2 vUv;
      void main(){
        vec3 n = normalize(vN); if (dot(n, vP - uC) * uSide < 0.0) discard;
        if (uMode > 1.5) { vec4 c = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y)); gl_FragColor = vec4(c.rgb, c.a * uOp); return; }
        vec2 q;
        if (uMode < 0.5) { vec3 d = vP - uP; if (dot(n, uN) * uSide < 0.15 || abs(dot(d, uN)) > 0.07) discard; q = vec2(dot(d, uT), dot(d, uU)); }
        else { float th = atan(vP.z - uC.z, vP.y - uC.y); q = vec2(vP.x - uC.x, -th * uR) - uW; }
        q = vec2(uRot.x * q.x + uRot.y * q.y, -uRot.y * q.x + uRot.x * q.y);
        vec2 t = q / uSize * uFlip + 0.5;
        if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) discard;
        vec4 c = texture2D(uTex, t); if (c.a < 0.004) discard;
        gl_FragColor = vec4(c.rgb, c.a * uOp); }` });
  layerMat.blending = THREE.CustomBlending; layerMat.blendSrc = THREE.SrcAlphaFactor; layerMat.blendDst = THREE.OneMinusSrcAlphaFactor; layerMat.blendSrcAlpha = THREE.OneFactor; layerMat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  // 4: the trim on top of everything
  const trimMat = new THREE.ShaderMaterial({ vertexShader: quadVS, uniforms: { ...common }, transparent: true, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D uBase; uniform sampler2D uTrim; varying vec2 vUv; void main(){ float t = texture2D(uTrim, vUv).a; if (t < 0.01) discard; gl_FragColor = vec4(texture2D(uBase, vUv).rgb, t); }` });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fillMat); const bakeMesh = new THREE.Mesh(g, baseMat); bakeMesh.frustumCulled = false; quad.frustumCulled = false;
  const bakeScene = new THREE.Scene(); bakeScene.add(quad); bakeScene.add(bakeMesh); const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // the view
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10151f);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4256, 0.85)); const k1 = new THREE.DirectionalLight(0xffffff, 0.75); k1.position.set(1.5, 2, 1.5); scene.add(k1); const k2 = new THREE.DirectionalLight(0x9fb4ff, 0.3); k2.position.set(-2, 0.5, -1); scene.add(k2);
  const viewMat = new THREE.MeshStandardMaterial({ map: RT.texture, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, viewMat); mesh.position.copy(C).multiplyScalar(-1); scene.add(mesh);
  ED.three = { R, g, C, RAD, side, RT, fillMat, baseMat, layerMat, trimMat, quad, bakeMesh, bakeScene, bakeCam, scene, cam, mesh, yaw: Math.PI / 2, pitch: 0.08, dist: 0.9, tex: new Map(), ray: new THREE.Raycaster() };
  cv.addEventListener('pointerdown', edDown); cv.addEventListener('pointermove', edMove); cv.addEventListener('pointerup', edUp); cv.addEventListener('pointercancel', edUp);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const T = ED.three; T.dist = Math.max(0.45, Math.min(1.8, T.dist * (e.deltaY > 0 ? 1.08 : 0.93))); edDraw(); }, { passive: false });
  cv.addEventListener('dragover', (e) => e.preventDefault()); cv.addEventListener('drop', edDrop);
  new ResizeObserver(() => edResize()).observe(ED.root.querySelector('#ed-view'));
  edResize();
}
function edResize() {
  const T = ED.three; if (!T) return; const v = ED.root.querySelector('#ed-view'); const w = v.clientWidth, h = v.clientHeight; if (!w || !h) return;
  T.R.setSize(w, h, false); T.cam.aspect = w / h; T.cam.updateProjectionMatrix(); edDraw();
}
let edRaf = 0;
function edDraw() { if (edRaf) return; edRaf = requestAnimationFrame(() => { edRaf = 0; edFrame(); }); }
function edFrame() {
  const T = ED.three; if (!T) return;
  const { yaw, pitch, dist } = T; T.cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); T.cam.lookAt(0, 0, 0);
  T.R.setRenderTarget(null); T.R.render(T.scene, T.cam);
  edGizmo();
  if (ED.view === 'flat') edFlat();
}

// ---- layers as textures
const edHex = (h) => new THREE.Color(h);
function edShapeSvg(L) { const S = ED_SHAPES.find(s => s.id === L.shape); if (!S) return null; const [w, h] = S.vb || [100, 100]; const c = L.colors || []; return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 6}" height="${h * 6}">${S.svg.replace(/="F"/g, `="${c[0] || '#ffffff'}"`).replace(/="O"/g, `="${c[1] || '#111111'}"`).replace(/="A"/g, `="${c[2] || '#E10600'}"`)}</svg>` }; }
/** A layer's picture as a canvas (made again only when what it shows changes). */
function edSource(L) {
  const key = JSON.stringify([L.kind, L.shape, L.colors, L.text, L.image]);
  const T = ED.three; const hit = T.tex.get(L.id); if (hit && hit.key === key) return Promise.resolve(hit);
  const done = (cv) => { const t = new THREE.CanvasTexture(cv); t.encoding = THREE.LinearEncoding; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; const old = T.tex.get(L.id); if (old) old.tex.dispose(); const o = { key, cv, tex: t, data: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), aspect: cv.height / cv.width }; T.tex.set(L.id, o); return o; };
  if (L.kind === 'text') return Promise.resolve(done(edTextCanvas(L.text)));
  const src = L.kind === 'shape' ? (() => { const s = edShapeSvg(L); return s && 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg); })() : ED.design.images[L.image];
  if (!src) return Promise.resolve(null);
  return new Promise((ok) => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)) * (L.kind === 'shape' ? 1 : 1); const cv = document.createElement('canvas'); cv.width = Math.max(4, Math.round(im.naturalWidth * k)); cv.height = Math.max(4, Math.round(im.naturalHeight * k)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); ok(done(cv)); }; im.onerror = () => ok(null); im.src = src; });
}
/** A text sticker: the words in their font, with spacing, slant and an outline, on a canvas cut to fit. */
function edTextCanvas(t) {
  const px = 160; const font = `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${px}px "${t.font}"`;
  const m = document.createElement('canvas').getContext('2d'); m.font = font; m.letterSpacing = `${(t.sp || 0) * 4}px`;
  const str = t.str || ' '; const tw = Math.ceil(m.measureText(str).width); const ow = (t.ow || 0) * 3; const slant = Math.tan((t.sl || 0) * Math.PI / 180);
  const pad = 20 + ow; const w = Math.min(4096, tw + pad * 2 + Math.ceil(px * slant)), h = Math.ceil(px * 1.3) + pad * 2;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.font = font; g.letterSpacing = `${(t.sp || 0) * 4}px`; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.setTransform(1, 0, -slant, 1, px * slant * 0.5, 0);
  if (ow) { g.strokeStyle = t.outline || '#ffffff'; g.lineWidth = ow * 2; g.strokeText(str, pad, h / 2); }
  g.fillStyle = t.fill || '#111111'; g.fillText(str, pad, h / 2);
  return cv;
}

// ---- baking: base, layers (and their mirrors), trim
let edBaking = false, edBakeAgain = false;
async function edBake() {
  const T = ED.three; if (!T) return; if (edBaking) { edBakeAgain = true; return; } edBaking = true;
  const D = ED.design; const srcs = await Promise.all(D.layers.map(L => L.visible === false ? null : edSource(L)));
  const R = T.R; R.setRenderTarget(T.RT); R.autoClear = false; R.clear();
  // the base
  T.fillMat.uniforms.uCol.value.set(D.base.color); T.quad.material = T.fillMat; T.quad.visible = true; T.bakeMesh.visible = false; R.render(T.bakeScene, T.bakeCam);
  T.baseMat.uniforms.uCol.value.set(D.base.color); T.baseMat.uniforms.uCol2.value.set(D.base.color2 || D.base.color); T.baseMat.uniforms.uFade.value = D.base.fade ? 1 : 0; T.baseMat.uniforms.uDir.value = D.base.dir === 'fb' ? 1 : 0;
  T.quad.visible = false; T.bakeMesh.visible = true; T.bakeMesh.material = T.baseMat; R.render(T.bakeScene, T.bakeCam);
  // the layers, first at the bottom
  T.bakeMesh.material = T.layerMat; const U = T.layerMat.uniforms;
  D.layers.forEach((L, k) => {
    const s = srcs[k]; if (!s) return;
    const draw = (mirror) => { const F = edFrameOf(L, mirror, s.aspect); U.uTex.value = s.tex; U.uMode.value = F.mode; U.uP.value.copy(F.P); U.uN.value.copy(F.N); U.uT.value.copy(F.T); U.uU.value.copy(F.U); U.uSize.value.set(F.w, F.h); U.uRot.value.set(Math.cos(F.rot), Math.sin(F.rot)); U.uFlip.value.set(F.fx, F.fy); U.uW.value.set(F.wx, F.wy); U.uOp.value = L.opacity ?? 1; R.render(T.bakeScene, T.bakeCam); };
    draw(false); if (L.mirror && L.mode !== 'uv') draw(true);
  });
  // the trim
  T.bakeMesh.visible = false; T.quad.visible = true; T.quad.material = T.trimMat; R.render(T.bakeScene, T.bakeCam);
  R.autoClear = true; R.setRenderTarget(null);
  edBaking = false; ED.bakeGen = (ED.bakeGen || 0) + 1; edDraw();
  if (edBakeAgain) { edBakeAgain = false; edBake(); }
}
/**
 * Where a layer sits: { mode 0 stick / 1 wrap / 2 uv, P (point on the shell), N (the way it faces), T and U (its right
 * and up), w and h (metres), rot (radians), fx and fy (flips), wx and wy (its centre round the shell, for wrap) }.
 * The mirror copy sits at x reflected; shapes are reflected (a swoosh still points forwards), text and images read the right way.
 */
function edFrameOf(L, mirror, aspect) {
  const w = L.size || 0.08, h = w * (aspect || 1) * (L.stretch || 1); const reflect = mirror && L.kind === 'shape' && L.reflect !== false;
  const fx = (L.flipX ? -1 : 1) * (reflect ? -1 : 1), fy = L.flipY ? -1 : 1; const rot = (L.rot || 0) * Math.PI / 180 * (reflect ? -1 : 1);
  if (L.mode === 'uv') return { mode: 2, P: new THREE.Vector3(), N: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), w: 1, h: 1, rot: 0, fx: 1, fy: 1, wx: 0, wy: 0 };
  if (L.mode === 'wrap') { const wx = (L.wx || 0) * (mirror ? -1 : 1); return { mode: 1, P: new THREE.Vector3(), N: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), w, h, rot: mirror ? -rot : rot, fx: mirror && L.kind !== 'shape' ? -fx : fx, fy, wx, wy: L.wy || 0 }; }
  const P = new THREE.Vector3(...(L.p || [0, 0, 0])), N = new THREE.Vector3(...(L.n || [1, 0, 0])).normalize();
  if (mirror) { P.x = 2 * ED.three.C.x - P.x; N.x = -N.x; }
  const { T, U } = edTangents(N); return { mode: 0, P, N, T, U, w, h, rot, fx, fy, wx: 0, wy: 0 };
}
/** A sticker's right and up on the surface, as seen from outside: up is as close to the world's up as the surface allows. */
function edTangents(N) {
  let up = new THREE.Vector3(0, 1, 0); if (Math.abs(N.dot(up)) > 0.92) up = new THREE.Vector3(0, 0, -1).multiplyScalar(Math.sign(N.y) || 1);
  const U = up.clone().sub(N.clone().multiplyScalar(N.dot(up))).normalize(); const T = new THREE.Vector3().crossVectors(U, N).normalize(); return { T, U };
}
/** Wrap coordinates of a point on the shell: x across, and the distance round the curve (0 on top, + towards the back). */
function edWrapOf(p) { const C = ED.three.C; return [p.x - C.x, -Math.atan2(p.z - C.z, p.y - C.y) * ED.three.RAD]; }

// ---- the panels
function edLib() {
  const box = ED.root.querySelector('#ed-lib'); if (!box) return;
  ED.root.querySelectorAll('#ed-libtabs button').forEach(b => b.classList.toggle('on', b.dataset.lib === ED.lib));
  if (ED.lib === 'shapes') {
    const q = (ED.q || '').toLowerCase(); const cats = [...new Set(ED_SHAPES.map(s => s.cat))];
    box.innerHTML = `<input class="he-search" id="ed-q" placeholder="Search shapes (stripe, star, flag…)" value="${edEsc(ED.q || '')}">` + cats.map(c => { const list = ED_SHAPES.filter(s => s.cat === c && (!q || (s.name + ' ' + s.cat).toLowerCase().includes(q))); if (!list.length) return '';
      return `<div class="he-group"><span class="label">${edEsc(c)}</span><span class="muted he-small">${list.length}</span></div><div class="he-grid">${list.map(s => { const sv = edShapeSvg({ shape: s.id, colors: ['#E7ECF5', '#8B97AF', '#E10600'] }); return `<button class="he-tile" draggable="true" data-add="shape" data-shape="${s.id}" title="${edEsc(s.name)}">${sv.svg.replace(/width="\d+" height="\d+"/, '')}</button>`; }).join('')}</div>`; }).join('');
  } else if (ED.lib === 'text') {
    const t = ED.text ||= { str: 'JORDAAN 21', font: 'Bahnschrift', fill: '#111111', outline: '#ffffff', ow: 0, sp: 2, sl: 0, bold: true, italic: false };
    box.innerHTML = `<div class="he-tc">${edTextForm(t, 'tt')}<button class="btn primary he-wide" data-ed="add-text">Add to helmet</button><div class="muted he-small">The text becomes one sticker: size it, turn it and mirror it like any other. Select it later to change the words or the font.</div></div>`;
    edTextPreview();
  } else {
    const imgs = Object.entries(ED.design.images).filter(([, v]) => v);
    box.innerHTML = `<div class="he-tc"><button class="btn he-wide" data-ed="import-img">Import image…</button><div class="muted he-small">PNG, WebP or JPG. After adding one, "Remove background" in its settings clears a colour you click on.</div>
      ${imgs.length ? `<div class="he-group"><span class="label">In this design</span></div><div class="he-grid">${imgs.map(([id, src]) => `<button class="he-tile he-img" draggable="true" data-add="image" data-image="${id}"><img src="${src}" alt=""></button>`).join('')}</div>` : ''}</div>`;
  }
}
function edTextForm(t, p) {
  return `<input class="he-text" data-tf="str" value="${edEsc(t.str)}" maxlength="40" placeholder="Your text">
    <div class="he-tprev"><canvas id="ed-tprev-${p}"></canvas></div>
    <div class="label">Font</div><div class="he-fonts">${ED_FONTS.map(([f, d]) => `<button class="he-font ${t.font === f ? 'on' : ''}" data-tf="font" data-v="${edEsc(f)}" style="font-family:'${edEsc(f)}'">${edEsc(t.str || 'Text')}<small>${edEsc(f)} · ${d}</small></button>`).join('')}</div>
    <div class="he-prow"><span>Colour</span>${edSw(t.fill, 'data-tf="fill"')}</div>
    <div class="he-prow"><span>Outline</span><input type="range" data-tf="ow" min="0" max="10" value="${t.ow}"><span class="v">${t.ow ? t.ow : 'none'}</span></div>
    ${t.ow ? `<div class="he-prow"><span></span>${edSw(t.outline, 'data-tf="outline"')}</div>` : ''}
    <div class="he-prow"><span>Spacing</span><input type="range" data-tf="sp" min="-4" max="24" value="${t.sp}"><span class="v">${t.sp}</span></div>
    <div class="he-prow"><span>Slant</span><input type="range" data-tf="sl" min="-20" max="25" value="${t.sl}"><span class="v">${t.sl}°</span></div>
    <div class="he-row"><button class="btn sm ${t.bold ? 'on' : ''}" data-tf="bold">B</button><button class="btn sm ${t.italic ? 'on' : ''}" data-tf="italic" style="font-style:italic">I</button></div>`;
}
const edSw = (cur, attr) => `<div class="he-sw">${ED_SWATCH.map(c => `<b class="${String(cur).toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="background:${c}" ${attr} data-v="${c}"></b>`).join('')}<label class="he-any" title="Any colour" style="background:${edEsc(cur)}"><input type="color" ${attr} value="${edEsc(cur)}"></label></div>`;
function edTextPreview() {
  for (const p of ['tt', 'tl']) { const cv = ED.root.querySelector('#ed-tprev-' + p); if (!cv) continue; const t = p === 'tt' ? ED.text : ED.design.layers.find(l => l.id === ED.sel)?.text; if (!t) continue;
    const src = edTextCanvas(t); const box = cv.parentElement; const W = box.clientWidth || 220, H = box.clientHeight || 70; cv.width = W * 2; cv.height = H * 2; const g = cv.getContext('2d'); const k = Math.min(cv.width / src.width, cv.height / src.height) * 0.92; g.drawImage(src, (cv.width - src.width * k) / 2, (cv.height - src.height * k) / 2, src.width * k, src.height * k); }
}
function edPanels() { edBasePanel(); edLayers(); edProps(); const n = ED.root.querySelector('#ed-name'); if (n && document.activeElement !== n) n.value = ED.design.name; edStatus(); }
function edBasePanel() {
  const b = ED.design.base; const el = ED.root.querySelector('#ed-base'); if (!el) return;
  el.innerHTML = `<div class="he-baserow"><span class="he-chip" style="background:${b.fade ? `linear-gradient(${b.dir === 'fb' ? '90deg' : '180deg'}, ${b.color}, ${b.color2})` : b.color}"></span>${edSw(b.color, 'data-base="color"')}</div>
    <label class="he-chk"><input type="checkbox" data-base="fade" ${b.fade ? 'checked' : ''}> Fade to a second colour, <select class="he-mini" data-base="dir"><option value="tb" ${b.dir !== 'fb' ? 'selected' : ''}>top to bottom</option><option value="fb" ${b.dir === 'fb' ? 'selected' : ''}>front to back</option></select></label>
    ${b.fade ? `<div class="he-baserow"><span class="he-chip" style="background:${b.color2}"></span>${edSw(b.color2, 'data-base="color2"')}</div>` : ''}`;
}
function edLayers() {
  const el = ED.root.querySelector('#ed-layers'); if (!el) return; const L = ED.design.layers;
  if (!L.length) { el.innerHTML = '<div class="muted he-small" style="padding:6px 2px">No layers yet. Add a shape, text or an image.</div>'; return; }
  el.innerHTML = `<div class="he-layers">${L.slice().reverse().map(l => `<div class="he-ly ${l.id === ED.sel ? 'sel' : ''} ${l.visible === false ? 'hid' : ''}" data-layer="${l.id}">
    <span class="he-th">${edThumb(l)}</span><span class="he-nm">${edEsc(l.name)}<small>${edEsc(edKindLine(l))}</small></span>
    <span class="he-ic"><button data-vis="${l.id}" title="${l.visible === false ? 'Show' : 'Hide'}">${l.visible === false ? '◌' : '●'}</button><button data-lock="${l.id}" title="${l.locked ? 'Unlock' : 'Lock'}">${l.locked ? '🔒' : '◦'}</button></span></div>`).join('')}</div>`;
}
const edKindLine = (l) => [l.kind === 'shape' ? 'Shape' : l.kind === 'text' ? `Text · ${l.text.font}` : l.mode === 'uv' ? 'Whole texture' : 'Image', l.mode === 'wrap' ? 'wraps' : '', l.mirror ? 'mirrored' : ''].filter(Boolean).join(' · ');
function edThumb(l) {
  if (l.kind === 'shape') return edShapeSvg(l)?.svg.replace(/width="\d+" height="\d+"/, '') || '';
  if (l.kind === 'image') return `<img src="${ED.design.images[l.image] || ''}" alt="">`;
  return `<span style="font-family:'${edEsc(l.text.font)}';font-weight:${l.text.bold ? 700 : 400};color:${edEsc(l.text.fill)};font-size:10px;white-space:nowrap">${edEsc(l.text.str.slice(0, 8))}</span>`;
}
function edProps() {
  const el = ED.root.querySelector('#ed-props'); if (!el) return; const L = ED.design.layers.find(l => l.id === ED.sel);
  ED.root.querySelector('#ed-ptitle').textContent = L ? L.name : 'Layer'; ED.root.querySelector('#ed-pkind').textContent = L ? edKindLine(L) : '';
  if (!L) { el.innerHTML = '<div class="muted he-small">Select a layer to change it. Click a sticker on the helmet, or a layer in the list.</div>'; return; }
  const range = (k, label, min, max, step, v, show) => `<div class="he-prow"><span>${label}</span><input type="range" data-lp="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="v">${show}</span></div>`;
  const shape = ED_SHAPES.find(s => s.id === L.shape);
  el.innerHTML = `
    ${L.mode === 'uv' ? '' : range('size', 'Size', 0.01, 0.32, 0.002, L.size, Math.round(L.size * 1000) + ' mm')}
    ${L.mode === 'uv' ? '' : range('stretch', 'Stretch', 0.2, 4, 0.01, L.stretch || 1, Math.round((L.stretch || 1) * 100) + '%')}
    ${L.mode === 'uv' ? '' : range('rot', 'Rotation', -180, 180, 1, L.rot || 0, Math.round(L.rot || 0) + '°')}
    ${range('opacity', 'Opacity', 0, 1, 0.01, L.opacity ?? 1, Math.round((L.opacity ?? 1) * 100) + '%')}
    ${L.kind === 'shape' && !shape?.fixed ? `<div class="label">Colour</div>${edSw(L.colors[0], 'data-lc="0"')}${/="[OA]"/.test(shape?.svg || '') ? `<div class="label">Second colour</div>${edSw(/="A"/.test(shape.svg) ? L.colors[2] : L.colors[1], `data-lc="${/="A"/.test(shape.svg) ? 2 : 1}"`)}` : ''}` : ''}
    ${L.kind === 'text' ? `<div class="he-tc">${edTextForm(L.text, 'tl')}</div>` : ''}
    ${L.kind === 'image' && L.mode !== 'uv' ? `<button class="btn sm he-wide" data-ed="bg">Remove background…</button>` : ''}
    ${L.mode === 'uv' ? '' : `<label class="he-chk"><input type="checkbox" data-lb="mirror" ${L.mirror ? 'checked' : ''}> Mirror on the other side</label>
    <label class="he-chk"><input type="checkbox" data-lb="wrap" ${L.mode === 'wrap' ? 'checked' : ''}> Wrap round the helmet (for stripes front to back)</label>
    <div class="he-row he-wrapbtns"><button class="btn sm" data-ed="flipx">Flip ⇋</button><button class="btn sm" data-ed="flipy">Flip ⇵</button><button class="btn sm" data-ed="centre" title="On the middle line, front to back">Centre</button></div>`}`;
  edTextPreview();
}
function edStatus(msg) { const s = ED.root?.querySelector('#ed-status'); if (!s) return; s.textContent = msg || `${ED.design.layers.length} layer${ED.design.layers.length === 1 ? '' : 's'}${ED.dirty ? ' · not saved yet' : ED.savedAt ? ' · saved' : ''}`; }

// ---- changes (each one undoable), saved a moment after the last
function edSnap() { return JSON.stringify({ name: ED.design.name, base: ED.design.base, layers: ED.design.layers }); }
function edCommit(fn, { bake = true, panels = true } = {}) {
  ED.undo.push(edSnap()); if (ED.undo.length > 100) ED.undo.shift(); ED.redo = []; ED.textEdit = null;
  fn(); edChanged(bake, panels);
}
function edChanged(bake = true, panels = true) { ED.dirty = true; if (bake) edBake(); if (panels) edPanels(); else edStatus(); clearTimeout(ED.saveT); ED.saveT = setTimeout(edSave, 2500); }
function edRestore(s) { const o = JSON.parse(s); ED.design.name = o.name; ED.design.base = o.base; ED.design.layers = o.layers; if (!ED.design.layers.some(l => l.id === ED.sel)) ED.sel = null; edChanged(); }
function edUndo() { if (!ED.undo.length) return; ED.redo.push(edSnap()); edRestore(ED.undo.pop()); }
function edRedo() { if (!ED.redo.length) return; ED.undo.push(edSnap()); edRestore(ED.redo.pop()); }
async function edSave(silent) {
  clearTimeout(ED.saveT); const D = ED.design; D.at = new Date().toISOString();
  // drop images no layer uses any more
  const used = new Set(D.layers.map(l => l.image).filter(Boolean)); for (const k of Object.keys(D.images)) if (!used.has(k)) delete D.images[k];
  let thumb = null; try { if (ED.three) { edFrame(); const c = ED.three.R.domElement; const t = document.createElement('canvas'); t.width = 160; t.height = 120; const k = Math.max(160 / c.width, 120 / c.height); t.getContext('2d').drawImage(c, (160 - c.width * k) / 2, (120 - c.height * k) / 2, c.width * k, c.height * k); thumb = t.toDataURL('image/jpeg', 0.8); } } catch { }
  const r = await edApi().save({ ...D, thumb }); if (r?.ok) { ED.dirty = false; ED.savedAt = Date.now(); edStatus(); if (!silent) edList(); }
}
async function edList() { try { ED.list = await edApi().list(); } catch { ED.list = []; } }

// ---- adding
/** Where a new sticker goes: the point of the helmet in the middle of the view (or where it was dropped). */
function edHitAt(cx, cy) {
  const T = ED.three; const cv = T.R.domElement; const r = cv.getBoundingClientRect();
  T.ray.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, T.cam);
  const h = T.ray.intersectObject(T.mesh, false)[0]; if (!h) return null;
  const p = T.mesh.worldToLocal(h.point.clone()); const n = h.face.normal.clone(); if ((p.x - T.C.x) * n.x + (p.y - T.C.y) * n.y + (p.z - T.C.z) * n.z < 0) n.multiplyScalar(-1);
  return { p, n: n.normalize() };
}
function edAdd(kind, opts, at) {
  if (!ED.three) return; const r = ED.three.R.domElement.getBoundingClientRect();
  const hit = (at && edHitAt(at[0], at[1])) || edHitAt(r.left + r.width / 2, r.top + r.height / 2) || { p: ED.three.C.clone().add(new THREE.Vector3(0.11, 0.03, 0)), n: new THREE.Vector3(1, 0, 0) };
  const L = { id: edUid(), kind, name: 'Layer', visible: true, locked: false, mirror: false, mode: 'stick', p: hit.p.toArray(), n: hit.n.toArray(), size: 0.08, stretch: 1, rot: 0, opacity: 1, ...opts };
  if (kind === 'shape') { const S = ED_SHAPES.find(s => s.id === L.shape); L.name = S?.name || 'Shape'; L.colors ||= [S?.cat === 'Flags' ? '#ffffff' : '#E10600', '#111111', '#001E6E']; if (S && /stripe|pin/.test(S.id)) { L.mode = 'wrap'; const wy = edWrapOf(hit.p)[1]; L.wx = 0; L.wy = wy; L.size = S.id === 'stripe' ? 0.03 : 0.06; L.stretch = 8; } if (S?.cat === 'Flags') L.size = 0.07; }
  if (kind === 'text') { L.name = opts.text.str || 'Text'; L.size = 0.09; }
  if (kind === 'image') L.name = opts.name || 'Image';
  edCommit(() => { ED.design.layers.push(L); ED.sel = L.id; });
}
function edDrop(e) { e.preventDefault(); const d = ED.drag; ED.drag = null; if (!d) return; if (d.add === 'shape') edAdd('shape', { shape: d.shape }, [e.clientX, e.clientY]); else if (d.add === 'image') edAdd('image', { image: d.image, name: 'Image' }, [e.clientX, e.clientY]); }
function edImportImage(e) {
  const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
  const rd = new FileReader(); rd.onload = () => {
    const im = new Image(); im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)); const cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      const id = edUid(); ED.design.images[id] = cv.toDataURL('image/png'); edAdd('image', { image: id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 30) }); if (ED.lib === 'images') edLib(); };
    im.src = rd.result; };
  rd.readAsDataURL(f);
}
function edImportTexture(e) {
  const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
  const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => {
    if (im.naturalWidth !== ED_W || im.naturalHeight !== ED_H) { toast(`The texture must be ${ED_W} x ${ED_H} (this one is ${im.naturalWidth} x ${im.naturalHeight}).`); return; }
    const id = edUid(); ED.design.images[id] = rd.result;
    edCommit(() => { const L = { id: edUid(), kind: 'image', name: f.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Texture', visible: true, locked: false, mode: 'uv', image: id, opacity: 1, mirror: false }; ED.design.layers.unshift(L); ED.sel = L.id; });
  }; im.src = rd.result; }; rd.readAsDataURL(f);
}

// ---- clicks and edits in the editor
function edClick(e) {
  const t = e.target.closest('[data-ed],[data-lib],[data-add],[data-cam],[data-mode],[data-layer],[data-vis],[data-lock],[data-tf],[data-base],[data-lc],[data-open],[data-delete]'); if (!t) { ED.root.querySelector('#ed-menu')?.classList.remove('on'); return; }
  const D = ED.design; const L = D.layers.find(l => l.id === ED.sel);
  if (t.dataset.lib) { ED.lib = t.dataset.lib; edLib(); return; }
  if (t.dataset.add) { if (t.dataset.add === 'shape') edAdd('shape', { shape: t.dataset.shape }); else edAdd('image', { image: t.dataset.image, name: 'Image' }); return; }
  if (t.dataset.cam) { const V = { front: [0, 0.05], left: [Math.PI / 2, 0.08], right: [-Math.PI / 2, 0.08], back: [Math.PI, 0.05], top: [0, 1.5] }[t.dataset.cam]; [ED.three.yaw, ED.three.pitch] = V; edDraw(); return; }
  if (t.dataset.mode) { ED.view = t.dataset.mode; ED.root.querySelectorAll('#ed-mode button').forEach(b => b.classList.toggle('on', b === t)); ED.root.querySelector('#ed-flat').style.display = ED.view === 'flat' ? 'block' : 'none'; edDraw(); return; }
  if (t.dataset.vis) { e.stopPropagation(); edCommit(() => { const l = D.layers.find(x => x.id === t.dataset.vis); l.visible = l.visible === false; }); return; }
  if (t.dataset.lock) { e.stopPropagation(); edCommit(() => { const l = D.layers.find(x => x.id === t.dataset.lock); l.locked = !l.locked; }, { bake: false }); return; }
  if (t.dataset.layer) { ED.sel = t.dataset.layer; edLayers(); edProps(); edDraw(); return; }
  if (t.dataset.open) { edOpen(t.dataset.open); return; }
  if (t.dataset.delete) { e.stopPropagation(); if (confirm('Delete this design? This can’t be undone.')) edApi().remove(t.dataset.delete).then(edList).then(edMenu); return; }
  // swatches (the colour inputs are handled as input events)
  if (t.tagName === 'B' && t.dataset.v) {
    if (t.dataset.base) { edCommit(() => { D.base[t.dataset.base] = t.dataset.v; }); return; }
    if (t.dataset.lc && L) { edCommit(() => { L.colors[+t.dataset.lc] = t.dataset.v; }); return; }
    if (t.dataset.tf) { edTextSet(t.dataset.tf, t.dataset.v, t); return; }
  }
  if (t.dataset.tf && t.tagName === 'BUTTON') { if (t.dataset.tf === 'font') edTextSet('font', t.dataset.v, t); else if (t.dataset.tf === 'bold' || t.dataset.tf === 'italic') edTextSet(t.dataset.tf, null, t); return; }
  const a = t.dataset.ed;
  if (a === 'undo') edUndo(); else if (a === 'redo') edRedo();
  else if (a === 'pick-game') edApi().pickGame().then(r => { if (r?.ok) { ED.err = null; edLoad(); } else if (r?.error) toast(r.error); });
  else if (a === 'add-text') edAdd('text', { text: { ...ED.text } });
  else if (a === 'import-img') ED.root.querySelector('#ed-file').click();
  else if (a === 'import-tex') ED.root.querySelector('#ed-texfile').click();
  else if (a === 'dup' && L) edCommit(() => { const c = JSON.parse(JSON.stringify(L)); c.id = edUid(); c.name = L.name + ' copy'; if (c.p) { const n = new THREE.Vector3(...c.n); const { T } = edTangents(n); c.p = new THREE.Vector3(...c.p).addScaledVector(T, 0.01).toArray(); } if (c.mode === 'wrap') c.wx = (c.wx || 0) + 0.01; D.layers.splice(D.layers.indexOf(L) + 1, 0, c); ED.sel = c.id; });
  else if (a === 'del' && L) edCommit(() => { D.layers.splice(D.layers.indexOf(L), 1); ED.sel = null; });
  else if ((a === 'up' || a === 'down') && L) edCommit(() => { const i = D.layers.indexOf(L), j = i + (a === 'up' ? 1 : -1); if (j < 0 || j >= D.layers.length) return; D.layers.splice(i, 1); D.layers.splice(j, 0, L); });
  else if (a === 'flipx' && L) edCommit(() => { L.flipX = !L.flipX; });
  else if (a === 'flipy' && L) edCommit(() => { L.flipY = !L.flipY; });
  else if (a === 'centre' && L) edCommit(() => { if (L.mode === 'wrap') L.wx = 0; else { const p = new THREE.Vector3(...L.p); p.x = ED.three.C.x; const h = edSurfaceNear(p); L.p = h.p.toArray(); L.n = h.n.toArray(); } });
  else if (a === 'bg' && L) edBgOpen(L);
  else if (a === 'save') edSave().then(() => toast('Saved.'));
  else if (a === 'new') { if (ED.dirty) edSave(true); ED.design = edNew(); ED.sel = null; ED.undo = []; ED.redo = []; ED.dirty = false; ED.savedAt = null; edPanels(); edLib(); edBake(); }
  else if (a === 'designs') { edList().then(edMenu); }
  else if (a === 'png') edExportPng();
  else if (a === 'export') edExport();
  else if (a?.startsWith('bg-')) edBgAction(a, t);
}
function edMenu() {
  const m = ED.root.querySelector('#ed-menu'); if (!m) return;
  m.innerHTML = ED.list.length ? ED.list.map(d => `<div class="he-mi" data-open="${d.id}">${d.thumb ? `<img src="${d.thumb}" alt="">` : '<span class="he-noimg"></span>'}<span>${edEsc(d.name)}<small>${new Date(d.at).toLocaleString()}</small></span><button class="icon-btn" data-delete="${d.id}" title="Delete">✕</button></div>`).join('') : '<div class="muted he-small" style="padding:10px">No saved designs yet.</div>';
  m.classList.add('on');
}
async function edOpen(id) {
  ED.root.querySelector('#ed-menu')?.classList.remove('on'); if (ED.dirty) await edSave(true);
  const d = await edApi().open(id); if (!d) { toast('Couldn’t open that design.'); return; }
  delete d.thumb; ED.design = { images: {}, ...d }; ED.sel = null; ED.undo = []; ED.redo = []; ED.dirty = false; ED.savedAt = Date.now(); edPanels(); edLib(); edBake();
}
function edTextSet(k, v, el) {
  const L = ED.design.layers.find(l => l.id === ED.sel); const inLayer = !!el.closest('#ed-props');
  const t = inLayer ? L?.text : ED.text; if (!t) return;
  const apply = () => { if (k === 'bold' || k === 'italic') t[k] = !t[k]; else t[k] = ['ow', 'sp', 'sl'].includes(k) ? +v : v; if (inLayer && k === 'str') L.name = t.str || 'Text'; };
  if (inLayer) { const typing = k === 'str' || ['ow', 'sp', 'sl'].includes(k); if (typing) { if (!ED.textEdit || ED.textEdit !== L.id) { ED.undo.push(edSnap()); ED.redo = []; ED.textEdit = L.id; } apply(); edChanged(true, false); edTextPreview(); edLayers(); const lab = el.closest('.he-prow')?.querySelector('.v'); if (lab) lab.textContent = k === 'sl' ? v + '°' : k === 'ow' ? (+v ? v : 'none') : v; if (k === 'ow' && (!!+v) !== !!el.dataset.had) { el.dataset.had = +v ? '1' : ''; edProps(); } return; }
    edCommit(apply); return; }
  apply(); if (k === 'str' || ['ow', 'sp', 'sl'].includes(k)) { edTextPreview(); const lab = el.closest('.he-prow')?.querySelector('.v'); if (lab) lab.textContent = k === 'sl' ? v + '°' : k === 'ow' ? (+v ? v : 'none') : v; if (k === 'str') ED.root.querySelectorAll('#ed-lib .he-font').forEach(b => { b.firstChild.textContent = t.str || 'Text'; }); if (k === 'ow' && (!!+v) !== !!el.dataset.had) { el.dataset.had = +v ? '1' : ''; edLib(); } return; }
  edLib();
}
function edInput(e) {
  const t = e.target; const D = ED.design; const L = D.layers.find(l => l.id === ED.sel);
  if (t.id === 'ed-q') { ED.q = t.value; const pos = t.selectionStart; edLib(); const q = ED.root.querySelector('#ed-q'); q.focus(); q.setSelectionRange(pos, pos); return; }
  if (t.id === 'ed-name') { if (e.type === 'change') edCommit(() => { D.name = t.value.trim() || 'Helmet'; }, { bake: false, panels: false }); return; }
  if (t.dataset.tf) { if (t.type === 'color' && e.type !== 'change') return; edTextSet(t.dataset.tf, t.value, t); return; }
  if (t.dataset.base) { if (t.type === 'color' && e.type !== 'change') return; if (t.type === 'checkbox') { edCommit(() => { D.base.fade = t.checked; }); return; } edCommit(() => { D.base[t.dataset.base] = t.value; }); return; }
  if (t.dataset.lc && L) { if (e.type !== 'change') return; edCommit(() => { L.colors[+t.dataset.lc] = t.value; }); return; }
  if (t.dataset.lb && L) { edCommit(() => { if (t.dataset.lb === 'mirror') L.mirror = t.checked; else { const was = L.mode; L.mode = t.checked ? 'wrap' : 'stick'; if (L.mode === 'wrap' && was !== 'wrap') { const [wx, wy] = edWrapOf(new THREE.Vector3(...L.p)); L.wx = wx; L.wy = wy; } else if (L.mode === 'stick' && was === 'wrap') { const h = edSurfaceAtWrap(L.wx || 0, L.wy || 0); L.p = h.p.toArray(); L.n = h.n.toArray(); } } }); return; }
  if (t.dataset.lp && L) {
    // sliders: one undo step for a whole drag
    if (e.type === 'input') { if (ED.sliding !== t) { ED.undo.push(edSnap()); ED.redo = []; ED.sliding = t; } L[t.dataset.lp] = +t.value; const v = t.parentElement.querySelector('.v'); const k = t.dataset.lp; if (v) v.textContent = k === 'size' ? Math.round(L.size * 1000) + ' mm' : k === 'rot' ? Math.round(L.rot) + '°' : Math.round(+t.value * 100) + '%'; edChanged(true, false); }
    else ED.sliding = null;
  }
}
function edKey(e) {
  if (!ED.root?.isConnected || ui.view !== 'editor') return; const a = document.activeElement; if (a && a.matches('input[type=text], input:not([type]), textarea, .he-text, .he-name, .he-search')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? edRedo() : edUndo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); edRedo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ED.sel) { e.preventDefault(); const L = ED.design.layers.find(l => l.id === ED.sel); if (L) edCommit(() => { ED.design.layers.splice(ED.design.layers.indexOf(L), 1); ED.sel = null; }); }
}

// ---- the surface: nearest point, and a point given in wrap coordinates
function edSurfaceNear(p) {
  const T = ED.three; const dir = p.clone().sub(T.C); if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0); dir.normalize();
  const from = T.C.clone().addScaledVector(dir, 0.6); const ray = new THREE.Raycaster(T.mesh.localToWorld(from.clone()), dir.clone().negate());
  const h = ray.intersectObject(T.mesh, false)[0]; if (!h) return { p, n: dir };
  const q = T.mesh.worldToLocal(h.point.clone()); const n = h.face.normal.clone(); if (n.dot(dir) < 0) n.negate(); return { p: q, n };
}
function edSurfaceAtWrap(wx, wy) { const T = ED.three; const th = -wy / T.RAD; return edSurfaceNear(new THREE.Vector3(T.C.x + wx, T.C.y + Math.cos(th) * T.RAD, T.C.z + Math.sin(th) * T.RAD)); }

// ---- the pointer: select, move, size, turn, orbit
function edPick(cx, cy) {
  // the top layer whose picture is under the pointer (its own pixels, not its box)
  const hit = edHitAt(cx, cy); if (!hit) return null; const T = ED.three; const D = ED.design;
  for (let k = D.layers.length - 1; k >= 0; k--) { const L = D.layers[k]; if (L.visible === false || L.mode === 'uv') continue; const s = T.tex.get(L.id); if (!s) continue;
    for (const mirror of L.mirror ? [false, true] : [false]) { const F = edFrameOf(L, mirror, s.aspect); let q;
      if (F.mode === 0) { const d = hit.p.clone().sub(F.P); if (Math.abs(d.dot(F.N)) > 0.07 || hit.n.dot(F.N) < 0.15) continue; q = [d.dot(F.T), d.dot(F.U)]; } else { const [x, y] = edWrapOf(hit.p); q = [x - F.wx, y - F.wy]; }
      const c = Math.cos(F.rot), sn = Math.sin(F.rot); const r = [c * q[0] + sn * q[1], -sn * q[0] + c * q[1]]; const u = r[0] / F.w * F.fx + 0.5, v = r[1] / F.h * F.fy + 0.5;
      if (u < 0 || v < 0 || u > 1 || v > 1) continue; const px = Math.min(s.cv.width - 1, Math.floor(u * s.cv.width)), py = Math.min(s.cv.height - 1, Math.floor((1 - v) * s.cv.height));
      if (s.data.data[(py * s.cv.width + px) * 4 + 3] > 20) return { L, mirror, hit }; }
  }
  return { L: null, hit };
}
function edDown(e) {
  if (ED.view === 'flat' || !ED.three) return; const cv = e.currentTarget; cv.setPointerCapture(e.pointerId);
  if (e.button === 2 || e.button === 1) { ED.ptr = { kind: 'orbit', x: e.clientX, y: e.clientY, yaw: ED.three.yaw, pitch: ED.three.pitch }; return; }
  const pick = edPick(e.clientX, e.clientY);
  if (pick?.L && !pick.L.locked) { if (ED.sel !== pick.L.id) { ED.sel = pick.L.id; edLayers(); edProps(); }
    ED.undo.push(edSnap()); ED.redo = []; const L = pick.L;
    ED.ptr = { kind: 'move', L, mirror: pick.mirror, off: L.mode === 'wrap' ? (() => { const [x, y] = edWrapOf(pick.hit.p); const wx = pick.mirror ? -(L.wx || 0) : (L.wx || 0); return [wx - x, (L.wy || 0) - y]; })() : null }; return; }
  if (pick?.L?.locked && ED.sel !== pick.L.id) { ED.sel = pick.L.id; edLayers(); edProps(); }
  ED.ptr = { kind: 'orbit', x: e.clientX, y: e.clientY, yaw: ED.three.yaw, pitch: ED.three.pitch, click: true };
}
function edMove(e) {
  const P = ED.ptr; if (!P) { if (ED.three && ED.view === '3d') { const pk = edPick(e.clientX, e.clientY); e.currentTarget.style.cursor = pk?.L && !pk.L.locked ? 'move' : 'grab'; } return; }
  if (P.kind === 'orbit') { if (Math.abs(e.clientX - P.x) + Math.abs(e.clientY - P.y) > 3) P.click = false; ED.three.yaw = P.yaw - (e.clientX - P.x) * 0.01; ED.three.pitch = Math.max(-1.3, Math.min(1.5, P.pitch + (e.clientY - P.y) * 0.01)); edDraw(); return; }
  if (P.kind === 'move') {
    const h = edHitAt(e.clientX, e.clientY); if (!h) return; const L = P.L;
    if (L.mode === 'wrap') { const [x, y] = edWrapOf(h.p); let wx = x + P.off[0]; if (P.mirror) wx = -wx; L.wx = Math.abs(wx) < 0.004 ? 0 : wx; L.wy = y + P.off[1]; }
    else { const p = h.p.clone(), n = h.n.clone(); if (P.mirror) { p.x = 2 * ED.three.C.x - p.x; n.x = -n.x; } L.p = p.toArray(); L.n = n.toArray(); }
    edChanged(true, false); return;
  }
  if (P.kind === 'size' || P.kind === 'turn') {
    const d = Math.hypot(e.clientX - P.cx, e.clientY - P.cy); const ang = Math.atan2(e.clientY - P.cy, e.clientX - P.cx);
    if (P.kind === 'size') P.L.size = Math.max(0.01, Math.min(0.32, P.size * d / Math.max(4, P.d0)));
    else { let r = P.rot - (ang - P.a0) * 180 / Math.PI * P.sign; r = ((r + 540) % 360) - 180; P.L.rot = e.shiftKey ? Math.round(r / 15) * 15 : r; }
    edChanged(true, false);
  }
}
function edUp(e) {
  const P = ED.ptr; ED.ptr = null; if (!P) return;
  if (P.kind === 'orbit' && P.click) { const pk = edPick(e.clientX, e.clientY); if (!pk?.L && ED.sel) { ED.sel = null; edLayers(); edProps(); edDraw(); } return; }
  if (P.kind !== 'orbit') { if (ED.undo.length && ED.undo[ED.undo.length - 1] === edSnap()) ED.undo.pop(); edPanels(); }
}
/** The selected sticker's box on screen, with corner handles (size) and a top handle (turn). */
function edGizmo() {
  const svg = ED.root?.querySelector('#ed-gizmo'); if (!svg) return; const T = ED.three; const L = ED.design.layers.find(l => l.id === ED.sel);
  const s = L && T.tex.get(L.id); if (!L || !s || L.mode === 'uv' || L.visible === false || ED.view === 'flat') { svg.innerHTML = ''; return; }
  const F = edFrameOf(L, false, s.aspect); const r = T.R.domElement.getBoundingClientRect(); const W = r.width, H = r.height;
  const c = Math.cos(F.rot), sn = Math.sin(F.rot);
  const toWorld = (u, v) => { const q = [u * F.w * F.fx, v * F.h * F.fy]; const x = c * q[0] - sn * q[1], y = sn * q[0] + c * q[1];
    if (F.mode === 0) return F.P.clone().addScaledVector(F.T, x).addScaledVector(F.U, y);
    const wx = F.wx + x, wy = F.wy + y; const th = -wy / T.RAD; const rr = edRadiusAt(th); return new THREE.Vector3(T.C.x + wx, T.C.y + Math.cos(th) * rr, T.C.z + Math.sin(th) * rr); };
  const scr = (p) => { const w = T.mesh.localToWorld(p.clone()).project(T.cam); return [(w.x + 1) / 2 * W, (1 - w.y) / 2 * H, w.z]; };
  // hidden when its middle faces away from the camera
  const mid = toWorld(0, 0); const n = F.mode === 0 ? F.N : mid.clone().sub(T.C).setX(0).normalize(); const toCam = T.cam.position.clone().sub(T.mesh.localToWorld(mid.clone())).normalize();
  if (n.dot(toCam) < 0.05) { svg.innerHTML = ''; return; }
  // (a long wrapped stripe gets a box round the part near its middle, so its handles stay on the side being looked at)
  const hv = F.mode === 1 ? Math.min(0.5, 0.06 / F.h) : 0.5;
  const pts = [[-0.5, -hv], [0.5, -hv], [0.5, hv], [-0.5, hv]].map(([u, v]) => scr(toWorld(u, v))); const top = scr(toWorld(0, hv)), rotH = scr(toWorld(0, hv + 0.18 * Math.max(1, 0.04 / F.h))); const ctr = scr(mid);
  ED.giz = { ctr, pts, rotH };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<polygon points="${pts.map(p => p.slice(0, 2).join(',')).join(' ')}" class="he-gbox"/><line x1="${top[0]}" y1="${top[1]}" x2="${rotH[0]}" y2="${rotH[1]}" class="he-gline"/>
    ${pts.map((p, k) => `<rect data-h="size" data-k="${k}" x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="12" rx="2" class="he-gh"/>`).join('')}<circle data-h="turn" cx="${rotH[0]}" cy="${rotH[1]}" r="7" class="he-gh"/>
    <text x="${Math.min(...pts.map(p => p[0]))}" y="${Math.max(...pts.map(p => p[1])) + 20}" class="he-glbl">${edEsc(L.name)}${L.mirror ? ' · mirrored' : ''}</text>`;
}
function edRadiusAt(th) { const T = ED.three; const h = edSurfaceNear(new THREE.Vector3(T.C.x, T.C.y + Math.cos(th) * T.RAD, T.C.z + Math.sin(th) * T.RAD)); return h.p.clone().sub(T.C).setX(0).length(); }
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest?.('#ed-gizmo [data-h]'); if (!h || !ED.giz) return; e.preventDefault(); e.stopPropagation();
  const L = ED.design.layers.find(l => l.id === ED.sel); if (!L || L.locked) return; ED.undo.push(edSnap()); ED.redo = [];
  const r = ED.three.R.domElement.getBoundingClientRect(); const cx = r.left + ED.giz.ctr[0], cy = r.top + ED.giz.ctr[1];
  // which way round a turn goes on screen: the box's own corners say whether it's seen from the front or mirrored
  const [a, b, c2] = ED.giz.pts; const cross = (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]);
  ED.ptr = { kind: h.dataset.h, L, cx, cy, size: L.size, d0: Math.hypot(e.clientX - cx, e.clientY - cy), rot: L.rot || 0, a0: Math.atan2(e.clientY - cy, e.clientX - cx), sign: cross < 0 ? 1 : -1 };
  const up = (ev) => { edUp(ev); document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); }; const mv = (ev) => edMove(ev);
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}, true);
document.addEventListener('dragstart', (e) => { const t = e.target.closest?.('#ed-root [data-add]'); if (t) ED.drag = { ...t.dataset }; });
document.addEventListener('contextmenu', (e) => { if (e.target.id === 'ed-canvas') e.preventDefault(); });

// ---- the flat view, exports
function edPixels() {
  const T = ED.three; const px = new Uint8Array(ED_W * ED_H * 4); T.R.readRenderTargetPixels(T.RT, 0, 0, ED_W, ED_H, px); return px; // rows from v = 0: the game's top row first
}
function edFlat() {
  const cv = ED.root.querySelector('#ed-flat'); const v = ED.root.querySelector('#ed-view'); const W = v.clientWidth, H = v.clientHeight; if (!W) return;
  if (!ED.flatImg || ED.flatGen !== ED.bakeGen) { const px = edPixels(); ED.flatImg = new ImageData(new Uint8ClampedArray(px.buffer), ED_W, ED_H); ED.flatGen = ED.bakeGen; }
  const k = Math.min((W - 24) / ED_W, (H - 90) / ED_H); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#10151f'; g.fillRect(0, 0, W, H);
  const tmp = document.createElement('canvas'); tmp.width = ED_W; tmp.height = ED_H; tmp.getContext('2d').putImageData(ED.flatImg, 0, 0);
  g.imageSmoothingQuality = 'high'; g.drawImage(tmp, (W - ED_W * k) / 2, (H - ED_H * k) / 2 + 20, ED_W * k, ED_H * k);
}
async function edPngBytes() { const px = edPixels(); const cv = document.createElement('canvas'); cv.width = ED_W; cv.height = ED_H; cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), ED_W, ED_H), 0, 0); const b = await new Promise(ok => cv.toBlob(ok, 'image/png')); return new Uint8Array(await b.arrayBuffer()); }
async function edExportPng() { if (!ED.three) return; await edBakeDone(); const ok = await edApi().savePng(await edPngBytes(), ED.design.name); if (ok) toast('Texture saved.'); }
const edBakeDone = () => new Promise(ok => { const w = () => edBaking ? setTimeout(w, 30) : ok(); w(); });
async function edExport() {
  if (!ED.three) return; await edBakeDone(); edStatus('Exporting…');
  const r = await edApi().exportMod(edPixels(), ED.design.name); edStatus();
  if (!r?.ok) { toast('Export failed: ' + (r?.error || 'unknown error')); return; }
  edModal(`<h3>Exported</h3><p class="muted">The helmet is ready for SWOFTY, zipped:</p><code class="he-path">${edEsc(r.file)}</code>
    <ol class="he-steps"><li>In SWOFTY Launcher, open <b>Helmets</b> (the Helmet Exchange addon) and press <b>Import file…</b>, then pick that zip.</li><li>Set <b>Who can pick it</b> to <b>Any driver</b> (your driver is a created one).</li><li>Press <b>Play</b>. In your Driver Career, open <b>Team HQ › Driver Details › Helmets</b> and equip it. It shows with "(HX)" after its name.</li></ol>
    <div class="he-row" style="justify-content:flex-end"><button class="btn" data-ed="close">Close</button><button class="btn primary" data-ed="show-dir" data-dir="${edEsc(r.file)}">Show the zip</button></div>`);
}
function edModal(html) { const m = ED.root.querySelector('#ed-modal'); m.innerHTML = html ? `<div class="he-mbox">${html}</div>` : ''; m.classList.toggle('on', !!html); }
// close / open-folder buttons in the dialog
document.addEventListener('click', (e) => { const t = e.target.closest?.('#ed-modal [data-ed]'); if (!t) return; if (t.dataset.ed === 'close') edModal(''); else if (t.dataset.ed === 'show-dir') edApi().show(t.dataset.dir); });

// ---- the background remover: click a colour on the picture to clear it (touching pixels only, or all of it)
function edBgOpen(L) {
  const src = ED.design.images[L.image]; if (!src) return;
  const im = new Image(); im.onload = () => {
    const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext('2d').drawImage(im, 0, 0);
    ED.bg = { L, cv, hist: [], tol: 30, touch: true, orig: src };
    edModal(`<h3>Remove background</h3><p class="muted he-small">Click a colour on the picture to clear it. Click again for more. The chequered parts are see-through.</p>
      <div class="he-bgwrap"><canvas id="ed-bgcv"></canvas></div>
      <div class="he-prow"><span>Tolerance</span><input type="range" id="ed-bgtol" min="0" max="120" value="30"><span class="v" id="ed-bgtolv">30</span></div>
      <label class="he-chk"><input type="checkbox" id="ed-bgtouch" checked> Only the area touching where I click (off: that colour everywhere)</label>
      <label class="he-chk"><input type="checkbox" id="ed-bgsoft" checked> Soften the edges</label>
      <div class="he-row" style="justify-content:space-between"><div class="he-row"><button class="btn sm" data-ed="bg-undo">Undo</button><button class="btn sm" data-ed="bg-reset">Start again</button></div><div class="he-row"><button class="btn" data-ed="bg-cancel">Cancel</button><button class="btn primary" data-ed="bg-done">Done</button></div></div>`);
    edBgDraw(); const c = ED.root.querySelector('#ed-bgcv'); c.addEventListener('click', edBgPick);
    ED.root.querySelector('#ed-bgtol').addEventListener('input', (e) => { ED.bg.tol = +e.target.value; ED.root.querySelector('#ed-bgtolv').textContent = e.target.value; });
  }; im.src = src;
}
function edBgDraw() {
  const B = ED.bg; const c = ED.root.querySelector('#ed-bgcv'); if (!c) return; const box = c.parentElement; const k = Math.min((box.clientWidth || 560) / B.cv.width, 340 / B.cv.height, 2);
  c.width = Math.round(B.cv.width * k); c.height = Math.round(B.cv.height * k); const g = c.getContext('2d');
  for (let y = 0; y < c.height; y += 10) for (let x = 0; x < c.width; x += 10) { g.fillStyle = ((x + y) / 10) % 2 ? '#cfd3da' : '#9aa1ad'; g.fillRect(x, y, 10, 10); }
  g.drawImage(B.cv, 0, 0, c.width, c.height); B.k = k;
}
function edBgPick(e) {
  const B = ED.bg; const r = e.currentTarget.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / B.k), y = Math.floor((e.clientY - r.top) / B.k);
  const g = B.cv.getContext('2d'); const W = B.cv.width, H = B.cv.height; const img = g.getImageData(0, 0, W, H); const d = img.data;
  B.hist.push(g.getImageData(0, 0, W, H)); if (B.hist.length > 20) B.hist.shift();
  const q0 = (y * W + x) * 4; const ref = [d[q0], d[q0 + 1], d[q0 + 2]]; const tol = B.tol; const soft = ED.root.querySelector('#ed-bgsoft')?.checked; const touch = ED.root.querySelector('#ed-bgtouch')?.checked;
  const dist = (q) => Math.max(Math.abs(d[q] - ref[0]), Math.abs(d[q + 1] - ref[1]), Math.abs(d[q + 2] - ref[2]));
  const clear = (q) => { const dd = dist(q); if (dd <= tol) d[q + 3] = 0; else if (soft && dd <= tol + 24) d[q + 3] = Math.min(d[q + 3], Math.round((dd - tol) / 24 * 255)); };
  if (touch) { const seen = new Uint8Array(W * H); const st = [y * W + x]; seen[y * W + x] = 1;
    while (st.length) { const p = st.pop(); const q = p * 4; if (d[q + 3] === 0 && dist(q) > tol) continue; if (dist(q) > tol + (soft ? 24 : 0)) continue; clear(q); if (dist(q) > tol) continue;
      const px = p % W, py = (p / W) | 0; for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) { if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const np = ny * W + nx; if (!seen[np]) { seen[np] = 1; st.push(np); } } } }
  else for (let q = 0; q < d.length; q += 4) clear(q);
  g.putImageData(img, 0, 0); edBgDraw();
}
function edBgAction(a) {
  const B = ED.bg; if (!B) return;
  if (a === 'bg-undo') { const h = B.hist.pop(); if (h) { B.cv.getContext('2d').putImageData(h, 0, 0); edBgDraw(); } }
  else if (a === 'bg-reset') { const im = new Image(); im.onload = () => { const g = B.cv.getContext('2d'); g.clearRect(0, 0, B.cv.width, B.cv.height); g.drawImage(im, 0, 0); B.hist = []; edBgDraw(); }; im.src = B.orig; }
  else if (a === 'bg-cancel') { ED.bg = null; edModal(''); }
  else if (a === 'bg-done') { const id = edUid(); const L = B.L; ED.design.images[id] = B.cv.toDataURL('image/png'); ED.bg = null; edModal(''); edCommit(() => { L.image = id; }); if (ED.lib === 'images') edLib(); }
}
