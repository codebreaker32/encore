// Arena spike v1 (2026-10-16): the plan's riskiest assumption, standalone. About 2,100 instanced floor people at four
// detail levels, skinned in the vertex shader from a float ring texture that forty puppets rewrite 30 times a second,
// seen from the S1 "comic's-eye" wide at 800×450. Nothing here imports the shared crowd modules (crowd.js, people.js,
// anim.js, instances.js...): three.js from vendor/, the avatars and clips read-only.
//
// Switches: &shader=lean|ref|nofetch|rigid  &ring=f32|f16|static  &cap=55000 (0: none)  &state=listen|laugh|cheer|cycle
//   &bench=l2:1000 (N people all at one level)  &floor=0  &shell=0  &gpu=1 (gl.finish each frame, timed)
//   &still&t=  (a frame-exact render at time t)  &hud=0  &dolly=0  &raster=0 (rasterizer discard on the floor draws)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from './meshopt_simplifier.module.js';
import { CL, loadClips } from './clips.js';
import { buildSkeleton, compareSkeletons, fk, skinOf, C, RB, PARTNER } from './skeleton.js';
import { extract, buildLevels, figure16, typeColours, toGeometry, headBox } from './lods.js';
import { Puppets, PoseRing, SLOTS, TICK_HZ, N_PUPPETS, levelAt } from './puppets.js';
import { layout, assign, floorMaterial, makeGroup, allocate, pack, LEVEL_PX } from './floor.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) && Q.get(k) !== '' ? +Q.get(k) : d);
const KIND = Q.get('shader') || 'lean', RINGF = Q.get('ring') || 'f32', CAP = num('cap', 55000), STATE = Q.get('state') || 'laugh';
const STILL = Q.has('still'), BENCH = Q.get('bench') || '', FLOOR = Q.get('floor') !== '0', SHELL = Q.get('shell') !== '0';
const GPU = Q.has('gpu'), HUD = Q.get('hud') !== '0', DOLLY = Q.get('dolly') !== '0', RASTER = Q.get('raster') !== '0';
const W = 800, H = 450, BASE = '../../';
const hud = document.getElementById('hud');
const say = (s) => { if (HUD) hud.textContent = s; };
const t00 = performance.now(), marks = {};
const mark = (k) => { marks[k] = Math.round(performance.now() - t00); };

const AV = ['Female_Adult_02', 'Male_Adult_04', 'Female_Adult_13', 'Male_Adult_07', 'Female_Adult_03', 'Male_Adult_10', 'Female_Adult_04', 'Male_Adult_12', 'Female_Adult_12', 'Male_Adult_06', 'Female_Adult_17', 'Male_Adult_17'];
const L0 = ['Female_Adult_03', 'Female_Adult_13', 'Female_Adult_17', 'Male_Adult_04', 'Male_Adult_12', 'Male_Adult_17']; // outside the front cast
const gOf = (n) => (n.startsWith('Female') ? 'f' : 'm');

// ---------- renderer, camera ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: STILL });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; // (Hejl in the shaders writes display values)
renderer.setClearColor(new THREE.Color().setRGB(0.035, 0.04, 0.06, THREE.LinearSRGBColorSpace));
const gl = renderer.getContext();
const scene = new THREE.Scene();
scene.matrixWorldAutoUpdate = false;
const fovFor = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(10.125 / mm));
const S1 = { pos: [0.9, 4.4, -0.6], look: [0, 1.3, 18], mm: 30 };
const camera = new THREE.PerspectiveCamera(fovFor(S1.mm), W / H, 0.1, 400);
const PERFORMER = new THREE.Vector3(0.3, 1.7, -2.4);
function placeCam(cam, phase) { // the lateral dolly along the stage lip (±1.2 m, 0.06 m/s at most), the pan following
  const s = Math.sin(phase);
  cam.position.set(S1.pos[0] + 1.2 * s, S1.pos[1], S1.pos[2]);
  cam.lookAt(S1.look[0] + 0.35 * s, S1.look[1], S1.look[2]);
  cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
}
const dollyPhase = (t) => (DOLLY ? 0.05 * t : 0);
placeCam(camera, 0);

