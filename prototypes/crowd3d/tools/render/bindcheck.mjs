// Sweeps every venue × preset × mode at several moments for anyone left in the bind pose (arms out), on the box.
// Skinned people are checked by their bones (window.__bindCheck); a frame per mode is saved to look at the instances.
//   node bindcheck.mjs <outdir>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [outdir = '/tmp/bind'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const TIMES = { preview: [1, 6, 14, 26, 40], listen: [3], after: [2, 8, 14, 22, 34, 48] };
let bad = 0;
try {
  for (const venue of ['club', 'theatre', 'openmic', 'arena']) for (const preset of ['tv', 'low']) for (const [mode, times] of Object.entries(TIMES)) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${process.env.BASE || "http://localhost:8091/index.html"}?capture=1&hud=0&preset=${preset}&venue=${venue}&state=${mode}`, { timeout: 240000 });
    await page.waitForFunction(() => typeof window.__renderAt === 'function', null, { timeout: 240000 });
    const found = [];
    for (const t of times) {
      // step up to t so the half-rate and traffic states are realistic
      for (let k = Math.max(0, t - 0.6); k <= t; k += 0.2) await page.evaluate((x) => window.__renderAt(x), k);
      const res = await page.evaluate(() => window.__bindCheck());
      if (res.length) found.push({ t, res });
      if (t === times[Math.floor(times.length / 2)]) await page.screenshot({ path: `${outdir}/${venue}-${preset}-${mode}-t${t}.jpg`, type: 'jpeg', quality: 80, timeout: 180000 });
    }
    if (found.length || errors.length) bad++;
    console.log(venue.padEnd(8), preset.padEnd(4), mode.padEnd(8), found.length ? 'BIND ' + JSON.stringify(found).slice(0, 400) : 'ok', errors.length ? 'ERR ' + errors[0] : '');
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `${bad} runs with problems` : 'no one in the bind pose');
