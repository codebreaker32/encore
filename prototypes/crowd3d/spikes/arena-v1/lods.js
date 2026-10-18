// Arena spike v1: the floor's four detail levels, built at load from the shipped far/xfar avatars (plan C2).
//   l0: the far level, legs cut at mid-thigh, simplified to <= 520 triangles with the head, neck and shoulders locked
//   l1: the xfar level, cut at the hips, simplified (head-weighted) to about 130 triangles
//   l2: a ~30-triangle textured bust (the l1 mesh welded and simplified further), rigid: one bone per vertex
//   l3: a 16-triangle procedural figure per gender with per-type colours sampled from the atlas, rigid
// Vertex format: position f16x3, normal snorm8x4, uv unorm16x2, skin u8x4 (bone0, bone1, weight0, flags) = 18 bytes.
import * as THREE from 'three';
import { MeshoptSimplifier } from './meshopt_simplifier.module.js';
import { NRB, RB, C, skinnedMeshOf } from './skeleton.js';

const FLAG_HEAD = 1, FLAG_CLOTH = 2;

/** The skinned mesh as flat arrays in bind-pose model space, skin collapsed to the ring bones (top two). */
export function extract(scene, skel) {
  scene.updateMatrixWorld(true);
  const sk = skinnedMeshOf(scene), g = sk.geometry;
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, J = g.attributes.skinIndex, W = g.attributes.skinWeight;
  const n = P.count, M = sk.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(M);
  const m = { n, pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), uv: new Float32Array(n * 2), b0: new Uint8Array(n), b1: new Uint8Array(n), w0: new Float32Array(n), flags: new Uint8Array(n), index: Uint32Array.from(g.index.array) };
  const acc = new Float32Array(NRB), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(M); m.pos.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); m.nrm.set([v.x, v.y, v.z], i * 3);
    m.uv[i * 2] = U.getX(i); m.uv[i * 2 + 1] = U.getY(i);
    acc.fill(0);
    const js = [J.getX(i), J.getY(i), J.getZ(i), J.getW(i)], ws = [W.getX(i), W.getY(i), W.getZ(i), W.getW(i)];
    for (let k = 0; k < 4; k++) acc[skel.jointToRing[js[k]]] += ws[k];
    let a = 0, b = -1;
    for (let r = 1; r < NRB; r++) if (acc[r] > acc[a]) a = r;
    for (let r = 0; r < NRB; r++) if (r !== a && (b < 0 || acc[r] > acc[b])) b = r;
    const wa = acc[a], wb = b >= 0 ? acc[b] : 0;
    m.b0[i] = a; m.b1[i] = wb > 1e-3 ? b : a; m.w0[i] = wb > 1e-3 ? wa / (wa + wb) : 1;
    const u4 = m.uv[i * 2] * 4, t4 = m.uv[i * 2 + 1] * 4, hand = a === RB.lHand || a === RB.rHand;
    const cloth = u4 - Math.floor(u4) < 0.5 && t4 - Math.floor(t4) < 0.5 && !hand; // (each avatar's body quadrant: instances.js bakeType)
    m.flags[i] = (a === RB.head && m.w0[i] > 0.6 ? FLAG_HEAD : 0) | (cloth ? FLAG_CLOTH : 0);
  }
  return m;
}

