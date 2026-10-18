// Arena spike v1: a frame strip for judging the motion. Six frame-exact renders 0.2 s apart (&still, renderAt), a row
// of 2× crops of the mid floor, and the motion probe (mean |Δ luma| inside the crowd mask between frames 0.2 s apart,
// 0-255, as the audit measured it), with a listening baseline.
//   node strip.mjs <page url (state=...)> <t0> <out.png> <title>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, t0S = '2.4', out = '/tmp/strip.png', title = 'Arena spike v1'] = process.argv.slice(2);
const t0 = +t0S, TS = [0, 1, 2, 3, 4, 5].map((k) => +(t0 + 0.2 * k).toFixed(2));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1400 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${url}&still&hud=0&t=${t0}`, { timeout: 240000 });
  await page.waitForFunction(() => window.__spike && window.__spike.ready, null, { timeout: 240000 });
  const res = await page.evaluate(async ({ TS, title, base }) => {
    const S = window.__spike, cv = document.getElementById('c');
    const grab = (t) => { S.renderAt(t); return cv.toDataURL('image/png'); };
    const frames = TS.map(grab);
    const listen = [grab(base), grab(base + 0.2)];
    const mask = S.mask(TS[0]);
    const load = (u) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = u; });
    const imgs = await Promise.all(frames.map(load)), limgs = await Promise.all(listen.map(load));
    const W = 800, H = 450;
    const lum = (im) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, W, H).data, L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return L; };
    const probe = (a, b) => { const A = lum(a), B = lum(b); let s = 0, n = 0; for (let i = 0; i < W * H; i++) if (mask[i]) { s += Math.abs(A[i] - B[i]); n++; } return n ? s / n : 0; };
    const steps = []; for (let k = 1; k < imgs.length; k++) steps.push(+probe(imgs[k - 1], imgs[k]).toFixed(2));
    const listenProbe = +probe(limgs[0], limgs[1]).toFixed(2);
    const crowdShare = mask.reduce((a, b) => a + b, 0) / (W * H);
    // composite: header, 3×2 frames, a row of 2× crops of the mid floor
    const CW = 2400, HEAD = 64, CROP = { x: 300, y: 250, w: 200, h: 112 }, CH = HEAD + 2 * H + 30 + CROP.h * 2 + 40;
    const c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d');
    g.fillStyle = '#0b0b10'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = '#e8e2d4'; g.font = '600 26px sans-serif'; g.fillText(title, 20, 38);
    g.fillStyle = '#b9b2a2'; g.font = '18px sans-serif';
    g.fillText(`frames 0.2 s apart (t = ${TS.join(', ')} s) · motion probe per step ${steps.join(' / ')} (listening ${listenProbe}) · crowd ${(crowdShare * 100).toFixed(0)}% of frame`, 20, 58);
    imgs.forEach((im, k) => { const x = (k % 3) * W, y = HEAD + Math.floor(k / 3) * H; g.drawImage(im, x, y); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x + 8, y + 8, 120, 28); g.fillStyle = '#f2ead8'; g.font = '600 18px sans-serif'; g.fillText(`t = ${TS[k].toFixed(1)} s`, x + 16, y + 28); });
    const cy = HEAD + 2 * H + 30;
    g.fillStyle = '#b9b2a2'; g.font = '16px sans-serif'; g.fillText(`2× crops of the same patch (x ${CROP.x}-${CROP.x + CROP.w}, y ${CROP.y}-${CROP.y + CROP.h}), same six times`, 20, cy - 8);
    g.imageSmoothingEnabled = false;
    imgs.forEach((im, k) => g.drawImage(im, CROP.x, CROP.y, CROP.w, CROP.h, k * CROP.w * 2, cy, CROP.w * 2, CROP.h * 2));
    return { url: c.toDataURL('image/png'), steps, listenProbe, crowdShare, TS };
  }, { TS, title, base: 8.0 });
  fs.writeFileSync(out, Buffer.from(res.url.split(',')[1], 'base64'));
  delete res.url;
  console.log(JSON.stringify(res));
} finally { await browser.close(); }
