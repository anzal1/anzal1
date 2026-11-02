/**
 * Preview frames the way GitHub shows them: the SVG inside an <img>.
 *   PW=/path/to/playwright node scripts/scene/shots.mjs
 * Writes frozen previews and PNG frames into .drafts/scene/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.PW || 'playwright');
const DIR = process.env.DIR || '.drafts/scene-v4', DUR = 90, START = 0.51;
mkdirSync(`${DIR}/frames`, { recursive: true });
const PHASES = (process.env.PHASES || '1open:0.51,2sunset:0.585,3dusk:0.65,4night:0.75,5shoot:0.8065,6dawn:0.125,7morning:0.2,8noon:0.32').split(',').map((s) => s.split(':'));
const browser = await chromium.launch();
const errors = [];
for (const [name, t] of PHASES) {
  const off = Math.round((((Number(t) - START) % 1 + 1) % 1) * DUR * 10) / 10;
  execFileSync('node', ['scripts/scene/build.mjs'], { env: { ...process.env, OFFSET: String(off), OUT: `${DIR}/svg` } });
  for (const theme of ['dark', 'light']) for (const w of [860, 390]) {
    const page = await browser.newPage({ viewport: { width: w + 32, height: Math.ceil(w * 360 / 860) + 32 }, deviceScaleFactor: 3, colorScheme: theme });
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const src = `svg/scenery-${theme}-${String(off).padStart(3, '0')}.svg`;
    writeFileSync(`${DIR}/view.html`, `<body style="margin:16px;background:${theme === 'dark' ? '#0d1117' : '#ffffff'}"><img id="i" src="${src}" style="width:${w}px;display:block"></body>`);
    await page.goto(`file://${process.cwd()}/${DIR}/view.html`);
    await page.waitForFunction(() => document.getElementById('i').complete);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${DIR}/frames/${theme}-${w}-${name}.png` });
    await page.close();
  }
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
