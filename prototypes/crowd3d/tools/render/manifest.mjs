// The tv pack's prefetch list (crowd.js PREFETCH): for each venue, every GLB and crowd texture its page loads on
// preset=tv, the room's first and the front people's .tv files last. Run on the box against the page; writes
// <out>/prefetch-tv.json (ship it as people/prefetch-tv.json; re-run when a venue's cast, bands or files change).
//   node manifest.mjs <base url, e.g. http://localhost:8092/index.html> <out dir>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const man = {};
try {
  for (const venue of ['club', 'openmic', 'theatre', 'arena']) {
    const page = await browser.newPage({ viewport: { width: 962, height: 541 } });
    await page.goto(`${base}?preset=tv&host=1&venue=${venue}&hud=0&noprefetch=1`, { timeout: 300000 });
    await page.waitForFunction(() => document.body.dataset.front === '1' && window.__load, null, { timeout: 300000 });
    const urls = await page.evaluate(() => window.__load().urls);
    man[venue] = [...urls.filter((u) => !/\.tv\.glb$/.test(u)), ...urls.filter((u) => /\.tv\.glb$/.test(u))];
    console.log(venue, man[venue].length);
    await page.close();
  }
} finally { await browser.close(); }
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/prefetch-tv.json`, JSON.stringify(man, null, 1));
