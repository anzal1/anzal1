/**
 * Builds every animated plate, both themes, into assets/.
 *
 *   portrait-*.svg   the avatar as ASCII, wiping in row by row
 *   card-*.svg       a terminal that boots and types
 *   heatmap-*.svg    the contribution year, revealed as a diagonal wave
 *   scenery-*.svg    the hero scene, built by scene/build.mjs (a day on a loop)
 *
 * Rules this file is written against, all of them GitHub's:
 *
 *   1. GitHub strips <script> and sanitises inline style attributes, but it
 *      DOES render <img>-embedded SVG and run its SMIL/CSS animation. So all
 *      motion lives inside the file, as SMIL.
 *   2. CSS goes in CDATA. SVG is parsed as XML, so a bare '<' or '>' in a
 *      selector or comment aborts the whole document.
 *   3. Animated properties are declared with their FINAL value as the element
 *      attribute, and animated *from* the hidden state. A client that ignores
 *      SMIL therefore shows the finished plate rather than a blank box.
 *   4. No webfonts. Monospace metrics are pinned with textLength so the grid
 *      cannot drift between platforms.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const P = read('profile.json');
const CONTRIB = read('contributions.json');
const FEED = read('feed.json');
const FONTS = read('fonts.json');

/* JetBrains Mono is the portfolio's data face. GitHub's image proxy blocks
   external fetches from SVG, so the face is EMBEDDED as base64 woff2 in every
   plate (see scripts/fonts.py) — the same construction readme-typing-svg
   ships, so it is proven inside <img> on github.com. The stack below is only
   the fallback for renderers that ignore data-URI @font-face. */
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";
const DISPLAY = "'Space Grotesk','Helvetica Neue',Arial,sans-serif";
const SCRIPT = "'Sacramento',cursive";
const FONT_FACE = Object.entries(FONTS).flatMap(([family, weights]) =>
  Object.entries(weights).map(([w, b64]) =>
    `@font-face{font-family:'${family}';font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2')}`,
  )).join('\n');
const r2 = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/**
 * The palette is lifted verbatim from the portfolio's stylesheet
 * (portfolio-v2/src/styles/index.css @theme block), not approximated.
 *
 * The design rules that come with it, and that this file honours:
 *   - Warm near-black ground, never blue-black.
 *   - ONE accent: oxidised copper. No neon, no second hue for decoration.
 *   - `data` is a deliberate exception — a cooler sage reserved for data
 *     visualisation only, which is why the heatmap is sage and the copper is
 *     kept for the numbers beside it.
 *   - Light is the same palette inverted in lightness with the accent
 *     unchanged, so the identity holds across themes.
 */
const RAW = {
  dark: {
    base: '#0a0a0a', raise: '#131211', raise2: '#1b1917',
    line: '#262320', line2: '#332f2a',
    fg: '#f5f1ea', fg2: '#a8a29a', fg3: '#6f6a63',
    accent: '#c97a4e', accentDeep: '#8f4f2c', accentSoft: '#2a1d15',
    data: '#7f9a72',
  },
  light: {
    base: '#f4f1ea', raise: '#ebe6dc', raise2: '#e2dccf',
    line: '#ddd6c8', line2: '#cbc2b0',
    fg: '#17140f', fg2: '#55503f', fg3: '#837c68',
    accent: '#a2542c', accentDeep: '#7a3d1f', accentSoft: '#f0e3d6',
    data: '#566b4c',
  },
};

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Sample a multi-stop gradient at t in [0,1]. */
function sample(stops, t) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex2rgb(stops[i]);
  const b = hex2rgb(stops[i + 1]);
  return rgb2hex(a.map((v, k) => v + (b[k] - v) * f));
}

