// Does the room fill the frame edge to edge? The page in host mode at the TV's viewport (962×541 css, dpr 1.33125 by
// default), the bill, a wide, then every reaction setup in turn (window.__cutTo); for each, the mean brightness of the
// rightmost and leftmost 4% of the canvas against the middle, how many columns at each side are flat page background
// (bandR, bandL: a band reads as > 0), and a screenshot.
//   node edgecheck.mjs <base url> <venue> <outdir> [w=962] [h=541] [dpr=1.33125]
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, outdir, w = '962', h = '541', dpr = '1.33125'] = process.argv.slice(2);
const q = base.includes('?') ? '&' : '?';
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
  await page.addInitScript(() => { window.__reports = []; window.ReactNativeWebView = { postMessage: (s) => window.__reports.push(JSON.parse(s)) }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}${q}preset=tv&host=1&venue=${venue}&hud=0`, { timeout: 240000 });
  const post = (m) => page.evaluate((x) => window.postMessage(JSON.stringify(x), '*'), m);
  const measure = async (name) => {
    const png = await page.screenshot({ path: `${outdir}/${venue}-${name}.png` });
    return page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; const g = k.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, k.width, k.height).data, W = k.width, H = k.height;
      const band = (x0, x1) => { let s = 0, c = 0; for (let y = 0; y < H; y += 2) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; c++; } return s / c / 3; };
      const e = Math.round(W * 0.04), mid = band(Math.round(W * 0.3), Math.round(W * 0.7));
      // the band: columns, from each side, where every sampled pixel is the page's own background (#07060a)
      const flat = (x) => { for (let y = 0; y < H; y += 6) { const i = (y * W + x) * 4; if (Math.abs(d[i] - 7) > 2 || Math.abs(d[i + 1] - 6) > 2 || Math.abs(d[i + 2] - 10) > 2) return false; } return true; };
      let bandR = 0; while (bandR < W && flat(W - 1 - bandR)) bandR++;
      let bandL = 0; while (bandL < W && flat(bandL)) bandL++;
      const flatRow = (y) => { for (let x = 0; x < W; x += 6) { const i = (y * W + x) * 4; if (Math.abs(d[i] - 7) > 2 || Math.abs(d[i + 1] - 6) > 2 || Math.abs(d[i + 2] - 10) > 2) return false; } return true; };
      let bandB = 0; while (bandB < H && flatRow(H - 1 - bandB)) bandB++;
      let bandT = 0; while (bandT < H && flatRow(bandT)) bandT++;
      return { bandR, bandL, bandB, bandT, right: +(band(W - e, W) / Math.max(1, mid)).toFixed(2), left: +(band(0, e) / Math.max(1, mid)).toFixed(2), mid: +mid.toFixed(1), px: [W, H] };
    }, png.toString('base64'));
  };
  // as the TV app does: the bill first (preview, the room shifted left by a view offset), then the set
  await post({ type: 'venue', venue, act: 'poetry' });
  await post({ type: 'mode', mode: 'preview' });
  await page.waitForFunction(() => window.__reports.some((r) => r.type === 'ready') && window.__cutTo && document.body.dataset.front === '1', null, { timeout: 240000 }); // (the front people stream in after the first frame)
  await page.waitForTimeout(1500);
  const bill = await measure('bill');
  await post({ type: 'mode', mode: 'live' });
  await post({ type: 'shot', kind: 'wide' });
  await page.waitForTimeout(1500);
  const ready = await page.evaluate(() => window.__reports.find((r) => r.type === 'ready'));
  const n = await page.evaluate(() => window.__closes().setups.length);
  const out = [{ shot: 'bill', ...bill }, { shot: 'wide', ...(await measure('wide')) }];
  for (let i = 0; i < n; i++) {
    const s = await page.evaluate((i) => window.__cutTo(i), i);
    await page.waitForTimeout(1200);
    out.push({ shot: i, label: s && s.setup, ...(await measure(String(i))) });
  }
  await page.evaluate(() => window.__cutTo(-1));
  await post({ type: 'mode', mode: 'after' });
  await page.waitForTimeout(1500);
  out.push({ shot: 'after', ...(await measure('after')) });
  console.log(JSON.stringify({ venue, ready: ready && ready.view, errors: errors.slice(0, 3), out }));
} finally { await browser.close(); }
