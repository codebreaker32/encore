// Arena spike v1 on the build box: load once, print the report, caps, stats, fragments and a screenshot.
//   node smoke.mjs <url> <out.png>
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, out = '/tmp/spike.png'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 400)); });
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  const r = await page.evaluate(() => ({ err: window.__spike.error, report: window.__spike.report, marks: window.__spike.marks }));
  console.log(JSON.stringify(r, null, 1));
  if (!r.err) {
    console.log('stats', JSON.stringify(await page.evaluate(() => window.__spike.stats())));
    console.log('fragments', JSON.stringify(await page.evaluate(() => window.__spike.fragments(3))));
    await page.evaluate(() => window.__spike.renderAt(3.4));
    await page.locator('#c').screenshot({ path: out });
  }
} finally { await browser.close(); }
