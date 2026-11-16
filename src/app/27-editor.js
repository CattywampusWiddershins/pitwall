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
const ED = { cache: new Map(), tab: "helmet", tabs: {}, root: null, ready: false, loading: false, err: null, needGame: false, three: null, design: null, sel: null, undo: [], redo: [], lib: 'shapes', view: '3d', dirty: false, saveT: null, list: [], text: null, bg: null };
// the design is baked at twice the game's helmet texture (4096 x 2048): sharp in the editor, and the export can send it
// to the game at that size (4K) or halved to the game's own (2K)
const ED_W = 4096, ED_H = 2048;
const edGameRes = () => { try { return localStorage.getItem('pitwall.editor.gameRes') === '2k' ? '2k' : '4k'; } catch { return '4k'; } };

// ---- the library: shapes as SVG, F fill, O outline, A accent (viewBox 0 0 100 100 unless vb says otherwise)
/** A star's outline (n points, outer radius R, inner r), as path data. */
function edStarD(cx, cy, R, r, n = 5, rot = -90) { let d = ''; for (let i = 0; i < n * 2; i++) { const a = (rot + i * 180 / n) * Math.PI / 180, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + q * Math.cos(a)).toFixed(1) + ' ' + (cy + q * Math.sin(a)).toFixed(1); } return d + 'Z'; }
/** A band with a serrated edge (n teeth from x0 out to x1, h high), as path data. */
function edZigD(x0, x1, h, n) { let d = `M0 0 H${x0}`; for (let i = 0; i < n; i++) d += ` L${x1} ${((i + 0.5) * h / n).toFixed(1)} L${x0} ${((i + 1) * h / n).toFixed(1)}`; return d + ' H0Z'; }
const ED_HEXD = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (60 * i - 30) * Math.PI / 180; return (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1); }).join('') + 'Z';
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
  { id: 'line', cat: 'Stripes and lines', name: 'Thin line', vb: [8, 100], svg: '<rect width="8" height="100" fill="F"/>' },
  { id: 'stripe2', cat: 'Stripes and lines', name: 'Double stripe', vb: [44, 100], svg: '<rect width="16" height="100" fill="F"/><rect x="28" width="16" height="100" fill="A"/>' },
  { id: 'taper', cat: 'Stripes and lines', name: 'Tapered stripe', vb: [30, 100], svg: '<path d="M0 0 H30 L17 100 H13Z" fill="F"/>' },
  { id: 'wave', cat: 'Stripes and lines', name: 'Wave', vb: [200, 60], svg: '<path d="M0 30 Q25 0 50 30 T100 30 T150 30 T200 30" fill="none" stroke="F" stroke-width="10"/>' },
  { id: 'arc', cat: 'Stripes and lines', name: 'Arc', vb: [200, 100], svg: '<path d="M0 100 A100 100 0 0 1 200 100 H170 A70 70 0 0 0 30 100Z" fill="F"/>' },
  { id: 'dashes', cat: 'Stripes and lines', name: 'Dashed line', vb: [200, 20], svg: '<g fill="F">' + Array.from({ length: 5 }, (_, i) => `<rect x="${i * 45}" width="30" height="20"/>`).join('') + '</g>' },
  { id: 'hazard', cat: 'Stripes and lines', name: 'Hazard stripes', vb: [200, 50], svg: '<rect width="200" height="50" fill="A"/><g fill="F">' + Array.from({ length: 6 }, (_, i) => `<path d="M${i * 40 - 20} 50 L${i * 40} 0 H${i * 40 + 20} L${i * 40} 50Z"/>`).join('') + '</g>' },
  { id: 'fadebars', cat: 'Stripes and lines', name: 'Fading bars', vb: [200, 100], svg: '<g fill="F">' + [[0, 20], [26, 14], [46, 10], [62, 7], [75, 5], [86, 3], [95, 2]].map(([y, h]) => `<rect y="${y}" width="200" height="${h}"/>`).join('') + '</g>' },
  { id: 'corner', cat: 'Stripes and lines', name: 'Corner swoop', svg: '<path d="M0 0 H100 Q30 30 0 100Z" fill="F"/>' },
  { id: 'slash2', cat: 'Stripes and lines', name: 'Double slash', vb: [130, 90], svg: '<path d="M0 80 L70 10 H90 L20 80Z" fill="F"/><path d="M34 80 L104 10 H124 L54 80Z" fill="A"/>' },
  { id: 'semi', cat: 'Basic', name: 'Half circle', vb: [100, 50], svg: '<path d="M0 50 A50 50 0 0 1 100 50Z" fill="F"/>' },
  { id: 'quarter', cat: 'Basic', name: 'Quarter circle', svg: '<path d="M0 100 V0 A100 100 0 0 1 100 100Z" fill="F"/>' },
  { id: 'oval', cat: 'Basic', name: 'Oval', vb: [160, 100], svg: '<ellipse cx="80" cy="50" rx="78" ry="48" fill="F"/>' },
  { id: 'hexagon', cat: 'Basic', name: 'Hexagon', svg: '<path d="M50 2 L92 26 L92 74 L50 98 L8 74 L8 26Z" fill="F"/>' },
  { id: 'pentagon', cat: 'Basic', name: 'Pentagon', svg: '<path d="M50 2 L98 38 L80 96 H20 L2 38Z" fill="F"/>' },
  { id: 'octagon', cat: 'Basic', name: 'Octagon', svg: '<path d="M30 2 H70 L98 30 V70 L70 98 H30 L2 70 V30Z" fill="F"/>' },
  { id: 'plus', cat: 'Basic', name: 'Plus', svg: '<path d="M38 2 H62 V38 H98 V62 H62 V98 H38 V62 H2 V38 H38Z" fill="F"/>' },
  { id: 'cross', cat: 'Basic', name: 'Cross', svg: '<path d="M20 2 L50 32 L80 2 L98 20 L68 50 L98 80 L80 98 L50 68 L20 98 L2 80 L32 50 L2 20Z" fill="F"/>' },
  { id: 'crescent', cat: 'Basic', name: 'Crescent', svg: '<path d="M62 4 A47 47 0 1 0 62 96 A60 60 0 0 1 62 4Z" fill="F"/>' },
  { id: 'parallelogram', cat: 'Basic', name: 'Parallelogram', vb: [160, 100], svg: '<path d="M40 2 H158 L120 98 H2Z" fill="F"/>' },
  { id: 'trapezoid', cat: 'Basic', name: 'Trapezoid', svg: '<path d="M25 2 H75 L98 98 H2Z" fill="F"/>' },
  { id: 'star6', cat: 'Basic', name: 'Six-point star', svg: '<path d="' + edStarD(50, 50, 48, 27, 6) + '" fill="F"/>' },
  { id: 'burst', cat: 'Basic', name: 'Starburst', svg: '<path d="' + edStarD(50, 50, 48, 34, 12) + '" fill="F"/>' },
  { id: 'drop', cat: 'Basic', name: 'Drop', svg: '<path d="M50 2 C60 20 88 46 88 62 A38 38 0 0 1 12 62 C12 46 40 20 50 2Z" fill="F"/>' },
  { id: 'shield', cat: 'Basic', name: 'Shield', svg: '<path d="M50 2 L94 16 V48 C94 74 74 90 50 98 C26 90 6 74 6 48 V16Z" fill="F"/>' },
  { id: 'squareline', cat: 'Basic', name: 'Square outline', svg: '<rect x="6" y="6" width="88" height="88" fill="none" stroke="F" stroke-width="12"/>' },
  { id: 'triline', cat: 'Basic', name: 'Triangle outline', svg: '<path d="M50 12 L92 92 H8Z" fill="none" stroke="F" stroke-width="10"/>' },
  { id: 'hexline', cat: 'Basic', name: 'Hexagon outline', svg: '<path d="M50 7 L88 29 L88 71 L50 93 L12 71 L12 29Z" fill="none" stroke="F" stroke-width="10"/>' },
  { id: 'roundel', cat: 'Racing', name: 'Roundel', svg: '<circle cx="50" cy="50" r="48" fill="F"/><circle cx="50" cy="50" r="33" fill="O"/><circle cx="50" cy="50" r="18" fill="A"/>' },
  { id: 'tyre', cat: 'Racing', name: 'Tyre', svg: '<circle cx="50" cy="50" r="48" fill="O"/><circle cx="50" cy="50" r="39" fill="none" stroke="F" stroke-width="4"/><circle cx="50" cy="50" r="27" fill="#777"/><circle cx="50" cy="50" r="8" fill="O"/>' },
  { id: 'chevrons', cat: 'Racing', name: 'Chevrons', vb: [200, 100], svg: '<g fill="F">' + [0, 60, 120].map(x => `<path d="M${x} 0 H${x + 30} L${x + 70} 50 L${x + 30} 100 H${x} L${x + 40} 50Z"/>`).join('') + '</g>' },
  { id: 'teeth', cat: 'Racing', name: 'Shark teeth', vb: [200, 40], svg: '<path d="M0 0' + Array.from({ length: 10 }, (_, i) => ` L${i * 20 + 10} 40 L${i * 20 + 20} 0`).join('') + 'Z" fill="F"/>' },
  { id: 'startrail', cat: 'Racing', name: 'Shooting star', vb: [200, 100], svg: '<g fill="A"><path d="M0 30 H120 L112 38 H0Z"/><path d="M20 47 H115 L108 55 H20Z"/><path d="M40 64 H120 L112 72 H40Z"/></g><path d="' + edStarD(150, 50, 46, 19) + '" fill="F"/>' },
  { id: 'crown', cat: 'Racing', name: 'Crown', vb: [120, 90], svg: '<path d="M6 86 L0 20 L32 50 L60 4 L88 50 L120 20 L114 86Z" fill="F"/>' },
  { id: 'laurel', cat: 'Racing', name: 'Laurel', svg: '<g fill="F">' + [[100, 255, 1], [80, -75, -1]].map(([a0, a1, s]) => '<path d="M' + (50 + 38 * Math.cos(a0 * Math.PI / 180)).toFixed(1) + ' ' + (50 + 38 * Math.sin(a0 * Math.PI / 180)).toFixed(1) + ' A38 38 0 0 ' + (s > 0 ? 1 : 0) + ' ' + (50 + 38 * Math.cos(a1 * Math.PI / 180)).toFixed(1) + ' ' + (50 + 38 * Math.sin(a1 * Math.PI / 180)).toFixed(1) + '" fill="none" stroke="F" stroke-width="2.5"/>' + Array.from({ length: 7 }, (_, i) => { const a = a0 + (a1 - a0) * i / 6, r = a * Math.PI / 180, x = 50 + 38 * Math.cos(r), y = 50 + 38 * Math.sin(r), tg = a + 90 * s; return [-1, 1].map(k => { const o = (a + 90 + k * 90) * Math.PI / 180, lx = x + 6 * Math.cos(o) * 1, ly = y + 6 * Math.sin(o); return '<ellipse cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" rx="8" ry="3.6" transform="rotate(' + (tg + k * 35 * s).toFixed(0) + ' ' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ')"/>'; }).join(''); }).join('')).join('') + '</g>' },
  { id: 'blade', cat: 'Racing', name: 'Blade', vb: [200, 60], svg: '<path d="M0 30 C60 0 120 10 200 0 C150 20 110 25 90 30 C110 35 150 40 200 60 C120 50 60 60 0 30Z" fill="F"/>' },
  { id: 'target', cat: 'Racing', name: 'Crosshair', svg: '<circle cx="50" cy="50" r="36" fill="none" stroke="F" stroke-width="7"/><path d="M50 0 V34 M50 66 V100 M0 50 H34 M66 50 H100" stroke="F" stroke-width="7"/>' },
  { id: 'chequerstrip', cat: 'Racing', name: 'Chequer strip', vb: [200, 40], svg: '<rect width="200" height="40" fill="A"/><g fill="F">' + Array.from({ length: 20 }, (_, i) => { const c = i % 10, r = Math.floor(i / 10); return (c + r) % 2 ? '' : `<rect x="${c * 20}" y="${r * 20}" width="20" height="20"/>`; }).join('') + '</g>' },
  { id: 'dots', cat: 'Patterns', name: 'Dots', svg: '<g fill="F">' + Array.from({ length: 64 }, (_, i) => `<circle cx="${(i % 8) * 12.5 + 6.25}" cy="${Math.floor(i / 8) * 12.5 + 6.25}" r="4"/>`).join('') + '</g>' },
  { id: 'carbon', cat: 'Patterns', name: 'Carbon weave', svg: '<rect width="100" height="100" fill="O"/><g fill="F">' + Array.from({ length: 100 }, (_, i) => { const x = i % 10, y = Math.floor(i / 10); return (x + y) % 2 ? `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>` : ''; }).join('') + '</g>' },
  { id: 'honeycomb', cat: 'Patterns', name: 'Honeycomb', svg: '<g fill="none" stroke="F" stroke-width="2.5">' + Array.from({ length: 42 }, (_, i) => { const c = i % 7, r = Math.floor(i / 7); return `<path d="${ED_HEXD(c * 17.3 - (r % 2 ? 8.65 : 0) + 8, r * 15 + 8, 10)}"/>`; }).join('') + '</g>' },
  { id: 'diagonals', cat: 'Patterns', name: 'Diagonal stripes', svg: '<g fill="F">' + Array.from({ length: 8 }, (_, i) => `<path d="M${i * 25 - 100} 100 L${i * 25} 0 H${i * 25 + 12} L${i * 25 - 88} 100Z"/>`).join('') + '</g>' },
  { id: 'camo', cat: 'Patterns', name: 'Camouflage', svg: '<path d="M5 10 C20 0 35 12 30 25 C45 22 50 40 35 45 C25 55 5 45 8 30 C0 22 0 15 5 10Z" fill="F"/><path d="M55 5 C70 0 90 8 85 22 C98 30 90 48 75 42 C62 48 50 35 58 25 C48 18 48 8 55 5Z" fill="O"/><path d="M40 55 C55 48 72 58 66 70 C80 75 76 95 60 92 C48 100 30 90 36 78 C26 70 30 58 40 55Z" fill="A"/><path d="M80 60 C92 55 100 65 98 75 C100 88 88 95 82 85 C74 82 72 66 80 60Z" fill="F"/><path d="M4 65 C14 60 24 70 20 80 C26 92 10 98 6 88 C0 82 0 70 4 65Z" fill="O"/>' },
  { id: 'mosaic', cat: 'Patterns', name: 'Triangles', svg: '<g>' + Array.from({ length: 25 }, (_, i) => { const x = (i % 5) * 20, y = Math.floor(i / 5) * 20; return `<path d="M${x} ${y} H${x + 20} L${x} ${y + 20}Z" fill="${i % 2 ? 'F' : 'A'}"/><path d="M${x + 20} ${y} V${y + 20} H${x}Z" fill="${i % 3 ? 'O' : 'F'}"/>`; }).join('') + '</g>' },
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
  { id: 'flag-be', cat: 'Flags', name: 'Belgium', vb: [115, 100], fixed: true, svg: '<rect width="39" height="100" fill="#000"/><rect x="38" width="39" height="100" fill="#FDDA24"/><rect x="76" width="39" height="100" fill="#EF3340"/>' },
  { id: 'flag-at', cat: 'Flags', name: 'Austria', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#C8102E"/><rect y="33" width="150" height="34" fill="#fff"/>' },
  { id: 'flag-hu', cat: 'Flags', name: 'Hungary', vb: [200, 100], fixed: true, svg: '<rect width="200" height="34" fill="#CE2939"/><rect y="33" width="200" height="34" fill="#fff"/><rect y="66" width="200" height="34" fill="#477050"/>' },
  { id: 'flag-fi', cat: 'Flags', name: 'Finland', vb: [180, 110], fixed: true, svg: '<rect width="180" height="110" fill="#fff"/><rect x="50" width="30" height="110" fill="#002F6C"/><rect y="40" width="180" height="30" fill="#002F6C"/>' },
  { id: 'flag-dk', cat: 'Flags', name: 'Denmark', vb: [185, 140], fixed: true, svg: '<rect width="185" height="140" fill="#C8102E"/><rect x="60" width="20" height="140" fill="#fff"/><rect y="60" width="185" height="20" fill="#fff"/>' },
  { id: 'flag-se', cat: 'Flags', name: 'Sweden', vb: [160, 100], fixed: true, svg: '<rect width="160" height="100" fill="#006AA7"/><rect x="50" width="20" height="100" fill="#FECC02"/><rect y="40" width="160" height="20" fill="#FECC02"/>' },
  { id: 'flag-ch', cat: 'Flags', name: 'Switzerland', vb: [100, 100], fixed: true, svg: '<rect width="100" height="100" fill="#DA291C"/><rect x="40" y="19" width="20" height="62" fill="#fff"/><rect x="19" y="40" width="62" height="20" fill="#fff"/>' },
  { id: 'flag-ca', cat: 'Flags', name: 'Canada', vb: [200, 100], fixed: true, svg: '<rect width="200" height="100" fill="#fff"/><rect width="50" height="100" fill="#D80621"/><rect x="150" width="50" height="100" fill="#D80621"/><path d="M100 12 L106 26 L114 22 L111 40 L122 30 L125 37 L136 35 L132 47 L138 50 L120 64 L123 72 L103 69 L103 88 H97 L97 69 L77 72 L80 64 L62 50 L68 47 L64 35 L75 37 L78 30 L89 40 L86 22 L94 26Z" fill="#D80621"/>' },
  { id: 'flag-mx', cat: 'Flags', name: 'Mexico', vb: [175, 100], fixed: true, svg: '<rect width="59" height="100" fill="#006847"/><rect x="58" width="59" height="100" fill="#fff"/><rect x="116" width="59" height="100" fill="#CE1126"/><circle cx="87.5" cy="50" r="13" fill="#8C5A2B"/><path d="M76 58 Q87.5 70 99 58" fill="none" stroke="#006847" stroke-width="3"/>' },
  { id: 'flag-cn', cat: 'Flags', name: 'China', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#EE1C25"/><g fill="#FFFF00"><path d="' + edStarD(25, 25, 15, 6) + '"/>' + [[50, 10, 252], [60, 20, 270], [60, 35, 288], [50, 45, 306]].map(([x, y, r]) => `<path d="${edStarD(x, y, 5, 2, 5, r)}"/>`).join('') + '</g>' },
  { id: 'flag-th', cat: 'Flags', name: 'Thailand', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#A51931"/><rect y="17" width="150" height="66" fill="#F4F5F8"/><rect y="33" width="150" height="34" fill="#2D2A4A"/>' },
  { id: 'flag-ar', cat: 'Flags', name: 'Argentina', vb: [160, 100], fixed: true, svg: '<rect width="160" height="100" fill="#74ACDF"/><rect y="33" width="160" height="34" fill="#fff"/><path d="' + edStarD(80, 50, 15, 9, 16) + '" fill="#F6B40E"/><circle cx="80" cy="50" r="8" fill="#F6B40E" stroke="#85340A" stroke-width="1"/>' },
  { id: 'flag-pl', cat: 'Flags', name: 'Poland', vb: [160, 100], fixed: true, svg: '<rect width="160" height="100" fill="#fff"/><rect y="50" width="160" height="50" fill="#DC143C"/>' },
  { id: 'flag-ie', cat: 'Flags', name: 'Ireland', vb: [200, 100], fixed: true, svg: '<rect width="67" height="100" fill="#169B62"/><rect x="66" width="68" height="100" fill="#fff"/><rect x="133" width="67" height="100" fill="#FF883E"/>' },
  { id: 'flag-pt', cat: 'Flags', name: 'Portugal', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#DA291C"/><rect width="60" height="100" fill="#046A38"/><circle cx="60" cy="50" r="17" fill="none" stroke="#FFE900" stroke-width="5"/><path d="M51 38 H69 V54 C69 62 60 66 60 66 C60 66 51 62 51 54Z" fill="#fff" stroke="#DA291C" stroke-width="3"/>' },
  { id: 'flag-ae', cat: 'Flags', name: 'United Arab Emirates', vb: [200, 100], fixed: true, svg: '<rect width="200" height="34" fill="#00732F"/><rect y="33" width="200" height="34" fill="#fff"/><rect y="66" width="200" height="34" fill="#000"/><rect width="50" height="100" fill="#FF0000"/>' },
  { id: 'flag-qa', cat: 'Flags', name: 'Qatar', vb: [280, 110], fixed: true, svg: '<rect width="280" height="110" fill="#8A1538"/><path d="' + edZigD(80, 102, 110, 9) + '" fill="#fff"/>' },
  { id: 'flag-bh', cat: 'Flags', name: 'Bahrain', vb: [166, 100], fixed: true, svg: '<rect width="166" height="100" fill="#CE1126"/><path d="' + edZigD(40, 62, 100, 5) + '" fill="#fff"/>' },
  { id: 'flag-az', cat: 'Flags', name: 'Azerbaijan', vb: [200, 100], fixed: true, svg: '<rect width="200" height="34" fill="#00B5E2"/><rect y="33" width="200" height="34" fill="#EF3340"/><rect y="66" width="200" height="34" fill="#509E2F"/><circle cx="95" cy="50" r="12" fill="#fff"/><circle cx="98" cy="50" r="10" fill="#EF3340"/><path d="' + edStarD(108, 50, 5.5, 2.4, 8) + '" fill="#fff"/>' },
  { id: 'flag-sg', cat: 'Flags', name: 'Singapore', vb: [150, 100], fixed: true, svg: '<rect width="150" height="100" fill="#fff"/><rect width="150" height="50" fill="#EF3340"/><circle cx="30" cy="25" r="16" fill="#fff"/><circle cx="36" cy="25" r="15" fill="#EF3340"/><g fill="#fff">' + Array.from({ length: 5 }, (_, i) => { const a = (-90 + i * 72) * Math.PI / 180; return `<path d="${edStarD(46 + 8 * Math.cos(a), 25 + 8 * Math.sin(a), 3, 1.2)}"/>`; }).join('') + '</g>' },
  { id: 'flag-nz', cat: 'Flags', name: 'New Zealand', vb: [200, 100], fixed: true, svg: '<rect width="200" height="100" fill="#012169"/><path d="M0 0 L100 50 M100 0 L0 50" stroke="#fff" stroke-width="10"/><path d="M50 0 V50 M0 25 H100" stroke="#fff" stroke-width="16"/><path d="M50 0 V50 M0 25 H100" stroke="#C8102E" stroke-width="9"/><g fill="#C8102E" stroke="#fff" stroke-width="1.5"><circle cx="150" cy="22" r="5"/><circle cx="170" cy="48" r="5"/><circle cx="150" cy="82" r="6"/><circle cx="132" cy="44" r="5"/></g>' },
];
const ED_FONTS = [['Bahnschrift', 'Racing'], ['Arial Black', 'Heavy'], ['Impact', 'Condensed'], ['Franklin Gothic Medium', 'Sport'], ['Segoe UI', 'Clean'], ['Trebuchet MS', 'Rounded'], ['Georgia', 'Serif'], ['Consolas', 'Mono'], ['Segoe Script', 'Script'], ['Comic Sans MS', 'Casual']];
const ED_SWATCH = ['#f4f4f1', '#111111', '#E10600', '#C8102E', '#001E6E', '#0055A4', '#007A4D', '#2FD07A', '#FFB81C', '#FF6A00', '#B44CEB', '#9aa0a6'];

const edApi = () => window.api?.editor || window.__edStub || null; // (__edStub: the browser copy's stand-in, for testing)
const edUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const edEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const edNew = () => ({ id: edUid(), name: 'New helmet', at: new Date().toISOString(), base: { color: '#f4f4f1', color2: '#001E6E', fade: false, dir: 'tb' }, layers: [], groups: {}, images: {} });

/** The page: a slot for the editor (kept alive across redraws), or why it can't open. */
function renderEditor() {
  if (!edApi()) return `<div class="page-head"><h1>Editor</h1></div><div class="panel"><div class="panel-b muted">The editor is part of the desktop app.</div></div>`;
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
  const el = document.createElement('div'); el.className = 'he'; el.id = 'ed-root'; el.dataset.tab = 'helmet';
  el.innerHTML = `
    <div class="he-head">
      <div><h1>Editor <span class="tag beta">BETA</span> <span class="tag he-dev">DEV</span></h1><div class="muted">Design your own gear for F1 25: helmets, and stickers to use on them.</div></div>
      <div class="he-row"><div class="he-designs"><button class="btn ghost" data-ed="designs">My designs ▾</button><div class="he-menu" id="ed-menu"></div></div><button class="btn" data-ed="new" id="ed-newbtn">New helmet</button></div>
    </div>
    <div class="he-tabs"><button class="he-tab on" data-tab="helmet">Helmet</button>${DEV_MODE ? '<button class="he-tab" data-tab="car">Car livery</button>' : ''}<button class="he-tab" data-tab="sticker">Sticker maker</button></div>
    <div class="he-ed">
      <section class="panel he-panel">
        <div class="he-ph"><span class="label">Add</span></div>
        <div class="he-pb">
          <div class="seg he-seg" id="ed-libtabs"><button data-lib="shapes" class="on">Shapes</button><button data-lib="text">Text</button><button data-lib="images">Images</button><button data-lib="custom" title="Your stickers from the Sticker maker">Custom</button></div>
          <div id="ed-lib"></div>
        </div>
      </section>
      <section class="panel he-view" id="ed-view">
        <canvas id="ed-canvas"></canvas>
        <canvas id="ed-flat" class="he-flat"></canvas>
        <canvas id="ed-stk" class="he-stkcv only-flat"></canvas>
        <svg id="ed-gizmo" class="he-gizmo"></svg>
        <div class="he-vbar">
          <div class="he-row only-car"><span class="only-car3d he-car3dbar"><button class="btn sm" data-ccam="front">Front</button><button class="btn sm" data-ccam="left">Left</button><button class="btn sm" data-ccam="right">Right</button><button class="btn sm" data-ccam="back">Back</button><button class="btn sm" data-ccam="top">Top</button><select class="he-mini" id="ed-carpart" title="Show one part alone, zoomed in">${ED_CARPARTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></span><div class="seg he-seg" id="ed-carview"><button data-carview="flat" class="on">Flat</button><button data-carview="3d" title="The 2026 car with your livery on it: drag a sticker on the car to move it, drag empty space to turn it (sizes and turns on Flat or in the panel)">3D</button></div><label class="he-chk he-guide"><input type="checkbox" id="ed-guide" checked> Guide</label><input type="range" id="ed-guideop" min="0.05" max="0.9" step="0.05" value="0.35" title="How strongly the original livery shows over yours (it's never exported)"></div>
          <div class="he-row only-sticker"><div class="seg he-seg" id="ed-stksize"><button data-stk="1024x1024">Square</button><button data-stk="2048x1024">Wide</button><button data-stk="1024x2048">Tall</button></div></div>
          <div class="he-row only-helmet"><button class="btn sm" data-cam="front">Front</button><button class="btn sm" data-cam="left">Left</button><button class="btn sm" data-cam="right">Right</button><button class="btn sm" data-cam="back">Back</button><button class="btn sm" data-cam="top">Top</button></div>
          <div class="he-row"><div class="seg he-seg only-helmet" id="ed-mode"><button data-mode="3d" class="on">3D</button><button data-mode="flat">Flat</button></div><div class="seg he-seg only-helmet" id="ed-place" title="How new stickers go on"><button data-place="stick" class="${edPlace() === 'stick' ? 'on' : ''}" title="New stickers follow the surface">Follow</button><button data-place="stamp" class="${edPlace() === 'stamp' ? 'on' : ''}" title="New stickers are stamped straight on from your view (lines stay straight)">Stamp</button></div><button class="btn sm" data-ed="undo" title="Undo (Ctrl+Z)">↶</button><button class="btn sm" data-ed="redo" title="Redo (Ctrl+Y)">↷</button></div>
        </div>
        <div class="he-msg" id="ed-msg"></div>
        <div class="he-foot"><span class="he-hint" id="ed-hint">Pick something from Add · drag it on the helmet · corners size it · the top handle turns it · drag empty space to turn the helmet</span></div>
      </section>
      <section class="panel he-panel">
        <div class="he-ph not-sticker"><span class="label" id="ed-baselbl">Helmet base</span><span class="muted he-small">under every layer</span></div>
        <div class="he-pb he-props not-sticker" id="ed-base" style="flex:0 0 auto"></div>
        <div class="he-ph he-bt"><span class="label">Layers</span><div class="he-row"><button class="btn sm ghost" data-ed="dup" title="Duplicate">⎘</button><button class="btn sm ghost" data-ed="up" title="Move up">▲</button><button class="btn sm ghost" data-ed="down" title="Move down">▼</button><button class="btn sm ghost" data-ed="del" title="Delete">✕</button></div></div>
        <div class="he-pb" id="ed-layers" style="flex:0 1 auto;max-height:260px"></div>
        <div class="he-ph he-bt"><span class="label" id="ed-ptitle">Layer</span><span class="muted he-small" id="ed-pkind"></span></div>
        <div class="he-pb he-props" id="ed-props"></div>
      </section>
    </div>
    <div class="he-bottom">
      <div class="he-row"><input class="he-name" id="ed-name" maxlength="40" title="The helmet's name"><span class="muted he-small" id="ed-status"></span></div>
      <div class="he-row"><button class="btn" data-ed="save">Save</button><button class="btn only-sticker" data-ed="stk-save" title="Save it as a sticker, ready in Add > Custom in every editor">Save to Custom Stickers</button><button class="btn only-helmet" data-ed="import-tex" title="A whole texture in the game's layout (4096 x 2048 or 2048 x 1024), made in Blender or Photoshop">Load texture…</button><button class="btn" data-ed="png">Export PNG</button><button class="btn only-helmet" data-ed="export-hx" title="A helmet of its own for the Helmet Exchange addon (needs its Helmets tab to work in your game build)">Helmet Exchange zip</button><button class="btn primary only-helmet" data-ed="export">Export SWOFTY addon</button><button class="btn primary only-car" data-ed="car-export" title="Puts it on the F1 75 livery of the My Team car">Export SWOFTY addon</button></div>
    </div>
    <div class="he-row he-target only-car"><span class="muted he-small">The addon puts it on the F1 75 livery of the</span><select class="he-mini" id="ed-caryear"><option value="2026">2026 My Team car</option><option value="2025">2025 My Team car</option></select><span class="muted he-small">(pick that livery for your team in the game)</span></div>
    <div class="he-row he-target only-helmet"><span class="muted he-small">The addon puts it on</span><select class="he-mini" id="ed-target" title="Pick this helmet for your driver in the game"></select><span class="muted he-small">(pick that helmet for your driver in the game) at</span><select class="he-mini" id="ed-gres" title="The texture's size in the game. 4K is twice the game's own helmets, sharper up close; 2K is the size the game's own helmets are."><option value="4k">4K (4096 x 2048)</option><option value="2k">2K (the game's size)</option></select>
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
  const stk = el.querySelector('#ed-stk'); stk.addEventListener('pointerdown', edStkDown); stk.addEventListener('pointermove', edStkMove); stk.addEventListener('pointerup', edStkUp); stk.addEventListener('pointercancel', edStkUp);
  stk.addEventListener('dragover', (e) => e.preventDefault()); stk.addEventListener('drop', edDrop);
  new ResizeObserver(() => edResize()).observe(el.querySelector('#ed-view'));
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
  try { edThree(r); ED.ready = true; ED.target = r.target; edTargetPicker(r); edMsg(''); edBake(); edList(); } catch (e) { console.error('editor', e); edMsg('The 3D view couldn’t start: ' + edEsc(e.message)); }
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
  const baseTex = new THREE.DataTexture(new Uint8Array(r.base.buffer.slice(r.base.byteOffset, r.base.byteOffset + r.base.byteLength)), r.w || 2048, r.h || 1024, THREE.RGBAFormat); baseTex.needsUpdate = true; baseTex.flipY = false; baseTex.magFilter = baseTex.minFilter = THREE.LinearFilter;
  const BW = r.w || 2048, BH = r.h || 1024; const trimRGBA = new Uint8Array(BW * BH * 4); const tr = new Uint8Array(r.trim.buffer.slice(r.trim.byteOffset, r.trim.byteOffset + r.trim.byteLength)); for (let p = 0; p < BW * BH; p++) trimRGBA[p * 4 + 3] = tr[p];
  const trimTex = new THREE.DataTexture(trimRGBA, BW, BH, THREE.RGBAFormat); trimTex.needsUpdate = true; trimTex.flipY = false; trimTex.magFilter = trimTex.minFilter = THREE.LinearFilter;
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
    uniforms: { ...common, uFace: { value: 0.15 }, uDepth: { value: 0.07 }, uTex: { value: null }, uMode: { value: 0 }, uP: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uT: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2(0.1, 0.1) }, uRot: { value: new THREE.Vector2(1, 0) }, uFlip: { value: new THREE.Vector2(1, 1) }, uW: { value: new THREE.Vector2() }, uOp: { value: 1 } },
    fragmentShader: `uniform float uFace; uniform float uDepth; uniform vec3 uC; uniform float uR; uniform float uSide; uniform sampler2D uTex; uniform float uMode; uniform vec3 uP; uniform vec3 uN; uniform vec3 uT; uniform vec3 uU; uniform vec2 uSize; uniform vec2 uRot; uniform vec2 uFlip; uniform vec2 uW; uniform float uOp; varying vec3 vP; varying vec3 vN; varying vec2 vUv;
      void main(){
        vec3 n = normalize(vN); if (dot(n, vP - uC) * uSide < 0.0) discard;
        if (uMode > 1.5 && uMode < 2.5) { vec4 c = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y)); gl_FragColor = vec4(c.rgb, c.a * uOp); return; }
        vec2 q;
        if (uMode < 0.5) { vec3 d = vP - uP; if (dot(n, uN) * uSide < uFace || abs(dot(d, uN)) > uDepth) discard; q = vec2(dot(d, uT), dot(d, uU)); }
        else if (uMode > 2.5) { vec3 dd = normalize(vP - uC); float cs = clamp(dot(dd, uN), -1.0, 1.0); float ang = acos(cs); if (ang > 2.4) discard; vec3 tg = dd - uN * cs; float tl = length(tg); q = tl > 1e-6 ? vec2(dot(tg, uT), dot(tg, uU)) / tl * ang * uR : vec2(0.0); }
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
  cv.addEventListener('wheel', (e) => { e.preventDefault(); if (edCar3dOn()) { ED.car3.dist = Math.max(0.4, Math.min(14, ED.car3.dist * (e.deltaY > 0 ? 1.08 : 0.93))); edDraw(); return; } const T = ED.three; T.dist = Math.max(0.45, Math.min(1.8, T.dist * (e.deltaY > 0 ? 1.08 : 0.93))); edDraw(); }, { passive: false });
  cv.addEventListener('dragover', (e) => e.preventDefault()); cv.addEventListener('drop', edDrop);
  new ResizeObserver(() => edResize()).observe(ED.root.querySelector('#ed-view'));
  edResize();
}
function edResize() {
  if (edCar3dOn()) { const T = ED.three, v = ED.root.querySelector('#ed-view'); if (T && v.clientWidth) { T.R.setSize(v.clientWidth, v.clientHeight, false); ED.car3.cam.aspect = v.clientWidth / v.clientHeight; ED.car3.cam.updateProjectionMatrix(); } edDraw(); return; }
  if (edIsStk()) { edDrawSticker(); return; }
  const T = ED.three; if (!T) return; const v = ED.root.querySelector('#ed-view'); const w = v.clientWidth, h = v.clientHeight; if (!w || !h) return;
  T.R.setSize(w, h, false); T.cam.aspect = w / h; T.cam.updateProjectionMatrix(); edDraw();
}
let edRaf = 0;
function edDraw() { if (edRaf) return; edRaf = requestAnimationFrame(() => { edRaf = 0; edFrame(); }); }
function edFrame() {
  if (edCar3dOn()) { edFrameCar(); return; }
  if (edIsStk()) { edDrawSticker(); return; }
  const T = ED.three; if (!T) return;
  const { yaw, pitch, dist } = T; T.cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); T.cam.lookAt(0, 0, 0);
  T.R.setRenderTarget(null); T.R.render(T.scene, T.cam);
  edGizmo();
  if (ED.view === 'flat') edFlat();
}

// ---- layers as textures
const edHex = (h) => new THREE.Color(h);
function edShapeSvg(L) { const S = ED_SHAPES.find(s => s.id === L.shape); if (!S) return null; const [w, h] = S.vb || [100, 100]; const c = L.colors || []; return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.round(w * 2048 / Math.max(w, h))}" height="${Math.round(h * 2048 / Math.max(w, h))}">${S.svg.replace(/="F"/g, `="${c[0] || '#ffffff'}"`).replace(/="O"/g, `="${c[1] || '#111111'}"`).replace(/="A"/g, `="${c[2] || '#E10600'}"`)}</svg>` }; }
/*
  A layer's picture, made again only when what it shows changes:
   1. the content (a shape, the text, the image), on a canvas cut to fit;
   2. its colour: as it is ("original"), one solid colour, or a gradient (images too);
   3. its auto-mask, if it has one (frozen: the parts the layers above covered when it was made);
   4. its effects, on a bigger canvas with room round it: the shadow, the glow and the outside stroke behind, the
      inside stroke on top. Sizes are in % of the sticker's width, so they scale with it.
  { cv (with the room), cw, ch (the content's size in it), ex, ey (the whole canvas against the content: for drawing),
    aspect (the content's height against its width), data (pixels, for picking), tex }
*/
const ED_LOOK = { fill: { mode: 'original', c1: '#E10600', c2: '#001E6E', angle: 0 }, stroke: { on: false, side: 'outside', w: 3, color: '#ffffff' }, glow: { on: false, color: '#FFB81C', size: 6, spread: 1, opacity: 0.8 }, shadow: { on: false, color: '#000000', opacity: 0.6, angle: 45, dist: 3, blur: 3 } };
const edLook = (L) => { const o = L.look || {}; return { fill: { ...ED_LOOK.fill, ...o.fill }, stroke: { ...ED_LOOK.stroke, ...o.stroke }, glow: { ...ED_LOOK.glow, ...o.glow }, shadow: { ...ED_LOOK.shadow, ...o.shadow } }; };
const edCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const edImg = (src) => new Promise(ok => { if (!src) return ok(null); const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
/** The content alone (no colour change, mask or effects). */
async function edRaw(L) {
  if (L.kind === 'text') return edTextCanvas(L.text);
  const src = L.kind === 'shape' ? (() => { const s = edShapeSvg(L); return s && 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg); })() : ED.design.images[L.image];
  const im = await edImg(src); if (!im) return null;
  const k = Math.min(1, (L.mode === 'uv' ? 4096 : 2048) / Math.max(im.naturalWidth, im.naturalHeight)); const cv = edCanvas(Math.max(4, im.naturalWidth * k), Math.max(4, im.naturalHeight * k)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); return cv;
}
/** A copy of a picture in one colour (or a gradient), keeping its see-through parts. */
function edPaint(src, fill) {
  const c = edCanvas(src.width, src.height), g = c.getContext('2d');
  if (fill.mode === 'gradient') { const a = (fill.angle || 0) * Math.PI / 180, cx = c.width / 2, cy = c.height / 2, r = Math.abs(Math.cos(a)) * c.width / 2 + Math.abs(Math.sin(a)) * c.height / 2;
    const gr = g.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r); gr.addColorStop(0, fill.c1); gr.addColorStop(1, fill.c2); g.fillStyle = gr; }
  else g.fillStyle = fill.c1;
  g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0); return c;
}
/** A picture grown by r pixels all round (copies of it round circles out to r), on a canvas the same size. */
function edGrow(src, r) {
  const c = edCanvas(src.width, src.height), g = c.getContext('2d'); g.drawImage(src, 0, 0); if (r < 0.5) return c;
  for (let rr = r; rr > 0.4; rr -= Math.max(1, r / 3)) { const n = Math.min(64, Math.max(12, Math.ceil(2 * Math.PI * rr / 1.5))); for (let k = 0; k < n; k++) { const a = k / n * 2 * Math.PI; g.drawImage(src, Math.cos(a) * rr, Math.sin(a) * rr); } }
  return c;
}
async function edSource(L) {
  const look = edLook(L); const key = JSON.stringify([L.kind, L.shape, L.colors, L.text, L.image, L.look, L.mask]);
  const T = { tex: ED.cache }; const hit = T.tex.get(L.id); if (hit && hit.key === key) return hit; // (the pictures cache: shared by the helmet and the Sticker Maker)
  let raw = await edRaw(L); if (!raw) return null;
  const cw = raw.width, ch = raw.height;
  // 2: colour
  if (look.fill.mode === 'solid' || look.fill.mode === 'gradient') raw = edPaint(raw, look.fill);
  // 3: the frozen auto-mask (kept at the content's size it was made at, stretched to fit if that changed)
  if (L.mask) { const m = await edImg(L.mask); if (m) { const c = edCanvas(cw, ch), g = c.getContext('2d'); g.drawImage(raw, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, cw, ch); raw = c; } }
  // 4: effects
  const u = cw / 100; const st = look.stroke, gl = look.glow, sh = look.shadow;
  const sOut = st.on && st.side !== 'inside' ? st.w * u : 0, sIn = st.on && st.side !== 'outside' ? st.w * u : 0;
  const room = Math.ceil(Math.max(sOut, gl.on ? (gl.size + gl.spread) * u * 1.6 : 0, sh.on ? (sh.dist + sh.blur * 1.6) * u : 0)) + (st.on || gl.on || sh.on ? 3 : 0);
  let cv = raw;
  if (room) {
    const W = cw + room * 2, H = ch + room * 2; const big = edCanvas(W, H); const put = edCanvas(W, H); put.getContext('2d').drawImage(raw, room, room);
    const g = big.getContext('2d');
    if (sh.on) { const a = sh.angle * Math.PI / 180; g.save(); g.filter = sh.blur > 0 ? `blur(${sh.blur * u}px)` : 'none'; g.globalAlpha = sh.opacity; g.drawImage(edPaint(put, { mode: 'solid', c1: sh.color }), Math.cos(a) * sh.dist * u, Math.sin(a) * sh.dist * u); g.restore(); }
    if (gl.on) { g.save(); g.filter = gl.size > 0 ? `blur(${gl.size * u}px)` : 'none'; g.globalAlpha = gl.opacity; const sil = edPaint(edGrow(put, gl.spread * u), { mode: 'solid', c1: gl.color }); g.drawImage(sil, 0, 0); if (gl.opacity > 0.5) { g.globalAlpha = gl.opacity - 0.5; g.drawImage(sil, 0, 0); } g.restore(); }
    if (sOut) g.drawImage(edPaint(edGrow(put, sOut), { mode: 'solid', c1: st.color }), 0, 0);
    g.drawImage(put, 0, 0);
    if (sIn) { const inv = edCanvas(W, H), ig = inv.getContext('2d'); ig.fillStyle = st.color; ig.fillRect(0, 0, W, H); ig.globalCompositeOperation = 'destination-out'; ig.drawImage(put, 0, 0);
      const band = edGrow(inv, sIn), bg2 = band.getContext('2d'); bg2.globalCompositeOperation = 'destination-in'; bg2.drawImage(put, 0, 0); g.drawImage(band, 0, 0); }
    cv = big;
  }
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.LinearEncoding; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  const old = T.tex.get(L.id); if (old) old.tex.dispose();
  const o = { key, cv, cw, ch, room, ex: cv.width / cw, ey: cv.height / ch, tex: t, data: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), aspect: ch / cw };
  T.tex.set(L.id, o); return o;
}
/** A text sticker: the words in their font, with spacing, slant and an outline, on a canvas cut to fit. */
function edTextCanvas(t) {
  const S = 2, px = 160 * S; const font = `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${px}px "${t.font}"`;
  const m = document.createElement('canvas').getContext('2d'); m.font = font; m.letterSpacing = `${(t.sp || 0) * 4 * S}px`;
  const str = t.str || ' '; const tw = Math.ceil(m.measureText(str).width); const ow = (t.ow || 0) * 3 * S; const slant = Math.tan((t.sl || 0) * Math.PI / 180);
  const pad = 20 * S + ow; const w = Math.min(8192, tw + pad * 2 + Math.ceil(px * slant)), h = Math.ceil(px * 1.3) + pad * 2;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.font = font; g.letterSpacing = `${(t.sp || 0) * 4 * S}px`; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.setTransform(1, 0, -slant, 1, px * slant * 0.5, 0);
  if (ow) { g.strokeStyle = t.outline || '#ffffff'; g.lineWidth = ow * 2; g.strokeText(str, pad, h / 2); }
  g.fillStyle = t.fill || '#111111'; g.fillText(str, pad, h / 2);
  return cv;
}

