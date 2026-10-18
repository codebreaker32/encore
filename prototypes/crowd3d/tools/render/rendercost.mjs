// The cost of a switch on the box (software GPU: a rough relative guide only, the TV decides): the page in capture
// mode at the tv drawing size, the wide rendered N times with gl.finish after each, the median ms, for each query.
//   node rendercost.mjs <page url> <venue> <query extra>...      (e.g. "" "&ab=fxaa")
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, ...qs] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const q of qs) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${base}?preset=tv&venue=${venue}&state=listen&hud=0&capture=1&debug=1${q}`, { timeout: 240000 });
    await page.waitForFunction(() => window.__renderAt, null, { timeout: 240000 });
    const ms = await page.evaluate(() => {
      const gl = document.getElementById('c').getContext('webgl2');
      const out = [];
      for (let i = 0; i < 24; i++) { const t0 = performance.now(); window.__renderAt(4 + i * 0.033); gl.finish(); out.push(performance.now() - t0); }
      out.sort((a, b) => a - b);
      return +out[12].toFixed(1);
    });
    console.log(JSON.stringify({ venue, q: q || '(base)', medianMs: ms }));
    await page.close();
  }
} finally { await browser.close(); }
