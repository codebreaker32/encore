// The laughs-v1 sheets, on the build box: four laughs in a row (host-driven, strengths 0.5, 0.9, 0.7, 0.9) in each
// venue, at each laugh's peak: the room (the page's own wide) and one front person close (a camera of our own), each
// tile labelled with the cast (window.__laughCast: how many laugh, the share, each skinned person's sound type).
//   node laughsheet.mjs <page url without query> <out dir> [venues...]
//   → <out>/laughs-v1-<venue>.png (wide row, close row) and <out>/laughs-v1-venues.png (one moment per venue)
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, outDir, ...vs] = process.argv.slice(2);
const venues = vs.length ? vs : ['openmic', 'club', 'theatre', 'arena'];
const LAUGHS = [[10, 0.5], [16, 0.9], [22, 0.7], [28, 0.9]]; // (from 10 s: the house fades up over the first seconds)
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', TAG = process.env.TAG || 'v1', GAMMA = process.env.GAMMA || '1.35';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const drive = (t) => {
  const rs = [];
  LAUGHS.forEach(([t0, s], i) => { const a = t - t0; if (a > 0 && a < 5.5) rs.push({ id: 31 + i, kind: 'laugh', strength: s, age: a, level: s * Math.min(1, a / 0.4) * (a < 2.6 ? 1 : Math.max(0, 1 - (a - 2.6) / 2.4)) }); });
  return { attention: 0.8, warmth: 0.6, reactions: rs };
};
const clean = (s) => s.replace(/[:']/g, ' ');
const venueTiles = [];
try {
  for (const v of venues) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${base}?venue=${v}&host=1&preset=tv&res=720&capture=1&hud=0&shot=wide&debug=1&venue-lock=1`, { timeout: 240000 });
    await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
    await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
    // the close-up subject: the most central front person in the first row
    const who = await page.evaluate(() => { const f = window.__people.filter((p) => p.kind === 'front').sort((a, b) => a.o.row - b.o.row || Math.abs(a.o.x) - Math.abs(b.o.x)); return f[0] ? f[0].name : ''; });
    const wides = [], closes = [];
    let t = 0;
    for (const [t0, s] of LAUGHS) {
      const peak = t0 + 1.4;
      for (; t <= peak + 1e-6; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); }, { t: +t.toFixed(2), d: drive(t) });
      const cast = await page.evaluate(() => window.__laughCast());
      const lab = `${v} · laugh ${LAUGHS.findIndex((x) => x[0] === t0) + 1} (strength ${s}) · ${cast.n} laughing, share ${cast.share}`;
      const wf = `${outDir}/ls-${v}-${t0}-wide.png`;
      await page.screenshot({ path: wf, timeout: 180000 });
      const types = cast.people.map((e) => `${e.name.replace(/_Adult_/, '')} ${e.type} ${e.level}`).join(', ');
      wides.push([wf, lab, types]);
      // the same person close: a camera of ours on them (front, near plane past whoever is in between)
      const info = await page.evaluate(({ who, t }) => {
        const p = window.__people.find((x) => x.name === who && x.kind === 'front'); if (!p) return '';
        let R = null; window.__scene.onAfterRender = (r) => { R = r; }; window.__renderAt(t);
        const T = window.__THREE, sc = window.__scene, rig = p.rig;
        const c = new T.Vector3().setFromMatrixPosition(rig.b.neck.matrixWorld);
        const fwd = new T.Vector3(0, 0, 1).transformDirection(rig.seat.matrixWorld).setY(0).normalize();
        const cam = new T.PerspectiveCamera(26, R.domElement.width / R.domElement.height, 1.2, 40);
        cam.position.copy(c).addScaledVector(fwd, 1.6).add(new T.Vector3(0, 0.05, 0)); cam.lookAt(c.clone().add(new T.Vector3(0, -0.12, 0))); cam.updateMatrixWorld();
        const fog = sc.fog; sc.fog = null; R.render(sc, cam); sc.fog = fog;
        const c2 = p._rc && [...p._rc.values()].pop();
        return c2 ? `${c2.style}, reach ${c2.reach.toFixed(2)}${c2.gs.length ? ', ' + c2.gs.map((g) => g.g).join('+') : ''}` : 'no response';
      }, { who, t: +(t - 0.25).toFixed(2) });
      const cf = `${outDir}/ls-${v}-${t0}-close.png`;
      await page.screenshot({ path: cf, timeout: 180000 });
      closes.push([cf, `${who} · laugh ${LAUGHS.findIndex((x) => x[0] === t0) + 1} · ${info}`]);
    }
    await page.close();
    const tiles = [];
    for (const [f, lab, types] of wides) { const o = f.replace('.png', '-t.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `scale=640:360,eq=gamma=${GAMMA},drawtext=fontfile=${FONT}:text='${clean(lab)}':fontcolor=white:fontsize=15:x=6:y=5:box=1:boxcolor=black@0.6,drawtext=fontfile=${FONT}:text='${clean(types).slice(0, 110)}':fontcolor=white:fontsize=11:x=6:y=342:box=1:boxcolor=black@0.6`, o]); tiles.push(o); }
    for (const [f, lab] of closes) { const o = f.replace('.png', '-t.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `scale=640:360,eq=gamma=${GAMMA},drawtext=fontfile=${FONT}:text='${clean(lab)}':fontcolor=white:fontsize=15:x=6:y=5:box=1:boxcolor=black@0.6`, o]); tiles.push(o); }
    const inputs = [], layout = [];
    tiles.forEach((tl, i) => { inputs.push('-i', tl); layout.push(`${(i % 4) * 640}_${Math.floor(i / 4) * 360}`); });
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${tiles.length}:layout=${layout.join('|')}`, '-frames:v', '1', `${outDir}/laughs-${TAG}-${v}.png`]);
    venueTiles.push(tiles[1]); // (the big laugh's wide)
    console.log('sheet', v);
  }
  if (venueTiles.length > 1) {
    const inputs = [], layout = [];
    venueTiles.forEach((tl, i) => { inputs.push('-i', tl); layout.push(`${(i % 2) * 640}_${Math.floor(i / 2) * 360}`); });
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${venueTiles.length}:layout=${layout.join('|')}`, '-frames:v', '1', `${outDir}/laughs-${TAG}-venues.png`]);
    console.log('sheet venues');
  }
} finally { await browser.close(); }