// ---- baking: base, layers (and their mirrors), trim
let edBaking = false, edBakeAgain = false;
async function edBake() {
  if (edIsStk()) return edBakeSticker();
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
    // (the picture's room for effects makes it bigger than the sticker itself: drawn that much bigger, same middle)
    const draw = (mirror) => { const F = edFrameOf(L, mirror, s.aspect); U.uTex.value = s.tex; U.uMode.value = F.mode; U.uFace.value = F.face; U.uDepth.value = F.depth; U.uP.value.copy(F.P); U.uN.value.copy(F.N); U.uT.value.copy(F.T); U.uU.value.copy(F.U); U.uSize.value.set(F.w * s.ex, F.h * s.ey); U.uRot.value.set(Math.cos(F.rot), Math.sin(F.rot)); U.uFlip.value.set(F.fx, F.fy); U.uW.value.set(F.wx, F.wy); U.uOp.value = L.opacity ?? 1; R.render(T.bakeScene, T.bakeCam); };
    draw(false); if (L.mirror && L.mode !== 'uv') draw(true);
  });
  // the trim
  T.bakeMesh.visible = false; T.quad.visible = true; T.quad.material = T.trimMat; R.render(T.bakeScene, T.bakeCam);
  R.autoClear = true; R.setRenderTarget(null);
  edBaking = false; ED.bakeGen = (ED.bakeGen || 0) + 1; edDraw();
  if (edBakeAgain) { edBakeAgain = false; edBake(); }
}
/*
  Auto-mask: the parts of a layer that the layers above it cover, hidden, frozen as they are now.
   1. The layers above (and their mirrors) are drawn into a coverage map in the texture's layout.
   2. The shell is drawn again with each point placed where it falls in this sticker's own picture (the sticker's
      mapping run backwards), reading the coverage there: the coverage seen from the sticker.
   3. The mask is the inverse of that, at the size of the sticker's content, kept with the layer (L.mask).
  Making it again works it out afresh; the old one plays no part.
*/
async function edAutoMask(L) {
  if (L.mode === 'flat') return edAutoMaskFlat(L);
  const T = ED.three; const D = ED.design; const k = D.layers.indexOf(L); if (k < 0 || L.mode === 'uv') return;
  edStatus('Masking…'); const before = L.mask; delete L.mask; await edSource(L); // (the content's size, without the old mask)
  const s = await edSource(L); if (!s) { L.mask = before; edStatus(); return; }
  const above = D.layers.slice(k + 1).filter(l => l.visible !== false); const srcs = await Promise.all(above.map(edSource));
  const R = T.R; T.coverRT ||= new THREE.WebGLRenderTarget(ED_W, ED_H, { depthBuffer: false, stencilBuffer: false });
  R.setRenderTarget(T.coverRT); R.setClearColor(0x000000, 0); R.clear(); R.autoClear = false;
  T.quad.visible = false; T.bakeMesh.visible = true; T.bakeMesh.material = T.layerMat; const U = T.layerMat.uniforms;
  above.forEach((l, i) => { const so = srcs[i]; if (!so) return; const draw = (mirror) => { const F = edFrameOf(l, mirror, so.aspect); U.uTex.value = so.tex; U.uMode.value = F.mode; U.uFace.value = F.face; U.uDepth.value = F.depth; U.uP.value.copy(F.P); U.uN.value.copy(F.N); U.uT.value.copy(F.T); U.uU.value.copy(F.U); U.uSize.value.set(F.w * so.ex, F.h * so.ey); U.uRot.value.set(Math.cos(F.rot), Math.sin(F.rot)); U.uFlip.value.set(F.fx, F.fy); U.uW.value.set(F.wx, F.wy); U.uOp.value = 1; R.render(T.bakeScene, T.bakeCam); }; draw(false); if (l.mirror && l.mode !== 'uv') draw(true); });
  // 2: the coverage as seen in this sticker's picture (its content's own box, no effects room)
  T.invMat ||= new THREE.ShaderMaterial({ side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: false,
    uniforms: { uCover: { value: null }, uC: { value: T.C }, uR: { value: T.RAD }, uSide: { value: T.side }, uMode: { value: 0 }, uP: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uT: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2() }, uRot: { value: new THREE.Vector2() }, uFlip: { value: new THREE.Vector2() }, uW: { value: new THREE.Vector2() }, uFace: { value: 0.15 }, uDepth: { value: 0.07 } },
    vertexShader: `uniform vec3 uC; uniform float uR; uniform float uMode; uniform vec3 uP; uniform vec3 uN; uniform vec3 uT; uniform vec3 uU; uniform vec2 uSize; uniform vec2 uRot; uniform vec2 uFlip; uniform vec2 uW; varying vec2 vUv; varying float vFace; varying float vDepth; varying float vSeam; varying float vOut;
      void main(){ vUv = uv; vec2 q; vec3 d = position - uP; vOut = dot(normal, position - uC);
        if (uMode < 0.5) { q = vec2(dot(d, uT), dot(d, uU)); vFace = dot(normal, uN); vDepth = abs(dot(d, uN)); vSeam = 1.0; }
        else if (uMode > 2.5) { vec3 dd = normalize(position - uC); float cs = clamp(dot(dd, uN), -1.0, 1.0); float ang = acos(cs); vec3 tg = dd - uN * cs; float tl = length(tg); q = tl > 1e-6 ? vec2(dot(tg, uT), dot(tg, uU)) / tl * ang * uR : vec2(0.0); vFace = 1.0; vDepth = 0.0; vSeam = ang > 2.4 ? -1.0 : 1.0; }
        else { float th = atan(position.z - uC.z, position.y - uC.y); q = vec2(position.x - uC.x, -th * uR) - uW; vec3 rad = vec3(0.0, position.y - uC.y, position.z - uC.z); vFace = dot(normal, normalize(rad)); vDepth = 0.0; vSeam = cos(th); }
        q = vec2(uRot.x * q.x + uRot.y * q.y, -uRot.y * q.x + uRot.x * q.y); vec2 t = q / uSize * uFlip + 0.5; gl_Position = vec4(t * 2.0 - 1.0, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D uCover; uniform float uSide; uniform float uMode; uniform float uFace; uniform float uDepth; varying vec2 vUv; varying float vFace; varying float vDepth; varying float vSeam; varying float vOut; void main(){ if (vOut * uSide < 0.0 || vSeam < -0.6) discard; if (uMode < 0.5 ? (vFace * uSide < uFace || vDepth > uDepth) : uMode > 2.5 ? false : vFace * uSide < 0.0) discard; gl_FragColor = vec4(texture2D(uCover, vUv).a, 0.0, 0.0, 1.0); }` });
  const M = T.invMat.uniforms; const F = edFrameOf(L, false, s.aspect);
  M.uCover.value = T.coverRT.texture; M.uMode.value = F.mode; M.uFace.value = F.face; M.uDepth.value = F.depth; M.uP.value.copy(F.P); M.uN.value.copy(F.N); M.uT.value.copy(F.T); M.uU.value.copy(F.U); M.uSize.value.set(F.w, F.h); M.uRot.value.set(Math.cos(F.rot), Math.sin(F.rot)); M.uFlip.value.set(F.fx, F.fy); M.uW.value.set(F.wx, F.wy);
  const rt = new THREE.WebGLRenderTarget(s.cw, s.ch, { depthBuffer: false, stencilBuffer: false });
  R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); T.bakeMesh.material = T.invMat; R.render(T.bakeScene, T.bakeCam);
  const px = new Uint8Array(s.cw * s.ch * 4); R.readRenderTargetPixels(rt, 0, 0, s.cw, s.ch, px); rt.dispose();
  R.autoClear = true; R.setRenderTarget(null); R.setClearColor(0x000000, 1);
  // 3: the mask (rows from the top: the render target's start at the bottom)
  const cv = edCanvas(s.cw, s.ch), g = cv.getContext('2d'), img = g.createImageData(s.cw, s.ch);
  for (let y = 0; y < s.ch; y++) for (let x = 0; x < s.cw; x++) { const src = ((s.ch - 1 - y) * s.cw + x) * 4, dst = (y * s.cw + x) * 4; img.data[dst] = img.data[dst + 1] = img.data[dst + 2] = 255; img.data[dst + 3] = 255 - px[src]; }
  g.putImageData(img, 0, 0); const mask = cv.toDataURL('image/png');
  L.mask = before; edCommit(() => { L.mask = mask; }); edStatus();
}
/**
 * Where a layer sits: { mode 0 stick / 1 wrap / 2 uv, P (point on the shell), N (the way it faces), T and U (its right
 * and up), w and h (metres), rot (radians), fx and fy (flips), wx and wy (its centre round the shell, for wrap) }.
 * The mirror copy sits at x reflected. Shapes are reflected (a swoosh still points forwards); text and images read the
 * right way. With "Mirror turns the other way" (on unless turned off), its turn is reversed too, so both sides match.
 * (Both kinds of frame are seen from outside: a stick frame's right is the viewer's right on either side, a wrap
 * frame's x is the same for both; so a reflection is a flip across and a reversed turn.)
 */