/** Build one theme: the raw tokens plus the two derived ramps. */
function theme(name) {
  const c = RAW[name];
  const dark = name === 'dark';

  /* The skyline runs the accent's own temperature ramp — ember to molten —
     because the muted sage read as dull at README size. Sage survives as a
     supporting tone in the language bar. */
  const heatStops = dark
    ? ['#2a1d15', '#6b3a1c', '#a85a2a', '#d98a4a', '#ffcf96']
    : ['#e4d4bd', '#d9a878', '#c07a3e', '#a2542c', '#6f3418'];

  return {
    name, ...c,
    /* Derived text tokens. fg3 measured 3.4:1 against the panel, so it is
       reserved for incidental captions; everything readable uses fg2. The
       light accent lands at 4.4:1, just under AA, so text switches to
       accent-deep, which is still a palette token rather than a new colour. */
    label: c.fg2,
    accentText: dark ? c.accent : c.accentDeep,
    /* Big display values: one step hotter than accentText, still AA. */
    value: dark ? '#e8a05e' : '#8f4f2c',
    spec: dark ? '#ffd9a8' : '#7a3d1f',
    langPalette: dark
      ? ['#e8a05e', '#c97a4e', '#8f4f2c', '#7f9a72', '#a8a29a']
      : ['#a2542c', '#c07a3e', '#7a3d1f', '#566b4c', '#6f6a63'],
    heat: heatStops,
  };
}

const THEMES = { dark: theme('dark'), light: theme('light') };

