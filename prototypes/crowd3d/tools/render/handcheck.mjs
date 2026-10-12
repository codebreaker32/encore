// Hands inside bodies, on the build box: steps a &capture=1 page through times and asks the page's
// window.__handCheck() (people.js handCheck) which hands sit inside a torso (their own or a neighbour's).
//   node handcheck.mjs <url-with-capture=1> <t0> <t1> [step=0.5]     exit code 1 if any hand is inside a body
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, t0s, t1s, stepS = '0.5'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && typeof window.__handCheck === 'function', null, { timeout: 240000 });
  for (let t = +t0s; t <= +t1s + 1e-6; t += +stepS) {
    const hits = await page.evaluate((t) => { window.__renderAt(t); return window.__handCheck(); }, t);
    if (hits.length) { bad += hits.length; console.log(`t=${t.toFixed(2)}`, hits.map((h) => `${h.name} ${h.hand} ${h.what || "in " + h.in} (${h.depth})`).join('; ')); }
  }
} finally { await browser.close(); }
console.log(bad ? `${bad} hand(s) inside a body` : 'no hands inside a body');
process.exit(bad ? 1 : 0);
