/**
 * The hero scene: a lake at the foot of layered hills, running through one
 * full day on a slow loop (dawn, noon, golden hour, dusk, night and back).
 * Mimi sits on the near knoll and watches the sky.
 *
 *   node scripts/scene/build.mjs                 writes assets/scenery-{dark,light}.svg
 *   OFFSET=30 OUT=.drafts/scene node ...         writes a preview frozen 30 s into the loop
 *
 * How it is built, and why:
 *   - One pixel grid (4 px cells, 215 x 90). Every shape is a path of whole
 *     cells, so edges stay crisp at any zoom. Glow is the only thing allowed
 *     off the grid: soft radial blooms on the sun, moon, window and fireflies.
 *   - The day is a list of keyed palettes. Each animated property is sampled
 *     over the loop and written as CSS @keyframes, so colour changes are
 *     smooth and everything follows one clock. Moving sprites step one cell
 *     at a time (step-end), which keeps them on the grid.
 *   - GitHub shows the file through <img>: no script, nothing external. All
 *     motion is CSS. Animations touch fill, opacity and transform only.
 *   - Placeless on purpose. No clock, no city, no coordinates.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);

const CW = 4, GW = 215, GH = 90, W = GW * CW, H = GH * CW;
const DUR = 90;            // seconds for one day
const N = 200;             // samples per day for keyed tracks
const START = 0.51;        // the loop opens at golden hour, the best frame first
const OFFSET = Number(process.env.OFFSET || 0);
const LAKE = 52;           // first lake row
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------ colour ---- */
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lin = (v) => Math.pow(v / 255, 2.2), unlin = (v) => 255 * Math.pow(Math.max(0, v), 1 / 2.2);
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => unlin(lin(v) + (lin(B[i]) - lin(v)) * t))); }
function mul(a, b) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => unlin(lin(v) * lin(B[i])))); }

/* --------------------------------------------------------------- rng ---- */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------- the day ---- */
/* Warm, dusty palettes that sit beside the portfolio's warm black and
   oxidised copper (#0a0a0a, #c97a4e, #8f4f2c). The copper lives in the low
   sun; the day stays muted so the warm hours carry the colour. */
const PAL = {
  night: { sky: ['#07070b', '#0b0a11', '#110f18', '#19151e', '#241c22'], amb: '#3a3c52', mist: '#4c4854', mistA: 0.22, stars: 1, deep: '#040405', cloud: '#141219', cloudLit: '#34333f', ripple: '#4a4a5c', skyRim: '#8a8ca4' },
  predawn: { sky: ['#0c0c16', '#17162a', '#2a2438', '#46323c', '#6e4636'], amb: '#4a4458', mist: '#7a6a78', mistA: 0.5, stars: 0.4, deep: '#09080b', cloud: '#2b2635', cloudLit: '#9a5e52', ripple: '#94684e', skyRim: '#b08a8a' },
  dawn: { sky: ['#2a2b44', '#504863', '#8a6672', '#c98a72', '#efbb8e'], amb: '#b0949a', mist: '#ecc8b6', mistA: 0.72, stars: 0, deep: '#1a161e', cloud: '#7a6278', cloudLit: '#f4b892', ripple: '#ffd8b0', skyRim: '#f2c6aa' },
  morning: { sky: ['#4a7cae', '#6a98c4', '#94b8d4', '#c4d6dc', '#f0e2c8'], amb: '#f2e6d4', mist: '#f2ece2', mistA: 0.3, stars: 0, deep: '#1c3a4c', cloud: '#e4e2e4', cloudLit: '#fffaf0', ripple: '#f8f2e6', skyRim: '#e8f0f4' },
  noon: { sky: ['#2f6aa8', '#4a86c0', '#74a8d4', '#a4c8e0', '#d4e6ea'], amb: '#fff8ec', mist: '#eef4f6', mistA: 0.08, stars: 0, deep: '#123a52', cloud: '#f2f4f6', cloudLit: '#ffffff', ripple: '#ffffff', skyRim: '#eef4f8' },
  afternoon: { sky: ['#3a6c9c', '#5888b4', '#88a8c4', '#c4c8c4', '#f0d6b0'], amb: '#fbe8cc', mist: '#f4e6d0', mistA: 0.1, stars: 0, deep: '#183446', cloud: '#f0e4d8', cloudLit: '#fff2dc', ripple: '#fff2da', skyRim: '#f4e8d6' },
  golden: { sky: ['#3c4a70', '#6a6684', '#b07e7c', '#e89a66', '#fcc47c'], amb: '#f0b07c', mist: '#f0c090', mistA: 0.24, stars: 0, deep: '#261e24', cloud: '#b08890', cloudLit: '#f8b472', ripple: '#ffd49a', skyRim: '#f4c08c' },
  sunset: { sky: ['#24233a', '#463650', '#82505a', '#c46a46', '#e89452'], amb: '#ac6c58', mist: '#c88070', mistA: 0.3, stars: 0.05, deep: '#181116', cloud: '#70505e', cloudLit: '#ec8c52', ripple: '#f2a262', skyRim: '#e8946a' },
  dusk: { sky: ['#111124', '#1d1b30', '#30263a', '#523642', '#7c4c42'], amb: '#564858', mist: '#6a5868', mistA: 0.34, stars: 0.4, deep: '#0b090e', cloud: '#3a3042', cloudLit: '#8a5a58', ripple: '#94685a', skyRim: '#a88690' },
};
const KEYS = [
  [0.0, 'night'], [0.05, 'night'], [0.08, 'predawn'], [0.12, 'dawn'], [0.19, 'morning'],
  [0.28, 'noon'], [0.38, 'noon'], [0.44, 'afternoon'], [0.495, 'golden'], [0.545, 'golden'], [0.59, 'sunset'],
  [0.635, 'dusk'], [0.7, 'night'], [1.0, 'night'],
];
let LIFT = 0; // light theme lifts the night a touch so it does not read as a hole

