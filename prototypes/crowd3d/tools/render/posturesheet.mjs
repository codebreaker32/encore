// Before and after, side by side: each avatar listening (avatar view, tv models, its own seed), front and side.
//   node posturesheet.mjs <before url> <after url> <out.png> <Avatar ...>     (on the box)
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [before, after, out, ...names] = process.argv.slice(2);
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const seedOf = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973; return 11 + h; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rows = [];
try {
  for (const name of names) {
    const tiles = [];
    for (const [tag, base] of [['before', before], ['after', after]]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`${base}?view=avatar&name=${name}&pseed=${seedOf(name)}&preset=tv&res=1080&still&hud=0&state=listen&t=4`, { timeout: 240000 });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
      const ps = await page.evaluate(() => (window.__reg && window.__reg[0] && window.__reg[0].posture) || '');
      const file = `${out.replace(/\.png$/, '')}-${name}-${tag}.png`;
      await page.screenshot({ path: file, timeout: 240000 });
      await page.close();
      const tile = file.replace(/\.png$/, '-t.png');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex', `[0]crop=560:1010:200:30[a];[0]crop=600:1010:1210:30[b];[a][b]hstack,scale=640:557,drawtext=fontfile=${FONT}:text='${name} · listen · ${tag}${ps ? ' · ' + ps : ''}':fontcolor=white:fontsize=20:x=10:y=8:box=1:boxcolor=black@0.6`, tile]);
      tiles.push(tile);
    }
    const row = `${out.replace(/\.png$/, '')}-${name}-row.png`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tiles[0], '-i', tiles[1], '-filter_complex', 'hstack=inputs=2', row]);
    rows.push(row);
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', `vstack=inputs=${rows.length}`, out]);
  console.log('wrote', out);
} finally { await browser.close(); }