/** How new stickers go on: 'stick' (follow the surface) or 'stamp' (from the view). */
const edPlace = () => { if (!ED.place) { try { ED.place = localStorage.getItem('pitwall.editor.place') === 'stamp' ? 'stamp' : 'stick'; } catch { ED.place = 'stick'; } } return ED.place; };
/** The direction from the helmet towards the camera, in the helmet's own space. */
function edViewDir() { const T = ED.three; T.mesh.updateMatrixWorld(); const inv = new THREE.Matrix4().copy(T.mesh.matrixWorld).invert(); const a = T.cam.position.clone().applyMatrix4(inv), o = T.mesh.worldToLocal(new THREE.Vector3(0, 0, 0)); return a.sub(o).normalize(); }
/** Changes how a layer is projected, keeping it where it is. */
function edSetProj(L, mode) {
  if ((L.mode === mode && !(mode === 'stick' && !L.curve)) || L.mode === 'uv' || L.mode === 'flat') return; // (Follow on an older stuck sticker turns on the wrap)
  edCommit(() => { const was = L.mode;
    if (mode === 'wrap') { const [wx, wy] = edWrapOf(new THREE.Vector3(...L.p)); L.wx = wx; L.wy = wy; }
    else if (was === 'wrap') { const h = edSurfaceAtWrap(L.wx || 0, L.wy || 0); L.p = h.p.toArray(); L.n = h.n.toArray(); }
    if (mode === 'stamp') L.n = edViewDir().toArray();
    else if (mode === 'stick' && was === 'stamp') { const h = edSurfaceNear(new THREE.Vector3(...L.p)); L.p = h.p.toArray(); L.n = h.n.toArray(); }
    if (mode === 'stick') L.curve = true; L.mode = mode; });
}
function edFrameOf(L, mirror, aspect) {
  const w = L.size || 0.08, h = w * (aspect || 1) * (L.stretch || 1); const reflect = mirror && L.kind === 'shape' && L.reflect !== false;
  const fx = (L.flipX ? -1 : 1) * (reflect ? -1 : 1), fy = L.flipY ? -1 : 1; const rot = (L.rot || 0) * Math.PI / 180 * (mirror && L.mirrorRot !== false ? -1 : 1);
  const face = L.mode === 'stamp' ? 0.02 : 0.15, depth = L.mode === 'stamp' ? 10 : 0.07;
  if (L.mode === 'uv') return { mode: 2, P: new THREE.Vector3(), N: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), w: 1, h: 1, rot: 0, fx: 1, fy: 1, wx: 0, wy: 0, face, depth };
  if (L.mode === 'wrap') { const wx = (L.wx || 0) * (mirror ? -1 : 1); return { mode: 1, P: new THREE.Vector3(), N: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), w, h, rot, fx, fy, wx, wy: L.wy || 0, face, depth }; }
  const P = new THREE.Vector3(...(L.p || [0, 0, 0])), N = new THREE.Vector3(...(L.n || [1, 0, 0])).normalize();
  if (mirror) { P.x = 2 * ED.three.C.x - P.x; N.x = -N.x; }
  if (L.mode === 'stick' && L.curve) { const D = P.clone().sub(ED.three.C).normalize(); const { T, U } = edTangents(D); return { mode: 3, P, N: D, T, U, w, h, rot, fx, fy, wx: 0, wy: 0, face, depth }; }
  const { T, U } = edTangents(N); return { mode: 0, P, N, T, U, w, h, rot, fx, fy, wx: 0, wy: 0, face, depth };
}
/** Where a point of the shell is in a wrapped sticker's own measure (round the curve from its middle), or null far round the back. */
function edCurveQ(p, F) { const T = ED.three; const d = p.clone().sub(T.C).normalize(); const cs = Math.max(-1, Math.min(1, d.dot(F.N))); const ang = Math.acos(cs); if (ang > 2.4) return null; const tg = d.clone().addScaledVector(F.N, -cs); const tl = tg.length(); if (tl < 1e-6) return [0, 0]; return [tg.dot(F.T) / tl * ang * T.RAD, tg.dot(F.U) / tl * ang * T.RAD]; }
/** The shell point at a wrapped sticker's own (x, y): that far round the curve from its middle, in that direction. */
function edCurveAt(F, x, y) { const T = ED.three; const r = Math.hypot(x, y); const ang = r / T.RAD; const dir = F.N.clone().multiplyScalar(Math.cos(ang)); if (r > 1e-9) dir.addScaledVector(F.T, Math.sin(ang) * x / r).addScaledVector(F.U, Math.sin(ang) * y / r); return edSurfaceNear(T.C.clone().addScaledVector(dir.normalize(), T.RAD)).p; }
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
  } else if (ED.lib === 'custom') {
    // the stickers made in the Sticker maker (not the one being made now)
    const list = (ED.list || []).filter(d => d.kind === 'sticker' && d.id !== ED.design.id);
    box.innerHTML = `<div class="he-tc"><div class="muted he-small">Your stickers from the Sticker maker. Make one there and save it, and it shows here in every editor.</div>
      ${list.length ? `<div class="he-grid">${list.map(d => `<button class="he-tile he-img" data-add="custom" data-id="${edEsc(d.id)}" title="${edEsc(d.name)}">${d.thumb ? `<img src="${d.thumb}" alt="">` : edEsc(d.name)}</button>`).join('')}</div>` : '<div class="muted he-small">No stickers yet.</div>'}
      <button class="btn sm he-wide" data-tab="sticker">Open the Sticker maker</button></div>`;
  } else {
    const imgs = Object.entries(ED.design.images).filter(([, v]) => v);
    box.innerHTML = `<div class="he-tc"><button class="btn he-wide" data-ed="import-img">Import image…</button><div class="muted he-small">PNG, WebP or JPG. After adding one, "Remove background" in its settings clears a colour you click on.</div>
      ${imgs.length ? `<div class="he-group"><span class="label">In this design</span></div><div class="he-grid">${imgs.map(([id, src]) => `<div class="he-imgwrap"><button class="he-tile he-img" draggable="true" data-add="image" data-image="${id}" title="Add it to the helmet"><img src="${src}" alt=""></button>${ED.design.layers.some(l => l.image === id) ? '' : `<button class="he-imgx" data-ed="img-remove" data-img="${id}" title="Remove it from this design">✕</button>`}</div>`).join('')}</div>` : ''}</div>`;
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
const edSw = (cur, attr) => `<div class="he-sw">${ED_SWATCH.map(c => `<b class="${String(cur).toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="background:${c}" ${attr} data-v="${c}"></b>`).join('')}<label class="he-any" title="Any colour" style="background:${edEsc(cur)}"><input type="color" ${attr} value="${edEsc(cur)}"></label><input class="he-hex" ${attr} data-hex="1" value="${edEsc(String(cur).toUpperCase())}" maxlength="7" spellcheck="false" title="Hex colour code"></div>`;
function edTextPreview() {
  for (const p of ['tt', 'tl']) { const cv = ED.root.querySelector('#ed-tprev-' + p); if (!cv) continue; const t = p === 'tt' ? ED.text : ED.design.layers.find(l => l.id === ED.sel)?.text; if (!t) continue;
    const src = edTextCanvas(t); const box = cv.parentElement; const W = box.clientWidth || 220, H = box.clientHeight || 70; cv.width = W * 2; cv.height = H * 2; const g = cv.getContext('2d'); const k = Math.min(cv.width / src.width, cv.height / src.height) * 0.92; g.drawImage(src, (cv.width - src.width * k) / 2, (cv.height - src.height * k) / 2, src.width * k, src.height * k); }
}
function edPanels() { const cy = ED.root.querySelector('#ed-caryear'); if (cy && edIsCar()) cy.value = String(ED.design.year || 2026); if (ED.tab === 'sticker') ED.root.querySelectorAll('[data-stk]').forEach(b => b.classList.toggle('on', b.dataset.stk === `${ED.design.w || 1024}x${ED.design.h || 1024}`)); edBasePanel(); edLayers(); edProps(); const n = ED.root.querySelector('#ed-name'); if (n && document.activeElement !== n) n.value = ED.design.name; edStatus(); }
function edBasePanel() {
  const b = ED.design.base; const el = ED.root.querySelector('#ed-base'); if (!el) return; if (!b) { el.innerHTML = ''; return; } // (a sticker has no base: its background is see-through)
  el.innerHTML = `<div class="he-baserow"><span class="he-chip" style="background:${b.fade ? `linear-gradient(${b.dir === 'fb' ? '90deg' : '180deg'}, ${b.color}, ${b.color2})` : b.color}"></span>${edSw(b.color, 'data-base="color"')}</div>
    <label class="he-chk"><input type="checkbox" data-base="fade" ${b.fade ? 'checked' : ''}> Fade to a second colour, <select class="he-mini" data-base="dir"><option value="tb" ${b.dir !== 'fb' ? 'selected' : ''}>top to bottom</option><option value="fb" ${b.dir === 'fb' ? 'selected' : ''}>front to back</option></select></label>
    ${b.fade ? `<div class="he-baserow"><span class="he-chip" style="background:${b.color2}"></span>${edSw(b.color2, 'data-base="color2"')}</div>` : ''}`;
}
function edLayers() {
  const el = ED.root.querySelector('#ed-layers'); if (!el) return; const L = ED.design.layers;
  if (!L.length) { el.innerHTML = '<div class="muted he-small" style="padding:6px 2px">No layers yet. Add a shape, text or an image.</div>'; return; }
  // top of the list is drawn on top; a group's layers sit together under its own row
  const G = ED.design.groups || {}; const seen = new Set(); const multi = ED.multi || new Set(); let html = '';
  for (const l of L.slice().reverse()) {
    if (l.group && G[l.group] && !seen.has(l.group)) { seen.add(l.group); const n = L.filter(x => x.group === l.group).length;
      html += `<div class="he-ly he-gh-row ${ED.selGroup === l.group ? 'sel' : ''}" data-gsel="${l.group}"><span class="he-th he-gico">▤</span><span class="he-nm">${edEsc(G[l.group].name)}<small>Group · ${n} layers</small></span><span></span></div>`; }
    html += `<div class="he-ly ${l.group && G[l.group] ? 'grp' : ''} ${l.id === ED.sel || multi.has(l.id) ? 'sel' : ''} ${l.visible === false ? 'hid' : ''}" data-layer="${l.id}">
    <span class="he-th">${edThumb(l)}</span><span class="he-nm">${edEsc(l.name)}<small>${edEsc(edKindLine(l))}</small></span>
    <span class="he-ic"><button data-vis="${l.id}" title="${l.visible === false ? 'Show' : 'Hide'}">${l.visible === false ? '◌' : '●'}</button><button data-lock="${l.id}" title="${l.locked ? 'Unlock' : 'Lock'}">${l.locked ? '🔒' : '◦'}</button></span></div>`;
  }
  el.innerHTML = `<div class="he-layers">${html}</div>`;
}
const edKindLine = (l) => [l.kind === 'shape' ? 'Shape' : l.kind === 'text' ? `Text · ${l.text.font}` : l.mode === 'uv' ? 'Whole texture' : 'Image', l.mode === 'wrap' ? 'wraps' : '', l.mirror ? 'mirrored' : ''].filter(Boolean).join(' · ');
function edThumb(l) {
  if (l.kind === 'shape') return edShapeSvg(l)?.svg.replace(/width="\d+" height="\d+"/, '') || '';
  if (l.kind === 'image') return `<img src="${ED.design.images[l.image] || ''}" alt="">`;
  return `<span style="font-family:'${edEsc(l.text.font)}';font-weight:${l.text.bold ? 700 : 400};color:${edEsc(l.text.fill)};font-size:10px;white-space:nowrap">${edEsc(l.text.str.slice(0, 8))}</span>`;
}
/** The colour and effects settings (one layer's, or a group's, which apply to every layer in it). */
function edLookUI(look, L) {
  const f = look.fill, st = look.stroke, gl = look.glow, sh = look.shadow;
  const r = (path, label, min, max, step, v, show) => `<div class="he-prow"><span>${label}</span><input type="range" data-look="${path}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="v">${show}</span></div>`;
  const seg = (path, cur, opts) => `<div class="seg he-seg">${opts.map(([v, t]) => `<button data-look="${path}" data-v="${v}" class="${cur === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const on = (path, v, label) => `<label class="he-chk he-fxh"><input type="checkbox" data-look="${path}" ${v ? 'checked' : ''}> ${label}</label>`;
  const shape = L && ED_SHAPES.find(s => s.id === L.shape);
  const own = L?.kind === 'shape' && !shape?.fixed && f.mode === 'original' ? `${edSw(L.colors[0], 'data-lc="0"')}${/="[OA]"/.test(shape?.svg || '') ? `<div class="label">Second colour</div>${edSw(/="A"/.test(shape.svg) ? L.colors[2] : L.colors[1], `data-lc="${/="A"/.test(shape.svg) ? 2 : 1}"`)}` : ''}` : '';
  return `<div class="he-fx"><div class="label">Colour</div>${seg('fill.mode', f.mode, [['original', L?.kind === 'image' ? 'Original' : 'Own'], ['solid', 'Solid'], ['gradient', 'Gradient']])}
      ${f.mode === 'original' ? own : edSw(f.c1, 'data-look="fill.c1"')}
      ${f.mode === 'gradient' ? `${edSw(f.c2, 'data-look="fill.c2"')}<div class="he-ramp" style="background:linear-gradient(${90 + (f.angle || 0)}deg, ${f.c1}, ${f.c2})"></div>${r('fill.angle', 'Angle', 0, 359, 1, f.angle || 0, (f.angle || 0) + '°')}` : ''}</div>
    <div class="he-fx">${on('stroke.on', st.on, 'Stroke')}${st.on ? `${seg('stroke.side', st.side, [['outside', 'Outside'], ['inside', 'Inside'], ['both', 'Both']])}${r('stroke.w', 'Width', 0.5, 20, 0.5, st.w, st.w + '%')}${edSw(st.color, 'data-look="stroke.color"')}` : ''}</div>
    <div class="he-fx">${on('glow.on', gl.on, 'Glow')}${gl.on ? `${edSw(gl.color, 'data-look="glow.color"')}${r('glow.size', 'Softness', 0, 25, 0.5, gl.size, gl.size + '%')}${r('glow.spread', 'Spread', 0, 12, 0.5, gl.spread, gl.spread + '%')}${r('glow.opacity', 'Opacity', 0, 1, 0.01, gl.opacity, Math.round(gl.opacity * 100) + '%')}` : ''}</div>
    <div class="he-fx">${on('shadow.on', sh.on, 'Shadow')}${sh.on ? `${edSw(sh.color, 'data-look="shadow.color"')}${r('shadow.opacity', 'Opacity', 0, 1, 0.01, sh.opacity, Math.round(sh.opacity * 100) + '%')}${r('shadow.angle', 'Direction', 0, 359, 1, sh.angle, sh.angle + '°')}${r('shadow.dist', 'Distance', 0, 20, 0.5, sh.dist, sh.dist + '%')}${r('shadow.blur', 'Softness', 0, 20, 0.5, sh.blur, sh.blur + '%')}` : ''}</div>`;
}
const edGroupOf = (gid) => ED.design.layers.filter(l => l.group === gid);
function edProps() {
  const el = ED.root.querySelector('#ed-props'); if (!el) return; const L = ED.design.layers.find(l => l.id === ED.sel);
  const G = ED.selGroup && (ED.design.groups || {})[ED.selGroup]; const members = G ? edGroupOf(ED.selGroup) : [];
  ED.root.querySelector('#ed-ptitle').innerHTML = L ? `<input class="he-lname" id="ed-lname" value="${edEsc(L.name)}" maxlength="40" title="Rename the layer">` : G ? `<input class="he-lname" id="ed-gname" value="${edEsc(G.name)}" maxlength="40" title="Rename the group">` : ED.multi?.size > 1 ? `${ED.multi.size} layers` : 'Layer';
  ED.root.querySelector('#ed-pkind').textContent = L ? edKindLine(L) : G ? `Group · ${members.length} layers` : '';
  if (!L && G) {
    el.innerHTML = `<div class="muted he-small">Moving a layer in the group moves them all. Settings here apply to every layer in it.</div>
      <label class="he-chk"><input type="checkbox" data-gb="mirror" ${members.every(m => m.mirror) ? 'checked' : ''}> Mirror the group on the other side</label>
      <div class="he-row"><button class="btn sm" data-ed="gdup">Duplicate group</button><button class="btn sm" data-ed="ungroup">Ungroup</button><button class="btn sm" data-ed="gdel">Delete group</button></div>
      ${edLookUI(edLook(members[0] || {}), null)}`;
    return;
  }
  if (!L) { el.innerHTML = ED.multi?.size > 1 ? `<div class="muted he-small">${ED.multi.size} layers selected.</div><button class="btn sm he-wide" data-ed="group">Group them</button>` : '<div class="muted he-small">Select a layer to change it. Click a sticker on the helmet, or a layer in the list (Ctrl+click to pick several, then group them).</div>'; return; }
  const range = (k, label, min, max, step, v, show) => `<div class="he-prow"><span>${label}</span><input type="range" data-lp="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="v">${show}</span></div>`;
  el.innerHTML = `
    ${L.mode === 'flat' ? (() => { const [w, h] = edDims(L); const W = ED.design.w || 1024; return range('scale', 'Size', 0.2, 3, 0.01, 1, 'both') + range('w', 'Width', 0.01, 3, 0.001, w, Math.round(w * W) + ' px') + range('len', 'Length', 0.01, 4, 0.001, Math.min(h, 4), Math.round(h * W) + ' px'); })() : L.mode === 'uv' ? '' : (() => { const [w, h] = edDims(L); const mx = L.mode === 'wrap' ? 0.9 : L.curve && L.mode === 'stick' ? 0.6 : 0.32; return range('scale', 'Size', 0.2, 3, 0.01, 1, 'both') + range('w', 'Width', 0.005, 0.32, 0.001, w, Math.round(w * 1000) + ' mm') + range('len', 'Length', 0.005, mx, 0.001, Math.min(h, mx), Math.round(h * 1000) + ' mm'); })()}
    ${L.mode === 'uv' ? '' : range('rot', 'Rotation', -180, 180, 1, L.rot || 0, Math.round(L.rot || 0) + '°')}
    ${range('opacity', 'Opacity', 0, 1, 0.01, L.opacity ?? 1, Math.round((L.opacity ?? 1) * 100) + '%')}
    ${L.kind === 'text' ? `<div class="he-tc">${edTextForm(L.text, 'tl')}</div>` : ''}
    ${L.kind === 'image' && L.mode !== 'uv' ? `<button class="btn sm he-wide" data-ed="bg">Remove background…</button>` : ''}
    ${L.mode === 'uv' ? '' : edLookUI(edLook(L), L)}
    ${L.mode === 'uv' ? '' : `<div class="he-fx"><div class="label">Auto-mask</div>${L.mask ? `<div class="muted he-small">On: the parts the layers above covered when it was made are hidden. It stays as it is until you update or remove it.</div><div class="he-row"><button class="btn sm" data-ed="mask">Update mask</button><button class="btn sm" data-ed="unmask">Remove mask</button></div>` : `<button class="btn sm he-wide" data-ed="mask" title="Hide the parts of this layer that the layers above it cover (frozen as it is now)">Mask to what's visible</button>`}</div>`}
    ${L.mode === 'flat' ? `<div class="he-row he-wrapbtns"><button class="btn sm" data-ed="flipx">Flip ⇋</button><button class="btn sm" data-ed="flipy">Flip ⇵</button><button class="btn sm" data-ed="centre" title="In the middle of the canvas">Centre</button></div>` : L.mode === 'uv' ? '' : `<label class="he-chk"><input type="checkbox" data-lb="mirror" ${L.mirror ? 'checked' : ''}> Mirror on the other side</label>
    ${L.mirror ? `<label class="he-chk"><input type="checkbox" data-lb="mirrorRot" ${L.mirrorRot !== false ? 'checked' : ''}> Mirror turns the other way</label>
    <button class="btn sm he-wide" data-ed="detach" title="The mirror becomes a layer of its own, in the same place: change its colour or anything else separately">Make the mirror its own layer</button>` : ''}
    ${edIsCar() ? '' : `<div class="he-row he-proj"><span class="muted he-small">Projection</span><div class="seg he-seg"><button data-proj="stick" class="${L.mode === 'stick' || !L.mode ? 'on' : ''}" title="Follows the surface where it sits (bends with the curve)">Follow surface</button><button data-proj="stamp" class="${L.mode === 'stamp' ? 'on' : ''}" title="Stamped straight on from the view it was aimed from: from there it looks exactly as drawn (lines stay straight)">Stamp from view</button><button data-proj="wrap" class="${L.mode === 'wrap' ? 'on' : ''}" title="Wraps round the helmet (for stripes front to back)">Wrap round</button></div>${L.mode === 'stamp' ? '<button class="btn sm" data-ed="aim" title="Stamps it from the way you are looking at the helmet now">Aim from this view</button>' : ''}</div>`}
    <div class="he-row he-wrapbtns"><button class="btn sm" data-ed="flipx">Flip ⇋</button><button class="btn sm" data-ed="flipy">Flip ⇵</button><button class="btn sm" data-ed="centre" title="On the middle line, front to back">Centre</button></div>`}`;
  edTextPreview();
}
function edStatus(msg) { const s = ED.root?.querySelector('#ed-status'); if (!s) return; s.textContent = msg || `${ED.design.layers.length} layer${ED.design.layers.length === 1 ? '' : 's'}${ED.dirty ? ' · not saved yet' : ED.savedAt ? ' · saved' : ''}`; }

// ---- changes (each one undoable), saved a moment after the last
function edSnap() { return JSON.stringify({ name: ED.design.name, base: ED.design.base, layers: ED.design.layers, groups: ED.design.groups || {}, size: [ED.design.w, ED.design.h] }); }
function edCommit(fn, { bake = true, panels = true } = {}) {
  ED.undo.push(edSnap()); if (ED.undo.length > 100) ED.undo.shift(); ED.redo = []; ED.textEdit = null;
  fn(); edChanged(bake, panels);
}
function edChanged(bake = true, panels = true) { ED.dirty = true; if (bake) edBake(); if (panels) edPanels(); else edStatus(); clearTimeout(ED.saveT); ED.saveT = setTimeout(edSave, 2500); }
function edRestore(s) { const o = JSON.parse(s); ED.design.name = o.name; ED.design.base = o.base; ED.design.layers = o.layers; ED.design.groups = o.groups || {}; if (o.size?.[0]) [ED.design.w, ED.design.h] = o.size; if (!ED.design.layers.some(l => l.id === ED.sel)) ED.sel = null; if (ED.selGroup && !ED.design.groups[ED.selGroup]) ED.selGroup = null; edChanged(); }
function edUndo() { if (!ED.undo.length) return; ED.redo.push(edSnap()); edRestore(ED.undo.pop()); }
function edRedo() { if (!ED.redo.length) return; ED.undo.push(edSnap()); edRestore(ED.redo.pop()); }
async function edSave(silent) {
  clearTimeout(ED.saveT); const D = ED.design; D.at = new Date().toISOString();
  // (imported images stay in the design, in its Images tab, until removed there; undo can bring back a layer using one)
  let thumb = null, png = null; if (edIsCar()) { if (ED.stkCv) { const tc = edCanvas(160, 120); tc.getContext('2d').drawImage(ED.stkCv, 20, 0, 120, 120); thumb = tc.toDataURL('image/jpeg', 0.8); } }
  else if (edIsStk()) { const c = edStkPng(); if (c) { png = c.toDataURL('image/png'); const tc = edCanvas(160, 120), k = Math.min(150 / c.width, 110 / c.height); tc.getContext('2d').drawImage(c, (160 - c.width * k) / 2, (120 - c.height * k) / 2, c.width * k, c.height * k); thumb = tc.toDataURL('image/png'); } }
  else try { if (ED.three) { edFrame(); const c = ED.three.R.domElement; const t = document.createElement('canvas'); t.width = 160; t.height = 120; const k = Math.max(160 / c.width, 120 / c.height); t.getContext('2d').drawImage(c, (160 - c.width * k) / 2, (120 - c.height * k) / 2, c.width * k, c.height * k); thumb = t.toDataURL('image/jpeg', 0.8); } } catch { }
  const r = await edApi().save({ ...D, kind: D.kind || 'helmet', thumb, ...(png ? { png } : {}) }); if (r?.ok) { ED.dirty = false; ED.savedAt = Date.now(); edStatus(); if (!silent) edList(); }
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
  if (edCar3dOn()) {
    const r = ED.three.R.domElement.getBoundingClientRect(); const C = ED.car3; const h = (at && edCarHit(at[0], at[1])) || edCarHit(r.left + r.width / 2, r.top + r.height / 2);
    const p = h ? h.p : (C.target || ED_CARMID).clone(); const n = C.cam.position.clone().sub(C.target || ED_CARMID).normalize();
    const L = { id: edUid(), kind, name: 'Layer', visible: true, locked: false, mirror: false, mode: 'stamp', p: p.toArray(), n: n.toArray(), size: kind === 'text' ? 0.5 : 0.25, stretch: 1, rot: 0, opacity: 1, ...opts };
    if (kind === 'shape') { const S = ED_SHAPES.find(s => s.id === L.shape); L.name = S?.name || 'Shape'; L.colors ||= [S?.cat === 'Flags' ? '#ffffff' : '#E10600', '#111111', '#001E6E']; }
    if (kind === 'text') L.name = opts.text.str || 'Text'; if (kind === 'image') L.name = opts.name || 'Image';
    edCommit(() => { ED.design.layers.push(L); ED.sel = L.id; }); return;
  }
  if (edIsStk()) {
    const D = ED.design; const W = D.w || 1024, H = D.h || 1024; let x = 0.5, y = 0.5; if (!at && edCar3dOn()) { const r = ED.three.R.domElement.getBoundingClientRect(); at = [r.left + r.width / 2, r.top + r.height / 2]; } if (at) { const [X, Y] = edStkAt(at[0], at[1]); if (X >= 0 && Y >= 0 && X <= W && Y <= H) { x = X / W; y = Y / H; } }
    const L = { id: edUid(), kind, name: 'Layer', visible: true, locked: false, mirror: false, mode: 'flat', x, y, size: edIsCar() ? (kind === 'text' ? 0.3 : 0.18) : kind === 'text' ? 0.7 : 0.45, stretch: 1, rot: 0, opacity: 1, ...opts };
    if (kind === 'shape') { const S = ED_SHAPES.find(s => s.id === L.shape); L.name = S?.name || 'Shape'; L.colors ||= [S?.cat === 'Flags' ? '#ffffff' : '#E10600', '#111111', '#001E6E']; if (S && /stripe|pin/.test(S.id)) L.size = 0.1; }
    if (kind === 'text') L.name = opts.text.str || 'Text'; if (kind === 'image') L.name = opts.name || 'Image';
    edCommit(() => { D.layers.push(L); ED.sel = L.id; }); return;
  }
  if (!ED.three) return; const r = ED.three.R.domElement.getBoundingClientRect();
  const hit = (at && edHitAt(at[0], at[1])) || edHitAt(r.left + r.width / 2, r.top + r.height / 2) || { p: ED.three.C.clone().add(new THREE.Vector3(0.11, 0.03, 0)), n: new THREE.Vector3(1, 0, 0) };
  const stamp = edPlace() === 'stamp'; const L = { id: edUid(), kind, name: 'Layer', visible: true, locked: false, mirror: false, mode: stamp ? 'stamp' : 'stick', curve: !stamp, p: hit.p.toArray(), n: (stamp ? edViewDir() : hit.n).toArray(), size: 0.08, stretch: 1, rot: 0, opacity: 1, ...opts };
  if (kind === 'shape') { const S = ED_SHAPES.find(s => s.id === L.shape); L.name = S?.name || 'Shape'; L.colors ||= [S?.cat === 'Flags' ? '#ffffff' : '#E10600', '#111111', '#001E6E']; if (S && /stripe|pin/.test(S.id)) { L.mode = 'wrap'; const wy = edWrapOf(hit.p)[1]; L.wx = 0; L.wy = wy; L.size = S.id === 'stripe' ? 0.03 : 0.06; L.stretch = 8; } if (S?.cat === 'Flags') L.size = 0.07; }
  if (kind === 'text') { L.name = opts.text.str || 'Text'; L.size = 0.09; }
  if (kind === 'image') L.name = opts.name || 'Image';
  edCommit(() => { ED.design.layers.push(L); ED.sel = L.id; });
}
async function edAddCustom(id) {
  const d = await edApi().open(id); if (!d?.png) { toast('That sticker has nothing on it yet.'); return; }
  const key = 'stk-' + id; ED.design.images[key] = d.png; edAdd('image', { image: key, name: d.name || 'Sticker' });
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
    if (im.naturalWidth !== im.naturalHeight * 2 || im.naturalWidth < 1024) { toast(`The texture must be in the game's layout, 4096 x 2048 or 2048 x 1024 (this one is ${im.naturalWidth} x ${im.naturalHeight}).`); return; }
    const id = edUid(); ED.design.images[id] = rd.result;
    edCommit(() => { const L = { id: edUid(), kind: 'image', name: f.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Texture', visible: true, locked: false, mode: 'uv', image: id, opacity: 1, mirror: false }; ED.design.layers.unshift(L); ED.sel = L.id; });
  }; im.src = rd.result; }; rd.readAsDataURL(f);
}

// ---- clicks and edits in the editor
function edClick(e) {
  const t = e.target.closest('[data-ed],[data-tab],[data-carview],[data-ccam],[data-proj],[data-place],[data-stk],[data-lib],[data-add],[data-cam],[data-mode],[data-layer],[data-gsel],[data-vis],[data-lock],[data-tf],[data-base],[data-lc],[data-look],[data-open],[data-delete]'); if (!t) { ED.root.querySelector('#ed-menu')?.classList.remove('on'); return; }
  if (t.matches('input, select, label')) return; // (inputs are handled as input events)
  const D = ED.design; const L = D.layers.find(l => l.id === ED.sel);
  // colour and effects: swatches and the Own / Solid / Gradient and stroke side buttons
  if (t.dataset.look && t.dataset.v != null) { const v = t.dataset.v; edCommit(() => edSetLook(t.dataset.look, v)); return; }
  if (t.dataset.gsel) { ED.selGroup = t.dataset.gsel; ED.sel = null; ED.multi = new Set(); edLayers(); edProps(); edDraw(); return; }
  if (t.dataset.layer && (e.ctrlKey || e.metaKey || e.shiftKey)) { const m = ED.multi ||= new Set(); if (ED.sel) m.add(ED.sel); const id = t.dataset.layer; m.has(id) ? m.delete(id) : m.add(id); ED.sel = m.size === 1 ? [...m][0] : null; ED.selGroup = null; edLayers(); edProps(); edDraw(); return; }
  if (t.dataset.tab) { edSwitchTab(t.dataset.tab); return; }
  if (t.dataset.carview) { edCarView(t.dataset.carview); return; }
  if (t.dataset.ccam && ED.car3) { [ED.car3.yaw, ED.car3.pitch] = ED_CARCAMS[t.dataset.ccam]; edDraw(); return; }
  if (t.dataset.proj) { const L = ED.design.layers.find(l => l.id === ED.sel); if (L) edSetProj(L, t.dataset.proj); return; }
  if (t.dataset.place) { ED.place = t.dataset.place; try { localStorage.setItem('pitwall.editor.place', ED.place); } catch { } ED.root.querySelectorAll('[data-place]').forEach(b => b.classList.toggle('on', b.dataset.place === ED.place)); return; }
  if (t.dataset.stk) { const [w, h] = t.dataset.stk.split('x').map(Number); edCommit(() => { D.w = w; D.h = h; }); return; }
  if (t.dataset.lib) { ED.lib = t.dataset.lib; if (ED.lib === 'custom') edList().then(edLib); edLib(); return; }
  if (t.dataset.add === 'custom') { edAddCustom(t.dataset.id); return; }
  if (t.dataset.add) { if (t.dataset.add === 'shape') edAdd('shape', { shape: t.dataset.shape }); else edAdd('image', { image: t.dataset.image, name: 'Image' }); return; }
  if (t.dataset.cam) { const V = { front: [0, 0.05], left: [Math.PI / 2, 0.08], right: [-Math.PI / 2, 0.08], back: [Math.PI, 0.05], top: [0, 1.5] }[t.dataset.cam]; [ED.three.yaw, ED.three.pitch] = V; edDraw(); return; }
  if (t.dataset.mode) { ED.view = t.dataset.mode; ED.root.querySelectorAll('#ed-mode button').forEach(b => b.classList.toggle('on', b === t)); ED.root.querySelector('#ed-flat').style.display = ED.view === 'flat' ? 'block' : 'none'; edDraw(); return; }
  if (t.dataset.vis) { e.stopPropagation(); edCommit(() => { const l = D.layers.find(x => x.id === t.dataset.vis); l.visible = l.visible === false; }); return; }
  if (t.dataset.lock) { e.stopPropagation(); edCommit(() => { const l = D.layers.find(x => x.id === t.dataset.lock); l.locked = !l.locked; }, { bake: false }); return; }
  if (t.dataset.layer) { ED.sel = t.dataset.layer; ED.multi = new Set(); ED.selGroup = null; edLayers(); edProps(); edDraw(); return; }
  if (t.dataset.open) { edOpen(t.dataset.open); return; }
  if (t.dataset.delete) { e.stopPropagation(); if (confirm('Delete this design? This can’t be undone.')) edApi().remove(t.dataset.delete).then(edList).then(edMenu); return; }
  // swatches (the colour inputs are handled as input events)
  if (t.tagName === 'B' && t.dataset.v) {
    if (t.dataset.base) { edCommit(() => { D.base[t.dataset.base] = t.dataset.v; }); return; }
    if (t.dataset.lc && L) { edCommit(() => { L.colors[+t.dataset.lc] = t.dataset.v; }); return; }
    if (t.dataset.tf) { edTextSet(t.dataset.tf, t.dataset.v, t); return; }
  }
  if (t.dataset.tf && t.tagName === 'BUTTON') { if (t.dataset.tf === 'font') edTextSet('font', t.dataset.v, t); else if (t.dataset.tf === 'bold' || t.dataset.tf === 'italic') edTextSet(t.dataset.tf, null, t); return; }
  let a = t.dataset.ed; if (ED.selGroup && !L) a = { del: 'gdel', dup: 'gdup' }[a] || a; // (the list's buttons act on a selected group)
  if (a === 'undo') edUndo(); else if (a === 'redo') edRedo();
  else if (a === 'pick-game') edApi().pickGame().then(r => { if (r?.ok) { ED.err = null; edLoad(); } else if (r?.error) toast(r.error); });
  else if (a === 'add-text') edAdd('text', { text: { ...ED.text } });
  else if (a === 'import-img') ED.root.querySelector('#ed-file').click();
  else if (a === 'import-tex') ED.root.querySelector('#ed-texfile').click();
  else if (a === 'dup' && L) edCommit(() => { const c = JSON.parse(JSON.stringify(L)); c.id = edUid(); c.name = L.name + ' copy'; if (c.p) { const n = new THREE.Vector3(...c.n); const { T } = edTangents(n); c.p = new THREE.Vector3(...c.p).addScaledVector(T, 0.01).toArray(); } if (c.mode === 'wrap') c.wx = (c.wx || 0) + 0.01; D.layers.splice(D.layers.indexOf(L) + 1, 0, c); ED.sel = c.id; });
  else if (a === 'del' && L) edCommit(() => { D.layers.splice(D.layers.indexOf(L), 1); ED.sel = null; });
  else if ((a === 'up' || a === 'down') && L) edCommit(() => { const i = D.layers.indexOf(L), j = i + (a === 'up' ? 1 : -1); if (j < 0 || j >= D.layers.length) return; D.layers.splice(i, 1); D.layers.splice(j, 0, L); });
  else if (a === 'mask' && L) edAutoMask(L);
  else if (a === 'unmask' && L) edCommit(() => { delete L.mask; });
  else if (a === 'group' && ED.multi?.size > 1) edCommit(() => {
    // the layers picked become a group, kept together in the list where the topmost of them was
    const ids = ED.multi; const gid = edUid(); (D.groups ||= {})[gid] = { name: `Group ${Object.keys(D.groups).length + 1}` };
    const picked = D.layers.filter(l => ids.has(l.id)); const at = Math.max(...picked.map(l => D.layers.indexOf(l)));
    const rest = D.layers.filter(l => !ids.has(l.id)); const before = D.layers.slice(0, at + 1).filter(l => !ids.has(l.id)).length;
    picked.forEach(l => { l.group = gid; }); D.layers = [...rest.slice(0, before), ...picked, ...rest.slice(before)];
    ED.multi = new Set(); ED.sel = null; ED.selGroup = gid;
  });
  else if (a === 'ungroup' && ED.selGroup) edCommit(() => { edGroupOf(ED.selGroup).forEach(l => delete l.group); delete D.groups[ED.selGroup]; ED.selGroup = null; });
  else if (a === 'gdel' && ED.selGroup) edCommit(() => { const g = ED.selGroup; D.layers = D.layers.filter(l => l.group !== g); delete D.groups[g]; ED.selGroup = null; });
  else if (a === 'gdup' && ED.selGroup) edCommit(() => {
    const g = ED.selGroup, ng = edUid(); D.groups[ng] = { name: D.groups[g].name + ' copy' }; const m = edGroupOf(g); const at = D.layers.indexOf(m[m.length - 1]);
    const copies = m.map(l => { const c = JSON.parse(JSON.stringify(l)); c.id = edUid(); c.group = ng; if (c.p) { const { T } = edTangents(new THREE.Vector3(...c.n)); c.p = new THREE.Vector3(...c.p).addScaledVector(T, 0.012).toArray(); } if (c.mode === 'wrap') c.wx = (c.wx || 0) + 0.012; return c; });
    D.layers.splice(at + 1, 0, ...copies); ED.selGroup = ng;
  });
  else if ((a === 'up' || a === 'down') && ED.selGroup) edCommit(() => {
    // the whole group, past the next layer (or group) above or below it
    const m = edGroupOf(ED.selGroup); const lo = D.layers.indexOf(m[0]), hi = D.layers.indexOf(m[m.length - 1]); const rest = D.layers.filter(l => l.group !== ED.selGroup);
    let pos = a === 'up' ? lo + 1 : lo - 1; pos = Math.max(0, Math.min(rest.length, pos)); D.layers = [...rest.slice(0, pos), ...m, ...rest.slice(pos)]; void hi;
  });
  else if (a === 'img-remove') { const id = t.dataset.img; if (!D.layers.some(l => l.image === id)) { delete D.images[id]; edLib(); edChanged(false, false); } }
  else if (a === 'detach' && L) edCommit(() => {
    // the mirror as a layer of its own, exactly where (and how) the mirror was drawn
    const c = JSON.parse(JSON.stringify(L)); c.id = edUid(); c.name = `${L.name} (mirror)`; c.mirror = false; L.mirror = false;
    if (L.kind === 'shape' && L.reflect !== false) c.flipX = !L.flipX; if (L.mirrorRot !== false) c.rot = -(L.rot || 0);
    if (L.mode === 'wrap') c.wx = -(L.wx || 0); else { const cx = edIsCar() ? 0 : ED.three.C.x; c.p = [2 * cx - L.p[0], L.p[1], L.p[2]]; c.n = [-L.n[0], L.n[1], L.n[2]]; } // (the car's middle line is x = 0)
    D.layers.splice(D.layers.indexOf(L) + 1, 0, c); ED.sel = c.id;
  });
  else if (a === 'flipx' && L) edCommit(() => { L.flipX = !L.flipX; });
  else if (a === 'flipy' && L) edCommit(() => { L.flipY = !L.flipY; });
  else if (a === 'centre' && L && L.mode === 'flat') edCommit(() => { L.x = 0.5; L.y = 0.5; });
  else if (a === 'aim' && L && L.mode === 'stamp') edCommit(() => { L.n = edViewDir().toArray(); });
  else if (a === 'centre' && L && L.mode === 'stamp' && edIsCar()) edCommit(() => { L.p = [0, L.p[1], L.p[2]]; const n = new THREE.Vector3(...L.n); n.x = 0; if (n.lengthSq() > 1e-6) L.n = n.normalize().toArray(); });
  else if (a === 'centre' && L) edCommit(() => { if (L.mode === 'wrap') L.wx = 0; else { const p = new THREE.Vector3(...L.p); p.x = ED.three.C.x; const h = edSurfaceNear(p); L.p = h.p.toArray(); if (L.mode !== 'stamp') { L.n = h.n.toArray(); } else { const n = new THREE.Vector3(...L.n); n.x = 0; if (n.lengthSq() > 1e-6) L.n = n.normalize().toArray(); } } });
  else if (a === 'bg' && L) edBgOpen(L);
  else if (a === 'save') edSave().then(() => toast('Saved.'));
  else if (a === 'stk-save') edSave().then(() => { toast('Saved: it’s in Add › Custom, in every editor.'); edList().then(() => { if (ED.lib === 'custom') edLib(); }); });
  else if (a === 'new') { if (ED.dirty) edSave(true); ED.design = edIsCar() ? edNewCar() : edIsStk() ? edNewSticker() : edNew(); ED.sel = null; ED.undo = []; ED.redo = []; ED.dirty = false; ED.savedAt = null; edPanels(); edLib(); edBake(); }
  else if (a === 'designs') { edList().then(edMenu); }
  else if (a === 'png') edExportPng();
  else if (a === 'export') edExport('addon');
  else if (a === 'car-export') edCarExport();
  else if (a === 'export-hx') edExport('hx');
  else if (a?.startsWith('bg-')) edBgAction(a, t);
}
function edMenu() {
  const m = ED.root.querySelector('#ed-menu'); if (!m) return;
  const kind = edIsCar() ? 'car' : edIsStk() ? 'sticker' : 'helmet'; const list = ED.list.filter(d => (d.kind || 'helmet') === kind);
  m.innerHTML = list.length ? list.map(d => `<div class="he-mi" data-open="${d.id}">${d.thumb ? `<img src="${d.thumb}" alt="">` : '<span class="he-noimg"></span>'}<span>${edEsc(d.name)}<small>${new Date(d.at).toLocaleString()}</small></span><button class="icon-btn" data-delete="${d.id}" title="Delete">✕</button></div>`).join('') : '<div class="muted he-small" style="padding:10px">No saved designs yet.</div>';
  m.classList.add('on');
}
async function edOpen(id) {
  ED.root.querySelector('#ed-menu')?.classList.remove('on'); if (ED.dirty) await edSave(true);
  const d = await edApi().open(id); if (!d) { toast('Couldn’t open that design.'); return; }
  delete d.thumb; ED.design = { images: {}, ...d }; ED.sel = null; ED.undo = []; ED.redo = []; ED.dirty = false; ED.savedAt = Date.now(); edPanels(); edLib(); edBake(); if (edCar3dOn()) edCarView('3d'); // (its year's car)
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
/** Sets a colour or effect setting ("glow.size") on the selected layer, or on every layer of the selected group. */
function edSetLook(path, v) {
  const [a, b] = path.split('.'); const targets = ED.selGroup ? edGroupOf(ED.selGroup) : ED.design.layers.filter(l => l.id === ED.sel);
  const num = ['angle', 'w', 'size', 'spread', 'opacity', 'dist', 'blur'].includes(b); const val = typeof v === 'boolean' ? v : num ? +v : v;
  for (const L of targets) { L.look ||= {}; L.look[a] = { ...(L.look[a] || {}), [b]: val }; }
}
function edInput(e) {
  const t = e.target; const D = ED.design; const L = D.layers.find(l => l.id === ED.sel);
  // a hex code box: on Enter or leaving it, as if that colour were picked
  if (t.dataset.hex) { if (e.type !== 'change') return; let v = t.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map(c => c + c).join(''); if (!/^#[0-9a-f]{6}$/i.test(v)) { toast('Use a hex colour code like #E10600.'); return; } t.value = v.toUpperCase(); }
  if (t.id === 'ed-lname') { if (e.type === 'change' && L) edCommit(() => { L.name = t.value.trim() || L.name; }, { bake: false }); return; }
  if (t.id === 'ed-gname') { if (e.type === 'change' && ED.selGroup) edCommit(() => { D.groups[ED.selGroup].name = t.value.trim() || D.groups[ED.selGroup].name; }, { bake: false }); return; }
  if (t.dataset.gb && ED.selGroup) { edCommit(() => { edGroupOf(ED.selGroup).forEach(l => { l.mirror = t.checked; }); }); return; }
  if (t.dataset.look) {
    if (t.type === 'checkbox') { edCommit(() => edSetLook(t.dataset.look, t.checked)); return; }
    if (t.type === 'range') {
      // one undo step for a whole drag; the picture's made again as it goes
      if (e.type === 'input') { if (ED.sliding !== t) { ED.undo.push(edSnap()); ED.redo = []; ED.sliding = t; } edSetLook(t.dataset.look, t.value); const lab = t.parentElement.querySelector('.v'); const k = t.dataset.look.split('.')[1]; if (lab) lab.textContent = k === 'opacity' ? Math.round(+t.value * 100) + '%' : k === 'angle' ? t.value + '°' : t.value + '%'; if (t.dataset.look === 'fill.angle') { const rp = ED.root.querySelector('.he-ramp'); const f = edLook(L || edGroupOf(ED.selGroup)[0] || {}).fill; if (rp) rp.style.background = `linear-gradient(${90 + +t.value}deg, ${f.c1}, ${f.c2})`; } edChanged(true, false); }
      else ED.sliding = null; return;
    }
    if ((t.type === 'color' || t.dataset.hex) && e.type === 'change') { edCommit(() => edSetLook(t.dataset.look, t.value)); return; }
    return;
  }
  if (t.id === 'ed-q') { ED.q = t.value; const pos = t.selectionStart; edLib(); const q = ED.root.querySelector('#ed-q'); q.focus(); q.setSelectionRange(pos, pos); return; }
  if (t.id === 'ed-target') { if (e.type === 'change') edSetTarget(t.value); return; }
  if (t.id === 'ed-gres') { if (e.type === 'change') { try { localStorage.setItem('pitwall.editor.gameRes', t.value); } catch { } } return; }
  if (t.id === 'ed-carpart') { if (e.type === 'change') edCarPart(t.value); return; }
  if (t.id === 'ed-caryear') { if (e.type === 'change') { edCommit(() => { D.year = +t.value; }, { bake: false }); edCarGuide(); if (ED.carView === '3d') edCarView('3d'); } return; }
  if (t.id === 'ed-guide' || t.id === 'ed-guideop') { edDrawSticker(); return; }
  if (t.id === 'ed-name') { if (e.type === 'change') edCommit(() => { D.name = t.value.trim() || 'Helmet'; }, { bake: false, panels: false }); return; }
  if (t.dataset.tf) { if ((t.type === 'color' || t.dataset.hex) && e.type !== 'change') return; edTextSet(t.dataset.tf, t.value, t); return; }
  if (t.dataset.base) { if ((t.type === 'color' || t.dataset.hex) && e.type !== 'change') return; if (t.type === 'checkbox') { edCommit(() => { D.base.fade = t.checked; }); return; } edCommit(() => { D.base[t.dataset.base] = t.value; }); return; }
  if (t.dataset.lc && L) { if (e.type !== 'change') return; edCommit(() => { L.colors[+t.dataset.lc] = t.value; }); return; }
  if (t.dataset.lb && L) { edCommit(() => { if (t.dataset.lb === 'mirror') L.mirror = t.checked; else if (t.dataset.lb === 'mirrorRot') L.mirrorRot = t.checked; else { const was = L.mode; L.mode = t.checked ? 'wrap' : 'stick'; if (L.mode === 'wrap' && was !== 'wrap') { const [wx, wy] = edWrapOf(new THREE.Vector3(...L.p)); L.wx = wx; L.wy = wy; } else if (L.mode === 'stick' && was === 'wrap') { const h = edSurfaceAtWrap(L.wx || 0, L.wy || 0); L.p = h.p.toArray(); L.n = h.n.toArray(); } } }); return; }
  if (t.dataset.lp && L) {
    // sliders: one undo step for a whole drag. Size scales both ways from where the drag began (the slider springs
    // back to the middle after); width and length change one way, the other staying as it is.
    const k = t.dataset.lp, v = +t.value;
    if (e.type === 'input') {
      if (ED.sliding !== t) { ED.undo.push(edSnap()); ED.redo = []; ED.sliding = t; ED.slideFrom = { size: L.size, stretch: L.stretch || 1 }; }
      if (k === 'scale') L.size = Math.max(0.005, Math.min(L.mode === 'flat' ? 3 : 0.9, ED.slideFrom.size * v));
      else if (k === 'w') edSetDims(L, v, null); else if (k === 'len') edSetDims(L, null, v); else L[k] = v;
      edDimLabels(L); const lab = t.parentElement.querySelector('.v'); if (lab && k === 'rot') lab.textContent = Math.round(L.rot) + '°'; else if (lab && k === 'opacity') lab.textContent = Math.round(v * 100) + '%';
      edChanged(true, false);
    } else { ED.sliding = null; if (k === 'scale') { t.value = 1; edProps(); } }
  }
}
function edKey(e) {
  if (!ED.root?.isConnected || ui.view !== 'editor') return; const a = document.activeElement; if (a && a.matches('input[type=text], input:not([type]), textarea, .he-text, .he-name, .he-search')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? edRedo() : edUndo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); edRedo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ED.selGroup && !ED.sel) { e.preventDefault(); const g = ED.selGroup; edCommit(() => { ED.design.layers = ED.design.layers.filter(l => l.group !== g); delete ED.design.groups[g]; ED.selGroup = null; }); }
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
  for (let k = D.layers.length - 1; k >= 0; k--) { const L = D.layers[k]; if (L.visible === false || L.mode === 'uv') continue; const s = ED.cache.get(L.id); if (!s) continue;
    for (const mirror of L.mirror ? [false, true] : [false]) { const F = edFrameOf(L, mirror, s.aspect); let q;
      if (F.mode === 3) { q = edCurveQ(hit.p, F); if (!q) continue; } else if (F.mode === 0) { const d = hit.p.clone().sub(F.P); if (Math.abs(d.dot(F.N)) > F.depth || hit.n.dot(F.N) < F.face) continue; q = [d.dot(F.T), d.dot(F.U)]; } else { const [x, y] = edWrapOf(hit.p); q = [x - F.wx, y - F.wy]; }
      const c = Math.cos(F.rot), sn = Math.sin(F.rot); const r = [c * q[0] + sn * q[1], -sn * q[0] + c * q[1]]; const u = r[0] / (F.w * s.ex) * F.fx + 0.5, v = r[1] / (F.h * s.ey) * F.fy + 0.5;
      if (u < 0 || v < 0 || u > 1 || v > 1) continue; const px = Math.min(s.cv.width - 1, Math.floor(u * s.cv.width)), py = Math.min(s.cv.height - 1, Math.floor((1 - v) * s.cv.height));
      if (s.data.data[(py * s.cv.width + px) * 4 + 3] > 20) return { L, mirror, hit }; }
  }
  return { L: null, hit };
}
function edDown(e) {
  if (edCar3dOn()) {
    if (e.button === 0) { const pk = edCarPick3(e.clientX, e.clientY); if (pk) { const L = pk.L; if (ED.sel !== L.id) { ED.sel = L.id; ED.selGroup = null; ED.multi = new Set(); edLayers(); edProps(); } edDraw(); if (!L.locked) { e.currentTarget.setPointerCapture(e.pointerId); ED.undo.push(edSnap()); ED.redo = []; ED.ptr = { kind: 'c3move', L, off: new THREE.Vector3(...L.p).sub(pk.hit) }; } return; } }
    if (e.button === 0) { const [X, Y] = edStkAt(e.clientX, e.clientY); if (X > -1e5 && edStkPick(X, Y)) { edStkDown(e); edDraw(); return; } }
    e.currentTarget.setPointerCapture(e.pointerId); ED.ptr = { kind: 'corbit', x: e.clientX, y: e.clientY, yaw: ED.car3.yaw, pitch: ED.car3.pitch, click: e.button === 0 }; return; }
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
  if (ED.ptr?.kind === 'corbit') { const P = ED.ptr; ED.car3.yaw = P.yaw - (e.clientX - P.x) * 0.01; ED.car3.pitch = Math.max(-1.2, Math.min(1.5, P.pitch + (e.clientY - P.y) * 0.01)); edDraw(); return; }
  if (ED.ptr?.kind === 'c3move') { const h = edCarHit(e.clientX, e.clientY); if (h) { ED.ptr.L.p = h.p.clone().add(ED.ptr.off).toArray(); edChanged(true, false); } return; }
  if (edCar3dOn() && (!ED.ptr || ED.ptr.kind === 'stkmove')) { if (ED.ptr) { const [X] = edStkAt(e.clientX, e.clientY); if (X > -1e5) edStkMove(e); } return; }
  const P = ED.ptr; if (!P) { if (ED.three && ED.view === '3d') { const pk = edPick(e.clientX, e.clientY); e.currentTarget.style.cursor = pk?.L && !pk.L.locked ? 'move' : 'grab'; } return; }
  if (P.kind === 'orbit') { if (Math.abs(e.clientX - P.x) + Math.abs(e.clientY - P.y) > 3) P.click = false; ED.three.yaw = P.yaw - (e.clientX - P.x) * 0.01; ED.three.pitch = Math.max(-1.3, Math.min(1.5, P.pitch + (e.clientY - P.y) * 0.01)); edDraw(); return; }
  if (P.kind === 'move') {
    const h = edHitAt(e.clientX, e.clientY); if (!h) return; const L = P.L;
    // where it was (on the shell, and round it), for the rest of its group to follow by the same amount
    const anchor = (l) => l.mode === 'wrap' ? { p: edSurfaceAtWrap(l.wx || 0, l.wy || 0).p, w: [l.wx || 0, l.wy || 0] } : { p: new THREE.Vector3(...l.p), w: edWrapOf(new THREE.Vector3(...l.p)) };
    const was = L.group ? anchor(L) : null;
    if (L.mode === 'wrap') { const [x, y] = edWrapOf(h.p); let wx = x + P.off[0]; if (P.mirror) wx = -wx; L.wx = Math.abs(wx) < 0.004 ? 0 : wx; L.wy = y + P.off[1]; }
    else { const p = h.p.clone(), n = h.n.clone(); if (P.mirror) { p.x = 2 * ED.three.C.x - p.x; n.x = -n.x; } L.p = p.toArray(); if (L.mode !== 'stamp') L.n = n.toArray(); }
    if (was) { const now = anchor(L); const d = now.p.clone().sub(was.p), dw = [now.w[0] - was.w[0], now.w[1] - was.w[1]];
      for (const m of edGroupOf(L.group)) { if (m === L || m.locked) continue;
        if (m.mode === 'wrap') { m.wx = (m.wx || 0) + dw[0]; m.wy = (m.wy || 0) + dw[1]; }
        else if (m.p) { const s = edSurfaceNear(new THREE.Vector3(...m.p).add(d)); m.p = s.p.toArray(); if (m.mode !== 'stamp') m.n = s.n.toArray(); } } }
    edChanged(true, false); return;
  }
  if (P.kind === 'w' || P.kind === 'len') {
    // a side handle: how far along its own direction from the middle the pointer is, against where it started
    const along = (e.clientX - P.cx) * P.ax[0] + (e.clientY - P.cy) * P.ax[1]; const k = Math.max(0.05, along / Math.max(4, P.d0));
    if (P.kind === 'w') edSetDims(P.L, P.dims[0] * k, P.dims[1]); else edSetDims(P.L, P.dims[0], P.dims[1] * k);
    edChanged(true, false); return;
  }
  if (P.kind === 'size' || P.kind === 'turn') {
    const d = Math.hypot(e.clientX - P.cx, e.clientY - P.cy); const ang = Math.atan2(e.clientY - P.cy, e.clientX - P.cx);
    if (P.kind === 'size') P.L.size = Math.max(0.005, Math.min(edMaxW(P.L), P.size * d / Math.max(4, P.d0)));
    else { let r = P.rot - (ang - P.a0) * 180 / Math.PI * P.sign; r = ((r + 540) % 360) - 180; P.L.rot = e.shiftKey ? Math.round(r / 15) * 15 : r; }
    edChanged(true, false);
  }
}
function edUp(e) {
  if (ED.ptr?.kind === 'stkmove') { edStkUp(); return; }
  if (ED.ptr?.kind === 'c3move') { ED.ptr = null; if (ED.undo.length && ED.undo[ED.undo.length - 1] === edSnap()) ED.undo.pop(); edPanels(); return; }
  if (ED.ptr?.kind === 'corbit') { const P = ED.ptr; ED.ptr = null; if (P.click && Math.abs(e.clientX - P.x) + Math.abs(e.clientY - P.y) < 4 && ED.sel) { ED.sel = null; edLayers(); edProps(); edDraw(); } return; }
  const P = ED.ptr; ED.ptr = null; if (!P) return;
  if (P.kind === 'orbit' && P.click) { const pk = edPick(e.clientX, e.clientY); if (!pk?.L && ED.sel) { ED.sel = null; edLayers(); edProps(); edDraw(); } return; }
  if (P.kind !== 'orbit') { if (ED.undo.length && ED.undo[ED.undo.length - 1] === edSnap()) ED.undo.pop(); edPanels(); }
}
/** The selected sticker's box on screen, with corner handles (size) and a top handle (turn). */
function edGizmo() {
  const svg = ED.root?.querySelector('#ed-gizmo'); if (!svg) return; const T = ED.three; const L = ED.design.layers.find(l => l.id === ED.sel);
  const s = L && ED.cache.get(L.id); if (!L || !s || L.mode === 'uv' || L.visible === false || ED.view === 'flat') { svg.innerHTML = ''; return; }
  const F = edFrameOf(L, false, s.aspect); const r = T.R.domElement.getBoundingClientRect(); const W = r.width, H = r.height;
  const c = Math.cos(F.rot), sn = Math.sin(F.rot);
  const toWorld = (u, v) => { const q = [u * F.w * F.fx, v * F.h * F.fy]; const x = c * q[0] - sn * q[1], y = sn * q[0] + c * q[1];
    if (F.mode === 3) return edCurveAt(F, x, y);
    if (F.mode === 0) return F.P.clone().addScaledVector(F.T, x).addScaledVector(F.U, y);
    const wx = F.wx + x, wy = F.wy + y; const th = -wy / T.RAD; const rr = edRadiusAt(th); return new THREE.Vector3(T.C.x + wx, T.C.y + Math.cos(th) * rr, T.C.z + Math.sin(th) * rr); };
  const scr = (p) => { const w = T.mesh.localToWorld(p.clone()).project(T.cam); return [(w.x + 1) / 2 * W, (1 - w.y) / 2 * H, w.z]; };
  // hidden when its middle faces away from the camera
  const mid = toWorld(0, 0); const n = F.mode === 0 || F.mode === 3 ? F.N : mid.clone().sub(T.C).setX(0).normalize(); const toCam = T.cam.position.clone().sub(T.mesh.localToWorld(mid.clone())).normalize();
  if (n.dot(toCam) < 0.05) { svg.innerHTML = ''; return; }
  // (a long wrapped stripe gets a box round the part near its middle, so its handles stay on the side being looked at)
  const hv = F.mode === 1 ? Math.min(0.5, 0.06 / F.h) : 0.5;
  const pts = [[-0.5, -hv], [0.5, -hv], [0.5, hv], [-0.5, hv]].map(([u, v]) => scr(toWorld(u, v))); const top = scr(toWorld(0, hv)), rotH = scr(toWorld(0, hv + 0.18 * Math.max(1, 0.04 / F.h))); const ctr = scr(mid);
  // the side handles: width on the left and right edges, length on the top and bottom ones
  const sides = [['w', 0.5, 0], ['w', -0.5, 0], ['len', 0, hv], ['len', 0, -hv]].map(([h, u, v]) => [h, scr(toWorld(u, v))]);
  ED.giz = { ctr, pts, rotH, sides };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<polygon points="${pts.map(p => p.slice(0, 2).join(',')).join(' ')}" class="he-gbox"/><line x1="${top[0]}" y1="${top[1]}" x2="${rotH[0]}" y2="${rotH[1]}" class="he-gline"/>
    ${pts.map((p, k) => `<rect data-h="size" data-k="${k}" x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="12" rx="2" class="he-gh"/>`).join('')}
    ${sides.map(([h, p], k) => `<circle data-h="${h}" data-k="${k}" cx="${p[0]}" cy="${p[1]}" r="5" class="he-gh he-gside"/>`).join('')}<circle data-h="turn" cx="${rotH[0]}" cy="${rotH[1]}" r="7" class="he-gh"/>
    <text x="${Math.min(...pts.map(p => p[0]))}" y="${Math.max(...pts.map(p => p[1])) + 20}" class="he-glbl">${edEsc(L.name)}${L.mirror ? ' · mirrored' : ''}</text>`;
}
/** A sticker's width and length in metres (its picture's own shape, times the stretch). */
function edDims(L) { const s = ED.cache.get(L.id); const a = s?.aspect || 1; return [L.size, L.size * a * (L.stretch || 1)]; }
/** Sets a sticker's width and/or length (null keeps it), in metres. */
function edSetDims(L, w, h) {
  const s = ED.cache.get(L.id); const a = s?.aspect || 1; const [w0, h0] = edDims(L); const mx = L.mode === 'flat' || (L.mode === 'stamp' && edIsCar()) ? 4 : L.mode === 'wrap' || L.curve ? 0.9 : 0.32;
  const nw = Math.max(0.005, Math.min(edMaxW(L), w ?? w0)), nh = Math.max(0.005, Math.min(mx, h ?? h0));
  L.size = nw; L.stretch = nh / (nw * a);
}
function edDimLabels(L) { const [w, h] = edDims(L); const W = ED.design.w || 1024; const set = (k, v) => { const el = ED.root.querySelector(`#ed-props [data-lp="${k}"]`); if (!el) return; if (ED.sliding !== el) el.value = v; const lab = el.parentElement.querySelector('.v'); if (lab) lab.textContent = L.mode === 'flat' ? Math.round(v * W) + ' px' : Math.round(v * 1000) + ' mm'; }; set('w', w); set('len', h); }
function edRadiusAt(th) { const T = ED.three; const h = edSurfaceNear(new THREE.Vector3(T.C.x, T.C.y + Math.cos(th) * T.RAD, T.C.z + Math.sin(th) * T.RAD)); return h.p.clone().sub(T.C).setX(0).length(); }
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest?.('#ed-gizmo [data-h]'); if (!h || !ED.giz) return; e.preventDefault(); e.stopPropagation();
  const L = ED.design.layers.find(l => l.id === ED.sel); if (!L || L.locked) return; ED.undo.push(edSnap()); ED.redo = [];
  const r = (edIsStk() ? ED.root.querySelector('#ed-view') : ED.three.R.domElement).getBoundingClientRect(); const cx = r.left + ED.giz.ctr[0], cy = r.top + ED.giz.ctr[1];
  // which way round a turn goes on screen: the box's own corners say whether it's seen from the front or mirrored
  const [a, b, c2] = ED.giz.pts; const cross = (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]);
  ED.ptr = { kind: h.dataset.h, L, cx, cy, size: L.size, d0: Math.hypot(e.clientX - cx, e.clientY - cy), rot: L.rot || 0, a0: Math.atan2(e.clientY - cy, e.clientX - cx), sign: cross < 0 ? 1 : -1 };
  if (h.dataset.h === 'w' || h.dataset.h === 'len') { const s = ED.giz.sides[+h.dataset.k][1]; const dx = s[0] - ED.giz.ctr[0], dy = s[1] - ED.giz.ctr[1]; const d = Math.hypot(dx, dy) || 1; Object.assign(ED.ptr, { ax: [dx / d, dy / d], d0: d, dims: edDims(L) }); }
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
/**
 * Export as a zip named after the helmet: 'addon' a SWOFTY addon putting it on the chosen Hamilton replica (picked in
 * the game as that helmet), 'hx' a player design for the Helmet Exchange addon (where its Helmets tab works).
 */
async function edExport(kind = 'addon') {
  if (!ED.three) return; await edBakeDone(); edStatus('Exporting…');
  const r = await edApi().exportMod(edPixels(), ED.design.name, kind, edGameRes()); edStatus();
  if (!r?.ok) { toast('Export failed: ' + (r?.error || 'unknown error')); return; }
  const steps = kind === 'hx'
    ? `<li>In SWOFTY Launcher, open <b>Helmets</b> (the Helmet Exchange addon) and press <b>Import file…</b>, then pick that zip.</li><li>Set <b>Who can pick it</b> to <b>Any driver</b>.</li><li>Press <b>Play</b>. In your Driver Career, open <b>Team HQ › Driver Details › Helmets</b> and equip it ("(HX)" after its name). This needs Helmet Exchange's Helmets tab to work in your game build.</li>`
    : `<li>Add the zip to SWOFTY Launcher as an addon (drag it onto the launcher's window), and turn it on in your profile.</li><li>Press <b>Play</b>, then pick <b>${edEsc(r.target)}</b> for your driver in the game. Your design is on it.</li><li>Turn the addon off to get the original helmet back.</li>`;
  edModal(`<h3>Exported</h3><p class="muted">${kind === 'hx' ? 'For Helmet Exchange' : 'A SWOFTY addon'}, zipped:</p><code class="he-path">${edEsc(r.file)}</code>
    <ol class="he-steps">${steps}</ol>
    <div class="he-row" style="justify-content:flex-end"><button class="btn" data-ed="close">Close</button><button class="btn primary" data-ed="show-dir" data-dir="${edEsc(r.file)}">Show the zip</button></div>`);
}
/** Another design to put the helmet on: the same shell, so only the parts inside the helmet change in the view. */
async function edSetTarget(id) {
  await edApi().setTarget(id); edMsg('Reading the helmet from F1 25…'); let r = null; try { r = await edApi().load(); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r?.ok) { edMsg(edEsc(r?.error || 'Couldn’t read the helmet.')); return; }
  ED.target = r.target; const T = ED.three; const img = T.fillMat.uniforms.uBase.value.image; img.data.set(new Uint8Array(r.base.buffer, r.base.byteOffset, r.base.byteLength)); T.fillMat.uniforms.uBase.value.needsUpdate = true;
  edMsg(''); edBake(); edTargetPicker(r);
}
function edTargetPicker(r) { const el = ED.root?.querySelector('#ed-target'); if (!el || !r?.targets) return; el.innerHTML = r.targets.map(t => `<option value="${edEsc(t.id)}" ${t.id === r.target ? 'selected' : ''}>${edEsc(t.name)}</option>`).join(''); }
function edModal(html) { const m = ED.root.querySelector('#ed-modal'); m.innerHTML = html ? `<div class="he-mbox">${html}</div>` : ''; m.classList.toggle('on', !!html); }
// close / open-folder buttons in the dialog
document.addEventListener('click', (e) => { const t = e.target.closest?.('#ed-modal [data-ed]'); if (!t) return; if (t.dataset.ed === 'close') edModal(''); else if (t.dataset.ed === 'show-dir') edApi().show(t.dataset.dir); });

// ---- the Sticker maker: a flat canvas with a see-through background, with the same layers and tools as the helmet.
// Its layers are "flat": x and y (where the middle is, as a share of the canvas), size (the width, as a share of the
// canvas width), with the same stretch, turn, flips, colour, effects and auto-mask. Every saved sticker is in
// Add > Custom, in every editor.
const edNewSticker = () => ({ id: edUid(), kind: 'sticker', name: 'New sticker', at: new Date().toISOString(), w: 1024, h: 1024, layers: [], groups: {}, images: {} });
const edIsStk = () => ED.tab === 'sticker' || ED.tab === 'car'; // (the flat canvas: the Sticker maker and the car livery)
const edIsCar = () => ED.tab === 'car';
const edNewCar = () => ({ id: edUid(), kind: 'car', name: 'New livery', at: new Date().toISOString(), w: 4096, h: 4096, year: 2026, base: { color: '#1B1F2A', color2: '#E10600', fade: false, dir: 'tb' }, layers: [], groups: {}, images: {} });
const edViewEl = () => edIsStk() ? ED.root.querySelector('#ed-stk') : ED.three?.R.domElement;
const edMaxW = (L) => L.mode === 'flat' || (L.mode === 'stamp' && edIsCar()) ? 3 : L.curve && L.mode === 'stick' ? 0.6 : 0.32;
/** Switches between the helmet and the Sticker maker, each keeping its own design, undo and selection. */
function edSwitchTab(tab) {
  if (tab === 'car' && !DEV_MODE) return; // (the car livery: dev mode only for now)
  if (tab === ED.tab) return;
  if (ED.dirty) edSave(true);
  ED.tabs[ED.tab] = { design: ED.design, undo: ED.undo, redo: ED.redo, sel: ED.sel, selGroup: ED.selGroup, multi: ED.multi, dirty: false, savedAt: ED.savedAt };
  ED.tab = tab; const S = ED.tabs[tab];
  Object.assign(ED, S || { design: tab === 'sticker' ? edNewSticker() : tab === 'car' ? edNewCar() : edNew(), undo: [], redo: [], sel: null, selGroup: null, multi: new Set(), dirty: false, savedAt: null });
  ED.root.dataset.tab = tab; ED.root.classList.toggle('car3d', tab === 'car' && ED.carView === '3d'); if (tab === 'car') edCarGuide(); ED.root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ED.root.querySelector('#ed-newbtn').textContent = { sticker: 'New sticker', car: 'New livery' }[tab] || 'New helmet';
  ED.root.querySelector('#ed-name').title = { sticker: 'The sticker’s name', car: 'The livery’s name' }[tab] || 'The helmet’s name';
  ED.root.querySelector('#ed-baselbl').textContent = tab === 'car' ? 'Livery base' : 'Helmet base';
  ED.root.querySelector('#ed-hint').textContent = tab === 'car' ? 'The livery as the game lays it out (the original shows faintly over it as a guide) · drag, size and turn like on the helmet' : tab === 'sticker' ? 'Pick something from Add · drag it on the canvas · corners size it · the top handle turns it · Save to Custom Stickers to use it on a helmet' : 'Pick something from Add · drag it on the helmet · corners size it · the top handle turns it · drag empty space to turn the helmet';
  ED.root.querySelector('#ed-msg').style.visibility = tab !== 'helmet' ? 'hidden' : '';
  edPanels(); edLib(); edBake(); edResize();
}
/** A flat layer's placing on the canvas: middle (px), turn (radians, as the helmet's: positive turns anticlockwise), scale of its picture. */
function edStkXf(L, s, W) {
  const w = L.size * W, h = w * s.aspect * (L.stretch || 1);
  return { cx: (L.x ?? 0.5) * W, cy: (L.y ?? 0.5) * (ED.design.h || W), rot: (L.rot || 0) * Math.PI / 180, sx: w / s.cw * (L.flipX ? -1 : 1), sy: h / s.ch * (L.flipY ? -1 : 1) };
}
let edStkBusy = false, edStkAgain = false;
async function edBakeSticker() {
  if (edStkBusy) { edStkAgain = true; return; } edStkBusy = true;
  const D = ED.design; const W = D.w || 1024, H = D.h || 1024; const srcs = await Promise.all(D.layers.map(L => L.visible === false ? null : edSource(L)));
  const cv = ED.stkCv ||= document.createElement('canvas'); if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H; const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  if (D.base) { if (D.base.fade) { const gr = D.base.dir === 'fb' ? g.createLinearGradient(0, 0, W, 0) : g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0.15, D.base.color); gr.addColorStop(0.85, D.base.color2); g.fillStyle = gr; } else g.fillStyle = D.base.color; g.fillRect(0, 0, W, H); }
  const car = edIsCar() && D.layers.some(L => L.mode === 'stamp' && L.visible !== false) ? await edEnsureCar(D.year || 2026) : null;
  for (let k = 0; k < D.layers.length; k++) {
    const L = D.layers[k], s = srcs[k]; if (!s) continue;
    if (L.mode === 'stamp') { if (!car) continue; let e = k; while (e + 1 < D.layers.length && D.layers[e + 1].mode === 'stamp') e++; const run = []; for (let j = k; j <= e; j++) if (srcs[j]) run.push([D.layers[j], srcs[j]]); edCarPaint(car, run, g, W, H); k = e; continue; }
    const X = edStkXf(L, s, W); g.save(); g.translate(X.cx, X.cy); g.rotate(-X.rot); g.scale(X.sx, X.sy); g.globalAlpha = L.opacity ?? 1; g.imageSmoothingQuality = 'high'; g.drawImage(s.cv, -s.cv.width / 2, -s.cv.height / 2); g.restore();
  }
  edStkBusy = false; ED.bakeGen = (ED.bakeGen || 0) + 1; if (ED.car3 && edIsCar()) { ED.car3.tex.needsUpdate = true; edDraw(); } edDrawSticker();
  if (edStkAgain) { edStkAgain = false; edBakeSticker(); }
}
/** The canvas on screen: a chequered see-through background, the sticker fitted in the view. */
function edDrawSticker() {
  if (edCar3dOn()) { edDraw(); return; }
  const el = ED.root?.querySelector('#ed-stk'); const v = ED.root?.querySelector('#ed-view'); if (!el || !v) return; const Wv = v.clientWidth, Hv = v.clientHeight; if (!Wv) return;
  const dpr = window.devicePixelRatio || 1; el.width = Wv * dpr; el.height = Hv * dpr; const g = el.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#10151f'; g.fillRect(0, 0, Wv, Hv);
  const D = ED.design; const W = D.w || 1024, H = D.h || 1024; const k = Math.min((Wv - 40) / W, (Hv - 110) / H); const ox = (Wv - W * k) / 2, oy = (Hv - H * k) / 2 + 10;
  ED.stkView = { k, ox, oy };
  const sq = 12; g.save(); g.beginPath(); g.rect(ox, oy, W * k, H * k); g.clip(); for (let y = 0; y < H * k; y += sq) for (let x = 0; x < W * k; x += sq) { g.fillStyle = ((x + y) / sq) % 2 ? '#2a3144' : '#343c52'; g.fillRect(ox + x, oy + y, sq, sq); } g.restore();
  if (ED.stkCv) { g.imageSmoothingQuality = 'high'; g.drawImage(ED.stkCv, ox, oy, W * k, H * k); }
  if (edIsCar() && ED.carGuide && ED.root.querySelector('#ed-guide')?.checked) { g.save(); g.globalAlpha = +(ED.root.querySelector('#ed-guideop')?.value || 0.35); g.drawImage(ED.carGuide, ox, oy, W * k, H * k); g.restore(); }
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.strokeRect(ox - 0.5, oy - 0.5, W * k + 1, H * k + 1);
  g.fillStyle = '#8B97AF'; g.font = '12px Segoe UI'; g.fillText(`${W} × ${H}`, ox, oy + H * k + 16);
  edStkGizmo();
}
/** Canvas pixels from a point on the screen. */
/*
  Stickers on the 3D car (mode 'stamp'): a point on the car (p), the way they face (n, towards where the view was when
  put on), a size in metres. They're painted onto the livery in texture space: every painted triangle is drawn at its
  texture position, and each pixel takes the sticker's colour where its point on the car falls inside the sticker seen
  straight on from n. A depth picture of the whole car taken from that direction first means only the surfaces seen
  from there are painted (not the far side of a wing, not what's behind it). Mirrored ones go on the other side too.
*/
async function edEnsureCar(year) {
  ED.car3s ||= {}; if (ED.car3s[year]) return ED.car3s[year]; if (!ED.three) return null;
  if (ED.carLoading?.[year]) return ED.carLoading[year];
  ED.carLoading = { ...(ED.carLoading || {}), [year]: (async () => { let r = null; try { r = await edApi().carModel(year); } catch { } if (!r?.ok) return null; const was = ED.car3; edCar3Build(r); ED.car3s[year] = ED.car3; ED.car3 = was || ED.car3s[year]; return ED.car3s[year]; })() };
  return ED.carLoading[year];
}
function edCarFrame(L, mirror, aspect) {
  const w = L.size || 0.25, h = w * (aspect || 1) * (L.stretch || 1); const reflect = mirror && L.kind === 'shape' && L.reflect !== false;
  const fx = (L.flipX ? -1 : 1) * (reflect ? -1 : 1), fy = L.flipY ? -1 : 1; const rot = (L.rot || 0) * Math.PI / 180 * (mirror && L.mirrorRot !== false ? -1 : 1);
  const P = new THREE.Vector3(...L.p), N = new THREE.Vector3(...(L.n || [0, 1, 0])).normalize(); if (mirror) { P.x = -P.x; N.x = -N.x; }
  const { T, U } = edTangents(N); return { P, N, T, U, w, h, rot, fx, fy };
}
function edCarPaint(car, run, g, W, H) {
  const R3 = ED.three.R; const C = car;
  if (!C.paint) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', C.liv.geometry.attributes.position); geo.setAttribute('uv', C.liv.geometry.attributes.uv); geo.setAttribute('normal', C.liv.geometry.attributes.normal); geo.setIndex(new THREE.BufferAttribute(C.liv.userData.full, 1));
    const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true,
      uniforms: { uTex: { value: null }, uP: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uT: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2() }, uRot: { value: new THREE.Vector2() }, uFlip: { value: new THREE.Vector2() }, uOp: { value: 1 }, uDepth: { value: null }, uVP: { value: new THREE.Matrix4() } },
      vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = vec4(uv.x * 2.0 - 1.0, uv.y * 2.0 - 1.0, 0.0, 1.0); }`,
      fragmentShader: `#include <packing>
        uniform sampler2D uTex; uniform sampler2D uDepth; uniform mat4 uVP; uniform vec3 uP; uniform vec3 uN; uniform vec3 uT; uniform vec3 uU; uniform vec2 uSize; uniform vec2 uRot; uniform vec2 uFlip; uniform float uOp; varying vec3 vP; varying vec3 vN;
        void main(){
          if (abs(dot(normalize(vN), uN)) < 0.03) discard;
          vec4 c4 = uVP * vec4(vP, 1.0); vec3 sp = c4.xyz / c4.w * 0.5 + 0.5; if (sp.x < 0.0 || sp.y < 0.0 || sp.x > 1.0 || sp.y > 1.0) discard;
          float seen = unpackRGBAToDepth(texture2D(uDepth, sp.xy)); if (sp.z > seen + 0.0015) discard;
          vec3 d = vP - uP; vec2 q = vec2(dot(d, uT), dot(d, uU)); q = vec2(uRot.x * q.x + uRot.y * q.y, -uRot.y * q.x + uRot.x * q.y);
          vec2 t = q / uSize * uFlip + 0.5; if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) discard;
          vec4 c = texture2D(uTex, t); if (c.a < 0.004) discard; gl_FragColor = vec4(c.rgb, c.a * uOp); }` });
    mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geo, mat));
    // the depth picture: the whole car (every part) seen from the sticker's direction
    const dgeo = (m) => { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', m.geometry.attributes.position); gg.setIndex(new THREE.BufferAttribute(m.userData.full, 1)); return gg; };
    const dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }); const dscene = new THREE.Scene(); dscene.add(new THREE.Mesh(dgeo(C.liv), dmat)); dscene.add(new THREE.Mesh(dgeo(C.rest), dmat));
    C.paint = { scene, mat, dscene, dcam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20), dRT: new THREE.WebGLRenderTarget(1024, 1024), cam: new THREE.Camera(), RT: null };
  }
  const Pn = C.paint; if (!Pn.RT || Pn.RT.width !== W) { Pn.RT?.dispose(); Pn.RT = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, stencilBuffer: false }); }
  const U = Pn.mat.uniforms; R3.setRenderTarget(Pn.RT); R3.setClearColor(0x000000, 0); R3.clear();
  for (const [L, s] of run) for (const mirror of L.mirror ? [false, true] : [false]) {
    const F = edCarFrame(L, mirror, s.aspect); const half = Math.max(F.w * s.ex, F.h * s.ey) * 0.75 + 0.02;
    const dc = Pn.dcam; dc.left = -half; dc.right = half; dc.top = half; dc.bottom = -half; dc.near = 0.01; dc.far = 20; dc.position.copy(F.P).addScaledVector(F.N, 8); dc.up.copy(F.U); dc.lookAt(F.P); dc.updateProjectionMatrix(); dc.updateMatrixWorld();
    R3.setRenderTarget(Pn.dRT); R3.setClearColor(0xffffff, 1); R3.clear(); R3.render(Pn.dscene, dc);
    U.uDepth.value = Pn.dRT.texture; U.uVP.value.multiplyMatrices(dc.projectionMatrix, dc.matrixWorldInverse);
    U.uTex.value = s.tex; U.uP.value.copy(F.P); U.uN.value.copy(F.N); U.uT.value.copy(F.T); U.uU.value.copy(F.U); U.uSize.value.set(F.w * s.ex, F.h * s.ey); U.uRot.value.set(Math.cos(F.rot), Math.sin(F.rot)); U.uFlip.value.set(F.fx, F.fy); U.uOp.value = L.opacity ?? 1;
    R3.setRenderTarget(Pn.RT); R3.autoClear = false; R3.render(Pn.scene, Pn.cam); R3.autoClear = true;
  }
  const px = new Uint8Array(W * H * 4); R3.readRenderTargetPixels(Pn.RT, 0, 0, W, H, px); R3.setRenderTarget(null); R3.setClearColor(0x000000, 1);
  const tmp = edCanvas(W, H); tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), W, H), 0, 0); g.drawImage(tmp, 0, 0); // (rows from v = 0, as the canvas: no flip)
}
/** The car point under the pointer (any part), in the car's space. */
function edCarHit(cx, cy) {
  const C = ED.car3, T = ED.three; if (!C || !T) return null; const r = T.R.domElement.getBoundingClientRect();
  const m = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); C.ray ||= new THREE.Raycaster(); C.ray.setFromCamera(m, C.cam);
  const h = C.ray.intersectObjects([C.liv, C.rest].filter(x => x.visible))[0]; return h ? { p: h.point.clone(), n: h.face ? h.face.normal.clone() : null } : null;
}
/** The top 3D sticker whose own pixels are under the pointer on the car. */
function edCarPick3(cx, cy) {
  const h = edCarHit(cx, cy); if (!h) return null; const D = ED.design;
  for (let k = D.layers.length - 1; k >= 0; k--) { const L = D.layers[k]; if (L.mode !== 'stamp' || L.visible === false) continue; const s = ED.cache.get(L.id); if (!s) continue;
    for (const mirror of L.mirror ? [false, true] : [false]) { const F = edCarFrame(L, mirror, s.aspect); const d = h.p.clone().sub(F.P); let q = [d.dot(F.T), d.dot(F.U)]; q = [Math.cos(F.rot) * q[0] + Math.sin(F.rot) * q[1], -Math.sin(F.rot) * q[0] + Math.cos(F.rot) * q[1]];
      const tx = q[0] / (F.w * s.ex) * F.fx + 0.5, ty = q[1] / (F.h * s.ey) * F.fy + 0.5; if (tx < 0 || ty < 0 || tx > 1 || ty > 1) continue;
      const u = Math.floor(tx * s.cv.width), v = Math.floor((1 - ty) * s.cv.height); if (s.data && s.data.data[(v * s.cv.width + u) * 4 + 3] > 20) return { L, hit: h.p }; } }
  return null;
}
/** A 3D sticker's box on screen: its corners on its own plane on the car. */
function edCarGizmo3(svg, L, s) {
  const C = ED.car3, T = ED.three; const F = edCarFrame(L, false, s.aspect); const view = ED.root.querySelector('#ed-view').getBoundingClientRect(), cr = T.R.domElement.getBoundingClientRect();
  if (C.cam.position.clone().sub(F.P).normalize().dot(F.N) < 0.05) { svg.innerHTML = ''; ED.giz = null; return; }
  const c = Math.cos(F.rot), sn = Math.sin(F.rot); const at = (u, v) => { const q = [u * F.w * F.fx, v * F.h * F.fy]; const x = c * q[0] - sn * q[1], y = sn * q[0] + c * q[1]; return F.P.clone().addScaledVector(F.T, x).addScaledVector(F.U, y); };
  const scr = (p) => { const q = p.clone().project(C.cam); return [cr.left - view.left + (q.x + 1) / 2 * cr.width, cr.top - view.top + (1 - q.y) / 2 * cr.height]; };
  const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(q => scr(at(...q))); const top = scr(at(0, 0.5)), ctr = scr(F.P);
  const tl = Math.hypot(top[0] - ctr[0], top[1] - ctr[1]) || 1; const rotH = [top[0] + (top[0] - ctr[0]) / tl * 24, top[1] + (top[1] - ctr[1]) / tl * 24];
  const sides = [['w', 0.5, 0], ['w', -0.5, 0], ['len', 0, 0.5], ['len', 0, -0.5]].map(([hh, u, v]) => [hh, scr(at(u, v))]);
  ED.giz = { ctr, pts, rotH, sides }; svg.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`);
  svg.innerHTML = `<polygon points="${pts.map(p => p.join(',')).join(' ')}" class="he-gbox"/><line x1="${top[0]}" y1="${top[1]}" x2="${rotH[0]}" y2="${rotH[1]}" class="he-gline"/>
    ${pts.map((p, k) => `<rect data-h="size" data-k="${k}" x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="12" rx="2" class="he-gh"/>`).join('')}
    ${sides.map(([hh, p], k) => `<circle data-h="${hh}" data-k="${k}" cx="${p[0]}" cy="${p[1]}" r="5" class="he-gh he-gside"/>`).join('')}<circle data-h="turn" cx="${rotH[0]}" cy="${rotH[1]}" r="7" class="he-gh"/>
    <text x="${Math.min(...pts.map(p => p[0]))}" y="${Math.max(...pts.map(p => p[1])) + 20}" class="he-glbl">${edEsc(L.name)}${L.mirror ? ' · mirrored' : ''}</text>`;
}
/** The livery's texture point (0 to 1) under the pointer on the 3D car, or null off the painted parts. */
function edCarUv(cx, cy) {
  const C = ED.car3, T = ED.three; if (!C || !T) return null; const r = T.R.domElement.getBoundingClientRect();
  const m = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); C.ray ||= new THREE.Raycaster(); C.ray.setFromCamera(m, C.cam);
  const h = C.ray.intersectObjects([C.liv, C.rest])[0]; if (!h || h.object !== C.liv || !h.uv) return null;
  return { x: h.uv.x - Math.floor(h.uv.x), y: h.uv.y - Math.floor(h.uv.y) };
}
function edStkAt(cx, cy) {
  if (edCar3dOn()) { const uv = edCarUv(cx, cy); const D = ED.design; return uv ? [uv.x * (D.w || 1024), uv.y * (D.h || 1024)] : [-1e6, -1e6]; }
  const r = ED.root.querySelector('#ed-stk').getBoundingClientRect(); const V = ED.stkView || { k: 1, ox: 0, oy: 0 }; return [(cx - r.left - V.ox) / V.k, (cy - r.top - V.oy) / V.k]; }
