// Arena spike v1: the live 3D floor (plan C2/C3). Instanced, ring-skinned people at four levels, one opaque draw per
// (level, avatar type), nearest first, no discard. Each person reads one puppet's poses at their own delay (identity
// offset + distance from the reaction's origin), mirrored or not, with their own glances, height and build.
import * as THREE from 'three';
import { SLOTS, N_PUPPETS } from './puppets.js';
import { PARTNER } from './skeleton.js';

const SKIN = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('skin') || 'lbs' : 'lbs'; // &skin=dqs

export const LEVEL_PX = [24, 14, 7]; // head height on screen: l0 >= 24 px, l1 14-24, l2 7-14, l3 below
export const LEVEL_MAX = [Infinity, 26, 16, 9]; // the most a level may be shown at (the cap may demote up to this)
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- layout ----------
export function layout(seed = 7) {
  const rnd = mulberry(seed);
  const bands = [[3.0, 10, 3.2], [10, 22, 2.6], [22, 30, 1.8], [30, 36, 1.4]];
  const hole = (x, z) => (z > 25.6 && z < 30.9 && Math.abs(x) < 3.6) || (z > 22 && z < 25.6 && Math.abs(x) < 0.8);
  const cell = 0.5, grid = new Map(), out = [];
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const near = (x, z, r) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), n = Math.ceil(r / cell);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const L = grid.get(`${cx + i},${cz + j}`); if (L) for (const p of L) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true; }
    return false;
  };
  for (const [z0, z1, d] of bands) {
    let area = 0; for (let x = -14; x < 14; x += 0.1) for (let z = z0; z < z1; z += 0.1) if (!hole(x + 0.05, z + 0.05)) area += 0.01;
    const target = Math.round(area * d), r = 0.78 / Math.sqrt(d);
    let n = 0, tries = 0;
    while (n < target && tries < target * 400) {
      tries++;
      const x = -14 + 28 * rnd(), z = z0 + (z1 - z0) * rnd();
      if (hole(x, z) || near(x, z, r)) continue;
      const p = { x, z }; out.push(p); n++;
      const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
    }
  }
  return out;
}

/** Types, streams (puppet × mirror), delays, yaw, build: with the plan's neighbour rules applied greedily. */
export function assign(places, { types, performer, seed = 11 }) {
  const rnd = mulberry(seed);
  const cell = 2.5, grid = new Map(), key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const order = places.map((_, i) => i).sort(() => rnd() - 0.5);
  let viol = 0, pairs = 0, viol3 = 0;
  for (const i of order) {
    const p = places[i];
    p.type = Math.floor(rnd() * types.length); p.g = types[p.type].g;
    p.idDelay = 0.07 + 0.28 * rnd() + (rnd() - 0.5) * 0.2;
    p.height = 0.94 + 0.12 * rnd(); p.build = 0.92 + 0.16 * rnd(); p.seed = rnd(); p.pal = Math.floor(rnd() * 8); p.phone = rnd() < 0.05 ? 1 : 0;
    const dx = performer.x - p.x, dz = performer.z - p.z;
    p.yaw = Math.atan2(dx, dz) + (rnd() - 0.5) * 2 * 0.31;
    // neighbours already placed
    const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell), nb = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = grid.get(`${cx + a},${cz + b}`); if (L) for (const q of L) { const d2 = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d2 < 9) nb.push([q, d2]); } }
    let best = null, bestS = Infinity;
    const base = p.g === 'f' ? 0 : 16;
    for (let k = 0; k < 32; k++) {
      const pup = base + (k >> 1), mir = k & 1 ? -1 : 1;
      let s = rnd() * 0.01;
      for (const [q, d2] of nb) {
        if (q.puppet !== pup) continue;
        if (d2 < 6.25 && q.mirror === mir && Math.abs(q.idDelay - p.idDelay) < 0.3) s += 1;
        if (d2 < 9 && q.mirror === mir && q.type === p.type) s += 2;
        if (d2 < 6.25 && q.mirror !== mir) s += 0.15; // the same capture mirrored still reads alike close up
      }
      if (s < bestS) { bestS = s; best = [pup, mir]; }
    }
    p.puppet = best[0]; p.mirror = best[1];
    for (const [q, d2] of nb) { if (d2 < 6.25) { pairs++; if (q.puppet === p.puppet && q.mirror === p.mirror && Math.abs(q.idDelay - p.idDelay) < 0.3) viol++; } if (d2 < 9 && q.puppet === p.puppet && q.mirror === p.mirror && q.type === p.type) viol3++; }
    const k = key(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
  }
  return { pairs, sameStreamWithin2p5: viol, sameTypeStreamWithin3: viol3 };
}

