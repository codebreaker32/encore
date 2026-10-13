// Two host-mode cases from the black-screen hunt (2026-10-13), on the box:
//  1. the WebView resized after load (880×495 css, then 1018×541): after 2.5 s, any flat page-background band at
//     each edge (it was 13% right and 7% bottom in the arena);
//  2. a page loaded mid-set (live and a wide before ready): where the camera is in the first second after ready (it
//     sat at the origin, under the floor, for 4.5-6.5 s).
//   node resizecheck.mjs <page url without query> [venue=arena]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue = 'arena'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const bands = (page) => page.screenshot().then((png) => page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; const g = k.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, k.width, k.height).data, W = k.width, H = k.height;
  const bg = (i) => Math.abs(d[i] - 7) <= 2 && Math.abs(d[i + 1] - 6) <= 2 && Math.abs(d[i + 2] - 10) <= 2;
  const col = (x) => { for (let y = 0; y < H; y += 6) if (!bg((y * W + x) * 4)) return false; return true; };
  const row = (y) => { for (let x = 0; x < W; x += 6) if (!bg((y * W + x) * 4)) return false; return true; };
  let r = 0; while (r < W && col(W - 1 - r)) r++;
  let b = 0; while (b < H && row(H - 1 - b)) b++;
  return { right: r, bottom: b, px: [W, H] };
}, png.toString('base64')));
try {
  const q = `?preset=tv&host=1&venue=${venue}&hud=0&debug=1`;
  { // 1. resized after load
    const page = await browser.newPage({ viewport: { width: 880, height: 495 }, deviceScaleFactor: 1.33125 });
    await page.goto(base + q, { timeout: 300000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 300000 });
    await page.setViewportSize({ width: 1018, height: 541 });
    await page.waitForTimeout(2500);
    console.log(JSON.stringify({ case: 'resized 880x495 to 1018x541', venue, ...(await bands(page)) }));
    await page.close();
  }
  { // 2. loaded mid-set
    const page = await browser.newPage({ viewport: { width: 962, height: 541 }, deviceScaleFactor: 1.33125 });
    await page.goto(base + q, { timeout: 300000, waitUntil: 'commit' });
    await page.waitForFunction(() => typeof window.postMessage === 'function' && document.body, null, { timeout: 60000 });
    const post = (m) => page.evaluate((x) => window.postMessage(JSON.stringify(x), '*'), m);
    await post({ type: 'mode', mode: 'live' });
    await post({ type: 'shot', kind: 'wide' });
    await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__camera, null, { timeout: 300000 });
    const ys = [];
    for (let i = 0; i < 5; i++) { ys.push(await page.evaluate(() => +window.__camera.position.y.toFixed(2))); await page.waitForTimeout(200); }
    console.log(JSON.stringify({ case: 'loaded mid-set', venue, cameraY: ys }));
    await page.close();
  }
} finally { await browser.close(); }