// ---------- shared uniforms: ring, clock, lights ----------
const U = {
  uRing: { value: null }, uHead: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: 30 }, uOrigin: { value: new THREE.Vector3(-3, 0, 12) },
  uKeyPos: { value: new THREE.Vector3(0, 8.5, -2.5) }, uKeyDir: { value: new THREE.Vector3() }, uKeyColor: { value: new THREE.Color(1.0, 0.93, 0.85).multiplyScalar(48) },
  uKeyCos: { value: Math.cos(THREE.MathUtils.degToRad(38)) }, uKeyPen: { value: Math.cos(THREE.MathUtils.degToRad(18)) },
  uSky: { value: new THREE.Color(0.036, 0.042, 0.062) }, uGround: { value: new THREE.Color(0.012, 0.012, 0.016) }, uHouse: { value: 1 },
  uPool: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1.6, 0, 4.5)) },
  uPoolCol: { value: [new THREE.Color(0.11, 0.07, 0.03), new THREE.Color(0.1, 0.065, 0.03), new THREE.Color(0.035, 0.055, 0.1), new THREE.Color(0.035, 0.05, 0.095)] },
  uBlindPos: { value: new THREE.Vector3(0, 2.6, -1.4) }, uBlindCol: { value: new THREE.Color(0, 0, 0) },
  uSpotA: { value: new THREE.Vector3(0, 6.6, 29) }, uRimCol: { value: new THREE.Color(0.07, 0.08, 0.11) },
  uFogColor: { value: new THREE.Color(0.007, 0.0095, 0.018) }, uFogNear: { value: 18 }, uFogFar: { value: 120 },
  // (the clothes compressed towards dark, muted tones: a multiplier on the atlas's own clothes)
  uPal: { value: [[0.42, 0.42, 0.46], [0.3, 0.32, 0.4], [0.4, 0.32, 0.3], [0.28, 0.34, 0.3], [0.48, 0.46, 0.43], [0.24, 0.24, 0.27], [0.4, 0.33, 0.36], [0.34, 0.36, 0.34]].map((c) => new THREE.Color(...c)) },
  uExposure: { value: 1.15 },
};
U.uKeyDir.value.set(0, 1.2, 9).sub(U.uKeyPos.value).normalize();

// ---------- room events (the measured moments in the real page; scripted here) ----------
const SCHED = {
  listen: { period: 1e9, list: [] },
  laugh: { period: 12, list: [['laugh', 2.0, 0.9, 3.0]] },
  cheer: { period: 12, list: [['cheer', 2.0, 0.9, 3.0]] },
  cycle: { period: 42, list: [['laugh', 2, 0.5, 2.2], ['laugh', 12, 0.9, 3.0], ['cheer', 22, 0.9, 3.0], ['applause', 32, 0.7, 4.0]] },
}[STATE] || { period: 1e9, list: [] };
function eventsAt(t) {
  const out = [], P = SCHED.period, c0 = Math.floor(t / P);
  for (let c = c0 - 1; c <= c0; c++) { if (c < 0) continue; SCHED.list.forEach(([kind, at, s, hold], k) => { const t0 = c * P + at; if (t0 <= t + 0.01 && t - t0 < hold + 3) out.push({ id: c * 10 + k + 1, kind, t0, s, hold }); }); }
  return out;
}

// ---------- load ----------
const loader = new GLTFLoader();
const glb = (f) => new Promise((res, rej) => loader.load(BASE + 'people/' + f, (g) => res(g.scene), undefined, rej));
async function atlasPixels() {
  const blob = await fetch(BASE + 'people/lod_atlas_1k.jpg').then((r) => r.blob());
  const bmp = await createImageBitmap(blob);
  const cv = new OffscreenCanvas(bmp.width, bmp.height), g = cv.getContext('2d');
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, bmp.width, bmp.height);
}

let groups = [], groupOf = null, places = [], puppets = null, ring = null, shell = null, glows = null, massPlane = null, report = {};
const countMats = new Map();

