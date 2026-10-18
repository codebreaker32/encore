// Arena spike v1 timings on the build box (SwiftShader: the GPU numbers are not the TV's; the CPU at 8× throttle stands
// in for the TV's A55s). Per variant: frame interval p50/p90, main-thread JS per frame (puppets, ring upload, render
// submission, gl.finish when &gpu=1), draws, triangles, floor vertices, texture MB, puppet CPU per tick.
//   node bench.mjs <base url> <rate> <frames> <variant query> [<variant query> ...]
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, rateS = '8', framesS = '150', ...variants] = process.argv.slice(2);
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : 0; };
for (const v of variants) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(`${base}?hud=0&${v}`, { timeout: 240000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
    const err = await page.evaluate(() => window.__spike.error);
    if (err) { console.log(JSON.stringify({ v, err })); continue; }
    await page.waitForTimeout(1500);
    const cdp = await page.context().newCDPSession(page);
    if (+rateS > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rateS });
    const pb = await page.evaluate(() => window.__spike.puppetBench(60, 3));
    const n0 = await page.evaluate(() => window.__spike.rec.n);
    await page.waitForFunction((n) => window.__spike.rec.n >= n, n0 + +framesS, { timeout: 900000, polling: 500 });
    const r = await page.evaluate((n0) => {
      const R = window.__spike.rec, n = Math.min(R.n, 2000), out = { dt: [], js: [], pup: [], up: [], ren: [], fin: [], ticks: [] };
      for (let k = n0; k < R.n; k++) { const i = k % 2000; for (const f of Object.keys(out)) out[f].push(R[f][i]); }
      return out;
    }, n0);
    if (+rateS > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const st = await page.evaluate(() => window.__spike.stats());
    const ticksPerFrame = r.ticks.reduce((a, b) => a + b, 0) / r.ticks.length;
    console.log(JSON.stringify({
      v, rate: +rateS, frames: r.dt.length,
      frameMs: { p50: q(r.dt, 0.5), p90: q(r.dt, 0.9), max: q(r.dt, 1) }, jsMs: { p50: q(r.js, 0.5), p90: q(r.js, 0.9) },
      puppetsMs: { p50: q(r.pup, 0.5), p90: q(r.pup, 0.9) }, uploadMs: { p50: q(r.up, 0.5), p90: q(r.up, 0.9), max: q(r.up, 1) }, renderSubmitMs: { p50: q(r.ren, 0.5), p90: q(r.ren, 0.9) }, gpuMs: { p50: q(r.fin, 0.5), p90: q(r.fin, 0.9) },
      ticksPerFrame: +ticksPerFrame.toFixed(2), puppetTick: pb,
      calls: st.calls, triangles: st.triangles, floorVerts: st.floorVerts, floorTris: st.floorTris, levels: st.levels.map((l) => [l.people, l.verts]), texMB: st.texMB, vertexBufferMB: +st.vertexBufferMB.toFixed(2), uploadBytesPerTick: st.ringUploadBytesPerTick, skipped: st.skipped,
    }));
  } finally { await browser.close(); }
}
