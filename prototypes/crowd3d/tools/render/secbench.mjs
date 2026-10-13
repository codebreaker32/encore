// Person.update by section (people.js marks, &sec=1), in a stepped page: the best of five rounds, microseconds a call.
//   node secbench.mjs "<page url with query, capture=1>"
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(url + '&sec=1', { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.__sec, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const P = Object.getPrototypeOf(window.__people[0]), u = P.update, C = { n: 0 };
  P.update = function (...a) { C.n++; return u.apply(this, a); };
  let t = 2; for (let k = 0; k < 30; k++) window.__renderAt((t += 1 / 30));
  const best = {};
  for (let r = 0; r < 5; r++) { C.n = 0; window.__sec.acc = {}; for (let k = 0; k < 40; k++) window.__renderAt((t += 1 / 30)); for (const [k, v] of Object.entries(window.__sec.acc)) best[k] = Math.min(best[k] ?? Infinity, v / C.n); }
  let tot = 0; for (const v of Object.values(best)) tot += v;
  return { perCall: Object.fromEntries(Object.entries(best).map(([k, v]) => [k, +(v * 1000).toFixed(1)])), totalUs: +(tot * 1000).toFixed(1) };
});
console.log(JSON.stringify(r));
await browser.close();
