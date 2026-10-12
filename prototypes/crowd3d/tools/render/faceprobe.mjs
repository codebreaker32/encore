// Lit faces by row: screenshots a still frame and reads the display value (Rec. 709 luma of the frame, 0..1, the
// false-colour view's measure) at each placed person's eye line, as the median of a 5×5 patch. Prints per row: the
// count, the median and the 90th percentile; the stage look wants rows 2+ at or below 0.08. On the box.
//   node faceprobe.mjs <still url> <out.png>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  await page.waitForTimeout(500);
  const pts = await page.evaluate(() => window.__faceProbe());
  // the screenshot (the drawing buffer isn't kept), decoded in the page; captions can cover a few front-row points
  const shot = await page.screenshot({ path: out });
  const px = await page.evaluate(async ({ pts, b64 }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const k = document.createElement('canvas'); k.width = img.width; k.height = img.height;
    const g = k.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, k.width, k.height).data;
    return pts.map((q) => {
      const x0 = Math.round(q.x), y0 = Math.round(q.y), v = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = Math.min(k.width - 1, Math.max(0, x0 + dx)), y = Math.min(k.height - 1, Math.max(0, y0 + dy)), i = (y * k.width + x) * 4;
        v.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
      }
      v.sort((a, b) => a - b);
      return { row: q.balcony ? 'balc' : q.row, l: v[12] };
    });
  }, { pts, b64: shot.toString('base64') });
  const by = {};
  for (const q of px) (by[q.row] = by[q.row] || []).push(q.l);
  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
  console.log(Object.entries(by).map(([r, a]) => `row ${r}: n ${a.length} median ${q(a, 0.5).toFixed(3)} p90 ${q(a, 0.9).toFixed(3)}`).join('\n'));
} finally { await browser.close(); }
