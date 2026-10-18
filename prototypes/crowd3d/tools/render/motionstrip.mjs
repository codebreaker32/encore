// The motion-v2 strips, on the build box: one venue, the front pair nearest the middle in a mid shot of our own
// (heads to knees, the table or the seat), 10 frames a second for 4 s: 1.5 s of listening, then a big laugh
// (host-driven, strength 0.9, the same seed every run), as a 5 × 8 grid labelled with the time.
//   node motionstrip.mjs <page url without query> <venue> <out.png> [extra query, e.g. &raw=1] [label]
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, out, extra = '', label = ''] = process.argv.slice(2);
const T0 = 10.5, LAUGH = 12, N = 40, FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', GAMMA = process.env.GAMMA || '1.35';
const tmp = `${out}.d`; fs.mkdirSync(tmp, { recursive: true });
const drive = (t) => {
  const a = t - LAUGH, rs = [];
  if (a > 0 && a < 6) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: a, level: 0.9 * Math.min(1, a / 0.4) * (a < 3 ? 1 : Math.max(0, 1 - (a - 3) / 2)) });
  return { attention: 0.8, warmth: 0.6, reactions: rs };
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&res=720&capture=1&hud=0&shot=wide&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
  await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
  for (let t = 0; t < T0 - 1e-6; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); }, { t: +t.toFixed(2), d: drive(t) });
  const files = [];
  for (let i = 0; i < N; i++) {
    const t = +(T0 + i * 0.1).toFixed(2);
    const who = await page.evaluate(({ t, d }) => {
      window.encoreMessage({ type: 'drive', drive: d });
      let R = null; window.__scene.onAfterRender = (r) => { R = r; }; window.__renderAt(t);
      const T = window.__THREE, sc = window.__scene;
      // the pair: the two front people nearest the middle of the first row (a two-top's pair in the club)
      const f = window.__people.filter((p) => p.kind === 'front' && !p.hidden).sort((a, b) => a.o.row - b.o.row || Math.abs(a.o.x) - Math.abs(b.o.x)).slice(0, 2);
      const W = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld);
      const c = f.reduce((a, p) => a.add(W(p.rig.seat).setY(0)), new T.Vector3()).multiplyScalar(1 / f.length);
      const fwd = f.reduce((a, p) => a.add(new T.Vector3(0, 0, 1).transformDirection(p.rig.seat.matrixWorld).setY(0)), new T.Vector3()).normalize();
      const stand = f.some((p) => p.o.stand), y = (f[0].src && f[0].src.y) || 0, ty = y + (stand ? 1.3 : 0.78);
      const cam = new T.PerspectiveCamera(30, 16 / 9, 0.3, 60);
      cam.position.copy(c).addScaledVector(fwd, stand ? 2.6 : 2.15).setY(ty + (stand ? 0.35 : 0.12)); cam.lookAt(c.x, ty, c.z); cam.updateMatrixWorld(); // (standing: over the arena's barrier)
      const fog = sc.fog; sc.fog = null; R.render(sc, cam); sc.fog = fog;
      return f.map((p) => p.name.replace('_Adult_', '')).join(' + ');
    }, { t, d: drive(t) });
    const png = `${tmp}/f${String(i).padStart(2, '0')}.png`;
    await page.screenshot({ path: png, timeout: 180000 });
    const lab = `${label ? label + ' · ' : ''}${venue} t=${t.toFixed(1)}${t >= LAUGH ? ' laugh' : ' listen'}${i === 0 ? ' · ' + who : ''}`;
    const o = png.replace(/\.png$/, '-t.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', `scale=480:270,eq=gamma=${GAMMA},drawtext=fontfile=${FONT}:text='${lab.replace(/[:']/g, ' ')}':fontcolor=white:fontsize=14:x=4:y=4:box=1:boxcolor=black@0.5`, o]);
    files.push(o);
  }
  const inputs = [], layout = [];
  files.forEach((f, i) => { inputs.push('-i', f); layout.push(`${(i % 5) * 480}_${Math.floor(i / 5) * 270}`); });
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${files.length}:layout=${layout.join('|')}`, '-frames:v', '1', out]);
  console.log(JSON.stringify({ out, errs: errs.slice(0, 3) }));
} finally { await browser.close(); }
