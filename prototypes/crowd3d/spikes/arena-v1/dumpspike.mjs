// The GLSL three.js generated for the spike's programs, one .vert/.frag pair per program, for mali.mjs.
//   node dumpspike.mjs <url> <outdir> <prefix>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, outdir, prefix = 'lean'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => window.__spike && window.__spike.ready, null, { timeout: 240000 });
  const progs = await page.evaluate(() => window.__spike.programs());
  for (const p of progs) {
    const lv = (p.label.match(/-l(\d)-/) || [0, 'x'])[1], name = `${prefix}-${p.label === 'shell' ? 'shell' : 'l' + lv}`;
    if (fs.existsSync(`${outdir}/${name}.vert`)) continue;
    fs.writeFileSync(`${outdir}/${name}.vert`, p.vs); fs.writeFileSync(`${outdir}/${name}.frag`, p.fs);
    console.log('wrote', name, p.label);
  }
} finally { await browser.close(); }