// ---------- shaders ----------
const COMMON_VS = /* glsl */ `
#define NP ${N_PUPPETS}.0
#define NS ${SLOTS}.0
uniform highp sampler2D uRing;
uniform float uHead, uTime, uSpeed; uniform vec3 uOrigin;
uniform vec3 uHeadJ; uniform float uPart[20];
uniform vec3 uKeyPos, uKeyDir, uKeyColor; uniform float uKeyCos, uKeyPen;
uniform vec3 uSky, uGround; uniform float uHouse;
uniform vec4 uPool[4]; uniform vec3 uPoolCol[4];
uniform vec3 uBlindPos, uBlindCol, uSpotA, uRimCol;
uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
uniform vec3 uPal[8];
attribute vec4 aSkin; attribute vec4 aI0; attribute vec4 aI1; attribute vec4 aI2;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void bone(float b, int r0, int r1, float k, float mir, out vec4 q, out vec3 t) {
#ifdef NOFETCH
  q = vec4(0.0, 0.0, 0.0, 1.0); t = vec3(0.0, b * 1e-4 + float(r0 + r1) * 1e-7 + k * 1e-5, 0.0);
#else
  int x = int(b) * 2;
  vec4 qa = texelFetch(uRing, ivec2(x, r0), 0), qb = texelFetch(uRing, ivec2(x, r1), 0);
  vec3 ta = texelFetch(uRing, ivec2(x + 1, r0), 0).xyz, tb = texelFetch(uRing, ivec2(x + 1, r1), 0).xyz;
  if (dot(qa, qb) < 0.0) qb = -qb;
  q = normalize(mix(qa, qb, k)); t = mix(ta, tb, k);
#endif
  q.yz *= mir; t.x *= mir; // a mirrored person: M · K(partner) · M, M = diag(-1, 1, 1)
}
void skinned(out vec3 wpos, out vec3 wn, out float fl) {
  float mir = aI2.z;
  float b0 = aSkin.x, b1 = aSkin.y;
  if (mir < 0.0) { b0 = uPart[int(b0)]; b1 = uPart[int(b1)]; }
  float dl = clamp(aI1.y + length(aI0.xy - uOrigin.xz) / uSpeed, 0.0, 1.1);
  float s = mod(uHead - 1.0 - dl * 30.0 + NS, NS), s0 = floor(s), k = s - s0, s1 = mod(s0 + 1.0, NS);
  int r0 = int(s0 * NP + aI1.x + 0.5), r1 = int(s1 * NP + aI1.x + 0.5);
  vec4 q0; vec3 t0; bone(b0, r0, r1, k, mir, q0, t0);
  vec3 p = qrot(q0, position) + t0, n = qrot(q0, normal.xyz);
#ifndef RIGID
  vec4 q1; vec3 t1; bone(b1, r0, r1, k, mir, q1, t1);
  float w0 = aSkin.z / 255.0;
#ifdef DQS
  // dual-quaternion blend of the two bones: an arm overhead keeps its shoulder (linear blending collapsed it into a fin)
  vec4 d0 = 0.5 * vec4(q0.w * t0 + cross(t0, q0.xyz), -dot(t0, q0.xyz)), d1 = 0.5 * vec4(q1.w * t1 + cross(t1, q1.xyz), -dot(t1, q1.xyz));
  float hs = dot(q0, q1) < 0.0 ? -1.0 : 1.0;
  vec4 Qb = w0 * q0 + (1.0 - w0) * hs * q1, Db = w0 * d0 + (1.0 - w0) * hs * d1;
  float Lb = 1.0 / length(Qb); Qb *= Lb; Db *= Lb;
  p = qrot(Qb, position) + 2.0 * (Qb.w * Db.xyz - Db.w * Qb.xyz + cross(Qb.xyz, Db.xyz)); n = qrot(Qb, normal.xyz);
#else
  p = mix(qrot(q1, position) + t1, p, w0); n = mix(qrot(q1, normal.xyz), n, w0);
#endif
#endif
  fl = aSkin.w;
  // head glances: a constant gaze offset and seeded looks of up to 25 degrees for 2-4 s every 6-20 s
  float sd = aI1.w, per = 6.0 + 14.0 * fract(sd * 7.13), ph = mod(uTime + sd * 97.0, per), ln = 2.0 + 2.0 * fract(sd * 3.7);
  float g = smoothstep(0.0, 0.6, ph) * (1.0 - smoothstep(ln, ln + 0.6, ph));
  float yaw = (fract(sd * 5.3) - 0.5) * 0.35 + g * 0.44 * (fract(sd * 11.1) < 0.5 ? -1.0 : 1.0);
  float hd = mod(fl, 2.0);
  vec3 piv = qrot(q0, uHeadJ) + t0, d = p - piv; float cg = cos(yaw * hd), sg = sin(yaw * hd);
  p = piv + vec3(cg * d.x + sg * d.z, d.y, -sg * d.x + cg * d.z); n = vec3(cg * n.x + sg * n.z, n.y, -sg * n.x + cg * n.z);
  // place: build, height, yaw, spot
  p.xz *= aI1.z; p *= aI0.w;
  float cy = cos(aI0.z), sy = sin(aI0.z);
  wpos = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z) + vec3(aI0.x, 0.0, aI0.y);
  wn = normalize(vec3(cy * n.x + sy * n.z, n.y, -sy * n.x + cy * n.z));
}
vec3 arenaLight(vec3 w, vec3 N) {
  vec3 V = normalize(cameraPosition - w);
  vec3 Lk = uKeyPos - w; float d2 = dot(Lk, Lk); Lk *= inversesqrt(d2);
  float spot = smoothstep(uKeyCos, uKeyPen, dot(Lk, -uKeyDir));
  vec3 irr = uKeyColor * (max(dot(N, Lk), 0.0) * spot / max(d2, 0.01));
  irr += mix(uGround, uSky, 0.5 + 0.5 * N.y) * uHouse;
  float top = 0.4 + 0.6 * max(N.y, 0.0);
  for (int i = 0; i < 4; i++) { vec2 dd = (w.xz - uPool[i].xz) / uPool[i].w; float f = max(0.0, 1.0 - dot(dd, dd)); irr += uPoolCol[i] * (f * f * top); }
  vec3 Lb = uBlindPos - w; float db2 = dot(Lb, Lb);
  irr += uBlindCol * ((0.4 + 0.6 * max(dot(N, Lb * inversesqrt(db2)), 0.0)) / (1.0 + db2 * 0.004));
  float rim = 1.0 - abs(dot(N, V)); rim = rim * rim * rim;
  irr += uRimCol * (rim * max(dot(N, normalize(uSpotA - w)) + 0.3, 0.0));
  return irr;
}
`;

