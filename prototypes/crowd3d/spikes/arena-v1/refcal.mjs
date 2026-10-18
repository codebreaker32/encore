// Calibration against today's arena (the a7-era page, copied read-only to ~/spike-arena/ref on the box), without
// editing it: a WebGL-level tracer classifies every program by its source, records each layer's draws, triangles and
// instances in one frame, saves each program's GLSL (for the Mali Offline Compiler), and in counting mode patches each
// layer's fragment shader to add 1/255 to its own colour channel (additive, the real draw order and depth test, other
// layers depth-only), which gives the fragments each layer shades. Unique vertices come from the scene's index buffers.
//   node refcal.mjs <page url> <outdir>
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [url, outdir = '/tmp/refcal'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });

const INIT = (countMap) => {
  const P = WebGL2RenderingContext.prototype;
  const classify = (vs, fs) => (/crowdPose/.test(vs) ? 'rows' : /uWaveFront/.test(vs) ? 'sprites' : /uLevel/.test(fs) && /aB\b/.test(vs) ? 'impostors'
    : /boneTexture/.test(vs) ? 'front' : /hash\(\s*gl_FragCoord/.test(fs) ? 'post' : /attribute float thr/.test(vs) || /in float thr/.test(vs) ? 'phones' : 'other');
  const src = new WeakMap(), shaders = new WeakMap(), info = new WeakMap();
  const T = (window.__T = { on: false, draws: [], progs: [], countMap });
  let cur = null, nid = 0;
  const o = { shaderSource: P.shaderSource, attachShader: P.attachShader, linkProgram: P.linkProgram, useProgram: P.useProgram, clearColor: P.clearColor };
  P.shaderSource = function (sh, s) { src.set(sh, s); return o.shaderSource.call(this, sh, s); };
  P.attachShader = function (p, sh) { if (!shaders.has(p)) shaders.set(p, []); shaders.get(p).push(sh); return o.attachShader.call(this, p, sh); };
  P.linkProgram = function (p) {
    const shs = shaders.get(p) || [];
    let vs = '', fsS = '', fsh = null;
    for (const sh of shs) { const t = this.getShaderParameter(sh, this.SHADER_TYPE); if (t === this.VERTEX_SHADER) vs = src.get(sh) || ''; else { fsS = src.get(sh) || ''; fsh = sh; } }
    const cat = classify(vs, fsS), id = nid++;
    info.set(p, { cat, id });
    T.progs.push({ id, cat, vs, fs: fsS });
    const ch = countMap && countMap[cat];
    if (ch && fsh) {
      const patched = fsS.replace(/void\s+main\s*\(\s*\)/, 'void main_orig()') + `\nvoid main() { main_orig(); pc_fragColor = vec4(${ch.map((x) => x.toFixed(6)).join(', ')}, 1.0); }\n`;
      o.shaderSource.call(this, fsh, patched); this.compileShader(fsh);
    }
    return o.linkProgram.call(this, p);
  };
  P.useProgram = function (p) { cur = p; return o.useProgram.call(this, p); };
  if (countMap) P.clearColor = function () { return o.clearColor.call(this, 0, 0, 0, 0); };
  for (const name of ['drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced']) {
    const f = P[name];
    P[name] = function (...a) {
      const I = (cur && info.get(cur)) || { cat: '?', id: -1 };
      if (T.on) {
        const inst = name.endsWith('Instanced') ? a[a.length - 1] : 1, count = name.startsWith('drawElements') ? a[1] : a[2];
        T.draws.push({ cat: I.cat, id: I.id, mode: a[0], count, inst });
      }
      if (!countMap) return f.apply(this, a);
      // counting: this layer adds to its channel; every other layer writes depth only
      const mask = this.getParameter(this.COLOR_WRITEMASK), blend = this.isEnabled(this.BLEND);
      const bs = this.getParameter(this.BLEND_SRC_RGB), bd = this.getParameter(this.BLEND_DST_RGB), bsa = this.getParameter(this.BLEND_SRC_ALPHA), bda = this.getParameter(this.BLEND_DST_ALPHA), be = this.getParameter(this.BLEND_EQUATION_RGB);
      if (countMap[I.cat]) { this.colorMask(true, true, true, true); this.enable(this.BLEND); this.blendEquation(this.FUNC_ADD); this.blendFunc(this.ONE, this.ONE); }
      else this.colorMask(false, false, false, false);
      const r = f.apply(this, a);
      this.colorMask(mask[0], mask[1], mask[2], mask[3]);
      if (blend) this.enable(this.BLEND); else this.disable(this.BLEND);
      this.blendEquation(be); this.blendFuncSeparate(bs, bd, bsa, bda);
      return r;
    };
  }
};

async function run(countMap) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.addInitScript(INIT, countMap);
    await page.goto(url + (countMap ? '&ab=nopost' : ''), { timeout: 300000 });
    await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__scene, null, { timeout: 300000, polling: 500 });
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      window.__renderAt(3); window.__renderAt(3.05);
      window.__T.on = true; window.__T.draws = [];
      window.__renderAt(3.1);
      window.__T.on = false;
      const cv = document.querySelector('canvas'), gl = cv.getContext('webgl2');
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const sum = [0, 0, 0], cov = [0, 0, 0];
      for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) { sum[c] += px[i + c]; if (px[i + c]) cov[c]++; }
      // unique vertices per layer from the scene (visible meshes; index buffers deduplicated; × instances)
      const classify = (m) => { const vs = (m && m.vertexShader) || ''; return /crowdPose/.test(vs) ? 'rows' : /uWaveFront/.test(vs) ? 'sprites' : /aB\b/.test(vs) && /uLevel/.test(m.fragmentShader || '') ? 'impostors' : null; };
      const V = {};
      window.__scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        let vis = true; for (let a = o.parent; a; a = a.parent) if (!a.visible) vis = false; if (!vis) return;
        const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
        const cat = o.isSkinnedMesh ? 'front' : classify(mats[0]) || 'other';
        const idx = g.index ? g.index.array : null;
        const uniq = idx ? new Set(idx).size : g.attributes.position.count;
        const inst = g.isInstancedBufferGeometry ? g.instanceCount : o.isInstancedMesh ? o.count : 1;
        const tri = (idx ? idx.length : g.attributes.position.count) / 3;
        V[cat] = V[cat] || { verts: 0, tris: 0, meshes: 0 };
        V[cat].verts += uniq * inst; V[cat].tris += tri * inst; V[cat].meshes++;
      });
      return { W, H, sum, cov, draws: window.__T.draws, progs: window.__T.progs.map((p) => ({ id: p.id, cat: p.cat, vs: p.vs, fs: p.fs })), V, stats: window.__stats || null };
    });
  } finally { await browser.close(); }
}

