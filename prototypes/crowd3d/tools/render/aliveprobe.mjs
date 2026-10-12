// How much of the frame is a living crowd: the share of pixels where crowd geometry is visible (window.__crowdMask)
// and the frame's display value there is above a floor (0.06 by default). The arena's wide shots must keep at least
// 0.40 (the user: "keep at least 2/5th of screen alive"). On the box, in capture mode, DOM overlays hidden.
//   node aliveprobe.mjs <url with &capture=1> <t> <out prefix> [floor=0.06]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, tS, out, floorS = '0.06'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => window.__renderAt, null, { timeout: 240000 });
  await page.addStyleTag({ content: '.tv > *:not(canvas) { visibility: hidden !important; }' });
  const t = +tS;
  await page.evaluate((t) => { window.__renderAt(t - 0.2); window.__renderAt(t); }, t);
  const a = await page.screenshot({ path: `${out}-frame.png` });
  await page.evaluate((t) => { window.__crowdMask(true); window.__renderAt(t); }, t);
  const b = await page.screenshot({ path: `${out}-mask.png` });
  const r = await page.evaluate(async ({ a, b, floor }) => {
    const load = async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; const g = k.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, k.width, k.height).data; };
    const A = await load(a), B = await load(b);
    let crowd = 0, alive = 0, n = A.length / 4;
    for (let i = 0; i < A.length; i += 4) {
      if (B[i] < 128) continue;
      crowd++;
      if ((0.2126 * A[i] + 0.7152 * A[i + 1] + 0.0722 * A[i + 2]) / 255 > floor) alive++;
    }
    return { crowd: +(crowd / n).toFixed(3), alive: +(alive / n).toFixed(3) };
  }, { a: a.toString('base64'), b: b.toString('base64'), floor: +floorS });
  console.log(JSON.stringify(r));
} finally { await browser.close(); }
