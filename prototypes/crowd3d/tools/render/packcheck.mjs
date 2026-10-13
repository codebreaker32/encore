// The packed page (tools/pack.mjs --tv) opened from file:// as the TV opens it, every venue in turn: console errors,
// page errors and the ready flag, on the box.
//   node packcheck.mjs <packed dir> [seconds per venue=25]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [dir, secs = '25'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const venue of ['club', 'openmic', 'theatre', 'arena']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`file://${dir}/index.html?preset=tv&venue=${venue}&state=cycle&hud=0`, { timeout: 240000 });
    let ready = false;
    try { await page.waitForFunction(() => document.body.dataset.ready === '1' && document.body.dataset.front === '1', null, { timeout: 240000 }); ready = true; } catch { /* reported */ }
    await page.waitForTimeout(+secs * 1000);
    const st = await page.evaluate(() => ({ calls: window.__stats && window.__stats.calls, tris: window.__stats && window.__stats.triangles, err: window.__stats && window.__stats.error, voices: !!(window.__sound && window.__sound.voices), vpack: !!(window.__sound && window.__sound.vpack) }));
    console.log(JSON.stringify({ venue, ready, ...st, errors: errors.slice(0, 6) }));
    await page.close();
  }
} finally { await browser.close(); }