const LEAN_VS = COMMON_VS + /* glsl */ `
varying mediump vec2 vUv; varying mediump vec3 vMul; varying mediump vec3 vAdd;
void main() {
  vec3 w, N; float fl; skinned(w, N, fl);
  vec3 irr = arenaLight(w, N);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float fog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vec3 cl = mix(vec3(1.0), uPal[int(aI2.x)], step(1.5, fl));
  vMul = irr * cl * (1.0 - fog); vAdd = uFogColor * fog; vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;
const HEJL = /* glsl */ `
uniform float uExposure;
vec3 hejl(vec3 c) { c *= uExposure; vec3 x = max(vec3(0.0), c - 0.004); return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06); }`;
// (no hair cards: the levels drop them as the tv preset does for far/xfar rows, so one texture read, opaque, no discard)
const LEAN_FS = /* glsl */ `
precision mediump float;
uniform sampler2D map;
${HEJL}
varying mediump vec2 vUv; varying mediump vec3 vMul; varying mediump vec3 vAdd;
void main() { gl_FragColor = vec4(hejl(texture2D(map, vUv).rgb * vMul + vAdd), 1.0); }`;

const FIG_VS = COMMON_VS + /* glsl */ `
uniform vec3 uCol[48];
varying mediump vec3 vCol;
void main() {
  vec3 w, N; float fl; skinned(w, N, fl);
  vec3 irr = arenaLight(w, N);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float fog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  int cls = int(uv.x * 4.0);
  vec3 c = uCol[int(aI2.w) * 4 + cls];
  if (cls == 2) c *= uPal[int(aI2.x)];
  vCol = c * irr * (1.0 - fog) + uFogColor * fog;
  gl_Position = projectionMatrix * mv;
}`;
const FIG_FS = /* glsl */ `
precision mediump float;
${HEJL}
varying mediump vec3 vCol;
void main() { gl_FragColor = vec4(hejl(vCol), 1.0); }`;

// "ref": today's crowdMaterialVlit varying and fragment profile (24 varying floats, per-fragment rim, YIQ tint, fog in
// the fragment stage) on the same skinned vertex stage, to see what the lean outputs buy
const REF_VS = COMMON_VS + /* glsl */ `
varying vec2 vUv; varying vec3 vLit; varying vec3 vLitB; varying vec3 vNv; varying vec3 vPv; varying float vRimK; varying float vMir;
varying vec4 vCrowd; varying vec4 vTint;
void main() {
  vec3 w, N; float fl; skinned(w, N, fl);
  vLit = arenaLight(w, N); vLitB = arenaLight(w, -N);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vNv = normalize((viewMatrix * vec4(N, 0.0)).xyz); vPv = mv.xyz; vRimK = 1.5; vMir = aI2.z;
  vCrowd = vec4(1.0, 0.0, 1.0, step(1.5, fl)); vTint = vec4(aI2.x * 0.3, 0.8, 1.0, 1.0); vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;
const REF_FS = /* glsl */ `
uniform sampler2D map; uniform vec3 uRimCol; uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
${HEJL}
varying vec2 vUv; varying vec3 vLit; varying vec3 vLitB; varying vec3 vNv; varying vec3 vPv; varying float vRimK; varying float vMir;
varying vec4 vCrowd; varying vec4 vTint;
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  float Y = dot(c, vec3(0.299, 0.587, 0.114));
  vec2 iq = vec2(dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
  float cs = cos(vTint.x), sn = sin(vTint.x);
  iq = vec2(iq.x * cs - iq.y * sn, iq.x * sn + iq.y * cs) * vTint.y;
  vec3 t = vec3(Y + 0.956 * iq.x + 0.621 * iq.y, Y - 0.272 * iq.x - 0.647 * iq.y, Y - 1.106 * iq.x + 1.703 * iq.y);
  t = max(t, 0.0); float Lt = dot(t, vec3(0.299, 0.587, 0.114)); t = mix(vec3(Lt), t, 0.7) * min(1.0, 0.36 / max(Lt, 1e-3));
  c = mix(c, t, vCrowd.w) * vTint.w * vCrowd.z;
  vec3 Nf = normalize(vNv), lit = vLit;
  if (gl_FrontFacing == (vMir < 0.0)) { Nf = -Nf; lit = vLitB; }
  float rimF = 1.0 - abs(dot(Nf, normalize(-vPv)));
  vec3 rim = uRimCol * (rimF * rimF * rimF) * vRimK;
  vec3 col = c * lit + (0.25 + c) * rim;
  float fog = clamp((length(vPv) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(hejl(mix(col, uFogColor, fog)), 1.0);
}`;
const COUNT_FS = /* glsl */ `precision mediump float; void main() { gl_FragColor = vec4(1.0 / 255.0, 0.0, 0.0, 1.0); }`;

/**
 * level: 0..3; kind: lean | ref | nofetch; shared: the shared uniforms (ring, time, lights); extra: per-type uniforms.
 */
export function floorMaterial(level, kind, shared, extra, count = false) {
  const fig = level === 3;
  const defines = {};
  if (level >= 2) defines.RIGID = 1;
  if (kind === 'nofetch') defines.NOFETCH = 1;
  if (kind === 'rigid') defines.RIGID = 1;
  if (SKIN === 'dqs') defines.DQS = 1;
  const vs = fig ? FIG_VS : kind === 'ref' ? REF_VS : LEAN_VS;
  const fs = count ? COUNT_FS : fig ? FIG_FS : kind === 'ref' ? REF_FS : LEAN_FS;
  const m = new THREE.ShaderMaterial({ uniforms: { ...shared, ...extra }, vertexShader: vs, fragmentShader: fs, defines, side: THREE.FrontSide });
  if (count) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation; m.transparent = false; }
  return m;
}
export const partnerUniform = () => ({ value: PARTNER.map((x) => x) });