function doc({ w, h, title, desc, body }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="ttl dsc">
<title id="ttl">${esc(title)}</title><desc id="dsc">${esc(desc)}</desc>
<style><![CDATA[${FONT_FACE}]]></style>
${body}
</svg>
`;
}


/** Lighten/darken a hex towards white/black by f in [0,1]. */
function shade(hex, f) {
  const c = hex2rgb(hex);
  const to = f >= 0 ? [255, 255, 255] : [0, 0, 0];
  const k = Math.abs(f);
  return rgb2hex(c.map((v, i) => v + (to[i] - v) * k));
}

/* ------------------------------------------------------------- banner ---- */

/**
 * Figlet-style name banner for the terminal card, drawn from a 5x7 pixel
 * font as SVG rects. This replaced an ASCII-sampled photo: at README scale a
 * sampled image reads as noise (the avatar is a distant figure in a forest),
 * while letters from a pixel font are legible at any size by construction.
 */
const GLYPHS = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};

/** Dot positions for a string in the 5x7 font, in grid units. */
function glyphDots(text) {
  const dots = [];
  let cx = 0;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    g.forEach((row, ry) => {
      [...row].forEach((bit, rx) => { if (bit === '1') dots.push({ gx: cx + rx, gy: ry }); });
    });
    cx += 6;
  }
  return { dots, cols: cx - 1 };
}

/* --------------------------------------------------------- terminal card ---- */

function card(t) {
  const W = 860;
  const PAD = 22;
  const BAR = 32;
  const LH = 21;
  const FS = 13;
  const lines = P.lines;
  const linesTop = BAR + PAD + 14;
  const H = linesTop + lines.length * LH * 2 + LH + PAD;

  let y = linesTop;
  let out = '';
  lines.forEach(([cmd, val], i) => {
    const t0 = 0.35 + i * 0.42;
    // from="..." with the attribute already at its final value keeps the
    // no-SMIL fallback readable.
    const slide = (delay) =>
      `<animate attributeName="opacity" from="0" to="1" begin="${r2(delay)}s" dur="0.28s" fill="freeze"/>
       <animateTransform attributeName="transform" type="translate" from="-6 0" to="0 0" begin="${r2(delay)}s" dur="0.28s" fill="freeze"/>`;
    out += `<g opacity="1">${slide(t0)}
      <text x="${PAD}" y="${y}" font-family="${MONO}" font-size="${FS}" fill="${t.accentText}">$</text>
      <text x="${PAD + 14}" y="${y}" font-family="${MONO}" font-size="${FS}" fill="${t.fg}">${esc(cmd)}</text>
    </g>\n  `;
    y += LH;
    out += `<g opacity="1">${slide(t0 + 0.16)}
      <text x="${PAD + 14}" y="${y}" font-family="${MONO}" font-size="${FS}" fill="${t.label}">${esc(val)}</text>
    </g>\n  `;
    y += LH;
  });

  const cursorDelay = 0.35 + lines.length * 0.42;
  const body = `<style><![CDATA[
    /* The caret is the only forever-loop, and its first frame is visible. */
  ]]></style>
  <rect width="${W}" height="${H}" rx="8" fill="${t.raise}" stroke="${t.line}"/>
  <path d="M0 8a8 8 0 0 1 8-8h${W - 16}a8 8 0 0 1 8 8v${BAR - 8}H0Z" fill="${t.raise2}"/>
  <line x1="0" y1="${BAR}" x2="${W}" y2="${BAR}" stroke="${t.line}"/>
  ${[t.accentText, t.fg3, t.line2].map((c, i) => `<circle cx="${18 + i * 16}" cy="${BAR / 2}" r="5" fill="${c}"/>`).join('')}
  <text x="${W / 2}" y="${BAR / 2 + 4}" text-anchor="middle" font-family="${MONO}" font-size="11"
    fill="${t.label}">${esc(`${P.handle}@${P.host}: ~`)}</text>
  ${out}
  <text x="${PAD}" y="${y}" font-family="${MONO}" font-size="${FS}" fill="${t.accentText}">$</text>
  <rect x="${PAD + 15}" y="${r2(y - 9)}" width="7" height="11" fill="${t.accentText}">
    <animate attributeName="opacity" values="1;1;0;0" dur="1.1s" begin="${r2(cursorDelay)}s" repeatCount="indefinite"/>
  </rect>
`;
  return doc({ w: W, h: H, title: `${P.name}, terminal summary`,
    desc: lines.map(([c, v]) => `${c}: ${v}`).join('. '), body });
}

/* -------------------------------------------------------------- skyline ---- */

/**
 * The contribution year as a 3D skyline: every day is an extruded bar on a
 * dimetric grid, lit from the upper left, rising column by column as the year
 * builds left to right.
 *
 * There is no camera here — the projection is two fixed axis vectors:
 *   week axis  W = (14.5,  2.6)   left -> right, sloping gently down
 *   day axis   D = ( 6.2, -3.6)   receding up-right into the scene
 * A bar's base corner is c*W + r*D; extrusion is straight up in screen space.
 * Occlusion is the painter's algorithm: sort by base screen-y so nearer bars
 * (larger y) draw last. Three faces per bar — top lightened, front as-is,
 * right side darkened — is what sells the volume.
 */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function skyline(t) {
  const W = 860;
  const PAD = 22;
  const wx = 14.5, wy = 2.6;      // week axis
  const dx = 6.2,  dy = -3.6;     // day axis
  const HMAX = 46;

  const weeks = CONTRIB.weeks;
  const cols = weeks.length;
  const days = weeks.flat();
  const peak = Math.max(1, ...days.map((d) => d.n));
  const rise = (n) => (n <= 0 ? 0 : 3 + Math.pow(n / peak, 0.6) * HMAX);

  // Origin: leave room above for the tallest bar + the receding day axis.
  const X0 = PAD + 2;
  const Y0 = 44 + HMAX + 6 * -dy;
  const gridH = Y0 + (cols - 1) * wy + 16;
  const statsY = gridH + 34;
  const H = Math.ceil(statsY + 16);

  const px = (c, r) => X0 + c * wx + r * dx;
  const py = (c, r) => Y0 + c * wy + r * dy;
  const P = (x, y) => `${r2(x)},${r2(y)}`;

  const bars = [];
  for (let c = 0; c < cols; c++) {
    const week = weeks[c] ?? [];
    for (let r = 0; r < 7; r++) {
      const n = week.find((d) => d.w === r)?.n ?? 0;
      bars.push({ c, r, n, y: py(c, r) });
    }
  }
  bars.sort((a, b) => a.y - b.y);   // back to front

  // The three tallest towers get glow and embers; find them before drawing.
  const tallest = [...bars].sort((a, b) => b.n - a.n).slice(0, 3)
    .map(({ c, r, n }) => ({ x: px(c + 0.5, r + 0.5), y: py(c + 0.5, r + 0.5) - rise(n), n }));

  // One rise animation per WEEK, not per bar: 53 <g> wrappers instead of
  // 371 animated polygons keeps the file sane and reads as the year building.
  const perWeek = Array.from({ length: cols }, () => []);
  for (const bar of bars) {
    const { c, r, n } = bar;
    const h = rise(n);
    const base = sample(t.heat, n <= 0 ? 0 : 0.25 + 0.75 * Math.pow(n / peak, 0.6));
    const x0 = px(c, r),      y0 = py(c, r);
    const x1 = px(c + 1, r),  y1 = py(c + 1, r);
    const x2 = px(c + 1, r + 1), y2 = py(c + 1, r + 1);
    const x3 = px(c, r + 1),  y3 = py(c, r + 1);
    if (h === 0) {
      perWeek[c].push(`<polygon points="${P(x0,y0)} ${P(x1,y1)} ${P(x2,y2)} ${P(x3,y3)}" fill="${t.raise2}" opacity="0.7"/>`);
      continue;
    }
    perWeek[c].push(
      `<polygon points="${P(x0,y0)} ${P(x1,y1)} ${P(x1,y1-h)} ${P(x0,y0-h)}" fill="${shade(base,-0.28)}"/>` +   // front
      `<polygon points="${P(x1,y1)} ${P(x2,y2)} ${P(x2,y2-h)} ${P(x1,y1-h)}" fill="${shade(base,-0.5)}"/>` +    // right
      `<polygon points="${P(x0,y0-h)} ${P(x1,y1-h)} ${P(x2,y2-h)} ${P(x3,y3-h)}" fill="${shade(base,0.14)}"/>`  // top
    );
  }

  const city = perWeek.map((polys, c) => {
    const begin = r2(0.15 + c * 0.022);
    return `<g opacity="1">
    <animate attributeName="opacity" from="0" to="1" begin="${begin}s" dur="0.3s" fill="freeze"/>
    <animateTransform attributeName="transform" type="translate" from="0 12" to="0 0" begin="${begin}s" dur="0.3s" fill="freeze"/>
    ${polys.join('')}
  </g>`;
  }).join('\n  ');

  // Month marks along the FRONT edge. The day axis recedes up-right, so the
  // front row is r = 0, not r = 7 — labels at r = 7 end up behind the city
  // and the busy winter months bury them entirely.
  let marks = '', lastM = -1, lastC = -99;
  weeks.forEach((week, c) => {
    const d = week[0]?.date;
    if (!d) return;
    const m = new Date(`${d}T00:00:00Z`).getUTCMonth();
    if (Number.isNaN(m) || m === lastM) return;
    if (c < 1 || c - lastC < 4) { lastM = m; return; }
    lastM = m; lastC = c;
    marks += `<text x="${r2(px(c, -0.6))}" y="${r2(py(c, -0.6) + 14)}" font-family="${MONO}" font-size="9.5" letter-spacing="1" fill="${t.label}">${MONTHS[m]}</text>`;
  });

  const n = (v) => (v === null || v === undefined ? '—' : v.toLocaleString('en-US'));
  const stats = [
    ['CONTRIBUTIONS', n(CONTRIB.total)],
    ['LONGEST STREAK', CONTRIB.longest === null ? '—' : `${CONTRIB.longest}d`],
    ['CURRENT STREAK', CONTRIB.current === null ? '—' : `${CONTRIB.current}d`],
    ['PEAK DAY', n(peak)],
  ];
  const statRow = stats.map(([label, value], i) => {
    const x = r2(PAD + i * 200);
    return `<text x="${x}" y="${statsY}" font-family="${MONO}" font-size="10.5" letter-spacing="1.8" fill="${t.label}">${esc(label)}</text>
    <text x="${r2(x + 128)}" y="${statsY}" font-family="${DISPLAY}" font-size="14" font-weight="700" fill="${t.value}">${esc(value)}</text>`;
  }).join('\n  ');

  // Decorative layers. Everything here starts invisible and only appears
  // through animation, which is safe BECAUSE it is decoration: a frozen frame
  // still shows the complete, data-bearing skyline.
  const glow = tallest.length ? `<circle cx="${r2(tallest[0].x)}" cy="${r2(tallest[0].y)}" r="26"
    fill="${t.spec}" opacity="0.14" filter="url(#blur)">
    <animate attributeName="opacity" values="0.08;0.22;0.08" dur="3.2s" repeatCount="indefinite"/>
  </circle>` : '';

  const embers = tallest.flatMap(({ x, y }, ti) =>
    Array.from({ length: 3 }, (_, i) => {
      const drift = ((i * 37 + ti * 53) % 22) - 11;
      const dur = 2.6 + ((i * 3 + ti) % 5) * 0.35;
      const begin = r2(ti * 0.9 + i * 0.7);
      return `<circle cx="${r2(x + drift * 0.4)}" cy="${r2(y)}" r="${1.4 + (i % 2) * 0.7}" fill="${t.spec}" opacity="0">
      <animate attributeName="opacity" values="0;0.85;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="cy" values="${r2(y)};${r2(y - 34)}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
      <animate attributeName="cx" values="${r2(x + drift * 0.4)};${r2(x + drift)}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </circle>`;
    })).join('\n  ');

  const sweep = `<rect x="-220" y="40" width="150" height="${gridH}" fill="url(#sweepGrad)" opacity="0"
    transform="skewX(-18)">
    <animate attributeName="opacity" values="0;0.5;0" dur="6s" begin="1.6s" repeatCount="indefinite"/>
    <animate attributeName="x" values="-220;${W + 80}" dur="6s" begin="1.6s" repeatCount="indefinite"/>
  </rect>`;

  const body = `<defs>
    <filter id="blur" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>
    <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.spec}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${t.spec}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${t.spec}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="6" fill="${t.raise}" stroke="${t.line}"/>
  <rect x="${PAD}" y="26" width="9" height="9" fill="${t.accentText}"/>
  <text x="${PAD + 20}" y="35" font-family="${MONO}" font-size="11.5" letter-spacing="3.4" fill="${t.label}">A YEAR OF COMMITS</text>
  <text x="${W - PAD}" y="35" text-anchor="end" font-family="${MONO}" font-size="10" letter-spacing="1.3"
    fill="${t.label}" opacity="0.9">${CONTRIB.generated ? `REFRESHED ${CONTRIB.generated}` : 'AWAITING FIRST REFRESH'}</text>
  ${glow}
  ${city}
  ${embers}
  ${sweep}
  ${marks}
  <line x1="${PAD}" y1="${r2(statsY - 22)}" x2="${W - PAD}" y2="${r2(statsY - 22)}" stroke="${t.line}"/>
  ${statRow}
`;

  return doc({
    w: W, h: H,
    title: 'Contribution skyline — the last twelve months in 3D',
    desc: stats.map(([l, v]) => `${l}: ${v}`).join('. ') + '. Each day is an extruded bar on a dimetric grid; taller means more contributions.',
    body,
  });
}

