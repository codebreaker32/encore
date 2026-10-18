// Table-resting palms: how far from their rest target (and from the last frame) each frame, through the host-driven
// laugh, clap and finale of handocc.mjs; with the arm pass flags. node plant.mjs <base> [venue]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue = 'club'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
const out = await page.evaluate(({ WHO, T0, T1 }) => {
  const T = window.__THREE;
  const drive = (t) => {
    const rs = [];
    if (t > 4 && t < 9) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: t - 4, level: 0.9 * Math.min(1, (t - 4) / 0.4) * (t < 7 ? 1 : 1 - (t - 7) / 2) });
    if (t > 10 && t < 16) rs.push({ id: 42, kind: 'applause', strength: 0.85, age: t - 10, level: 0.85 * Math.min(1, (t - 10) / 0.4) * (t < 14 ? 1 : 1 - (t - 14) / 2) });
    return { attention: 0.8, warmth: 0.7, reactions: rs, finale: t > 17 ? { strength: 0.9 } : null };
  };
  window.__renderAt(3);
  const prev = new Map(), lines = [], stats = {};
  for (let t = 3; t <= 22; t += 0.1) {
    window.__plant = WHO && t >= T0 && t <= T1 ? WHO : null;
    window.encoreMessage({ type: 'drive', drive: drive(t) }); window.__renderAt(+t.toFixed(2));
    if (window.__plant) { const p = window.__people.find((q) => q.name === WHO && q.kind === 'front'); lines.push(`${t.toFixed(1)} ${WHO} [${p._doing}] ${p._dbgA}\n      ` + (p._sp || []).join('\n      ')); p._sp = null; }
    for (const p of window.__people) {
      if (p.kind !== 'front' || p.hidden || !p.o.table) continue;
      const b = p.rig.b, kind = p._restKind || '';
      for (const [k, h, tip] of [['L', b.lHand, b.lTip], ['R', b.rHand, b.rTip]]) {
        const H = new T.Vector3().setFromMatrixPosition(h.matrixWorld), P = tip ? H.clone().lerp(new T.Vector3().setFromMatrixPosition(tip.matrixWorld), 0.5) : H;
        const key = p.name + ' ' + k, q = prev.get(key); prev.set(key, P.clone());
        const still = /^(tableBoth|forearmsTable)$/.test(kind) && /clap:0\.0/.test(p._doing || '') && /g: /.test(p._doing || '');
        const st = (stats[key] ||= { n: 0, jumps: 0, max: 0 });
        if (!still || !q) continue;
        st.n++; const d = P.distanceTo(q); st.max = Math.max(st.max, d);
        if (d > 0.008) { st.jumps++; if (lines.length < 300) lines.push(`${t.toFixed(1)} ${key} moved ${(d * 100).toFixed(1)} cm to y ${P.y.toFixed(3)} [${p._doing}] ${p._dbgA || ''}`); }
      }
    }
  }
  return { stats, lines };
}, { WHO: process.env.WHO || '', T0: +(process.env.T0 || 0), T1: +(process.env.T1 || 0) });
for (const [k, s] of Object.entries(out.stats)) console.log(k, `still frames ${s.n} jumps>8mm ${s.jumps} max ${(s.max * 100).toFixed(1)} cm`);
for (const l of out.lines) console.log('  ', l);
await browser.close();
