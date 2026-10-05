/**
 * Generates every raster asset in the project from code.
 *   node tools/gen-assets.mjs
 *
 * Nothing here traces, embeds or derives from any existing artwork, logo or
 * film still. The cathedral scene is procedural: a Voronoi stained-glass field
 * behind a lancet-window tracery, lit by a single hard shaft.
 */
import { render, mixRGB, clamp01, smoothstep, hash2, fbm, sdSegment, sdPolygon } from './png.mjs';
import { PALETTE as P, PALETTES, NEUTRAL, hex } from './palette.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

/* ------------------------------------------------------------------ glass -- */

const GX = 19; // stained-glass cell grid
const GY = 12;

function seed(i, j) {
  return [(i + 0.18 + 0.64 * hash2(i * 7 + 1, j * 13 + 3)) / GX,
          (j + 0.18 + 0.64 * hash2(i * 31 + 5, j * 17 + 9)) / GY];
}

/** Nearest / second-nearest stained-glass cell at (u,v). Aspect-corrected in x. */
function voronoi(u, v, aspect) {
  const i0 = Math.floor(u * GX);
  const j0 = Math.floor(v * GY);
  let d1 = Infinity, d2 = Infinity, id = 0;
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const s = seed(i, j);
      const dx = (u - s[0]) * aspect;
      const dy = v - s[1];
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; id = i * 997 + j * 31; }
      else if (d < d2) { d2 = d; }
    }
  }
  return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), id };
}

/* --------------------------------------------------------------- tracery -- */

// A round-headed cathedral window: vertical mullions, horizontal transoms and
// a semicircular head with an oculus. Deliberately free of converging diagonals
// so the silhouette cannot be mistaken for any existing emblem.
function arc(cx, cy, r, a0, a1, steps) {
  const segs = [];
  let prev = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const pt = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    segs.push([prev, pt]);
    prev = pt;
  }
  return segs;
}

const SPRING = 0.44; // height the arch springs from
const ARCH_R = 0.32;
const TRACERY = [
  [[0.18, 1.02], [0.18, SPRING]],          // left jamb
  [[0.82, 1.02], [0.82, SPRING]],          // right jamb
  ...arc(0.5, SPRING, ARCH_R, Math.PI, 2 * Math.PI, 22), // the head
  [[0.355, 1.02], [0.355, 0.160]],         // mullion
  [[0.645, 1.02], [0.645, 0.160]],         // mullion
  [[0.5, 1.02], [0.5, 0.307]],             // centre mullion, below the oculus
  [[0.5, 0.163], [0.5, 0.120]],            // centre mullion, above it
  [[0.18, 0.62], [0.82, 0.62]],            // upper transom
  [[0.18, 0.84], [0.82, 0.84]],            // lower transom
  ...arc(0.5, 0.235, 0.072, 0, 2 * Math.PI, 16),         // oculus
];

// Heavy out-of-focus beams in the foreground, kept clear of the centre.
const BEAMS = [
  { a: [-0.05, 0.26], b: [0.26, -0.06], w: 0.055 },
  { a: [0.74, 1.06], b: [1.06, 0.60], w: 0.065 },
  { a: [-0.06, 0.94], b: [0.20, 1.06], w: 0.05 },
];

const LIGHT = [0.648, 0.255];   // the one bright pane
const SHAFT_DIR = [-0.45, 1.0]; // direction the shaft falls

/**
 * The cathedral scene. `darkenCentre` carves a soft well behind the countdown
 * so white type stays legible; the theme NTP copy uses less of it.
 */
