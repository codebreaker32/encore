// How many layers each pixel of a frame pays for: the page with &ab=overdraw (every surface a flat 1/16 grey, added
// up, no depth test), one frame in capture mode, DOM overlays hidden; prints the mean and the share of the frame at
// 1, 2-3, 4-7 and 8+ layers, and saves the frame (brighter = more layers).
//   node overdraw.mjs <url with &capture=1&ab=overdraw,nopost> <out.png> [t=1]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, out, tS = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => window.__renderAt, null, { timeout: 240000 });
  await page.addStyleTag({ content: '.tv > *:not(canvas), #cap, #hud { visibility: hidden !important; }' });
  await page.evaluate((t) => { window.__renderAt(t - 0.1); window.__renderAt(t); }, +tS);
  const png = await page.screenshot({ path: out });
  const r = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; const g = k.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, k.width, k.height).data, n = d.length / 4, bins = [0, 0, 0, 0, 0];
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) { const L = Math.round((d[i + 1] / 255) * 16); sum += L; bins[L === 0 ? 0 : L === 1 ? 1 : L < 4 ? 2 : L < 8 ? 3 : 4]++; }
    return { mean: +(sum / n).toFixed(2), none: +(bins[0] / n).toFixed(3), one: +(bins[1] / n).toFixed(3), two3: +(bins[2] / n).toFixed(3), four7: +(bins[3] / n).toFixed(3), eightPlus: +(bins[4] / n).toFixed(3) };
  }, png.toString('base64'));
  console.log(JSON.stringify({ ...r, errors: errors.slice(0, 3) }));
} finally { await browser.close(); }
