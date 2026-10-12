// Which object draws a region of a frame? Renders the frame, then hides each candidate object in turn and reports the
// ones whose hiding changes the region most (on the build box).
//   node probe-hands.mjs <url with &capture=1&debug> <t> <x0> <y0> <x1> <y1>   (region in 1280x720 coordinates)
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, t, x0, y0, x1, y1] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { timeout: 240000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__renderAt, null, { timeout: 240000 });
  const out = await page.evaluate(([t, x0, y0, x1, y1]) => {
    const cv = document.querySelector('canvas');
    const W = cv.width, H = cv.height;
    const r = [Math.round((x0 / 1280) * W), Math.round((y0 / 720) * H), Math.round((x1 / 1280) * W), Math.round((y1 / 720) * H)];
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const g = c2.getContext('2d', { willReadFrequently: true });
    const grab = () => { window.__renderAt(t); g.drawImage(cv, 0, 0); return g.getImageData(r[0], r[1], r[2] - r[0], r[3] - r[1]).data; };
    const base = grab();
    const diff = (a) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - base[i]) + Math.abs(a[i + 1] - base[i + 1]) + Math.abs(a[i + 2] - base[i + 2]); return s / (a.length / 4); };
    const cands = [];
    window.__scene.traverse((o) => { if ((o.isMesh || o.isPoints) && o.visible) cands.push(o); });
    const res = [];
    for (const o of cands) {
      o.visible = false;
      const d = diff(grab());
      o.visible = true;
      if (d > 0.5) {
        let p = o, path = [];
        while (p && p !== window.__scene) { path.push(p.name || p.type); p = p.parent; }
        const person = window.__people.find((q) => { let f = false; q.rig.model.traverse((k) => { if (k === o) f = true; }); return f; });
        res.push({ d: +d.toFixed(1), path: path.join(' < '), person: person ? { name: person.name, kind: person.kind, x: person.o.x, row: person.o.row, hands: person.o.standHands } : null });
      }
    }
    // where every front person's hands project
    const v = new window.__THREE.Vector3();
    const hands = window.__people.map((q) => {
      const pr = (b) => { v.setFromMatrixPosition(b.matrixWorld).project(window.__camera); return [Math.round((v.x * 0.5 + 0.5) * 1280), Math.round((-v.y * 0.5 + 0.5) * 720)]; };
      return { name: q.name, x: q.o.x, l: pr(q.rig.b.lHand), r: pr(q.rig.b.rHand), modelVisible: q.rig.model.visible };
    });
    return { W, H, region: r, res: res.sort((a, b) => b.d - a.d), hands };
  }, [+t, +x0, +y0, +x1, +y1]);
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); }