/** One instanced group: a level geometry shared by many people, instance data sized for everyone. */
export function makeGroup(geo, mat, max, name) {
  const g = new THREE.InstancedBufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
  g.setIndex(geo.index);
  const I = [0, 1, 2].map(() => new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
  I.forEach((a, k) => { a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aI' + k, a); });
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 20), 200);
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.name = name; mesh.matrixAutoUpdate = false;
  return { mesh, geo: g, I, verts: geo.userData.verts, tris: geo.userData.tris, count: 0 };
}

/**
 * The per-cut allocator: for every place, the largest head size over the camera move's samples picks its level;
 * the setup's vertex cap demotes the farthest people while their level allows it; groups are packed nearest first.
 * cams: PerspectiveCameras (the move's samples), H: drawing height. groupOf(level, place) → group.
 */
export function allocate(places, cams, H, cap, groupOf, force = -1) {
  const v = new THREE.Vector3(), headM = 0.24;
  const vis = [];
  for (const p of places) {
    let px = 0, depth = Infinity, seen = false;
    for (const cam of cams) {
      const k = H / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      for (const y of [1.62 * p.height, 1.0]) {
        v.set(p.x, y, p.z).applyMatrix4(cam.matrixWorldInverse);
        const dz = -v.z; if (dz < 0.3) continue;
        const sx = (v.x * k) / dz / (H * cam.aspect / 2), sy = (v.y * k) / dz / (H / 2);
        if (Math.abs(sx) < 1.1 && sy > -1.1 && sy < 1.1) seen = true;
        if (y > 1.5) { px = Math.max(px, (headM * p.height * k) / dz); depth = Math.min(depth, dz); }
      }
    }
    if (!seen) continue;
    let level = force >= 0 ? force : px >= LEVEL_PX[0] ? 0 : px >= LEVEL_PX[1] ? 1 : px >= LEVEL_PX[2] ? 2 : 3;
    vis.push({ p, px, depth, level });
  }
  let verts = vis.reduce((s, q) => s + groupOf(q.level, q.p).verts, 0);
  const before = verts;
  if (cap > 0 && force < 0) {
    const order = vis.slice().sort((a, b) => b.depth - a.depth);
    for (let pass = 0; pass < 3 && verts > cap; pass++) for (const q of order) {
      if (verts <= cap) break;
      if (q.level >= 3 || q.px > LEVEL_MAX[q.level + 1]) continue;
      verts -= groupOf(q.level, q.p).verts; q.level++; verts += groupOf(q.level, q.p).verts;
    }
  }
  return { vis, verts, before };
}

export function pack(vis, groups, groupOf) {
  for (const G of groups) G.count = 0;
  vis.sort((a, b) => a.depth - b.depth);
  for (const q of vis) {
    const G = groupOf(q.level, q.p), i = G.count++, p = q.p;
    G.I[0].array.set([p.x, p.z, p.yaw, p.height], i * 4);
    G.I[1].array.set([p.puppet, p.idDelay, p.build, p.seed], i * 4);
    G.I[2].array.set([p.pal, p.phone, p.mirror, p.type], i * 4);
  }
  for (const G of groups) { G.geo.instanceCount = G.count; G.mesh.visible = G.count > 0; for (const a of G.I) a.needsUpdate = true; }
}
