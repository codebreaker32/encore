// One front person's hands close (each hand from the front-side at ~0.4 m) plus a torso view, listening (t=3) and in a
// laugh (t=8.5), host-driven, close-shot body detail on.  node handzoom.mjs <base> <venue> <Name|all> <out.png> [extra query]
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, who, out, extra = ''] = process.argv.slice(2);
const TIMES = (process.env.TIMES || '3,8.5').split(',').map(Number);
const tmp = `${out}.d`; fs.mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1&ab=nodynres${extra}`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
await page.evaluate(() => window.__bodyDetail && window.__bodyDetail(true));
const names = await page.evaluate(() => window.__people.filter((q) => q.kind === 'front').map((q) => q.name));
const list = who === 'all' ? names : who.split(',');
let tPrev = 0; const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; const rows = [];
for (const T1 of TIMES) {
  await page.evaluate(({ a, b }) => {
    const drive = (t) => ({ attention: 0.8, warmth: 0.7, reactions: t > 7 && t < 12 ? [{ id: 41, kind: 'laugh', strength: 0.9, age: t - 7, level: 0.9 * Math.min(1, (t - 7) / 0.4) * (t < 10 ? 1 : 1 - (t - 10) / 2) }] : [] });
    for (let x = a; x <= b + 1e-6; x += 0.1) { window.encoreMessage({ type: 'drive', drive: drive(x) }); window.__renderAt(+x.toFixed(2)); }
  }, { a: tPrev + 0.1, b: T1 });
  tPrev = T1;
  const tiles = [];
  for (const nm of list) for (const view of ['body', 'L', 'R']) {
    await page.evaluate(({ nm, view }) => {
      const T = window.__THREE, p = window.__people.find((q) => q.kind === 'front' && q.name === nm), b = p.rig.b, seat = p.rig.seat;
      const wp = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld);
      const mid = view === 'body' ? wp(b.spine2).add(wp(b.pelvis)).multiplyScalar(0.5) : wp(view === 'L' ? b.lHand : b.rHand).lerp(wp(view === 'L' ? b.lTip : b.rTip), 0.4);
      const loc = seat.worldToLocal(mid.clone());
      const off = view === 'body' ? new T.Vector3(0.1, 0.25, 1.6) : new T.Vector3(view === 'L' ? 0.12 : -0.12, 0.2, 0.38);
      const cam = new T.PerspectiveCamera(view === 'body' ? 36 : 30, 4 / 3, 0.03, 60);
      cam.position.copy(seat.localToWorld(loc.clone().add(off))); cam.lookAt(mid); cam.updateMatrixWorld();
      window.__renderWith(cam);
    }, { nm, view });
    const f = `${tmp}/${T1}-${nm}-${view}.png`; await page.screenshot({ path: f });
    const o = f.replace('.png', '-l.jpg');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `scale=320:240,eq=gamma=1.3,drawtext=fontfile=${FONT}:text='${nm} ${view} t${T1}':fontcolor=white:fontsize=12:x=4:y=4:box=1:boxcolor=black@0.6`, o]);
    tiles.push(o);
  }
  const inputs = []; tiles.forEach((t) => inputs.push('-i', t));
  const row = `${tmp}/row-${T1}.jpg`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', tiles.length > 1 ? `hstack=inputs=${tiles.length}` : 'null', row]);
  rows.push(row);
}
await browser.close();
const inputs = []; rows.forEach((t) => inputs.push('-i', t));
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', rows.length > 1 ? `vstack=inputs=${rows.length}` : 'null', out]);
console.log('out', out, list.join(' '));
