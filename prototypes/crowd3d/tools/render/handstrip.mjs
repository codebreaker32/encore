// Consecutive frames (0.1 s apart) of one director setup during a laugh, cropped round one front person: the hand
// either stays or vanishes. Stepped, host-driven.  node handstrip.mjs <base> <venue> <setup label part> <Name> <t0> <out.png>
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, setup, who, t0S, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
const files = [];
const t0 = +t0S;
for (let k = 0; k < 8; k++) {
  const t = +(t0 + k * 0.1).toFixed(2);
  const lab = await page.evaluate(({ t, setup, who, step0 }) => {
    const T = window.__THREE;
    const drive = (t) => ({ attention: 0.8, warmth: 0.7, reactions: t > 4 && t < 9 ? [{ id: 41, kind: 'laugh', strength: 0.9, age: t - 4, level: 0.9 * Math.min(1, (t - 4) / 0.4) * (t < 7 ? 1 : 1 - (t - 7) / 2) }] : [] });
    if (step0) for (let x = 3; x < t - 0.05; x += 0.1) { window.encoreMessage({ type: 'drive', drive: drive(x) }); window.__renderAt(+x.toFixed(2)); }
    window.encoreMessage({ type: 'drive', drive: drive(t) });
    let R = null; window.__scene.onAfterRender = (r) => { R = r; }; window.__renderAt(t);
    const S = window.__closes().setups.find((s) => s.label.includes(setup)), p = window.__people.find((q) => q.name === who && q.kind === 'front');
    const cam = new T.PerspectiveCamera(22, R.domElement.width / R.domElement.height, 0.05, 60);
    cam.position.set(...S.pos); cam.lookAt(new T.Vector3().setFromMatrixPosition(p.rig.b.spine2.matrixWorld).add(new T.Vector3(0, -0.15, 0))); cam.updateMatrixWorld();
    R.render(window.__scene, cam);
    return `${S.label} t ${t}`;
  }, { t, setup, who, step0: k === 0 });
  const f = `/tmp/hs-${k}.png`; await page.screenshot({ path: f }); files.push([f, lab]);
}
await browser.close();
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', tiles = [];
for (const [f, lab] of files) { const o = f.replace('.png', '-t.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `crop=480:400:240:70,scale=320:267,eq=gamma=1.5,drawtext=fontfile=${FONT}:text='${lab.replace(/[:']/g, ' ')}':fontcolor=white:fontsize=11:x=4:y=4:box=1:boxcolor=black@0.6`, o]); tiles.push(o); }
const inputs = []; tiles.forEach((t) => inputs.push('-i', t));
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `hstack=inputs=${tiles.length}`, '-frames:v', '1', out]);
console.log('strip', out);
