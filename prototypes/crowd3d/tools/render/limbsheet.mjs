// The elbow and knee sheets (limbs-v1), on the build box: each front avatar from the front and the side, close enough
// to judge the elbows and knees, (1) in the single-avatar view (tv models) through the show's states and the seated rest
// poses, (2) in each venue where it sits or stands (club, theatre, open mic, arena: the arena's standing crowd at the
// rail), with two cameras of our own set on the person (the near plane past the neighbours, so a side view isn't
// blocked by the next seat). Every tile carries the limb numbers of that moment (window.__limbMetrics) and the count
// of limb findings (window.__anatomy().limbs).
//   node limbsheet.mjs <page url without query> <out dir> [Avatar ...]   → <out>/limbs-v1-<Avatar>.png (TAG=v1)
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, outDir, ...names] = process.argv.slice(2);
const AV = names.length ? names : ['Female_Adult_02', 'Female_Adult_03', 'Female_Adult_04', 'Female_Adult_12', 'Female_Adult_13', 'Female_Adult_17', 'Male_Adult_04', 'Male_Adult_06', 'Male_Adult_07', 'Male_Adult_10', 'Male_Adult_12', 'Male_Adult_17'];
const STATES = [
  ['listen', 'state=listen&t=4'], ['chuckle', 'state=laugh&s=0.4&t=1.4'], ['big laugh', 'state=laugh&s=0.9&t=1.6'], ['clap', 'state=laugh&kind=applause&s=0.85&gesture=clap&t=1.6'],
  ['cheer', 'state=laugh&kind=cheer&s=0.9&t=1.6'], ['dead air', 'state=murmur&t=9'],
  ['rest - thighs', 'restpose=thighs&t=4'], ['rest - knees', 'restpose=knees&t=4'], ['rest - thigh and knee', 'restpose=thighKnee&t=4'], ['rest - clasped', 'restpose=clasped&t=4'],
];
const VENUES = [['club', 'state=listen', 8], ['theatre', 'state=listen', 8], ['openmic', 'state=listen', 8], ['arena', 'state=listen', 8], ['arena', 'state=laugh&kind=cheer&s=0.9', 1.6]];
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', TAG = process.env.TAG || 'v1', GAMMA = process.env.GAMMA || '1.5';
const seedOf = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973; return 11 + h; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const numbers = (m, f) => {
  if (!m) return 'no fitted body';
  const a = m.arms.map((x) => Math.round(x.angle)).join('/'), k = m.legs.map((x) => (x.kneeFwd * 100).toFixed(0)).join('/');
  const legs = m.seated ? `knee over ankle ${k} cm · knees ${(m.kneeGap * 100).toFixed(0)} cm apart` : `knee bend ${m.legs.map((x) => Math.round(x.flex)).join('/')}° · feet ${(m.ankleGap * 100).toFixed(0)} cm apart`;
  return `elbows ${a}° · ${legs} · limb flags ${f}`;
};
const crop = (file, out, txt, gamma = '1') => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex',
  `[0]crop=560:1010:200:30[a];[0]crop=600:1010:1210:30[b];[a][b]hstack,scale=640:557,eq=gamma=${gamma},drawtext=fontfile=${FONT}:text='${txt[0]}':fontcolor=white:fontsize=17:x=8:y=6:box=1:boxcolor=black@0.6,drawtext=fontfile=${FONT}:text='${txt[1]}':fontcolor=white:fontsize=14:x=8:y=534:box=1:boxcolor=black@0.6`, out]);
