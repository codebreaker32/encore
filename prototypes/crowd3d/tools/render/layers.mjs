// What each correction layer does to the captures: the motionstrip drive (1.5 s of listening, then a big laugh), at six
// moments, for every front person: each bone group's turn away from the raw capture (&raw=1, the same seed), in degrees,
// and the anatomy findings at those moments. One page per configuration (the extra query, e.g. &off=look).
//   node layers.mjs <page url without query> <venue> <label=extra> [label=extra ...]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, ...cfgs] = process.argv.slice(2);
const LAUGH = 12, TS = [10.5, 11.5, 12.5, 13.0, 13.5, 14.0];
const drive = (t) => { const a = t - LAUGH, rs = []; if (a > 0 && a < 6) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: a, level: 0.9 * Math.min(1, a / 0.4) * (a < 3 ? 1 : Math.max(0, 1 - (a - 3) / 2)) }); return { attention: 0.8, warmth: 0.6, reactions: rs }; };
const GROUPS = { head: ['head'], chest: ['spine2'], pelvis: ['pelvis'], arms: ['lUpper', 'rUpper', 'lFore', 'rFore'], hands: ['lHand', 'rHand'], legs: ['lThigh', 'rThigh', 'lCalf', 'rCalf'] };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const run = async (extra) => {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
  for (let t = 0; t < 10.5 - 1e-6; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); }, { t, d: drive(t) });
  const snaps = [];
  for (let t = 10.5; t <= 14.0 + 1e-6; t = +(t + 0.1).toFixed(2)) {
    const want = TS.some((x) => Math.abs(x - t) < 1e-6);
    const r = await page.evaluate(({ t, d, want, GROUPS }) => {
      window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t);
      if (!want) return null;
      const T = window.__THREE, q = {}, inv = new T.Quaternion();
      for (const p of window.__people.filter((x) => x.kind === 'front' && !x.hidden)) {
        inv.setFromRotationMatrix(p.rig.seat.matrixWorld).invert();
        const e = {};
        for (const names of Object.values(GROUPS)) for (const n of names) { const b = p.rig.b[n]; if (!b) continue; const w = new T.Quaternion(); b.getWorldQuaternion(w); w.premultiply(inv); e[n] = w.toArray(); }
        q[p.name] = e;
      }
      const a = window.__anatomy ? window.__anatomy() : null, h = window.__handCheck ? window.__handCheck() : [];
      const found = a ? [...a.joints.map((x) => 'joint ' + x.joint), ...a.collisions.map((x) => 'collision ' + x.what), ...a.posture.map((x) => 'posture ' + x.posture), ...(a.limbs || []).map((x) => 'limbs ' + x.what), ...h.map((x) => 'hand ' + (x.what || x.in))] : [];
      return { t, q, found };
    }, { t, d: drive(t), want, GROUPS });
    if (r) snaps.push(r);
  }
  await page.close();
  return snaps;
};
const ang = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI; };
try {
  const raw = await run('&raw=1');
  for (const c of cfgs) {
    const k = c.indexOf('='), label = k < 0 ? c : c.slice(0, k), extra = k < 0 ? '' : c.slice(k + 1);
    const snaps = await run(extra);
    const sum = {}, cnt = {}, found = {};
    snaps.forEach((s, i) => {
      for (const [name, e] of Object.entries(s.q)) {
        const r = raw[i].q[name]; if (!r) continue;
        for (const [g, names] of Object.entries(GROUPS)) for (const n of names) if (e[n] && r[n]) { sum[g] = (sum[g] || 0) + ang(e[n], r[n]); cnt[g] = (cnt[g] || 0) + 1; }
      }
      for (const f of s.found) found[f] = (found[f] || 0) + 1;
    });
    const dev = Object.keys(GROUPS).map((g) => `${g} ${(sum[g] / (cnt[g] || 1)).toFixed(1)}°`).join(' · ');
    const nf = Object.values(found).reduce((a, b) => a + b, 0);
    console.log(`${venue} ${label.padEnd(10)} turn from the capture: ${dev} | anatomy ${nf}${nf ? ' ' + JSON.stringify(found) : ''}`);
  }
} finally { await browser.close(); }
