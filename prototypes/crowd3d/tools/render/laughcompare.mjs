// Listen against a chuckle (0.4) and a big laugh (0.9), mid-laugh and at the peak, for each front avatar (each its own
// seed, as in anatomysheet.mjs), front and side, so the difference reads at a glance. On the build box.
//   node laughcompare.mjs <page url without query> <out dir> [Avatar ...]   → <out>/anatomy-<TAG>-laughs.png
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, outDir, ...names] = process.argv.slice(2);
const AV = names.length ? names : ['Female_Adult_02', 'Male_Adult_10', 'Female_Adult_03', 'Male_Adult_04', 'Female_Adult_13', 'Male_Adult_17'];
const COLS = [['listen', 'state=listen&t=4'], ['laugh 0.4 mid', 'state=laugh&s=0.4&t=0.9'], ['laugh 0.4 peak', 'state=laugh&s=0.4&t=1.25'],
  ['laugh 0.9 mid', 'state=laugh&s=0.9&t=1.0'], ['laugh 0.9 peak', 'state=laugh&s=0.9&t=1.55'],
  ['face listen', 'state=listen&t=4&zoom=1'], ['face 0.4', 'state=laugh&s=0.4&t=1.25&zoom=1'], ['face 0.9', 'state=laugh&s=0.9&t=1.55&zoom=1']];
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', TAG = process.env.TAG || 'v3';
const seedOf = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973; return 11 + h; };
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const tiles = [];
try {
  for (const name of AV) for (const [label, q] of COLS) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}?view=avatar&name=${name}&pseed=${seedOf(name)}&preset=tv&res=1080&still&hud=0&${q}`, { timeout: 240000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
    const st = await page.evaluate(() => { const p = window.__reg && window.__reg[0]; const S = p && p.state; return S ? `${S.style || ''}${S.gestures && S.gestures.length ? ' + ' + S.gestures.map((g) => g.g).join(' ') : ''}` : ''; });
    const file = `${outDir}/lc-${name}-${label.replace(/[^a-z0-9]+/gi, '_')}.png`;
    await page.screenshot({ path: file, timeout: 240000 });
    await page.close();
    const tile = file.replace('.png', '-tile.png');
    const txt = `${name} · ${label}${label === 'listen' ? '' : ' · ' + st}`.replace(/:/g, ' ');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex', q.includes('zoom') ? `[0]crop=960:836:0:122,scale=640:557,drawtext=fontfile=${FONT}:text='${txt}':fontcolor=white:fontsize=18:x=10:y=8:box=1:boxcolor=black@0.6` : `[0]crop=560:1010:200:30[a];[0]crop=600:1010:1210:30[b];[a][b]hstack,scale=640:557,drawtext=fontfile=${FONT}:text='${txt}':fontcolor=white:fontsize=18:x=10:y=8:box=1:boxcolor=black@0.6`, tile]);
    tiles.push(tile);
  }
  const inputs = [], layout = [];
  tiles.forEach((t, i) => { inputs.push('-i', t); layout.push(`${(i % COLS.length) * 640}_${Math.floor(i / COLS.length) * 557}`); });
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${tiles.length}:layout=${layout.join('|')}`, '-frames:v', '1', `${outDir}/anatomy-${TAG}-laughs.png`]);
  console.log('sheet', `${outDir}/anatomy-${TAG}-laughs.png`);
} finally { await browser.close(); }