function subset(m, keep /* Uint8Array per vertex */, index) {
  const remap = new Int32Array(m.n).fill(-1); let k = 0;
  for (let i = 0; i < m.n; i++) if (keep[i]) remap[i] = k++;
  const o = { n: k, pos: new Float32Array(k * 3), nrm: new Float32Array(k * 3), uv: new Float32Array(k * 2), b0: new Uint8Array(k), b1: new Uint8Array(k), w0: new Float32Array(k), flags: new Uint8Array(k) };
  for (let i = 0; i < m.n; i++) {
    const j = remap[i]; if (j < 0) continue;
    o.pos.set(m.pos.subarray(i * 3, i * 3 + 3), j * 3); o.nrm.set(m.nrm.subarray(i * 3, i * 3 + 3), j * 3); o.uv.set(m.uv.subarray(i * 2, i * 2 + 2), j * 2);
    o.b0[j] = m.b0[i]; o.b1[j] = m.b1[i]; o.w0[j] = m.w0[i]; o.flags[j] = m.flags[i];
  }
  o.index = Uint32Array.from(index, (i) => remap[i]);
  return o;
}
/** Drop every vertex no triangle uses. */
export function compact(m, index = m.index) { const keep = new Uint8Array(m.n); for (const i of index) keep[i] = 1; return subset(m, keep, index); }
/** Drop the triangles entirely below y. */
export function cutBelow(m, y) {
  const idx = [];
  for (let t = 0; t < m.index.length; t += 3) { const a = m.index[t], b = m.index[t + 1], c = m.index[t + 2]; if (Math.max(m.pos[a * 3 + 1], m.pos[b * 3 + 1], m.pos[c * 3 + 1]) >= y) idx.push(a, b, c); }
  return compact(m, Uint32Array.from(idx));
}
/** Merge vertices at the same position (the first one's uv and skin win): lets the simplifier collapse across seams. */
export function weld(m) {
  const key = new Map(), to = new Uint32Array(m.n);
  for (let i = 0; i < m.n; i++) { const k = `${Math.round(m.pos[i * 3] * 5000)},${Math.round(m.pos[i * 3 + 1] * 5000)},${Math.round(m.pos[i * 3 + 2] * 5000)}`; if (!key.has(k)) key.set(k, i); to[i] = key.get(k); }
  const idx = []; for (let t = 0; t < m.index.length; t += 3) { const a = to[m.index[t]], b = to[m.index[t + 1]], c = to[m.index[t + 2]]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  return compact(m, Uint32Array.from(idx));
}
/** meshopt simplification to about `tris` triangles; headScale magnifies the head's error (head-weighted); lock keeps vertices. */
export function simplify(m, tris, { lock = null, headScale = 1, headC = null } = {}) {
  if (m.index.length / 3 <= tris) return m;
  const p = Float32Array.from(m.pos);
  if (headScale !== 1 && headC) for (let i = 0; i < m.n; i++) if (m.b0[i] === RB.head || m.b0[i] === RB.neck) for (let k = 0; k < 3; k++) p[i * 3 + k] = headC[k] + (p[i * 3 + k] - headC[k]) * headScale;
  // skin-aware: uv plus how much each vertex follows the left arm, the right arm and the head, so collapses that would
  // bind a triangle across the armpit (a fin when the arm goes up) cost more than ones that keep the binding
  const A = new Float32Array(m.n * 5);
  const ARM_L = new Set([RB.lUA, RB.lFA, RB.lHand]), ARM_R = new Set([RB.rUA, RB.rFA, RB.rHand]);
  for (let i = 0; i < m.n; i++) {
    const w0 = m.w0[i], w1 = 1 - w0, b0 = m.b0[i], b1 = m.b1[i];
    A[i * 5] = m.uv[i * 2]; A[i * 5 + 1] = m.uv[i * 2 + 1];
    A[i * 5 + 2] = (ARM_L.has(b0) ? w0 : 0) + (ARM_L.has(b1) ? w1 : 0);
    A[i * 5 + 3] = (ARM_R.has(b0) ? w0 : 0) + (ARM_R.has(b1) ? w1 : 0);
    A[i * 5 + 4] = (b0 === RB.head ? w0 : 0) + (b1 === RB.head ? w1 : 0);
  }
  const L = new Uint8Array(m.n); if (lock) for (let i = 0; i < m.n; i++) L[i] = lock(i) ? 1 : 0;
  const [out] = MeshoptSimplifier.simplifyWithAttributes(m.index, p, 3, A, 5, [0.4, 0.4, 2.0, 2.0, 1.0], L, tris * 3, 1.0, []);
  return compact(m, out);
}

/** BufferGeometry in the lean vertex format. */
export function toGeometry(m, rigid = false) {
  const g = new THREE.BufferGeometry(), n = m.n;
  const ph = new Uint16Array(n * 3); for (let i = 0; i < n * 3; i++) ph[i] = THREE.DataUtils.toHalfFloat(m.pos[i]);
  const nr = new Int8Array(n * 4); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) nr[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, m.nrm[i * 3 + k])) * 127);
  const uv = new Uint16Array(n * 2); for (let i = 0; i < n * 2; i++) uv[i] = Math.round(Math.max(0, Math.min(1, m.uv[i])) * 65535);
  const sk = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { sk[i * 4] = m.b0[i]; sk[i * 4 + 1] = rigid ? m.b0[i] : m.b1[i]; sk[i * 4 + 2] = rigid ? 255 : Math.round(m.w0[i] * 255); sk[i * 4 + 3] = m.flags[i]; }
  g.setAttribute('position', new THREE.Float16BufferAttribute(ph, 3));
  g.setAttribute('normal', new THREE.Int8BufferAttribute(nr, 4, true));
  g.setAttribute('uv', new THREE.Uint16BufferAttribute(uv, 2, true));
  g.setAttribute('aSkin', new THREE.Uint8BufferAttribute(sk, 4, false));
  g.setIndex(new THREE.BufferAttribute(n < 65536 ? Uint16Array.from(m.index) : Uint32Array.from(m.index), 1));
  g.userData = { verts: n, tris: m.index.length / 3, bytesPerVertex: 18 };
  return g;
}

