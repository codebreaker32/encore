// The faces sheets (faces-v1), on the build box: each front avatar's face (the single-avatar view, tv models, zoomed)
// listening, at a chuckle (0.4) and a big laugh (0.9), in dead air, at a heckle (the wince) and after it (their own
// verdict), labelled with the person's temperament. Plus one sheet of the five temperaments on one face.
//   node facesheet.mjs <page url without query> <out dir> [Avatar ...]
//   → <out>/faces-v1-<Avatar>.png and <out>/faces-v1-temperaments.png (TAG=v1)
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, outDir, ...names] = process.argv.slice(2);
const AV = names.length ? names : ['Female_Adult_02', 'Female_Adult_03', 'Female_Adult_04', 'Female_Adult_12', 'Female_Adult_13', 'Female_Adult_17', 'Male_Adult_04', 'Male_Adult_06', 'Male_Adult_07', 'Male_Adult_10', 'Male_Adult_12', 'Male_Adult_17'];
const COLS = [['listen', 'state=listen&t=4.2'], ['chuckle (laugh 0.4)', 'state=laugh&s=0.4&t=1.25'], ['big laugh (0.9)', 'state=laugh&s=0.9&t=1.55'],
  ['dead air', 'state=murmur&t=9'], ['heckle - the wince', 'state=listen&heckle=1&t=0.75'], ['heckle - after', 'state=listen&heckle=1&t=3.2']];
const TEMPERS = ['plain', 'laugher', 'sceptic', 'shy', 'talker'];
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', TAG = process.env.TAG || 'v1';
const seedOf = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973; return 11 + h; };
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// (a still frame where the face is towards the lens: listening, people look about; the first of a few moments, a
// second apart, with the head within 25° of the camera, else the most frontal of them)
async function tile(name, label, q, extra = '') {
  const t0 = +(q.match(/t=([0-9.]+)/) || [0, 4])[1], tries = /listen|murmur/.test(q) && !q.includes('t=0.75') ? [0, 1, 2, 3, 4, 5, 6, 7] : [0];
  let page = null, best = null, temper = '';
  for (const dt of tries) {
    if (page) await page.close();
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}?view=avatar&name=${name}&pseed=${seedOf(name)}&preset=tv&res=1080&still&hud=0&zoom=1&${q.replace(/t=[0-9.]+/, 't=' + (t0 + dt))}${extra}`, { timeout: 240000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
    const r = await page.evaluate(() => {
      const p = window.__reg && window.__reg[0]; if (!p) return { a: 0, temper: '' };
      const e = p.rig.b.head.matrixWorld.elements, f = p.rig.fit && p.rig.fit.headFwd ? p.rig.fit.headFwd : { x: 0, y: 0, z: 1 };
      const d = [0, 1, 2].map((i) => e[i] * f.x + e[4 + i] * f.y + e[8 + i] * f.z), n = Math.hypot(...d) || 1;
      const c = [0 - e[12], 1.2 - e[13], 1 - e[14]], m = Math.hypot(...c) || 1;
      return { a: (Math.acos(Math.max(-1, Math.min(1, (d[0] * c[0] + d[1] * c[1] + d[2] * c[2]) / n / m))) * 180) / Math.PI, temper: p.temper };
    });
    temper = r.temper;
    if (!best || r.a < best.a) best = { a: r.a, dt };
    if (r.a < 25) break;
  }
  if (best.dt !== tries[tries.length - 1] && tries.length > 1 && best.a >= 25) { // (the most frontal one again)
    await page.close(); page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}?view=avatar&name=${name}&pseed=${seedOf(name)}&preset=tv&res=1080&still&hud=0&zoom=1&${q.replace(/t=[0-9.]+/, 't=' + (t0 + best.dt))}${extra}`, { timeout: 240000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  }
  label += best.dt ? ` t ${t0 + best.dt}` : '';
  const file = `${outDir}/fs-${name}-${(label + extra).replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  await page.close();
  const out = file.replace('.png', '-tile.png'), txt = `${name} · ${temper} · ${label}`.replace(/:/g, ' ');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `crop=960:836:0:122,scale=640:557,drawtext=fontfile=${FONT}:text='${txt}':fontcolor=white:fontsize=18:x=10:y=8:box=1:boxcolor=black@0.6`, out]);
  return out;
}
const sheet = (tiles, cols, file) => {
  const inputs = [], layout = [];
  tiles.forEach((t, i) => { inputs.push('-i', t); layout.push(`${(i % cols) * 640}_${Math.floor(i / cols) * 557}`); });
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${tiles.length}:layout=${layout.join('|')}`, '-frames:v', '1', file]);
  console.log('sheet', file);
};
try {
  if (!process.env.NO_AV) for (const name of AV) {
    const tiles = [];
    for (const [label, q] of COLS) tiles.push(await tile(name, label, q));
    sheet(tiles, 3, `${outDir}/faces-${TAG}-${name}.png`);
  }
  // the temperaments on one face: dead air, the heckle after, a chuckle (the moments where they differ most)
  const who = process.env.TEMPER_FACE || 'Female_Adult_03', tiles = [];
  for (const tp of TEMPERS) for (const [label, q] of [COLS[3], COLS[5], COLS[1]]) tiles.push(await tile(who, label + ' (temper forced)', q, `&temper=${tp}`));
  sheet(tiles, 3, `${outDir}/faces-${TAG}-temperaments.png`);
} finally { await browser.close(); }
