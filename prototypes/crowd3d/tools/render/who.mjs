// front people at a moment of the motionstrip drive: their laugh style, gestures, and the head's and chest's angles in the
// seat frame (pitch +up, yaw +left, roll), so a sheet's odd pose can be named. node who.mjs <base> <venue> <t> [extra]
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, tS, extra = ''] = process.argv.slice(2);
const LAUGH = 12;
const drive = (t) => { const a = t - LAUGH, rs = []; if (a > 0 && a < 6) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: a, level: 0.9 * Math.min(1, a / 0.4) * (a < 3 ? 1 : Math.max(0, 1 - (a - 3) / 2)) }); return { attention: 0.8, warmth: 0.6, reactions: rs }; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
const T1 = +tS;
for (let t = 0; t < 10.5; t += 0.25) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(t); }, { t, d: drive(t) });
for (let t = 10.5; t <= T1 + 1e-6; t += 0.1) await page.evaluate(({ t, d }) => { window.encoreMessage({ type: 'drive', drive: d }); window.__renderAt(+t.toFixed(2)); }, { t, d: drive(t) });
console.log(await page.evaluate(() => {
  const T = window.__THREE, out = [], D = 180 / Math.PI;
  for (const p of window.__people.filter((q) => q.kind === 'front').sort((a, b) => a.o.row - b.o.row || Math.abs(a.o.x) - Math.abs(b.o.x)).slice(0, 6)) {
    const b = p.rig.b, inv = p.rig.seat.matrixWorld.clone().invert(), L = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
    const hipL = L(b.lThigh), hipR = L(b.rThigh), shL = L(b.lUpper), shR = L(b.rUpper), pel = L(b.pelvis), nk = L(b.neck);
    const yawOf = (a, c) => Math.atan2(-(a.z - c.z), a.x - c.x);
    const twist = (yawOf(shL, shR) - yawOf(hipL, hipR)) * D, lean = Math.atan2(nk.z - pel.z, nk.y - pel.y) * D, bend = Math.atan2(nk.x - pel.x, nk.y - pel.y) * D, tilt = Math.atan2(shL.y - shR.y, Math.hypot(shL.x - shR.x, shL.z - shR.z)) * D;
    let head = '';
    const f = p.rig.fit;
    if (f && f.headFwd) { const q = new T.Quaternion(); b.head.getWorldQuaternion(q); const sq = new T.Quaternion().setFromRotationMatrix(p.rig.seat.matrixWorld).invert(); const fw = f.headFwd.clone().applyQuaternion(q).applyQuaternion(sq);
      const eyeT = b.lEye && b.rEye ? Math.atan2(L(b.lEye).y - L(b.rEye).y, Math.hypot(L(b.lEye).x - L(b.rEye).x, L(b.lEye).z - L(b.rEye).z)) * D : NaN;
      head = `head pitch ${(Math.asin(fw.y) * D).toFixed(0)} yaw ${(Math.atan2(fw.x, fw.z) * D).toFixed(0)} tilt ${eyeT.toFixed(0)}`; }
    const S = p.state || {};
    out.push(`${p.name.padEnd(15)} [${(S.style || '-').padEnd(6)} lb ${(S.lb || 0).toFixed(2)} ${(S.gestures || []).map((g) => g.g).join('+')}] chest lean ${lean.toFixed(0)} bend ${bend.toFixed(0)} twist ${twist.toFixed(0)} shoulders ${tilt.toFixed(0)} | ${head}`);
  }
  return out.join('\n');
}));
await browser.close();
