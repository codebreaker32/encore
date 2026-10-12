// Six frames of a capture-mode page at even steps, side by side in a 3×2 strip PNG (motion checks), on the box.
//   node strip6.mjs <url with &capture=1> <t0> <dt> <out.png>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, t0s, dts, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(url, { timeout: 240000 });
  await p.waitForFunction(() => window.__renderAt, null, { timeout: 240000 });
  await p.addStyleTag({ content: '.tv > *:not(canvas) { visibility: hidden !important; }' });
  const shots = [];
  for (let i = 0; i < 6; i++) { const t = +t0s + i * +dts; await p.evaluate((t) => { window.__renderAt(t); }, t); shots.push((await p.screenshot()).toString('base64')); }
  const uri = await p.evaluate(async (shots) => {
    const c = document.createElement('canvas'); c.width = 1920; c.height = 720; const g = c.getContext('2d');
    for (let i = 0; i < 6; i++) { const im = new Image(); im.src = 'data:image/png;base64,' + shots[i]; await im.decode(); g.drawImage(im, (i % 3) * 640, Math.floor(i / 3) * 360); }
    return c.toDataURL('image/png');
  }, shots);
  fs.writeFileSync(out, Buffer.from(uri.split(',')[1], 'base64'));
  console.log('ok');
} finally { await b.close(); }