function cathedral(darkenCentre) {
  return (x, y, w, h) => {
    const u = (x + 0.5) / w;
    const v = (y + 0.5) / h;
    const aspect = w / h;

    // --- light falloff ----------------------------------------------------
    const ldx = (u - LIGHT[0]) * aspect;
    const ldy = v - LIGHT[1];
    const ldist = Math.hypot(ldx, ldy);
    const falloff = Math.pow(clamp01(1 - ldist / 0.86), 2.8);

    // --- stained glass ----------------------------------------------------
    const warp = (fbm(u * 2.4, v * 2.4, 4) - 0.5) * 0.085;
    const cell = voronoi(u + warp, v + warp * 0.7, aspect);
    const tone = hash2(cell.id, cell.id * 3 + 11);        // per-pane colour
    const grit = fbm(u * 14 + cell.id * 0.11, v * 14, 4); // in-pane mottling

    let col = mixRGB(P.glassDeep, P.glass, tone * 0.85 + grit * 0.25);
    const hue = hash2(cell.id * 13 + 7, cell.id); // per-pane colour drift
    if (hue > 0.86) col = mixRGB(col, P.rust, 0.26);        // corroded amber
    else if (hue < 0.17) col = [col[0] * 0.82, col[1] * 0.96, col[2] * 1.35]; // cold
    col = mixRGB(col, P.glassLit, Math.pow(falloff, 1.15) * (0.30 + tone * 0.95));
    col = mixRGB(col, P.shaft, Math.pow(falloff, 5) * 0.95);
    col = col.map((c) => c * (0.68 + grit * 0.58) * 0.52);

    // came (lead) between panes
    const came = 1 - smoothstep(0.0, 0.0065, cell.d2 - cell.d1);
    col = mixRGB(col, P.lead, came * 0.92);

    // --- tracery ----------------------------------------------------------
    // One distance across the whole tracery, then shade from it. Taking the
    // highlight per-segment instead makes the arcs bead at every joint.
    let ribD = Infinity;
    for (const seg of TRACERY) {
      const a = seg[0], b = seg[1];
      ribD = Math.min(ribD, sdSegment(u * aspect, v, a[0] * aspect, a[1], b[0] * aspect, b[1]));
    }
    const rib = 1 - smoothstep(0.009, 0.016, ribD);
    const ribEdge = smoothstep(0.016, 0.020, ribD) * (1 - smoothstep(0.020, 0.030, ribD));
    col = mixRGB(col, P.lead, rib * 0.95);
    col = mixRGB(col, P.glassLit, ribEdge * falloff * 0.30); // rim-light on the ribs

    // --- light shaft ------------------------------------------------------
    const sl = Math.hypot(SHAFT_DIR[0], SHAFT_DIR[1]);
    const sx = SHAFT_DIR[0] / sl, sy = SHAFT_DIR[1] / sl;
    const px = (u - LIGHT[0]) * aspect, py = v - LIGHT[1];
    const along = px * sx + py * sy;              // distance down the shaft
    const across = Math.abs(px * -sy + py * sx);  // distance off its axis
    if (along > 0) {
      const spread = 0.040 + along * 0.30;
      const beam = (1 - smoothstep(spread * 0.25, spread, across)) *
                   Math.pow(clamp01(1 - along / 1.95), 1.5) *
                   (0.72 + 0.28 * fbm(across * 26, along * 7 + 3, 3));
      col = [col[0] + P.glow[0] * beam * 0.40,
             col[1] + P.glow[1] * beam * 0.46,
             col[2] + P.glow[2] * beam * 0.38];
    }
    const bloom = Math.pow(clamp01(1 - ldist / 0.34), 3);
    col = [col[0] + P.shaft[0] * bloom * 0.55,
           col[1] + P.shaft[1] * bloom * 0.60,
           col[2] + P.shaft[2] * bloom * 0.50];

    // --- foreground beams -------------------------------------------------
    for (const bm of BEAMS) {
      const d = sdSegment(u * aspect, v, bm.a[0] * aspect, bm.a[1], bm.b[0] * aspect, bm.b[1]);
      col = mixRGB(col, P.void, (1 - smoothstep(bm.w, bm.w + 0.055, d)) * 0.93);
    }

    // --- grade ------------------------------------------------------------
    const vig = 1 - smoothstep(0.26, 0.80, Math.hypot((u - 0.5) * 1.18, (v - 0.52) * 1.02));
    col = mixRGB(P.void, col, 0.06 + 0.94 * vig);

    const well = 1 - smoothstep(0.0, 0.62, Math.hypot((u - 0.5) * 0.80, (v - 0.50) * 1.30));
    col = mixRGB(col, P.void, well * darkenCentre);

    // Sink the floor of the frame: the search bar and tiles live down there and
    // need something close to black behind them.
    col = mixRGB(col, P.void, smoothstep(0.58, 1.0, v) * 0.62);

    // a little corroded warmth in the deepest shadows
    const lum = (col[0] + col[1] + col[2]) / 765;
    col = mixRGB(col, P.rust, (1 - smoothstep(0.0, 0.16, lum)) * 0.10);

    // ordered dither, so smooth gradients do not band in the 8-bit output
    const d8 = ((x & 3) * 4 + (y & 3)) / 16 - 0.5;
    return [col[0] + d8, col[1] + d8, col[2] + d8];
  };
}

