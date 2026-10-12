// Where a live page's main thread goes (on the box): a Chromium trace of N seconds with GC events, plus the JS heap's
// allocation rate. SwiftShader makes GPU times meaningless here, but garbage collection and JS cost are real CPU work
// (the box is several times faster than the TV's Cortex-A55, so scale them up).
//   node gctrace.mjs <url> [seconds=15]
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, secs = '15'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const path = `/tmp/gctrace-${Date.now()}.json`;
  await browser.startTracing(page, { path, categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc', 'blink.user_timing'] });
  // allocation rate: the heap grows between collections; sum the growth
  const heap = await page.evaluate(async (ms) => {
    const out = []; const t0 = performance.now();
    while (performance.now() - t0 < ms) { out.push(performance.memory.usedJSHeapSize); await new Promise((r) => setTimeout(r, 50)); }
    let grow = 0; for (let i = 1; i < out.length; i++) if (out[i] > out[i - 1]) grow += out[i] - out[i - 1];
    return { mbPerSec: +(grow / 1048576 / (ms / 1000)).toFixed(2), heapMB: +(out[out.length - 1] / 1048576).toFixed(1) };
  }, +secs * 1000);
  await browser.stopTracing();
  const ev = JSON.parse(fs.readFileSync(path, 'utf8')).traceEvents || [];
  const sum = {};
  for (const e of ev) {
    if (e.ph !== 'X' || !e.dur) continue;
    const n = e.name;
    if (!/GC|Scavenge|MarkCompact|FunctionCall|RunTask|Animation Frame|FireAnimationFrame|Layout|Paint|UpdateLayer|CompositeLayers|ParseHTML|EvaluateScript/.test(n)) continue;
    const s = (sum[n] ||= { n: 0, ms: 0, max: 0 });
    s.n++; s.ms += e.dur / 1000; s.max = Math.max(s.max, e.dur / 1000);
  }
  const rows = Object.entries(sum).sort((a, b) => b[1].ms - a[1].ms).slice(0, 14).map(([k, s]) => `${k.padEnd(34)} n ${String(s.n).padStart(5)}  total ${s.ms.toFixed(0).padStart(6)} ms  max ${s.max.toFixed(1)} ms`);
  console.log(JSON.stringify(heap));
  console.log(rows.join('\n'));
  fs.unlinkSync(path);
} finally { await browser.close(); }
