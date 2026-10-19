// Arm trace (arm-v2, 19 Oct): the jumpprobe stretch for the named people, printing every frame where a bone turns more
// than 8 degrees with the arm passes that ran that frame and the frame before (people.js _tr, window.__armTrace).
// ALL=<name> FROM=<s> TO=<s> prints every frame of that person in that window.
//   node armtrace.mjs <page url> <venue> <extra query> <seconds> <name,name,...>
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
// armtrace: node armtrace.mjs <page> <venue> <extra> <seconds> <names,comma>
const NAMES = (process.argv[6] || '').split(',');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage && window.__cutTo, null, { timeout: 240000 });
  await page.evaluate((NAMES) => {
    window.__armTrace = NAMES;
    const T3 = window.__THREE, q = new T3.Quaternion();
    const BONES = ['spine1', 'spine2', 'neck', 'lClav', 'rClav', 'lUpper', 'rUpper', 'lFore', 'rFore', 'lHand', 'rHand'];
    const prev = new Map();
    window.__atStep = () => {
      const out = [];
      for (const p of window.__people) {
        if (!NAMES.includes(p.name) || !p.rig) continue;
        let pv = prev.get(p); if (!pv) prev.set(p, (pv = {}));
        const ds = {};
        for (const n of BONES) { const b = p.rig.b[n]; if (!b) continue; b.getWorldQuaternion(q); const o = pv[n]; if (o) ds[n] = +(2 * Math.acos(Math.min(1, Math.abs(o.x * q.x + o.y * q.y + o.z * q.z + o.w * q.w))) * 180 / Math.PI).toFixed(1); pv[n] = { x: q.x, y: q.y, z: q.z, w: q.w }; }
        out.push({ who: p.name, ds, tr: (p._tr || []).join(' '), doing: p._doing, fb: p._fellBack, rest: p._resting });
      }
      return out;
    };
  }, NAMES);
  for (let t = 0; t < T0; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__cutTo(-1); window.__renderAt(t); }, { t, d: drive(t) });
  const last = {};
  for (let f = 0; f <= DUR * FPS; f++) {
    const t = +(T0 + f / FPS).toFixed(4);
    const out = await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); return window.__atStep(); }, { t, d: drive(t) });
    for (const r of out) {
      const mx = Math.max(0, ...Object.values(r.ds));
      if (mx > 8 || (process.env.ALL === r.who && t - T0 >= +(process.env.FROM || 0) && t - T0 <= +(process.env.TO || 99))) console.log(`t=${(t - T0).toFixed(2)} ${r.who} max=${mx} ${JSON.stringify(r.ds)}\n   prev: ${last[r.who] ? last[r.who].tr : ''}\n   now:  ${r.tr} | ${r.doing} fb=${r.fb} rest=${r.rest}`);
      last[r.who] = r;
    }
  }
} finally { await browser.close(); }
