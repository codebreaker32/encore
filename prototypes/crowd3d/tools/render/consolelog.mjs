// Open a page for a while and print its `[crowd]` console lines (the sweep and dynres logs), on the box.
//   node consolelog.mjs <url> [seconds=20]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, secs = '20'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[crowd]')) console.log(t); });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForTimeout(+secs * 1000);
} finally { await browser.close(); }