/** The top layer whose own pixels (not its box) are under a canvas point. */
function edStkPick(X, Y) {
  const D = ED.design; const W = D.w || 1024;
  for (let k = D.layers.length - 1; k >= 0; k--) { const L = D.layers[k]; if (L.visible === false || L.mode === 'stamp') continue; const s = ED.cache.get(L.id); if (!s) continue;
    const T = edStkXf(L, s, W); const dx = X - T.cx, dy = Y - T.cy; const c = Math.cos(T.rot), sn = Math.sin(T.rot);
    const u = (dx * c - dy * sn) / T.sx + s.cv.width / 2, v = (dx * sn + dy * c) / T.sy + s.cv.height / 2;
    if (u < 0 || v < 0 || u >= s.cv.width || v >= s.cv.height) continue; if (s.data.data[((v | 0) * s.cv.width + (u | 0)) * 4 + 3] > 20) return L; }
  return null;
}
/** The selected layer's box on the canvas, with the same handles as on the helmet. */
function edStkGizmo() {
  const svg = ED.root?.querySelector('#ed-gizmo'); if (!svg) return; const L = ED.design.layers.find(l => l.id === ED.sel); const s = L && ED.cache.get(L.id);
  if (!L || !s || L.visible === false || L.mode === 'stamp') { svg.innerHTML = ''; ED.giz = null; return; } // (a sticker put on the 3D car is moved there)
  const V = ED.stkView; const T = edStkXf(L, s, ED.design.w || 1024); const c = Math.cos(-T.rot), sn = Math.sin(-T.rot); const v = ED.root.querySelector('#ed-view');
  // (u right, v up, in the content's own box, as on the helmet)
  const at = (u, w) => { const px = u * s.cw * T.sx, py = -w * s.ch * Math.abs(T.sy) * Math.sign(T.sy || 1); const x = T.cx + px * c - py * sn, y = T.cy + px * sn + py * c; return [V.ox + x * V.k, V.oy + y * V.k]; };
  const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, w]) => at(u, w)); const top = at(0, 0.5); const ctr = at(0, 0);
  const tl = Math.hypot(top[0] - ctr[0], top[1] - ctr[1]) || 1; const rotH = [top[0] + (top[0] - ctr[0]) / tl * 24, top[1] + (top[1] - ctr[1]) / tl * 24];
  const sides = [['w', 0.5, 0], ['w', -0.5, 0], ['len', 0, 0.5], ['len', 0, -0.5]].map(([h, u, w]) => [h, at(u, w)]);
  ED.giz = { ctr, pts, rotH, sides };
  svg.setAttribute('viewBox', `0 0 ${v.clientWidth} ${v.clientHeight}`);
  svg.innerHTML = `<polygon points="${pts.map(p => p.join(',')).join(' ')}" class="he-gbox"/><line x1="${top[0]}" y1="${top[1]}" x2="${rotH[0]}" y2="${rotH[1]}" class="he-gline"/>
    ${pts.map((p, k) => `<rect data-h="size" data-k="${k}" x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="12" rx="2" class="he-gh"/>`).join('')}
    ${sides.map(([h, p], k) => `<circle data-h="${h}" data-k="${k}" cx="${p[0]}" cy="${p[1]}" r="5" class="he-gh he-gside"/>`).join('')}<circle data-h="turn" cx="${rotH[0]}" cy="${rotH[1]}" r="7" class="he-gh"/>
    <text x="${Math.min(...pts.map(p => p[0]))}" y="${Math.max(...pts.map(p => p[1])) + 20}" class="he-glbl">${edEsc(L.name)}</text>`;
}
function edStkDown(e) {
  const [X, Y] = edStkAt(e.clientX, e.clientY); const L = edStkPick(X, Y);
  if (!L) { if (ED.sel) { ED.sel = null; edLayers(); edProps(); edDrawSticker(); } return; }
  if (ED.sel !== L.id) { ED.sel = L.id; ED.selGroup = null; ED.multi = new Set(); edLayers(); edProps(); }
  if (L.locked) return; e.currentTarget.setPointerCapture(e.pointerId);
  ED.undo.push(edSnap()); ED.redo = []; const W = ED.design.w || 1024, H = ED.design.h || 1024;
  ED.ptr = { kind: 'stkmove', L, off: [(L.x ?? 0.5) * W - X, (L.y ?? 0.5) * H - Y], last: [L.x ?? 0.5, L.y ?? 0.5] };
}
function edStkMove(e) {
  const P = ED.ptr; if (!P) { const [X, Y] = edStkAt(e.clientX, e.clientY); e.currentTarget.style.cursor = edStkPick(X, Y) ? 'move' : 'default'; return; }
  if (P.kind !== 'stkmove') return; const [X, Y] = edStkAt(e.clientX, e.clientY); const W = ED.design.w || 1024, H = ED.design.h || 1024; const L = P.L;
  let nx = (X + P.off[0]) / W, ny = (Y + P.off[1]) / H; if (Math.abs(nx - 0.5) < 0.006) nx = 0.5; if (Math.abs(ny - 0.5) < 0.006) ny = 0.5; // (snaps to the middle)
  const dx = nx - (L.x ?? 0.5), dy = ny - (L.y ?? 0.5); L.x = nx; L.y = ny;
  if (L.group) for (const m of edGroupOf(L.group)) if (m !== L && !m.locked) { m.x = (m.x ?? 0.5) + dx; m.y = (m.y ?? 0.5) + dy; }
  edChanged(true, false);
}
function edStkUp() { const P = ED.ptr; ED.ptr = null; if (P?.kind === 'stkmove') { if (ED.undo.length && ED.undo[ED.undo.length - 1] === edSnap()) ED.undo.pop(); edPanels(); } }
/** Auto-mask on the canvas: the layers above, drawn back into this layer's own picture, cut out of it. */
async function edAutoMaskFlat(L) {
  const D = ED.design; const k = D.layers.indexOf(L); const W = D.w || 1024, H = D.h || 1024; const before = L.mask; delete L.mask;
  const s = await edSource(L); if (!s) { L.mask = before; return; }
  const above = D.layers.slice(k + 1).filter(l => l.visible !== false); const srcs = await Promise.all(above.map(edSource));
  const cover = edCanvas(W, H), cg = cover.getContext('2d');
  above.forEach((l, i) => { const so = srcs[i]; if (!so) return; const X = edStkXf(l, so, W); cg.save(); cg.translate(X.cx, X.cy); cg.rotate(-X.rot); cg.scale(X.sx, X.sy); cg.drawImage(so.cv, -so.cv.width / 2, -so.cv.height / 2); cg.restore(); });
  // this layer's content box, from the canvas: the inverse of its placing (its picture's room left out)
  const X = edStkXf(L, s, W); const m = edCanvas(s.cw, s.ch), mg = m.getContext('2d'); mg.fillStyle = '#fff'; mg.fillRect(0, 0, s.cw, s.ch); mg.globalCompositeOperation = 'destination-out';
  mg.translate(s.cw / 2, s.ch / 2); mg.scale(1 / X.sx, 1 / X.sy); mg.rotate(X.rot); mg.translate(-X.cx, -X.cy); mg.drawImage(cover, 0, 0);
  const mask = m.toDataURL('image/png'); L.mask = before; edCommit(() => { L.mask = mask; });
}
/** The car's original F1 75 livery for its year, as a guide to paint over (1024 x 1024, shown over the canvas). */
async function edCarGuide() {
  const year = ED.design.year || 2026; if (ED.carGuideYear === year && ED.carGuide) return; ED.carGuide = null; ED.carGuideYear = year;
  let r = null; try { r = await edApi().carLoad(year); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r?.ok) { toast(r?.error || 'Couldn’t read the car livery.'); return; }
  const c = edCanvas(1024, 1024); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.guide.buffer, r.guide.byteOffset, r.guide.byteLength), 1024, 1024), 0, 0); ED.carGuide = c; edDrawSticker();
}
/** The livery as a SWOFTY addon for the car of its year: the canvas, full size, without the guide. */
async function edCarExport() {
  await edBakeSticker(); const cv = ED.stkCv; if (!cv || cv.width !== 4096) return; edStatus('Exporting…');
  const px = new Uint8Array(cv.getContext('2d').getImageData(0, 0, 4096, 4096).data.buffer); const year = ED.design.year || 2026;
  const r = await edApi().carExport(px, ED.design.name, year); edStatus();
  if (!r?.ok) { toast('Export failed: ' + (r?.error || 'unknown error')); return; }
  edModal(`<h3>Exported</h3><p class="muted">A SWOFTY addon for the ${year} My Team car, zipped:</p><code class="he-path">${edEsc(r.file)}</code>
    <ol class="he-steps"><li>Add the zip to SWOFTY Launcher as an addon, and turn it on in your profile.</li><li>Press <b>Play</b>, then pick the <b>F1 75</b> livery for your team in the game. Your design is on it.</li><li>Turn the addon off to get the original back.</li></ol>
    <div class="he-row" style="justify-content:flex-end"><button class="btn" data-ed="close">Close</button><button class="btn primary" data-ed="show-dir" data-dir="${edEsc(r.file)}">Show the zip</button></div>`);
}
/*
  The car in 3D: the whole 2026 car (every part, from the game), the painted parts showing the canvas as their texture, the rest in
  dark grey for the shape. It uses the helmet's renderer (so the helmet has to have been read from the game), with a
  scene and camera of its own. Stickers under the pointer are moved on the car itself (the point under it, from the
  model's texture coordinates); new ones go where the view is pointed. Sizing and turning stay on Flat and in the panel.
*/
const edCar3dOn = () => edIsCar() && ED.carView === '3d' && !!ED.car3;
async function edCarView(v) {
  ED.root.querySelectorAll('[data-carview]').forEach(b => b.classList.toggle('on', b.dataset.carview === v));
  if (v === '3d') {
    if (!ED.three) { toast('The 3D car needs F1 25 read first (open the Helmet tab once).'); ED.root.querySelectorAll('[data-carview]').forEach(b => b.classList.toggle('on', b.dataset.carview === 'flat')); return; }
    // each year's car is read once and kept; the view (turn, height, distance) carries over between them
    const year = ED.design.year || 2026; ED.car3s ||= {};
    if (!ED.car3s[year]) { edStatus('Reading the car from F1 25…'); let r = null; try { r = await edApi().carModel(year); } catch (e) { r = { ok: false, error: e.message }; } edStatus();
      if (!r?.ok) { toast(r?.error || 'Couldn’t read the car.'); return; } const was = ED.car3; edCar3Build(r); ED.car3s[year] = ED.car3; ED.car3 = was; }
    const prev = ED.car3; ED.car3 = ED.car3s[year]; if (prev && prev !== ED.car3) { Object.assign(ED.car3, { yaw: prev.yaw, pitch: prev.pitch }); edCarPart(prev.part || 'all', true); if ((prev.part || 'all') === 'all') ED.car3.dist = prev.dist; } ED.car3.tex.needsUpdate = true;
  }
  ED.carView = v; ED.root.classList.toggle('car3d', v === '3d'); ED.root.querySelector('#ed-hint').textContent = v === '3d' ? 'Drag a sticker on the car to move it · drag empty space to turn the car · scroll to zoom · Add puts new ones where you are looking' : 'The livery as the game lays it out (the original shows faintly over it as a guide) · drag, size and turn like on the helmet'; ED.root.querySelector('#ed-gizmo').innerHTML = ''; edResize();
}
function edCar3Build(r) {
  const buf = (b, T) => new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10151f);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4256, 0.9)); const k1 = new THREE.DirectionalLight(0xffffff, 0.7); k1.position.set(3, 5, 4); scene.add(k1); const k2 = new THREE.DirectionalLight(0x9fb4ff, 0.3); k2.position.set(-4, 2, -3); scene.add(k2);
  const tex = new THREE.CanvasTexture(ED.stkCv || edCanvas(16, 16)); tex.flipY = false; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mk = (part, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(buf(part.pos, Float32Array), 3)); if (part.uv) g.setAttribute('uv', new THREE.BufferAttribute(buf(part.uv, Float32Array), 2)); g.setIndex(new THREE.BufferAttribute(buf(part.idx, Uint32Array), 1)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); scene.add(m); return m; };
  const liv = mk(r.liv, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide }));
  const rest = mk(r.rest, new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  liv.userData = { full: liv.geometry.index.array.slice(), parts: r.liv.parts || [] }; rest.userData = { full: rest.geometry.index.array.slice(), parts: r.rest.parts || [] };
  ED.car3 = { scene, cam, tex, liv, rest, yaw: 0.9, pitch: 0.3, dist: 9.5, target: ED_CARMID.clone(), part: 'all' };
}
function edFrameCar() {
  const C = ED.car3, T = ED.three; if (!C || !T) return; C.tex.image = ED.stkCv || C.tex.image;
  const A = C.target || ED_CARMID; C.cam.position.set(A.x + Math.sin(C.yaw) * Math.cos(C.pitch) * C.dist, A.y + Math.sin(C.pitch) * C.dist, A.z + Math.cos(C.yaw) * Math.cos(C.pitch) * C.dist); C.cam.lookAt(A);
  T.R.setRenderTarget(null); T.R.render(C.scene, C.cam); edCarGizmo();
}
/*
  The selected sticker's box on the 3D car. Its corners, edge middles and turn handle are points on the canvas; each is
  carried onto the car by the livery triangle under the sticker's middle (the one facing the camera, nearest it): the
  box sits on that triangle's plane, a steady frame even where the sticker crosses onto other parts of the texture.
  The handles then work as on Flat and on the helmet (the drags are on screen).
*/
function edCarGrid() {
  const C = ED.car3; if (C.grid) return C.grid; const uv = C.liv.geometry.attributes.uv.array, idx = C.liv.geometry.index.array; const N = 64; const cells = Array.from({ length: N * N }, () => []);
  const fr = (v) => v - Math.floor(v);
  for (let t = 0; t < idx.length; t += 3) {
    const us = [0, 1, 2].map(j => fr(uv[idx[t + j] * 2])), vs = [0, 1, 2].map(j => fr(uv[idx[t + j] * 2 + 1]));
    if (Math.max(...us) - Math.min(...us) > 0.5 || Math.max(...vs) - Math.min(...vs) > 0.5) continue; // (across a tile edge)
    const x0 = Math.floor(Math.min(...us) * N), x1 = Math.min(N - 1, Math.floor(Math.max(...us) * N)), y0 = Math.floor(Math.min(...vs) * N), y1 = Math.min(N - 1, Math.floor(Math.max(...vs) * N));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * N + x].push(t);
  }
  return (C.grid = { N, cells, fr });
}
/** The car points for a texture point: every livery triangle holding it, as { p (on the car), n, tri }. */
function edCarAt(u, v) {
  const C = ED.car3, G = edCarGrid(); if (u < 0 || v < 0 || u >= 1 || v >= 1) return [];
  const uv = C.liv.geometry.attributes.uv.array, pos = C.liv.geometry.attributes.position.array, idx = C.liv.geometry.index.array; const out = [];
  for (const t of G.cells[Math.floor(v * G.N) * G.N + Math.floor(u * G.N)]) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]; const ua = G.fr(uv[a * 2]), va = G.fr(uv[a * 2 + 1]);
    const e1u = G.fr(uv[b * 2]) - ua, e1v = G.fr(uv[b * 2 + 1]) - va, e2u = G.fr(uv[c * 2]) - ua, e2v = G.fr(uv[c * 2 + 1]) - va; const det = e1u * e2v - e2u * e1v; if (Math.abs(det) < 1e-12) continue;
    const s = ((u - ua) * e2v - e2u * (v - va)) / det, w = (e1u * (v - va) - (u - ua) * e1v) / det; if (s < -1e-4 || w < -1e-4 || s + w > 1 + 1e-4) continue;
    out.push(edCarTri(t, s, w));
  }
  return out;
}
/** A point carried on from one triangle's own texture-to-car mapping (also outside it), with the triangle's normal. */
function edCarTri(t, s, w) {
  const C = ED.car3, pos = C.liv.geometry.attributes.position.array, idx = C.liv.geometry.index.array; const P = (k) => new THREE.Vector3(pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 1], pos[idx[t + k] * 3 + 2]);
  const A = P(0), B = P(1), Cc = P(2); const e1 = B.clone().sub(A), e2 = Cc.clone().sub(A);
  return { p: A.clone().addScaledVector(e1, s).addScaledVector(e2, w), n: e1.clone().cross(e2).normalize(), tri: t };
}
function edCarTriST(t, u, v) {
  const C = ED.car3, G = edCarGrid(), uv = C.liv.geometry.attributes.uv.array, idx = C.liv.geometry.index.array; const a = idx[t], b = idx[t + 1], c = idx[t + 2];
  const ua = G.fr(uv[a * 2]), va = G.fr(uv[a * 2 + 1]); const e1u = G.fr(uv[b * 2]) - ua, e1v = G.fr(uv[b * 2 + 1]) - va, e2u = G.fr(uv[c * 2]) - ua, e2v = G.fr(uv[c * 2 + 1]) - va; const det = e1u * e2v - e2u * e1v;
  return [((u - ua) * e2v - e2u * (v - va)) / det, (e1u * (v - va) - (u - ua) * e1v) / det];
}
function edCarGizmo() {
  const svg = ED.root?.querySelector('#ed-gizmo'); if (!svg) return; const C = ED.car3, T = ED.three; const D = ED.design; const L = D.layers.find(l => l.id === ED.sel); const s = L && ED.cache.get(L.id);
  const off = () => { svg.innerHTML = ''; ED.giz = null; }; if (!L || !s || L.visible === false) return off();
  if (L.mode === 'stamp') return edCarGizmo3(svg, L, s);
  const W = D.w || 1024, H = D.h || 1024; const X = edStkXf(L, s, W); const c = Math.cos(-X.rot), sn = Math.sin(-X.rot);
  const at = (u, w) => { const px = u * s.cw * X.sx, py = -w * s.ch * Math.abs(X.sy) * Math.sign(X.sy || 1); return [(X.cx + px * c - py * sn) / W, (X.cy + px * sn + py * c) / H]; }; // (as on Flat, in texture space)
  const view = ED.root.querySelector('#ed-view').getBoundingClientRect(), cr = T.R.domElement.getBoundingClientRect(); const toCam = (p) => C.cam.position.clone().sub(p);
  // the middle: the triangle facing the camera that's nearest it
  const [mu, mv] = at(0, 0); const mids = edCarAt(mu, mv).filter(h => Math.abs(h.n.dot(toCam(h.p).normalize())) > 0.05).sort((a, b) => toCam(a.p).length() - toCam(b.p).length()); const M = mids[0]; if (!M) return off();
  const place = ([u, v]) => { const [ss, ww] = edCarTriST(M.tri, u, v); return edCarTri(M.tri, ss, ww).p; }; // (the box on the plane of the middle's triangle: a steady frame for the handles)
  const scr = (p) => { const q = p.clone().project(C.cam); return [cr.left - view.left + (q.x + 1) / 2 * cr.width, cr.top - view.top + (1 - q.y) / 2 * cr.height]; };
  const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(q => scr(place(at(...q)))); const top = scr(place(at(0, 0.5))), ctr = scr(M.p);
  const tl = Math.hypot(top[0] - ctr[0], top[1] - ctr[1]) || 1; const rotH = [top[0] + (top[0] - ctr[0]) / tl * 24, top[1] + (top[1] - ctr[1]) / tl * 24];
  const sides = [['w', 0.5, 0], ['w', -0.5, 0], ['len', 0, 0.5], ['len', 0, -0.5]].map(([h, u, w]) => [h, scr(place(at(u, w)))]);
  ED.giz = { ctr, pts, rotH, sides };
  svg.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`);
  svg.innerHTML = `<polygon points="${pts.map(p => p.join(',')).join(' ')}" class="he-gbox"/><line x1="${top[0]}" y1="${top[1]}" x2="${rotH[0]}" y2="${rotH[1]}" class="he-gline"/>
    ${pts.map((p, k) => `<rect data-h="size" data-k="${k}" x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="12" rx="2" class="he-gh"/>`).join('')}
    ${sides.map(([h, p], k) => `<circle data-h="${h}" data-k="${k}" cx="${p[0]}" cy="${p[1]}" r="5" class="he-gh he-gside"/>`).join('')}<circle data-h="turn" cx="${rotH[0]}" cy="${rotH[1]}" r="7" class="he-gh"/>
    <text x="${Math.min(...pts.map(p => p[0]))}" y="${Math.max(...pts.map(p => p[1])) + 20}" class="he-glbl">${edEsc(L.name)}</text>`;
}
/*
  The car's parts, for showing one alone: groups of the game's part names. The camera then aims at its middle and comes
  in to fit it (the views turn round it). "Whole car" puts everything back.
*/
const ED_CARMID = new THREE.Vector3(0, 0.15, 0.25);
const ED_CARCAMS = { front: [0, 0.12], left: [Math.PI / 2, 0.1], right: [-Math.PI / 2, 0.1], back: [Math.PI, 0.15], top: [Math.PI, 1.5] };
const ED_CARPARTS = [['all', 'Whole car', null], ['frontwing', 'Front wing', /^(frontwing|frontwingmoving|frontspoiler)/], ['nose', 'Nose', /^nosecone$/], ['body', 'Body and cockpit', /^(body|safetycell|cockpit|driver_surroun|camera_wing)$/],
  ['sidepods', 'Sidepods', /^sidepod_/], ['cover', 'Engine cover', /^topcanopy/], ['halo', 'Halo', /^hal$/], ['mirrors', 'Mirrors', /^wing_mirror_/], ['rearwing', 'Rear wing', /^rearwing/], ['diffuser', 'Diffuser', /^diffuser/]];
function edCarPart(key, keepView) {
  const C = ED.car3; if (!C) return; const G = ED_CARPARTS.find(p => p[0] === key) || ED_CARPARTS[0]; C.part = G[0]; const sel = ED.root.querySelector('#ed-carpart'); if (sel) sel.value = G[0];
  const box = new THREE.Box3();
  for (const m of [C.liv, C.rest]) {
    const U = m.userData; const runs = G[2] ? U.parts.filter(p => G[2].test(p.name)) : null; let idx = U.full;
    if (runs) { idx = new Uint32Array(runs.reduce((a, p) => a + p.count, 0)); let o = 0; for (const p of runs) { idx.set(U.full.subarray(p.start, p.start + p.count), o); o += p.count; } }
    m.geometry.setIndex(new THREE.BufferAttribute(idx, 1)); m.visible = idx.length > 0;
    if (runs) { const P = m.geometry.attributes.position.array; const v = new THREE.Vector3(); for (let i = 0; i < idx.length; i++) box.expandByPoint(v.set(P[idx[i] * 3], P[idx[i] * 3 + 1], P[idx[i] * 3 + 2])); }
  }
  C.grid = null; // (the gizmo's lookup follows what's shown)
  if (!keepView || G[2]) { if (G[2] && !box.isEmpty()) { const s = box.getBoundingSphere(new THREE.Sphere()); C.target = s.center; C.dist = Math.max(0.5, s.radius * 3.6); } else { C.target = ED_CARMID.clone(); if (!keepView) C.dist = 9.5; } }
  edDraw();
}
/** The sticker as a PNG, cut to what's on it (see-through edges trimmed). */
function edStkPng() {
  const cv = ED.stkCv; if (!cv) return null; const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null; const out = edCanvas(x1 - x0 + 1, y1 - y0 + 1); out.getContext('2d').drawImage(cv, -x0, -y0); return out;
}

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
