// Pose jumps in a laugh (laugh-v2, 19 Oct): steps a host-driven stretch of a set at 30 fps (six laughs, some
// overlapping, strengths 0.4-0.95) and measures, for every front person, how far each major bone turns in the world
// from one frame to the next. A turn of more than 15 degrees in one frame is a glitch (the user's rule); 8 degrees is
// reported as a warning. Prints the counts, the worst frames and a per-second histogram of the room's largest turn.
//   node jumpprobe.mjs <page url> <venue> [extra query] [seconds=20]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, extra = '', secArg = '20'] = process.argv.slice(2);
const DUR = +secArg, FPS = 30, T0 = 2;
// the stretch of set: [start, strength] per laugh; each rises over 0.4 s, holds to 1.2 + 2 s × strength, falls over 1.5 s
const LAUGHS = [[3, 0.9], [6.5, 0.5], [8, 0.7], [12, 0.95], [13.6, 0.4], [17, 0.6]];
const drive = (t) => {
  const rs = [];
  LAUGHS.forEach(([t0, s], i) => {
    const a = t - t0, hold = 1.2 + 2 * s;
    if (a > 0 && a < hold + 1.5) rs.push({ id: 60 + i, kind: 'laugh', strength: s, age: a, level: s * Math.min(1, a / 0.4) * (a < hold ? 1 : Math.max(0, 1 - (a - hold) / 1.5)) });
  });
  return { attention: 0.8, warmth: 0.6, reactions: rs };
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage && window.__cutTo, null, { timeout: 240000 });
  await page.evaluate(() => {
    const T3 = window.__THREE, q = new T3.Quaternion();
    const BONES = ['spine2', 'neck', 'head', 'lClav', 'rClav', 'lUpper', 'rUpper', 'lFore', 'rFore', 'lHand', 'rHand'];
    window.__jp = { prev: new Map(), BONES };
    window.__jpStep = () => {
      const out = [];
      for (const p of window.__people) {
        if (p.kind !== 'front' || p.hidden || !p.rig) continue;
        let pv = window.__jp.prev.get(p);
        if (!pv) { pv = {}; window.__jp.prev.set(p, pv); }
        const was = pv._doing; pv._doing = p._doing;
        for (const n of BONES) {
          const b = p.rig.b[n];
          if (!b) continue;
          b.getWorldQuaternion(q);
          const o = pv[n];
          if (o) { const d = 2 * Math.acos(Math.min(1, Math.abs(o.x * q.x + o.y * q.y + o.z * q.z + o.w * q.w))) * 180 / Math.PI; if (d > 3) out.push([p.name || p.seed, n, +d.toFixed(1), d > 15 ? `${was} -> ${p._doing}` : '']); }
          pv[n] = { x: q.x, y: q.y, z: q.z, w: q.w };
        }
      }
      return out;
    };
  });
  // settle at 0.25 s steps, then 30 fps through the stretch
  for (let t = 0; t < T0; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__cutTo(-1); window.__renderAt(t); }, { t, d: drive(t) });
  const jumps = [], perSec = new Array(Math.ceil(DUR)).fill(0);
  let frames = 0;
  for (let f = 0; f <= DUR * FPS; f++) {
    const t = +(T0 + f / FPS).toFixed(4);
    const out = await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); return window.__jpStep(); }, { t, d: drive(t) });
    frames++;
    if (f === 0) continue;
    for (const [who, bone, d, why] of out) { jumps.push({ t: +(t - T0).toFixed(2), who, bone, d, why }); const s = Math.min(perSec.length - 1, Math.floor(t - T0)); perSec[s] = Math.max(perSec[s], d); }
  }
  const over15 = jumps.filter((j) => j.d > 15), over8 = jumps.filter((j) => j.d > 8);
  jumps.sort((a, b) => b.d - a.d);
  console.log(JSON.stringify({ venue, extra, frames, over15: over15.length, over8: over8.length, worst: jumps.slice(0, 12), byWho: Object.entries(over15.reduce((m, j) => { const k = `${j.who}:${j.bone}`; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12), perSecMax: perSec.map((x) => +x.toFixed(1)), errs: errs.slice(0, 3) }));
} finally { await browser.close(); }
