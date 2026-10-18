// The strict judge's fixed frame set (box brief, 18 Oct), per venue at TV resolution (preset tv: 800×450 drawn, shown at
// 1280×720), host-driven like motionstrip (listening, then a big laugh at t=12, strength 0.9):
//   <venue>-1-wide.png    the venue's wide, listening (t 11.8)
//   <venue>-2-mid.png     the venue's first mid setup with front people, at the laugh's peak (t 13.2)
//   <venue>-3-mid.png     the second (a close-size setup when there's no second mid), t 13.2
//   <venue>-4-face.png    a face close of the front person nearest the middle (30° lens, 0.65 m), t 13.3
//   <venue>-5-strip.png   the first mid through the laugh's start: 6 frames 0.2 s apart (t 12.0-13.0), 3 × 2 at 640×360
//   <venue>-6-held.png    held out: a setup (wide or any close setup) and a moment (t 8-18) picked from SEED
// Prints draw calls and triangles per frame, and the held-out pick.
//   node judgeset.mjs <page url> <venue> <outdir> <seed> [extra query]
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, out, seedArg = '1', extra = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const LAUGH = 12;
const drive = (t) => {
  const a = t - LAUGH, rs = [];
  if (a > 0 && a < 6) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: a, level: 0.9 * Math.min(1, a / 0.4) * (a < 3 ? 1 : Math.max(0, 1 - (a - 3) / 2)) });
  return { attention: 0.8, warmth: 0.6, reactions: rs };
};
let seed = (Math.imul(+seedArg, 2654435761) + [...venue].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) >>> 0; // (the venue in the seed: each venue its own pick)
const rnd = () => { // (mulberry32: consecutive seeds give unrelated picks)
  seed = (seed + 0x6d2b79f5) >>> 0; let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const log = { venue, seed: +seedArg, frames: {} };
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage && window.__cutTo, null, { timeout: 240000 });
  await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
  page.errs = errs;
  return page;
}
// step the clock to t at 0.25 s (or finer), driving the room
async function stepTo(page, from, to, dt = 0.25) {
  for (let t = from; t < to - 1e-6; t += dt) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); }, { t: +t.toFixed(2), d: drive(t) });
}
async function shotAt(page, setup, t, file) {
  const r = await page.evaluate(({ i, t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__cutTo(i); return window.__renderAt(t); }, { i: setup, t, d: drive(t) });
  await page.screenshot({ path: file });
  return `${r.calls}c ${(r.tris / 1000).toFixed(1)}k`;
}
try {
  const page = await open();
  await stepTo(page, 0, 1.25);
  await page.waitForFunction(() => window.__closes, null, { timeout: 60000 });
  const setups = await page.evaluate(() => window.__closes().setups);
  const idx = setups.map((s, i) => ({ ...s, i })).filter((s) => s.seats.length);
  const mids = idx.filter((s) => s.size === 'mid'), closes = idx.filter((s) => s.size !== 'mid');
  const A = (mids[0] || closes[0]).i, B = (mids[1] || closes[0] || mids[0]).i;
  log.setups = { A: setups[A].label, B: setups[B].label };
  await stepTo(page, 1.25, 11.8);
  log.frames.wide = await shotAt(page, -1, 11.8, `${out}/${venue}-1-wide.png`);
  await stepTo(page, 11.8, 12.0, 0.1);
  const strip = [];
  for (let k = 0; k < 6; k++) {
    const t = +(12 + k * 0.2).toFixed(2), f = `${out}/.${venue}-s${k}.png`;
    if (k) await stepTo(page, t - 0.2, t, 0.1);
    await shotAt(page, A, t, f);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `scale=640:360,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='t=${t.toFixed(1)}':fontcolor=white:fontsize=14:x=4:y=4:box=1:boxcolor=black@0.5`, f.replace('.png', 't.png')]);
    strip.push(f.replace('.png', 't.png'));
  }
  const inputs = []; strip.forEach((f) => inputs.push('-i', f));
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', 'xstack=inputs=6:layout=0_0|640_0|1280_0|0_360|640_360|1280_360', '-frames:v', '1', `${out}/${venue}-5-strip.png`]);
  for (const f of strip) { fs.rmSync(f); fs.rmSync(f.replace('t.png', '.png')); }
  await stepTo(page, 13.0, 13.2, 0.1);
  log.frames.midA = await shotAt(page, A, 13.2, `${out}/${venue}-2-mid.png`);
  log.frames.midB = await shotAt(page, B, 13.2, `${out}/${venue}-3-mid.png`);
  // the face close: our own 30° lens on the front person nearest the middle (near plane 5 cm)
  await page.evaluate(({ t, d }) => {
    window.encoreMessage({ type: 'drive', drive: d });
    window.__cutTo(-1);
    if (window.__bodyDetail) window.__bodyDetail(true);
    let R = null; window.__scene.onAfterRender = (r) => { R = r; }; window.__renderAt(t);
    const ps = window.__people.filter((p) => p.kind === 'front' && !p.hidden).sort((a, b) => a.o.row - b.o.row || Math.abs(a.o.x) - Math.abs(b.o.x));
    const T3 = window.__THREE, sc = window.__scene, rig = ps[0].rig;
    const c = new T3.Vector3().setFromMatrixPosition(rig.b.head.matrixWorld).add(new T3.Vector3(0, 0.07, 0));
    const fwd = new T3.Vector3(0, 0, 1).transformDirection(rig.seat.matrixWorld).setY(0).normalize();
    const side = new T3.Vector3(fwd.z, 0, -fwd.x);
    const cam = new T3.PerspectiveCamera(30, R.domElement.width / R.domElement.height, 0.05, 40);
    cam.position.copy(c).addScaledVector(fwd, 0.62).addScaledVector(side, 0.22); cam.lookAt(c.clone().add(new T3.Vector3(0, -0.06, 0))); cam.updateMatrixWorld();
    if (window.__renderWith) window.__renderWith(cam); else R.render(sc, cam);
  }, { t: 13.3, d: drive(13.3) });
  await page.screenshot({ path: `${out}/${venue}-4-face.png` });
  log.errs = page.errs.slice(0, 3);
  await page.close();
  // held out: a fresh page, a setup and a moment from the seed
  const hp = await open();
  const pick = Math.floor(rnd() * (idx.length + 1)) - 1, ht = +(8 + rnd() * 10).toFixed(1);
  const hs = pick < 0 ? -1 : idx[pick].i;
  await stepTo(hp, 0, 1.25);
  await hp.waitForFunction(() => window.__closes, null, { timeout: 60000 });
  await stepTo(hp, 1.25, ht);
  log.held = { setup: hs < 0 ? 'wide' : setups[hs].label, t: ht, cost: await shotAt(hp, hs, ht, `${out}/${venue}-6-held.png`) };
  await hp.close();
  console.log(JSON.stringify(log));
} finally { await browser.close(); }
