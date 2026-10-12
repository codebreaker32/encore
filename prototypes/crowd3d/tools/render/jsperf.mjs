// Page JS per frame under a CPU throttle (the TV's cores are ~15–20× slower than the box's), on the build box:
// times every animation-frame callback of the live page (behaviour + three.js render submission; the GPU work is
// in another process) and the share inside Person.update, then prints p50 / p90 / max in milliseconds.
//   node jsperf.mjs <url (add &debug=1&fps=0)> [rate=16] [frames=90]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, rateS = '16', framesS = '90'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__fts = []; window.__pts = []; window.__rts = []; window.__its = []; window.__pt = 0; window.__rt = 0; window.__it = 0; window.__on = false;
    window.requestAnimationFrame = (cb) => raf((t) => {
      window.__pt = 0; window.__rt = 0; window.__it = 0;
      const a = performance.now();
      cb(t);
      if (window.__on) { window.__fts.push(performance.now() - a); window.__pts.push(window.__pt); window.__rts.push(window.__rt); window.__its.push(window.__it); }
    });
  });
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__people && window.__people.length, null, { timeout: 240000 });
  await page.evaluate(() => {
    const P = Object.getPrototypeOf(window.__people[0]), u = P.update;
    P.update = function (...a) { const t0 = performance.now(); const r = u.apply(this, a); window.__pt += performance.now() - t0; return r; };
    // three.js render(): from the scene's before-render hook to its after-render hook
    let r0 = 0;
    window.__scene.onBeforeRender = () => { r0 = performance.now(); };
    window.__scene.onAfterRender = () => { window.__rt += performance.now() - r0; };
    const I = window.__InstancedCrowd && window.__InstancedCrowd.prototype, iu = I && I.update;
    if (iu) I.update = function (...a) { const t0 = performance.now(); const r = iu.apply(this, a); window.__it += performance.now() - t0; return r; };
  });
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rateS });
  await page.evaluate(() => { window.__on = true; });
  await page.waitForFunction((n) => window.__fts.length >= n, +framesS, { timeout: 600000, polling: 1000 });
  const { fts, pts, rts, its } = await page.evaluate(() => ({ fts: window.__fts.slice(), pts: window.__pts.slice(), rts: window.__rts.slice(), its: window.__its.slice() }));
  const f = fts.map((x, i) => [x, pts[i], rts[i], its[i]]).filter(([x]) => x > 0.2 * +rateS); // drop callbacks the fps cap skipped
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  const tot = f.map(([x]) => x), ppl = f.map(([, y]) => y), ren = f.map(([, , z]) => z), ins = f.map(([, , , w]) => w), rest = f.map(([x, y, z, w]) => x - y - z - w);
  const pq = (a) => `p50 ${q(a, 0.5).toFixed(1)} p90 ${q(a, 0.9).toFixed(1)}`;
  console.log(`frames ${f.length} · rate ${rateS}× · page JS ${pq(tot)} max ${Math.max(...tot).toFixed(1)} ms · Person.update ${pq(ppl)} · instances ${pq(ins)} · render ${pq(ren)} · rest ${pq(rest)} ms`);
} finally { await browser.close(); }
