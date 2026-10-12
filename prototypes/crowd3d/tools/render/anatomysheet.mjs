// Anatomy contact sheets, on the build box: each front avatar seen from the front and the side (the page's
// single-avatar view, tv models) in the show's states and the seated rest poses, cropped to the body at 1080p; the
// moments the single view can't stage (standing, talking with a party, the table poses) come from the club itself.
//   node anatomysheet.mjs <page url without query> <out dir> [Avatar ...]
// Writes <out>/<Avatar>/<state>.png (front | side crops) and <out>/anatomy-<TAG>-sheet-<Avatar>.png (ffmpeg montage; TAG=v2).
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, outDir, ...names] = process.argv.slice(2);
const AV = names.length ? names : ['Female_Adult_02', 'Female_Adult_03', 'Female_Adult_12', 'Male_Adult_04', 'Male_Adult_17', 'Female_Adult_13'];
const STATES = [
  ['listen', 'state=listen&t=4'], ['laugh 0.4', 'state=laugh&s=0.4&t=1.4'], ['laugh 0.9', 'state=laugh&s=0.9&t=1.6'], ['clap', 'state=laugh&kind=applause&s=0.85&gesture=clap&t=1.6'],
  ['finale (cheer)', 'state=laugh&kind=cheer&s=0.9&t=1.6'], ['dead air', 'state=murmur&t=9'], ['preview (talking)', { q: 'state=preview', find: 'talking' }], ['after (standing, coat)', { q: 'state=after', find: 'standing' }],
  ['rest - thighs', 'restpose=thighs&t=4'], ['rest - knees', 'restpose=knees&t=4'], ['rest - thigh and knee', 'restpose=thighKnee&t=4'], ['rest - clasped', 'restpose=clasped&t=4'],
  ['idle folded - clasped', 'idle=folded&t=4'], ['idle chin - bored', 'idle=chin&state=murmur&t=4'], ['rest - table (hand)', { q: 'state=listen&restpose=tableOne', t: 4 }],
];
// (ONLY='finale,after' renders just those states, no sheet)
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
// each avatar its own seed (the review should see the variety, not one person's choices on six bodies)
const seedOf = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973; return 11 + h; };
const TAG = process.env.TAG || 'v2';
const GAMMA = process.env.GAMMA || '1.4'; // (the venue crops: the stage look's house is dark; a lift so the hands read, labelled)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// From the venue itself (VENUE, default club: the avatar must be in its front cast), cropped round the person, for
// what the single-avatar view can't show: standing up to leave (its cameras are framed for a seated body; the moment
// this person stands in front of their seat, half way into the coat if they wear one), talking with their party in
// the preview (it has no party), and the rest poses on a table (it has no table).
async function venueTile(name, label, dir, spec) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}?venue=${process.env.VENUE || 'club'}&${spec.q}&preset=tv&res=1080&capture=1&hud=0&shot=wide&debug=1`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
  await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' }); // (the broadcast overlay off)
  const box = await page.evaluate(({ name, spec }) => {
    const q = window.__people.find((p) => p.name === name && p.kind === 'front');
    if (!q) return null;
    let best = spec.t ? { t: spec.t, coat: 0 } : null;
    if (spec.find === 'standing') for (let t = 1; t <= 95; t += 0.5) {
      window.__renderAt(t);
      const L = q.loco;
      if (!L || L.walk || L.stand < 1) continue;
      const score = L.coat ? Math.abs(L.coat - 0.5) : 1;
      if (!best || score < best.score) best = { t, score, coat: L.coat || 0 };
    }
    // (talking in their seat: past the arrivals, the speaker's turn under way)
    if (spec.find === 'talking') for (let t = 2; t <= 60 && !best; t += 0.5) {
      window.__renderAt(t);
      if (q.loco || (q.src && q.src._loco)) continue;
      const k = q.talkAt(t); if (k && k.speaking && q.talkAt(t + 0.6)?.speaking) best = { t: t + 0.6, coat: 0 };
    }
    if (!best) return null;
    for (let k = Math.max(0, best.t - 1); k <= best.t + 1e-6; k += 0.2) window.__renderAt(k);
    const T = window.__THREE, cam = window.__camera, W = innerWidth, H = innerHeight, b = q.rig.b;
    const sp = (o, dy = 0) => { const v = new T.Vector3().setFromMatrixPosition(o.matrixWorld); v.y += dy; v.project(cam); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]; };
    const top = sp(b.head, 0.16), ft = [sp(b.lFoot, -0.08), sp(b.rFoot, -0.08)], hp = [sp(b.lHand), sp(b.rHand)];
    const xs = [top[0], ...ft.map((f) => f[0]), ...hp.map((h) => h[0])], ys = [top[1], ...ft.map((f) => f[1])];
    return { t: best.t, coat: best.coat, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }, { name, spec });
  if (!box) { await page.close(); console.log('no moment for', name, label); return null; }
  const file = `${dir}/${label.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file, timeout: 240000 });
  await page.close();
  // the crop: the whole standing body with a margin, at the tile's aspect, scaled up to the tile
  const h = Math.min(1080, Math.round((box.y1 - box.y0) * 1.12)), w = Math.min(1920, Math.round(h * 640 / 557));
  const cx = Math.max(0, Math.min(1920 - w, Math.round((box.x0 + box.x1) / 2 - w / 2))), cy = Math.max(0, Math.min(1080 - h, Math.round(box.y0 - h * 0.05)));
  const tile = file.replace('.png', '-tile.png');
  const txt = `${name} · ${label} · venue t ${box.t}s${box.coat ? ' · coat ' + box.coat.toFixed(2) : ''} · gamma ${GAMMA}`.replace(/:/g, ' ');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `crop=${w}:${h}:${cx}:${cy},scale=640:557:flags=lanczos,eq=gamma=${GAMMA},drawtext=fontfile=${FONT}:text='${txt}':fontcolor=white:fontsize=18:x=10:y=8:box=1:boxcolor=black@0.6`, tile]);
  return tile;
}
try {
  for (const name of AV) {
    const dir = `${outDir}/${name}`; fs.mkdirSync(dir, { recursive: true });
    const tiles = [];
    for (const [label, q] of STATES) {
      if (ONLY && !ONLY.some((k) => label.includes(k))) continue;
      if (typeof q === 'object') { const t = await venueTile(name, label, dir, q); if (t) tiles.push(t); continue; }
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`${base}?view=avatar&name=${name}&pseed=${seedOf(name)}&preset=tv&res=1080&still&hud=0&${q}`, { timeout: 240000 });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
      const file = `${dir}/${label.replace(/[^a-z0-9]+/gi, '_')}.png`;
      await page.screenshot({ path: file, timeout: 240000 });
      await page.close();
      // front and side, each cropped round the seated body; the label written on
      const tile = file.replace('.png', '-tile.png');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex',
        `[0]crop=560:1010:200:30[a];[0]crop=600:1010:1210:30[b];[a][b]hstack,scale=640:557,drawtext=fontfile=${FONT}:text='${name} · ${label}':fontcolor=white:fontsize=20:x=10:y=8:box=1:boxcolor=black@0.6`, tile]);
      tiles.push(tile);
    }
    if (ONLY) { console.log('tiles', name, tiles.length); continue; }
    // 4 columns
    const cols = 4, rows = Math.ceil(tiles.length / cols), inputs = [], layout = [];
    tiles.forEach((t, i) => { inputs.push('-i', t); layout.push(`${(i % cols) * 640}_${Math.floor(i / cols) * 557}`); });
    const pad = rows * cols - tiles.length;
    for (let k = 0; k < pad; k++) { inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=640x557:d=1'); layout.push(`${((tiles.length + k) % cols) * 640}_${Math.floor((tiles.length + k) / cols) * 557}`); }
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${rows * cols}:layout=${layout.join('|')}`, '-frames:v', '1', `${outDir}/anatomy-${TAG}-sheet-${name}.png`]);
    console.log('sheet', name);
  }
} finally { await browser.close(); }