/* ------------------------------------------------------------------ live ---- */

/**
 * The live dashboard: eight stat tiles, a language bar, and the last push,
 * all from data/feed.json. Absolute timestamps only — a relative "1h ago"
 * baked into a plate that redraws every six hours lies for most of its life.
 */
function live(t) {
  const W = 860;
  const PAD = 22;
  const H = 322;
  const COL = (W - PAD * 2) / 4;
  const staleSet = new Set(FEED.stale ?? []);
  const dash = '—';

  const fmtTs = (iso) => {
    if (!iso) return dash;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return dash;
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
  };
  const monthYear = (raw) => {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return dash;
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  const num = (v) => (v === null || v === undefined ? dash : v.toLocaleString('en-US'));

  const a = FEED.activity;
  const gh = FEED.github;
  const site = FEED.site;
  const post = FEED.latestPost;

  const rows = [
    [
      { key: 'activity', label: 'ACTIVITY · 7D', value: a ? String(a.total) : dash, spark: a?.daily ?? null },
      { key: 'activity', label: 'CURRENT STREAK', value: FEED.streak == null ? dash : `${FEED.streak}d`,
        sub: FEED.total ? `${num(FEED.total)} in the last year` : '' },
      { key: 'github', label: 'STARS EARNED', value: gh ? `★ ${num(gh.stars)}` : dash, sub: 'own repos, no forks' },
      { key: 'github', label: 'FOLLOWERS', value: num(gh?.followers), sub: `${num(gh?.repos)} public repos` },
    ],
    [
      { key: 'activity', label: 'LONGEST STREAK', value: CONTRIB.longest == null ? dash : `${CONTRIB.longest}d`, sub: 'this year' },
      { key: 'lastPush', label: 'LAST PUSH', value: FEED.lastPush ? FEED.lastPush.repo.slice(0, 15) : dash,
        sub: FEED.lastPush ? fmtTs(FEED.lastPush.at) : '' },
      { key: 'latestPost', label: 'LATEST POST', value: post ? monthYear(post.at) : dash, sub: post?.title ?? '' },
      { key: 'site', label: 'PORTFOLIO', value: site ? (site.status === 200 ? 'UP' : String(site.status)) : dash,
        sub: site ? `${site.status} · ${site.ms} ms` : '' },
    ],
  ];

  let tiles = '';
  rows.forEach((row, ry) => {
    const labelY = 66 + ry * 76;
    const valueY = labelY + 28;
    const subY = valueY + 17;
    row.forEach((tile, i) => {
      const x = r2(PAD + COL * i);
      const dim = staleSet.has(tile.key);
      const delay = r2(0.2 + (ry * 4 + i) * 0.09);
      tiles += `<g opacity="1"><animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur="0.3s" fill="freeze"/>
      <text x="${x}" y="${labelY}" font-family="${MONO}" font-size="10" letter-spacing="1.9" fill="${t.label}">${esc(tile.label)}${dim ? ' · CACHED' : ''}</text>
      <text x="${x}" y="${valueY}" font-family="${DISPLAY}" font-size="22" font-weight="700" fill="${t.value}" opacity="${dim ? 0.55 : 1}">${esc(tile.value)}</text>`;
      if (tile.sub) {
        const maxChars = Math.floor((COL - 12) / 5.6);
        const sub = tile.sub.length > maxChars ? tile.sub.slice(0, maxChars - 1) + '…' : tile.sub;
        tiles += `\n      <text x="${x}" y="${subY}" font-family="${MONO}" font-size="9.5" fill="${t.label}" opacity="0.85">${esc(sub)}</text>`;
      }
      if (tile.spark) {
        const peak = Math.max(1, ...tile.spark);
        const bw = r2((COL - 26) / tile.spark.length - 2.5);
        const base = subY + 1;
        tiles += '\n      ' + tile.spark.map((n, k) => {
          const h = r2(Math.max(1.5, (n / peak) * 14));
          return `<rect x="${r2(x + k * (bw + 2.5))}" y="${r2(base - h)}" width="${bw}" height="${h}" rx="1" fill="${n ? t.value : t.line2}" opacity="${n ? 0.9 : 0.6}">
        <animate attributeName="height" from="0" to="${h}" begin="${r2(delay + 0.1 + k * 0.04)}s" dur="0.26s" fill="freeze"/>
        <animate attributeName="y" from="${base}" to="${r2(base - h)}" begin="${r2(delay + 0.1 + k * 0.04)}s" dur="0.26s" fill="freeze"/>
      </rect>`;
        }).join('\n      ');
      }
      tiles += '\n    </g>\n  ';
    });
  });

  /* Language bar: one stacked strip, segments growing left to right. The
     final geometry is the resting state; the grow animation starts from it
     collapsed, so a frozen frame shows the finished bar. */
  let langBlock = '';
  if (gh?.languages?.length) {
    const total = gh.languages.reduce((n, l) => n + l.count, 0);
    const barY = 232;
    const barW = W - PAD * 2;
    let cx = PAD;
    let lx = PAD;                          // legend flows independently of the
    const segs = [];                       // segments: anchoring labels to tiny
    const labels = [];                     // slices stacks them on each other.
    gh.languages.forEach((l, i) => {
      const w = r2((l.count / total) * barW);
      const color = t.langPalette[i % t.langPalette.length];
      segs.push(`<rect x="${r2(cx)}" y="${barY}" width="${w}" height="12" fill="${color}">
      <animate attributeName="width" from="0" to="${w}" begin="${r2(0.9 + i * 0.12)}s" dur="0.4s" fill="freeze"/>
    </rect>`);
      const text = `${l.name} ${Math.round((l.count / total) * 100)}%`;
      labels.push(`<circle cx="${r2(lx + 4)}" cy="${barY + 32}" r="3.5" fill="${color}"/>
    <text x="${r2(lx + 13)}" y="${barY + 36}" font-family="${MONO}" font-size="10" fill="${t.label}">${esc(text)}</text>`);
      lx += 13 + text.length * 6.2 + 22;   // advance by measured width + gap
      cx += w;
    });
    langBlock = `<text x="${PAD}" y="${barY - 12}" font-family="${MONO}" font-size="10" letter-spacing="1.9" fill="${t.label}">LANGUAGES · BY REPO${staleSet.has('github') ? ' · CACHED' : ''}</text>
  <g clip-path="inset(0 round 3)">${segs.join('')}</g>
  ${labels.join('\n  ')}`;
  }

  return doc({
    w: W, h: H,
    title: 'Live dashboard',
    desc: rows.flat().map((x) => `${x.label}: ${x.value}`).join('. ') + `. Refreshed ${fmtTs(FEED.refreshedAt)}.`,
    body: `<rect width="${W}" height="${H}" rx="6" fill="${t.raise}" stroke="${t.line}"/>
  <circle cx="${PAD + 4}" cy="30" r="4" fill="${t.value}">
    <animate attributeName="opacity" values="1;0.25;1" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${PAD + 4}" cy="30" r="9" fill="none" stroke="${t.value}" stroke-width="1" opacity="0">
    <animate attributeName="opacity" values="0.5;0" dur="2.4s" repeatCount="indefinite"/>
    <animate attributeName="r" values="5;12" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <text x="${PAD + 20}" y="34" font-family="${MONO}" font-size="11.5" letter-spacing="3.4" fill="${t.label}">LIVE</text>
  <text x="${W - PAD}" y="34" text-anchor="end" font-family="${MONO}" font-size="10" letter-spacing="1.3"
    fill="${t.label}" opacity="0.9">REFRESHED ${esc(fmtTs(FEED.refreshedAt))}</text>
  <line x1="${PAD}" y1="46" x2="${W - PAD}" y2="46" stroke="${t.line}"/>
  ${tiles}
  <line x1="${PAD}" y1="202" x2="${W - PAD}" y2="202" stroke="${t.line}"/>
  ${langBlock}
`,
  });
}


/* -------------------------------------------------------------- journey ---- */

/**
 * The all-time record as PIXEL columns — one column per month since the
 * account existed, quantised to the same cell language as the header scene.
 * Columns rise left to right in discrete steps, the way pixel art moves.
 */
function journey(t) {
  const W = 860;
  const PAD = 22;
  const TOP = 58;
  const BASE = 172;
  const H = 218;
  const CELL = 5;
  const J = CONTRIB.journey;
  if (!J?.monthly) {
    return doc({ w: W, h: 60, title: 'Journey pending', desc: 'All-time data not yet fetched.',
      body: `<rect width="${W}" height="60" rx="6" fill="${t.raise}" stroke="${t.line}"/>
  <text x="${W / 2}" y="34" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${t.label}">all-time record — drawn on the first refresh</text>` });
  }

  const keys = Object.keys(J.monthly).sort();
  const [y0, m0] = keys[0].split('-').map(Number);
  const now = new Date(CONTRIB.generated ?? Date.now());
  const yN = now.getUTCFullYear(), mN = now.getUTCMonth() + 1;
  const months = [];
  for (let y = y0, m = m0; y < yN || (y === yN && m <= mN); m === 12 ? (y++, m = 1) : m++) {
    months.push({ key: `${y}-${String(m).padStart(2, '0')}`, y, m, n: J.monthly[`${y}-${String(m).padStart(2, '0')}`] ?? 0 });
  }
  const peak = Math.max(1, ...months.map((x) => x.n));
  const colW = Math.floor((W - PAD * 2) / months.length);
  const X = (i) => PAD + i * colW;
  const maxCells = Math.floor((BASE - TOP) / CELL);

  const pk = months.reduce((a2, b2, i) => (b2.n > months[a2].n ? i : a2), 0);

  const cols = months.map((mo, i) => {
    const cells = mo.n === 0 ? 0 : Math.max(1, Math.round(Math.pow(mo.n / peak, 0.7) * maxCells));
    if (!cells) return '';
    const h = cells * CELL;
    const tone = sample(t.heat, 0.3 + 0.7 * Math.pow(mo.n / peak, 0.7));
    const capY = BASE - h;
    const begin = r2(0.15 + i * 0.02);
    // Discrete two-step rise: pixel art snaps, it does not glide.
    return `<g opacity="1"><animate attributeName="opacity" calcMode="discrete" values="0;1" keyTimes="0;1" begin="${begin}s" dur="0.05s" fill="freeze"/>
    <rect x="${X(i)}" y="${capY}" width="${colW - 2}" height="${h}" fill="${tone}" shape-rendering="crispEdges"/>
    <rect x="${X(i)}" y="${capY}" width="${colW - 2}" height="${CELL}" fill="${i === pk ? t.spec : shade(tone, 0.25)}" shape-rendering="crispEdges"/>
  </g>`;
  }).join('\n  ');

  const years = months.map((mo, i) => ({ ...mo, i })).filter((mo) => mo.m === 1);
  const rules = years.map((mo) =>
    `<line x1="${X(mo.i) - 1}" y1="${TOP - 6}" x2="${X(mo.i) - 1}" y2="${BASE + 4}" stroke="${t.line}" stroke-dasharray="2 4"/>
  <text x="${X(mo.i) + 4}" y="${BASE + 18}" font-family="${MONO}" font-size="10" letter-spacing="1" fill="${t.label}">${mo.y}</text>`).join('\n  ');

  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const body = `<rect width="${W}" height="${H}" rx="6" fill="${t.raise}" stroke="${t.line}"/>
  <rect x="${PAD}" y="26" width="9" height="9" fill="${t.accentText}"/>
  <text x="${PAD + 20}" y="35" font-family="${MONO}" font-size="11.5" letter-spacing="3.4" fill="${t.label}">EVERY MONTH ON RECORD</text>
  <text x="${W - PAD}" y="35" text-anchor="end" font-family="${DISPLAY}" font-size="13" letter-spacing="0.6"
    fill="${t.value}" font-weight="700">${J.allTime.toLocaleString('en-US')} CONTRIBUTIONS \u00b7 SINCE ${esc(J.since)}</text>
  ${rules}
  ${cols}
  <text x="${r2(Math.min(X(pk), W - PAD - 130))}" y="${r2(BASE - Math.max(1, Math.round(Math.pow(months[pk].n / peak, 0.7) * maxCells)) * CELL - 8)}" font-family="${MONO}" font-size="10"
    fill="${t.label}">peak ${months[pk].n.toLocaleString('en-US')} \u00b7 ${MN[months[pk].m - 1]} ${months[pk].y}</text>
`;
  return doc({ w: W, h: H, title: `Every month on record since ${J.since}`,
    desc: `${J.allTime} contributions since ${J.since} as pixel columns; peak month ${months[pk].key} with ${months[pk].n}.`, body });
}

/* ------------------------------------------------------------------ run ---- */

const out = new URL('../assets/', import.meta.url);
for (const t of Object.values(THEMES)) {
  writeFileSync(new URL(`card-${t.name}.svg`, out), card(t));
  writeFileSync(new URL(`skyline-${t.name}.svg`, out), skyline(t));
  writeFileSync(new URL(`live-${t.name}.svg`, out), live(t));
  writeFileSync(new URL(`journey-${t.name}.svg`, out), journey(t));
  console.log(`built card/skyline/live/journey — ${t.name}`);
}

/* The hero scene has its own generator. It runs one full day on a loop
   inside the SVG, so it is the same file at every refresh: time-independent,
   no clock, no place. Rebuilt here so one command still draws everything. */
execFileSync(process.execPath, [fileURLToPath(new URL('scene/build.mjs', import.meta.url))], { stdio: 'inherit' });
