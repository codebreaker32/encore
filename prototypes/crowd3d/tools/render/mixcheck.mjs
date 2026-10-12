// The laugh mixes in host mode: cues at 0.3, 0.6 and 0.9 (twice each, then applause and a cheer), recorded from the
// page's own audio graph, with the layers each mix used (window.__mixes) and any errors, on the box.
//   node mixcheck.mjs <url with host=1> <out.webm>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => { window.__reports = []; window.ReactNativeWebView = { postMessage: (s) => window.__reports.push(JSON.parse(s)) }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__sound && window.__sound.ctx && window.__sound.pool, null, { timeout: 200000 });
  await page.evaluate(() => {
    const s = window.__sound, d = s.ctx.createMediaStreamDestination();
    s.duckGain.connect(d);
    window.__chunks = [];
    window.__rec = new MediaRecorder(d.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 96000 });
    window.__rec.ondataavailable = (e) => window.__chunks.push(e.data);
    window.__rec.start();
  });
  const post = (m) => page.evaluate((x) => window.postMessage(JSON.stringify(x), '*'), m);
  // each cue with the drive the TV sends alongside it (the reaction's envelope at 10 Hz), so the mix follows it as live
  const RISE = 0.25, HOLD = 1.6, TAIL = 1.2;
  const level = (s, age) => (age < 0 ? 0 : age < RISE ? (s * age) / RISE : age <= HOLD ? s : age >= HOLD + TAIL ? 0 : s * (1 - (age - HOLD) / TAIL));
  await post({ type: 'mode', mode: 'live' });
  let id0 = 0, t = 0;
  for (const [id, s] of [['laugh-small', 0.3], ['laugh-medium', 0.6], ['laugh-big', 0.9], ['laugh-small', 0.3], ['laugh-medium', 0.6], ['laugh-big', 0.9], ['applause-big', 0.85], ['cheer-big', 0.9]]) {
    const kind = id.split('-')[0], rid = id0++;
    await post({ type: 'cue', id, strength: s });
    const n = Math.round(10 * (2.2 + 4.4 * s));
    for (let i = 0; i < n; i++) {
      const age = i / 10, lv = level(s, age);
      await post({ type: 'drive', drive: { phase: 'live', now: t, speaking: false, silenceSec: 0, restless: 0, warmth: 0.4, attention: 0.7, deadBits: 0, reactions: lv > 0 || age < RISE ? [{ id: rid, kind, strength: s, age, level: lv, lineId: rid }] : [], heckle: null, finale: null } });
      await page.waitForTimeout(100); t += 0.1;
    }
  }
  // a dead bit and a heckle (the room's boo and groan: forced here, so the sample has them)
  await page.evaluate(() => window.__sound.react('dead', 'club', true));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__sound.react('heckle', 'club', true));
  await page.waitForTimeout(4000);
  const b64 = await page.evaluate(() => new Promise((res) => { window.__rec.onstop = async () => { const blob = new Blob(window.__chunks, { type: 'audio/webm' }); const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); }; window.__rec.stop(); }));
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(JSON.stringify({ mixes: await page.evaluate(() => window.__mixes()), errors: errors.slice(0, 5) }));
} finally { await browser.close(); }