/* ------------------------------------------------------------ soft field -- */

/**
 * A plain backdrop: no objects, no structure, just light falling through
 * atmosphere. Depth comes from three layers of volume at different scales -
 * broad and soft far away, finer and higher-contrast near the viewer - all lit
 * by a single off-centre source. Nothing here can resemble a mark or a logo.
 */
function softField(darkenCentre, P = PALETTES.zero) {
  const LIGHT_S = [0.60, 0.26];

  return (x, y, w, h) => {
    const u = (x + 0.5) / w;
    const v = (y + 0.5) / h;
    const aspect = w / h;

    // A broad primary pool, plus a dimmer cooler one opposite it. Two sources
    // at different depths is most of what separates "lit" from "flat".
    const dx = (u - LIGHT_S[0]) * aspect;
    const dy = (v - LIGHT_S[1]) * 1.15;
    const glow = Math.pow(clamp01(1 - Math.hypot(dx, dy) / 1.85), 2.0);

    const bx = (u - 0.16) * aspect;
    const by = (v - 0.86) * 1.2;
    const back = Math.pow(clamp01(1 - Math.hypot(bx, by) / 1.1), 2.6);

    // Three scales of volume. The broad one carries the shape of the fog, the
    // finer ones keep it from looking like a flat gradient.
    const far = fbm(u * 1.5 + 11, v * 1.5 - 7, 5);
    const mid = fbm(u * 3.2 - 4, v * 3.0 + 3, 4);
    const near = fbm(u * 6.6 + 21, v * 6.1 + 17, 3);
    const volume = 0.48 * far + 0.33 * mid + 0.19 * near;

    let col = mixRGB(P.void, P.glassDeep, 0.34 + 0.66 * glow);
    col = mixRGB(col, P.glass, Math.pow(glow, 1.35) * (0.34 + volume * 0.92));
    col = mixRGB(col, P.glassLit, Math.pow(glow, 2.6) * (0.18 + volume * 0.66));
    col = mixRGB(col, P.glow, Math.pow(glow, 5.5) * 0.34);

    // The second pool, kept cool and dim so it reads as distance.
    col = mixRGB(col, P.glassDeep, back * 0.55);
    col = mixRGB(col, P.glass, Math.pow(back, 2.2) * (0.12 + volume * 0.30));

    // The volumes modulate brightness; that variation is what reads as depth.
    col = col.map((c) => c * (0.52 + volume * 1.05));

    // A wide, soft wash falling away from the light. Deliberately edgeless -
    // a defined shaft would read as an object.
    const sl = Math.hypot(SHAFT_DIR[0], SHAFT_DIR[1]);
    const sx = SHAFT_DIR[0] / sl, sy = SHAFT_DIR[1] / sl;
    const px = (u - LIGHT_S[0]) * aspect, py = v - LIGHT_S[1];
    const along = px * sx + py * sy;
    const across = Math.abs(px * -sy + py * sx);
    {
      // smoothstep on `along` rather than `if (along > 0)`: the hard test cut a
      // visible straight seam across the frame where the wash switched on.
      const wash = (1 - smoothstep(0.08, 0.34 + Math.max(along, 0) * 0.9, across)) *
                   Math.pow(clamp01(1 - Math.max(along, 0) / 1.9), 1.8) *
                   smoothstep(-0.08, 0.26, along) * (0.6 + 0.4 * far);
      col = [col[0] + P.glow[0] * wash * 0.14,
             col[1] + P.glow[1] * wash * 0.17,
             col[2] + P.glow[2] * wash * 0.13];
    }

    // A slow drift between cold and corroded across the frame, so the field is
    // never one flat hue.
    const drift = fbm(u * 1.1 - 3, v * 1.1 + 6, 3);
    if (drift > 0.56) col = mixRGB(col, P.rust, (drift - 0.56) * 0.34);
    else col = [col[0] * 0.95, col[1] * 1.0, col[2] * 1.08];

    // --- grade --------------------------------------------------------------
    const vig = 1 - smoothstep(0.38, 1.0, Math.hypot((u - 0.5) * 1.1, (v - 0.52) * 0.96));
    col = mixRGB(P.void, col, 0.14 + 0.86 * vig);

    const well = 1 - smoothstep(0.0, 0.66, Math.hypot((u - 0.5) * 0.78, (v - 0.48) * 1.25));
    col = mixRGB(col, P.void, well * darkenCentre);
    col = mixRGB(col, P.void, smoothstep(0.60, 1.0, v) * 0.52);

    const d8 = ((x & 3) * 4 + (y & 3)) / 16 - 0.5;
    return [col[0] + d8, col[1] + d8, col[2] + d8];
  };
}

