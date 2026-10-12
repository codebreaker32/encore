// Bakes the arena's sprite atlas from our own avatars (the page's ?view=spritebake) and saves it.
//   node spritebake.mjs <page url without query> <out.png>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?view=spritebake&preset=tv&hud=0`, { timeout: 240000 });
  await page.waitForFunction(() => window.__bake || document.body.dataset.ready === '1', null, { timeout: 400000 });
  const uri = await page.evaluate(() => (window.__bake ? window.__bake() : null));
  if (uri) fs.writeFileSync(out, Buffer.from(uri.split(',')[1], 'base64'));
  console.log(JSON.stringify({ saved: !!uri, errors: errors.slice(0, 3) }));
} finally { await browser.close(); }
