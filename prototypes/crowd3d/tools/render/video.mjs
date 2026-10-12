// Frame-exact video on the build box: the page runs with &capture=1, this steps its clock with window.__renderAt(t)
// and grabs each frame, then ffmpeg encodes H.264 (so SwiftShader's slowness never shows as a dropped frame).
//   node video.mjs <out.mp4> <url-with-capture=1> <t0> <t1> [fps=25] [w=1280] [h=720]
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [out, url, t0s, t1s, fpsS = '25', wS = '1280', hS = '720'] = process.argv.slice(2);
const t0 = +t0s, t1 = +t1s, fps = +fpsS;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crowdvid-'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: +wS, height: +hS } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function', null, { timeout: 240000 });
  const n = Math.round((t1 - t0) * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.__renderAt(t), t0 + i / fps);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
    if (i % 50 === 0) console.log('frame', i, '/', n);
  }
} finally { await browser.close(); }
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(dir, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium', '-movflags', '+faststart', out]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(out, (fs.statSync(out).size / 1048576).toFixed(2), 'MB');
