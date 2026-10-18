// life-v1 numbers, on the build box: the motionstrip drive (listening, then a big laugh at t=12, strength 0.9) stepped at
// 0.1 s, and for every front person the movement of the head, the chest (Spine2) and the shoulders (clavicles' ends):
//  - listen: over 9-12 s, each part's range (cm) — breathing, drift; "frozen" = head and chest both under 0.5 cm
//  - onset: the time each person's chest or head first moves 1.5 cm from where it was at t=12 (the laugh's measured moment)
//  - laugh: the chest's and shoulders' range over 12-15 s (cm): the heave
// Prints a JSON summary: counts of people reacting within 0.5 / 1.0 s, the median onset, mean ranges.
//   node liveprobe.mjs <page url without query> <venue> [extra query]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, extra = ''] = process.argv.slice(2);
const LAUGH = 12;
const drive = (t) => { const a = t - LAUGH, rs = []; if (a > 0 && a < 6) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: a, level: 0.9 * Math.min(1, a / 0.4) * (a < 3 ? 1 : Math.max(0, 1 - (a - 3) / 2)) }); return { attention: 0.8, warmth: 0.6, reactions: rs }; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
  for (let t = 0; t < 9 - 1e-6; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); }, { t, d: drive(t) });
  const tr = {};
  for (let t = 9; t <= 15 + 1e-6; t = +(t + 0.1).toFixed(2)) {
    const r = await page.evaluate(({ t, d }) => {
      window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t);
      const T = window.__THREE, o = {};
      for (const p of window.__people.filter((x) => x.kind === 'front' && !x.hidden)) {
        const inv = new T.Matrix4().copy(p.rig.seat.matrixWorld).invert(), b = p.rig.b;
        const P = (bn) => (bn ? new T.Vector3().setFromMatrixPosition(bn.matrixWorld).applyMatrix4(inv).toArray().map((v) => +(v * 100).toFixed(2)) : null);
        const c = p._rc && p._rc.get(41);
        o[p.name + '@' + p.o.x.toFixed(1)] = { h: P(b.head), c: P(b.spine2), l: P(b.lUpper), r: P(b.rUpper), plan: c ? [+c.reach.toFixed(2), +c.smileOnly.toFixed(2), c.style, +c.delay.toFixed(2)] : null };
      }
      return o;
    }, { t, d: drive(t) });
    for (const [k, v] of Object.entries(r)) (tr[k] ||= []).push({ t, ...v });
  }
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const range = (S, key, t0, t1) => { const f = S.filter((s) => s.t >= t0 - 1e-6 && s.t <= t1 + 1e-6 && s[key]); let m = 0; for (const a of f) for (const b of f) m = Math.max(m, d(a[key], b[key])); return m; };
  const per = [];
  for (const [k, S] of Object.entries(tr)) {
    const at12 = S.find((s) => Math.abs(s.t - 12) < 1e-6);
    let onset = null;
    for (const s of S) if (s.t > 12 + 1e-6 && (d(s.h, at12.h) > 1.5 || d(s.c, at12.c) > 1.5)) { onset = +(s.t - 12).toFixed(1); break; }
    const sh = (S2, t0, t1) => (range(S2, 'l', t0, t1) + range(S2, 'r', t0, t1)) / 2;
    per.push({ who: k, plan: (S.find((s) => s.plan) || {}).plan || null, listen: { h: +range(S, 'h', 9, 12).toFixed(2), c: +range(S, 'c', 9, 12).toFixed(2), sh: +sh(S, 9, 12).toFixed(2) }, onset, laugh: { c: +range(S, 'c', 12, 15).toFixed(2), sh: +sh(S, 12, 15).toFixed(2) } });
  }
  const on = per.map((p) => p.onset).filter((x) => x !== null).sort((a, b) => a - b), n = per.length;
  const mean = (f) => +(per.reduce((a, p) => a + f(p), 0) / n).toFixed(2);
  console.log(JSON.stringify({ venue, n, frozen: per.filter((p) => p.listen.h < 0.5 && p.listen.c < 0.5).length, within05: on.filter((x) => x <= 0.5).length, within1: on.filter((x) => x <= 1.0).length, medianOnset: on.length ? on[Math.floor(on.length / 2)] : null, listenH: mean((p) => p.listen.h), listenC: mean((p) => p.listen.c), listenSh: mean((p) => p.listen.sh), laughC: mean((p) => p.laugh.c), laughSh: mean((p) => p.laugh.sh) }));
  if (process.env.PER) for (const p of per) console.log(JSON.stringify(p));
} finally { await browser.close(); }
