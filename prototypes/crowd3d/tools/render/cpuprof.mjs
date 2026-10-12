// Where the page's JS time goes, by function (self time), under a CPU throttle, on the box: a CDP CPU profile of a
// few seconds of the live page, summed by function name and file.
//   node cpuprof.mjs <url> [rate=8] [seconds=6] [top=30]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, rateS = '8', secS = '6', topS = '30'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rateS });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(+secS * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const dt = new Map(); // node id -> self samples
  for (const id of profile.samples) dt.set(id, (dt.get(id) || 0) + 1);
  const by = new Map(); let total = 0;
  for (const n of profile.nodes) {
    const c = dt.get(n.id) || 0; if (!c) continue;
    const f = n.callFrame, key = `${f.functionName || '(anon)'} ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`;
    by.set(key, (by.get(key) || 0) + c); total += c;
  }
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, +topS);
  for (const [k, c] of rows) console.log(`${((100 * c) / total).toFixed(1).padStart(5)}%  ${k}`);
  // INCL=1 adds the top functions by inclusive time (self plus everything they call)
  if (process.env.INCL) {
    const kids = new Map(profile.nodes.map((n) => [n.id, n.children || []])), node = new Map(profile.nodes.map((n) => [n.id, n]));
    const incl = new Map();
    const walk = (id, stack) => {
      const n = node.get(id), f = n.callFrame, key = `${f.functionName || '(anon)'} ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`;
      let sum = dt.get(id) || 0;
      for (const c of kids.get(id)) sum += walk(c, stack.concat(key));
      if (!stack.includes(key)) incl.set(key, (incl.get(key) || 0) + sum); // (recursion counted once)
      return sum;
    };
    walk(profile.nodes[0].id, []);
    console.log('inclusive:');
    for (const [k, c] of [...incl.entries()].filter(([k]) => !/^\((root|program|idle)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`${((100 * c) / total).toFixed(1).padStart(5)}%  ${k}`);
  }
  // LINES=<file> adds the hottest lines in that file's functions (from the profile's position ticks)
  if (process.env.LINES) {
    const lines = new Map();
    for (const n of profile.nodes) if ((n.callFrame.url || '').endsWith(process.env.LINES)) for (const t of n.positionTicks || []) lines.set(t.line, (lines.get(t.line) || 0) + t.ticks);
    console.log([...lines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([l, c]) => `${l}:${((100 * c) / total).toFixed(2)}%`).join('  '));
  }
} finally { await browser.close(); }
