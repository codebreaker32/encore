// Every reaction setup of a venue, one frame each, in capture mode (director.js): for checking the coverage by eye,
// with each frame's mean luma (0..1) and its share of near-black pixels (luma < 0.03), DOM overlays hidden.
// &state= in the extra query picks the state (laugh by default); LUMA=1 measures the frames.
//   node setupsheet.mjs <base url, e.g. http://localhost:8092/index.html> <venue> <outdir> [t=1.3] [extra query]
// Writes <outdir>/<venue>-<i>.png (DOM overlays hidden) and <outdir>/<venue>.json (each setup's label, size, light,
// pose, and the draw calls and triangles of its frame).
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, outdir, tS = '1.3', extra = ''] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(`${base}?preset=tv&venue=${venue}&capture=1&shot=close&s=0.8&hud=0${extra.includes('state=') ? '' : '&state=laugh'}${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => window.__renderAt, null, { timeout: 240000 });
  await page.evaluate(() => { window.__renderAt(0.1); window.__renderAt(0.2); });
  await page.waitForFunction(() => window.__closes, null, { timeout: 60000 });
  await page.addStyleTag({ content: '.tv > *:not(canvas), #cap, #hud { visibility: hidden !important; }' });
  const t = +tS;
  const info = await page.evaluate(() => window.__closes());
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  const out = [];
  for (let i = -1; i < info.setups.length; i++) {
    if (only && !only.includes(i)) continue;
    const r = await page.evaluate(({ i, t }) => { window.__cutTo(i); window.__renderAt(t - 0.1); const s = window.__renderAt(t); return { ...s, shot: window.__shot ? window.__shot() : null }; }, { i, t });
    const png = await page.screenshot({ path: `${outdir}/${venue}-${i < 0 ? 'wide' : i}.png` });
    const luma = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; const g = k.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, k.width, k.height).data; let s = 0, dark = 0, n = 0;
      for (let p = 0; p < d.length; p += 8) { const L = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255; s += L; if (L < 0.03) dark++; n++; }
      return { mean: +(s / n).toFixed(3), nearBlack: +(dark / n).toFixed(3) };
    }, png.toString('base64'));
    out.push({ i, label: i < 0 ? 'wide' : info.setups[i].label, size: i < 0 ? 'wide' : info.setups[i].size, lit: i < 0 ? 'wide' : info.setups[i].lit, pos: i < 0 ? null : info.setups[i].pos, look: i < 0 ? null : info.setups[i].look, calls: r.calls, tris: r.tris, ...luma });
  }
  // the brightness gate: no reaction setup darker than the venue's own wide (the black-screen hunt, 2026-10-13)
  const wide = out.find((o) => o.i < 0);
  // (within 10% of the wide counts as level)
  const dark = wide ? out.filter((o) => o.i >= 0 && o.mean < 0.9 * wide.mean).map((o) => `${o.i} ${o.label} ${o.mean} < 0.9 × ${wide.mean}`) : [];
  fs.writeFileSync(`${outdir}/${venue}.json`, JSON.stringify({ setups: out, front: info.front, errors, gate: { wide: wide && wide.mean, dark } }, null, 1));
  console.log(JSON.stringify({ venue, n: info.setups.length, errors: errors.slice(0, 3), gate: wide ? (dark.length ? 'FAIL' : 'pass') : 'no wide', dark, shots: out.map((o) => `${o.i}:${o.size}/${o.lit}:${o.calls}c/${(o.tris / 1000).toFixed(0)}k luma ${o.mean} black ${o.nearBlack} ${o.label}`) }, null, 1));
} finally { await browser.close(); }
