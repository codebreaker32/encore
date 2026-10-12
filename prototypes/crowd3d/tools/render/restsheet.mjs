// One avatar's seated rest poses, front and side, the body and a close crop of the hands (avatar view, tv models, 1080p,
// its own seed). On the box.   node restsheet.mjs <page url> <out.png> <Avatar> [kind ...]
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, out, name, ...ks] = process.argv.slice(2);
const KINDS = ks.length ? ks : ['thighs', 'knees', 'thighKnee', 'clasped'];
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const seedOf = (name) => { let h = 7; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973; return 11 + h; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rows = [];
try {
  for (const k of KINDS) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}?view=avatar&name=${name}&pseed=${seedOf(name)}&preset=tv&res=1080&still&hud=0&state=listen&restpose=${k}&t=4`, { timeout: 240000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
    const file = `${out.replace(/\.png$/, '')}-${k}.png`;
    await page.screenshot({ path: file, timeout: 240000 });
    await page.close();
    const row = file.replace('.png', '-row.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex',
      `[0]crop=560:1010:200:30,scale=-2:1090[a];[0]crop=600:1010:1210:30,scale=-2:1090[b];[0]crop=440:300:260:470,scale=800:545[c];[0]crop=440:300:1300:470,scale=800:545[d];[c][d]vstack[cd];[a][b][cd]hstack=inputs=3,drawtext=fontfile=${FONT}:text='${name} · rest ${k} (front, side, hands front, hands side)':fontcolor=white:fontsize=24:x=10:y=8:box=1:boxcolor=black@0.6`, row]);
    rows.push(row);
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', `vstack=inputs=${rows.length}`, out]);
  console.log('wrote', out);
} finally { await browser.close(); }