/* ------------------------------------------------- chrome surface strips -- */

/**
 * A vertical gradient strip for the browser frame / toolbar / tabs. Chrome
 * tiles these horizontally, so they are only a few pixels wide.
 */
function strip(top, bottom, opts, P = PALETTES.zero) {
  const o = opts || {};
  return (x, y, w, h) => {
    const t = y / (h - 1);
    let col = mixRGB(top, bottom, Math.pow(t, 0.85));
    col = col.map((c) => c * (0.985 + 0.03 * hash2(x, y)));   // film grain
    if (o.sheen) col = mixRGB(col, P.glass, o.sheen * (1 - smoothstep(0, 0.35, t)));
    if (o.hairline && y >= h - 2) col = mixRGB(col, o.hairline, y === h - 1 ? 0.55 : 0.22);
    return col;
  };
}

/* ------------------------------------------------------------------ mark -- */

// A fractured hourglass: time, running out. Drawn from scratch for this project.
const HOURGLASS = [
  [-0.27, -0.33], [0.27, -0.33], [0.27, -0.265], [0.058, -0.018],
  [0.27, 0.265], [0.27, 0.33], [-0.27, 0.33], [-0.27, 0.265],
  [-0.058, 0.018], [-0.27, -0.265],
];
const WEDGE = [[0.0, 0.0], [0.95, -0.28], [0.95, 0.52], [0.30, 0.62]]; // cut in the ring
const CRACK = [[-0.30, -0.12], [-0.06, 0.02], [-0.16, 0.16], [0.10, 0.27], [0.34, 0.20]];

function markPixel(u, v, size, P = PALETTES.zero) {
  const plateR = 0.5 - 1.5 / size;
  // rounded-square plate
  const qx = Math.max(Math.abs(u) - (plateR - 0.17), 0);
  const qy = Math.max(Math.abs(v) - (plateR - 0.17), 0);
  const plate = Math.hypot(qx, qy) - 0.17;
  if (plate > 0.004) return [0, 0, 0, 0];

  const r = Math.hypot(u, v);
  let col = mixRGB(P.abyss, P.pitch, smoothstep(-0.5, 0.5, v));
  col = mixRGB(col, P.glassDeep, Math.pow(clamp01(1 - r / 0.62), 2) * 0.55);
  col = mixRGB(col, P.core, smoothstep(-0.014, -0.002, plate) * 0.40); // edge rim only

  const heavy = size <= 32;
  const ringW = heavy ? 0.072 : 0.052;
  const ring = Math.max(Math.abs(r - 0.40) - ringW / 2, -sdPolygon(u, v, WEDGE));
  // Scale the glass down so it sits clear of the ring instead of fusing with it.
  // Evaluating an SDF on p/k and multiplying back by k scales the shape by k.
  const K = 0.74;
  const glass = sdPolygon(u / K, v / K, HOURGLASS) * K;

  const aa = 1.6 / size;
  const ringM = 1 - smoothstep(0, aa, ring);
  let glassM = 1 - smoothstep(0, aa, glass);
  if (!heavy) {
    let cd = Infinity;
    for (let i = 1; i < CRACK.length; i++) {
      cd = Math.min(cd, sdSegment(u / K, v / K, CRACK[i - 1][0], CRACK[i - 1][1],
                                  CRACK[i][0], CRACK[i][1]) * K);
    }
    glassM *= smoothstep(0.012, 0.012 + aa, cd); // fracture through the glass
  }

  const grad = mixRGB(P.core, P.glow, clamp01(0.5 - v)); // brighter toward the top
  col = mixRGB(col, mixRGB(P.core, P.glassLit, 0.25), ringM);
  col = mixRGB(col, grad, glassM);

  // halo, so the mark still reads if the toolbar is light
  const halo = Math.max(ringM, glassM);
  col = [col[0] + P.core[0] * halo * 0.10,
         col[1] + P.core[1] * halo * 0.14,
         col[2] + P.core[2] * halo * 0.10];

  return [col[0], col[1], col[2], 255 * (1 - smoothstep(-0.004, 0.004, plate))];
}

