// Each table sitter: the table's centre and nearest edge in their seat frame, and their knees and palms.
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, st = 'listen', ts = '5'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?venue=club&state=${st}&preset=tv&capture=1&hud=0&debug=1&venue-lock=1`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
for (const tt of ts.split(',')) console.log('t=' + tt + '\n' + await page.evaluate((tt) => {
  window.__renderAt(+tt);
  const T = window.__THREE, out = [];
  for (const p of window.__people) {
    if (p.kind !== 'front' || !p.o.table || (p._standW || 0) > 0.05 || p._inTraffic) continue; // (seated at the table)
    const s = p.src, tc = (s.twoTop ? new T.Vector3(s.twoTop.x, s.twoTop.y || 0, s.twoTop.z) : new T.Vector3(s.x + p.o.neighbour * 0.31, s.y || 0, s.z - 0.4)), l = p.rig.seat.worldToLocal(tc.clone());
    const d = Math.hypot(l.x, l.z), L = (o) => p.rig.seat.worldToLocal(new T.Vector3().setFromMatrixPosition(o.matrixWorld));
    const kL = L(p.rig.b.lCalf), kR = L(p.rig.b.rCalf);
    // how far each knee is under the top (positive: under it)
    const R = 0.4, under = (k) => (R - Math.hypot(k.x - l.x, k.z - l.z)).toFixed(2);
    let into = -1; const f = p.rig.fit;
    if (f && f.ok) for (let a = -0.6; a <= 0.6; a += 0.1) for (const y of [0.735, 0.75]) {
      const dir = new T.Vector3(-l.x, 0, -l.z).normalize().applyAxisAngle(new T.Vector3(0, 1, 0), a), rim = p.rig.seat.localToWorld(new T.Vector3(l.x, y, l.z).addScaledVector(dir, R));
      for (const sec of f.torso) { const e = sec.inv.elements; into = Math.max(into, window.__depthIn ? window.__depthIn(sec, rim) : -1); }
    }
    out.push(`${p.name}: rim into the body ${into.toFixed(2)}; table centre (${l.x.toFixed(2)}, ${l.z.toFixed(2)}) ${d.toFixed(2)} away, nearest edge ${(d - R).toFixed(2)}; knees under the top by ${under(kL)} / ${under(kR)} (knees ${kL.x.toFixed(2)},${kL.z.toFixed(2)} / ${kR.x.toFixed(2)},${kR.z.toFixed(2)})`);
  }
  return out.join('\n');
}, tt));
await browser.close();
