// Close-ups for the "real people" pass (2026-10-18): per venue, at TV resolution (800×450 drawn, shown at 1280×720),
// a laugh's peak in three of the venue's reaction setups and one front person close (a camera of ours, near plane at
// 5 cm, so nobody between is cut open), from two pages: before (old tv models) and after. The close subject is
// Male_Adult_17 (the blue and white hoodie) where the venue has him, else Male_Adult_04, else the most central. Writes <out>/<venue>-<tag>-<n>.png and prints draw calls and triangles per frame.
//   node realsheet.mjs <page> <venue> <out> <before query> <after query>     (out: <venue>-<tag>-<n>.png, n 0-4)
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base0, venue, out, beforeQ = '', afterQ = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const T = 1.6; // (the laugh starts at 0.3: its peak)
try {
  const res = {};
  for (const [tag, base, q] of [['before', base0, beforeQ], ['after', base0, afterQ]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${base}?preset=tv&venue=${venue}&capture=1&shot=close&state=laugh&s=0.9&hud=0&debug=1${q}`, { timeout: 240000 });
    await page.waitForFunction(() => window.__renderAt, null, { timeout: 240000 });
    await page.evaluate(() => { window.__renderAt(0.1); window.__renderAt(0.2); });
    await page.waitForFunction(() => window.__closes, null, { timeout: 60000 });
    await page.addStyleTag({ content: '.tv > *:not(canvas), #cap, #hud { visibility: hidden !important; }' });
    const setups = await page.evaluate(() => window.__closes().setups);
    // three setups with front people: the first close-size one, then the mid ones
    const pick = [...setups.map((s, i) => ({ ...s, i })).filter((s) => s.seats.length && s.size === 'close').slice(0, 1), ...setups.map((s, i) => ({ ...s, i })).filter((s) => s.seats.length && s.size === 'mid')].slice(0, 3);
    res[tag] = [];
    let n = 0;
    for (const s of pick) {
      const r = await page.evaluate(({ i, t }) => { window.__cutTo(i); window.__renderAt(t - 0.1); const x = window.__renderAt(t); return x; }, { i: s.i, t: T });
      await page.screenshot({ path: `${out}/${venue}-${tag}-${n++}.png` });
      res[tag].push(`${s.label}: ${r.calls}c ${(r.tris / 1000).toFixed(1)}k`);
    }
    // the person close (Male_Adult_04 where there is one, else the most central front person), full body on
    const info = await page.evaluate((t) => {
      const ps = window.__people.filter((p) => p.kind === 'front');
      const p = ps.find((x) => x.name === 'Male_Adult_17') || ps.find((x) => x.name === 'Male_Adult_04') || ps.sort((a, b) => a.o.row - b.o.row || Math.abs(a.o.x) - Math.abs(b.o.x))[0];
      if (!p) return '';
      if (window.__bodyDetail) window.__bodyDetail(true);
      let R = null; window.__scene.onAfterRender = (r) => { R = r; }; window.__renderAt(t);
      const T3 = window.__THREE, sc = window.__scene, rig = p.rig;
      const c = new T3.Vector3().setFromMatrixPosition(rig.b.neck.matrixWorld);
      const fwd = new T3.Vector3(0, 0, 1).transformDirection(rig.seat.matrixWorld).setY(0).normalize();
      const cam = new T3.PerspectiveCamera(30, R.domElement.width / R.domElement.height, 0.05, 40);
      cam.position.copy(c).addScaledVector(fwd, 1.5).add(new T3.Vector3(0.25, 0.05, 0)); cam.lookAt(c.clone().add(new T3.Vector3(0, -0.2, 0))); cam.updateMatrixWorld();
      const fog = sc.fog; sc.fog = null; if (window.__renderWith) window.__renderWith(cam); else R.render(sc, cam); sc.fog = fog;
      return p.name;
    }, T);
    await page.screenshot({ path: `${out}/${venue}-${tag}-${n++}.png` });
    res[tag].push(`close ${info}`);
    // the face close: a 30° lens 0.65 m from the same person's eyes, a little to one side
    await page.evaluate((t) => {
      const ps = window.__people.filter((p) => p.kind === 'front');
      const p = ps.find((x) => x.name === 'Male_Adult_17') || ps.find((x) => x.name === 'Male_Adult_04') || ps[0];
      let R = null; window.__scene.onAfterRender = (r) => { R = r; }; window.__renderAt(t);
      const T3 = window.__THREE, sc = window.__scene, rig = p.rig;
      const c = new T3.Vector3().setFromMatrixPosition(rig.b.head.matrixWorld).add(new T3.Vector3(0, 0.07, 0));
      const fwd = new T3.Vector3(0, 0, 1).transformDirection(rig.seat.matrixWorld).setY(0).normalize();
      const side = new T3.Vector3(fwd.z, 0, -fwd.x);
      const cam = new T3.PerspectiveCamera(30, R.domElement.width / R.domElement.height, 0.05, 40);
      cam.position.copy(c).addScaledVector(fwd, 0.62).addScaledVector(side, 0.22); cam.lookAt(c.clone().add(new T3.Vector3(0, -0.06, 0))); cam.updateMatrixWorld();
      window.__faceCam = cam;
      const fog = sc.fog; sc.fog = null; if (window.__renderWith) window.__renderWith(cam); else R.render(sc, cam); sc.fog = fog;
    }, T);
    await page.screenshot({ path: `${out}/${venue}-${tag}-${n++}.png` });
    res[tag].push('face');
    await page.close();
  }
  console.log(JSON.stringify({ venue, ...res }));
} finally { await browser.close(); }
