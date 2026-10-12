// The TV web app's bill over the live 3D room (on the box): open the app, wait for the crowd page to fill, screenshot.
//   node billshot.mjs <out.png> [url=http://localhost:8082/?crowd=3d] [seconds=40]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [out, url = 'http://localhost:8082/?crowd=3d', waitS = '40'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { timeout: 300000, waitUntil: 'load' });
  await page.waitForTimeout(+waitS * 1000);
  await page.screenshot({ path: out });
  const crowd = page.frames().find((f) => f.url().includes(':8091'));
  const stats = crowd ? await crowd.evaluate(() => window.__stats || null) : null;
  const bind = crowd ? await crowd.evaluate(() => (window.__bindCheck ? window.__bindCheck() : null)) : null;
  console.log(JSON.stringify({ out, crowdUrl: crowd && crowd.url(), mode: stats && stats.mode, preset: stats && stats.preset, calls: stats && stats.calls, bindPoses: bind, errors: errors.slice(0, 3) }));
} finally { await browser.close(); }
