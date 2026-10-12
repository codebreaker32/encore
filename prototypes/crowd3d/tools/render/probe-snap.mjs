// What a `snap` costs the page's main thread (on the box): main-thread stalls with and without snaps, the time spent
// in each canvas and WebGL call the snapshot makes, and when its JPEG is ready. OUT=<prefix> saves each JPEG.
//   node probe-snap.mjs <url> [seconds per phase=12] [snaps=3]
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url = 'http://localhost:8091/index.html?host=1', phaseS = '12', nSnaps = '3'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => {
    window.__calls = [];
    window.__stalls = [];
    const t0 = performance.now();
    const at = () => +((performance.now() - t0) / 1000).toFixed(2);
    const wrap = (proto, name) => {
      const f = proto[name];
      proto[name] = function (...a) { const s = performance.now(); const r = f.apply(this, a); window.__calls.push({ at: at(), name, ms: +(performance.now() - s).toFixed(1) }); return r; };
    };
    wrap(CanvasRenderingContext2D.prototype, 'drawImage');
    wrap(CanvasRenderingContext2D.prototype, 'putImageData');
    wrap(HTMLCanvasElement.prototype, 'toDataURL');
    for (const n of ['blitFramebuffer', 'readPixels', 'getBufferSubData', 'fenceSync', 'clientWaitSync']) wrap(WebGL2RenderingContext.prototype, n);
    // the asynchronous path: when its JPEG is ready, and the JPEG itself
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
      const s = performance.now();
      return toBlob.call(this, (blob) => {
        window.__calls.push({ at: at(), name: 'toBlob→jpeg', ms: +(performance.now() - s).toFixed(1), bytes: blob && blob.size });
        if (blob) { const fr = new FileReader(); fr.onload = () => { window.__thumb = fr.result; }; fr.readAsDataURL(blob); }
        cb(blob);
      }, ...a);
    };
    let last = performance.now();
    setInterval(() => { const p = performance.now(); if (p - last > 150) window.__stalls.push({ at: at(), ms: Math.round(p - last) }); last = p; }, 50);
    // frames per second of the page's own loop
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  });
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  const mark = async (label) => {
    const r = await page.evaluate(() => { const o = { frames: window.__frames, stalls: window.__stalls.splice(0), calls: window.__calls.splice(0), thumb: window.__thumb || null }; window.__frames = 0; window.__thumb = null; return o; });
    const worst = r.stalls.reduce((a, s) => Math.max(a, s.ms), 0);
    // the slowest call of each kind, and how many
    const by = {};
    for (const c of r.calls) { const b = (by[c.name] = by[c.name] || { n: 0, maxMs: 0 }); b.n++; b.maxMs = Math.max(b.maxMs, c.ms); if (c.bytes) b.bytes = c.bytes; }
    console.log(label.padEnd(10), 'frames', r.frames, 'stalls>150ms', r.stalls.length, 'worst', worst, 'ms', JSON.stringify(by));
    if (r.thumb && process.env.OUT) fs.writeFileSync(`${process.env.OUT}-${label.replace(/\W+/g, '')}.jpg`, Buffer.from(r.thumb.split(',')[1], 'base64'));
  };
  await page.evaluate(() => postMessage({ type: 'shot', kind: 'wide' }, '*'));
  await page.waitForTimeout(4000);
  await mark('warmup');
  await page.waitForTimeout(+phaseS * 1000);
  await mark('no snaps');
  for (let i = 0; i < +nSnaps; i++) {
    await page.evaluate((k) => postMessage({ type: 'snap', key: 'probe@' + k }, '*'), i);
    await page.waitForTimeout(+phaseS * 1000);
    await mark('snap ' + i);
  }
} finally { await browser.close(); }
