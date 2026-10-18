// Per-vertex ambient occlusion for the front people's .tv.glb (real-v1, 2026-10-18), baked offline in the bind pose:
// for every vertex of the head (not the hair cards), the drawn body and the full body, 48 cosine-weighted rays over the
// normal's hemisphere against the head and that body, a hit at distance d occluding by (1 - d / 12 cm). So the mouth's
// inside, the nostrils, the eye sockets, the ears, under the chin and inside collars and hoods go darker; a person's
// own small-scale shadowing, which the TV can't afford as real shadows. Writes people/ao/<name>.json:
// { head: [count, base64 Uint8], body: [...], bodyHi: [...] } (255 = open).
//   node tools/bake_ao.mjs [names...]
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(join(root, 'people')).filter((f) => f.endsWith('.tv.glb')).map((f) => f.replace('.tv.glb', ''));
fs.mkdirSync(join(root, 'people/ao'), { recursive: true });
const RAYS = 48, MAXD = 0.12;

function readGlb(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + n).toString());
  const bin = b.slice(20 + n + 8);
  const acc = (i) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const stride = bv.byteStride || comps * C.BYTES_PER_ELEMENT, off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new C(a.count * comps);
    for (let k = 0; k < a.count; k++) {
      const src = new C(bin.buffer.slice(bin.byteOffset + off + k * stride, bin.byteOffset + off + k * stride + comps * C.BYTES_PER_ELEMENT));
      out.set(src, k * comps);
    }
    return out;
  };
  return { j, acc };
}

// a BVH over triangles (median split on the longest axis)
function bvh(pos, idx) {
  const nt = idx.length / 3, cen = new Float32Array(nt * 3), order = new Uint32Array(nt);
  for (let t = 0; t < nt; t++) { order[t] = t; for (let c = 0; c < 3; c++) cen[t * 3 + c] = (pos[idx[t * 3] * 3 + c] + pos[idx[t * 3 + 1] * 3 + c] + pos[idx[t * 3 + 2] * 3 + c]) / 3; }
  const nodes = [];
  const build = (s, e) => {
    const box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = s; i < e; i++) { const t = order[i]; for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) { const x = pos[idx[t * 3 + v] * 3 + c]; if (x < box[c]) box[c] = x; if (x > box[c + 3]) box[c + 3] = x; } }
    const node = { box, s, e, l: null, r: null };
    nodes.push(node);
    if (e - s <= 4) return node;
    let ax = 0; for (let c = 1; c < 3; c++) if (box[c + 3] - box[c] > box[ax + 3] - box[ax]) ax = c;
    const sub = Array.from(order.slice(s, e)).sort((a, b) => cen[a * 3 + ax] - cen[b * 3 + ax]);
    order.set(sub, s);
    const m = (s + e) >> 1;
    node.l = build(s, m); node.r = build(m, e);
    return node;
  };
  const rootN = build(0, nt);
  return { rootN, order, pos, idx };
}
function hitBox(b, o, inv, tmax) {
  let t0 = 0, t1 = tmax;
  for (let c = 0; c < 3; c++) {
    let a = (b[c] - o[c]) * inv[c], z = (b[c + 3] - o[c]) * inv[c];
    if (a > z) { const q = a; a = z; z = q; }
    if (a > t0) t0 = a; if (z < t1) t1 = z;
    if (t0 > t1) return false;
  }
  return true;
}
function ray(B, o, d, tmax) {
  const inv = [1 / d[0], 1 / d[1], 1 / d[2]], st = [B.rootN];
  let best = tmax;
  const { pos, idx, order } = B;
  while (st.length) {
    const n = st.pop();
    if (!hitBox(n.box, o, inv, best)) continue;
    if (n.l) { st.push(n.l, n.r); continue; }
    for (let i = n.s; i < n.e; i++) {
      const t = order[i], a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
      const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const id = 1 / det, tx = o[0] - pos[a], ty = o[1] - pos[a + 1], tz = o[2] - pos[a + 2];
      const u = (tx * px + ty * py + tz * pz) * id; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * id; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * id;
      if (tt > 1e-4 && tt < best) best = tt;
    }
  }
  return best;
}
// fixed cosine-weighted directions around +Z (a Fibonacci spiral), rotated onto each normal
const DIRS = [];
for (let i = 0; i < RAYS; i++) { const r = Math.sqrt((i + 0.5) / RAYS), ph = i * 2.399963; DIRS.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - r * r)]); }
function bake(B, pos, nrm) {
  const n = pos.length / 3, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const N = [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]], l = Math.hypot(...N) || 1; N[0] /= l; N[1] /= l; N[2] /= l;
    const T = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const X = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]], lx = Math.hypot(...X); X[0] /= lx; X[1] /= lx; X[2] /= lx;
    const Y = [N[1] * X[2] - N[2] * X[1], N[2] * X[0] - N[0] * X[2], N[0] * X[1] - N[1] * X[0]];
    const o = [pos[i * 3] + N[0] * 0.0015, pos[i * 3 + 1] + N[1] * 0.0015, pos[i * 3 + 2] + N[2] * 0.0015];
    let occ = 0;
    for (const [a, b, c] of DIRS) {
      const d = [X[0] * a + Y[0] * b + N[0] * c, X[1] * a + Y[1] * b + N[1] * c, X[2] * a + Y[2] * b + N[2] * c];
      const t = ray(B, o, d, MAXD);
      if (t < MAXD) occ += 1 - t / MAXD;
    }
    out[i] = Math.round(255 * Math.max(0, 1 - occ / RAYS));
  }
  return out;
}
const merge = (parts) => {
  let nv = 0, ni = 0; for (const p of parts) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) { pos.set(p.pos, ov * 3); for (let k = 0; k < p.idx.length; k++) idx[oi + k] = p.idx[k] + ov; ov += p.pos.length / 3; oi += p.idx.length; }
  return { pos, idx };
};
for (const name of names) {
  const t0 = Date.now();
  const { j, acc } = readGlb(join(root, `people/${name}.tv.glb`));
  const prim = (mi, pi = 0) => { const p = j.meshes[mi].primitives[pi]; return { pos: acc(p.attributes.POSITION), nrm: acc(p.attributes.NORMAL), idx: acc(p.indices) }; };
  const mi = (suf) => j.meshes.findIndex((m) => m.name.endsWith(suf));
  const head = prim(mi('_mesh') >= 0 ? mi('_mesh') : 0, 0), body = prim(mi('_body')), hi = mi('_bodyHi') >= 0 ? prim(mi('_bodyHi')) : null;
  const B1 = bvh(...Object.values(merge([head, body]))), out = {};
  out.head = [head.pos.length / 3, Buffer.from(bake(B1, head.pos, head.nrm)).toString('base64')];
  out.body = [body.pos.length / 3, Buffer.from(bake(B1, body.pos, body.nrm)).toString('base64')];
  if (hi) { const B2 = bvh(...Object.values(merge([head, hi]))); out.bodyHi = [hi.pos.length / 3, Buffer.from(bake(B2, hi.pos, hi.nrm)).toString('base64')]; }
  fs.writeFileSync(join(root, `people/ao/${name}.json`), JSON.stringify(out));
  const mean = (k) => { const a = Buffer.from(out[k][1], 'base64'); return (a.reduce((s, x) => s + x, 0) / a.length / 255).toFixed(2); };
  console.log(`${name}: head ${out.head[0]} (${mean('head')}), body ${out.body[0]} (${mean('body')})${hi ? `, bodyHi ${out.bodyHi[0]} (${mean('bodyHi')})` : ''}, ${Date.now() - t0} ms`);
}