/**
 * `inset` leaves transparent padding around the mark, as a fraction of the
 * canvas per side. The toolbar wants the artwork edge to edge; a store icon
 * sits in a grid beside other people's icons and wants breathing room, so the
 * listing version is rendered with padding instead of being scaled down later.
 */
function mark(size, P = PALETTES.zero, inset = 0) {
  const SS = 3; // supersample
  const scale = 1 - 2 * inset;
  return (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = ((x + (sx + 0.5) / SS) / size - 0.5) / scale;
        const v = ((y + (sy + 0.5) / SS) / size - 0.5) / scale;
        const p = markPixel(u, v, size * scale, P);
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
      }
    }
    if (a === 0) return [0, 0, 0, 0];
    return [r / a, g / a, b / a, a / (SS * SS)];
  };
}

/* ----------------------------------------------------------------- grain -- */

const grain = (x, y) => [255, 255, 255, Math.pow(hash2(x * 3 + 7, y * 5 + 13), 3) * 150];


/* --------------------------------------------------------------- palettes -- */

/**
 * Emits extension/css/palettes.css from the definitions above, so the CSS and
 * the generator can never drift apart. Colours are published twice: as hex for
 * direct use, and as bare "r g b" triples so stylesheets can write
 * rgb(var(--core-rgb) / 0.4) and vary the alpha per use.
 */
const TOKEN = {
  void: 'void', abyss: 'abyss', pitch: 'pitch', panel: 'panel',
  glassDeep: 'glass-deep', glass: 'glass', glassLit: 'glass-lit',
  core: 'core', glow: 'glow', shaft: 'shaft', bone: 'bone', ash: 'ash',
  rust: 'rust', lead: 'lead',
};

function paletteBlock(key, pal, selector) {
  const out = [`${selector} {`];
  for (const [field, name] of Object.entries(TOKEN)) {
    out.push(`  --${name}: ${hex(pal[field])};`);
  }
  out.push('');
  for (const [field, name] of Object.entries(TOKEN)) {
    out.push(`  --${name}-rgb: ${pal[field].join(' ')};`);
  }
  out.push('');
  out.push(`  --line: rgb(var(--core-rgb) / 0.16);`);
  out.push(`  --line-soft: rgb(var(--ash-rgb) / 0.12);`);
  out.push(`  --fill: rgb(var(--abyss-rgb) / 0.58);`);
  out.push(`  --fill-hover: rgb(var(--glass-rgb) / 0.42);`);
  out.push('');
  out.push(`  --glass-fill: rgb(var(--panel-rgb) / 0.34);`);
  out.push(`  --glass-fill-deep: rgb(var(--abyss-rgb) / 0.56);`);
  out.push(`  --glass-rim: linear-gradient(135deg,`);
  out.push(`    rgba(255, 255, 255, 0.62) 0%,`);
  out.push(`    rgba(255, 255, 255, 0.14) 22%,`);
  out.push(`    rgba(255, 255, 255, 0.02) 44%,`);
  out.push(`    rgb(var(--glow-rgb) / 0.10) 68%,`);
  out.push(`    rgb(var(--core-rgb) / 0.34) 100%);`);
  out.push('');
  out.push(`  --plate-image: url("../assets/backdrop-${key}.png");`);
  out.push('}');
  return out.join('\n');
}

