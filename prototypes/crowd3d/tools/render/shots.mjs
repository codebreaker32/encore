// Screenshots on the build box (never on the laptop): one browser, pages one after another.
//   node shots.mjs <outdir> <w> <h> <name=url> ...      (PW=path to playwright/index.mjs, default ~/tools/pw)
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [outdir, w, h, ...jobs] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'];
const browser = await chromium.launch({ args });
const all = {};
try {
  for (const job of jobs) {
    const i = job.indexOf('=');
    const name = job.slice(0, i), url = job.slice(i + 1);
    const page = await browser.newPage({ viewport: { width: +w, height: +h } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    const t0 = Date.now();
    await page.goto(url, { timeout: 240000 });
    try { await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 }); } catch { errors.push('TIMEOUT'); }
    if (process.env.WAIT) await page.waitForTimeout(+process.env.WAIT);
    const stats = await page.evaluate(() => Object.assign({}, window.__stats || {}, { hud: document.getElementById('hud')?.textContent }));
    await page.screenshot({ path: `${outdir}/${name}.png` });
    all[name] = { ...stats, errors, ms: Date.now() - t0 };
    console.log(name, JSON.stringify({ calls: stats.calls, tris: stats.triangles, tex: stats.texMB && +stats.texMB.toFixed(1), dl: stats.dlMB && +stats.dlMB.toFixed(2), front: stats.front, back: stats.back, sprites: stats.sprites, err: errors.slice(0, 3), breakdown: stats.breakdown }));
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`${outdir}/stats.json`, JSON.stringify(all, null, 1));