async function main() {
  say('loading…');
  MeshoptSimplifier.useExperimentalFeatures = true;
  const [, atlasPx, atlasTex, scenes] = await Promise.all([
    loadClips(BASE + 'anim/'), atlasPixels(),
    new Promise((r) => new THREE.TextureLoader().load(BASE + 'people/lod_atlas_1k.jpg', r)),
    Promise.all(AV.map(async (n) => ({ n, far: await glb(n + '.far.glb'), xfar: await glb(n + '.xfar.glb') }))),
    MeshoptSimplifier.ready,
  ]);
  mark('loaded');
  atlasTex.flipY = false; atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.generateMipmaps = true; atlasTex.minFilter = THREE.LinearMipmapLinearFilter; atlasTex.needsUpdate = true;

  // skeletons: one per gender drives every avatar of that gender (the plan's "identical bind skeleton" claim, checked)
  const skel = {}, ref = { f: 'Female_Adult_03', m: 'Male_Adult_04' };
  const own = new Map();
  for (const s of scenes) { own.set(s.n, { far: buildSkeleton(s.far), xfar: buildSkeleton(s.xfar) }); }
  skel.f = own.get(ref.f).far; skel.m = own.get(ref.m).far;
  const sameSkel = {};
  for (const s of scenes) { const g = gOf(s.n); const a = compareSkeletons(skel[g], own.get(s.n).far), b = compareSkeletons(skel[g], own.get(s.n).xfar); sameSkel[s.n] = { far: a, xfar: b }; }
  report.skeleton = { f: skel.f.check, m: skel.m.check, armQ: { f: Array.from(skel.f.armQ).map((x) => +x.toFixed(4)), m: Array.from(skel.m.armQ).map((x) => +x.toFixed(4)) }, perAvatar: sameSkel };

  // levels
  const types = AV.map((n) => ({ n, g: gOf(n), l0: L0.includes(n) }));
  const lv = { l0: {}, l1: {}, l2: {}, l3: {} }, cols = new Array(48).fill(0).map(() => new THREE.Color());
  const counts = {};
  for (const s of scenes) {
    const g = gOf(s.n), O = own.get(s.n);
    const far = extract(s.far, O.far), xfar = extract(s.xfar, O.xfar);
    const L = buildLevels(far, xfar, skel[g], L0.includes(s.n));
    for (const k of ['l0', 'l1', 'l2']) if (L[k]) { lv[k][s.n] = toGeometry(L[k], k === 'l2'); counts[k + ' ' + s.n] = [L[k].n, L[k].index.length / 3]; }
    const tc = typeColours(far, atlasPx, L.head, skel[g]), ti = AV.indexOf(s.n);
    tc.forEach((c, k) => cols[ti * 4 + k].setRGB(c[0], c[1], c[2]));
    if (s.n === ref[g]) lv.l3[g] = toGeometry(figure16(skel[g], headBox(far)), true);
  }
  counts['l3 f'] = [lv.l3.f.userData.verts, lv.l3.f.userData.tris]; counts['l3 m'] = [lv.l3.m.userData.verts, lv.l3.m.userData.tris];
  report.levels = counts;
  mark('levels');

  // ring + puppets
  ring = new PoseRing(renderer, RINGF === 'f16' ? 'f16' : 'f32');
  U.uRing.value = ring.tex;
  puppets = new Puppets(skel, ring.data);

  // floor
  places = layout(7);
  report.assign = assign(places, { types, performer: PERFORMER });
  report.places = places.length;
  const extraFor = (g, level) => {
    const S = skel[g];
    const e = { uHeadJ: { value: new THREE.Vector3(S.joint[C.head * 3], S.joint[C.head * 3 + 1], S.joint[C.head * 3 + 2]) }, uPart: { value: PARTNER.slice() } };
    if (level < 3) e.map = { value: atlasTex }; else e.uCol = { value: cols };
    return e;
  };
  const G = { 0: {}, 1: {}, 2: {}, 3: {} };
  const mk = (level, key, geo, g) => {
    const mat = floorMaterial(level, KIND, U, extraFor(g, level));
    const grp = makeGroup(geo, mat, places.length, `instances-floor-l${level}-${key}`);
    grp.level = level; grp.mesh.renderOrder = 1 + level;
    countMats.set(grp, floorMaterial(level, KIND, U, extraFor(g, level), true));
    G[level][key] = grp; groups.push(grp); if (FLOOR) scene.add(grp.mesh);
    if (!RASTER) { grp.mesh.onBeforeRender = () => gl.enable(gl.RASTERIZER_DISCARD); grp.mesh.onAfterRender = () => gl.disable(gl.RASTERIZER_DISCARD); }
  };
  for (const n of L0) { mk(0, n, lv.l0[n], gOf(n)); mk(2, n, lv.l2[n], gOf(n)); }
  for (const n of AV) mk(1, n, lv.l1[n], gOf(n));
  mk(3, 'f', lv.l3.f, 'f'); mk(3, 'm', lv.l3.m, 'm');
  const sub = (type) => { const n = AV[type]; if (L0.includes(n)) return n; const same = L0.filter((x) => gOf(x) === gOf(n)); return same[type % same.length]; };
  groupOf = (level, p) => (level === 0 ? G[0][sub(p.type)] : level === 1 ? G[1][AV[p.type]] : level === 2 ? G[2][sub(p.type)] : G[3][p.g]);

  if (SHELL) buildShell();
  doAllocate();
  mark('floor');

  // first frame: fill the ring, compile everything with every group visible (a cut never compiles)
  const t0 = STILL ? num('t', 3) : num('t0', 0);
  fillRing(t0);
  const vis = groups.map((g) => g.mesh.visible); groups.forEach((g) => { g.mesh.visible = true; });
  renderer.compile(scene, camera);
  groups.forEach((g, i) => { g.mesh.visible = vis[i]; });
  mark('compiled');
  report.caps = caps();
  window.__spike.ready = true;
  if (STILL) { renderAt(t0); document.body.dataset.ready = '1'; return; }
  requestAnimationFrame(loop);
}

// ---------- allocation per cut ----------
let alloc = null;
function doAllocate() {
  const cams = (DOLLY ? [-Math.PI / 2, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 2] : [0]).map((ph) => { const c = camera.clone(); placeCam(c, ph); return c; });
  let force = -1, N = Infinity;
  if (BENCH) { const [l, n] = BENCH.split(':'); force = +l.replace('l', ''); N = +n; }
  alloc = allocate(places, cams, H, BENCH ? 0 : CAP, groupOf, force);
  if (BENCH) { alloc.vis.sort((a, b) => a.depth - b.depth); alloc.vis.length = Math.min(alloc.vis.length, N); }
  pack(alloc.vis, groups, groupOf);
  const per = [0, 1, 2, 3].map((L) => alloc.vis.filter((q) => q.level === L).length);
  report.alloc = { people: alloc.vis.length, perLevel: per, vertsBeforeCap: alloc.before, verts: groups.reduce((s, g) => s + g.count * g.verts, 0), tris: groups.reduce((s, g) => s + g.count * g.tris, 0) };
}