const clean = (s) => s.replace(/[:']/g, ' ');
async function avatarTile(name, label, q, dir) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}?view=avatar&name=${name}&pseed=${seedOf(name)}&preset=tv&res=1080&still&hud=0&${q}`, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  const r = await page.evaluate(() => { const m = window.__limbMetrics ? window.__limbMetrics()[0] : null; const f = window.__anatomy ? window.__anatomy().limbs.length : 0; return { m, f }; });
  const file = `${dir}/${label.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  await page.close();
  const out = file.replace('.png', '-tile.png');
  crop(file, out, [clean(`${name} · ${label}`), clean(numbers(r.m, r.f))]);
  return out;
}
// in the venue: the person posed at t in the room, then drawn by two cameras of ours (front from where they face, and
// their right side), each with its near plane just short of them
async function venueTile(name, venue, q, t, dir, preset) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}?venue=${venue}&${q}&preset=${preset}&res=1080&capture=1&hud=0&shot=wide&debug=1&venue-lock=1`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
  await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
  const r = await page.evaluate(({ name, t }) => {
    const p = window.__people.find((x) => x.name === name && x.kind === 'front');
    if (!p) return null;
    let R = null;
    window.__scene.onAfterRender = (renderer) => { R = renderer; };
    for (let k = Math.max(0, t - 1.5); k <= t + 1e-6; k += 0.2) window.__renderAt(k);
    const T = window.__THREE, sc = window.__scene, rig = p.rig;
    const c = new T.Vector3().setFromMatrixPosition(rig.b.pelvis.matrixWorld);
    c.y = (c.y + new T.Vector3().setFromMatrixPosition(rig.b.lFoot.matrixWorld).y) / 2 + 0.25;
    const fwd = new T.Vector3(0, 0, 1).transformDirection(rig.seat.matrixWorld).setY(0).normalize(), right = new T.Vector3(-fwd.z, 0, fwd.x);
    const m = window.__limbMetrics().find((x) => x.name === name && x.kind === 'front'), f = window.__anatomy().limbs.filter((x) => x.name === name);
    const W = R.domElement.width, H = R.domElement.height, fog = sc.fog; sc.fog = null;
    R.setScissorTest(true);
    [[fwd, 0], [right, W / 2]].forEach(([d, x]) => {
      const cam = new T.PerspectiveCamera(30, W / 2 / H, 2.6 - 0.5, 40);
      cam.position.copy(c).addScaledVector(d, 2.6).add(new T.Vector3(0, 0.35, 0)); cam.lookAt(c); cam.updateMatrixWorld();
      R.setViewport(x, 0, W / 2, H); R.setScissor(x, 0, W / 2, H); R.render(sc, cam);
    });
    sc.fog = fog;
    return { m, f: f.length, what: f.map((x) => x.what).join(', ') };
  }, { name, t });
  if (!r) { await page.close(); return null; }
  const file = `${dir}/venue_${venue}_${q.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  await page.close();
  const out = file.replace('.png', '-tile.png');
  crop(file, out, [clean(`${name} · ${venue} · ${q.includes('cheer') ? 'cheer' : 'listen'} t ${t}s${preset !== 'tv' ? ' (' + preset + ')' : ''} · gamma ${GAMMA}`), clean(numbers(r.m, r.f) + (r.what ? ' (' + r.what + ')' : ''))], GAMMA);
  return out;
}
try {
  for (const name of AV) {
    const dir = `${outDir}/limbs-${name}`; fs.mkdirSync(dir, { recursive: true });
    const tiles = [];
    for (const [label, q] of STATES) tiles.push(await avatarTile(name, label, q, dir));
    for (const [v, q, t] of VENUES) { const tl = (await venueTile(name, v, q, t, dir, 'tv')) || (await venueTile(name, v, q, t, dir, 'high')); if (tl) tiles.push(tl); }
    const cols = 4, rows = Math.ceil(tiles.length / cols), inputs = [], layout = [];
    tiles.forEach((tl, i) => { inputs.push('-i', tl); layout.push(`${(i % cols) * 640}_${Math.floor(i / cols) * 557}`); });
    for (let k = tiles.length; k < rows * cols; k++) { inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=640x557:d=1'); layout.push(`${(k % cols) * 640}_${Math.floor(k / cols) * 557}`); }
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${rows * cols}:layout=${layout.join('|')}`, '-frames:v', '1', `${outDir}/limbs-${TAG}-${name}.png`]);
    console.log('sheet', name, tiles.length, 'tiles');
  }
} finally { await browser.close(); }
