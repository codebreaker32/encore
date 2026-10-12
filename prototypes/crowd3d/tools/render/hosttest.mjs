// Plays the TV host's protocol (venue, mode, shot, drive at 10 Hz, cue, duck) against index.html?host=1 on the box.
//   node hosttest.mjs <url> <outdir> [venue]
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, outdir, venue = 'club'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const RISE = 0.25, HOLD = 1.6, TAIL = { laugh: 1.2, heckle: 3, applause: 1.5, cheer: 1.8 };
const level = (kind, s, age) => age < 0 ? 0 : age < RISE ? s * age / RISE : age <= HOLD ? s : age >= HOLD + TAIL[kind] ? 0 : s * (1 - (age - HOLD) / TAIL[kind]);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { window.__reports = []; window.ReactNativeWebView = { postMessage: (s) => window.__reports.push(JSON.parse(s)) }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(url);
  const post = (msg, asString) => page.evaluate(([m, str]) => window.postMessage(str ? JSON.stringify(m) : m, '*'), [msg, asString]);
  let t = 0;
  const drive = (extra = {}) => ({ phase: 'live', now: t, speaking: false, silenceSec: 0, restless: 0, warmth: 0.2, attention: 0.65, deadBits: 0, reactions: [], heckle: null, finale: null, ...extra });
  const tick = async (d) => { await post({ type: 'drive', drive: d }, true); await page.waitForTimeout(100); t += 0.1; };
  await post({ type: 'venue', venue, act: 'standup' }, true);
  await post({ type: 'mode', mode: 'preview' }, false);
  for (let i = 0; i < 10; i++) await tick(drive({ phase: 'armed' }));
  await page.waitForFunction(() => window.__reports.some((r) => r.type === 'ready'), null, { timeout: 180000 });
  for (let i = 0; i < 30; i++) await tick(drive({ phase: 'armed' }));
  await page.screenshot({ path: `${outdir}/host-preview.png` });
  await post({ type: 'mode', mode: 'live' }, true);
  await post({ type: 'shot', kind: 'wide' }, false);
  for (let i = 0; i < 10; i++) await tick(drive({ speaking: true }));
  // a laugh at 0.8, with its cue; the MC ducks the room halfway through
  const t0 = t;
  await post({ type: 'cue', id: 'laugh-big', strength: 0.8 }, true);
  for (let i = 0; i < 34; i++) {
    const age = t - t0;
    const r = { id: 0, kind: 'laugh', strength: 0.8, age, level: level('laugh', 0.8, age), lineId: 7 };
    if (Math.abs(age - 0.3) < 0.05) await post({ type: 'shot', kind: 'reaction', focus: 0 }, true);
    if (Math.abs(age - 2.0) < 0.05) await post({ type: 'duck', on: true }, true);
    if (Math.abs(age - 2.8) < 0.05) { await post({ type: 'shot', kind: 'wide' }, true); await post({ type: 'duck', on: false }, true); }
    await tick(drive({ reactions: r.level > 0 || age < RISE ? [r] : [], warmth: 0.5, attention: 0.8 }));
    if (Math.abs(age - 1.3) < 0.05) await page.screenshot({ path: `${outdir}/host-laugh.png` });
  }
  // the finale with applause, then the after mode
  await post({ type: 'shot', kind: 'finale' }, true);
  await post({ type: 'cue', id: 'applause-big', strength: 0.9 }, true);
  for (let i = 0; i < 22; i++) await tick(drive({ phase: 'done', finale: { strength: 0.9 }, attention: 0.7, warmth: 0.8 }));
  await page.screenshot({ path: `${outdir}/host-finale.png` });
  await post({ type: 'mode', mode: 'after' }, true);
  for (let i = 0; i < 120; i++) await tick(drive({ phase: 'done', finale: { strength: 0.9 } }));
  await page.screenshot({ path: `${outdir}/host-after.png` });
  const reports = await page.evaluate(() => window.__reports);
  const audio = reports.filter((r) => r.type === 'audio').map((r) => r.state);
  console.log(JSON.stringify({ reports: reports.length, ready: reports.some((r) => r.type === 'ready'), audio, stats: reports.filter((r) => r.type === 'stats').slice(-1)[0], errors }));
} finally { await browser.close(); }