function pal(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
  const [t0, a] = KEYS[i], [t1, b] = KEYS[i + 1];
  const f = smooth(0, 1, (t - t0) / (t1 - t0));
  const A = PAL[a], B = PAL[b], o = {};
  for (const k of Object.keys(A)) {
    if (Array.isArray(A[k])) o[k] = A[k].map((c, j) => mix(c, B[k][j], f));
    else if (typeof A[k] === 'string') o[k] = mix(A[k], B[k], f);
    else o[k] = A[k] + (B[k] - A[k]) * f;
  }
  if (LIFT) { const n = nightness(t) * LIFT; o.sky = o.sky.map((c) => mix(c, '#3a3446', n)); o.deep = mix(o.deep, '#1c1922', n); o.amb = mix(o.amb, '#5a5a70', n); }
  return o;
}
const SKY_POS = [0, 0.35, 0.62, 0.84, 1];
function skyAt(p, f) {
  f = clamp(f); let j = 0; while (j < 3 && SKY_POS[j + 1] < f) j++;
  return mix(p.sky[j], p.sky[j + 1], (f - SKY_POS[j]) / (SKY_POS[j + 1] - SKY_POS[j]));
}
const horizon = (p) => mix(p.sky[3], p.sky[4], 0.6);

/* Sun and moon arcs, in cells. */
const SUN = { rise: 0.085, set: 0.605, x0: 26, x1: 166, y0: 50, peak: 9 };
const MOON = { rise: 0.645, set: 1.11, x0: 40, x1: 190, y0: 50, peak: 11 };
function arc(o, t) {
  let tt = t; if (tt < o.rise) tt += 1;
  const u = (tt - o.rise) / (o.set - o.rise);
  const uc = clamp(u, -0.04, 1.04);
  return { u, x: o.x0 + (o.x1 - o.x0) * uc, y: o.y0 - Math.sin(clamp(uc) * Math.PI) * (o.y0 - o.peak) + (uc < 0 || uc > 1 ? 6 : 0), up: u > 0 && u < 1 };
}
const sunElev = (t) => { const s = arc(SUN, t); return s.up ? Math.sin(s.u * Math.PI) : 0; };
function nightness(t) { t = ((t % 1) + 1) % 1; return t < 0.05 || t > 0.7 ? 1 : t < 0.11 ? 1 - smooth(0.05, 0.11, t) : t > 0.6 ? smooth(0.6, 0.7, t) : 0; }
const lowSun = (t) => { const s = arc(SUN, t); return s.up ? Math.pow(1 - Math.sin(s.u * Math.PI), 2.2) : 0; };

/* ------------------------------------------------- keyframe tracks ---- */
const css = [];
let trackN = 0;
const ts = (i) => i / N;
/** A property sampled over the day. kind: 'fill' | 'opacity' | 'move' */
function track(fn, kind, { step = false } = {}) {
  const name = 'k' + (trackN++).toString(36);
  const vals = [];
  for (let i = 0; i <= N; i++) {
    const t = START + ts(i);
    const v = fn(t);
    vals.push(kind === 'fill' ? `fill:${v}` : kind === 'opacity' ? `opacity:${r2(v)}` : `transform:translate(${Math.round(v[0])}px,${Math.round(v[1])}px)`);
  }
  vals[N] = vals[0];
  const frames = [];
  for (let i = 0; i <= N; i++) if (i === 0 || i === N || !(vals[i] === vals[i - 1] && vals[i] === vals[i + 1])) frames.push(`${r2(i / N * 100)}%{${vals[i]}}`);
  css.push(`@keyframes ${name}{${frames.join('')}}.${name}{animation:${name} ${DUR}s ${step ? 'step-end' : 'linear'} ${r2(-OFFSET)}s infinite}`);
  return name;
}
/** A small local loop (tail, blink, flicker). frames: css text. */
function loop(frames, dur, delay = 0, timing = 'linear') {
  const name = 'l' + (trackN++).toString(36);
  css.push(`@keyframes ${name}{${frames}}.${name}{animation:${name} ${dur}s ${timing} ${r2(delay - OFFSET)}s infinite}`);
  return name;
}

/* ------------------------------------------------------------ paths ---- */
/** Cells to one compact path: horizontal runs, relative moves. */
function cellsPath(cells) {
  const set = new Map();
  for (const [x, y] of cells) { if (x < -40 || x > GW + 40 || y < -40 || y > GH + 40) continue; (set.get(y) || set.set(y, new Set()).get(y)).add(x); }
  let d = '', px = 0, py = 0, first = true;
  for (const y of [...set.keys()].sort((a, b) => a - b)) {
    const xs = [...set.get(y)].sort((a, b) => a - b);
    for (let i = 0; i < xs.length;) {
      let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const X = xs[i] * CW, Y = y * CW, L = (j - i + 1) * CW;
      d += first ? `M${X} ${Y}` : `m${X - px} ${Y - py}`;
      d += `h${L}v${CW}h-${L}z`;
      px = X; py = Y; first = false; i = j + 1;
    }
  }
  return d;
}
const P = (cells, cls, extra = '') => `<path d="${cellsPath(cells)}"${cls ? ` class="${cls}"` : ''}${extra}/>`;
/** Stepped skyline: columns from tops[x] down to bottom row. */
function skylinePath(tops, bottom) {
  let d = `M0 ${bottom * CW}`;
  let prev = null;
  for (let x = 0; x < tops.length; x++) { const y = tops[x] * CW; if (y !== prev) { d += `V${y}`; prev = y; } d += `H${(x + 1) * CW}`; }
  return d.replace(/H(\d+)(?=H)/g, '') + `V${bottom * CW}z`;
}
const disc = (r) => { const c = []; for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) if (Math.hypot(x, y) <= r + 0.35) c.push([x, y]); return c; };

