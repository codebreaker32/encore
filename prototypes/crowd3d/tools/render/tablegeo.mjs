// Each table sitter: the table's centre and nearest edge in their seat frame, and their knees and palms.
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?venue=club&state=listen&preset=tv&capture=1&hud=0&debug=1&venue-lock=1`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
console.log(await page.evaluate(() => {
  window.__renderAt(5);
  const T = window.__THREE, out = [];
  for (const p of window.__people) {
    if (p.kind !== 'front' || !p.o.table) continue;
    const s = p.src, tc = new T.Vector3(s.x + p.o.neighbour * 0.31, s.y || 0, s.z - 0.47), l = p.rig.seat.worldToLocal(tc.clone());
    const d = Math.hypot(l.x, l.z), L = (o) => p.rig.seat.worldToLocal(new T.Vector3().setFromMatrixPosition(o.matrixWorld));
    const kL = L(p.rig.b.lCalf), kR = L(p.rig.b.rCalf);
    // how far each knee is under the top (positive: under it)
    const under = (k) => (0.31 - Math.hypot(k.x - l.x, k.z - l.z)).toFixed(2);
    out.push(`${p.name}: table centre (${l.x.toFixed(2)}, ${l.z.toFixed(2)}) ${d.toFixed(2)} away, nearest edge ${(d - 0.31).toFixed(2)}; knees under the top by ${under(kL)} / ${under(kR)}`);
  }
  return out.join('\n');
}));
await browser.close();
