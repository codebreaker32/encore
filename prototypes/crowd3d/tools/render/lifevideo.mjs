// The life-v1 clips, on the build box: one venue, host-driven like motionstrip (listening, then a big laugh at t=12,
// strength 0.9, the same seed every run), frame-exact at 25 fps. Two shots from the same frames:
//   mid:  motionstrip's mid shot of the front pair nearest the middle (30° lens, heads to knees)
//   face: judgeset's face close of the front person nearest the middle (30° lens, 0.65 m from the eyes)
// Writes <outdir>/mid/fNNNNN.jpg and <outdir>/face/fNNNNN.jpg (1280×720), then encodes <outdir>/mid.mp4 and face.mp4.
//   node lifevideo.mjs <page url without query> <venue> <outdir> [t0=10] [t1=16] [label] [extra query]
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, out, t0s = '10', t1s = '16', label = '', extra = ''] = process.argv.slice(2);
const T0 = +t0s, T1 = +t1s, FPS = 25, LAUGH = 12, FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const drive = (t) => {
  const a = t - LAUGH, rs = [];
  if (a > 0 && a < 6) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: a, level: 0.9 * Math.min(1, a / 0.4) * (a < 3 ? 1 : Math.max(0, 1 - (a - 3) / 2)) });
  return { attention: 0.8, warmth: 0.6, reactions: rs };
};
for (const d of ['mid', 'face']) fs.mkdirSync(`${out}/${d}`, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&res=720&capture=1&hud=0&shot=wide&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
  await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
  for (let t = 0; t < T0 - 1e-6; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); }, { t: +t.toFixed(2), d: drive(t) });
  await page.evaluate(() => { if (window.__bodyDetail) window.__bodyDetail(true); });
  const n = Math.round((T1 - T0) * FPS);
  for (let i = 0; i < n; i++) {
    const t = +(T0 + i / FPS).toFixed(3);
    for (const shot of ['mid', 'face']) {
      await page.evaluate(({ t, d, shot, first }) => {
        if (first) { window.encoreMessage({ type: 'drive', drive: d }); let R = null; window.__scene.onAfterRender = (r) => { R = r; }; window.__renderAt(t); window.__R = R; }
        const R = window.__R, T = window.__THREE, sc = window.__scene;
        const f = window.__people.filter((p) => p.kind === 'front' && !p.hidden).sort((a, b) => a.o.row - b.o.row || Math.abs(a.o.x) - Math.abs(b.o.x));
        const W = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld);
        let cam;
        if (shot === 'mid') {
          const pr = f.slice(0, 2);
          const c = pr.reduce((a, p) => a.add(W(p.rig.seat).setY(0)), new T.Vector3()).multiplyScalar(1 / pr.length);
          const fwd = pr.reduce((a, p) => a.add(new T.Vector3(0, 0, 1).transformDirection(p.rig.seat.matrixWorld).setY(0)), new T.Vector3()).normalize();
          const stand = pr.some((p) => p.o.stand), y = (pr[0].src && pr[0].src.y) || 0, ty = y + (stand ? 1.3 : 0.78);
          cam = new T.PerspectiveCamera(30, 16 / 9, 0.3, 60);
          cam.position.copy(c).addScaledVector(fwd, stand ? 2.6 : 2.15).setY(ty + (stand ? 0.35 : 0.12)); cam.lookAt(c.x, ty, c.z);
        } else {
          // (the face close's camera stays where the person's seat and their head at the start put it: a fixed lens)
          const rig = f[0].rig;
          if (!window.__faceC) window.__faceC = W(rig.b.head).add(new T.Vector3(0, 0.07, 0));
          const c = window.__faceC;
          const fwd = new T.Vector3(0, 0, 1).transformDirection(rig.seat.matrixWorld).setY(0).normalize(), side = new T.Vector3(fwd.z, 0, -fwd.x);
          cam = new T.PerspectiveCamera(30, 16 / 9, 0.05, 40);
          cam.position.copy(c).addScaledVector(fwd, 0.62).addScaledVector(side, 0.22); cam.lookAt(c.clone().add(new T.Vector3(0, -0.06, 0)));
        }
        cam.updateMatrixWorld();
        const fog = sc.fog; sc.fog = null;
        if (shot === 'face' && window.__renderWith) window.__renderWith(cam); else R.render(sc, cam);
        sc.fog = fog;
      }, { t, d: drive(t), shot, first: shot === 'mid' });
      await page.screenshot({ path: `${out}/${shot}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
    }
    if (i % 25 === 0) console.log('frame', i, '/', n);
  }
  const lab = (shot) => `${label ? label + ' · ' : ''}${venue} ${shot}`.replace(/[:']/g, ' ');
  for (const shot of ['mid', 'face']) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', `${out}/${shot}/f%05d.jpg`,
      '-vf', `drawtext=fontfile=${FONT}:text='${lab(shot)}':fontcolor=white:fontsize=22:x=12:y=12:box=1:boxcolor=black@0.5,drawtext=fontfile=${FONT}:text='t=%{expr\\:${T0}+n/${FPS}}':fontcolor=white:fontsize=22:x=12:y=44:box=1:boxcolor=black@0.5`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'medium', `${out}/${shot}.mp4`]);
  }
  console.log(JSON.stringify({ out, frames: n, errs: errs.slice(0, 3) }));
} finally { await browser.close(); }
