// The TV web app over the crowd page (on the box): replay a set, end it, and check that the cut sheet's strip is
// filled with this set's own frames (the page's `thumb` replies to the TV's `snap`).
//   node cutsheet.mjs <outdir> [url] [seconds before Enter]
// DIAG=1 also saves every thumb as <outdir>/thumbs/<n>-<key>.jpg, logs the shot/snap/mode/venue/cue messages the page
// received and the first drive that carried each reaction (with the page's clock) in rx.json, and main-thread stalls
// over 250 ms in the app and in the crowd frame in stalls.json. SHOTS=1 screenshots the live screen every 15 s.
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [outdir = '/tmp/cut', url = 'http://localhost:8082/?demo=club&t=200&crowd=3d', waitS = '45'] = process.argv.slice(2);
const DIAG = !!process.env.DIAG;
fs.mkdirSync(outdir, { recursive: true });
if (DIAG) fs.mkdirSync(`${outdir}/thumbs`, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // count snaps and thumbs crossing the iframe boundary (this runs in the app's page and in the crowd iframe)
  await page.addInitScript((diag) => {
    window.__thumbs = [];
    window.__rx = [];
    const t0 = performance.now();
    const seen = new Set();
    const now = () => +((performance.now() - t0) / 1000).toFixed(2);
    addEventListener('message', (e) => {
      const m = typeof e.data === 'string' ? (() => { try { return JSON.parse(e.data); } catch { return {}; } })() : e.data;
      if (!m) return;
      if (m.type === 'thumb') window.__thumbs.push({ key: m.key, len: m.uri.length, head: m.uri.slice(0, 23), uri: diag ? m.uri : undefined, at: now() });
      if (['shot', 'snap', 'mode', 'venue', 'cue'].includes(m.type)) window.__rx.push({ at: now(), ...m });
      // the first drive that carries each reaction, with the age the TV gave it
      if (m.type === 'drive' && m.drive && m.drive.reactions) for (const r of m.drive.reactions) if (!seen.has(r.id + r.kind)) { seen.add(r.id + r.kind); window.__rx.push({ at: now(), type: 'drive+', id: r.id, kind: r.kind, age: r.age, level: r.level }); }
    });
    // main-thread stalls in this frame: gaps over 250 ms in a 50 ms interval
    window.__stalls = [];
    // (wall: seconds on the machine's clock, the same in both frames)
    const wall = () => +(((performance.timeOrigin + performance.now()) / 1000) % 100000).toFixed(2);
    window.__wall0 = wall() - now();
    if (diag) { let last = performance.now(); setInterval(() => { const p = performance.now(); if (p - last > 250) window.__stalls.push({ at: now(), wall: wall(), ms: Math.round(p - last) }); last = p; }, 50); }
  }, DIAG);
  await page.goto(url, { timeout: 300000, waitUntil: 'load' });
  if (process.env.SHOTS) {
    for (let s = 0; s < +waitS; s += 15) {
      await page.waitForTimeout(Math.min(15, +waitS - s) * 1000);
      await page.screenshot({ path: `${outdir}/live-${String(s + 15).padStart(3, '0')}.png` });
    }
  } else await page.waitForTimeout(+waitS * 1000);
  await page.screenshot({ path: `${outdir}/live.png` });
  await page.keyboard.press('Enter'); // end the set
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${outdir}/cutsheet.png` });
  const thumbs = await page.evaluate(() => window.__thumbs);
  const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => (i.currentSrc || i.src || '').startsWith('data:image/jpeg')).length);
  const crowdFrame = page.frames().find((f) => f.url().includes(':8091'));
  const frames = page.frames().map((f) => f.url()).filter((u) => u.includes(':8091'));
  if (DIAG) {
    thumbs.forEach((t, i) => { if (t.uri) fs.writeFileSync(`${outdir}/thumbs/${String(i).padStart(2, '0')}-${t.key.replace(/[^\w.@-]/g, '_')}.jpg`, Buffer.from(t.uri.split(',')[1], 'base64')); });
    const rx = crowdFrame ? await crowdFrame.evaluate(() => window.__rx) : [];
    fs.writeFileSync(`${outdir}/rx.json`, JSON.stringify(rx.map((m) => ({ ...m, drive: undefined })), null, 1));
    const stalls = {
      app: await page.evaluate(() => ({ wall0: window.__wall0, list: window.__stalls })),
      crowd: crowdFrame ? await crowdFrame.evaluate(() => ({ wall0: window.__wall0, list: window.__stalls })) : null,
    };
    fs.writeFileSync(`${outdir}/stalls.json`, JSON.stringify(stalls, null, 1));
  }
  console.log(JSON.stringify({ thumbs: thumbs.length, keys: thumbs.map((t) => t.key), sizes: thumbs.map((t) => t.len), jpegImgsInPage: imgs, frames, errors: errors.slice(0, 3) }));
} finally { await browser.close(); }