const J = (S, c) => new THREE.Vector3(S.joint[c * 3], S.joint[c * 3 + 1], S.joint[c * 3 + 2]);
/** Head centre and half-sizes from the vertices bound to the head. */
export function headBox(m) {
  const b = new THREE.Box3();
  for (let i = 0; i < m.n; i++) if (m.b0[i] === RB.head && m.w0[i] > 0.6) b.expandByPoint(new THREE.Vector3(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]));
  return { c: b.getCenter(new THREE.Vector3()), h: b.getSize(new THREE.Vector3()).multiplyScalar(0.5) };
}
export function frameOf(S) {
  const R = J(S, C.rUA).sub(J(S, C.lUA)); R.y = 0; R.normalize();
  const F = new THREE.Vector3(0, 1, 0).cross(R).normalize();
  return { R, F, U: new THREE.Vector3(0, 1, 0) };
}

/** l3: a 16-triangle figure (bipyramid head 8, shoulder wedge 4, an arm quad each 4), classes 0 skin 1 hair 2 top 3 eyes. */
export function figure16(S, head) {
  const { R, F, U } = frameOf(S);
  const verts = [], idx = [];
  const add = (p, bone, cls, nrm) => { verts.push({ p, bone, cls, nrm }); return verts.length - 1; };
  const tri = (a, b, c, centre) => { // wound outwards from `centre`
    const A = verts[a].p, B = verts[b].p, Cc = verts[c].p;
    const nn = B.clone().sub(A).cross(Cc.clone().sub(A));
    if (nn.dot(A.clone().add(B).add(Cc).multiplyScalar(1 / 3).sub(centre)) < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const hc = head.c, hh = head.h;
  const out = (p, c) => p.clone().sub(c).normalize();
  const top = add(hc.clone().addScaledVector(U, hh.y), RB.head, 1, U.clone());
  const bot = add(hc.clone().addScaledVector(U, -hh.y * 0.95), RB.head, 0, U.clone().negate());
  const fr = add(hc.clone().addScaledVector(F, Math.max(hh.x, hh.z) * 0.95), RB.head, 3, F.clone());
  const bk = add(hc.clone().addScaledVector(F, -Math.max(hh.x, hh.z) * 0.95), RB.head, 1, F.clone().negate());
  const le = add(hc.clone().addScaledVector(R, -hh.x * 0.95), RB.head, 0, R.clone().negate());
  const ri = add(hc.clone().addScaledVector(R, hh.x * 0.95), RB.head, 0, R.clone());
  for (const [a, b] of [[fr, ri], [ri, bk], [bk, le], [le, fr]]) { tri(top, a, b, hc); tri(bot, a, b, hc); }
  const ctr = J(S, C.spine2);
  const nk = add(J(S, C.neck), RB.spine2, 2, U.clone());
  const ls = add(J(S, C.lUA).addScaledVector(U, 0.03), RB.lClav, 2, null), rs = add(J(S, C.rUA).addScaledVector(U, 0.03), RB.rClav, 2, null);
  const sp1 = J(S, 3);
  const cf = add(sp1.clone().addScaledVector(F, 0.11), RB.spine1, 2, null), cb = add(sp1.clone().addScaledVector(F, -0.1), RB.spine1, 2, null);
  for (const v of [ls, rs, cf, cb]) verts[v].nrm = out(verts[v].p, ctr);
  tri(nk, ls, cf, ctr); tri(nk, cf, rs, ctr); tri(nk, rs, cb, ctr); tri(nk, cb, ls, ctr);
  for (const [ua, hd, rb, hb] of [[C.lUA, C.lHand, RB.lUA, RB.lHand], [C.rUA, C.rHand, RB.rUA, RB.rHand]]) {
    const s = J(S, ua).addScaledVector(F, 0.03), h = J(S, hd).addScaledVector(F, 0.03);
    const a = add(s.clone().addScaledVector(R, -0.045), rb, 2, F.clone()), b = add(s.clone().addScaledVector(R, 0.045), rb, 2, F.clone());
    const c = add(h.clone().addScaledVector(R, -0.035), hb, 0, F.clone()), d = add(h.clone().addScaledVector(R, 0.035), hb, 0, F.clone());
    const front = s.clone().addScaledVector(F, -1); tri(a, b, c, front); tri(b, d, c, front);
  }
  const n = verts.length, m = { n, pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), uv: new Float32Array(n * 2), b0: new Uint8Array(n), b1: new Uint8Array(n), w0: new Float32Array(n).fill(1), flags: new Uint8Array(n), index: Uint32Array.from(idx) };
  verts.forEach((v, i) => { m.pos.set([v.p.x, v.p.y, v.p.z], i * 3); m.nrm.set([v.nrm.x, v.nrm.y, v.nrm.z], i * 3); m.b0[i] = m.b1[i] = v.bone; m.uv[i * 2] = v.cls / 4 + 0.125; m.flags[i] = v.bone === RB.head ? FLAG_HEAD : 0; });
  return m;
}

/** Per avatar type: skin, hair, top and eye-band colours (linear) sampled from the atlas at the mesh's own uvs. */
export function typeColours(m, img, head, S) {
  const { F } = frameOf(S);
  const acc = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const W = img.width, H = img.height, d = img.data;
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  for (let i = 0; i < m.n; i++) {
    const y = m.pos[i * 3 + 1], nf = m.nrm[i * 3] * F.x + m.nrm[i * 3 + 2] * F.z;
    let cls = -1;
    if (m.b0[i] === RB.head) { if (y > head.c.y + head.h.y * 0.55) cls = 1; else if (nf > 0.6 && y < head.c.y + head.h.y * 0.2) cls = 0; }
    else if ((m.b0[i] === RB.spine1 || m.b0[i] === RB.spine2) && m.flags[i] & FLAG_CLOTH) cls = 2;
    if (cls < 0) continue;
    const px = Math.min(W - 1, Math.floor(m.uv[i * 2] * W)), py = Math.min(H - 1, Math.floor(m.uv[i * 2 + 1] * H)), o = (py * W + px) * 4;
    acc[cls][0] += lin(d[o]); acc[cls][1] += lin(d[o + 1]); acc[cls][2] += lin(d[o + 2]); acc[cls][3]++;
  }
  const avg = (a, f) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : f);
  const skin = avg(acc[0], [0.3, 0.2, 0.15]), hair = avg(acc[1], [0.03, 0.025, 0.02]), top = avg(acc[2], [0.1, 0.1, 0.12]);
  return [skin, hair, top, skin.map((x) => x * 0.55)];
}

