// The live page (real time, not stepped): every frame, every skinned front person's bones checked for non-finite
// matrices, hands torn from their forearms, hands collapsed (zero scale), and the skeleton's bone texture uploaded
// stale. Prints the first findings.   node handvanish.mjs <base> <venue> <state> [seconds=25]
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, state, secS = '25'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
await page.goto(`${base}?venue=${venue}&state=${state}&preset=tv&hud=0&debug=1`, { timeout: 240000 });
await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__people, null, { timeout: 240000 });
await page.evaluate(() => {
  const F = (window.__hv = { frames: 0, bad: [] });
  const fin = (m) => { for (const v of m.elements) if (!Number.isFinite(v)) return false; return true; };
  const tick = () => {
    F.frames++;
    for (const p of window.__people) {
      if (p.kind !== 'front' || p.hidden || !p.rig) continue;
      const b = p.rig.b;
      for (const k of ['lUpper', 'lFore', 'lHand', 'lTip', 'rUpper', 'rFore', 'rHand', 'rTip']) if (b[k] && !fin(b[k].matrixWorld)) { if (F.bad.length < 20) F.bad.push(`${F.frames} ${p.name} ${k} non-finite`); }
      for (const [fo, ha, tip] of [[b.lFore, b.lHand, b.lTip], [b.rFore, b.rHand, b.rTip]]) {
        const e = fo.matrixWorld.elements, h = ha.matrixWorld.elements, t = tip ? tip.matrixWorld.elements : h;
        const dfh = Math.hypot(e[12] - h[12], e[13] - h[13], e[14] - h[14]), dht = Math.hypot(t[12] - h[12], t[13] - h[13], t[14] - h[14]);
        const sc = Math.hypot(h[0], h[1], h[2]);
        if ((dfh > 0.4 || dfh < 0.1 || dht > 0.2 || sc < 0.5 || sc > 2) && F.bad.length < 20) F.bad.push(`${F.frames} ${p.name} ${ha.name} fore-hand ${dfh.toFixed(3)} hand-tip ${dht.toFixed(3)} scale ${sc.toFixed(2)}`);
      }
      // the skinned meshes' bone textures against the bones (stale upload: a hand drawn where it no longer is)
      p.rig.model.traverse((o) => {
        if (!o.isSkinnedMesh || !o.visible) return;
        const sk = o.skeleton, i = sk.bones.indexOf(b.rHand); if (i < 0) return;
        const bm = sk.boneMatrices, base = i * 16, mw = b.rHand.matrixWorld.elements, inv = sk.boneInverses[i].elements;
        let ok = true; for (let k = 0; k < 16; k++) if (!Number.isFinite(bm[base + k])) ok = false;
        if (!ok && F.bad.length < 20) F.bad.push(`${F.frames} ${p.name} boneMatrices non-finite`);
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.waitForTimeout(+secS * 1000);
const r = await page.evaluate(() => window.__hv);
console.log(venue, state, JSON.stringify({ frames: r.frames, bad: r.bad, errs }));
await browser.close();
