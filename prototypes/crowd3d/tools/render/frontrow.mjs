// The front row of a venue at 1080p (tv preset, the stage look), cropped round the skinned front people, for a set of
// states: what a viewer sees of the row. On the box.   node frontrow.mjs <page url> <out.png> <venue> [state=t ...]
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, out, venue, ...specs] = process.argv.slice(2);
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const tiles = [];
try {
  for (const spec of specs) {
    const [q, tS] = spec.split('@'), t = +tS;
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}?venue=${venue}&${q}&preset=tv&res=1080&capture=1&hud=0&shot=wide&debug=1`, { timeout: 240000 });
    await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
    await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
    const box = await page.evaluate((t) => {
      for (let k = Math.max(0, t - 1.5); k <= t + 1e-6; k += 0.2) window.__renderAt(k);
      const T = window.__THREE, cam = window.__camera, W = innerWidth, H = innerHeight; let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (const p of window.__people.filter((p) => p.kind === 'front')) for (const b of [p.rig.b.head, p.rig.b.lFoot, p.rig.b.rFoot, p.rig.b.lHand, p.rig.b.rHand]) {
        const v = new T.Vector3().setFromMatrixPosition(b.matrixWorld).project(cam); const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return { x0: Math.max(0, x0 - 60), x1: Math.min(W, x1 + 60), y0: Math.max(0, y0 - 80), y1: Math.min(H, y1 + 30) };
    }, t);
    const file = `${out}.${tiles.length}.png`;
    await page.screenshot({ path: file, timeout: 240000 });
    await page.close();
    const w = Math.round(box.x1 - box.x0), h = Math.round(box.y1 - box.y0);
    const tile = file.replace('.png', '-t.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `crop=${w}:${h}:${Math.round(box.x0)}:${Math.round(box.y0)},scale=1600:-2,eq=gamma=1.3,drawtext=fontfile=${FONT}:text='${venue} front row · ${q.replace(/[&=:]/g, ' ')} · t ${t}s · gamma 1.3':fontcolor=white:fontsize=24:x=12:y=10:box=1:boxcolor=black@0.6`, tile]);
    tiles.push(tile);
  }
  if (tiles.length === 1) execFileSync('cp', [tiles[0], out]);
  else execFileSync('ffmpeg', ['-v', 'error', '-y', ...tiles.flatMap((t) => ['-i', t]), '-filter_complex', `vstack=inputs=${tiles.length}`, out]);
  console.log('wrote', out);
} finally { await browser.close(); }
