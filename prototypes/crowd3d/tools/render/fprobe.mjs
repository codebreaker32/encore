import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
page.on('console', (m) => { if (/error/i.test(m.type())) console.log('console', m.text().slice(0, 200)); });
await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
console.log(await page.evaluate(() => {
  const T = window.__THREE, out = [];
  for (const p of window.__people.filter((q) => q.kind === 'front')) {
    const r = p.rig, fi = r.fingerIn ? [...r.fingerIn.entries()].map(([b, q]) => `${b.name.slice(6)}:${(2 * Math.acos(Math.min(1, Math.abs(q.w))) * 57.3).toFixed(0)}`).join(',') : 'none';
    // weights: does any skinned mesh use the finger bones?
    let used = 0, tot = 0;
    p.rig.model.traverse((o) => { if (!o.isSkinnedMesh) return; const bi = o.skeleton.bones.findIndex((b) => b.name === 'Bip01_R_Finger11'); const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight; if (!si) return; for (let i = 0; i < si.count; i++) { tot++; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi && sw.getComponent(i, k) > 0.1) { used++; break; } } });
    out.push(`${p.name} ${fi} R_Finger11 verts ${used}/${tot}`);
  }
  return out.join('\n');
}));
await browser.close();