const trace = await run(null);
const used = new Set(trace.draws.map((d) => d.id));
if (process.env.TRACE_ONLY) { // per program: draws, triangles, instances (for splitting a layer's vertices between its programs)
  const per = {};
  for (const d of trace.draws) { const k = `${d.cat}-${d.id}`; const c = (per[k] ||= { draws: 0, tris: 0, inst: 0 }); c.draws++; c.tris += d.mode === 4 ? (d.count / 3) * d.inst : 0; c.inst += d.inst; }
  console.log(JSON.stringify(per)); process.exit(0);
}
const byCat = {};
for (const d of trace.draws) { const c = (byCat[d.cat] ||= { draws: 0, tris: 0, inst: 0, programs: new Set() }); c.draws++; c.tris += d.mode === 4 ? (d.count / 3) * d.inst : 0; c.inst += d.inst; c.programs.add(d.id); }
for (const p of trace.progs) if (used.has(p.id)) { fs.writeFileSync(`${outdir}/${p.cat}-${p.id}.vert`, p.vs); fs.writeFileSync(`${outdir}/${p.cat}-${p.id}.frag`, p.fs); }
const A = await run({ rows: [1 / 255, 0, 0], sprites: [0, 1 / 255, 0], front: [0, 0, 1 / 255] });
const B = await run({ impostors: [1 / 255, 0, 0], other: [0, 1 / 255, 0], phones: [0, 0, 1 / 255] });
const px = A.W * A.H;
const frag = { rows: A.sum[0], sprites: A.sum[1], front: A.sum[2], impostors: B.sum[0], other: B.sum[1], phones: B.sum[2] };
const cover = { rows: A.cov[0] / px, sprites: A.cov[1] / px, front: A.cov[2] / px, impostors: B.cov[0] / px, other: B.cov[1] / px, phones: B.cov[2] / px };
const out = { size: [A.W, A.H], layers: {} };
for (const [k, c] of Object.entries(byCat)) out.layers[k] = { draws: c.draws, tris: Math.round(c.tris), programs: [...c.programs], verts: trace.V[k] ? trace.V[k].verts : null, sceneTris: trace.V[k] ? Math.round(trace.V[k].tris) : null, fragments: frag[k] ?? null, coverage: cover[k] != null ? +cover[k].toFixed(3) : null };
out.stats = trace.stats;
fs.writeFileSync(`${outdir}/layers.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