/** Drop the hair cards (triangles in the atlas cell's opacity quadrant), as the tv preset does for far/xfar rows. */
export function dropCards(m) {
  const idx = [];
  for (let t = 0; t < m.index.length; t += 3) { const i = m.index[t], u = m.uv[i * 2] * 4, v = m.uv[i * 2 + 1] * 4; if (!(u - Math.floor(u) < 0.5 && v - Math.floor(v) >= 0.5)) idx.push(m.index[t], m.index[t + 1], m.index[t + 2]); }
  return compact(m, Uint32Array.from(idx));
}

/** All four levels for one avatar type. */
const LOD_Q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lod') || '' : '';
export function buildLevels(far, xfar, S, l0type) {
  far = dropCards(far); xfar = dropCards(xfar);
  if (LOD_Q === 'raw') return { head: headBox(far), l0: l0type ? far : null, l1: xfar, l2: l0type ? xfar : null }; // (debug: the shipped meshes untouched)
  if (LOD_Q === 'cut') { // (quality: the shipped meshes only cut, l2 as usual)
    const pY = S.joint[C.pelvis * 3 + 1], kY = S.joint[16 * 3 + 1], hd = headBox(far), b = cutBelow(xfar, pY - 0.04);
    return { head: hd, l0: l0type ? cutBelow(far, (pY + kY) / 2) : null, l1: b, l2: l0type ? simplify(weld(b), 30, { headScale: 2.0, headC: [hd.c.x, hd.c.y, hd.c.z] }) : null };
  }
  const pelvisY = S.joint[C.pelvis * 3 + 1], kneeY = S.joint[16 * 3 + 1];
  const head = headBox(far);
  const hc = [head.c.x, head.c.y, head.c.z];
  const out = { head };
  if (l0type) {
    let a = cutBelow(far, (pelvisY + kneeY) / 2);
    const shoulderY = Math.min(S.joint[C.lUA * 3 + 1], S.joint[C.rUA * 3 + 1]) - 0.05;
    a = simplify(a, 480, { lock: (i) => (a.b0[i] === RB.head && a.w0[i] > 0.9 && a.pos[i * 3 + 1] < head.c.y + head.h.y * 0.5) || a.b0[i] === RB.neck });
    void shoulderY;
    out.l0 = a;
  }
  let b = cutBelow(xfar, pelvisY - 0.04);
  let b1 = simplify(b, 130, { headScale: 2.5, headC: hc });
  const WELD = typeof location === 'undefined' || new URLSearchParams(location.search).get('weld') !== '0';
  if (WELD && (b1.n > 140 || b1.index.length / 3 > 160)) b1 = simplify(weld(b), 130, { headScale: 2.5, headC: hc });
  out.l1 = b1;
  if (l0type) out.l2 = simplify(weld(b), 30, { headScale: 2.0, headC: hc });
  return out;
}