// ---------- the shell: ground, floor-mass plane, bowl, FOH, towers, glows (cheap, for context) ----------
const SHELL_VS = /* glsl */ `
attribute vec3 color; varying vec3 vC; varying float vF;
uniform vec4 uPool[4]; uniform vec3 uPoolCol[4]; uniform float uHouse, uFogNear, uFogFar;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 c = color * uHouse;
  if (normal.y > 0.9) for (int i = 0; i < 4; i++) { vec2 dd = (position.xz - uPool[i].xz) / uPool[i].w; float f = max(0.0, 1.0 - dot(dd, dd)); c += uPoolCol[i] * f * f * 0.5 * color * 6.0; }
  vC = c; vF = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const SHELL_FS = /* glsl */ `
uniform vec3 uFogColor; uniform float uExposure; varying vec3 vC; varying float vF;
void main() { vec3 c = mix(vC, uFogColor, vF) * uExposure; vec3 x = max(vec3(0.0), c - 0.004); gl_FragColor = vec4((x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06), 1.0); }`;
function buildShell() {
  const pos = [], col = [], nrm = [];
  const quad = (a, b, c, d, rgb, n = [0, 1, 0]) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); col.push(...rgb); nrm.push(...n); } };
  const box = (x0, x1, y0, y1, z0, z1, rgb) => {
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], rgb);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], rgb.map((v) => v * 0.7), [0, 0, -1]);
    quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], rgb.map((v) => v * 0.6), [1, 0, 0]);
    quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], rgb.map((v) => v * 0.6), [-1, 0, 0]);
  };
  quad([-40, 0, -3], [40, 0, -3], [40, 0, 75], [-40, 0, 75], [0.01, 0.01, 0.013]);
  // the end stand: lower tier rows (steel-blue wash), the upper ring dark
  for (let r = 0; r < 14; r++) { const z0 = 39 + r * 1.6, y0 = 0.6 + r * 0.95, c = r % 2 ? [0.03, 0.04, 0.065] : [0.022, 0.03, 0.05]; quad([-24, y0, z0], [24, y0, z0], [24, y0 + 0.95, z0 + 1.6], [-24, y0 + 0.95, z0 + 1.6], c, [0, 0.5, -0.86]); }
  quad([-26, 14, 61.4], [26, 14, 61.4], [26, 27, 70], [-26, 27, 70], [0.014, 0.016, 0.024], [0, 0.5, -0.86]);
  for (const s of [-1, 1]) for (let r = 0; r < 10; r++) { const x0 = s * (16 + r * 1.6), y0 = 0.6 + r * 0.95, c = r % 2 ? [0.026, 0.034, 0.055] : [0.02, 0.026, 0.044]; quad([x0, y0, -2], [x0, y0, 40], [x0 + s * 1.6, y0 + 0.95, 40], [x0 + s * 1.6, y0 + 0.95, -2], c, [-s * 0.86, 0.5, 0]); }
  box(-3.2, 3.2, 0, 0.6, 26, 30.5, [0.02, 0.018, 0.018]); box(-1.6, 1.6, 0.6, 1.5, 27, 28.2, [0.03, 0.025, 0.02]);
  for (const x of [-4, 4]) box(x - 0.25, x + 0.25, 0, 6.4, 28.8, 29.3, [0.012, 0.012, 0.014]);
  for (const x of [-13, 13]) box(x - 0.4, x + 0.4, 0, 12, 21.8, 22.6, [0.01, 0.01, 0.012]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SHELL_VS, fragmentShader: SHELL_FS, side: THREE.DoubleSide });
  shell = new THREE.Mesh(g, mat); shell.frustumCulled = false; shell.renderOrder = 10; shell.matrixAutoUpdate = false; scene.add(shell);
  // the floor-mass plane at chest height (gaps read as packed bodies), drawn first so early-z keeps the legs behind it
  const mp = [], mc = [], mn = [];
  const mq = (x0, x1, z0, z1) => { for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]]) { mp.push(x, 1.2, z); mc.push(0.0045, 0.004, 0.0045); mn.push(0, 1, 0); } };
  mq(-14.2, 14.2, 3.6, 25.6); mq(-14.2, -3.6, 25.6, 30.9); mq(3.6, 14.2, 25.6, 30.9); mq(-14.2, 14.2, 30.9, 36.3);
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mg.setAttribute('color', new THREE.Float32BufferAttribute(mc, 3)); mg.setAttribute('normal', new THREE.Float32BufferAttribute(mn, 3));
  massPlane = new THREE.Mesh(mg, mat); massPlane.frustumCulled = false; massPlane.renderOrder = 0; massPlane.matrixAutoUpdate = false; massPlane.name = 'floor-mass';
  if (FLOOR) scene.add(massPlane);
  // glows: followspot lenses (the glare in frame), the FOH desk, delay-tower lamps, exit signs, aisle step lights
  const gp = [], gc = [], gs = [];
  const glow = (p, c, s) => { gp.push(...p); gc.push(...c); gs.push(s); };
  for (const x of [-4, 4]) glow([x, 6.6, 29], [1.0, 0.92, 0.8], 2.6);
  for (let i = 0; i < 5; i++) glow([-1.2 + i * 0.6, 1.55, 27.1], [0.9, 0.6, 0.3], 0.18);
  for (const x of [-13, 13]) glow([x, 12.1, 22.2], [0.8, 0.7, 0.6], 0.5);
  for (const x of [-18, -9, 0, 9, 18]) glow([x, 15.2, 61], [0.2, 0.9, 0.4], 0.35);
  for (let r = 0; r < 14; r++) for (const x of [-14, 0, 14]) glow([x, 0.7 + r * 0.95, 39.2 + r * 1.6], [1.0, 0.6, 0.2], 0.08);
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); ggeo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3)); ggeo.setAttribute('aSize', new THREE.Float32BufferAttribute(gs, 1));
  const gm = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) } },
    vertexShader: 'attribute vec3 color; attribute float aSize; uniform float uScale; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aSize * uScale / -mv.z, 2.0, 64.0); vC = color; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = exp(-r * r * 6.0) + 0.6 * exp(-r * r * 40.0); gl_FragColor = vec4(vC * a, 1.0); }',
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  glows = new THREE.Points(ggeo, gm); glows.frustumCulled = false; glows.renderOrder = 20; glows.matrixAutoUpdate = false; scene.add(glows);
}

// ---------- per-frame state: puppets, ring, lights ----------
let lastTick = -1, skipped = 0;
const tickAt = (k) => { puppets.events = eventsAt(k / TICK_HZ); puppets.tick(k / TICK_HZ, ((k % SLOTS) + SLOTS) % SLOTS, k % 2 === 0); };
function fillRing(t) {
  const n = Math.floor(t * TICK_HZ);
  for (let k = n - SLOTS + 1; k <= n; k++) tickAt(k);
  ring.full(); lastTick = n;
}
function step(t) {
  const n = Math.floor(t * TICK_HZ);
  let ticks = 0;
  if (RINGF !== 'static') {
    if (n - lastTick > 4) { skipped += n - lastTick - 4; lastTick = n - 4; }
    for (let k = lastTick + 1; k <= n; k++) { tickAt(k); ring.slot(((k % SLOTS) + SLOTS) % SLOTS); ticks++; }
    lastTick = Math.max(lastTick, n);
  }
  U.uHead.value = (((lastTick % SLOTS) + SLOTS) % SLOTS) + Math.min(0.999, Math.max(0, t * TICK_HZ - lastTick));
  return ticks;
}
function cues(t) {
  U.uTime.value = t % 600;
  const P = U.uPool.value, base = [[-6, 8], [5, 12], [-3, 20], [7, 27]];
  P.forEach((p, i) => p.set(base[i][0] + 2.5 * Math.sin(0.011 * t * 6 + i * 1.7), 1.6, base[i][1] + 2 * Math.sin(0.017 * t * 6 + i * 2.3), 4.5));
  let laugh = 0, blind = 0;
  for (const e of eventsAt(t)) {
    const L = levelAt(e, t - e.t0, 0.4);
    if (e.kind === 'laugh') laugh = Math.max(laugh, L);
    if (e.kind === 'cheer' && e.s >= 0.7) { const tt = t - e.t0 - 0.1; if (tt > 0) blind = Math.max(blind, e.s * (tt < 0.12 ? tt / 0.12 : Math.exp(-(tt - 0.12) / 0.45))); }
    if (e.kind === 'laugh') U.uOrigin.value.set(-3, 0, 12); else U.uOrigin.value.set(0, 0, 3);
    U.uSpeed.value = e.kind === 'laugh' ? 30 : 40;
  }
  U.uHouse.value = 1 + 0.1 * laugh;
  U.uBlindCol.value.setRGB(1.0, 0.72, 0.4).multiplyScalar(blind * 0.35);
}
function render(t) {
  placeCam(camera, dollyPhase(t));
  cues(t);
  renderer.render(scene, camera);
}
function renderAt(t) { fillRing(t); render(t); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; }

// ---------- the loop, instrumented ----------
const NREC = 2000, rec = { n: 0, dt: new Float32Array(NREC), js: new Float32Array(NREC), pup: new Float32Array(NREC), up: new Float32Array(NREC), ren: new Float32Array(NREC), fin: new Float32Array(NREC), ticks: new Uint8Array(NREC) };
let lastTs = 0, simT0 = null, frames = 0, fpsT = 0, fpsN = 0, fps = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const a = performance.now();
  if (simT0 === null) simT0 = ts;
  const t = (ts - simT0) / 1000 + num('t0', 0);
  const pm0 = puppets.cost.ms, um0 = ring.cost.ms;
  const ticks = step(t);
  const b = performance.now();
  if (GPU) gpuBegin();
  render(t);
  if (GPU) gpuEnd();
  const c = performance.now();
  const d = performance.now();
  if (frames > 2) {
    const i = rec.n++ % NREC;
    rec.dt[i] = ts - lastTs; rec.js[i] = d - a; rec.pup[i] = puppets.cost.ms - pm0; rec.up[i] = ring.cost.ms - um0; rec.ren[i] = c - b; rec.fin[i] = GPU ? gpuLast : d - c; rec.ticks[i] = ticks;
  }
  lastTs = ts; frames++;
  fpsN++; if (ts - fpsT > 1000) { fps = (fpsN * 1000) / (ts - fpsT); fpsT = ts; fpsN = 0; if (HUD) say(`${fps.toFixed(1)} fps · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1000).toFixed(1)}k tris · ${report.alloc.people} people ${report.alloc.perLevel.join('/')} · ${(report.alloc.verts / 1000).toFixed(1)}k verts · ${KIND} ${RINGF}`); }
  if (frames === 4) document.body.dataset.ready = '1';
}

// &gpu=1: GPU time per frame from EXT_disjoint_timer_query_webgl2 (the box's SwiftShader: relative costs only)
const TQ = GPU ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null, tq = [];
let gpuLast = 0;
function gpuBegin() { if (!TQ) return; const q = gl.createQuery(); gl.beginQuery(TQ.TIME_ELAPSED_EXT, q); tq.push(q); }
function gpuEnd() {
  if (!TQ) return; gl.endQuery(TQ.TIME_ELAPSED_EXT);
  while (tq.length && gl.getQueryParameter(tq[0], gl.QUERY_RESULT_AVAILABLE)) { const q = tq.shift(); if (!gl.getParameter(TQ.GPU_DISJOINT_EXT)) gpuLast = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q); }
}

// ---------- harness hooks ----------
function caps() {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const P = (k) => gl.getParameter(gl[k]);
  return {
    webgl2: renderer.capabilities.isWebGL2, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxVertexTextureUnits: P('MAX_VERTEX_TEXTURE_IMAGE_UNITS'), maxTextureSize: P('MAX_TEXTURE_SIZE'), maxVertexAttribs: P('MAX_VERTEX_ATTRIBS'),
    maxVertexUniformVectors: P('MAX_VERTEX_UNIFORM_VECTORS'), maxVaryingVectors: P('MAX_VARYING_VECTORS'),
    ext: { colorBufferFloat: !!gl.getExtension('EXT_color_buffer_float'), floatLinear: !!gl.getExtension('OES_texture_float_linear'), timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') },
    vtf: vtfTest(),
  };
}
/** Float vertex texture fetch, and a texSubImage2D update of it through three's state cache, read back. */
function vtfTest() {
  const out = {};
  for (const [fmt, type, arr] of [['f32', THREE.FloatType, Float32Array], ['f16', THREE.HalfFloatType, Uint16Array]]) {
    const vals = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1];
    const data = fmt === 'f32' ? new arr(vals) : new arr(vals.map((v) => THREE.DataUtils.toHalfFloat(v)));
    const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat, type); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const m = new THREE.ShaderMaterial({ uniforms: { t: { value: tex } }, vertexShader: 'uniform highp sampler2D t; varying vec4 v; void main(){ v = texelFetch(t, ivec2(1, 0), 0); gl_PointSize = 1.0; gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }', fragmentShader: 'varying vec4 v; void main(){ gl_FragColor = v; }' });
    const sc = new THREE.Scene(), pts = new THREE.Points(g, m); pts.frustumCulled = false; sc.add(pts);
    const rt = new THREE.WebGLRenderTarget(1, 1), px = new Uint8Array(4), cam = new THREE.OrthographicCamera();
    renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);
    const first = Array.from(px);
    // partial update of texel 1 the way the ring does it
    const props = renderer.properties.get(tex), nv = [0.9, 0.1, 0.4, 1];
    renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (fmt === 'f32') gl.texSubImage2D(gl.TEXTURE_2D, 0, 1, 0, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(nv));
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 1, 0, 1, 1, gl.RGBA, gl.HALF_FLOAT, new Uint16Array(nv.map((v) => THREE.DataUtils.toHalfFloat(v))));
    renderer.render(sc, cam); renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);
    renderer.setRenderTarget(null);
    out[fmt] = { first, expect: [64, 128, 191, 255], afterSub: Array.from(px), expectSub: [230, 26, 102, 255], err: gl.getError() };
    rt.dispose(); tex.dispose(); m.dispose();
  }
  return out;
}
function texMB() {
  const atlas = 1024 * 1024 * 4 * (4 / 3);
  return { ring: ring.bytes / 1048576, atlas: atlas / 1048576, total: (ring.bytes + atlas) / 1048576 };
}
function stats() {
  render(STILL ? num('t', 3) : 3);
  const i = renderer.info.render, per = [0, 1, 2, 3].map((L) => groups.filter((g) => g.level === L));
  const lvl = per.map((gs) => ({ draws: gs.filter((g) => g.count > 0).length, people: gs.reduce((s, g) => s + g.count, 0), verts: gs.reduce((s, g) => s + g.count * g.verts, 0), tris: gs.reduce((s, g) => s + g.count * g.tris, 0) }));
  const vb = groups.reduce((s, g) => s + g.verts * 18 + g.geo.index.count * 2 + places.length * 48, 0);
  return {
    calls: i.calls, triangles: i.triangles, programs: renderer.info.programs.length, levels: lvl, floorDraws: groups.filter((g) => g.count > 0).length,
    floorVerts: lvl.reduce((s, x) => s + x.verts, 0), floorTris: lvl.reduce((s, x) => s + x.tris, 0), texMB: texMB(), vertexBufferMB: vb / 1048576,
    ringUploadBytesPerTick: N_PUPPETS * ring.W * 4 * (ring.fmt === 'f16' ? 2 : 4), alloc: report.alloc, kind: KIND, ringFmt: RINGF, bench: BENCH, skipped,
  };
}
/** Fragments the floor shades (depth-tested in draw order, as early-z would) and its coverage, per level. */
function fragments(t = 3) {
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const keep = groups.map((g) => g.mesh.material);
  const sv = [shell && shell.visible, glows && glows.visible];
  if (shell) shell.visible = false; if (glows) glows.visible = false;
  groups.forEach((g) => { g.mesh.material = countMats.get(g); });
  const mpMat = massPlane && massPlane.material, mpCount = massPlane && new THREE.MeshBasicMaterial({ colorWrite: false });
  if (massPlane) massPlane.material = mpCount;
  const px = new Uint8Array(W * H * 4), res = {};
  const run = (label, colorOn, depthTest = true) => {
    groups.forEach((g) => { const m = g.mesh.material; m.colorWrite = colorOn(g); m.depthTest = depthTest; m.needsUpdate = false; });
    placeCam(camera, dollyPhase(t)); cues(t);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    let sum = 0, cov = 0; for (let i = 0; i < px.length; i += 4) { sum += px[i]; if (px[i]) cov++; }
    res[label] = { fragments: sum, perPixel: +(sum / (W * H)).toFixed(3), coverage: +(cov / (W * H)).toFixed(3), perCoveredPixel: cov ? +(sum / cov).toFixed(3) : 0 };
  };
  run('all', () => true);
  for (let L = 0; L < 4; L++) run('l' + L, (g) => g.level === L);
  run('all-nodepth', () => true, false);
  renderer.setRenderTarget(null); renderer.setClearColor(new THREE.Color().setRGB(0.035, 0.04, 0.06, THREE.LinearSRGBColorSpace));
  groups.forEach((g, i) => { g.mesh.material = keep[i]; countMats.get(g).depthTest = true; countMats.get(g).colorWrite = true; });
  if (massPlane) massPlane.material = mpMat;
  if (shell) shell.visible = sv[0]; if (glows) glows.visible = sv[1];
  rt.dispose();
  return res;
}
/** The crowd coverage as a mask image (white where floor people are), for the strip's motion probe. */
function mask(t = 3) {
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const keep = groups.map((g) => g.mesh.material);
  groups.forEach((g) => { g.mesh.material = countMats.get(g); g.mesh.material.colorWrite = true; });
  const sv = [shell && shell.visible, glows && glows.visible]; if (shell) shell.visible = false; if (glows) glows.visible = false;
  placeCam(camera, dollyPhase(t)); cues(t);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(null); renderer.setClearColor(new THREE.Color().setRGB(0.035, 0.04, 0.06, THREE.LinearSRGBColorSpace));
  groups.forEach((g, i) => { g.mesh.material = keep[i]; }); if (shell) shell.visible = sv[0]; if (glows) glows.visible = sv[1];
  rt.dispose();
  const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[(H - 1 - y) * W + x] = px[(y * W + x) * 4] ? 1 : 0;
  return Array.from(m);
}

/**
 * Motion on screen and unison, from the puppets themselves (pure functions of time): each visible person's head and
 * hands projected through the S1 camera at their own delay, over [t0, t1]; neighbour head trajectories correlated.
 */
function motion(t0, t1) {
  const nT = Math.round((t1 - t0 + 1.2) * TICK_HZ) + 1, tb = t0 - 1.2;
  const J3 = [C.head, C.lHand, C.rHand];
  const traj = new Float32Array(N_PUPPETS * nT * 9);
  const save = new Float32Array(ring.data); // (the puppets write into the ring rows: put them back afterwards)
  for (let k = 0; k < nT; k++) {
    const t = tb + k / TICK_HZ; puppets.events = eventsAt(t);
    for (const P of puppets.list) {
      if (P.seated) continue;
      puppets.solve(P, t);
      const S = puppets.S[P.g];
      J3.forEach((c, j) => { const K = skinOf(S, puppets.qw, puppets.pw, c); const o = ((P.i * nT + k) * 3 + j) * 3; const jx = S.joint[c * 3], jy = S.joint[c * 3 + 1], jz = S.joint[c * 3 + 2]; const v = new THREE.Vector3(jx, jy, jz).applyQuaternion(new THREE.Quaternion(K[0], K[1], K[2], K[3])); traj[o] = v.x + K[4]; traj[o + 1] = v.y + K[5]; traj[o + 2] = v.z + K[6]; });
    }
  }
  ring.data.set(save);
  const cam = camera.clone(); placeCam(cam, 0);
  const v = new THREE.Vector3(), per = [];
  const at = (q, j, t) => { // world position of joint j (0 head, 1 left hand, 2 right hand) for person q at time t
    const p = q.p, dl = Math.min(1.1, Math.max(0, p.idDelay + Math.hypot(p.x - (-3), p.z - 12) / 30));
    const f = (t - dl - tb) * TICK_HZ, k0 = Math.max(0, Math.min(nT - 2, Math.floor(f))), a = Math.min(1, Math.max(0, f - k0));
    const jj = p.mirror < 0 && j > 0 ? 3 - j : j, o0 = ((p.puppet * nT + k0) * 3 + jj) * 3, o1 = o0 + 9;
    let x = traj[o0] + (traj[o1] - traj[o0]) * a, y = traj[o0 + 1] + (traj[o1 + 1] - traj[o0 + 1]) * a, z = traj[o0 + 2] + (traj[o1 + 2] - traj[o0 + 2]) * a;
    if (p.mirror < 0) x = -x;
    x *= p.build * p.height; z *= p.build * p.height; y *= p.height;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    v.set(c * x + s * z + p.x, y, -s * x + c * z + p.z).project(cam);
    return [(v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H];
  };
  const people = alloc.vis.filter((q) => q.level <= 2);
  const steps = Math.round((t1 - t0) * TICK_HZ);
  const series = new Map();
  for (const q of people) {
    let hx0 = 1e9, hx1 = -1e9, hy0 = 1e9, hy1 = -1e9, ax = 0; const hs = [];
    const hb = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
    for (let k = 0; k <= steps; k++) {
      const t = t0 + k / TICK_HZ;
      const [x, y] = at(q, 0, t); hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y); hs.push(x, y);
      for (const j of [1, 2]) { const [a, b] = at(q, j, t), o = (j - 1) * 4; hb[o] = Math.min(hb[o], a); hb[o + 1] = Math.max(hb[o + 1], a); hb[o + 2] = Math.min(hb[o + 2], b); hb[o + 3] = Math.max(hb[o + 3], b); }
    }
    ax = Math.max(Math.hypot(hb[1] - hb[0], hb[3] - hb[2]), Math.hypot(hb[5] - hb[4], hb[7] - hb[6]));
    per.push({ head: Math.hypot(hx1 - hx0, hy1 - hy0), hand: ax, level: q.level });
    series.set(q.p, hs);
  }
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : 0; };
  const H_ = per.map((x) => x.head), A_ = per.map((x) => x.hand);
  // neighbour pairs within 2.5 m: Pearson correlation of the head's screen trajectory (x and y averaged)
  const corr = (a, b, o) => { let n = 0, sa = 0, sb = 0; for (let i = o; i < a.length; i += 2) { sa += a[i]; sb += b[i]; n++; } sa /= n; sb /= n; let ab = 0, aa = 0, bb = 0; for (let i = o; i < a.length; i += 2) { const x = a[i] - sa, y = b[i] - sb; ab += x * y; aa += x * x; bb += y * y; } return aa > 1e-6 && bb > 1e-6 ? ab / Math.sqrt(aa * bb) : 0; };
  let pairs = 0, low = 0; const rs = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i].p, b = people[j].p; if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 6.25) continue;
    const sa = series.get(a), sb = series.get(b), r = (corr(sa, sb, 0) + corr(sa, sb, 1)) / 2;
    pairs++; if (r < 0.6) low++; rs.push(r);
  }
  return { window: [t0, t1], people: per.length, headPx: { p10: pct(H_, 0.1), p50: pct(H_, 0.5), p90: pct(H_, 0.9) }, handPx: { p10: pct(A_, 0.1), p50: pct(A_, 0.5), p90: pct(A_, 0.9) }, neighbourPairs: pairs, shareBelow06: pairs ? +(low / pairs).toFixed(3) : 0, rP50: pct(rs, 0.5), rP90: pct(rs, 0.9) };
}
/** CPU cost of the puppets alone, per tick, over n ticks (no upload). */
function puppetBench(n = 60, t = 3) {
  const save = new Float32Array(ring.data), c0 = puppets.cost.ms;
  const a = performance.now();
  for (let k = 0; k < n; k++) { const kk = Math.floor(t * TICK_HZ) + k; puppets.events = eventsAt(kk / TICK_HZ); puppets.tick(kk / TICK_HZ, kk % SLOTS, kk % 2 === 0); }
  const ms = performance.now() - a; ring.data.set(save);
  return { ticks: n, msPerTick: +(ms / n).toFixed(3), usPerPuppet: +((ms / n / N_PUPPETS) * 1000).toFixed(1), c0 };
}

/** The GLSL three.js generated for each floor program (for the Mali Offline Compiler). */
function programs() {
  const out = [], seen = new Set();
  const add = (label, mat) => {
    const pr = renderer.properties.get(mat).currentProgram; if (!pr || seen.has(pr)) return; seen.add(pr);
    const o = { label };
    for (const s of gl.getAttachedShaders(pr.program)) o[gl.getShaderParameter(s, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'vs' : 'fs'] = gl.getShaderSource(s);
    out.push(o);
  };
  groups.forEach((g) => add(g.mesh.name, g.mesh.material));
  if (shell) add('shell', shell.material);
  return out;
}

window.__spike = { ready: false, rec, stats, fragments, mask, motion, renderAt, puppetBench, programs, report, marks, caps: () => report.caps, get groups() { return groups; }, U };
main().catch((e) => { console.error(e); window.__spike.error = String((e && e.stack) || e); document.body.dataset.ready = '1'; say('error: ' + e.message); });
