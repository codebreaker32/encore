// Which functions allocate in a live page (on the box): V8's sampling heap profiler for N seconds, top allocation sites
// by bytes (functions, file:line). Per-frame garbage shows up as GC pauses on the TV's slow cores.
//   node allocprof.mjs <url> [seconds=10]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, secs = '10'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await page.waitForTimeout(+secs * 1000);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const self = new Map();
  const walk = (n) => {
    const f = n.callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
    const bytes = (n.selfSize || 0);
    if (bytes) self.set(key, (self.get(key) || 0) + bytes);
    for (const c of n.children || []) walk(c);
  };
  walk(profile.head);
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`sampled ${(total / 1048576 / +secs).toFixed(2)} MB/s`);
  for (const [k, b] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`${(b / 1024 / +secs).toFixed(0).padStart(6)} KB/s  ${k}`);
} finally { await browser.close(); }