function writePalettes() {
  const keys = Object.keys(PALETTES);
  const parts = [
    '/* GENERATED by tools/gen-assets.mjs - do not edit by hand.',
    ' * Palettes are defined in tools/palette.mjs; run the generator after changes. */',
    '',
  ];
  keys.forEach((key, i) => {
    // The first palette is also the default, so it lands on bare :root.
    parts.push(paletteBlock(key, PALETTES[key], i === 0 ? ':root' : `:root[data-palette="${key}"]`));
    parts.push('');
  });
  const file = 'extension/css/palettes.css';
  writeFileSync(file, parts.join('\n'), 'utf8');

  // The options page needs the names and a few swatch colours. Emitting them
  // from the same source keeps the picker in step with the stylesheet.
  const list = keys.map((key) => ({
    key,
    label: PALETTES[key].label,
    swatch: [hex(PALETTES[key].void), hex(PALETTES[key].glass), hex(PALETTES[key].core)],
  }));
  writeFileSync('extension/js/palettes.js',
    '/* GENERATED by tools/gen-assets.mjs - do not edit by hand. */' + '\n' +
    'export const PALETTE_LIST = ' + JSON.stringify(list, null, 2) + ';' + '\n', 'utf8');

  // The web accent is injected into other people's pages, where none of our
  // custom properties exist, so each palette needs its colours written out.
  for (const key of keys) {
    const pal = PALETTES[key];
    const accent = [
      '/* GENERATED by tools/gen-assets.mjs - do not edit by hand.',
      ' * Injected into ordinary web pages only when the user opts in.',
      ' * Deliberately narrow: scrollbars, selection and form accents. Nothing',
      ' * here changes layout, page colours or typography. */',
      '',
      ':root {',
      `  accent-color: ${hex(pal.core)};`,
      `  caret-color: ${hex(pal.core)};`,
      '}',
      '',
      '::selection {',
      `  background: rgba(${pal.core.join(', ')}, 0.32);`,
      `  color: ${hex(pal.shaft)};`,
      '}',
      '',
      '::-webkit-scrollbar { width: 12px; height: 12px; }',
      `::-webkit-scrollbar-track { background: ${hex(pal.abyss)}; }`,
      `::-webkit-scrollbar-corner { background: ${hex(pal.abyss)}; }`,
      '::-webkit-scrollbar-thumb {',
      `  background: linear-gradient(${hex(pal.glass)}, ${hex(pal.glassDeep)});`,
      `  border: 3px solid ${hex(pal.abyss)};`,
      '  border-radius: 8px;',
      '}',
      `::-webkit-scrollbar-thumb:hover { background: ${hex(pal.core)}; }`,
      '',
    ];
    writeFileSync(`extension/css/web-accent-${key}.css`, accent.join('\n'), 'utf8');
  }

  return { file, width: keys.length, height: 0 };
}


/* ----------------------------------------------------------------- themes -- */

/**
 * One theme package per palette. A theme cannot change colour at runtime - its
 * values are fixed in the manifest - so matching the extension's palettes means
 * building a separate package for each, from the same definitions.
 */
const THEME_VERSION = '1.0.0';

function themeManifest(key, pal) {
  return {
    manifest_version: 3,
    name: `Zero Hour — ${pal.label}`,
    version: THEME_VERSION,
    description:
      `A dark ${pal.label.toLowerCase()} browser theme: deep glass surfaces, built for low light.`,
    theme: {
      images: {
        theme_frame: 'images/theme_frame.png',
        theme_frame_inactive: 'images/theme_frame_inactive.png',
        theme_toolbar: 'images/theme_toolbar.png',
        theme_tab_background: 'images/theme_tab_background.png',
        theme_button_background: 'images/theme_button_background.png',
        theme_ntp_background: 'images/theme_ntp_background.png',
      },
      colors: {
        frame: pal.abyss,
        frame_inactive: pal.void,
        frame_incognito: pal.void,
        frame_incognito_inactive: pal.lead,
        toolbar: pal.pitch,
        tab_text: pal.bone,
        tab_background_text: pal.ash,
        tab_background_text_inactive: pal.ash.map((c) => Math.round(c * 0.7)),
        bookmark_text: pal.bone.map((c) => Math.round(c * 0.86)),
        toolbar_button_icon: pal.glassLit,
        omnibox_background: pal.panel,
        omnibox_text: pal.bone,
        ntp_background: pal.void,
        ntp_text: pal.bone,
        ntp_link: pal.core,
        ntp_header: pal.glass,
        button_background: [...pal.panel, 140],
      },
      tints: {
        buttons: [-1.0, -1.0, -1.0],
        frame: [-1.0, -1.0, -1.0],
        background_tab: [-1.0, -1.0, -1.0],
      },
      properties: {
        ntp_background_alignment: 'center',
        ntp_background_repeat: 'no-repeat',
        ntp_logo_alternate: 1,
      },
    },
  };
}

