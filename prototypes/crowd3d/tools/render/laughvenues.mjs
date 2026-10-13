// Four consecutive laughs in one venue, in host mode, recorded from the page's own audio graph (sound.js), with the
// TV's reaction cut for each (so a close-up can put its laugher's voice forward), and the mix each laugh used.
//   node laughvenues.mjs <url with host=1&venue=V> <out.webm> [strengths=0.5,0.85,0.35,0.95] [gap s=7]
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, out, sArg = '0.5,0.85,0.35,0.95', gapArg = '7'] = process.argv.slice(2);
const SS = sArg.split(',').map(Number), GAP = +gapArg;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => { window.__reports = []; window.ReactNativeWebView = { postMessage: (s) => window.__reports.push(JSON.parse(s)) }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__sound && window.__sound.ctx && window.__sound.pool && window.__sound.voices, null, { timeout: 240000 });
  const venue = new URL(url).searchParams.get('venue');
  const post = (m) => page.evaluate((x) => window.postMessage(JSON.stringify(x), '*'), m);
  await post({ type: 'venue', venue, act: 'standup' });
  await post({ type: 'mode', mode: 'live' });
  await post({ type: 'shot', kind: 'wide' });
  await page.evaluate(() => {
    const s = window.__sound, d = s.ctx.createMediaStreamDestination();
    s.duckGain.connect(d);
    window.__chunks = [];
    window.__rec = new MediaRecorder(d.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
    window.__rec.ondataavailable = (e) => window.__chunks.push(e.data);
    window.__rec.start();
  });
  const RISE = 0.25, HOLD = 1.6, TAIL = 1.2;
  const level = (s, age) => (age < 0 ? 0 : age < RISE ? (s * age) / RISE : age <= HOLD ? s : age >= HOLD + TAIL ? 0 : s * (1 - (age - HOLD) / TAIL));
  let t = 0;
  for (let k = 0; k < SS.length; k++) {
    const s = SS[k], rid = 50 + k;
    await post({ type: 'cue', id: s < 0.35 ? 'laugh-small' : s < 0.7 ? 'laugh-medium' : 'laugh-big', strength: s });
    for (let i = 0; i < GAP * 10; i++) {
      const age = i / 10, lv = level(s, age);
      if (i === 3) await post({ type: 'shot', kind: 'reaction', focus: rid });
      if (i === 32) await post({ type: 'shot', kind: 'wide' });
      await post({ type: 'drive', drive: { phase: 'live', now: t, speaking: false, silenceSec: 0, restless: 0, warmth: 0.4, attention: 0.7, deadBits: 0, reactions: lv > 0 || age < RISE ? [{ id: rid, kind: 'laugh', strength: s, age, level: lv, lineId: rid }] : [], heckle: null, finale: null } });
      await page.waitForTimeout(100); t += 0.1;
    }
  }
  await page.waitForTimeout(1500);
  const b64 = await page.evaluate(() => new Promise((res) => { window.__rec.onstop = async () => { const blob = new Blob(window.__chunks, { type: 'audio/webm' }); const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(blob); }; window.__rec.stop(); }));
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(JSON.stringify({ venue, mixes: await page.evaluate(() => window.__mixes()), errors: errors.slice(0, 5) }));
} finally { await browser.close(); }
