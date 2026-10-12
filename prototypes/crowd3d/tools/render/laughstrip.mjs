// Six successive laughs in host mode (index.html?host=1), each with the TV's reaction cut and its cut-sheet snapshot
// 700 ms after the cut, so the strip can be checked for repeats (tools/render/phash.py).
//   node laughstrip.mjs <url> <outdir> [venue] [laughs=6] [gap seconds=9]
// Writes <outdir>/thumb-<n>.jpg (the page's own 320×180 thumbs), close-<n>.png (the screen 1 s into each close-up) and
// strip.json (the shot and setup each thumb caught).
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, outdir, venue = 'club', nArg = '6', gapArg = '9'] = process.argv.slice(2);
const N = +nArg, GAP = +gapArg;
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const RISE = 0.25, HOLD = 1.6, TAIL = 1.2;
const level = (s, age) => (age < 0 ? 0 : age < RISE ? (s * age) / RISE : age <= HOLD ? s : age >= HOLD + TAIL ? 0 : s * (1 - (age - HOLD) / TAIL));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { window.__reports = []; window.ReactNativeWebView = { postMessage: (s) => window.__reports.push(JSON.parse(s)) }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(url);
  const post = (msg) => page.evaluate((m) => window.postMessage(JSON.stringify(m), '*'), msg);
  let t = 0;
  const drive = (extra = {}) => ({ phase: 'live', now: t, speaking: true, silenceSec: 0, restless: 0, warmth: 0.4, attention: 0.7, deadBits: 0, reactions: [], heckle: null, finale: null, ...extra });
  const tick = async (d) => { await post({ type: 'drive', drive: d }); await page.waitForTimeout(100); t += 0.1; };
  await post({ type: 'venue', venue, act: 'standup' });
  await post({ type: 'mode', mode: 'live' });
  await post({ type: 'shot', kind: 'wide' });
  for (let i = 0; i < 10; i++) await tick(drive());
  await page.waitForFunction(() => window.__reports.some((r) => r.type === 'ready'), null, { timeout: 180000 });
  for (let i = 0; i < 40; i++) await tick(drive());
  const caught = [];
  for (let k = 0; k < N; k++) {
    const s = [0.8, 0.55, 0.9, 0.45, 0.75, 0.65][k % 6], t0 = t;
    await post({ type: 'cue', id: s < 0.7 ? 'laugh-medium' : 'laugh-big', strength: s });
    let cutAt = null;
    for (let i = 0; i < GAP * 10; i++) {
      const age = t - t0;
      if (Math.abs(age - 0.3) < 0.05) { await post({ type: 'shot', kind: 'reaction', focus: k }); cutAt = t; }
      if (cutAt !== null && Math.abs(t - cutAt - 0.7) < 0.05) await post({ type: 'snap', key: `laugh-${k}` });
      if (Math.abs(age - 3.2) < 0.05) await post({ type: 'shot', kind: 'wide' });
      const r = { id: k, kind: 'laugh', strength: s, age, level: level(s, age), lineId: 10 + k };
      await tick(drive({ reactions: r.level > 0 || age < RISE ? [r] : [] }));
      if (Math.abs(age - 1.3) < 0.05) {
        await page.screenshot({ path: `${outdir}/close-${k}.png` });
        caught.push(await page.evaluate(() => (window.__shot ? window.__shot() : null)));
      }
    }
  }
  for (let i = 0; i < 20; i++) await tick(drive());
  const reports = await page.evaluate(() => window.__reports);
  const thumbs = reports.filter((r) => r.type === 'thumb');
  for (const th of thumbs) fs.writeFileSync(`${outdir}/thumb-${th.key.replace(/\D/g, '')}.jpg`, Buffer.from(th.uri.split(',')[1], 'base64'));
  fs.writeFileSync(`${outdir}/strip.json`, JSON.stringify({ caught, thumbs: thumbs.map((th) => th.key) }, null, 1));
  console.log(JSON.stringify({ thumbs: thumbs.length, caught, errors: errors.slice(0, 5) }));
} finally { await browser.close(); }