function themeJobs(key, pal) {
  const dir = `themes/${key}/`;
  const img = dir + 'images/';
  return [
    [`theme:${key} manifest`, () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(dir + 'manifest.json',
        JSON.stringify(themeManifest(key, pal), null, 2) + '\n', 'utf8');
      return { file: dir + 'manifest.json', width: 0, height: 0 };
    }],
    [`theme:${key} frame`, () =>
      render(img + 'theme_frame.png', 64, 140, strip(pal.void, pal.abyss, { sheen: 0.10 }, pal))],
    [`theme:${key} frame off`, () =>
      render(img + 'theme_frame_inactive.png', 64, 140, strip(pal.void, pal.lead, {}, pal))],
    [`theme:${key} toolbar`, () =>
      render(img + 'theme_toolbar.png', 64, 140,
        strip(pal.abyss, pal.pitch, { hairline: pal.core, sheen: 0.06 }, pal))],
    [`theme:${key} tabs`, () =>
      render(img + 'theme_tab_background.png', 64, 140, strip(pal.void, pal.panel, {}, pal))],
    [`theme:${key} button`, () =>
      render(img + 'theme_button_background.png', 32, 32, strip(pal.panel, pal.pitch, {}, pal))],
    [`theme:${key} ntp`, () =>
      render(img + 'theme_ntp_background.png', 1440, 810, backdrop(0.46, pal))],
  ];
}

/* ------------------------------------------------------------------ main -- */

// `node tools/gen-assets.mjs cathedral` draws the earlier stained-glass scene
// instead. The soft field is the default: plain light and atmosphere, with no
// structure that could be read as a mark.
const STYLE = (process.argv[2] || 'soft').toLowerCase();
const backdrop = STYLE === 'cathedral' ? cathedral : softField;

const E = 'extension/assets/';
const jobs = [
  ['palettes.css', writePalettes],
  ['grain', () => render(E + 'grain.png', 128, 128, grain)],
];

// One theme package per palette, alongside the extension's own art.
for (const [key, pal] of Object.entries(PALETTES)) {
  jobs.push(...themeJobs(key, pal));
}

// The one worth publishing: neutral enough to sit under any palette.
jobs.push(...themeJobs('neutral', NEUTRAL));

// Store listing icons. These are listing assets, not package files - a theme
// manifest has no icons key - so they go to docs/, never inside a package.
const STORE_INSET = 0.125; // 96x96 of artwork inside a 128x128 canvas
jobs.push(['store icon: extension',
  () => render('docs/store/icon-extension-128.png', 128, 128, mark(128, PALETTES.zero, STORE_INSET))]);
for (const [key, pal] of Object.entries({ graphite: NEUTRAL, ...PALETTES })) {
  jobs.push([`store icon: ${key}`,
    () => render(`docs/store/icon-theme-${key}-128.png`, 128, 128, mark(128, pal, STORE_INSET))]);
}
// One backdrop per palette. The interface recolours through CSS tokens, but the
// backdrop is a rendered image, so each palette needs its own.
for (const key of Object.keys(PALETTES)) {
  jobs.push([`backdrop:${key}`,
    () => render(`${E}backdrop-${key}.png`, 1920, 1080, backdrop(0.62, PALETTES[key]))]);
  // The toolbar icon is fixed by the manifest, but the mark shown inside the
  // page can follow the palette, which is what stops it looking stuck on.
  jobs.push([`sigil:${key}`,
    () => render(`${E}sigil-${key}.png`, 64, 64, mark(64, PALETTES[key]))]);
}

for (const s of [16, 32, 48, 128]) {
  jobs.push(['icon-' + s, () => render(E + 'icon-' + s + '.png', s, s, mark(s))]);
}

const { statSync } = await import('node:fs');
for (const job of jobs) {
  const t0 = Date.now();
  const out = job[1]();
  const kb = (statSync(out.file).size / 1024).toFixed(0);
  console.log('  ' + job[0].padEnd(18) + String(out.width).padStart(5) + 'x' +
    String(out.height).padEnd(5) + kb.padStart(6) + ' KB  ' + (Date.now() - t0) + 'ms');
}
console.log('\nassets written.');
