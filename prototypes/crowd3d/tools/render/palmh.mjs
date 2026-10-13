// Seated front people at tables: each palm's height against the top of the leg under it (the thigh and calf joints'
// line plus the fitted radius) and against the table plane.   node palmh.mjs <base> <venue> <state> <t>
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, state, t] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?venue=${venue}&state=${state}&preset=tv&capture=1&hud=0&debug=1&venue-lock=1`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
const r = await page.evaluate((t) => {
  window.__renderAt(+t - 0.1); window.__renderAt(+t);
  const T = window.__THREE, out = [];
  for (const p of window.__people) {
    if (p.kind !== 'front' || !p.o.table) continue;
    const rig = p.rig, b = rig.b, L = (o) => rig.seat.worldToLocal(new T.Vector3().setFromMatrixPosition(o.matrixWorld));
    const row = [p.name, p._restKind || '-'];
    for (const [h, tip, th, ca] of [[b.lHand, b.lTip, b.lThigh, b.lCalf], [b.rHand, b.rTip, b.rThigh, b.rCalf]]) {
      const P = L(h).lerp(L(tip), 0.5), H = L(th), K = L(ca);
      const u = Math.max(0, Math.min(1, P.clone().sub(H).dot(K.clone().sub(H)) / K.clone().sub(H).lengthSq())), axis = H.clone().lerp(K, u);
      row.push(`palm y ${P.y.toFixed(3)} z ${P.z.toFixed(2)} leg axis y ${axis.y.toFixed(3)} (u ${u.toFixed(2)})`);
    }
    out.push(row.join(' | '));
  }
  return out;
}, t);
console.log(r.join('\n'));
await browser.close();