/* ------------------------------------------------------- the terrain ---- */
function noise1(seed) { const r = rng(seed), v = Array.from({ length: 64 }, r); return (x) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return v[i & 63] * (1 - s) + v[(i + 1) & 63] * s; }; }
const VALLEY = 150;
const MIMI_X = 133, MIMI_BASE = 65; // the notch behind Mimi where the sun goes down
function ridgeTops(seed, base, amp, scale, valleyDepth) {
  const n1 = noise1(seed), n2 = noise1(seed + 9), n3 = noise1(seed + 19);
  const tops = [];
  for (let x = 0; x < GW; x++) {
    const h = n1(x / scale) * 0.62 + n2(x / (scale * 0.42)) * 0.28 + n3(x / (scale * 0.16)) * 0.1;
    const notch = 1 - valleyDepth * Math.exp(-Math.pow((x - VALLEY) / 20, 2));
    tops.push(Math.min(LAKE - 1, Math.round(base - amp * h * notch)));
  }
  return tops;
}
const RIDGES = [
  { tops: ridgeTops(311, 46, 30, 34, 0.75), alb: '#6a7c94', haze: 0.62 },
  { tops: ridgeTops(97, 48, 20, 22, 0.85), alb: '#4c6a6c', haze: 0.44 },
  { tops: ridgeTops(5003, 50, 13, 15, 0.95), alb: '#3a5a40', haze: 0.26 },
  { tops: ridgeTops(77, 51, 6, 9, 1), alb: '#2a4630', haze: 0.12 },
];
// far-shore treeline
const TREES = [];
{
  const r = rng(5150); let x = 0;
  while (x < GW) {
    const nearValley = Math.abs(x - VALLEY) < 10;
    const h = nearValley ? 1 : 2 + Math.floor(r() * 3);
    for (let k = 0; k < h; k++) { TREES.push([x, LAKE - 1 - k]); if (k < h - 2) { TREES.push([x - 1, LAKE - 1 - k]); TREES.push([x + 1, LAKE - 1 - k]); } }
    x += 2 + Math.floor(r() * 3);
  }
  for (let x = 0; x < GW; x++) TREES.push([x, LAKE - 1]);
}
// foreground hill: a cabin rise on the left, Mimi's knoll right of centre
const FG = [];
{
  const r = rng(6161); let bump = 0;
  for (let x = 0; x < GW; x++) {
    if (x % 6 === 0) bump = Math.floor(r() * 2);
    const cabinRise = 6 * Math.exp(-Math.pow((x - 38) / 22, 2));
    const knoll = 8.5 * Math.exp(-Math.pow((x - 145) / 24, 2));
    let y = Math.round(74 - cabinRise - knoll + Math.sin(x / 13) * 1.2) + bump;
    const d = x < MIMI_X - 6 ? MIMI_X - 6 - x : x > MIMI_X + 22 ? x - MIMI_X - 22 : 0;
    if (d === 0) y = MIMI_BASE + 1; else if (d < 12) y = Math.round(MIMI_BASE + 1 + (y - MIMI_BASE - 1) * d / 12);
    FG.push(y);
  }
}
 // sprite bottom row sits on the knoll
const CABIN_X = 30;

/* ------------------------------------------------------------- Mimi ---- */
// Side view, sitting, 24 x 26 cells. The body is fixed; the head is one of
// three sprites (toward the sunset, toward you, toward the moon) so she can
// turn it. E marks an eye.
const MW = 24;
const BODY = [
  '............XXXXXX......',
  '...........XXXXXXX......',
  '..........XXXXXXXX......',
  '.........XXXXXXXXX......',
  '........XXXXXXXXXX......',
  '.......XXXXXXXXXXX......',
  '......XXXXXXXXXXXX......',
  '......XXXXXXXXXXXX......',
  '.....XXXXXXXXXXXXX......',
  '.....XXXXXXXXXXXXXX.....',
  '....XXXXXXXXXXXXXXX.....',
  '....XXXXXXXXXXXXXXX.....',
  '....XXXXXXXXXXXXXXXX....',
  '....XXXXXXXXXXXX.XXX....',
  '...XXXXXXXXXXXXX.XXX....',
  '...XXXXXXXXXXXXXX.XXX...',
  '..XXXXXXXXXXXXXXXXXXXX..',
];
const HEAD_R = [
  '.............X...X......',
  '.............XX..XX.....',
  '.............XXXXXX.....',
  '............XXXXXXXX....',
  '............XXXXXXEXX...',
  '............XXXXXXXXXX..',
  '............XXXXXXXXX...',
  '.............XXXXXXX....',
  '..............XXXXX.....',
];
const HEAD_F = [
  '............X.....X.....',
  '............XX...XX.....',
  '............XXXXXXX.....',
  '...........XXXXXXXXX....',
  '...........XXEXXXEXX....',
  '...........XXXXXXXXX....',
  '............XXXXXXX.....',
  '.............XXXXX......',
  '..............XXXX......',
];
const HEAD_L = HEAD_R.map((r) => ('......' + [...r].reverse().join('')).slice(0, MW)); // mirrored about the neck
const MIMI_H = BODY.length + HEAD_R.length;
const MIMI_Y = MIMI_BASE - MIMI_H + 1;
function sprite(rows, dy) {
  const cells = [], eyes = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === 'X') cells.push([MIMI_X + x, MIMI_Y + dy + y]);
    if (c === 'E') { cells.push([MIMI_X + x, MIMI_Y + dy + y]); eyes.push([MIMI_X + x, MIMI_Y + dy + y]); }
  }));
  return { cells, eyes };
}
const MB = sprite(BODY, HEAD_R.length);
const MHR = sprite(HEAD_R, 0), MHF = sprite(HEAD_F, 0), MHL = sprite(HEAD_L, 0);
// the near ear of the side-on head folds back for an ear flick
const EAR_UP = [[MIMI_X + 17, MIMI_Y], [MIMI_X + 17, MIMI_Y + 1], [MIMI_X + 18, MIMI_Y + 1]];
const EAR_BACK = [[MIMI_X + 16, MIMI_Y + 1], [MIMI_X + 16, MIMI_Y + 2]];
// tail: a curve from her haunch along the ground, two cells thick at the root
const tailCells = (pts) => { const c = []; pts.forEach(([x, y], i) => { c.push([MIMI_X + x, MIMI_BASE + y]); if (i < 4) c.push([MIMI_X + x, MIMI_BASE + y - 1]); }); return c; };
const TAIL = [
  tailCells([[2, 0], [1, 0], [0, 0], [-1, 0], [-2, 0], [-3, -1], [-4, -2], [-4, -3]]),
  tailCells([[2, 0], [1, 0], [0, 0], [-1, -1], [-2, -2], [-3, -3], [-3, -4], [-2, -5]]),
  tailCells([[2, 0], [1, 0], [0, 0], [-1, 0], [-2, 0], [-3, 0], [-4, 0], [-5, -1]]),
];
const MIMI_END = MIMI_X + MW;

