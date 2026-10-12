// The crowd's own JS per frame under a CPU throttle, on the build box: loads the page in capture mode (no render
// loop), then times Person.update for every front person (all of them each frame: no half rate, a worst case) plus the
// instanced crowd's update, stepping the clock at 30 fps. Prints p50 / p90 / max in ms.
//   node jsbench.mjs <url with &capture=1> [rate=8] [t0=0.5] [frames=90]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, rateS = '8', t0S = '0.5', nS = '90'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
  // find the instanced crowd object: its update() is called by a frame
  await page.evaluate((t0) => {
    const I = window.__InstancedCrowd && window.__InstancedCrowd.prototype;
    if (I) { const u = I.update; I.update = function (...a) { window.__ic = this; return u.apply(this, a); }; }
    window.__renderAt(t0 - 0.1); window.__renderAt(t0 - 0.05);
  }, +t0S);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rateS });
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start'); }
  const r = await page.evaluate(({ t0, n }) => {
    const P = window.__people, room = window.__room, ic = window.__ic, ppl = [], ins = [];
    for (let i = 0; i < n; i++) {
      const t = t0 + i / 30;
      room.now = t;
      const a = performance.now();
      for (const p of P) if (!p.hidden) p.update(t, room);
      const b = performance.now();
      if (ic) ic.update(t, room);
      ins.push(performance.now() - b); ppl.push(b - a);
    }
    // whole frames (behaviour + three.js render submission), at the same times
    const fr = [], rn = [];
    let r0 = 0, rt = 0;
    window.__scene.onBeforeRender = () => { r0 = performance.now(); };
    window.__scene.onAfterRender = () => { rt += performance.now() - r0; };
    for (let i = 0; i < n; i++) { rt = 0; const a = performance.now(); window.__renderAt(t0 + i / 30); fr.push(performance.now() - a); rn.push(rt); }
    return { ppl, ins, fr, rn, people: P.length };
  }, { t0: +t0S, n: +nS });
  if (process.env.PROFILE) {
    // self time by function over the timed loops (people, instances and whole frames)
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas, total = dt.reduce((a, b) => a + b, 0);
    profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt[i]); });
    console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, +process.env.PROFILE || 25).map(([k, v]) => `${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`).join('\n'));
    // inclusive time of the crowd's own functions (people.js, anim.js, instances.js, traffic.js)
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const incl = new Map();
    profile.samples.forEach((id, i) => {
      const seen = new Set();
      for (let x = id; x !== undefined; x = parent.get(x)) {
        const f = byId.get(x).callFrame, file = f.url.split('/').pop();
        if (!/^(people|anim|instances|traffic)\.js$/.test(file)) continue;
        const k = `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`;
        if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) || 0) + dt[i]);
      }
    });
    console.log('-- inclusive --\n' + [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => `${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`).join('\n'));
  }
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const tot = r.ppl.map((x, i) => x + r.ins[i]);
  const pq = (a) => `p50 ${q(a, 0.5).toFixed(2)} p90 ${q(a, 0.9).toFixed(2)}`;
  console.log(`rate ${rateS}× · ${r.people} front · crowd JS ${pq(tot)} max ${Math.max(...tot).toFixed(1)} ms · Person.update (all front) ${pq(r.ppl)} · instances ${pq(r.ins)} · whole frame ${pq(r.fr)} · of which render ${pq(r.rn)}`);
} finally { await browser.close(); }
