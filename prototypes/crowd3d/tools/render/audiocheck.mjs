// When does each sound pack finish decoding? The page in host mode as the TV opens it (file:// or http), polled for up
// to 120 s: seconds from load to the first frame and to each of sprite, pool, shouts, venue pack and voices decoded.
//   node audiocheck.mjs <page url without query> <venue>
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue = 'arena'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 962, height: 541 }, deviceScaleFactor: 1.33125 });
  await page.addInitScript(() => { window.__reports = []; window.ReactNativeWebView = { postMessage: (s) => window.__reports.push(JSON.parse(s)) }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const t0 = Date.now();
  await page.goto(`${base}?preset=tv&host=1&venue=${venue}&hud=0`, { timeout: 300000 });
  const seen = {};
  for (let i = 0; i < 240; i++) {
    const st = await page.evaluate(() => { const s = window.__sound; return { frame: document.body.dataset.ready === '1', front: document.body.dataset.front === '1', ctx: !!(s && s.ctx), state: s && s.ctx && s.ctx.state, sprite: !!(s && s.buf), pool: !!(s && s.pool), shouts: !!(s && s.shouts), vpack: !!(s && s.vpack), voices: !!(s && s.voices) }; }).catch(() => ({}));
    for (const [k, v] of Object.entries(st)) if (v === true && !(k in seen)) seen[k] = +((Date.now() - t0) / 1000).toFixed(1);
    if (st.voices && st.vpack) break;
    await page.waitForTimeout(500);
  }
  const load = await page.evaluate(() => window.__reports.filter((r) => r.type === 'load').map((r) => r.line));
  const audio = await page.evaluate(() => (window.__audioMB ? window.__audioMB() : null));
  console.log(JSON.stringify({ venue, secondsTo: seen, audio, audioLine: load.find((l) => /audio/.test(l)) || null, errors: errors.slice(0, 3) }));
} finally { await browser.close(); }