/* ------------------------------------------------------------ build ---- */
function build(theme) {
  css.length = 0; trackN = 0;
  LIFT = theme === 'light' ? 0.45 : 0;
  const L = [];   // layers in paint order
  const defs = [];

  /* sky: 13 bands of four rows; the last row of each band dithers into the next */
  const SB = 13;
  const skyCls = [];
  for (let k = 0; k < SB; k++) skyCls.push(track((t) => skyAt(pal(t), (k + 0.5) / SB), 'fill'));
  let sky = '';
  for (let k = 0; k < SB; k++) sky += `<rect y="${k * 4 * CW}" width="${W}" height="${4 * CW}" class="${skyCls[k]}"/>`;
  for (let k = 1; k < SB; k++) { const y = k * 4 - 1, c = []; for (let x = 0; x < GW; x++) if ((x + y) % 2 === 0) c.push([x, y]); sky += P(c, skyCls[k]); }
  for (let k = 0; k < SB - 1; k++) { const y = k * 4 + 3 + 1, c = []; for (let x = 0; x < GW; x++) if ((x + y) % 4 === 1) c.push([x, y]); sky += P(c, skyCls[k]); }
  defs.push(`<g id="sky">${sky}</g>`);
  L.push('<use href="#sky"/>');

  /* stars: a static field, a faint band of the galaxy, a few that breathe */
  {
    const r = rng(4242), c = [], big = [], band = [];
    for (let i = 0; i < 120; i++) c.push([Math.floor(r() * GW), Math.floor(Math.pow(r(), 1.5) * 40)]);
    for (let i = 0; i < 5; i++) { const x = 10 + Math.floor(r() * 195), y = 3 + Math.floor(r() * 22); big.push([x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]); }
    const rb = rng(808);
    for (let x = 0; x < GW; x++) for (let y = 0; y < 40; y++) { const d = Math.abs(y - (36 - x * 0.17)); if (d < 5 && rb() < 0.16 * (1 - d / 5)) band.push([x, y]); }
    const op = track((t) => pal(t).stars, 'opacity');
    let tw = '';
    const rt = rng(91);
    for (let i = 0; i < 16; i++) { const x = Math.floor(rt() * GW), y = Math.floor(rt() * 34); tw += P([[x, y]], loop('0%,100%{opacity:.15}50%{opacity:1}', r2(3 + rt() * 4), r2(-rt() * 6), 'ease-in-out'), ' fill="#fdf6e8"'); }
    L.push(`<g class="${op}">${P(band, '', ' fill="#8c8496" opacity=".16"')}${P(c, '', ' fill="#e9e4ee" opacity=".8"')}${P(big.filter((_, i) => i % 5 === 0), '', ' fill="#fff8ec"')}${P(big.filter((_, i) => i % 5 !== 0), '', ' fill="#bfb6c8" opacity=".5"')}${tw}</g>`);
  }

  /* one shooting star, once per loop, deep in the night */
  {
    const p = r2(((0.8 - START) % 1 + 1) % 1 * 100);
    const a = [120 * CW, 6 * CW], b = [168 * CW, 22 * CW];
    const mv = loop(`0%,${p}%{opacity:0;transform:translate(${a[0]}px,${a[1]}px)}${r2(p + 0.15)}%{opacity:1}${r2(p + 1.0)}%{opacity:.9}${r2(p + 1.4)}%,100%{opacity:0;transform:translate(${b[0]}px,${b[1]}px)}`, DUR, 0, 'linear');
    defs.push(`<linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="-72" y1="-24" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff6e4" stop-opacity=".95"/></linearGradient>`);
    L.push(`<g class="${mv}" shape-rendering="auto"><path d="M-72 -24L0 0" stroke="url(#trail)" stroke-width="2.4" stroke-linecap="round"/><rect x="-2" y="-2" width="4" height="4" fill="#fffaf0"/></g>`);
  }

  /* moon: a pixel disc with two seas, a cool bloom */
  {
    const m = arc(MOON, 0);
    const mv = track((t) => { const a = arc(MOON, t); return [a.x * CW, a.y * CW]; }, 'move', { step: true });
    const mo = track((t) => { const a = arc(MOON, t); return a.up ? smooth(0, 0.05, a.u) * (1 - smooth(0.95, 1, a.u)) * (0.35 + 0.65 * Math.max(nightness(t), 0.3)) : 0; }, 'opacity');
    defs.push(`<radialGradient id="mglow"><stop offset="0" stop-color="#cfd2e6" stop-opacity=".42"/><stop offset=".35" stop-color="#9a9ec0" stop-opacity=".14"/><stop offset="1" stop-color="#9a9ec0" stop-opacity="0"/></radialGradient>`);
    defs.push(`<g id="moon" class="${mo}"><g class="${mv}"><circle r="70" fill="url(#mglow)" cx="2" cy="2"/>${P(disc(4), '', ' fill="#efe9d8"')}${P([[-1, -1], [0, -1], [-2, 0], [1, 1], [2, 2], [1, 2]], '', ' fill="#cbc3b0"')}</g></g>`);
    L.push('<use href="#moon"/>');
    void m;
  }

  /* sun: the disc warms as it drops; a copper bloom grows near the horizon */
  {
    const mv = track((t) => { const a = arc(SUN, t); return [a.x * CW, a.y * CW]; }, 'move', { step: true });
    const op = track((t) => { const a = arc(SUN, t); return a.up ? smooth(0, 0.03, a.u) * (1 - smooth(0.97, 1, a.u)) : 0; }, 'opacity');
    const col = track((t) => mix('#f39a52', '#fff6e2', smooth(0.25, 0.85, sunElev(t))), 'fill');
    const warm = track((t) => 0.25 + 0.75 * lowSun(t), 'opacity');
    defs.push(`<radialGradient id="sglow"><stop offset="0" stop-color="#fff2d6" stop-opacity=".7"/><stop offset=".25" stop-color="#ffe6bc" stop-opacity=".22"/><stop offset="1" stop-color="#ffe6bc" stop-opacity="0"/></radialGradient>`);
    defs.push(`<radialGradient id="cglow"><stop offset="0" stop-color="#f0a060" stop-opacity=".55"/><stop offset=".4" stop-color="#c97a4e" stop-opacity=".2"/><stop offset="1" stop-color="#c97a4e" stop-opacity="0"/></radialGradient>`);
    const rayOp = track((t) => { const a = arc(SUN, t); return a.up ? 0.75 * smooth(0.55, 0.78, a.u) * (1 - smooth(0.94, 0.99, a.u)) : 0; }, 'opacity');
    defs.push(`<radialGradient id="rayG" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="620"><stop offset="0" stop-color="#ffe2b0" stop-opacity=".3"/><stop offset=".45" stop-color="#ffd09a" stop-opacity=".08"/><stop offset="1" stop-color="#ffd09a" stop-opacity="0"/></radialGradient>`);
    let rays = '';
    const rr = rng(2024);
    for (let i = 0; i < 11; i++) {
      const a = (-180 + 8 + i * 16 + rr() * 6) * Math.PI / 180, w = (2.2 + rr() * 2.6) * Math.PI / 180, R = 620;
      const pt = (q) => `${r2(Math.cos(q) * R)},${r2(Math.sin(q) * R)}`;
      const br = loop('0%,100%{opacity:.25}50%{opacity:1}', r2(5 + rr() * 5), r2(-rr() * 8), 'ease-in-out');
      rays += `<polygon points="0,0 ${pt(a - w)} ${pt(a + w)}" fill="url(#rayG)" class="${br}"/>`;
    }
    defs.push(`<g id="sun" class="${op}"><g class="${mv}"><g class="${rayOp}" shape-rendering="auto">${rays}</g><ellipse rx="230" ry="120" cx="2" cy="2" fill="url(#cglow)" class="${warm}"/><circle r="58" cx="2" cy="2" fill="url(#sglow)"/>${P(disc(5), col)}</g></g>`);
    L.push('<use href="#sun"/>');
  }

  /* clouds: three, drifting at their own pace; the underside catches the sun */
  const cloudBody = track((t) => pal(t).cloud, 'fill');
  const cloudLit = track((t) => pal(t).cloudLit, 'fill');
  const cloudOp = track((t) => 0.5 + 0.45 * (1 - nightness(t)), 'opacity');
  function cloud(seed, w, h) {
    const r = rng(seed), set = new Set();
    const puffs = [[w * 0.5, h * 0.9], [w * 0.28, h * 0.6], [w * 0.72, h * 0.7]];
    for (let i = 0; i < 3; i++) puffs.push([w * (0.15 + r() * 0.7), h * (0.4 + r() * 0.4)]);
    for (const [cx, rad] of puffs) for (let y = -Math.ceil(rad); y <= 0; y++) for (let x = Math.floor(cx - rad * 1.6); x <= cx + rad * 1.6; x++) if (Math.hypot((x - cx) / 1.6, y) <= rad) set.add(`${x},${h + y}`);
    for (let x = Math.round(w * 0.08); x < w * 0.92; x++) set.add(`${x},${h}`);
    const body = [], lit = [];
    for (const k of set) { const [x, y] = k.split(',').map(Number); (y === h || (y === h - 1 && x % 3 !== 0) ? lit : body).push([x, y]); }
    return { body, lit, w };
  }
  {
    let cl = '';
    for (const [seed, w, h, y, dur, ph] of [[3, 30, 5, 10, 150, 0.12], [11, 18, 3, 20, 120, 0.55], [29, 40, 6, 29, 105, 0.78], [41, 24, 4, 15, 135, 0.34], [53, 14, 3, 5, 170, 0.9]]) {
      const c = cloud(seed, w, h);
      const span = W + w * CW + 40;
      const mv = loop(`0%{transform:translate(${W + 20}px,${y * CW}px)}100%{transform:translate(${-w * CW - 20}px,${y * CW}px)}`, dur, -ph * dur, `steps(${Math.round(span / CW)})`);
      cl += `<g class="${mv}">${P(c.body, cloudBody)}${P(c.lit, cloudLit)}</g>`;
    }
    L.push(`<g class="${cloudOp}">${cl}</g>`);
  }

  /* distant mist between the ridges */
  const mistCol = track((t) => pal(t).mist, 'fill');
  function mistStrip(y, rows, density, seed, dur, opMul) {
    const r = rng(seed), c = [];
    for (let k = 0; k < rows; k++) {
      const edge = 1 - Math.abs(k - (rows - 1) / 2) / rows;
      let x = Math.floor(r() * 8);
      while (x < GW) {
        const lump = 0.5 + 0.5 * Math.sin(x / 11 + seed + k) * Math.sin(x / 29 + seed * 2);
        const len = 3 + Math.floor(r() * 10 * edge);
        if (r() < density * (0.4 + lump) * edge) for (let q = 0; q < len; q++) { const X = (x + q) % GW; c.push([X, y + k], [X + GW, y + k]); }
        x += len + 2 + Math.floor(r() * 7);
      }
    }
    const mv = loop(`0%{transform:translateX(0)}100%{transform:translateX(${-W}px)}`, dur, 0, `steps(${GW})`);
    const op = track((t) => Math.min(0.5, pal(t).mistA * opMul * 0.7), 'opacity');
    return `<g class="${op}"><g class="${mv}">${P(c, mistCol)}</g></g>`;
  }

  /* ridges, far to near, each hazed toward the horizon colour */
  const ridgeCls = RIDGES.map((rd) => track((t) => { const p = pal(t); return mix(mul(rd.alb, p.amb), horizon(p), rd.haze); }, 'fill'));
  const rimL = track((t) => { const s = arc(SUN, t); return s.up && s.u < 0.35 ? 0.6 * (1 - smooth(0.15, 0.35, s.u)) * smooth(0, 0.05, s.u) : 0; }, 'opacity');
  const rimR = track((t) => { const s = arc(SUN, t); return s.up && s.u > 0.6 ? 0.7 * smooth(0.6, 0.85, s.u) * (1 - smooth(0.97, 1, s.u)) : 0; }, 'opacity');
  const rimCol = track((t) => mix('#f6c69a', '#f0a868', lowSun(t)), 'fill');
  let ridges = '';
  RIDGES.forEach((rd, i) => {
    ridges += `<path d="${skylinePath(rd.tops, LAKE)}" class="${ridgeCls[i]}"/>`;
    if (i === 1) ridges += mistStrip(36, 5, 0.5, 7, 260, 0.8);
    if (i === 2) ridges += mistStrip(44, 4, 0.55, 13, 190, 1);
    if (i >= 1) {
      const l = [], rr = [];
      for (let x = 1; x < GW - 1; x++) { const y = rd.tops[x]; if (rd.tops[x - 1] > y || (rd.tops[x - 1] === y && x % 3 === 0)) l.push([x, y]); if (rd.tops[x + 1] > y || (rd.tops[x + 1] === y && x % 3 === 1)) rr.push([x, y]); }
      ridges += `<g class="${rimCol}">${P(l, rimL)}${P(rr, rimR)}</g>`;
    }
  });
  const treeCls = track((t) => { const p = pal(t); return mix(mul('#2a221c', p.amb), horizon(p), 0.1); }, 'fill');
  ridges += P(TREES, treeCls);
  defs.push(`<g id="ridges">${ridges}</g>`);
  L.push('<use href="#ridges"/>');

  /* lake: the sky mirrored and darkened with depth, then the ridges mirrored */
  {
    const LB = 13; const lakeCls = [];
    for (let k = 0; k < LB; k++) lakeCls.push(track((t) => { const p = pal(t); const f = 1 - (k * 3 + 1.5) / 52 * 1.6; return mix(mix(skyAt(p, 1 - (1 - f) * 0.9), p.deep, 0.1 + k * 0.035), p.amb, 0.04); }, 'fill'));
    let lake = '';
    for (let k = 0; k < LB; k++) lake += `<rect y="${(LAKE + k * 3) * CW}" width="${W}" height="${3 * CW}" class="${lakeCls[k]}"/>`;
    for (let k = 1; k < LB; k++) { const y = LAKE + k * 3 - 1, c = []; for (let x = 0; x < GW; x++) if ((x + y) % 2 === 0) c.push([x, y]); lake += P(c, lakeCls[k]); }
    L.push(lake);
    defs.push(`<clipPath id="lakeClip"><rect y="${LAKE * CW}" width="${W}" height="${H - LAKE * CW}"/></clipPath>`);
    const flip = `translate(0 ${2 * LAKE * CW}) scale(1 -1)`;
    // the mirror: sun, moon and hills flipped, then cut into two-row strips
    // that slide one cell left and right out of phase, so the reflection
    // wobbles like water without any streaks painted on top
    defs.push(`<g id="refl"><g transform="${flip}" opacity=".55"><use href="#sun"/><use href="#moon"/></g><g transform="${flip}" opacity=".84"><use href="#ridges"/></g></g>`);
    let strips = '';
    for (let y = LAKE, k = 0; y < GH; y += 2, k++) {
      defs.push(`<clipPath id="rs${k}"><rect y="${y * CW}" width="${W}" height="${2 * CW}"/></clipPath>`);
      const sh = k < 1 ? '' : loop(`0%,100%{transform:translateX(0)}25%{transform:translateX(${CW}px)}50%{transform:translateX(0)}75%{transform:translateX(${-CW}px)}`, 3.6, -k * 0.53, 'step-end');
      strips += `<g clip-path="url(#rs${k})"><g${sh ? ` class="${sh}"` : ''}><use href="#refl"/></g></g>`;
    }
    L.push(`<g clip-path="url(#lakeClip)">${strips}</g>`);
    // glint path under the sun and under the moon
    const glint = (seed) => { const r = rng(seed), A = [], B = []; for (let y = LAKE + 1; y < 74; y++) { const k = y - LAKE; const half = 2 + Math.floor(k * 0.42); if (k > 3 && k % 2 === 0 && r() < 0.5) continue; let x = -half + Math.floor(r() * 2); while (x <= half) { const run = 1 + Math.floor(r() * 3); for (let q = 0; q < run; q++) (r() < 0.5 ? A : B).push([x + q, y]); x += run + 1 + Math.floor(r() * 3); } } return [A, B]; };
    const sx = track((t) => [Math.round(arc(SUN, t).x) * CW, 0], 'move', { step: true });
    const sop = track((t) => { const s = arc(SUN, t); return s.up ? (0.25 + 0.75 * lowSun(t)) * smooth(0, 0.04, s.u) * (1 - smooth(0.98, 1, s.u)) : 0; }, 'opacity');
    const scol = track((t) => mix('#ffb468', '#fff4dc', smooth(0.25, 0.85, sunElev(t))), 'fill');
    const [ga, gb] = glint(31);
    const f1 = loop('0%,100%{opacity:1}50%{opacity:.25}', 1.9, 0, 'step-end');
    const f2 = loop('0%,100%{opacity:.25}50%{opacity:1}', 1.9, 0, 'step-end');
    L.push(`<g class="${sop}"><g class="${sx}"><g class="${scol}">${P(ga, f1)}${P(gb, f2)}</g></g></g>`);
    const mx = track((t) => [Math.round(arc(MOON, t).x) * CW, 0], 'move', { step: true });
    const mop = track((t) => { const m = arc(MOON, t); return m.up ? 0.55 * smooth(0, 0.05, m.u) * (1 - smooth(0.95, 1, m.u)) * Math.max(nightness(t), 0.25) : 0; }, 'opacity');
    const [ma, mb] = glint(57);
    L.push(`<g class="${mop}"><g class="${mx}"><g fill="#dcdcea">${P(ma.filter((_, i) => i % 2 === 0), f2)}${P(mb.filter((_, i) => i % 2 === 0), f1)}</g></g></g>`);
    // low mist over the water
    L.push(mistStrip(LAKE - 1, 3, 0.5, 21, 150, 0.6));
  }

  /* one bird crosses at dawn */
  {
    const bx = track((t) => { const u = (((t % 1) + 1) % 1 - 0.125) / 0.075; return u < 0 || u > 1 ? [-40, 70] : [(-8 + u * (GW + 16)) * CW, (20 - u * 6 + (Math.floor(u * 40) % 4 === 0 ? 1 : 0)) * CW]; }, 'move', { step: true });
    const bo = track((t) => { const u = (((t % 1) + 1) % 1 - 0.125) / 0.075; return u > 0 && u < 1 ? 1 : 0; }, 'opacity', { step: true });
    const up = loop('0%{opacity:1}50%{opacity:0}', 0.7, 0, 'step-end'), dn = loop('0%{opacity:0}50%{opacity:1}', 0.7, 0, 'step-end');
    const bc = track((t) => mix(mul('#1c1614', pal(t).amb), horizon(pal(t)), 0.15), 'fill');
    L.push(`<g class="${bo}"><g class="${bx}"><g class="${bc}">${P([[1, 1]], '')}${P([[0, 0], [2, 0]], up)}${P([[0, 2], [2, 2]], dn)}${P([[-1, 0], [3, 0]], up)}${P([[-1, 1], [3, 1]], dn)}</g></g></g>`);
  }

  /* foreground: hill, crest light, grass that leans when the wind passes */
  const fgCls = track((t) => mul('#2e3a24', pal(t).amb), 'fill');
  const crestCls = track((t) => { const p = pal(t); return mix(mul('#5a7a36', p.amb), mul('#f0a060', p.amb), lowSun(t) * 0.5); }, 'fill');
  {
    let fg = `<path d="${skylinePath(FG, GH)}" class="${fgCls}"/>`;
    const crest = []; for (let x = 0; x < GW; x++) if ((x * 7) % 5 < 3 && !(x >= MIMI_X - 6 && x < MIMI_END)) crest.push([x, FG[x]]);
    fg += `<g opacity=".55">${P(crest, crestCls)}</g>`;
    const gr = rng(1212);
    for (let g = 0; g < 9; g++) {
      const base = [], A = [], B = [];
      const x0 = Math.floor(g * GW / 9);
      for (let x = x0; x < x0 + GW / 9; x++) {
        if ((x >= MIMI_X - 7 && x < MIMI_END) || (x >= CABIN_X - 1 && x < CABIN_X + 13) || gr() > 0.42) continue;
        const y = FG[x]; base.push([x, y - 1]);
        if (gr() < 0.55) { A.push([x, y - 2]); B.push([x + 1, y - 2]); }
      }
      const delay = -g * 0.42;
      const a = loop('0%,45%{opacity:1}47%,78%{opacity:0}80%,100%{opacity:1}', 4.2, delay, 'step-end');
      const b = loop('0%,45%{opacity:0}47%,78%{opacity:1}80%,100%{opacity:0}', 4.2, delay, 'step-end');
      fg += `<g class="${fgCls}">${P(base, '')}${P(A, a)}${P(B, b)}</g>`;
    }
    L.push(fg);
  }

  /* cabin: smoke all day, the window comes on at dusk */
  {
    const cx = CABIN_X, by = Math.min(...FG.slice(cx, cx + 12));
    const pine = track((t) => mul('#1e1814', pal(t).amb), 'fill');
    const c = [];
    for (let y = by - 7; y <= by; y++) for (let x = cx; x < cx + 12; x++) c.push([x, y]);
    for (let k = 0; k < 5; k++) for (let x = cx - 1 + k; x < cx + 13 - k; x++) c.push([x, by - 8 - k]);
    for (let y = by - 13; y < by - 8; y++) { c.push([cx + 9, y]); c.push([cx + 10, y]); }
    c.push([cx + 8, by - 13], [cx + 11, by - 13]);
    for (let x = cx; x < cx + 12; x++) for (let y = by + 1; y < by + 4; y++) c.push([x, y]);
    const lit = track((t) => { t = ((t % 1) + 1) % 1; return t > 0.6 || t < 0.115 ? smooth(0.6, 0.625, t > 0.5 ? t : 1) * (t < 0.5 ? 1 - smooth(0.1, 0.115, t) : 1) : 0; }, 'opacity');
    defs.push(`<radialGradient id="wglow"><stop offset="0" stop-color="#ffc070" stop-opacity=".5"/><stop offset=".4" stop-color="#c97a4e" stop-opacity=".16"/><stop offset="1" stop-color="#c97a4e" stop-opacity="0"/></radialGradient>`);
    const breathe = loop('0%,100%{opacity:1}50%{opacity:.86}', 9, 0, 'ease-in-out');
    const win = [[cx + 3, by - 5], [cx + 4, by - 5], [cx + 3, by - 4], [cx + 4, by - 4]], win2 = [[cx + 7, by - 5], [cx + 8, by - 5], [cx + 7, by - 4], [cx + 8, by - 4]];
    let smoke = '';
    const sr = rng(66);
    for (let i = 0; i < 9; i++) {
      const sz = i % 3 === 2 ? 1 : 2, dur = 10, delay = -i * 1.11;
      const drift = 6 + Math.floor(sr() * 4);
      const mv = loop(`0%{transform:translate(0,0);opacity:0}10%{opacity:.75}35%{transform:translate(${-CW}px,${-5 * CW}px)}65%{transform:translate(${2 * CW}px,${-10 * CW}px);opacity:.5}100%{transform:translate(${drift * CW}px,${-16 * CW}px);opacity:0}`, dur, delay, 'steps(20)');
      const cells = []; for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) cells.push([cx + 9 + x, by - 14 - y]);
      smoke += P(cells, mv);
    }
    const smokeCol = track((t) => mix(mul('#b8b0a6', pal(t).amb), horizon(pal(t)), 0.3), 'fill');
    L.push(`<g class="${pine}">${P(c, '')}</g><g class="${smokeCol}">${smoke}</g><g class="${lit}"><g class="${breathe}"><circle cx="${(cx + 6) * CW}" cy="${(by - 4.5) * CW}" r="64" fill="url(#wglow)"/>${P(win, '', ' fill="#ffc46e"')}${P(win2, '', ' fill="#f4a85e"')}</g></g>`);
  }

  /* framing pines at both edges */
  {
    const pc = track((t) => mul('#1a1511', pal(t).amb), 'fill');
    const c = [];
    const stamp = (cx, by, h) => { for (let k = 0; k < h; k++) { const w = Math.max(0, Math.round((h - k) * 0.33) - (k % 3 === 1 ? 1 : 0)); for (let x = cx - w; x <= cx + w; x++) c.push([x, by - k]); } c.push([cx, by + 1]); };
    for (const [x, h] of [[3, 34], [11, 26], [-2, 22], [20, 16], [GW - 4, 36], [GW - 12, 28], [GW + 1, 24], [GW - 20, 18]]) stamp(x, FG[clamp(x, 0, GW - 1)] + 2, h);
    L.push(P(c, pc));
  }

  /* Mimi: a tail swish every few seconds, an ear flick, a slow blink, and
     she turns her head: toward the sunset by day, toward the moon at night,
     and now and then toward you. Every change is a whole-cell step. */
  {
    const body = '#0c0a09';
    const has = (cells) => { const m = new Set(cells.map(([x, y]) => `${x},${y}`)); return (x, y) => m.has(`${x},${y}`); };
    const skyRim = track((t) => pal(t).skyRim, 'fill');
    const skyRimOp = track((t) => 0.34 + 0.24 * nightness(t), 'opacity');
    const frontOp = track((t) => { const s = arc(SUN, t); return s.up && s.u > 0.55 ? 0.95 * smooth(0.55, 0.8, s.u) * (1 - smooth(0.985, 1, s.u)) : 0; }, 'opacity');
    const backOp = track((t) => { const s = arc(SUN, t); return s.up && s.u < 0.4 ? 0.8 * (1 - smooth(0.2, 0.4, s.u)) * smooth(0, 0.03, s.u) : 0; }, 'opacity');
    const eyeCol = track((t) => mix('#c0803e', '#f0b664', nightness(t)), 'fill');
    const blink = loop('0%,88%{opacity:1}90%{opacity:.45}91.5%,95%{opacity:0}96.5%{opacity:.45}98%,100%{opacity:1}', 9, -2, 'step-end');
    function part(cells, eyes, cover = []) {
      const on = has(cells.concat(cover)), top = [], front = [], back = [];
      for (const [x, y] of cells) {
        if (!on(x, y - 1)) top.push([x, y]);
        if (!on(x + 1, y) && y < MIMI_BASE - 1) front.push([x, y]);
        if (!on(x - 1, y) && y < MIMI_BASE - 1) back.push([x, y]);
      }
      return `<g fill="${body}">${P(cells, '')}</g><g class="${skyRimOp}">${P(top, skyRim)}</g>`
        + `<g class="${frontOp}">${P(front, '', ' fill="#f6ae68"')}${P(top.filter(([x]) => x > MIMI_X + 10), '', ' fill="#f6ae68"')}</g>`
        + `<g class="${backOp}">${P(back, '', ' fill="#f4c8a4"')}</g>`
        + (eyes.length ? `<g class="${eyeCol}">${P(eyes, blink)}</g>` : '');
    }
    // which way the head points, over the day: moon to her left at night means she looks left
    const lookLeft = (t) => { const m = arc(MOON, t); return nightness(t) > 0.6 && m.up && m.x + 4 < MIMI_X + 12; };
    const trR = track((t) => (lookLeft(t) ? 0 : 1), 'opacity', { step: true });
    const trL = track((t) => (lookLeft(t) ? 1 : 0), 'opacity', { step: true });
    const notGlance = loop('0%,78%{opacity:1}79%,93%{opacity:0}94%,100%{opacity:1}', 17, -1, 'step-end');
    const glance = loop('0%,78%{opacity:0}79%,93%{opacity:1}94%,100%{opacity:0}', 17, -1, 'step-end');
    const earUp = loop('0%,46%{opacity:1}47%,50%{opacity:0}51%,53%{opacity:1}54%,57%{opacity:0}58%,100%{opacity:1}', 11, -9, 'step-end');
    const earBack = loop('0%,46%{opacity:0}47%,50%{opacity:1}51%,53%{opacity:0}54%,57%{opacity:1}58%,100%{opacity:0}', 11, -9, 'step-end');
    const isEar = has(EAR_UP);
    const headR = MHR.cells.filter(([x, y]) => !isEar(x, y));
    // tail: rest, lift, curl, rest, sweep out, rest. 5 s cycle
    const tf = [
      loop('0%,8%{opacity:1}9%,30%{opacity:0}31%,52%{opacity:1}53%,64%{opacity:0}65%,100%{opacity:1}', 5, -0.5, 'step-end'),
      loop('0%,8%{opacity:0}9%,30%{opacity:1}31%,100%{opacity:0}', 5, -0.5, 'step-end'),
      loop('0%,52%{opacity:0}53%,64%{opacity:1}65%,100%{opacity:0}', 5, -0.5, 'step-end'),
    ];
    L.push(`<g>${part(MB.cells, [], MHR.cells.concat(MHF.cells, MHL.cells).map(([x, y]) => [x, y]))}`
      + TAIL.map((c, i) => `<g class="${tf[i]}">${part(c, [])}</g>`).join('')
      + `<g class="${notGlance}"><g class="${trR}">${part(headR, MHR.eyes)}<g class="${earUp}">${part(EAR_UP, [])}</g><g class="${earBack}">${part(EAR_BACK, [])}</g></g>`
      + `<g class="${trL}">${part(MHL.cells, MHL.eyes)}</g></g>`
      + `<g class="${glance}">${part(MHF.cells, MHF.eyes)}</g></g>`);
  }

  /* fireflies over the near grass, dusk into night */
  {
    const op = track((t) => { t = ((t % 1) + 1) % 1; return t > 0.6 && t < 0.95 ? smooth(0.6, 0.66, t) * (1 - smooth(0.86, 0.95, t)) : 0; }, 'opacity');
    defs.push(`<radialGradient id="fglow"><stop offset="0" stop-color="#ffe08a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd070" stop-opacity="0"/></radialGradient>`);
    const r = rng(4040); let ff = '';
    for (let i = 0; i < 16; i++) {
      const x = 40 + Math.floor(r() * 150), y = 66 + Math.floor(r() * 18);
      if (Math.abs(x - MIMI_X - 10) < 14 && y < 70) continue;
      const dx = Math.round((r() - 0.5) * 10) * CW, dy = Math.round((r() - 0.5) * 6) * CW;
      const mv = loop(`0%{transform:translate(0,0)}33%{transform:translate(${dx}px,${-dy}px)}66%{transform:translate(${-dy}px,${dx / 2}px)}100%{transform:translate(0,0)}`, r2(14 + r() * 10), r2(-r() * 20), 'ease-in-out');
      const pulse = loop('0%,100%{opacity:0}30%,55%{opacity:1}', r2(3.5 + r() * 3), r2(-r() * 6), 'ease-in-out');
      ff += `<g class="${mv}"><g class="${pulse}"><circle cx="${x * CW + 2}" cy="${y * CW + 2}" r="11" fill="url(#fglow)"/>${P([[x, y]], '', ' fill="#ffe7a0"')}</g></g>`;
    }
    L.push(`<g class="${op}">${ff}</g>`);
  }

  const line = theme === 'light' ? '#ddd6c8' : '#262320';
  const title = 'A day at the lake, with Mimi the cat watching';
  const desc = 'An animated pixel-art landscape that runs through one full day on a slow loop, opening at golden hour. Light rays fan out from a low copper sun, the hills and lake turn warm, the sun sets, fireflies drift over the grass at dusk, a shooting star crosses the night under a rising moon, and morning brings a clear blue sky. Clouds drift, the lake shimmers with the mirrored sky and hills, grass sways, and smoke curls from a small cabin whose window glows after dark. Mimi, a small dark cat, sits on the near hill, swishing her tail, flicking an ear, blinking slowly and turning her head toward the sunset, the moon, or you.';

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="ttl dsc">
<title id="ttl">${title}</title><desc id="dsc">${desc}</desc>
<style><![CDATA[
path,rect,g,use{will-change:auto}
${css.join('\n')}
@media (prefers-reduced-motion:reduce){*{animation-play-state:paused!important}}
]]></style>
<defs>${defs.join('')}<clipPath id="plate"><rect width="${W}" height="${H}" rx="6"/></clipPath></defs>
<g clip-path="url(#plate)" shape-rendering="crispEdges">${L.join('\n')}</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="6" fill="none" stroke="${line}"/>
</svg>
`;
}

const outDir = process.env.OUT ? new URL(process.env.OUT.replace(/\/?$/, '/'), new URL(`file://${process.cwd()}/`)) : new URL('assets/', ROOT);
mkdirSync(outDir, { recursive: true });
const suffix = process.env.OUT ? `-${String(OFFSET).padStart(3, '0')}` : '';
for (const theme of ['dark', 'light']) {
  const svg = build(theme);
  writeFileSync(new URL(`scenery-${theme}${suffix}.svg`, outDir), svg);
  if (!process.env.OUT) console.log(`scenery-${theme}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
}
