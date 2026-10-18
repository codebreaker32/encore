// Time to the first frame, in host mode as the TV opens the page, at a CPU throttle (8× by default: the box's cores
// against the TV's A55s), then a venue change and the time to that room's first frame; whether the screen is black
// meanwhile (the held frame of the previous room), and the decoded audio once it has settled.
//   node ttff.mjs <page url without query (file:// or http://)> [venue=club] [next=theatre] [throttle=8]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue = 'club', next = 'theatre', rate = '8'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 962, height: 541 }, deviceScaleFactor: 1.33125 });
  await page.addInitScript(() => { window.__reports = []; window.ReactNativeWebView = { postMessage: (s) => window.__reports.push(JSON.parse(s)) }; });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rate });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`${base}?preset=tv&host=1&venue=${venue}&hud=0`, { timeout: 600000, waitUntil: 'commit' });
  await page.waitForFunction(() => document.body && document.body.dataset.ready === '1', null, { timeout: 600000, polling: 200 });
  const first = (Date.now() - t0) / 1000;
  await page.waitForFunction(() => document.body.dataset.front === '1' || !window.__load, null, { timeout: 600000, polling: 200 }); // (an older pack has no streamed front)
  const frontS = (Date.now() - t0) / 1000;
  // the host's own messages: 'first' (the first frame) and 'ready' (the room whole, front people shown: the shell's plate lifts)
  await page.waitForFunction(() => window.__reports.some((r) => r.type === 'ready'), null, { timeout: 600000, polling: 100 });
  const readyMsgS = (Date.now() - t0) / 1000;
  const loadLine = await page.evaluate(() => (window.__load ? window.__load().line : null)); // (with the front people's mark)
  const post = (m) => page.evaluate((x) => window.postMessage(JSON.stringify(x), '*'), m);
  await post({ type: 'mode', mode: 'preview' });
  await page.waitForTimeout(4000);
  // the venue change: the page reloads into the next room
  const t1 = Date.now();
  await post({ type: 'venue', venue: next, act: 'standup' });
  await page.waitForURL((u) => u.toString().includes(`venue=${next}`), { timeout: 60000 });
  const reloadAt = (Date.now() - t1) / 1000;
  // is anything on screen while the new room loads? (the held frame)
  let holdSeen = false;
  for (let i = 0; i < 20 && !holdSeen; i++) { holdSeen = await page.evaluate(() => { const h = document.getElementById('hold'); return !!(h && h.style.display === 'block' && h.src); }).catch(() => false); if (!holdSeen) await page.waitForTimeout(250); }
  await page.waitForFunction(() => document.body && document.body.dataset.ready === '1', null, { timeout: 600000, polling: 200 });
  const second = (Date.now() - t1) / 1000;
  await page.waitForFunction(() => window.__reports.some((r) => r.type === 'ready'), null, { timeout: 600000, polling: 100 });
  const secondReady = (Date.now() - t1) / 1000;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
  await page.waitForTimeout(8000);
  const audio = await page.evaluate(() => (window.__audioMB ? window.__audioMB() : null)).catch(() => null);
  console.log(JSON.stringify({ throttle: +rate, firstFrameS: first, frontInS: frontS, readyMsgS, load: loadLine, venueChange: { reloadAfterS: reloadAt, firstFrameAfterS: second, readyMsgAfterS: secondReady, heldFrameShown: holdSeen }, audio, errors: errors.slice(0, 3) }));
} finally { await browser.close(); }
