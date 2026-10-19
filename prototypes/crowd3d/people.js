// People: a seated rig for the Rocketbox (3ds Max Biped) skeleton, two-bone IK, and the live behaviour model.
// The body's base layer is motion capture (anim.js: Rocketbox's own MIT clips for this rig): sitting idle, weight
// shifts and fidgets, walking played by distance, sitting down and standing up, talking and listening. Everything the
// room asks of a person (looking at the performer, laughing, clapping, phones, the heckle) is layered on top each
// frame from the room's state, the person's temperament and the clock, so nothing loops in step and every pose is a
// function of (seed, time): any frame can be reproduced.
import * as THREE from 'three';
import { fitBody, refreshFit, fixArms, joints, armCollisions, posture, clampSpine, clampHead, clampRoll, shareYaw, limbs, limbMetrics, guardElbows, bestElbow, elbowBad, clearHeads, depthIn } from './anatomy.js';
import { ANIM, loadClips, newPose, sample, sampleCycle, mix, addLayer, addLayerMirror, maskOf, applyPose, family, meanPose } from './anim.js';

/**
 * Load the motion clips (anim/clips.json + clips.bin, resolved against the page). Await it once before building
 * people. If the files are missing or fail to load, it logs one line and everyone keeps the procedural motion.
 * Resolves to true when the clips are in.
 */
export async function initMotion(baseUrl = new URL('anim/', location.href).href) {
  await loadClips(baseUrl);
  if (ANIM.ok) Object.assign(MASK, {
    torso: maskOf((b) => (/Spine2|Neck|Head/.test(b) ? 1 : /Spine1/.test(b) ? 0.7 : /Spine$/.test(b) ? 0.4 : /Clavicle/.test(b) ? 0.5 : 0)),
    // a standing talker's arms, added to a seated body: forearm and hand beats mostly, little from the shoulder
    // (the head and the torso only: a standing talker's arm motion added to a seated body put forearms through it; the
    // speaker's hand beat is an IK gesture, checked by the anatomy pass)
    talk: maskOf((b) => (/Neck|Head/.test(b) ? 0.6 : /Spine/.test(b) ? 0.25 : /Clavicle/.test(b) ? 0.2 : 0)),
    head: maskOf((b) => (/Neck|Head/.test(b) ? 1 : /Spine2/.test(b) ? 0.3 : 0)),
  });
  return ANIM.ok;
}

// ---------- small deterministic helpers ----------
export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth value noise in [-1, 1]; stateless, so a still frame at any t is reproducible. */
export function noise(seed, t) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return (hash(seed * 17.13 + i) * (1 - u) + hash(seed * 17.13 + i + 1) * u) * 2 - 1;
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- the skeleton ----------
const N = (s) => 'Bip01_' + s; // GLTFLoader turns spaces into underscores
export const BONES = {
  root: 'Bip01', pelvis: N('Pelvis'), spine: N('Spine'), spine1: N('Spine1'), spine2: N('Spine2'), neck: N('Neck'),
  head: N('Head'), jaw: N('MJaw'), lEye: N('LEye'), rEye: N('REye'),
  lClav: N('L_Clavicle'), lUpper: N('L_UpperArm'), lFore: N('L_Forearm'), lHand: N('L_Hand'),
  rClav: N('R_Clavicle'), rUpper: N('R_UpperArm'), rFore: N('R_Forearm'), rHand: N('R_Hand'),
  lTip: N('L_Finger2'), rTip: N('R_Finger2'),
  lThigh: N('L_Thigh'), lCalf: N('L_Calf'), lFoot: N('L_Foot'), rThigh: N('R_Thigh'), rCalf: N('R_Calf'), rFoot: N('R_Foot'),
};
const FINGERS = ['Finger1', 'Finger11', 'Finger12', 'Finger2', 'Finger21', 'Finger22', 'Finger3', 'Finger31', 'Finger32', 'Finger4', 'Finger41', 'Finger42'];

const _v = [...Array(8)].map(() => new THREE.Vector3());
const _qk = [new THREE.Quaternion(), new THREE.Quaternion()];
const _q = [...Array(6)].map(() => new THREE.Quaternion());
const _hq = [0, 1, 2].map(() => new THREE.Quaternion()), _hv = [...Array(8)].map(() => new THREE.Vector3()); // (arm-v2's elbow hold: its own, rig.solve uses _v and _q)
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _qA = new THREE.Quaternion();

/** Refresh the world matrices of a direct three-bone chain only (its parent's must be current). */
function chain3(a, b, c) {
  a.updateMatrix(); a.matrixWorld.multiplyMatrices(a.parent.matrixWorld, a.matrix);
  b.updateMatrix(); b.matrixWorld.multiplyMatrices(a.matrixWorld, b.matrix);
  c.updateMatrix(); c.matrixWorld.multiplyMatrices(b.matrixWorld, c.matrix);
}
function worldQuat(o, out) { return out.setFromRotationMatrix(_m.extractRotation(o.matrixWorld)); }
function worldPos(o, out) { return out.setFromMatrixPosition(o.matrixWorld); }

/**
 * A rig over one avatar instance. `seat` is the person's frame: origin on the floor under the seat, +Z towards
 * the stage, +Y up, +X the person's left. All pose numbers are in that frame.
 */
export class Rig {
  constructor(seat, model) {
    this.seat = seat;
    this.model = model; // the cloned glTF scene, a child of seat, facing +Z
    this.b = {};
    for (const [k, n] of Object.entries(BONES)) this.b[k] = model.getObjectByName(n);
    seat.updateMatrixWorld(true);
    const seatQ = worldQuat(seat, new THREE.Quaternion()).invert();
    this.rest = new Map();
    const capture = (bone) => {
      if (!bone || this.rest.has(bone)) return;
      const P = worldQuat(bone.parent, new THREE.Quaternion()).premultiply(seatQ); // parent rest, seat frame
      this.rest.set(bone, { local: bone.quaternion.clone(), P, Pinv: P.clone().invert(), pos: bone.position.clone() });
    };
    Object.values(this.b).forEach(capture);
    // rest geometry in the seat frame
    const inv = new THREE.Matrix4().copy(seat.matrixWorld).invert();
    const at = (bone) => worldPos(bone, new THREE.Vector3()).applyMatrix4(inv);
    this.restY = { root: at(this.b.root).y, thigh: at(this.b.lThigh).y, foot: at(this.b.lFoot).y, head: at(this.b.head).y };
    this.len = {
      arm: [at(this.b.lUpper).distanceTo(at(this.b.lFore)), at(this.b.lFore).distanceTo(at(this.b.lHand))],
      leg: [at(this.b.lThigh).distanceTo(at(this.b.lCalf)), at(this.b.lCalf).distanceTo(at(this.b.lFoot))],
    };
    // the direction each limb's middle joint bends, in the upper bone's local frame (arms: forward, legs: back)
    const bendLocal = (upper, lower, charDir) => {
      const Wq = worldQuat(upper, new THREE.Quaternion()).premultiply(seatQ);
      const axis = at(lower).sub(at(upper)).normalize();
      const d = charDir.clone().addScaledVector(axis, -charDir.dot(axis)).normalize();
      return d.applyQuaternion(Wq.invert());
    };
    this.bend = {
      lArm: bendLocal(this.b.lUpper, this.b.lFore, Z), rArm: bendLocal(this.b.rUpper, this.b.rFore, Z),
      lLeg: bendLocal(this.b.lThigh, this.b.lCalf, Z.clone().negate()), rLeg: bendLocal(this.b.rThigh, this.b.rCalf, Z.clone().negate()),
    };
    // relaxed fingers, set once (never touched again)
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? -1 : 1;
      for (const f of FINGERS) {
        const bone = model.getObjectByName(`Bip01_${side}_${f}`);
        if (!bone) continue;
        capture(bone);
        const curl = f.length === 7 ? 0.25 : 0.45;
        this.setRot(bone, _q[0].setFromAxisAngle(Z, sgn * curl));
      }
    }
    this.armRestQ = { l: this.b.lHand.quaternion.clone(), r: this.b.rHand.quaternion.clone() };
    // while `additive` is on (a clip posed the bones this frame), setRot adds to the clip's pose instead of the rest
    // pose; anim.js bonesOf() marks the bones a clip poses
    this.additive = false;
    // the seat's inverse world matrix and rotation (refreshed once per update; worldToLocal would invert per call)
    this.inv = new THREE.Matrix4().copy(seat.matrixWorld).invert();
    this.invQ = worldQuat(seat, new THREE.Quaternion()).invert();
    // Person.update brings this person's matrices up to date itself (the last thing it does), so three's per-frame
    // traversal skips the seat: frames the person isn't updated on (half rate on tv) then cost nothing. crowd.js
    // calls seat.updateMatrixWorld(true) itself whenever it moves a seat, and placePhone updates the phone's own.
    seat.matrixWorldAutoUpdate = false;
    // this avatar's own body volumes, fitted from its mesh at rest (anatomy.js)
    fitBody(this);
    // bones nothing poses (the fingers after their curl above, nubs, unused rig bones) keep their local matrix: three
    // then only multiplies them through, never re-composes them, in every traversal of a moving arm
    const posed = new Set([...Object.values(BONES), ...ANIM.bones]);
    model.traverse((o) => { if (o.isBone && !posed.has(o.name)) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
    // the fingers (all but each hand's tip bone, which the checks read) are left out of the matrix updates while the arms
    // are posed and fixed (upd below): two hands are some 30 bones, re-multiplied on every IK step; Person.update brings
    // them up to date once, at the end
    for (const [h, tip] of [[this.b.lHand, this.b.lTip], [this.b.rHand, this.b.rTip]]) if (h) h.traverse((o) => { if (o !== h && o !== tip) o._fing = true; });
    // three recomputes and re-uploads a skeleton's bone texture every frame it draws the mesh; this person's skeletons
    // do it only after Person.update moved them (on tv a person updates every other frame)
    this.skeletons = [];
    // a person's meshes (head, body) each got their own copy of the same skeleton from the clone: share one, so its
    // bone matrices and texture are computed and uploaded once
    let first = null;
    model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      if (!first) { first = o; return; }
      const A = first.skeleton, B = o.skeleton;
      if (A === B || A.bones.length !== B.bones.length || A.bones.some((x, i) => x !== B.bones[i])) return;
      if (A.boneInverses.every((m, i) => m.equals(B.boneInverses[i]))) o.skeleton = A;
    });
    model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.skeleton || o.skeleton._gated) return;
      const sk = o.skeleton, up = sk.update.bind(sk);
      sk._gated = true; sk.dirty = true;
      sk.update = () => { if (sk.dirty) { sk.dirty = false; up(); } };
      this.skeletons.push(sk);
    });
  }

  /** Rotate a bone by q expressed in the seat frame, relative to its parent's rest orientation. */
  setRot(bone, q) {
    const r = this.rest.get(bone);
    if (this.additive && r.clip) { bone.quaternion.premultiply(_qA.copy(r.Pinv).multiply(q).multiply(r.P)); return; }
    bone.quaternion.copy(r.Pinv).multiply(q).multiply(r.P).multiply(r.local);
  }
  euler(bone, x, y, z, order = 'YXZ') { this.setRot(bone, _q[1].setFromEuler(_e.set(x, y, z, order))); }

  /** Two-bone IK in world space with the middle joint kept in its anatomical hinge plane. */
  solve(upper, lower, end, target, poleDir, bend, lens) {
    // (only the three chain bones are refreshed while solving; the whole subtree once, at the end)
    chain3(upper, lower, end);
    const S = worldPos(upper, _v[0]), E0 = worldPos(lower, _v[1]);
    const [l1, l2] = lens;
    const toT = _v[2].copy(target).sub(S);
    let d = toT.length();
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    const dir = toT.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
    const pole = _v[3].copy(poleDir).addScaledVector(dir, -poleDir.dot(dir)).normalize();
    const E = _v[4].copy(S).addScaledVector(dir, a).addScaledVector(pole, h);
    // swing the upper bone onto S->E
    const Wu = worldQuat(upper, _q[2]);
    const swing = _q[3].setFromUnitVectors(_v[5].copy(E0).sub(S).normalize(), _v[6].copy(E).sub(S).normalize());
    Wu.premultiply(swing);
    // twist it about its own axis so the hinge bends towards the target
    const axis = _v[5].copy(E).sub(S).normalize();
    const want = _v[6].copy(target).sub(E);
    want.addScaledVector(axis, -want.dot(axis));
    if (want.lengthSq() > 1e-8) {
      want.normalize();
      const cur = _v[7].copy(bend).applyQuaternion(Wu);
      cur.addScaledVector(axis, -cur.dot(axis)).normalize();
      Wu.premultiply(_q[3].setFromUnitVectors(cur, want));
    }
    upper.quaternion.copy(worldQuat(upper.parent, _q[4]).invert().multiply(Wu));
    chain3(upper, lower, end);
    // swing the lower bone onto E->target
    const E1 = worldPos(lower, _v[1]), W1 = worldPos(end, _v[5]);
    const Wl = worldQuat(lower, _q[2]);
    Wl.premultiply(_q[3].setFromUnitVectors(W1.sub(E1).normalize(), _v[6].copy(target).sub(E1).normalize()));
    lower.quaternion.copy(worldQuat(upper, _q[4]).invert().multiply(Wl));
    this.upd(upper);
  }

  /** Roll the hand about the forearm axis (radians, + = thumb up/out). */
  roll(hand, fore, angle, restQ) {
    hand.quaternion.copy(restQ);
    this.upd(hand);
    const axis = worldPos(hand, _v[0]).sub(worldPos(fore, _v[1])).normalize();
    const Wh = worldQuat(hand, _q[2]).premultiply(_q[3].setFromAxisAngle(axis, angle));
    hand.quaternion.copy(worldQuat(fore, _q[4]).invert().multiply(Wh));
  }

  /** Swing the hand (weight w) so it points along dir (world), e.g. fingers forward and up for a clap. */
  aim(hand, tip, dir, w) {
    if (w <= 0 || !tip) return;
    this.upd(hand);
    const cur = worldPos(tip, _v[1]).sub(worldPos(hand, _v[0])).normalize();
    const q = _q[4].identity().slerp(_q[3].setFromUnitVectors(cur, dir), w);
    const Wh = worldQuat(hand, _q[2]).premultiply(q);
    hand.quaternion.copy(worldQuat(hand.parent, _q[5]).invert().multiply(Wh));
    this.upd(hand); // (the checks after read the hand and its fingertip where they now are; the fingers at the end)
  }

  /** A point in the seat frame that rides with a bone (offset given in the seat frame at rest). */
  ride(bone, ox, oy, oz, out) {
    const r = this.rest.get(bone);
    const Wq = worldQuat(bone, _q[0]);
    const rel = _q[2].copy(this.invQ).multiply(Wq).multiply(_q[3].copy(r.P).multiply(r.local).invert());
    const p = worldPos(bone, out).applyMatrix4(this.inv);
    return p.add(_v[7].set(ox, oy, oz).applyQuaternion(rel));
  }
  /** Refresh the seat's cached inverse (after the seat moved). */
  seatChanged() { this.inv.copy(this.seat.matrixWorld).invert(); worldQuat(this.seat, this.invQ).invert(); }
  /** The chain from the model down to a bone brought up to date (that bone's own matrix included, no children). */
  updChain(o) {
    const chain = [];
    for (let x = o; x && x !== this.seat; x = x.parent) chain.push(x);
    for (let i = chain.length - 1; i >= 0; i--) {
      const c = chain[i];
      if (c.matrixAutoUpdate) c.updateMatrix();
      if (c.parent) c.matrixWorld.multiplyMatrices(c.parent.matrixWorld, c.matrix); else c.matrixWorld.copy(c.matrix);
    }
  }
  /** A bone and everything below it brought up to date, the fingers left for the end of the update (see above). */
  upd(o) {
    if (o.matrixAutoUpdate) o.updateMatrix();
    if (o.parent) o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix); else o.matrixWorld.copy(o.matrix);
    o.matrixWorldNeedsUpdate = false;
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) if (!ch[i]._fing) this.upd(ch[i]);
  }
}

// ---------- the face ----------
const FACE_KEYS = ['eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeWideLeft', 'eyeWideRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekSquintLeft', 'cheekSquintRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'jawOpen'];
// The TV models merge symmetric pairs into one shape (tools/anim/tv_morphs.mjs): left and right values average onto it.
const MERGED = { eyeBlinkLeft: 'eyeBlink', eyeBlinkRight: 'eyeBlink', eyeSquintLeft: 'eyeSquint', eyeSquintRight: 'eyeSquint',
  cheekSquintLeft: 'cheekSquint', cheekSquintRight: 'cheekSquint', mouthUpperUpLeft: 'mouthUpperUp', mouthUpperUpRight: 'mouthUpperUp',
  mouthPressLeft: 'mouthPress', mouthPressRight: 'mouthPress' };
// (the TV set since faces-v1 has 'duchenne', the eye squint and the cheeks as one shape: 0.8 × squint + cheek; and of the
// outer brows the left one only, so one brow up is always the left: Face.duo, Face.oneBrow)
export class Face {
  constructor(model) {
    this.slots = Object.fromEntries([...FACE_KEYS, ...new Set(Object.values(MERGED)), 'duchenne'].map((k) => [k, []]));
    this.half = {};
    model.traverse((o) => {
      if (!o.morphTargetDictionary || !o.morphTargetInfluences) return;
      for (const [k, i] of Object.entries(o.morphTargetDictionary)) if (this.slots[k]) this.slots[k].push([o.morphTargetInfluences, i]);
    });
    this.ok = Object.values(this.slots).some((s) => s.length);
    this.duo = this.slots.duchenne.length > 0;
    this.oneBrow = this.slots.browOuterUpLeft.length > 0 && !this.slots.browOuterUpRight.length;
  }
  set(k, v) {
    const s = this.slots[k];
    if (s.length) { for (const [arr, i] of s) arr[i] = v; return; }
    const m = MERGED[k];
    if (!m || !this.slots[m].length) return;
    this.half[k] = v;
    const o = this.half[k.endsWith('Left') ? k.slice(0, -4) + 'Right' : k.slice(0, -5) + 'Left'];
    const avg = (v + (o ?? v)) / 2;
    for (const [arr, i] of this.slots[m]) arr[i] = avg;
  }
}

/**
 * Who is laughing most visibly right now (front people first by score): the director's hook for the close-up, so it
 * can cut to whoever reacted and never to the same pair twice running. Returns [{ person, name, x, row, score }].
 */
export function laughRank(list = REG) {
  return list.filter((p) => p.rig && !p.hidden && (p.kind === 'front' || !p.kind)).map((p) => ({ person: p, name: p.name, x: p.o.x, row: p.o.row, score: +(p.laughScore || 0).toFixed(3) })).sort((a, b) => b.score - a.score);
}
if (typeof window !== 'undefined') window.__laughRank = () => laughRank().map(({ person, ...r }) => r);
/**
 * The close-up's pair: of the candidate pairs (arrays of two Persons), the one laughing most visibly now (their mean
 * laughScore), never `last` (the index cut to last time) while another pair is laughing at all. Returns an index.
 */
export function bestPair(pairs, last = -1) {
  let best = -1, bs = -1;
  pairs.forEach((pr, i) => {
    if (i === last && pairs.length > 1) return;
    const sc = pr.reduce((a, p) => a + (p && !p.hidden ? p.laughScore || 0 : 0), 0) / pr.length;
    if (sc > bs) { bs = sc; best = i; }
  });
  return best < 0 ? Math.max(0, last) : best;
}

/** The closest distance between segments a0–a1 and b0–b1 (sampled; plenty for limbs). */
const _sdP = new THREE.Vector3(), _sdD = new THREE.Vector3(), _sdQ = new THREE.Vector3();
function segDist(a0, a1, b0, b1) {
  let best = Infinity;
  const p = _sdP, d = _sdD.copy(b1).sub(b0), L2 = Math.max(d.lengthSq(), 1e-9), q = _sdQ;
  const n = a0 === a1 ? 0 : 8; // (a point against a segment: once)
  for (let i = 0; i <= n; i++) {
    p.copy(a0).lerp(a1, n ? i / n : 0);
    const u = clamp01(q.copy(p).sub(b0).dot(d) / L2);
    best = Math.min(best, q.copy(b0).addScaledVector(d, u).distanceTo(p));
  }
  return best;
}

/**
 * Hands where hands can't be, for the render harness (window.__handCheck): every visible person's hands against
 * every torso (their own included), their own other hand (palms or fingers into each other), their own thighs and
 * seat, and every other person's hands and forearms; their forearms against each other. Each hit is
 * { name, hand, what, depth }; an empty list means every hand is valid.
 */
export function handCheck(list = REG) {
  const out = [], v = new THREE.Vector3(), lo = new THREE.Vector3(), hi = new THREE.Vector3();
  const live = list.filter((p) => p.rig && p.rig.model.visible && !p.hidden);
  const W = (bone) => worldPos(bone, new THREE.Vector3());
  const parts = new Map(live.map((p) => {
    const b = p.rig.b, palm = (h, t) => W(h).lerp(t ? W(t) : W(h), 0.5);
    return [p, { palms: [palm(b.lHand, b.lTip), palm(b.rHand, b.rTip)], tips: [W(b.lTip || b.lHand), W(b.rTip || b.rHand)], fore: [[W(b.lFore), W(b.lHand)], [W(b.rFore), W(b.rHand)]], thighs: [[W(b.lThigh), W(b.lCalf)], [W(b.rThigh), W(b.rCalf)]] }];
  }));
  for (const p of live) {
    const P = parts.get(p), seat = p.rig.seat;
    P.palms.forEach((pw, i) => {
      const side = i ? 'R' : 'L';
      for (const q of live) { // torsos
        const s = q.rig.seat;
        s.worldToLocal(worldPos(q.rig.b.spine, lo)); s.worldToLocal(worldPos(q.rig.b.neck, hi));
        const h = s.worldToLocal(v.copy(pw));
        const ax = hi.clone().sub(lo), k = clamp01(h.clone().sub(lo).dot(ax) / Math.max(ax.lengthSq(), 1e-6));
        if (k <= 0.03 || k >= 0.97) continue;
        const c = lo.clone().addScaledVector(ax, k), e = Math.hypot((h.x - c.x) / 0.15, (h.z - c.z) / 0.11);
        if (e < 1) out.push({ name: p.name, hand: side, what: q === p ? 'own torso' : 'torso of ' + q.name, depth: +(1 - e).toFixed(2) });
      }
      for (const [a0, a1] of P.thighs) { const d = segDist(pw, pw, a0, a1); if (d < 0.055) out.push({ name: p.name, hand: side, what: 'own thigh', depth: +(0.055 - d).toFixed(3) }); }
      const hl = seat.worldToLocal(v.copy(pw));
      if (p.loco == null && !p.o.stand && hl.y < p.o.seatH + 0.005 && Math.abs(hl.x) < 0.2 && hl.z > -0.2 && hl.z < 0.22) out.push({ name: p.name, hand: side, what: 'seat', depth: +(p.o.seatH - hl.y).toFixed(3) });
      for (const q of live) { // other people's hands and forearms
        if (q === p) continue;
        const Q = parts.get(q);
        for (const qp of Q.palms) { const d = pw.distanceTo(qp); if (d < 0.05) out.push({ name: p.name, hand: side, what: 'hand of ' + q.name, depth: +(0.05 - d).toFixed(3) }); }
        for (const [a0, a1] of Q.fore) { const d = segDist(pw, pw, a0, a1); if (d < 0.04) out.push({ name: p.name, hand: side, what: 'arm of ' + q.name, depth: +(0.04 - d).toFixed(3) }); }
      }
    });
    // their own two hands and forearms
    const dp = P.palms[0].distanceTo(P.palms[1]), dt = P.tips[0].distanceTo(P.tips[1]);
    if (dp < 0.03) out.push({ name: p.name, hand: 'LR', what: 'palms through each other', depth: +(0.03 - dp).toFixed(3) }); // (3 cm apart is palm to palm)
    if (dt < 0.018) out.push({ name: p.name, hand: 'LR', what: 'fingers through each other', depth: +(0.018 - dt).toFixed(3) });
    const df = segDist(P.fore[0][0], P.fore[0][1], P.fore[1][0], P.fore[1][1]);
    if (df < 0.03) out.push({ name: p.name, hand: 'LR', what: 'forearms through each other', depth: +(0.03 - df).toFixed(3) });
  }
  return out;
}
if (typeof window !== 'undefined') window.__handCheck = () => handCheck();

/**
 * The anatomy validator (anatomy.js), for every visible person with a fitted body: joint limits, the arms against every
 * body (their own and the neighbours') and the furniture, and, for seated people, the posture (resting hands on a
 * surface). Returns { joints, collisions, posture } (lists of findings).
 */
export function anatomyCheck(list = REG) {
  const out = { joints: [], collisions: [], posture: [], limbs: [] };
  const live = list.filter((p) => p.rig && p.rig.fit && p.rig.fit.ok && !p.hidden && p.rig.model.visible);
  for (const p of live) { p.rig.seatChanged(); refreshFit(p.rig.fit); }
  for (const p of live) {
    const seated = !p.o.stand && !(p.src && p.src._loco) && !p._ovOn;
    joints(p, false, out.joints);
    armCollisions(p, out.collisions, { seated });
    if (seated) posture(p, out.posture, { resting: !!p._resting, armsFolded: !!p._armsFolded });
    const moving = !!(p.src && p.src._loco) || !!p._inTraffic, standing = !moving && (!!p.o.stand || (!!p._ovOn && (p._standW || 0) > 0.95));
    limbs(p, out.limbs, { seated, standing, moving, asym: p.posture === 'shoulder' || p.posture === 'turnIn', resting: !!p._resting && !p._inTraffic, rest: p._restKind || '', cheer: (p._cheerW || 0) > 0.05, bounce: (p._cheerW || 0) > 0.3 });
  }
  return out;
}
if (typeof window !== 'undefined') window.__anatomy = () => anatomyCheck();
// (the elbow and knee numbers themselves, for the limbs sheets and for tuning the rules: tools/render/limbstats.mjs)
if (typeof window !== 'undefined') window.__depthIn = depthIn; // (for the box probes: tablegeo.mjs)
if (typeof window !== 'undefined') window.__limbMetrics = () => REG.filter((p) => p.rig && p.rig.fit && p.rig.fit.ok && !p.hidden && p.rig.model.visible).map((p) => {
  const M = limbMetrics(p), r = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  return { name: p.name, kind: p.kind, stand: !!p.o.stand, loco: !!(p.src && p.src._loco), ov: !!p._ovOn, row: p.o.row, seated: !p.o.stand && !(p.src && p.src._loco) && !p._ovOn, resting: !!p._resting, rest: p._restKind || '', cheer: +(p._cheerW || 0).toFixed(2), doing: p._doing || '', idle: p.idle, reused: !!(p._aq && p._aq.n),
    arms: M.arms.map((a) => ({ out: r(a.out), hout: r(a.hout), fwd: r(a.fwd), angle: r(a.angle), flank: r(a.flank), inside: r(a.inside), other: r(a.other) })),
    legs: M.legs.map((g) => ({ kneeFwd: r(g.kneeFwd), shinTilt: r(g.shinTilt), thighPitch: r(g.thighPitch), flex: r(g.flex), footPitch: r(g.footPitch) })),
    kneeGap: r(M.kneeGap), ankleGap: r(M.ankleGap), legNear: r(M.legNear), furn: M.furn.map((f) => [f.what, r(f.gap)]) };
});

/**
 * Drop morph targets whose deltas are all zero, before cloning: whole primitives (the body), and single shapes a
 * primitive never uses (the mouth shapes on the hair and lash cards). three keeps every target as float texels per
 * vertex, so this is texture memory saved.
 */
export function pruneEmptyMorphs(scene) {
  scene.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.morphAttributes.position) return;
    const PA = g.morphAttributes.position;
    const used = PA.map((a) => a.array.some((x) => Math.abs(x) > 1e-5));
    const any = used.some(Boolean);
    if (any && used.some((u) => !u) && o.morphTargetInfluences) {
      const keep = used.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
      for (const k of Object.keys(g.morphAttributes)) g.morphAttributes[k] = keep.map((i) => g.morphAttributes[k][i]);
      const names = Object.entries(o.morphTargetDictionary || {}).sort((a, b) => a[1] - b[1]).map(([n]) => n);
      o.morphTargetDictionary = Object.fromEntries(keep.map((i, j) => [names[i] ?? String(i), j]));
      o.morphTargetInfluences = keep.map((i) => o.morphTargetInfluences[i] || 0);
      return;
    }
    if (!any) {
      g.morphAttributes = {};
      o.morphTargetInfluences = undefined;
      o.morphTargetDictionary = undefined;
    }
  });
}

// ---------- the person ----------
const STYLES = ['back', 'back', 'over', 'giggle', 'turn', 'back', 'over', 'giggle'];

/**
 * What a person may do with their hands for each kind of reaction, by the venue's vocabulary (weights). Each person
 * draws their own gesture for every reaction (seeded by person and reaction), so no two people move in step. 'none'
 * means they just laugh or smile. Arms overhead belong to the stadium.
 */
export const VOCAB = {
  club: {
    // (a big laugh is the body's: rocking, head back, shoulders up, a hand to the knee or the thigh for some; the
    // hand on the chest and the little clap are kept rare, and rarer still on a big one: see gesturesFor)
    laugh: [['none', 3.0], ['chest', 0.5], ['mouth', 0.9], ['wipe', 0.6], ['slap', 1.3], ['knee', 1.5], ['clapShort', 1.0]],
    applause: [['clap', 6], ['clapHigh', 2], ['clapLow', 2.4], ['whistle', 0.7], ['callout', 0.7], ['none', 0.9]],
    // the finale: both hands clapping at chest height; a few with both arms up on a strong one (never one hand
    // raised alone: it hails a waiter)
    cheer: [['clap', 4], ['clapHigh', 3.5], ['whistle', 0.9], ['callout', 1], ['armsUp', 0.7]],
    snap: [['snap', 6], ['none', 2], ['nod', 2]],
  },
  stadium: {
    // no arms raised on a laugh, even here: arms go up for cheers and the finale (docs/crowd-visual-plan.md R12)
    laugh: [['none', 2.8], ['chest', 0.5], ['clapShort', 1.4], ['mouth', 0.9], ['slap', 1.1], ['knee', 1.0]],
    applause: [['clap', 4], ['clapHigh', 4], ['armsUp', 1.6], ['oneArm', 1.2], ['whistle', 1], ['callout', 1]],
    cheer: [['armsUp', 4], ['oneArm', 1.2], ['clapHigh', 3], ['clap', 2], ['callout', 1]],
    snap: [['snap', 6], ['none', 2]],
  },
};
// ---------- laughs: every laugh is a take of its own ----------
// How a person laughs this time (drawn per person and reaction, by temperament): head thrown back, doubled over (only
// on a big laugh), a giggle behind the hand, turning to a friend, the shoulders shaking, or the sceptic's
// breath through the nose with a smirk.
const LAUGH_STYLES = {
  laugher: [['back', 3], ['over', 2.2], ['turn', 2], ['shake', 2], ['giggle', 0.6]],
  talker: [['turn', 3], ['back', 2], ['shake', 1.4], ['over', 0.8]],
  shy: [['giggle', 4], ['shake', 1.2], ['over', 0.6], ['back', 0.4]],
  sceptic: [['nose', 4], ['shake', 1], ['giggle', 1], ['back', 0.5]],
  plain: [['back', 2], ['shake', 2], ['giggle', 1.2], ['turn', 1.2], ['over', 1]],
};
// The gestures each style favours (multipliers on the venue's vocabulary)
const STYLE_GESTURE = { back: { clapShort: 1.5, slap: 1.2 }, over: { knee: 2.5, slap: 2.2, mouth: 0.4 }, giggle: { mouth: 1.8, none: 1.6, slap: 0.3, knee: 0.3 },
  turn: { none: 1.6, mouth: 0, wipe: 0 }, shake: { none: 1.8, clapShort: 1.2 }, nose: { none: 8 } }; // (turning, a hand to the face crosses the turned chest)
// where a room laugh starts (seeded by the reaction): it spreads from there to the neighbours
const laughSeed = (id) => ({ x: (hash(id * 1.31 + 0.7) - 0.5) * 6, row: Math.floor(hash(id * 2.17 + 0.3) * 3) });
// whose laughs are lowest (the threshold model: a person laughs once the measured strength passes their threshold, so
// the share of the room that laughs follows the measurement)
// the face of each laugh style (jaw and squint on top of the graded laugh)
const FACE_TAKE = { none: { jaw: 1, sq: 0 }, back: { jaw: 1.25, sq: 0 }, over: { jaw: 1.15, sq: 0.1 }, giggle: { jaw: 0.4, sq: 0.15 }, shake: { jaw: 0.45, sq: 0.2 }, turn: { jaw: 0.65, sq: 0.35 }, nose: { jaw: 0.25, sq: 0.3 } };
// ---- laughs-v1: each venue's own laugh, and a fresh cast for every laugh ----
// The laugh character of each room: which takes it favours (multipliers on the temperament's styles), which gestures
// (on the vocabulary's weights), how much of the room a laugh of a given strength reaches, how far it ripples back by
// row, and whether people laugh in pairs.
export const VENUE_LAUGH = {
  // sparse and personal: few at once, often a pair, a friend's look, a few claps, the lone loud laugher
  openmic: { share: 0.62, rowRipple: 1, pair: 0.22, styles: { turn: 1.0, giggle: 1.3, nose: 1.2, back: 1.4, over: 0.6, shake: 1 }, gestures: { clapShort: 1.7, mouth: 1.2, chest: 1.2, slap: 0.6, knee: 0.6, none: 1.2, wipe: 0.6 } },
  // rowdy and close: table slaps, leaning in, head-back roars, loud cackles
  club: { share: 1.05, rowRipple: 1, pair: 0.1, styles: { back: 2.0, over: 1.4, turn: 0.6, shake: 1.2, giggle: 0.7, nose: 0.6 }, gestures: { slap: 1.9, knee: 1.3, wipe: 0.5, clapShort: 0.8, mouth: 0.7 } },
  // a polite ripple back through the rows: chuckles, a hand over the mouth, a look to the companion, applause
  theatre: { share: 0.95, rowRipple: 2.4, pair: 0.12, styles: { giggle: 1.1, nose: 0.7, shake: 1.8, turn: 0.7, back: 2.2, over: 0.15 }, stylesOld: { giggle: 1.7, nose: 1.6, shake: 1.3, turn: 1.4, back: 0.6, over: 0.35 }, // (life-v1: heads back or to a neighbour: dropped heads with open mouths read as pain)
    gestures: { mouth: 2.1, clapShort: 1.7, chest: 1.3, slap: 0.35, knee: 0.4, wipe: 0.8, none: 1.3 } },
  // a mass roar: most of the room, turning to friends, arms up and whistles on the big ones, little single detail
  arena: { share: 1.18, rowRipple: 0.7, pair: 0.05, styles: { back: 1.6, turn: 1.5, over: 1.1, shake: 1, giggle: 0.5, nose: 0.35 }, gestures: { clapShort: 1.3, slap: 0.7, knee: 0.6, mouth: 0.6 }, bigExtra: [['armsUp', 1.1], ['whistle', 0.7]] },
};
// the share of a room that laughs out loud at a laugh of strength s (the rest smile or chuckle): about a third at 0.5,
// four in five at 0.9, before the venue's own share
const castShare = (s, venue) => clamp01(((s - 0.2) / 0.75) * 0.88 * ((VENUE_LAUGH[venue] || VENUE_LAUGH.club).share)) * 0.95;
// who was cast in each laugh (counted as people plan their response), for laughCast(): the crowd agent's sound pass
const CAST = { id: -1, n: 0, total: 0 };
const castTally = (id, laughs) => { if (id !== CAST.id) { CAST.id = id; CAST.n = 0; CAST.total = 0; } CAST.total++; if (laughs) CAST.n++; };
const _lc = { n: 0, share: 0, people: [] }, _lcPool = [];
/**
 * The current laugh's cast (read-only, for the sound mix): n laughing at any level (skinned and instanced people
 * alike), share of everyone who planned a response, and the skinned people in it with gender, a sound type for their
 * take ('roar' head back or doubled over, 'giggle' a closed-mouth or shoulder laugh, 'exhale' a breath through the
 * nose or a smile) and their level 0..1. Reuses one object and its entries: call it once per laugh or per cut.
 */
export function laughCast(list = REG) {
  _lc.n = CAST.n; _lc.share = CAST.total ? CAST.n / CAST.total : 0; _lc.people.length = 0;
  for (const p of list) {
    if (!p.rig || p.hidden || !p._rc) continue;
    const c = p._rc.get(CAST.id);
    if (!c || c.kind !== 'laugh' || (c.reach <= 0.02 && c.smileOnly <= 0.2)) continue;
    const e = _lcPool[_lc.people.length] || (_lcPool[_lc.people.length] = { person: null, gender: 'm', type: 'giggle', level: 0 });
    e.person = p; e.gender = /^Female/.test(p.name || '') ? 'f' : 'm';
    e.type = c.reach <= 0.02 || c.style === 'nose' ? 'exhale' : c.style === 'back' || c.style === 'over' ? 'roar' : 'giggle';
    e.level = c.reach > 0.02 ? c.reach : c.smileOnly * 0.3;
    _lc.people.push(e);
  }
  return _lc;
}
if (typeof window !== 'undefined') window.__laughCast = () => { const c = laughCast(); return { n: c.n, share: +c.share.toFixed(2), people: c.people.map((e) => ({ name: e.person.name, gender: e.gender, type: e.type, level: +e.level.toFixed(2) })) }; };
const THETA = { laugher: [0.05, 0.3], talker: [0.12, 0.5], plain: [0.2, 0.65], shy: [0.3, 0.75], sceptic: [0.55, 0.95] };

// how long the short gestures last (s, a range drawn per person); the rest follow the reaction's whole envelope
const SHORT = { clapShort: [0.8, 1.5], slap: [0.9, 1.7], wipe: [1.0, 1.9], mouth: [1.2, 2.6], chest: [1.4, 3.2], knee: [1.0, 2.2], fist: [1.0, 2.5], whistle: [0.8, 1.6], callout: [0.9, 1.8] };
export const CLAPS = new Set(['clap', 'clapHigh', 'clapLow', 'clapShort']);
function pick(list, u) {
  let total = 0;
  for (const [, w] of list) total += w;
  let x = u * total;
  for (const [g, w] of list) { if ((x -= w) <= 0) return g; }
  return list[list.length - 1][0];
}

// ---------- motion clips: which bones each layer moves, and the fidgets each state favours ----------
const MASK = {}; // filled by initMotion()
// seated fidgets (Rocketbox captures), weighted by state; a person's temperament tilts the mix
// (a listener is attentive: no hand to the brow, the hair or the face while the set is on (it read as a headache or a
// facepalm on every avatar); the thoughtful chin touch stays, rarely; dead air and chat keep a little of the rest)
const FIDGETS = {
  listen: [['sit_chair_gestic_thoughtful', 0.35], ['sit_chair_idle_cough', 0.3], ['sit_chair_idle_look_around', 0.12]],
  // (life-v1: a hand to the face, the hair or the head, rarely, at a lower rate than dead air's; &lifeoff=fidget for the old list)
  listenLife: [['sit_chair_gestic_thoughtful', 0.35], ['sit_chair_idle_cough', 0.25], ['sit_chair_idle_look_around', 0.12], ['sit_chair_idle_touch_face', 0.1], ['sit_chair_idle_touch_hair', 0.09], ['sit_chair_idle_scratch_head', 0.08]],
  dead: [['sit_chair_idle_look_around', 3], ['sit_chair_idle_yawn', 1.2], ['sit_chair_idle_roll_head', 1.4], ['sit_chair_idle_cough', 0.8], ['sit_chair_idle_touch_hair', 0.5], ['sit_chair_gestic_thoughtful', 0.6]],
  social: [['sit_chair_idle_look_around', 2], ['sit_chair_idle_touch_hair', 0.8], ['sit_chair_idle_roll_head', 1], ['sit_chair_idle_cough', 0.4]],
};
const TEMPER_FIDGET = { shy: { sit_chair_idle_touch_hair: 2, sit_chair_idle_touch_face: 1.6 }, sceptic: { sit_chair_gestic_thoughtful: 2.5, sit_chair_gestic_shrug: 2, sit_chair_idle_look_around: 1.3 }, talker: { sit_chair_idle_look_around: 1.6 }, laugher: {}, plain: {} };
// where the captures' chair is, relative to ours: the seat frame's origin is on the floor under the seat
const CHAIR_H = 0.46, CHAIR_Z = -0.06;
const STAND_OFF = 0.44; // as traffic.js: how far in front of the seat a person stands to sit down
const gauss = (R) => (R() + R() + R() - 1.5) * 2;

// ---------- parties: neighbours who came together, and their conversations ----------
const REG = []; // every Person with a rig, for the party pass
if (typeof window !== "undefined") window.__reg = REG; // (check views: the people, wherever they were made)
let partiesFor = -1;
function formParties() {
  if (partiesFor === REG.length) return;
  partiesFor = REG.length;
  const homeOf = (p) => (p.home ? { pos: p.home.pos, yaw: p.home.yaw } : { pos: p.rig.seat.getWorldPosition(new THREE.Vector3()), yaw: p.rig.seat.rotation.y });
  const list = REG.filter((p) => p.rig).sort((a, b) => a.o.row - b.o.row || a.o.x - b.o.x);
  for (const p of list) { p.party = null; p.partner = null; }
  // the people close enough for hands to meet (this row or the next, within 0.9 m)
  for (const p of list) {
    const h = homeOf(p);
    p.near = list.filter((q) => q !== p && Math.abs(q.o.row - p.o.row) <= 1 && homeOf(q).pos.distanceTo(h.pos) < 0.9);
  }
  // the row neighbours either side (the next seat, within 1.3 m), for poses and gestures that mustn't line up
  for (let i = 0; i < list.length; i++) {
    const p = list[i], a = list[i - 1], c = list[i + 1];
    p.rowL = a && a.o.row === p.o.row && Math.abs(a.o.x - p.o.x) < 1.3 ? a : null;
    p.rowR = c && c.o.row === p.o.row && Math.abs(c.o.x - p.o.x) < 1.3 ? c : null;
  }
  assignRest(list);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.party) continue;
    const R = rng((Math.imul(a.seed | 0, 13) + 7) | 0);
    const members = [a];
    for (let j = i + 1; j < list.length && members.length < 3; j++) {
      const b = list[j], last = members[members.length - 1];
      if (b.party || b.o.row !== a.o.row || Math.abs(b.o.x - last.o.x) > 1.25) break;
      const join = members.length === 1 ? (a.o.neighbour && b.o.neighbour) || R() < 0.72 : R() < 0.22;
      if (join) members.push(b); else break;
    }
    const party = { members, seed: (Math.imul(a.seed | 0, 31) + 5) | 0, talks: members.length > 1 && R() < 0.85, tl: null };
    members.forEach((m, k) => { m.party = party; m.pk = k; });
    if (members.length > 1) for (const m of members) {
      const other = members[m.pk === 0 ? 1 : m.pk - 1];
      const h = homeOf(m), oh = homeOf(other);
      const dx = oh.pos.x - h.pos.x, dz = oh.pos.z - h.pos.z;
      m.side = dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw) >= 0 ? 1 : -1; // the seat's +X (their left) in the world
      m.partner = other;
    }
  }
}
/**
 * Every seat's rest-pose schedule, drawn together so the rows don't line up: each person changes pose every 25–70 s (on
 * their own seeded clock), and each change picks from their library leaving out their own last pose, the poses their
 * two row neighbours hold at that moment, and any pose a third of the row already holds (relaxed in that order only
 * when nothing is left). Seeded and order-independent of the frame rate: the same seats give the same schedules.
 */
function assignRest(list) {
  const rows = new Map(), ev = [];
  for (const p of list) {
    (rows.get(p.o.row) || rows.set(p.o.row, []).get(p.o.row)).push(p);
    const R = (p._rsR = rng((Math.imul(p.seed | 0, 5) + 333) | 0));
    p._restSide = p.o.table && p.o.neighbour ? p.o.neighbour : R() < 0.5 ? 1 : -1; // the hand a one-handed pose uses
    p._rs = []; p._rsCur = '';
    for (let t = -5, n = 0; t < 900; t += 25 + 45 * R(), n++) ev.push({ t, p, n });
  }
  // each seat's sitting style, drawn along the row so neighbours differ: upright and attentive, relaxed back against the
  // chair, a slight slouch, one shoulder lower, a slight turn towards a companion (about 30/30/20/10/10)
  const POSTURES = [['upright', 3], ['back', 3], ['slouch', 2], ['shoulder', 1], ['turnIn', 1]];
  for (const rowL of rows.values()) {
    rowL.sort((a, b) => a.o.x - b.o.x);
    let prev = '';
    for (const p of rowL) {
      const R = rng((Math.imul(p.seed | 0, 7) + 991) | 0);
      let k = pick(POSTURES, R());
      if (k === prev) k = pick(POSTURES.filter(([n]) => n !== prev), R());
      p.posture = k; prev = k;
    }
  }
  ev.sort((a, b) => a.t - b.t || a.p.o.row - b.p.o.row || a.p.o.x - b.p.o.x);
  for (const { t, p } of ev) {
    // (a deep belly keeps the knees out of reach: the hands would end beside the leg; those bodies rest on the thighs)
    const fr = p.rig && p.rig.fit && p.rig.fit.front ? p.rig.fit.front.spine || p.rig.fit.front.pelvis || 0 : 0;
    const lib0 = p.o.table && p.o.neighbour ? REST_TABLE : REST_SEAT, lib1 = fr > 0.155 ? lib0.filter(([k]) => k !== 'knees' && k !== 'thighKnee' && k !== 'clasped') : lib0, lib = lib1.length ? lib1 : [['thighs', 1]], row = rows.get(p.o.row) || [];
    const cap = Math.max(1, Math.floor(row.length / 3));
    const held = (k) => row.reduce((n, q) => n + (q !== p && q._rsCur === k ? 1 : 0), 0);
    const nb = (k) => (p.rowL && p.rowL._rsCur === k) || (p.rowR && p.rowR._rsCur === k);
    let opts = lib.filter(([k]) => k !== p._rsCur && !nb(k) && held(k) < cap);
    if (!opts.length) opts = lib.filter(([k]) => k !== p._rsCur && !nb(k));
    if (!REST_OLD && !opts.length) opts = lib.filter(([k]) => !nb(k)); // (rest-v2: rather the same kind again, in a new variant, than a neighbour's)
    if (!opts.length) opts = lib.filter(([k]) => k !== p._rsCur);
    if (!opts.length) opts = lib; // (a library of one: it stays)
    const k = pick(opts, p._rsR());
    p._rs.push({ t, k, v: REST_OLD ? null : restVariant(p, k, p._rs.length) }); p._rsCur = k;
  }
}
/**
 * rest-v2: one rest's own variant, seeded by the seat and the rest's place in its schedule (its own generator: the old
 * schedule's draws are untouched). Offsets in the seat frame, metres: each hand along its leg (z) and in or out (x),
 * the clasped hands' place and which lies on top, the side a one-handed pose uses, and a weight shift (side, lean).
 */
function restVariant(p, k, n) {
  const R = rng((Math.imul(p.seed | 0, 17) + Math.imul(n + 1, 7919) + 4241) | 0), u = () => R() - 0.5;
  const ahead = u() * 0.06; // (one hand ahead of the other: the commonest difference between two people's laps)
  // (small, and on a table's top only: on the legs, further along left a hand off its knee (the posture rule's floating
  // hand) and nearer the hip put an elbow into the flank; there the person's own restVar stays the only offset)
  return {
    id: n, zL: ahead + u() * 0.02, zR: -ahead + u() * 0.02, xL: u() * 0.016, xR: u() * 0.016,
    cx: u() * 0.02, cz: u() * 0.03, top: R() < 0.5 ? 1 : -1, side: R() < 0.5 ? 1 : -1,
    shift: u() * 0.07, lean: u() * 0.04,
  };
}
/** A party's conversation: who speaks when, seeded, never repeating: turns of 0.8–9 s, pauses, laughs and nods. */
function convo(party) {
  if (party.tl) return party.tl;
  const R = rng(party.seed), n = party.members.length, tl = [];
  let t = R() * 2.5, sp = Math.floor(R() * n);
  while (t < 900) {
    const m = party.members[sp];
    const k = m.temper === 'talker' ? 1.7 : m.temper === 'shy' ? 0.55 : 1;
    const len = Math.min(9, Math.max(0.8, Math.exp(0.75 + 0.5 * gauss(R)) * k));
    tl.push({ t0: t, t1: t + len, sp, u: R(), v: R(), w: R() });
    t += len + 0.12 + R() * (R() < 0.25 ? 1.5 : 0.45);
    if (n > 1 && R() < 0.82) sp = (sp + 1 + Math.floor(R() * (n - 1))) % n;
  }
  return (party.tl = tl);
}
const NONE = [];
const DEG = Math.PI / 180;
// &anatomy=off: the old behaviour (no anatomy fixes, no rest library, the old folded arms), to show the validator finds it
const ANATOMY_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('anatomy') === 'off';
// &raw=1: the captures as authored, every correction layer off (no rest poses, IK, gestures, leg passes, procedural
// lean or head, clamps or anatomy): the A/B view for the motion sheets (tools/render/motionstrip.mjs)
const RAW = typeof location !== 'undefined' && new URLSearchParams(location.search).get('raw') === '1';
// &off=look,lean,shrug,rest,gest,legs,clamps,fix: one correction layer at a time off (tools/render/layers.mjs)
const OFF = Object.fromEntries((typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') || '' : '').split(',').filter(Boolean).map((k) => [k, true]));
// &restpose=thighs|clasped|folded|chin|chairBack|tableOne|glass|forearmsTable: every resting person in that pose (the sheets)
// life-v1 switches: &life=off turns every life-v1 layer off (the baseline's motion, the WIP's blinks and looks kept);
// &lifeoff=breath,drift,look,whisper,onset,comp,hands,face,fidget,rest one at a time (hands also: roll,fingers,edge,restvar,bake)
const BAKE_FAR_OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bake') === 'old';
const LIFE_OFF = (() => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null, all = !!q && q.get('life') === 'off';
  const o = Object.fromEntries((q ? q.get('lifeoff') || '' : '').split(',').filter(Boolean).map((k) => [k, true]));
  if (all) for (const k of ['breath', 'drift', 'look', 'whisper', 'onset', 'comp', 'hands', 'face', 'fidget', 'rest', 'laugh', 'busy']) o[k] = true;
  return o;
})();
// laugh-v2 (19 Oct; on the TV: "the movement while they laugh is way too unreal and glitchy"): the laugh is the
// Rocketbox captures', played smoothly, with long eased blends: the body no longer bobs or heaves on each "ha" (only the
// mouth keeps the rhythm), no intake toss at the start, no rocking on top of the capture's own; the laugh level eases in
// over ~0.6 s and out over ~1 s, a new laugh's capture cross-fades from the last over 0.8 s, a person holds the laugh
// they are in unless another is clearly bigger, and the posture's angles are low-passed (0.1 s) so nothing pops a frame.
// &laugh=old brings back life-v1's layers and the unsmoothed blends (the A/B)
const LAUGH_OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('laugh') === 'old';
const SMOOTH = !LAUGH_OLD;
// rest-v2 (19 Oct; the judges: "the front people share the same resting pose, side by side"): each rest the schedule
// hands out comes with its own variant (which hand lies on top when clasped and where the clasp sits, which hand goes to
// the knee, a small weight shift, and on a table's top each hand's place), and a neighbour's pose counts as taken
// before a change of one's own does; a seat may keep its kind with a new variant. &restold=1: the old schedule and
// placements (the A/B)
const REST_OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('restold') === '1';
// arm-v2 (19 Oct; jumpprobe: resting arms flipping between two answers frame by frame): the two fall-backs of a
// resting pose (FB1: the pose collides, straight to the thighs; FB2: an arm locked straight or the two elbows unlike,
// placed again from where the shoulders are) were decided afresh each frame, and their answers differ from the passes'
// by 15-35 degrees at the elbow: a person on the edge of one flipped between the two. Now, once one fires, it holds for
// as long as that rest does (and half a second after the hands leave it), and the lean it asks for eases in. And the
// passes' other discrete choices (bestElbow's point on the circle, guardElbows' kept or undone hand, a wrist limit) are
// followed, for resting arms, at most 180 degrees a second for the elbow and the hand and 1 m a second for the wrist,
// from where the arm was shown last frame (holdElbows). &armold=1: decided each frame, no hold, the lean stepped (the A/B)
const ARM_OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('armold') === '1';
const REST_FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('restpose') || '' : '';
// (a check view's one gesture for every response: &gesture=clap)
// (&reuse=0: every arm gets the full anatomy pass every frame, for A/B checks)
const REUSE_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('reuse') === '0';
// (capture and still views step time themselves and check every pose: no held frames there)
const STEPPED = typeof location !== 'undefined' && /[?&](capture=1|still)/.test(location.search);
// the camera of the last main render, handed over by a person's mesh in its before-render hook (the shadow pass passes
// the mesh, not the scene, so it's ignored): who is out of shot. Null until the first render (the bake): all in shot.
let CAM = null, CAMF = -1, FRF = -2;
const FR = new THREE.Frustum(), FRM = new THREE.Matrix4(), FRS = new THREE.Sphere(undefined, 0.9);
const camHook = (r, s, c) => { if (s && s.isScene) { CAM = c; CAMF = r.info.render.frame; } };
const inShot = (pos) => {
  if (!CAM) return true;
  if (FRF !== CAMF) { FR.setFromProjectionMatrix(FRM.multiplyMatrices(CAM.projectionMatrix, CAM.matrixWorldInverse)); FRF = CAMF; }
  FRS.center.copy(pos);
  return FR.intersectsSphere(FRS);
};
// (&heckle=1: a check view's room has a heckle running from the start, for the face sheets)
const HECKLE_FORCE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('heckle') === '1';
const TEMPER_FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('temper') || '' : '';
// (&sec=1: the update's section timings in window.__sec, for the JS work: tools/render/secbench.mjs)
const SEC = typeof window !== 'undefined' && /[?&]sec=1/.test(location.search) ? (window.__sec = { t: 0, acc: {}, start() { this.t = performance.now(); }, mark(k) { const n = performance.now(); this.acc[k] = (this.acc[k] || 0) + n - this.t; this.t = n; } }) : null;
const BARRIER_Z = 2.67; // the arena's barrier, world z (arena.js AR.barrierZ: the tube at 1.1 m, its panel in front)
const GESTURE_FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('gesture') || '' : '';
// ---------- hands at rest: a small library, placed from each avatar's own fitted body (anatomy.js) ----------
// (chin on hand and an arm over the chair back need a lean or a reach the seated captures don't give: they failed the
// visual check, so they're out of the schedule; chin stays for the bored 'chin' idle, which leans in)
// (folded arms likewise: the hands can't grip the upper arms yet, so they splay; the 'folded' idle gets clasped hands)
// each hand on its own thigh, each on its own knee, one of each, or (rarely) clasped well forward on the lap; every
// seat's schedule is drawn with its row (assignRest): no two neighbours in the same pose, at most a third of a row in one
// (mostly on the thighs, elbows bent and relaxed; both hands out on the knees, arms near straight, read stiff in a row)
// (round 11: at the club's tables a laugh was nearly all 'none', the hands kept on the top: a hand to the face or the chest,
// a short clap, for more of them)
const TABLE_LAUGH_G = { none: 0.12, chest: 2.4, mouth: 0.4, wipe: 0, clapShort: 2.2 }; // (round 13: a hand at the eye read as a facepalm, a headache)
const CLAP_W = LIFE_OFF.hands ? 0.042 : 0.047; // (the wrists a little further apart at the clap's contact: the forearms crossed by a centimetre in a packed row; life-v1)
const REST_SEAT_OLD = [['thighs', 3], ['knees', 0.6], ['thighKnee', 1.2], ['clasped', 0.8]];
// (life-v1: fewer hands out on the knees, more clasped in the lap; one hand over the other's wrist was tried: its crossing
// arm tucked the elbow behind the body)
const REST_SEAT = LIFE_OFF.rest ? REST_SEAT_OLD : REST_OLD ? [['thighs', 2.4], ['knees', 0.35], ['thighKnee', 1.2], ['clasped', 1.4]] : [['thighs', 1.7], ['knees', 0.45], ['thighKnee', 1.5], ['clasped', 1.5]]; // (rest-v2: less of the plain thighs, the row's most repeated look)
// A cabaret table stands in front of its pair, off to one side of each of them: only the close-up pair knows which side
// (o.neighbour), so only they use the table, with the hand on its side (both forearms on it would leave one in the air)
// (the glass: nobody holds one yet, so it's out until there is a glass to hold)
// (at a two-top (the club's cabaret tables) both hands rest on the table's top, planted there: in the lap, a few
// centimetres under the top, every small move crossed its edge from one camera or another, a hand that came and went
// (tools/render/handocc.mjs); on the top, fitted to it once and kept, the body moving about them, they stay in view)
const TABLE_R = 0.4; // (venue.js TABLE_R: the club's two-tops, an 80 cm top)
// (venue.js: a glass on each sitter's outer side of the rim, 14 and 8 cm tall, the candle jar 7 cm in the middle; x, z off
// the table's middle, radius, height)
const TABLE_THINGS = [[-0.32, 0.11, 0.036, 0.14], [0.32, 0.10, 0.041, 0.084], [0.01, -0.06, 0.045, 0.07]];
/**
 * Where a laugh's capture may start: the moments, every 0.1 s over its first dur − 3 s, where its torso and head are
 * nearest the clip's own mean pose (the quietest quarter), so the additive layer it makes begins near zero and the body
 * goes on from wherever it is; the one nearest `want` (a take's seeded start). Worked out once per clip.
 */
const _qs = new WeakMap();
function quietStart(clip, ref, want) {
  // (once per clip: every person's reference for it is the same clip's mean pose)
  let list = _qs.get(clip);
  if (!list) {
    const P = newPose(), span = Math.max(0, clip.dur - 3), ts = [], ds = [], mk = MASK.torso;
    for (let t = 0; t <= span + 1e-6; t += 0.1) {
      sample(clip, t, P);
      let d = 0;
      for (let i = 0, n = 0; i < ANIM.NB; i++, n += 4) { const w = mk ? mk[i] : 1; if (w <= 0) continue; const dot = Math.abs(P[n] * ref[n] + P[n + 1] * ref[n + 1] + P[n + 2] * ref[n + 2] + P[n + 3] * ref[n + 3]); d += w * 2 * Math.acos(Math.min(1, dot)); }
      ts.push(+t.toFixed(2)); ds.push(d);
    }
    const thr = ds.length ? [...ds].sort((a, b) => a - b)[Math.floor((ds.length - 1) * 0.25)] : 0;
    list = ts.filter((t, i) => ds[i] <= thr + 1e-9);
    if (!list.length) list = [0];
    _qs.set(clip, list);
  }
  let best = list[0];
  for (const t of list) if (Math.abs(t - want) < Math.abs(best - want)) best = t;
  return best;
}
/** A two-top's middle, world (venue.js cabaretTables keeps it on each of its seats as twoTop). */
const tableOf = (s, nb, out) => (s.twoTop ? out.set(s.twoTop.x, s.twoTop.y || 0, s.twoTop.z) : out.set(s.x + nb * 0.31, s.y || 0, s.z - 0.4));
const REST_TABLE = [['tableBoth', 2], ['forearmsTable', 1]];
const _rv = [...Array(10)].map(() => new THREE.Vector3());
const LAUGH_P = { laugher: 0.45, talker: 0.25, plain: 0.18, shy: 0.16, sceptic: 0.05 };

/**
 * Temperament is seeded per seat: how easily they laugh, how fast, how they show it, what they do when idle.
 * opts: { seed, row, x, table (bool: a table in front), seatH, neighbour (+1/-1: the side a friend sits on), idle,
 *         stand (always standing), standHands ('drink' | 'down' | 'rail') }
 * `loco` (set from outside each frame) moves them between seated and standing, walking and putting a coat on.
 */
export class Person {
  constructor(rig, face, opts) {
    this.rig = rig;
    this.face = face;
    this.o = opts;
    if (rig && rig.model) rig.model.traverse((m) => { if (m.isMesh) m.onBeforeRender = camHook; }); // (who's in shot: see inShot; the instanced bake has no rig)
    const r = rng(opts.seed);
    // the page seeds people by their index in the room, so the same index would be the same person (temperament, takes,
    // timing) in every venue: the seat's place is mixed in, so each room has its own people
    this.seed = (Math.imul(opts.seed | 0, 1) + Math.round((opts.x || 0) * 997) * 131 + (opts.row | 0) * 7919) | 0;
    this.eager = r();
    this.delay = 0.05 + r() * 0.4;
    this.style = STYLES[Math.floor(r() * STYLES.length)];
    this.clapper = r();
    this.cheerer = r();
    this.haHz = 3.8 + r() * 1.8;
    this.clapHz = 1.8 + r() * 1.4; // 1.8–3.2 Hz, each their own
    this.slapHz = 2.4 + r() * 1.1;
    this.breathHz = 0.22 + r() * 0.08;
    this.idle = opts.idle || 'still';
    this.slouch = (r() - 0.45) * 0.3; // some sit up, some slump back
    this.feet = 0.1 + r() * 0.08;
    this.footFwd = 0.34 + r() * 0.12;
    { const k = r(); this.handsOn = opts.table ? (k < 0.4 ? 'table' : k < 0.75 ? 'mixed' : 'lap') : (k < 0.3 ? 'mixed' : 'lap'); }
    this.headTilt = (r() - 0.5) * 0.3;
    // where 'looking at the stage' lands for this person: the performer's body or the mic, rarely the lens
    this.gaze = { x: (r() - 0.5) * 0.6, y: -0.04 - r() * 0.12 }; // (the performer's face, give or take: never their shoes)
    this.glance = r(); // how often they look down at their drink or across to a friend
    this.side = opts.neighbour || (r() < 0.5 ? -1 : 1);
    this.chatty = r(); // in the preview: who talks, who is on the phone, who drinks
    // blink schedule (stateless lookup)
    this.blinks = [];
    for (let t = r() * 3; t < 900; t += 1.6 + r() * 4.5) { this.blinks.push(t); if (r() < 0.12) this.blinks.push(t + 0.28); }
    this.nods = [];
    for (let t = 2 + r() * 8; t < 900; t += 7 + r() * 16) this.nods.push(t);
    this.p = { tL: new THREE.Vector3(), tR: new THREE.Vector3(), pL: new THREE.Vector3(), pR: new THREE.Vector3() };
    this.rollRest = 1.2;
    this.rollClap = 0.1;
    this.loco = null;
    this._gcache = new Map();
    // ---- temperament, expression and fidget schedules (a second stream, so the draws above keep their values) ----
    const r2 = rng((Math.imul(this.seed | 0, 7) + 99) | 0);
    this.temper = pick([['plain', 3], ['laugher', 2], ['sceptic', 1.3], ['shy', 1.5], ['talker', 1.6]], r2());
    if (TEMPER_FORCE) this.temper = TEMPER_FORCE; // (a check view's temperament, for the face sheets)
    // temperament shifts how much they show; when they react still comes only from the room's drive
    this.eager = clamp01(this.eager + { laugher: 0.2, sceptic: -0.22, shy: -0.08, talker: 0.06, plain: 0 }[this.temper]);
    this.smirkSide = r2() < 0.5 ? -1 : 1;
    this.smileBase = { laugher: 0.12, sceptic: 0.0, shy: 0.05, talker: 0.1, plain: 0.04 }[this.temper] + r2() * 0.05;
    this.clipT = r2() * 300; this.clipRate = 0.9 + r2() * 0.2;
    this.fidgets = [];
    for (let t = r2() * 4; t < 900; t += 0.8 - Math.log(1 - r2()) / 0.22) this.fidgets.push({ t, u: r2(), k: r2() });
    this._fdec = new Map();
    this.saccades = [];
    for (let t = r2(); t < 900; t += 0.6 + r2() * 2.4) this.saccades.push({ t, x: (r2() - 0.5) * 0.44, y: (r2() - 0.5) * 0.16 });
    this.exprs = [];
    for (let t = 1 + r2() * 6; t < 900; t += 4 + r2() * 11) this.exprs.push({ t, u: r2(), k: r2(), dur: 0.9 + r2() * 1.8 });
    // ---- life-v1: blinks, looks and small events from a third stream (the draws above keep their values) ----
    const r3 = rng((Math.imul(this.seed | 0, 13) + 5) | 0);
    // blinks 2-10 s apart, mostly 3-5 (skewed short), one in ten a double; an attentive listener skips some (blinkAt)
    this.blinks = [];
    for (let t = r3() * 3; t < 900; t += 2 + 8 * Math.pow(r3(), 1.7)) { this.blinks.push(t); if (r3() < 0.1) this.blinks.push(t + 0.24 + r3() * 0.12); }
    this.blinkSkip = this.blinks.map(() => r3());
    // saccades between fixations: mostly on the performer (small corrections), sometimes a neighbour, sometimes the room
    this.saccades = [];
    for (let t = r3(); t < 900; t += 0.45 + r3() * 2.6) {
      const u = r3();
      if (u < 0.7) this.saccades.push({ t, x: (r3() - 0.5) * 0.14, y: (r3() - 0.5) * 0.07 });
      else if (u < 0.85) this.saccades.push({ t, x: 0.38 + r3() * 0.1, y: 0.02 + r3() * 0.05, nb: 1 }); // (to the friend beside them: side at run time)
      else this.saccades.push({ t, x: (r3() - 0.5) * 0.6, y: (r3() - 0.55) * 0.22 });
    }
    this.lifeSeed = r3() * 1000; // (weight shifts, head drift, whispers: each person's own phase)
    // (life-v1: each person's own way of resting the hands: further along or nearer the hip, a little in or out, one hand
    // ahead of the other, the palm turned more or less over, the fingers more or less curled; and how deep they breathe)
    this.restVar = { zL: (r3() - 0.5) * 0.1, zR: (r3() - 0.5) * 0.1, xL: (r3() - 0.5) * 0.03, xR: (r3() - 0.5) * 0.03 }; r3(); // (a draw kept for the seeds: the resting fingers' own aim along the thigh was tried, and taken out)
    { const rr = 0.95 + 0.45 * r3(); if (!LIFE_OFF.hands && !LIFE_OFF.roll && !opts.noParty) this.rollRest = rr; }
    this.breathAmp = 0.8 + 0.45 * r3();
    this.whisperU = r3();
    this.restVar.edgeL = r3() < 0.5; this.restVar.edgeR = r3() < 0.5; // (a resting hand on its little finger's edge, the palm in, not flat)
    { const c1 = 0.12 + 0.22 * r3(), c2 = 0.3 + 0.3 * r3(), spread = 0.05 * r3();
      if (rig && !LIFE_OFF.hands && !LIFE_OFF.fingers && !opts.noParty) for (const side of ['L', 'R']) { // (relaxed fingers, each person's own curl: the Rig's one curl made every hand alike)
        const sgn = side === 'L' ? -1 : 1;
        FINGERS.forEach((f, i) => {
          const bone = rig.model.getObjectByName(`Bip01_${side}_${f}`), r = bone && rig.rest.get(bone);
          if (!r) return;
          const fi = Math.floor(i / 3); // (index finger 0 … little finger 3: the little finger curls a little more)
          rig.setRot(bone, _q[0].setFromAxisAngle(Z, sgn * ((f.length === 7 ? c1 : c2) + fi * spread)));
          if (!bone.matrixAutoUpdate) bone.updateMatrix();
        });
      } }
    this.sylHz = 3.9 + r2() * 1.2;
    { const [lo, hi] = THETA[this.temper]; this.theta = lo + (hi - lo) * r2(); if (r2() < 0.05 && this.temper !== 'laugher') this.theta = 0.97; } // ~5% stone faces (never a laugher)
    this.rt = 0.12 + 0.25 * r2(); // reaction time, s
    this.attack = 0.15 + 0.45 * r2(); // how fast the laugh comes on, s
    this.keep = this.temper === 'laugher' ? 0.55 + 0.3 * r2() : r2() < 0.25 ? 0.35 + 0.3 * r2() : 0; // keeps laughing after
    this._takes = new Map(); this._lastTake = null; this.laughScore = 0; this._rc = new Map();
    if (rig && !opts.noParty) REG.push(this);
  }

  /** This person's captures (gendered by the avatar's name), picked once from their seed and temperament. */
  clips() {
    if (this._clips) return this._clips;
    const g = this.gender || (this.name && /^Female/.test(this.name) ? 'f' : 'm');
    const R = rng((Math.imul(this.seed | 0, 3) + 17) | 0);
    const one = (pre) => { const l = family(pre, g); return l.length ? ANIM.clips[l[Math.floor(R() * l.length)]] : null; };
    const tp = this.temper;
    // seated captures only, hands in the lap (the 'relaxed' takes drape an arm over the next chair)
    // (the neutral seated take for everyone: the men's 'breathe' take sits with a hand on the hip, akimbo)
    const seat = R() < 0.5 ? 'sit_chair_idle_neutral' : 'sit_chair_idle_neutral';
    const C = {
      g, seat: one(seat), standBase: one('gestic_listen_neutral'), sit: one('sit_down_chair'), rise: one('sit_stand_up_chair'),
      walks: family('walk', g).map((n) => ANIM.clips[n]),
      talk: one(tp === 'talker' ? 'gestic_talk_excited' : R() < 0.5 ? 'gestic_talk_relaxed' : 'gestic_talk_neutral'),
      nod: one('gestic_listen_accept'), deny: one('gestic_listen_deny'),
      // laughter: a chuckle, a laugh and a big laugh, each in this gender's take and the other's (six captures)
      laughSet: ['gestic_laugh_low', 'gestic_laugh_loud', 'gestic_laugh_extreme'].map((pre) => [family(pre, g)[0], family(pre, g === 'm' ? 'f' : 'm')[0]].map((n) => (n ? ANIM.clips[n] : null))),
    };
    // additive layers are taken against each clip's mean pose, so they add the motion (beats, nods, a laugh's shaking)
    // and not the capture's own stance (a standing laugh's forward bend)
    const ref = (c) => (c ? meanPose(c) : null), c0 = (c) => (c ? sample(c, 0, newPose()) : null);
    C.talkRef = ref(C.talk); C.nodRef = c0(C.nod); C.denyRef = c0(C.deny); C.laughRefs = C.laughSet.map((pair) => pair.map(ref));
    return (this._clips = C);
  }
  /**
   * Keep the hands where hands can be (positions in the seat frame, tested at the palm, between the wrist and the
   * knuckles): out of the person's own torso (an ellipse round the spine, 0.17 m to the sides and 0.13 m front and back),
   * inside their own place (|x| <= 0.26 m: never into a neighbour's hands or arms), above their own thighs (a capsule
   * round each thigh bone) and the seat, and apart from each other (palms may touch in a clap, never pass; forearms one
   * over the other, never through). Any hand moved is re-solved by IK.
   */
  keepHandsOut(seated = true, clapping = false, pass = 0) {
    const rig = this.rig, b = rig.b, seat = rig.seat, sh = this.o.seatH;
    const K = (this._kh ||= [...Array(24)].map(() => new THREE.Vector3())); // (rig.solve uses the shared _v)
    const loc = (bone, v) => worldPos(bone, v).applyMatrix4(rig.inv);
    const lo = loc(b.spine, K[0]), hi = loc(b.neck, K[1]);
    const ax = K[2].copy(hi).sub(lo), L2 = Math.max(ax.lengthSq(), 1e-6);
    const H = (this._kH ||= [[b.lHand, b.lTip, b.lUpper, b.lFore, rig.bend.lArm, 1], [b.rHand, b.rTip, b.rUpper, b.rFore, rig.bend.rArm, -1]]);
    const palmOf = (hand, tip, out) => { loc(hand, out); if (tip) out.lerp(loc(tip, K[11]), 0.5); return out; };
    const want = (this._kw ||= [{ p: K[12], moved: false }, { p: K[13], moved: false }]);
    for (let i = 0; i < 2; i++) { palmOf(H[i][0], H[i][1], want[i].p); want[i].moved = false; }
    const thighs = (this._kt ||= [[K[14], K[15]], [K[16], K[17]]]);
    loc(b.lThigh, K[14]); loc(b.lCalf, K[15]); loc(b.rThigh, K[16]); loc(b.rCalf, K[17]);
    // the neighbours' forearms and palms, in my seat frame, once per call (the rules below run up to twice a pass)
    const NB = (this._knb ||= { n: 0, pts: [...Array(8 * 6)].map(() => new THREE.Vector3()) });
    NB.n = 0;
    if (this.near) for (const q of this.near) {
      if (!q.rig || q.hidden || NB.n >= 8) continue;
      const qb = q.rig.b, o = NB.n * 6, P = NB.pts;
      loc(qb.lFore, P[o]); loc(qb.lHand, P[o + 1]); loc(qb.rFore, P[o + 2]); loc(qb.rHand, P[o + 3]);
      palmOf(qb.lHand, qb.lTip, P[o + 4]); palmOf(qb.rHand, qb.rTip, P[o + 5]);
      NB.n++;
    }
    const rules = () => { for (let i = 0; i < 2; i++) {
      const w = want[i], h = w.p, sgn = H[i][5];
      // the torso (a rough one, a little wider than the hand checker's; anatomy.js then fixes the arms against the
      // fitted body itself)
      const k = clamp01(K[3].copy(h).sub(lo).dot(ax) / L2), c = K[4].copy(lo).addScaledVector(ax, k);
      const dx = h.x - c.x, dz = h.z - c.z;
      if (k > 0.03 && k < 0.97) {
        const e = Math.hypot(dx / 0.17, dz / 0.13);
        if (e < 1) { h.z = c.z + 0.13 * Math.max(0.3, Math.sqrt(Math.max(0, 1 - (dx / 0.17) ** 2))) + 0.03; w.moved = true; }
        else if (dx * sgn < -0.04 && dz < 0.17) { h.z = c.z + 0.2; w.moved = true; } // crossed over, behind the chest front
      }
      // their own place
      if (Math.abs(h.x) > 0.26) { h.x = Math.sign(h.x) * 0.26; w.moved = true; }
      // above the thighs (a hand rests on a thigh, it never sinks into it)
      for (const [a0, a1] of thighs) {
        const seg = K[5].copy(a1).sub(a0), u = clamp01(K[6].copy(h).sub(a0).dot(seg) / Math.max(seg.lengthSq(), 1e-6));
        const q = K[7].copy(a0).addScaledVector(seg, u), d = K[8].copy(h).sub(q), r = d.length();
        if (r < 0.085) { if (d.y < 0.02 || r < 1e-4) d.set(0, 1, 0.15); d.normalize(); h.copy(q).addScaledVector(d, 0.09); w.moved = true; }
      }
      // and above the seat
      if (seated && h.y < sh + 0.035 && Math.abs(h.x) < 0.24 && h.z > -0.24 && h.z < 0.26) { h.y = sh + 0.035; w.moved = true; }
      // and clear of the neighbours' forearms and hands (their elbows can reach past the half-way line): back
      // towards their own middle
      if (NB.n) {
        const elbow = loc(H[i][3], K[18]);
        for (let j = 0; j < NB.n; j++) {
          const P = NB.pts, o = j * 6;
          for (let f = 0; f < 2; f++) {
            const a0 = P[o + 2 * f], a1 = P[o + 2 * f + 1];
            const dd = Math.min(segDist(h, h, a0, a1), h.distanceTo(a1) - 0.02);
            if (dd < 0.075) { h.x -= Math.sign(h.x || a1.x) * Math.min(0.09, 0.075 - dd + 0.012); w.moved = true; }
          }
          // …and my forearm clear of their hands (whoever is posed later in the frame keeps them apart)
          for (let f = 0; f < 2; f++) {
            const qp = P[o + 4 + f];
            const dd = segDist(qp, qp, elbow, h);
            if (dd < 0.065) { h.x -= Math.sign(h.x || -qp.x) * Math.min(0.08, 0.065 - dd + 0.01); w.moved = true; }
          }
        }
      }
    } };
    rules();
    // the two hands: palms may meet (a clap), fingers and wrists never pass through each other
    {
      // the knuckles count too (fingers pointing at each other meet before the palms do)
      const kn = loc(b.lTip || b.lHand, K[22]).sub(loc(b.rTip || b.rHand, K[23])).length();
      const d = K[9].copy(want[0].p).sub(want[1].p), r0 = d.length(), r = Math.min(r0, kn + (clapping ? 0.02 : 0.03)), min = clapping ? 0.042 : 0.06;
      if (r < min) {
        if (r0 < 1e-4) d.set(1, 0, 0); else d.multiplyScalar(1 / r0);
        if (d.x < 0.2) d.set(1, 0, 0); // apart sideways (left hand to the left)
        want[0].p.addScaledVector(d, (min - r) / 2); want[1].p.addScaledVector(d, -(min - r) / 2); want[0].moved = want[1].moved = true;
        rules(); // (pulling the hands apart must not push one into the body)
      }
    }
    for (let i = 0; i < 2; i++) {
      if (!want[i].moved) continue;
      const [hand, tip, up, fore, bend, sgn] = H[i];
      const wrist = loc(hand, K[10]).add(want[i].p).sub(palmOf(hand, tip, K[3])); // move the wrist by the palm's correction
      rig.solve(up, fore, hand, seat.localToWorld(wrist), K[4].set(0.7 * sgn, -0.3, -1).transformDirection(seat.matrixWorld), bend, rig.len.arm);
      rig.upd(hand);
      this._kho = true; // (something moved: the anatomy pass looks again)
    }
    // the IK lands near, not exactly on, the target: if anything moved, check once more from the new pose
    if (pass < 2 && (want[0].moved || want[1].moved)) return this.keepHandsOut(seated, clapping, pass + 1);
    // forearms one over the other: if they pass through each other, lift the higher hand clear
    const A = [loc(H[0][3], K[18]), loc(H[0][0], K[19])], B = [loc(H[1][3], K[20]), loc(H[1][0], K[21])], dAB = segDist(A[0], A[1], B[0], B[1]);
    if (dAB < 0.045) {
      const i = A[1].y >= B[1].y ? 0 : 1, [hand, , up, fore, bend, sgn] = H[i];
      const wrist = loc(hand, K[10]).add(K[3].set(0, 0.06 + (0.045 - dAB), 0.02));
      rig.solve(up, fore, hand, seat.localToWorld(wrist), K[4].set(0.7 * sgn, -0.3, -1).transformDirection(seat.matrixWorld), bend, rig.len.arm);
      rig.upd(hand);
      this._kho = true;
    }
  }

  /**
   * A capture (standing up, a coat, a turn) can swing an upper arm out to the rig's bind direction (down and out at
   * about 45°), which reads as the T/A pose: swing it towards hanging down until it is at least 23° clear.
   */
  /**
   * Crossed ankles are how many people sit, and the women's seated capture sits so: only shins that pass through each
   * other (centre lines nearer than 7.5 cm) are turned apart at the hips, each away from the other where they are
   * nearest, crossed or side by side, and only as far as that. Run after the leg passes and again after the spine's
   * clamps (the thighs hang from Spine: a clamp swings them).
   */
  shinsApart() {
    const rig = this.rig, b = rig.b;
    if (!b.lThigh || !b.rThigh || !b.lCalf || !b.rCalf || !b.lFoot || !b.rFoot) return;
    const K = (this._sa ||= [...Array(14)].map(() => new THREE.Vector3()));
    for (let pass = 0; pass < 3; pass++) {
      const KL = worldPos(b.lCalf, K[0]), AL = worldPos(b.lFoot, K[1]), KR = worldPos(b.rCalf, K[2]), AR = worldPos(b.rFoot, K[3]);
      const dR = K[4].copy(AR).sub(KR), L2 = Math.max(dR.lengthSq(), 1e-9), pL = K[5], pR = K[6], q = K[7];
      let sdist = Infinity, fL = 1, fR = 1;
      for (let i = 0; i <= 8; i++) { q.copy(KL).lerp(AL, i / 8); const u = clamp01(K[8].copy(q).sub(KR).dot(dR) / L2), c = K[9].copy(KR).addScaledVector(dR, u), d = c.distanceTo(q); if (d < sdist) { sdist = d; pL.copy(q); pR.copy(c); fL = i / 8; fR = u; } }
      if (sdist >= 0.075) return;
      const sep = K[10].copy(pL).sub(pR).setY(0);
      if (sep.lengthSq() < 1e-8) sep.set(1, 0, 0).transformDirection(rig.seat.matrixWorld);
      sep.normalize();
      for (const [th, ca, ft, sg, f] of [[b.lThigh, b.lCalf, b.lFoot, 1, fL], [b.rThigh, b.rCalf, b.rFoot, -1, fR]]) {
        const H = worldPos(th, K[11]), Kn = worldPos(ca, K[12]), A = worldPos(ft, K[13]);
        const ax = K[8].copy(Kn).sub(H).normalize(), r = A.sub(Kn), push = K[9].copy(sep).multiplyScalar(sg); // (r: knee to ankle)
        const sw = K[2].crossVectors(ax, r), k = sw.dot(push), len = Math.max(0.2, r.length());
        if (Math.abs(k) < 1e-4) continue;
        // (as far as the shins' nearest points need: a turn of the thigh moves a point on the shin by its distance down it)
        const beta = Math.sign(k) * Math.asin(Math.min(0.5, (0.082 - sdist) / 2 / Math.max(0.08, len * f)));
        const Wq = worldQuat(th, _q[2]).premultiply(_q[3].setFromAxisAngle(ax, beta));
        th.quaternion.copy(worldQuat(th.parent, _q[4]).invert().multiply(Wq));
        rig.upd(th);
      }
    }
  }

  armsOffBind() {
    const rig = this.rig, b = rig.b, seat = rig.seat;
    const K = (this._kb ||= [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()));
    let moved = 0;
    for (const [up, fore, sx] of [[b.lUpper, b.lFore, 1], [b.rUpper, b.rFore, -1]]) {
      const d = K[0].copy(worldPos(fore, K[1])).sub(worldPos(up, K[2])).normalize();
      const bind = K[3].set(0.72 * sx, -0.69, 0).normalize().transformDirection(seat.matrixWorld);
      if (d.angleTo(bind) >= 0.4) continue;
      const down = K[4].set(0.12 * sx, -1, 0.1).normalize().transformDirection(seat.matrixWorld);
      const want = K[5].copy(d);
      for (const k of [0.35, 0.6, 0.85, 1]) { want.copy(d).lerp(down, k).normalize(); if (want.angleTo(bind) >= 0.4) break; }
      // (a hand planted on a table's top stays there: the elbow turned on its circle towards that way instead, the
      // whole arm swung would lift the hand off the top)
      if (this._planted) {
        const left = up === b.lUpper, hand = left ? b.lHand : b.rHand, W = worldPos(hand, K[1]), P = K[2].copy(want);
        rig.solve(up, fore, hand, W, P, left ? rig.bend.lArm : rig.bend.rArm, rig.len.arm);
        rig.upd(up); moved++; continue;
      }
      const Wq = worldQuat(up, _q[2]).premultiply(_q[3].setFromUnitVectors(d, want));
      up.quaternion.copy(worldQuat(up.parent, _q[4]).invert().multiply(Wq));
      rig.upd(up);
      moved++;
    }
    return moved;
  }

  /**
   * Standing with nothing in the hands, the arms hang close to the body (a standing capture on another body leaves an
   * A-pose gap under the arms): each upper arm swings most of the way to straight down and a little forward; the
   * anatomy pass then keeps it out of the flank.
   */
  armsIn(k = 0.7) {
    const rig = this.rig, b = rig.b, seat = rig.seat;
    const K = (this._ki ||= [0, 1, 2, 3].map(() => new THREE.Vector3()));
    for (const [up, fore, sx] of [[b.lUpper, b.lFore, 1], [b.rUpper, b.rFore, -1]]) {
      const d = K[0].copy(worldPos(fore, K[1])).sub(worldPos(up, K[2])).normalize();
      const want = K[3].set(0.07 * sx, -1, 0.05).normalize().transformDirection(seat.matrixWorld);
      const q = _q[4].identity().slerp(_q[3].setFromUnitVectors(d, want), k);
      const Wq = worldQuat(up, _q[2]).premultiply(q);
      up.quaternion.copy(worldQuat(up.parent, _q[5]).invert().multiply(Wq));
      rig.upd(up);
    }
  }

  /**
   * A standing ovation: on a strong finale (a cheer at 0.75 or more) some people without a table in front stand up at
   * their seat (after their own delay, the rise capture over 2.6 s), clap standing, and sit back down when it's over.
   * Returns a traffic-like state ({ rise, stand, off } or { stand, front, off }) or null.
   */
  ovationAt(now, room) {
    if (this.o.table || this.o.stand || !this.rig) return null;
    let ev = null;
    for (const e of room.events) if (e.kind === 'cheer' && e.s >= 0.75) { ev = e; break; }
    const S = (this._ovS ||= { t0: -1, t1: -1, k1: 0, id: -1 });
    if (ev && S.id !== ev.id) {
      S.id = ev.id; S.t1 = -1;
      const share = 0.3 + 0.3 * clamp01((ev.s - 0.75) / 0.25), wants = (p) => p && !p.o.table && !p.o.stand && hash(p.seed * 1.37 + 5) < share;
      // (never two people standing up side by side in seats closer than 0.6 m: they'd rise into each other)
      const L = this.rowL, cramped = L && Math.abs(L.o.x - this.o.x) < 0.6 && wants(L) && !(L.rowL && Math.abs(L.rowL.o.x - L.o.x) < 0.6 && wants(L.rowL));
      S.t0 = wants(this) && !cramped ? ev.t + 0.8 + 2.4 * hash(this.seed * 2.11 + 9) : -1;
    }
    if (S.t0 < 0) return null;
    const RISE = 2.6;
    if (!ev && S.t1 < 0) { S.t1 = now; S.k1 = clamp01((now - S.t0) / RISE); }
    const k = S.t1 < 0 ? clamp01((now - S.t0) / RISE) : S.k1 * clamp01(1 - (now - S.t1) / RISE);
    if (S.t1 >= 0 && k <= 0) { S.t0 = -1; return null; }
    if (k <= 0) return null;
    const O = (this._ovO ||= { off: 0.2, rise: undefined, stand: 0, front: 0 });
    O.rise = k < 1 ? k : undefined; O.stand = k < 1 ? smooth((k - 0.1) / 0.75) : 1; O.front = k < 1 ? 0 : 1;
    return O;
  }
  /** Which rest pose the hands are in at `now` (a seeded schedule: a new one every 25–70 s, crossfaded over a second). */
  restPoseAt(now) {
    if (!this._rs) assignRest([this]); // (drawn with the row in formParties; alone, by itself)
    const S = this._rs;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t <= now) lo = m; else hi = m - 1; }
    const o = (this._rso ||= { kind: '', prev: '', k: 1, v: null, vPrev: null, same: true });
    o.kind = S[lo].k; o.prev = lo > 0 ? S[lo - 1].k : S[lo].k; o.k = smooth((now - S[lo].t) / 1.0);
    o.v = S[lo].v || null; o.vPrev = lo > 0 ? S[lo - 1].v || null : o.v; o.same = o.prev === o.kind && o.v === o.vPrev; // (rest-v2: the same kind in a new variant crossfades too)
    if (REST_FORCE) { o.kind = o.prev = REST_FORCE; o.k = 1; o.v = o.vPrev = null; o.same = true; }
    return o;
  }
  /**
   * The seat-frame targets (wrists and elbow poles) of one rest pose, from this avatar's fitted thighs, belly and head in
   * their current pose: on the thighs, clasped in the lap above them, arms folded in front of the belly's own surface,
   * chin on a hand, an arm over the chair back, and at a table: a hand on it, a glass, the forearms on it.
   */
  restTargets(kind, v) {
    // (rest-v2: the variant of the rest in hand, or the one fading out, by kind; v === null: none)
    if (v === undefined) { const o = this._rso; v = REST_OLD || !o ? null : o.kind === kind && (o.k >= 0.5 || o.prev !== kind) ? o.v : o.prev === kind ? o.vPrev : null; }
    const rig = this.rig, fit = rig.fit, b = rig.b, sh = this.o.seatH, sd = v ? v.side * (this.o.table && this.o.neighbour ? 0 : 1) || this._restSide || 1 : this._restSide || 1;
    const R = (this._rt ||= { tL: new THREE.Vector3(), tR: new THREE.Vector3(), pL: new THREE.Vector3(), pR: new THREE.Vector3(), roll: 0, back: -1 });
    R.roll = 0; R.back = -1;
    const toL = (v) => v.applyMatrix4(rig.inv);
    // a point on a fitted section's surface, at fraction u along it, on the side facing world direction `dir` (seat frame)
    const surf = (sec, u, dir, out) => {
      const d = _rv[7].copy(dir).transformDirection(rig.seat.matrixWorld).transformDirection(sec.inv);
      let dy = d.y, dz = d.z; const n = Math.hypot(dy, dz) || 1; dy /= n; dz /= n;
      const r = 1 / Math.sqrt((dy / (dy >= 0 ? sec.yP : sec.yN)) ** 2 + (dz / (dz >= 0 ? sec.zP : sec.zN)) ** 2);
      return toL(out.set(sec.x0 + u * (sec.x1 - sec.x0), dy * r, dz * r).applyMatrix4(sec.bone.matrixWorld));
    };
    const UP = _rv[5].set(0, 1, 0), FWD = _rv[6].set(0, 0, 1);
    // (a body fitted without thighs, as some low-detail models are: the old lap targets)
    if (!fit || !fit.thighs.length) { R.tL.set(0.15, sh + 0.2, 0.19); R.tR.set(-0.14, sh + 0.2, 0.21); R.pL.set(0.7, -0.3, -1); R.pR.set(-0.7, -0.3, -1); return R; }
    // (by side: a body fitted with one thigh only gets the other one mirrored, never both hands on the same leg)
    const thL = fit.thighs.find((t) => t.side > 0) || null, thR = fit.thighs.find((t) => t.side < 0) || null;
    // a hand on its own thigh: on top of it and a little to the outside (so the fingers run along it, the wrist
    // straight, never across to the other hand), at fraction u from the hip (the knee is ~0.9)
    // (along the leg from the hip joint to the knee joint, not the fitted section's length: a section can stop short
    // of the knee where the skin weights hand the leg to the calf; the section gives the leg's radius on top)
    const onThigh = (side, u, out) => {
      const sec = (side > 0 ? thL : thR) || (side > 0 ? thR : thL);
      const h = toL(worldPos(side > 0 ? b.lThigh : b.rThigh, _rv[1])), k = toL(worldPos(side > 0 ? b.lCalf : b.rCalf, _rv[2]));
      out.copy(h).lerp(k, u);
      const up = _rv[3].set(0.2 * side, 1, 0).normalize();
      let r = 0.08;
      if (sec) {
        const d = _rv[7].copy(up).transformDirection(rig.seat.matrixWorld).transformDirection(sec.inv);
        let dy = d.y, dz = d.z; const n = Math.hypot(dy, dz) || 1; dy /= n; dz /= n;
        r = 1 / Math.sqrt((dy / (dy >= 0 ? sec.yP : sec.yN)) ** 2 + (dz / (dz >= 0 ? sec.zP : sec.zN)) ** 2);
      }
      return out.addScaledVector(up, r * (1 - 0.22 * u)).add(_rv[4].set(0.006 * side, 0.03, 0)); // (the leg tapers to the knee; the wrist just above it, the palm on it)
    };
    // the elbows back by the flanks and only a little out, so each forearm runs forward along its own thigh (a straight
    // wrist then lays the fingers along it, not across towards the other hand)
    R.pL.set(0.14, -0.5, -0.86); R.pR.set(-0.14, -0.5, -0.86); // (back, nearly straight back: an elbow pointed out reads as akimbo)
    // (a deep belly: the hands further along the legs and the elbows tucked back, so the forearms pass in front of it
    // instead of bowing out round it)
    const belly = Math.max(0, (fit.front ? fit.front.spine || fit.front.pelvis || 0 : 0) - 0.13);
    if (belly > 0) { R.pL.set(0.12, -0.6, -0.8); R.pR.set(-0.12, -0.6, -0.8); }
    const uL = Math.min(0.86, (kind === 'knees' || (kind === 'thighKnee' && sd > 0) ? 0.82 : kind === 'clasped' ? 0.62 : 0.62) + belly * 3);
    const uR = Math.min(0.86, (kind === 'knees' || (kind === 'thighKnee' && sd < 0) ? 0.82 : kind === 'clasped' ? 0.62 : 0.62) + belly * 3);
    // (as far along as the arm reaches: sitting up straight, a short arm can't quite get to the knee, and the IK would
    // leave the hand hanging short of it, above the leg)
    // (and within a resting arm's reach: the elbow bent to about 128° at most, never locked straight to the leg; the
    // limbs rules want 90-130°. Someone leaning back rests the hands nearer the hip.)
    // (one hand on the table, the other rests further along its thigh: drawn back to the hip, its fingers dug in)
    const reach = (kind === 'tableOne' ? 0.985 : this.force && !LIFE_OFF.hands && !LIFE_OFF.bake ? 0.8 : 0.9) * (rig.len.arm[0] + rig.len.arm[1]); // (a baked low-detail pose: the elbows bent, no IK fix after it; life-v1)
    // (nor so close that the elbow folds up behind the back)
    const near = 0.72 * (rig.len.arm[0] + rig.len.arm[1]); // (0.72: an elbow bent to about 92°, relaxed)
    const placed = (side, u, out) => {
      const sh0 = toL(worldPos(side > 0 ? b.lUpper : b.rUpper, _rv[0]));
      for (let uu = u; ; uu -= 0.04) { onThigh(side, uu, out); if (uu <= (belly > 0 ? 0.42 + belly * 2 : 0.5) || out.distanceTo(sh0) <= reach) break; } // (not far back into a belly's way)
      for (let uu = u + 0.04; uu <= 0.9 && out.distanceTo(sh0) < near; uu += 0.04) onThigh(side, uu, out);
      return out;
    };
    placed(1, uL, R.tL); placed(-1, uR, R.tR);
    // (both hands on the legs: each the same fraction of its arm's length from its shoulder, so the two elbows bend
    // alike, 100-130°, whichever way the chest leans or turns; the limbs rules)
    // (the search every 8th call for the same pose: the shoulders move slowly; a stepped view searches every time)
    const RC = (this._rc2 ||= { kind: '', n: 0, uL: 0, uR: 0, vid: -1 });
    if (kind === 'thighs' && !STEPPED && RC.kind === kind && RC.vid === (v ? v.id : -1) && RC.n++ % 8) { onThigh(1, RC.uL, R.tL); onThigh(-1, RC.uR, R.tR); }
    else if (kind === 'thighs') { // (knees stay on the knees)
      RC.kind = kind; RC.n = 1; RC.vid = v ? v.id : -1;
      const Ls = rig.len.arm[0] + rig.len.arm[1], sL = toL(worldPos(b.lUpper, _rv[2])).clone(), sR = toL(worldPos(b.rUpper, _rv[2])).clone();
      const rho = Math.min(0.9, Math.max(0.8, (R.tL.distanceTo(sL) + R.tR.distanceTo(sR)) / 2 / Ls)), lo = belly > 0 ? 0.42 + belly * 2 : 0.5; // (not up at the hip crease: the fitted thigh starts below it)
      // (and when one hand can't come that close, the other matches it instead)
      let rr = rho;
      for (const [side, out, sh0] of [[1, R.tL, sL], [-1, R.tR, sR]]) { let mn = Infinity; for (let uu = lo; uu <= 0.9; uu += 0.05) { onThigh(side, uu, out); mn = Math.min(mn, out.distanceTo(sh0) / Ls); } rr = Math.max(rr, mn); }
      for (const [side, out, sh0, u0] of [[1, R.tL, sL, uL], [-1, R.tR, sR, uR]]) {
        let bu = u0, be = Infinity;
        for (let uu = lo; uu <= 0.9; uu += 0.05) { onThigh(side, uu, out); const e = Math.abs(out.distanceTo(sh0) / Ls - rr) + 0.05 * Math.abs(uu - u0); if (e < be) { be = e; bu = uu; } }
        onThigh(side, bu, out);
        if (side > 0) RC.uL = bu; else RC.uR = bu;
      }
    }
    if (uL > 0.7) R.pL.set(0.22, -0.85, -0.3); // (reaching the knee: the elbow down by the side, not out: an arm out and down is the bind pose's line)
    if (uR > 0.7) R.pR.set(-0.22, -0.85, -0.3);
    const one = (sideTgt, sidePole) => { if (sd > 0) { R.tL.copy(sideTgt); if (sidePole) R.pL.copy(sidePole); } else { R.tR.copy(sideTgt).setX(-sideTgt.x); if (sidePole) R.pR.copy(sidePole).setX(-sidePole.x); } };
    if (kind === 'clasped') {
      const m = _rv[0].copy(R.tL).add(R.tR).multiplyScalar(0.5);
      // (a deep belly: the clasped hands further along the thighs, so the forearms pass in front of it, not through)
      const fr = fit.front ? fit.front.spine || fit.front.pelvis || 0 : 0;
      m.z += Math.max(0, fr - 0.13) * 1.6;
      // (centred on the chest, not between the knees: legs spread unevenly or a turned body put it to one side)
      { const cL = toL(worldPos(b.lUpper, _rv[2])).x, cR = toL(worldPos(b.rUpper, _rv[3])).x; m.x += ((cL + cR) / 2 - m.x) * 0.6; }
      // one hand over the other, both clear of the thighs (the fingers curl down onto them)
      if (v) { m.x += v.cx; m.z += v.cz; } // (rest-v2: a little to one side, nearer the knees or the belly)
      if (v && v.top < 0) { R.tR.copy(m).add(_rv[1].set(-0.035, 0.06, 0.035)); R.tL.copy(m).add(_rv[1].set(0.035, 0.022, 0.015)); } // (rest-v2: the right hand on top)
      else { R.tL.copy(m).add(_rv[1].set(0.035, 0.06, 0.035)); R.tR.copy(m).add(_rv[1].set(-0.035, 0.022, 0.015)); } // (resting on the lap, not held above it)
      R.pL.set(0.9, -0.45, -0.4); R.pR.set(-0.9, -0.45, -0.4);
    } else if (kind === 'folded') {
      // in front of the belly's own surface (the middle spine section), one forearm over the other
      const sec = fit.torso.find((x) => x.key === 'spine') || fit.torso[Math.min(1, fit.torso.length - 1)], r = fit.foreR[0];
      const f = surf(sec, 0.72, FWD, _rv[0]); // the lower chest (the spine section reaches up to the chest's)
      // each hand tucked against the other upper arm, the forearms across the front of the belly (the elbows forward,
      // so the whole forearm lies in front of the surface, not through the flank)
      R.tL.set(f.x - 0.165, f.y - 0.03, f.z + r + 0.02); R.tR.set(f.x + 0.165, f.y + 0.06, f.z + r + 0.05);
      R.pL.set(0.25, -0.65, 0.72); R.pR.set(-0.25, -0.65, 0.72);
    } else if (kind === 'chin') {
      const c = rig.ride(b.head, 0, -0.135, 0.085, _rv[0]);
      one(_rv[1].copy(c), _rv[2].set(0.1, -1, 0.65)); // the elbow down and forward, towards the knee
    } else if (kind === 'chairBack') {
      one(_rv[0].set(0.33, sh + 0.3, -0.3), _rv[1].set(1, -0.25, -0.6));
      R.back = sd > 0 ? 0 : 1;
    } else if (kind === 'tableOne') {
      // (out of reach, as when the body turns to a heckler: that hand stays on its thigh rather than hover short of the table)
      const tp = _rv[0].set(sd > 0 ? 0.16 : -0.16, 0.775, 0.38), shT = toL(worldPos(sd > 0 ? b.lUpper : b.rUpper, _rv[2]));
      // (and with room to spare, 92% of the arm: a talker's turn or a lean moves the shoulder after this is placed)
      if (tp.distanceTo(shT) <= 0.92 * (rig.len.arm[0] + rig.len.arm[1])) one(_rv[0].set(0.16, 0.81, 0.38), _rv[1].set(0.5, -1, -0.3));
    } // on the table's near edge, towards its middle
    else if (kind === 'glass') { one(_rv[0].set(0.15, 0.8, 0.37), _rv[1].set(0.6, -1, -0.2)); R.roll = sd; }
    else if (kind === 'forearmsTable') { const z = 0.21 + (rig.len.arm[0] + rig.len.arm[1] - 0.49); R.tL.set(0.12, 0.805, z); R.tR.set(-0.12, 0.805, z); R.pL.set(0.4, -1, -0.2); R.pR.set(-0.4, -1, -0.2); }
    // (both hands on the table's top, relaxed, a hand's width apart, the palms 6 cm over it; as far ahead as the arm
    // reaches with the elbows well bent: 20 cm ahead of the seat for an arm of 49 cm, more for a longer one)
    else if (kind === 'tableBoth') { const z = 0.2 + (rig.len.arm[0] + rig.len.arm[1] - 0.49); R.tL.set(0.14, 0.81, z); R.tR.set(-0.14, 0.81, z - 0.01); R.pL.set(0.5, -1, -0.3); R.pR.set(-0.5, -1, -0.3); }
    // (life-v1: each person's own variant of the pose, one hand a little ahead of the other, in or out; never the same
    // pair of hands down a row. On a table's top the fit below keeps them on it and clear of the glasses)
    if (!LIFE_OFF.hands && !LIFE_OFF.restvar && this.restVar && !this.force && kind !== 'clasped' && kind !== 'folded' && kind !== 'chin' && kind !== 'chairBack') {
      const V = this.restVar, k = /^table|^forearms/.test(kind) ? (this.o.table && this.o.neighbour ? 0 : 0.6) : 1; // (a two-top's planted hands are fitted to its top and its glasses: there each hand varies by its roll only)
      R.tL.z += V.zL * k; R.tR.z += V.zR * k; R.tL.x += V.xL * k; R.tR.x -= V.xR * k;
      if (v && k > 0 && k < 1) { const kv = 0.6, zc = (z, dz) => Math.max(-0.06, Math.min(0.06, z + dz)) - z; R.tL.z += zc(V.zL * k, v.zL * kv); R.tR.z += zc(V.zR * k, v.zR * kv); R.tL.x += v.xL * kv; R.tR.x -= v.xR * kv; } // (rest-v2: on a table's top, this rest's own placement on top of the person's, the fit below keeping it on the top and clear of the glasses)
    }
    // (at a two-top, hands on the table are fitted to the table itself (venue.js cabaretTables): on its top, and 5 cm
    // clear of the two glasses and the candle jar)
    // (and, once fitted, kept: a hand planted on the top stays where it was put for as long as that rest lasts, the
    // body moving about it, a laugh, a turn, a clap and back; refitted once the rest has been off for half a second)
    const PC = /^(tableBoth|forearmsTable)$/.test(kind) && this.o.table && this.o.neighbour ? ((this._pc ||= {})[v ? kind + v.id : kind] ||= { tL: new THREE.Vector3(), tR: new THREE.Vector3(), at: -9 }) : null;
    const nowT = this._laT ?? 0;
    if (PC && nowT - PC.at < 0.5 && nowT >= PC.at) { R.tL.copy(PC.tL); R.tR.copy(PC.tR); PC.at = nowT; }
    else if (/^(tableBoth|tableOne|forearmsTable)$/.test(kind) && this.o.table && this.o.neighbour && this.src) {
      const s0 = this.src, tc = tableOf(s0, this.o.neighbour, _rv[8]); // (venue.js cabaretTables)
      const things = [[-0.32, 0.11, 0.036], [0.32, 0.10, 0.041], [0.01, -0.06, 0.045]]; // (venue.js: a glass on each sitter's outer side of the rim, beside the hands, the candle jar in the middle)
      const tcL = toL(_rv[9].copy(tc));
      for (const t of [R.tL, R.tR]) {
        if (t.y < 0.77) continue; // (a hand this pose keeps off the table)
        // each hand ahead of its own shoulder, as the pose has it, and on the top: a hand beyond its edge (the pair sit
        // either side of it) slides across, in front of the body, to 8 cm inside the rim; then 5 cm clear of the glasses
        // and the jar. (Never drawn along the line to the table's middle: that reaches the arm out straight, and the
        // rules that keep the forearms apart then lift or swing a hand off its place, frame to frame)
        const m = TABLE_R - 0.08, dz0 = Math.max(-m * 0.8, Math.min(m * 0.8, t.z - tcL.z)), hw = Math.sqrt(m * m - dz0 * dz0);
        t.z = tcL.z + dz0; t.x = tcL.x + Math.max(-hw, Math.min(hw, t.x - tcL.x));
        // (a hand that would cross the body's middle to get onto the top goes further in instead, where the top is
        // wider, back towards its own side: an outer hand pulled across tucks its elbow behind the body)
        { const own = t === R.tL ? 1 : -1;
          if (own * t.x < 0.03) { const z2 = Math.max(t.z, tcL.z - 0.2), d2 = z2 - tcL.z, hw2 = Math.sqrt(Math.max(0, m * m - d2 * d2)); t.z = z2; t.x = clamp(own * 0.1, tcL.x - hw2, tcL.x + hw2); } }
        const w = rig.seat.localToWorld(_rv[6].copy(t));
        let dx = w.x - tc.x, dz = w.z - tc.z;
        // (on this sitter's own half of the top, 7 cm clear of the line between the two: the tablemate's hands keep
        // to theirs, and the rule that keeps neighbours' hands apart doesn't move either)
        { const own = Math.sign(s0.x - tc.x) || 1; if (own * dx < 0.07) dx = own * 0.07; }
        // (the wrist 5 cm and a hand's length, 9 cm, clear of the glasses and the jar: the fingers may lie any way on
        // the top, the wrist's own limits turn them)
        for (let k = 0; k < 4; k++) for (const [ox, oz, r] of things) for (const f of [0]) {
          const ex = dx - ox, ez = dz - oz, e = Math.hypot(ex, ez), need = r + 0.05 + 0.09;
          if (e < need && e > 1e-4) { dx += (ex / e) * (need - e); dz += (ez / e) * (need - e); }
        }
        { const d = Math.hypot(dx, dz), m2 = TABLE_R - 0.06; if (d > m2) { dx *= m2 / d; dz *= m2 / d; } }
        t.copy(toL(_rv[6].set(tc.x + dx, (s0.y || 0) + 0.81, tc.z + dz)));
        // (within 74% of the arm's reach, the elbow well bent, with room for a laugh's lean back: slid on the top towards the shoulder, never off it nor
        // into the belly; an arm at the end of its reach is drawn in below and its hand then follows every shrug. The
        // shoulder as it has been over the last second or so, so a laugh's bounce doesn't carry the hand about)
        const si = t === R.tL ? 0 : 1, E = (this._shE ||= [new THREE.Vector3(), new THREE.Vector3(), 0]), S = toL(worldPos(si ? b.rUpper : b.lUpper, _rv[4]));
        if (!(E[2] & (1 << si))) { E[si].copy(S); E[2] |= 1 << si; } else E[si].lerp(S, 0.06);
        const len = 0.74 * (rig.len.arm[0] + rig.len.arm[1]), Sh = E[si];
        if (t.distanceTo(Sh) > len) {
          const hx = Sh.x - t.x, hz = Sh.z - t.z, hn = Math.hypot(hx, hz) || 1, ux = hx / hn, uz = hz / hn;
          // |t + s u - Sh|^2 = len^2 (u horizontal): s = hn - sqrt(len^2 - dy^2), when that has a root
          const dy = Sh.y - t.y, h2 = len * len - dy * dy;
          let s1 = h2 > 0 ? hn - Math.sqrt(h2) : hn;
          // (not off the top, nor nearer than 13 cm ahead of the seat: the belly)
          for (let k = 0; k < 2; k++) {
            const nx = t.x + ux * s1, nz = t.z + uz * s1;
            if (nz < 0.13) s1 = Math.max(0, (0.13 - t.z) / Math.min(-1e-3, uz));
            const ex = t.x + ux * s1 - tcL.x, ez = t.z + uz * s1 - tcL.z;
            if (Math.hypot(ex, ez) > TABLE_R - 0.05) s1 *= 0.8;
          }
          t.x += ux * Math.max(0, s1); t.z += uz * Math.max(0, s1);
        }
      }
      // (and the two hands a forearm's width apart, 15 cm: the hand on the table's side moves on along it. Two hands
      // side by side there crossed the forearms, and the rule that lifts one clear lifted either, by turns)
      const gap = kind === 'forearmsTable' ? 0.19 : 0.15; // (forearms on the top converge on the wrists: wider)
      if (R.tL.y >= 0.77 && R.tR.y >= 0.77 && Math.hypot(R.tL.x - R.tR.x, R.tL.z - R.tR.z) < gap) {
        if (tcL.x > 0) R.tL.x = R.tR.x + Math.sqrt(Math.max(0, gap * gap - (R.tL.z - R.tR.z) ** 2));
        else R.tR.x = R.tL.x - Math.sqrt(Math.max(0, gap * gap - (R.tL.z - R.tR.z) ** 2));
      }
      // (and within the sitter's own place, 25 cm either side of the seat's middle: keepHandsOut's rule, which would
      // otherwise draw a planted hand in by turns)
      for (const t of [R.tL, R.tR]) if (t.y >= 0.77) t.x = clamp(t.x, -0.25, 0.25);
      // (a forearm's width apart still: the other hand, away from the table's side, comes in instead)
      if (R.tL.y >= 0.77 && R.tR.y >= 0.77 && Math.hypot(R.tL.x - R.tR.x, R.tL.z - R.tR.z) < gap - 0.005) {
        const w2 = Math.sqrt(Math.max(0, gap * gap - (R.tL.z - R.tR.z) ** 2));
        if (tcL.x > 0) R.tR.x = R.tL.x - w2; else R.tL.x = R.tR.x + w2;
      }
      // (and the glasses and the jar have the last word: whatever the steps above did, a wrist a hand's length clear)
      for (const t of [R.tL, R.tR]) {
        if (t.y < 0.77) continue;
        const w = rig.seat.localToWorld(_rv[6].copy(t));
        let dx = w.x - tc.x, dz = w.z - tc.z;
        for (let k = 0; k < 4; k++) for (const [ox, oz, r] of things) { const ex = dx - ox, ez = dz - oz, e = Math.hypot(ex, ez), need = r + 0.05 + 0.09; if (e < need && e > 1e-4) { dx += (ex / e) * (need - e); dz += (ez / e) * (need - e); } }
        t.copy(toL(_rv[6].set(tc.x + dx, (s0.y || 0) + 0.81, tc.z + dz)));
      }
      if (PC) { PC.tL.copy(R.tL); PC.tR.copy(R.tR); PC.at = nowT; }
    }
    // (a target the arm can't reach, as when a talker turns away from that side: drawn in to 95% of the arm along its
    // line, so the hand rests short of it instead of stretching for it with the fingers driven into the leg)
    { const Ls = 0.95 * (rig.len.arm[0] + rig.len.arm[1]);
      // (a hand planted on a table's top: from the shoulder as it has been of late, above, so a shrug or a turn of the
      // body doesn't draw it about the top)
      const planted = /^(tableBoth|forearmsTable)$/.test(kind) && this._shE && this.o.table;
      for (const [t, up, si] of [[R.tL, b.lUpper, 0], [R.tR, b.rUpper, 1]]) { const sh0 = planted ? _rv[2].copy(this._shE[si]) : toL(worldPos(up, _rv[2])), d = t.distanceTo(sh0); if (d > Ls) t.lerp(sh0, 1 - Ls / d); } }
    return R;
  }

  /** The walk capture whose own pace is nearest this person's (played by distance, so the feet stay planted). */
  walkFor(speed) {
    const C = this.clips();
    if (C._walk && C._walkV === speed) return C._walk;
    let best = C.walks[0], bd = Infinity;
    C.walks.forEach((c, i) => { const d = Math.abs(c.speed - speed) + hash(this.seed + i * 3.3) * 0.12; if (d < bd) { bd = d; best = c; } });
    C._walkV = speed;
    return (C._walk = best);
  }
  /** The fidget (if any) under way at `now`: a seeded schedule, each event fired or not by the state when it starts. */
  fidgetAt(now, room, C) {
    const F = this.fidgets;
    let lo = 0, hi = F.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= now) lo = m; else hi = m - 1; }
    for (let j = lo; j >= Math.max(0, lo - 3); j--) {
      const ev = F[j];
      if (ev.t > now) continue;
      let d = this._fdec.get(j);
      if (d === undefined) {
        const dead = room.murmur > 0.5 || (room.deadBits || 0) >= 2, social = room.mode === 'preview' || room.mode === 'after';
        let lam = social ? 0.06 : (LIFE_OFF.fidget ? 0.012 : 0.02) + 0.08 * clamp01(room.murmur) + 0.015 * Math.min(room.deadBits || 0, 3) + 0.03 * (1 - (room.attention ?? 0.6)); // (listening: hands mostly at rest)
        lam *= this.temper === 'shy' ? 1.3 : this.temper === 'talker' ? 1.15 : 1;
        d = null;
        if (ev.u < lam / 0.22) {
          const tw = TEMPER_FIDGET[this.temper] || {};
          const list = (dead ? FIDGETS.dead : social ? FIDGETS.social : LIFE_OFF.fidget ? FIDGETS.listen : FIDGETS.listenLife).map(([n, w]) => [n, w * (tw[n] || 1)]);
          const names = family(pick(list, ev.k), C.g);
          const nm = names.length ? names[Math.floor(hash(this.seed + j) * names.length)] : null;
          d = nm ? ANIM.clips[nm] : null;
          if (d) d._n = nm;
        }
        this._fdec.set(j, d);
        if (this._fdec.size > 48) this._fdec.delete(this._fdec.keys().next().value);
      }
      if (!d) continue;
      const a = now - ev.t;
      if (a < d.dur) { const o = (this._fa ||= { c: null, a: 0, w: 0 }); o.c = d; o.a = a; o.w = smooth(a / 0.5) * smooth((d.dur - a) / 0.6); return o; }
    }
    return null;
  }
  /** Where this person is in their party's conversation at `now`. */
  talkAt(now) {
    const P = this.party;
    if (!P || P.members.length < 2) return null;
    const tl = convo(P);
    let lo = 0, hi = tl.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tl[m].t0 <= now) lo = m; else hi = m - 1; }
    const seg = tl[lo], speaking = now < seg.t1 && seg.sp === this.pk;
    const speaker = now < seg.t1 ? P.members[seg.sp] : null;
    const out = (this._tka ||= { speaking: false, speaker: null, laugh: 0, nod: 0, seg: null });
    // a listener laughs (or a sceptic smirks) at the end of some turns, and nods inside long ones
    let laugh = 0, nod = 0;
    for (let j = lo; j >= Math.max(0, lo - 1); j--) {
      const g = tl[j];
      if (g.sp === this.pk) continue;
      const a = now - (g.t1 - 0.35), len = 0.9 + 1.8 * g.v;
      if (g.u < LAUGH_P[this.temper] && a > 0 && a < len) laugh = Math.max(laugh, (0.35 + 0.4 * g.w) * Math.sin(Math.PI * a / len));
      const na = now - (g.t0 + (g.t1 - g.t0) * (0.3 + 0.4 * g.v));
      if (g.t1 - g.t0 > 2 && na > 0 && na < 2) nod = 1 - Math.abs(na - 1);
    }
    out.speaking = speaking; out.speaker = speaker; out.laugh = laugh; out.nod = nod; out.seg = seg;
    return out;
  }

  /**
   * The captured base layer, written onto the bones before the live layers: seated idle (or standing), fidgets,
   * walking by distance, turning, sitting down, standing up, the talker's hand beats, a listener's nods and a laugh's
   * torso. Returns what it did.
   */
  clipBody(now, room, c) {
    const C = this.clips(), rig = this.rig;
    // (the single-avatar check view sets loco by hand: walk by time there)
    const lo = this.loco;
    const T = c.T || (lo && lo.walk ? { walk: 1, dist: (lo.phase || 0) + 0 * now, speed: 1.15 } : lo && lo.stand > 0.5 ? (this._lt ||= { stand: 1, front: 1 }) : null);
    const pose = (this._pose ||= newPose()), A = (this._pa ||= newPose()), B = (this._pb ||= newPose());
    this._fidW = 0;
    const t = now * this.clipRate + this.clipT;
    sample(this.o.stand ? C.standBase : C.seat, t, pose);
    let seated = this.o.stand ? 0 : 1, walking = 0, inPlace = true;
    const fit = (P, c) => { const o = ANIM.NB * 4 + 2; P[o] *= (T && T.off ? T.off : STAND_OFF) / Math.max(0.2, c.standZ || STAND_OFF); }; // (an ovation stands closer to the seat)
    if (T && !T.hidden) {
      inPlace = false;
      if (T.walk) { const w = this.walkFor(T.speed || 1.15); sampleCycle(w, T.dist / w.stride, pose); seated = 0; walking = 1; }
      else if (T.turn !== undefined) {
        const w = this.walkFor(1.1), k = smooth(T.turn);
        sampleCycle(w, T.dist / w.stride, A);
        if (room.mode === 'after') { sample(C.rise, C.rise.dur, B); B[ANIM.NB * 4 + 2] = 0; mix(B, A, k, pose); }
        else { sample(C.sit, 0, B); B[ANIM.NB * 4 + 2] = 0; mix(A, B, k, pose); }
        seated = 0; walking = 1;
      } else if (this.o.stand) { /* people who always stand (the rail) never sit down or get up */ }
      else if (T.sit !== undefined) {
        sample(C.sit, T.sit * C.sit.dur, A); fit(A, C.sit);
        mix(A, pose, smooth((T.sit - 0.8) / 0.2), pose);
      } else if (T.rise !== undefined) {
        sample(C.rise, T.rise * C.rise.dur, A); fit(A, C.rise);
        mix(pose, A, smooth(T.rise / 0.15), pose);
      } else if ((T.front || T.stand) && !this.o.stand) { sample(C.rise, C.rise.dur, pose); fit(pose, C.rise); }
    }
    // fidgets: only while sitting in the seat with nothing else to do
    if (inPlace && !this.o.stand && !REST_FORCE) {
      const f = this.fidgetAt(now, room, C);
      // (not while a neighbour within reach is up and about: the hands stay in)
      const passing = !!(this.near && this.near.some((q) => q.src && q.src._loco && !q.src._loco.hidden));
      const free = (1 - clamp01(c.lb * 3 + c.clapW * 3 + c.upW * 3 + c.busyW * 1.5)) * (passing ? 0 : 1);
      this._fidW = f && free > 0 ? f.w * free : 0;
      if (f && free > 0) {
        sample(f.c, f.a, A);
        // (the hips and legs stay the seat's: a capture's actor swivels on the chair to look round, and the knees then
        // swing round off the seat)
        const LG = (Person._legI ||= ANIM.bones.map((n, i) => (/Bip01$|Pelvis|Thigh|Calf|Foot|Toe/.test(n) ? i : -1)).filter((i) => i >= 0));
        for (const i of LG) for (let q = 0; q < 4; q++) A[i * 4 + q] = pose[i * 4 + q];
        for (let q = 0; q < 3; q++) A[ANIM.NB * 4 + q] = pose[ANIM.NB * 4 + q];
        mix(pose, A, f.w * free, pose);
      }
    }
    // talking: the speaker's hand beats and head; listeners nod now and then
    const tk = c.talk;
    if (tk && c.W.talk > 0.01 && C.talk) {
      // (a standing capture's beats on a seated body: half strength, or its side bends become a hard lean over the chair)
      if (tk.speaking) { sample(C.talk, t * 1.1, A); addLayer(pose, A, C.talkRef, c.W.talk * (walking ? 0.4 : seated ? 0.5 : 1), pose, seated && this.o.table && this.o.neighbour && !RAW ? MASK.head : MASK.talk); } // (at a two-top the talk is the head's and the beat gesture's: the capture's arms pulled the hands off the top, one arm straight, the other's elbow behind)
      else if (tk.nod > 0 && C.nod) { sample(C.nod, tk.nod * Math.min(2, C.nod.dur), A); addLayer(pose, A, C.nodRef, c.W.talk * Math.sin(Math.PI * tk.nod), pose, MASK.head); }
    }
    // a laugh's torso and head (the hands keep the gesture vocabulary, driven by the room's envelope)
    if (c.lb > 0.02 && c.L) {
      // this laugh's take: which capture (chuckle, laugh or big laugh, this gender's or the other's), from where in it,
      // at what speed and size, and mirrored or not
      const Tk = c.L.take, w = Math.min(1, c.lb * 1.1) * (0.7 + 0.22 * clamp01((c.lb - 0.55) / 0.35)) * (Tk ? 0.6 + 0.5 * Tk.amp : 1) * (seated && this.o.table && this.o.neighbour && !RAW ? (LIFE_OFF.laugh ? 0.8 : 0.95) : 1); // (a big one rocks the body more; at a two-top, forearms on its top, less: the capture's rock back pulled the planted arms straight)
      let fadeIn = 1;
      if (SMOOTH) {
        // (laugh-v2: a new laugh's capture cross-fades from the one playing over 0.8 s, never a cut between two takes)
        const id = c.L.id;
        if (id !== this._lxId) { if (this._lxW > 0.02) this._lxOld = { Tk: this._lxTk, reach: this._lxReach, t0: this._lxT0, w: this._lxW, at: now }; this._lxId = id; }
        const O = this._lxOld;
        if (O) { const f = now < O.at ? 1 : smooth((now - O.at) / 0.8); if (f >= 1) this._lxOld = null; else { fadeIn = f; this.laughLayer(pose, A, C, O.Tk, O.reach, now - O.t0, O.w * (1 - f), rig); } }
        this._lxTk = Tk; this._lxReach = c.L.reach; this._lxT0 = now - c.L.t; this._lxW = w;
      }
      this.laughLayer(pose, A, C, Tk, c.L.reach, c.L.t, w * fadeIn, rig);
    } else this._lxW = 0;
    applyPose(rig, pose);
    rig.model.position.set(0, seated ? this.o.seatH - CHAIR_H : 0, seated ? CHAIR_Z : 0);
    rig.additive = true;
    return { walking, seated };
  }

  /** A posture angle low-passed by this frame's factor (_fE, set in update; laugh-v2). */
  _lp(k, v) {
    const P = (this._fP ||= {}), o = P[k];
    return (P[k] = o === undefined || this._fE >= 1 ? v : o + (v - o) * this._fE);
  }

  /** One laugh capture on the torso (clipBody): the take's capture (chuckle, laugh or big laugh), from its start, at weight w. */
  laughLayer(pose, A, C, Tk, reach, t, w, rig) {
    let k = reach > 0.85 ? 2 : reach > 0.45 ? 1 : 0;
    if (Tk) { if (Tk.band < 0.25) k = Math.max(0, k - 1); else if (Tk.band > 0.8) k = Math.min(2, k + 1); }
    const set = C.laughSet[k], j = Tk && Tk.other && set[1] ? 1 : 0, lc = set[j] || set[0];
    if (!lc || w <= 0) return;
    const ref = C.laughRefs[k][set[j] ? j : 0];
    // (from a moment of the capture near its own mean pose, so the laugh starts from the pose the body is in now and
    // grows out of it, the seeded start only choosing among those moments; quietStart)
    sample(lc, (Tk ? quietStart(lc, ref, Tk.t0 * Math.max(0, lc.dur - 3)) : 0) + t * (Tk ? Tk.rate : 1), A);
    if (Tk && Tk.mirror) addLayerMirror(pose, A, ref, w, pose, MASK.torso, rig); else addLayer(pose, A, ref, w, pose, MASK.torso);
  }

  /** This person's gestures for one reaction: drawn once per reaction, then fixed (stateless in time). */
  gesturesFor(ev, kind, s, vocab, take = null, exclude = '') {
    const ck = `${ev.id}:${kind}:${vocab}`;
    let res = this._gcache.get(ck);
    if (res) return res;
    const R = rng((Math.imul(this.seed | 0, 7919) ^ Math.imul((ev.id | 0) + 13, 104729)) + (vocab === 'stadium' ? 17 : 0));
    const base = (VOCAB[vocab] || VOCAB.club)[kind] || VOCAB.club.laugh;
    const sw = kind === 'laugh' && take ? STYLE_GESTURE[take.style] || {} : {};
    // (a big laugh: the little clap and the hand on the chest give way to the knee; arms up only on a strong finale)
    const big = kind === 'laugh' && s > 0.7 ? { none: 0.45, clapShort: 0.35, chest: 0.6, knee: 1.5, slap: 1.4, mouth: 1.3 } : {};
    const VG = kind === 'laugh' ? (VENUE_LAUGH[this._vplan] || {}) : {}, vg = VG.gestures || {};
    const list = base.map(([g, w]) => [g, w * (sw[g] ?? 1) * (big[g] ?? 1) * (vg[g] ?? 1) * (g === 'armsUp' && vocab === 'club' && s < 0.75 ? 0 : 1) * (this.o.table && (g === 'knee' || g === 'slap' || g === 'clapLow') ? 0 : 1) * ((this.o.row | 0) >= 1 && (g === 'mouth' || g === 'wipe') && !LIFE_OFF.laugh ? 0.25 : 1) * (kind === 'laugh' && this.o.table && this.kind === 'front' && !LIFE_OFF.laugh ? TABLE_LAUGH_G[g] ?? 1 : 1)]); // (life-v1: behind the front row a hand over the face reads as a dark smear at TV distance: mostly the front row's) // (at a table nothing at the table's own height, where a hand comes and goes behind its edge: no slap on it, no low clap, no grab at the knee; their weight goes to the rest)
    if (VG.bigExtra && s > 0.8) for (const e of VG.bigExtra) list.push(e); // (the arena's big laughs: arms up, whistles)
    const mk = (g) => {
      const [a, b] = SHORT[g] || [Infinity, Infinity];
      const base = CLAPS.has(g) ? this.clapHz : g === 'slap' || g === 'knee' ? this.slapHz : g === 'fist' ? 1.3 : g === 'snap' ? 1.9 : 1;
      return { g, on: R() * 0.6, dur: a === Infinity ? Infinity : a + R() * (b - a), amp: 0.6 + R() * 0.5, rate: base * (0.9 + R() * 0.2), phase: R() * 6.283, hand: R() < 0.5 ? 1 : -1, high: R() };
    };
    let first = GESTURE_FORCE || pick(list, R());
    // (never the gesture the neighbour on the left makes in the same beat: they draw first, see respPlan)
    if (!GESTURE_FORCE && exclude && first === exclude && first !== 'none') { const rest = list.filter(([g]) => g !== exclude); if (rest.length) first = pick(rest, R()); }
    const gs = [mk(first)];
    // a big reaction gives some people a second, overlapping gesture (never two claps)
    if (!GESTURE_FORCE && s > 0.55 && first !== 'none' && R() < (s - 0.55) * 1.4) {
      const second = pick(list, R());
      if (second !== first && second !== 'none' && !(CLAPS.has(second) && CLAPS.has(first))) gs.push(mk(second));
    }
    res = { gs, style: take ? take.style : R() < 0.6 ? this.style : STYLES[Math.floor(R() * STYLES.length)] };
    this._gcache.set(ck, res);
    if (this._gcache.size > 40) this._gcache.delete(this._gcache.keys().next().value);
    return res;
  }

  /**
   * This person's take on one laugh: drawn from their seed and the reaction's id (so any frame can be reproduced), and
   * never the same as their previous take: a style, which capture (of six) and from where in it, mirrored or not, its
   * speed (±20%) and size, the rhythm of the bouts, when it peaks, and whether they keep laughing after.
   */
  /** Three to five laugh styles of this person's own (from their temperament's, by their seed), with weights. */
  repertoire() {
    if (this._rep) return this._rep;
    const all = (LAUGH_STYLES[this.temper] || LAUGH_STYLES.plain).slice(), R = rng((Math.imul(this.seed | 0, 2654435761) ^ 0x5bd1e995) | 0), rep = [];
    const n = Math.min(all.length, 3 + Math.floor(R() * 3));
    while (rep.length < n && all.length) { const st = pick(all, R()), i = all.findIndex(([x]) => x === st); rep.push(all[i]); all.splice(i, 1); }
    return (this._rep = rep);
  }
  takeFor(ev) {
    const id = ev.id | 0;
    let T = this._takes.get(id);
    if (T) return T;
    const prev = this._lastTake;
    for (let tries = 0; tries < 5; tries++) {
      const R = rng((Math.imul(this.seed | 0, 1597334677) ^ Math.imul(id + 11 + tries * 131, 40503)) | 0);
      // (from this person's own repertoire of three to five takes, the room's character weighting them, never the style of
      // their previous laugh)
      const VL = VENUE_LAUGH[this._vplan] || VENUE_LAUGH.club, rep = this.repertoire();
      const VS = (LIFE_OFF.laugh && VL.stylesOld) || VL.styles, opts = rep.map(([st, w]) => [st, w * (VS[st] ?? 1) * (prev && prev.style === st && rep.length > 1 ? 0 : 1)]);
      const style = pick(opts.some(([, w]) => w > 0) ? opts : rep, R());
      T = {
        id, style, band: R(), other: R() < 0.35, mirror: R() < 0.5, t0: R(), rate: 0.8 + 0.4 * R(), amp: 0.6 + 0.4 * R(),
        hz: this.haHz * (0.88 + 0.24 * R()), boutLen: 0.45 + 0.45 * R(), gap: 0.14 + 0.2 * R(), decay: 0.62 + 0.16 * R(),
        warp: 0.85 + 0.3 * R(), attack: this.attack * (0.8 + 0.4 * R()), keepLag: 0.5 + 1.1 * R(), keepAmp: this.keep * (0.6 + 0.4 * R()),
        thetaJ: (R() - 0.5) * 0.16, phase: R() * 6.283, variant: Math.floor(R() * 3),
      };
      T.sig = `${T.style}:${Math.floor(T.band * 3)}:${T.other}:${T.mirror}`;
      if (!prev || T.sig !== prev.sig) break;
    }
    this._takes.set(id, T);
    this._lastTake = T;
    if (this._takes.size > 24) this._takes.delete(this._takes.keys().next().value);
    return T;
  }

  /**
   * This person's response to one reaction. Demo events carry {t, s}; host events also carry levelAt(age), the
   * engine's own envelope (rise, the venue's hold, the kind's tail) as measured. Who laughs follows the measured
   * strength through each person's threshold (below it, a smile at most). When: their reaction time, plus the laugh
   * spreading from where it started in the room to the neighbours, front rows first. How: their take (above), so the
   * room peaks at different moments, laughs in bouts, settles, and some keep going after.
   */
  response(ev, now, spread = 0.11, vocab = 'club', venue = this._venue || '') {
    const kind = ev.kind || 'laugh';
    if (kind === 'silence' || kind === 'murmur' || kind === 'heckle') return null;
    // the plan for this reaction (take, threshold, delay, gestures) is made once; each frame only reads the levels,
    // into the plan's own result object: nothing is allocated per frame (the TV's cores collect garbage slowly)
    const id = ev.id | 0;
    let c = this._rc.get(id);
    if (!c || c.kind !== kind || c.s !== ev.s || c.vocab !== vocab || c.spread !== spread || c.t0 !== ev.t) c = this.respPlan(ev, kind, spread, vocab, id, venue);
    if (c.none) return null;
    const t = now - ev.t - c.delay;
    if (t < -0.2) return null;
    const lv = this.envAt(c, ev, t), reach = c.reach;
    let body = lv * reach, smile;
    if (reach) smile = Math.max(this.envAt(c, ev, t + 0.18), 0.8 * this.envAt(c, ev, t - 0.7), 0.5 * this.envAt(c, ev, t - 1.4)) * Math.max(reach, 0.35);
    else smile = Math.max(this.env0(c, ev, t), 0.8 * this.env0(c, ev, t - 0.7)) * c.smileOnly * 0.55;
    if (kind === 'applause') { body *= 0.3; smile *= 0.6; }
    if (kind === 'cheer') body *= 0.55;
    if (kind === 'snap') { body *= 0.15; smile *= 0.5; }
    if (kind === 'laugh' && c.style === 'nose') body *= 0.3; // a breath through the nose
    const R = c.res, gs = R.gestures;
    gs.length = 0;
    for (let i = 0; i < c.gs.length; i++) {
      const G = c.gs[i];
      if (G.g === 'none') continue;
      const a = t - G.on;
      let w = this.envAt(c, ev, a) * G.amp * (c.together ? 1 : Math.min(1, reach * 1.3));
      if (G.dur !== Infinity) w *= clamp01(1 - (a - G.dur) / 0.35);
      if (w > 0.01) { const o = c.go[i]; o.w = w; o.a = a; gs.push(o); }
    }
    // the bouts: 4–5 "ha"s, a gasp, the next bout a little slower and smaller
    const T = c.T;
    let pulse = 0.5 + 0.5 * Math.sin(t * T.hz * 6.283 + T.phase), bout = 1;
    if (kind === 'laugh') {
      const u = t - T.attack * 0.5;
      let start = 0, len = T.boutLen, k = 0;
      while (u > start + len + T.gap && k < 14) { start += len + T.gap; len *= 1.12; k++; }
      const inB = u - start;
      if (u < 0) { pulse = SMOOTH ? 0.45 : 0.5; bout = 0.6; }
      else if (inB > len) { pulse = SMOOTH ? 0.45 : 0.3; bout = 0.45; } // the gasp between bouts
      else { pulse = SMOOTH ? 0.45 + 0.45 * Math.sin(6.283 * T.hz * inB) * smooth(inB / 0.12) * smooth((len - inB) / 0.12) : 0.5 + 0.5 * Math.sin(6.283 * T.hz * inB); bout = 0.55 + 0.45 * Math.pow(T.decay, k) * smooth(inB / 0.2) * smooth((len - inB) / 0.2); } // (each bout eases in and out over 0.2 s: no snap of the body between them) (laugh-v2: nor of the mouth: each "ha" fades in and out at the bout's edges)
    }
    R.body = body * (kind === 'laugh' ? (SMOOTH ? 0.88 : 0.75 + 0.25 * bout) : 1); // (laugh-v2: the bouts are the mouth's and the voice's, not a pumping of the whole body) R.smile = smile; R.t = t; R.pulse = pulse; R.bout = bout;
    return R;
  }

  /**
   * This person's draw for one laugh's cast, 0..1 (lower laughs sooner): their own per-laugh number, shifted by
   * temperament, up after a big laugh of theirs in the last 30 s (they smile this time), down when their friend beside
   * them is drawn in, in a room of pairs.
   */
  castU(id, t, VL) {
    const own = (q) => clamp01(hash(q.seed * 1.31 + id * 7.13 + 0.5) + ({ laugher: -0.2, talker: -0.07, plain: 0, shy: 0.08, sceptic: 0.24 }[q.temper] || 0));
    let u = own(this);
    if (this._bigAt !== undefined && t - this._bigAt > 0.5 && t - this._bigAt < 30) u = clamp01(u + 0.22);
    const mate = this.rowL || this.rowR;
    if (VL.pair && mate && mate.seed !== undefined && own(mate) < 0.35) u = clamp01(u - VL.pair);
    return u;
  }
  /** Make (once per reaction) everything about this person's response that does not change from frame to frame. */
  respPlan(ev, kind, spread, vocab, id, venue = this._venue || '') {
    const s = ev.s, jitter = hash(this.seed * 3.1 + id * 7.7), together = kind === 'applause' || kind === 'cheer';
    this._vplan = venue;
    const T = this.takeFor(ev), theta = clamp01(this.theta + T.thetaJ), VL = VENUE_LAUGH[venue] || VENUE_LAUGH.club;
    let reach, smileOnly = 0;
    if (together) reach = clamp01(0.55 + s * 0.6 + (this.eager - 0.5) * 0.4) * (s >= theta * 0.6 ? 1 : 0.4);
    else if (kind === 'laugh') {
      // a fresh cast for every laugh (laughs-v1): who laughs out loud is drawn per laugh, weighted by temperament, so
      // the same people don't lead every laugh; someone who just laughed hard tends to smile the next time; in a room
      // of pairs a friend laughing makes it likelier. The share follows the measured strength (castShare).
      const f = castShare(s, venue), u = this.castU(id, ev.t, VL);
      reach = u < f ? clamp01(0.35 + ((f - u) / Math.max(0.15, f)) * 0.75 + (this.eager - 0.5) * 0.15 - this.o.row * 0.025) : 0;
      if (!reach && u < f + 0.3) smileOnly = 1 - (u - f) / 0.3;
      if (reach && this.kind === 'front' && !LIFE_OFF.laugh) reach = Math.max(reach, 0.4 + 0.45 * s); // (round 10-11: a front-row laugh reads at TV distance: whoever is cast laughs at least as hard as the measured strength says, 0.8 at 0.9)
      if (reach > 0.75) this._bigAt = ev.t;
      if (this._tallied !== id) { this._tallied = id; castTally(id, reach > 0.02); }
    } else {
      reach = s >= theta ? clamp01(0.3 + ((s - theta) / Math.max(0.2, 1 - theta)) * 0.85 + (this.eager - 0.5) * 0.15 - this.o.row * 0.025) : 0;
      if (!reach && s > theta - 0.25) smileOnly = 1 - (theta - s) / 0.25;
    }
    const sp = laughSeed(id), dx = this.o.x - sp.x, dr = (this.o.row - sp.row) * 0.95, dist = Math.sqrt(dx * dx + dr * dr);
    let style = T.style;
    if (kind === 'laugh' && style === 'over' && !(reach > 0.72 && s > 0.62)) style = 'back'; // doubled over only on a big laugh
    if (kind === 'laugh' && style === 'over' && this.o.table && this.o.neighbour && !LIFE_OFF.laugh) style = jitter > 0.5 ? 'back' : 'shake'; // (never folded over a two-top: the head went down into the arms, 'passed out', round 14)
    // (a breath through the nose or a giggle can't carry a big laugh: most of them laugh with the head back, or fold over)
    if (kind === 'laugh' && s > 0.75 && (style === 'nose' || style === 'giggle') && jitter > 0.3) style = jitter > 0.7 ? 'over' : 'back';
    // (and never the style they laughed in last time: when the rules above land on it, the next one their repertoire
    // allows here instead)
    if (kind === 'laugh') {
      if (this._effId !== id) this._effPrev = this._effStyle;
      if (this._effPrev && style === this._effPrev) {
        const ok = (st) => st !== this._effPrev && !(st === 'over' && (!(reach > 0.72 && s > 0.62) || (this.o.table && this.o.neighbour && !LIFE_OFF.laugh))) && !(s > 0.75 && (st === 'nose' || st === 'giggle'));
        const alt = this.repertoire().map(([st]) => st).find(ok) || ['back', 'shake', 'turn', 'giggle'].find(ok);
        if (alt) style = alt;
      }
      this._effId = id; this._effStyle = style;
    }
    // the row neighbour on the left plans this reaction first (it's cached for when its own turn comes), so the two of
    // them never make the same gesture in the same beat
    let ex = '';
    const Lp = this.rowL;
    if (reach && Lp && Lp.rig && Lp._rc) {
      let lc = Lp._rc.get(id);
      if (!lc || lc.kind !== kind || lc.s !== ev.s || lc.vocab !== vocab || lc.spread !== spread || lc.t0 !== ev.t) lc = Lp.respPlan(ev, kind, spread, vocab, id, venue);
      ex = lc.gs.length ? lc.gs[0].g : '';
    }
    const gs = reach ? this.gesturesFor(ev, kind, s, vocab, { style }, ex).gs : [];
    const c = {
      kind, s, vocab, spread, t0: ev.t, together, T, style, reach, smileOnly, none: reach <= 0.02 && smileOnly <= 0.02,
      delay: this.rt + dist * 0.085 * (1.2 - 0.5 * s) + this.o.row * spread * 0.5 * (1.25 - s) * (kind === 'laugh' ? VL.rowRipple : 1) + jitter * 0.08 + (ev.delayFor ? ev.delayFor(this) : 0),
      k: 1 / Math.max(s, 0.05), hold: (ev.hold || 0.5 + 1.5 * s * Math.max(reach, 0.3)) + this.eager * 0.4, tail: ev.tail || 0.65,
      gs, go: gs.map((G) => ({ g: G.g, w: 0, rate: G.rate, phase: G.phase, hand: G.hand, high: G.high, a: 0 })),
    };
    // (life-v1: in the front rows a laugh lands on everyone within 0.1-0.6 s of the measured moment, each at their own
    // delay, the order kept: the spread and the row ripple squeezed, not shuffled; the attack no slower than 0.35 s)
    if (kind === 'laugh' && this.kind === 'front' && !LIFE_OFF.onset) { const span = SMOOTH ? (venue === 'theatre' ? 1.1 : 0.8) : venue === 'theatre' ? 0.85 : 0.5; c.delay = (SMOOTH ? 0.15 : 0.1) + span * (1 - Math.exp(-Math.max(0, c.delay - 0.1) / 0.45)) + (venue === 'theatre' ? 0.2 * jitter : 0); } // (the theatre's polite ripple: 0.1-1.1 s, never a step of mouths at once, round 13)
    c.res = { reach, smileOnly, body: 0, smile: 0, t: 0, jitter, style, gestures: [], kind, id, take: T, pulse: 0.5, bout: 1 };
    this._rc.set(id, c);
    if (this._rc.size > 16) this._rc.delete(this._rc.keys().next().value);
    return c;
  }
  /** The room's envelope for this reaction at age a (the engine's measured level, or the demo's trapezoid). */
  env0(c, ev, a) {
    if (ev.levelAt) { const v = ev.levelAt(a) * c.k; return v < 0 ? 0 : v > 1 ? 1 : v; }
    return a < 0 ? 0 : a < c.hold ? smooth(a / 0.3) : Math.exp(-(a - c.hold) / c.tail);
  }
  /** …on this person's own timing: a little earlier or later, their own attack, and an afterglow. */
  envAt(c, ev, a) {
    if (c.together) return this.env0(c, ev, a);
    const T = c.T;
    const at = this.kind === 'front' && !LIFE_OFF.onset ? (SMOOTH ? clamp(T.attack, 0.45, 0.7) : Math.min(T.attack, 0.35)) : T.attack; // (laugh-v2: never a snap into a laugh: 0.45-0.7 s, then the level's own easing)
    return Math.max(this.env0(c, ev, a * T.warp) * smooth(a / at), T.keepAmp * this.env0(c, ev, (a - T.keepLag) * T.warp) * 0.7);
  }

  /** A response boiled down for the shader-animated instances: clap amount and rate, arm up, calling out. */
  static summary(r, out = { clap: 0, rate: 2.4, cheer: 0, vocal: 0, low: 0, variant: 0, amp: 1, phase: 0 }) {
    out.clap = 0; out.rate = 2.4; out.cheer = 0; out.vocal = 0; out.low = 0; out.variant = 0; out.amp = 1; out.phase = 0;
    if (!r) return out;
    // the instanced laugh (instances.js MOVES): 0 a chuckle, 1 a laugh, 2 a big laugh, by this take's style
    if (r.take) { out.variant = r.style === 'nose' ? 0 : r.style === 'back' ? 1 : r.style === 'over' ? 2 : r.take.variant; out.amp = r.take.amp; out.phase = r.take.phase; }
    for (const G of r.gestures) {
      if (CLAPS.has(G.g) || G.g === 'snap') { if (G.w > out.clap) { out.clap = G.w; out.rate = G.rate; out.low = G.g === 'clapLow' ? 1 : 0; } }
      else if (G.g === 'armsUp' || G.g === 'oneArm' || G.g === 'fist') out.cheer = Math.max(out.cheer, G.w * (G.g === 'fist' ? 0.6 : 1));
      else if (G.g === 'whistle' || G.g === 'callout') out.vocal = Math.max(out.vocal, G.w);
    }
    return out;
  }

  update(now, room) {
    const { rig, face } = this;
    const b = rig.b;
    // a person at rest (no reaction reaching them, no clap, gesture, talk, fidget or traffic) is re-posed on their own
    // 5 Hz tick (each a different phase, so the room's work is spread over the frames) and holds the pose in between: its
    // motion is breathing and a slow drift, smoothed by time, not by call. A new reaction or a heckle in the room brings
    // everyone back to every call at once. Someone the last frame's camera didn't see is posed at 3 Hz.
    if (HECKLE_FORCE && !room.heckle) room.heckle = { id: 1, level: 1 };
    this._venue = room.venueId;
    const evk = room.events.length * 2 + (room.heckle ? 1 : 0) + (room.deadBits || 0) * 1000, woke = evk !== this._evk;
    this._evk = evk;
    if (!STEPPED && !this.fresh && !woke && !(this.src && this.src._loco)) {
      const hz = this._off ? 3 : this._calm ? 5 : 0;
      if (hz) { const k = Math.floor(now * hz + (this._ph ??= hash(this.seed * 0.37 + 5))); if (k === this._slot) { this.faceTick(now); return; } this._slot = k; }
    }
    SEC && SEC.start();
    rig.seatChanged();
    if (rig.fit) rig.fit.fresh = false; // (the body is about to be posed: its fitted sections are stale until refreshed below)
    // per-update scratch: a pool of vectors (nothing in this function allocates per frame)
    const VP = (this._vp ||= Array.from({ length: 256 }, () => new THREE.Vector3()));
    let vpi = 0;
    const NV = () => VP[vpi++ % 256];
    const toL = (v) => v.applyMatrix4(rig.inv);
    const o = this.o;
    const sd = this.seed;
    // ---- what the room asks of this person ----
    let L = null;
    let Ls = -1, Lp = null, Lps = -1;
    for (let i = 0; i < room.events.length; i++) {
      const r = this.response(room.events[i], now, room.spread, room.vocab, room.venueId);
      if (!r) continue;
      let sc = r.body + r.smile;
      for (let j = 0; j < r.gestures.length; j++) sc += r.gestures[j].w;
      if (sc > Ls) { Ls = sc; L = r; }
      if (r === this._Lk) { Lp = r; Lps = sc; }
    }
    if (SMOOTH) {
      // (laugh-v2: two laughs overlapping in the room flipped a person between their takes frame by frame; the one they
      // are in is kept until another is clearly bigger)
      if (Lp && L !== Lp && Lps > 0.75 * Ls - 0.03) L = Lp;
      // (and when their laugh leaves the room's list, it is held while its eased level runs out, its capture still playing)
      if (L) { this._Lk = L; this._Lt0 = now - L.t; this._LendT = undefined; }
      else if (this._Lk && (this._lbS || 0) > 0.02) {
        L = this._Lk; if (this._LendT === undefined) { this._LendT = now; this._Lsm = L.smile; }
        L.t = now - this._Lt0; L.body = 0; L.gestures.length = 0; L.smile = (this._Lsm || 0) * Math.exp(-(now - this._LendT) / 0.5);
      } else this._Lk = null;
    }
    const attention = room.attention ?? 0.6, warmth = room.warmth || 0;
    // `force` pins parts of the state (used once at load to bake poses for the shader-animated instances)
    const F = this.force || {};
    const calm = F.still ? 0 : 1;
    const G = {}; // gesture weights and their parameters
    if (L && !OFF.gest) for (const g of L.gestures) if (!G[g.g] || g.w > G[g.g].w) G[g.g] = g;
    if (F.lc) G.clap = { w: F.lc, rate: this.clapHz, phase: 0, hand: 1, high: 0.5 };
    if (F.lu) G.oneArm = { w: F.lu, rate: 1, phase: 0, hand: 1, high: 0.5 };
    if (F.both) G.armsUp = { w: F.both, rate: 1, phase: 0, hand: 1, high: 0.5 };
    const gw = (k) => (G[k] ? G[k].w : 0);
    let lb = F.lb ?? (L ? L.body : 0);
    if (SMOOTH && F.lb === undefined) { // (laugh-v2: the laugh's level eases, in over ~0.3 s a step and out over ~0.5 s: no snap into or out of it)
      const dt = now - (this._lbT ?? -1e9), s0 = this._lbS ?? 0;
      this._lbT = now; this._lbS = dt > 0 && dt < 0.5 ? s0 + (lb - s0) * (1 - Math.exp(-dt / (lb > s0 ? 0.3 : 0.5))) : lb; lb = this._lbS;
    }
    const clapW = Math.max(gw('clap'), gw('clapHigh'), gw('clapLow'), gw('clapShort'));
    const upW = Math.max(gw('armsUp'), gw('oneArm'));
    const vocal = Math.max(gw('whistle'), gw('callout'));
    const ls = F.ls ?? Math.max(L ? L.smile * (1 - 0.5 * vocal) : 0, warmth * 0.3 * calm, room.mode === 'preview' ? 0.25 * calm : 0);
    const mur = room.murmur;
    // each "ha" of this laugh's bouts (a steady rhythm for anything else)
    const ha = F.ha ?? (L && L.kind === 'laugh' && L.pulse !== undefined ? L.pulse : 0.5 + 0.5 * Math.sin(now * this.haHz * 6.283 + sd));
    const restless = 1 + mur * 2.2 + (1 - attention) * 0.5;
    const st = L ? L.style : this.style;
    // loco: standing up, walking, putting a coat on (from the room's traffic, or always standing)
    const lo = this.loco || {};
    const clip = ANIM.ok && !this.force && !!this.rig && this.useClips !== false;
    // a standing ovation (a strong finale) gets some of them up at their seats, when the room's traffic has nothing
    const OV = clip && !(this.src && this.src._loco) && !this.loco ? this.ovationAt(now, room) : null;
    this._ovOn = !!OV;
    const T = (this.src ? this.src._loco || null : null) || OV; // the full traffic state (walk distance, turn, sit, rise)
    const stand = o.stand ? 1 : smooth(Math.max(lo.stand || 0, OV ? OV.stand : 0)), walk = lo.walk || 0, coat = lo.coat || 0;
    const wph = lo.phase || (T && T.dist ? (T.dist / 1.3) * 6.283 : 0); // the procedural fallback: 1.3 m a cycle
    if (this.rig && partiesFor !== REG.length) formParties();
    const tk = this.talkAt(now);
    // during the set a friend's line gets a smile, not a laugh: only the room's drive makes people laugh while the
    // performer is on (the honesty rule); before and after the set, chat laughs are ambience
    if (tk && room.mode === 'live') tk.laugh *= 0.35;
    const Pty = this.party && this.party.members.length > 1 ? this.party : null;

    // idle intent: drift with dead air and dead bits; the preview is all chat, drinks and phones
    let idle = F.idle || this.idle;
    if ((room.mode === 'preview' || (room.mode === 'after' && this.party)) && !F.idle) {
      const c = this.chatty;
      // parties talk among themselves; people on their own check phones and drinks (singles never "talk")
      if (this.party) idle = Pty && Pty.talks ? 'talk' : c < 0.3 ? 'phone' : c < 0.5 ? 'drink' : this.idle === 'folded' ? 'folded' : 'still';
      else idle = c < 0.38 ? 'talk' : c < 0.56 ? 'phone' : c < 0.7 ? 'drink' : this.idle === 'folded' ? 'folded' : 'still';
    } else if (!F.idle) {
      const m = hash(sd * 1.7 + (room.murmurId || 0));
      const drift = clamp01(mur * 1.2) * 0.3 + Math.min(room.deadBits || 0, 4) * 0.03;
      // a whisper in dead air is the whole party's (decided on the party's seed); someone alone reaches for the phone
      const mt = Pty ? hash(Pty.seed * 1.7 + (room.murmurId || 0)) : 1;
      if (mt < drift * 0.9) idle = 'talk';
      else if (m < drift * 0.45) idle = 'phone';
      else if (m < drift * 0.8) idle = 'chin';
    }
    if (this.heckler && room.heckle) idle = 'heckle';
    if (REST_FORCE && (idle === 'folded' || idle === 'chin')) idle = 'still'; // (a check view of one rest pose: the pose itself)
    // (while the set is on and the room is with it, heads stay up at the stage: the phone and the bored chin are dead air's)
    if (room.mode === 'live' && mur < 0.5 && !F.idle && (idle === 'phone' || idle === 'chin')) idle = 'still';
    if (stand > 0.5 && (idle === 'chin' || idle === 'folded')) idle = 'still';
    const moving = T && !T.hidden ? 1 : 0; // walking, turning, sitting down, standing up: the captures have the arms
    const busy = (idle === 'phone' || idle === 'chin' || idle === 'talk' || idle === 'heckle' || idle === 'folded' || idle === 'drink') ? (1 - clamp01(lb * 1.6 + clapW + upW)) * (1 - walk) * (1 - moving) : 0;
    // what the hands are busy with eases in and out over about 0.3 s (no jump to the phone or the chin); a still
    // frame, the first frame and the load-time bakes snap to it
    const W = (this._w ||= { phone: 0, chin: 0, talk: 0, folded: 0, drink: 0 });
    { const dt = now - (this._wT ?? -1e9), e = F.still || !(dt > 0 && dt < 0.5) ? 1 : 1 - Math.exp(-dt / 0.3);
      this._wT = now;
      for (const k in W) W[k] += ((idle === k ? busy : 0) - W[k]) * e; }
    const busyW = Math.min(1, W.phone + W.chin + W.talk + W.folded + W.drink + (idle === 'heckle' ? busy : 0));
    // the captured base layer (seated idle, fidgets, walking, sitting down, standing up, talking, a laugh's torso);
    // everything below adds to it
    if (clip) {
      const cb = (this._cb ||= {});
      cb.T = T; cb.lb = lb; cb.clapW = clapW; cb.upW = upW; cb.busyW = Math.min(1, W.phone + W.chin + W.folded + W.drink); cb.W = W; cb.L = L; cb.talk = tk;
      SEC && SEC.mark('pre'); this.clipBody(now, room, cb); SEC && SEC.mark('clip');
      if (RAW) { // (the capture alone: matrices for the renderer, nothing on top)
        rig.model.updateMatrixWorld(true); this._full = true;
        for (let i = 0; i < rig.skeletons.length; i++) rig.skeletons[i].dirty = true;
        this._calm = false; this._doing = 'raw'; return;
      }
      // standing (the arena's floor), the feet stay under the hips whatever the capture does with them (a laugh steps
      // them back): each ankle within 8 cm behind and 6 cm in front of the pelvis, on its own line; the limbs rules
      if ((o.stand || (OV && stand > 0.9)) && walk < 0.05 && !(T && !T.hidden) && rig.b.lThigh) {
        rig.updChain(rig.b.spine); rig.upd(rig.b.lThigh); rig.upd(rig.b.rThigh);
        const P = toL(worldPos(rig.b.pelvis, NV()));
        for (const [th, ca, ft, bend, s] of [[rig.b.lThigh, rig.b.lCalf, rig.b.lFoot, rig.bend.lLeg, 1], [rig.b.rThigh, rig.b.rCalf, rig.b.rFoot, rig.bend.rLeg, -1]]) {
          const A = toL(worldPos(ft, NV())), z = clamp(A.z, P.z - 0.08, P.z + 0.06);
          if (Math.abs(z - A.z) < 0.005) continue;
          A.z = z;
          rig.solve(th, ca, ft, rig.seat.localToWorld(A), NV().set(s * 0.2, 0, 1).transformDirection(rig.seat.matrixWorld), bend, rig.len.leg);
        }
      }
      // each person's own way of sitting: knees wider or closer, one a little further out than the other (a row of the
      // same capture otherwise sits mirror-image identical); a turn about the vertical at each hip keeps the feet down
      // (the seated leg passes below are worked out on one call in four and held in between, the result kept as the
      // legs' own rotations: legs at rest barely move, and this was a sixth of the update; a stepped view works every time)
      const LC = (this._legC ||= { n: 0, ok: false, q: [0, 1, 2, 3, 4, 5].map(() => new THREE.Quaternion()) });
      const legSeated = !o.stand && stand < 0.3 && !(T && !T.hidden) && rig.b.lThigh && rig.b.rThigh;
      const LB = legSeated ? [rig.b.lThigh, rig.b.rThigh, rig.b.lCalf, rig.b.rCalf, rig.b.lFoot, rig.b.rFoot] : null;
      if (!legSeated) LC.ok = false;
      if (legSeated && LC.ok && !STEPPED && !this.fresh && LC.n++ % 4) { for (let i = 0; i < 6; i++) LB[i].quaternion.copy(LC.q[i]); }
      else if (legSeated && !OFF.legs) {
        LC.n = 1;
        rig.updChain(rig.b.spine); // (the capture just moved the pelvis and spine: the legs are measured from them)
        const sp = (this._legSp ??= (hash(sd * 3.7 + 1) - 0.4) * 0.24), as = (this._legAs ??= (hash(sd * 5.3 + 2) - 0.5) * 0.16);
        const up = _v[3].set(0, 1, 0).transformDirection(rig.seat.matrixWorld);
        for (const [th, a] of [[rig.b.lThigh, sp + as], [rig.b.rThigh, -(sp - as)]]) {
          rig.upd(th);
          const W = worldQuat(th, _q[2]).premultiply(_q[3].setFromAxisAngle(up, a));
          th.quaternion.copy(worldQuat(th.parent, _q[4]).invert().multiply(W));
        }
        // and the knees a natural hand's width apart at least (12 cm centre to centre, the limbs rules): each thigh turned out
        // about the vertical at its hip by half of what's missing
        const kneesApart = (outerOnly = false) => { rig.upd(rig.b.lThigh); rig.upd(rig.b.rThigh);
          const kL = toL(worldPos(rig.b.lCalf, NV())), kR = toL(worldPos(rig.b.rCalf, NV())), hL0 = toL(worldPos(rig.b.lThigh, NV())), hR0 = toL(worldPos(rig.b.rThigh, NV()));
          // (across the body's own hip line: turned on the seat, as at a two-top, it isn't the seat's)
          const hdx = hL0.x - hR0.x, hdz = hL0.z - hR0.z, sx0 = Math.sign(hdx) || 1, kg = ((kL.x - kR.x) * hdx + (kL.z - kR.z) * hdz) / (Math.hypot(hdx, hdz) || 1);
          const nbL = outerOnly && o.neighbour ? toL(NV().set(o.neighbour, 0, 0).add(worldPos(rig.seat, NV()))).x : 0; // (the tablemate's side, seat frame)
          if (kg < 0.125) for (const [th, h, k, sgn] of [[rig.b.lThigh, hL0, kL, sx0], [rig.b.rThigh, hR0, kR, -sx0]]) {
            if (outerOnly && nbL && Math.sign(h.x - (th === rig.b.lThigh ? hR0.x : hL0.x)) === Math.sign(nbL)) continue; // (not the one beside them)
            const r = Math.hypot(k.x - h.x, k.z - h.z);
            if (r < 0.1) continue;
            const ang = Math.min(0.3, ((0.125 - kg) / 2 + 0.005) / r) * sgn; // (+angle about the seat's up turns +z towards +x)
            const Wq = worldQuat(th, _q[2]).premultiply(_q[3].setFromAxisAngle(up, ang));
            th.quaternion.copy(worldQuat(th.parent, _q[4]).invert().multiply(Wq));
            rig.upd(th);
          } };
        kneesApart();
        // and the feet never crossed or together (the women's seated capture crosses the ankles; the limbs rules want
        // them apart, at least 13 cm centre to centre): the thigh turned about its own long axis (the hip's rotation)
        // swings the shin out with the knee where it is
        rig.upd(rig.b.lThigh); rig.upd(rig.b.rThigh);
        const hL = toL(worldPos(rig.b.lThigh, NV())), hR = toL(worldPos(rig.b.rThigh, NV())), sx = Math.sign(hL.x - hR.x) || 1;
        const uncross = () => this.shinsApart();
        uncross();
        // and clear of the neighbours' legs (a tablemate turned to talk brings the knees together under the table): the
        // thigh turned away about the vertical at the hip until its knee and shin are 12 cm from theirs
        if (this.near) for (const q of this.near) for (let pass = 0; pass < 2; pass++) {
          if (!q.rig || q.hidden || !q.posed || q.o.stand) continue; // (a neighbour on the move too: the knees turn away)
          const qb = q.rig.b, qMid = NV().copy(worldPos(qb.lThigh, NV())).add(worldPos(qb.rThigh, NV())).multiplyScalar(0.5);
          for (const [th, ca, ft] of [[rig.b.lThigh, rig.b.lCalf, rig.b.lFoot], [rig.b.rThigh, rig.b.rCalf, rig.b.rFoot]]) {
            // (the same measure as the limbs check: the lower half of each thigh and each shin, centre line to centre line)
            const K = worldPos(ca, NV()), A = worldPos(ft, NV()), Hm = NV().copy(worldPos(th, NV())).lerp(K, 0.5);
            let dmin = Infinity, Q = null;
            for (const [qt, qc, qf] of [[qb.lThigh, qb.lCalf, qb.lFoot], [qb.rThigh, qb.rCalf, qb.rFoot]]) {
              const qK = worldPos(qc, NV());
              if (qK.distanceToSquared(K) > 0.16) continue; // (far apart: nothing to measure)
              const qA = worldPos(qf, NV()), qH = NV().copy(worldPos(qt, NV())).lerp(qK, 0.5);
              const d = Math.min(segDist(Hm, K, qH, qK), segDist(K, A, qK, qA), segDist(Hm, K, qK, qA), segDist(K, A, qH, qK));
              if (d < dmin) { dmin = d; Q = qK; }
            }
            if (dmin >= 0.11) continue;
            // (away from their hips: two people turned to each other point their knees together)
            const H = worldPos(th, NV()), arm = NV().copy(K).sub(H), away = NV().copy(K).sub(qMid);
            const r = Math.hypot(arm.x, arm.z), sw = NV().crossVectors(up, arm), k = sw.dot(away);
            if (r < 0.1 || Math.abs(k) < 1e-5) continue;
            const Wq = worldQuat(th, _q[2]).premultiply(_q[3].setFromAxisAngle(up, Math.sign(k) * Math.min(0.3, (0.125 - dmin) / r)));
            th.quaternion.copy(worldQuat(th.parent, _q[4]).invert().multiply(Wq));
            rig.upd(th);
          }
        }
        // (and again once clear of the neighbours: turning a knee away from theirs can bring it in to its own other one)
        if (this.near && this.near.length) kneesApart(true);
        // and the thighs near level and the shins near vertical together: a knee dropped more than 28° below its hip (the
        // feet drawn back under the seat in a laugh) has its foot brought forward, a foot more than 13 cm in front of its
        // knee comes back, 3 cm a step
        for (const [th, ca, ft, bend, s] of [[rig.b.lThigh, rig.b.lCalf, rig.b.lFoot, rig.bend.lLeg, 1], [rig.b.rThigh, rig.b.rCalf, rig.b.rFoot, rig.bend.rLeg, -1]]) {
          for (let k = 0; k < 5; k++) {
            const H = toL(worldPos(th, NV())), K = toL(worldPos(ca, NV())), A = toL(worldPos(ft, NV()));
            const ms = Math.asin(Math.max(-1, Math.min(1, (H.y - A.y - rig.len.leg[1]) / rig.len.leg[0]))); // (the slope a short leg has to take)
            const steep = Math.atan2(K.y - H.y, Math.hypot(K.x - H.x, K.z - H.z)) < -Math.max(0.49, ms + 0.1), kf = K.z - A.z;
            if (steep && kf > -0.1) A.z += 0.03; else if (kf < -0.13) A.z -= 0.03; else break;
            rig.solve(th, ca, ft, rig.seat.localToWorld(A), NV().set(s * 0.25, 0.4, 1).transformDirection(rig.seat.matrixWorld), bend, rig.len.leg);
          }
        }
        // and the shins near vertical: a foot stretched out more than 12 cm in front of its knee comes back under it
        // (the knee rises a little); the limbs rules
        for (const [th, ca, ft, bend, s] of [[rig.b.lThigh, rig.b.lCalf, rig.b.lFoot, rig.bend.lLeg, 1], [rig.b.rThigh, rig.b.rCalf, rig.b.rFoot, rig.bend.rLeg, -1]]) {
          const K = toL(worldPos(ca, NV())), A = toL(worldPos(ft, NV()));
          if (K.z - A.z >= -0.12) continue;
          A.z = K.z + 0.1;
          rig.solve(th, ca, ft, rig.seat.localToWorld(A), NV().set(s * 0.25, 0.4, 1).transformDirection(rig.seat.matrixWorld), bend, rig.len.leg);
        }
        uncross(); // (again: the leg passes above can bring the feet back together)
        for (let i = 0; i < 6; i++) LC.q[i].copy(LB[i].quaternion);
        LC.ok = true;
      }
    }
    else if (rig) rig.additive = false;
    const seatK = clip ? 0 : 1; // the procedural seated posture and drift, which the capture already has

    SEC && SEC.mark('legs'); // ---- body ----
    // restlessness (dead air, a lost room) speeds the drift up, capped, and never widens it: no bobbleheads
    const speed = Math.min(restless, 1.6);
    const breath = calm * seatK * Math.sin(now * this.breathHz * 6.283 + sd) * 0.012;
    const shift = calm * seatK * noise(sd + 1, now * 0.11 * speed) * 0.06;
    const sway = calm * seatK * noise(sd + 2, now * 0.08 * speed) * 0.05 + (room.beat ? Math.sin(now * room.beat * 6.283 + sd * 0.3) * 0.035 : 0);
    let lean = this.slouch * (1 - stand) * (clip ? 0.5 : 1) + shift * 0.6, turn = sway * 0.5, side = calm * seatK * noise(sd + 3, now * 0.07) * 0.03;
    let headPitch = 0, headYaw = 0, headRoll = this.headTilt;
    if (W.phone > 0) { lean += 0.16 * W.phone * (o.table && o.neighbour ? 0.25 : 1); headPitch += 0.55 * W.phone; } // (at a two-top: the head looks down, the belly stays off the top's rim)
    if (W.chin > 0) { lean += 0.2 * W.chin; headRoll += 0.12 * W.chin; headPitch += 0.08 * W.chin; }
    if (W.talk > 0) {
      // towards whoever is speaking (a speaker looks at the listener most of the time, and away while thinking)
      let sideT = this.side;
      if (tk && tk.speaker && tk.speaker !== this && tk.speaker.rig) { const sp = toL(tk.speaker.rig.seat.getWorldPosition(_v[6])); sideT = sp.x >= 0 ? 1 : -1; }
      const away = tk && tk.speaking ? clamp01((noise(sd + 41, now * 0.35) + 0.2) * 3) : 0;
      turn += sideT * 0.35 * W.talk; headYaw += sideT * 0.8 * W.talk * (1 - 0.6 * away); lean += 0.04 * W.talk;
      if (tk && tk.speaking) headPitch += 0.05 * W.talk * noise(sd + 43, now * 1.7); // beats
      if (tk && tk.laugh) headPitch -= 0.1 * tk.laugh * W.talk; // a listener's laugh: the head goes back a little
    }
    if (idle === 'lean') lean += 0.09 * (1 - stand);
    // (hands on the knees: sitting forward a little, so they reach them)
    if (clip && !o.stand && stand < 0.3 && rig.fit && rig.fit.ok && !ANATOMY_OFF) {
      const RS = this.restPoseAt(now), kn = (k) => (k === 'knees' ? 1 : k === 'thighKnee' ? 0.6 : 0);
      lean += 0.13 * lerp(kn(RS.prev), kn(RS.kind), RS.k) * (1 - clamp01((this._fidW || 0) * 1.6));
    }
    lean += (attention - 0.55) * 0.08 * calm * (1 - stand); // locked in leans in a little, a lost room sits back
    // the seat's sitting style, with a slow weight shift (sitting up, settling back) every 20-60 s, never a pop
    if (clip && !o.stand && stand < 0.3) {
      const ps = this.posture || 'upright', drift = noise(sd + 71, now * 0.025) * 0.05 + noise(sd + 73, now * 0.011) * 0.03;
      // (small: the capture sits its own way already; these only vary it from seat to seat)
      const PK = LIFE_OFF.rest ? 1 : 1.6; // (round 11: the theatre's front row one rigid pose: each seat's own way of sitting, more of it)
      lean += (ps === 'upright' ? 0.02 + 0.03 * clamp01((attention - 0.6) * 3) : ps === 'back' ? -0.08 * PK : ps === 'slouch' ? 0.06 : 0) + drift; // (not more slouch: a rounded back under a head held up reads as a jutting neck, round 13)
      if (ps === 'slouch') headPitch -= 0.04; // (the head kept up over a rounded back)
      if (ps === 'shoulder') side += (this.side || 1) * 0.05 * PK;
      if (ps === 'turnIn') turn += (this.side || 1) * 0.1 * PK;
      // (rest-v2: each rest its own small weight shift, eased with the rest's own crossfade)
      if (!REST_OLD && rig.fit && rig.fit.ok && !ANATOMY_OFF && !(o.table && o.neighbour)) { const RS = this.restPoseAt(now), a = RS.vPrev, c = RS.v, f = RS.same ? 1 : RS.k; if (a || c) { side += lerp(a ? a.shift : 0, c ? c.shift : 0, f) * (1 - stand); lean += lerp(a ? a.lean : 0, c ? c.lean : 0, f) * (1 - stand); } }
    }
    const hk = room.heckle ? room.heckle.level : 0;
    if (idle === 'heckle') { lean += 0.12 * hk; headPitch -= 0.08 * hk; } // (a bigger lean folds the belly onto the forearms)
    // laugh posture (the style is drawn per reaction too)
    // a laugh reads from the body at TV distance: a big one rocks the torso forward and back (~10°, on the person's own
    // slow rhythm), bounces on each "ha" and lifts the shoulders (below); a chuckle dips the head on each "ha"
    // (with the captures on, a laugh's own capture already rocks the torso and throws the head: what this block adds on
    // top is a flavour of the style, at half strength, not a second laugh stacked on the first)
    const lq0 = lean, lq1 = turn, lq2 = side, lq3 = headPitch, lq4 = headYaw, lq5 = headRoll;
    const isLaugh = !!(L && L.kind === 'laugh');
    const haB = SMOOTH ? 0.5 : ha; // (laugh-v2: the body no longer bobs on each "ha"; the mouth does, below)
    const big = isLaugh ? clamp01((lb - 0.45) / 0.45) : 0, chuck = isLaugh ? lb * (1 - big) : 0;
    this._laughBig = big;
    if (big > 0) lean += big * (0.05 + (SMOOTH ? 0 : 0.06) * Math.sin(now * (0.85 + 0.45 * hash(sd + 61)) * 6.283 + sd * 2.3)); // (rocking about a little forward; the capture's own laugh rocks the body too)
    if (big > 0 && st !== 'over' && st !== 'back') headPitch -= 0.06 * big * (0.6 + 0.4 * haB); // (the head goes back a little on a big one, whatever the style)
    // a chuckle at ~60% of a big laugh: the head dips and tilts, the body leans in and rocks a little, the shoulders
    // bounce (below), and some glance at the neighbour (seeded per reaction)
    if (chuck > 0) {
      headPitch += chuck * (0.08 + 0.07 * haB); headRoll += 0.05 * chuck * (this.side || 1);
      lean += chuck * (0.05 + 0.03 * haB + (SMOOTH ? 0 : 0.04) * Math.sin(now * (0.85 + 0.45 * hash(sd + 61)) * 6.283 + sd * 2.3));
      if (L && hash(this.seed * 0.71 + (L.id | 0) * 1.3) < 0.45) headYaw += (this.side || 1) * 0.35 * chuck;
    }
    this._chuck = chuck;
    if (st === 'back') { lean -= 0.06 * lb; headPitch -= (0.1 + 0.06 * big) * lb * (0.8 + 0.2 * haB); } // head back: ~6°, ~9° on a big one, on top of the capture's own
    if (st === 'over') { lean += 0.42 * lb * (1 - 0.5 * stand) * (clip ? 0.3 : 1); headPitch += 0.28 * lb * (clip ? 0.4 : 1); } // (a capture's laugh bends too)
    if (st === 'giggle') { lean += 0.04 * lb; headRoll += 0.05 * lb; }
    if (st === 'turn') { turn += this.side * 0.06 * lb; headYaw += this.side * 0.3 * lb; side -= this.side * 0.02 * lb; } // (the head turns to the friend, the shoulders follow a little; the capture turns too)
    if (st === 'shake') lean += 0.04 * lb; // upright, the shoulders doing the laughing (below)
    if (st === 'nose') headPitch += 0.07 * lb * (0.5 + haB); // a breath out through the nose, the head dipping
    if (G.neighbour) { const w = G.neighbour.w; turn += this.side * 0.08 * w; headYaw += this.side * 0.35 * w; side -= this.side * 0.03 * w; }
    if (G.knee) lean += 0.12 * G.knee.w; // (the hand goes to the knee; the body bends a little for it)
    lean += (haB - 0.5) * (0.03 + 0.04 * big) * lb; // bouncing with each "ha" (the capture bounces too)
    if (clip && lb > 0.02) { const k = LIFE_OFF.laugh ? 0.5 : 0.75; lean = lq0 + (lean - lq0) * k; turn = lq1 + (turn - lq1) * k; side = lq2 + (side - lq2) * k; headPitch = lq3 + (headPitch - lq3) * k; headYaw = lq4 + (headYaw - lq4) * k; headRoll = lq5 + (headRoll - lq5) * k; }
    // ---- life-v1: breathing, slow drift and weight shifts, a look between friends in a laugh, a rare whisper while
    // listening; a laugh's intake of breath at its start and the chest's heave with each "ha" (small layers on top of the
    // captures, each fading in and out, each person on their own phase: never in step with a neighbour) ----
    let breathC = 0, breathS = 0, lifeLook = 0, whisper = 0, onsetUp = 0, comp = 0, heaveS = 0, lifeT = 0;
    const lsd = this.lifeSeed || 0, sitting = !o.stand && stand < 0.3 && !(T && !T.hidden) && walk < 0.05, pq = this.partner;
    if (clip && calm) {
      if (!LIFE_OFF.breath) { // (in through the chest and shoulders, about 0.22-0.3 Hz, deeper for a while after a laugh; a laugh's own heave takes over)
        const ph = now * this.breathHz * 6.283 + lsd, inb = 0.5 - 0.5 * Math.cos(ph + 0.35 * Math.sin(ph)); // (the in-breath a little quicker than the out)
        const deep = (this.breathAmp || 1) * (1 + 0.7 * clamp01((this.laughScore || 0) - lb)) * (1 - clamp01(lb * 2.5));
        breathC = 0.012 * deep * (inb - 0.5) * 2; breathS = 0.022 * deep * inb;
      }
      if (!LIFE_OFF.drift && sitting) { // (a slow drift, and a weight shift every 12-35 s eased over 1.6 s, never a pop)
        const per = LIFE_OFF.busy || LIFE_OFF.shift || room.mode !== 'live' ? 12 + 23 * hash(lsd + 0.5) : 5 + 9 * hash(lsd + 0.5), u = now + lsd * 3.1, k = Math.floor(u / per), f = smooth((u - k * per) / 1.3);
        if (f > 0 && f < 1) lifeT = 1;
        const ws = lerp(hash(lsd + k), hash(lsd + k + 1), f) * 2 - 1, wt = lerp(hash(lsd * 1.3 + k + 7), hash(lsd * 1.3 + k + 8), f) * 2 - 1;
        const dk = 1 - clamp01(lb * 2);
        side += (0.022 * noise(lsd + 1, now * 0.045) + 0.035 * ws) * dk;
        turn += (0.03 * noise(lsd + 2, now * 0.035) + 0.04 * wt) * dk;
        lean += (0.015 * noise(lsd + 5, now * 0.05) - 0.012 * Math.abs(ws) + (LIFE_OFF.busy || room.mode !== 'live' || (o.table && o.neighbour) ? 0 : 0.045 * (lerp(hash(lsd * 1.7 + k + 3), hash(lsd * 1.7 + k + 4), f) * 2 - 1))) * dk; // (and with each shift, leaning in a little or sitting back: round 11; not at a two-top, whose planted hands then came and went behind the candle)
        headRoll += (0.03 * noise(lsd + 3, now * 0.06) - 0.02 * ws) * dk;
        headYaw += 0.035 * noise(lsd + 4, now * 0.08) * dk;
        headPitch += 0.02 * noise(lsd + 6, now * 0.11) * dk; // (the head never quite still: small nods of attention)
        // (round 09: over any one second while listening, more of the room visibly moves: a small turn or tilt of the head
        // every 2.5-6 s, eased over 0.45 s, each person on their own clock; &lifeoff=busy for the slower life)
        if (!LIFE_OFF.busy && !LIFE_OFF.heads && room.mode === 'live') { // (the set's listening: before and after it, the chat has the heads)
          const hp = 2.5 + 3.5 * hash(lsd + 9.1), hu = now + lsd * 1.7, hk2 = Math.floor(hu / hp), hf = smooth((hu - hk2 * hp) / 0.45);
          const hy = lerp(hash(lsd * 0.7 + hk2), hash(lsd * 0.7 + hk2 + 1), hf) * 2 - 1, hpz = lerp(hash(lsd * 0.9 + hk2 + 3), hash(lsd * 0.9 + hk2 + 4), hf) * 2 - 1;
          headYaw += 0.2 * hy * dk; headPitch += 0.05 * hpz * dk; headRoll += 0.04 * hy * dk;
          if (hf > 0 && hf < 1) lifeT = 1;
        }
      }
      // a look to the friend beside them, 1.6-3.4 s into a laugh (the pair's own draw, so the two look at once)
      if (!LIFE_OFF.look && isLaugh && pq && pq.rig && L.t > 1.2) {
        const key = Math.min(this.seed, pq.seed) * 0.013 + (L.id | 0) * 1.77, VL = VENUE_LAUGH[this._venue] || VENUE_LAUGH.club;
        if (hash(key) < (LIFE_OFF.laugh ? 0.45 : 0.25) + VL.pair) { // (round 10: too many turned heads read as conversation, not laughing at the stage)
          const t1 = 1.6 + 1.8 * hash(key + 3.1), dur = (SMOOTH ? 1.6 : 0.9) + 0.8 * hash(key + 5.3), a = L.t - t1;
          if (a > 0 && a < dur) lifeLook = (SMOOTH ? 0.75 * smooth(a / 0.6) * smooth((dur - a) / 0.7) : smooth(a / 0.3) * smooth((dur - a) / 0.45)) * clamp01(L.body * 2 + L.smile); // (laugh-v2: a slower, smaller look to the friend)
        }
      }
      if (lifeLook > 0) { headYaw += this.side * 0.45 * lifeLook; turn += this.side * 0.12 * lifeLook; headRoll += this.side * 0.06 * lifeLook; headPitch += 0.03 * lifeLook; } // (the chest turns with the look, the head tips toward the friend: not a swivel on the neck)
      // a whisper to the friend while listening, rare (the party's own clock, about one in two minutes): the one leans
      // in and turns to the friend's ear, the other tilts towards it, eyes on the stage
      if (!LIFE_OFF.whisper && pq && pq.rig && this.party && room.mode === 'live' && mur < 0.5 && !L && sitting && W.talk < 0.05) {
        const P = this.party, per = 45 + 40 * hash(P.seed * 0.1 + 0.3), u = now + hash(P.seed * 0.9) * per, k = Math.floor(u / per), a = u - k * per;
        const dur = 1.8 + 1.2 * hash(P.seed * 0.5 + k * 1.3);
        if (hash(P.seed * 0.7 + k * 2.9) < 0.5 && a < dur) {
          const who = hash(P.seed * 0.3 + k * 5.1) < 0.5 ? 0 : 1, w = smooth(a / 0.5) * smooth((dur - a) / 0.5);
          if (this.pk === who) { whisper = w; headYaw += this.side * 0.6 * w; headRoll += this.side * 0.07 * w; lean += 0.05 * w; turn += this.side * 0.05 * w; }
          else if (this.pk === 1 - who) { whisper = -w; headRoll += this.side * 0.09 * w; headYaw += this.side * 0.16 * w; }
        }
      }
      // a laugh's start: the intake of breath as it lands, the chest and shoulders up and the head back a little, then
      // let go into the laugh (everyone it reaches, the ones who only smile a little)
      if (!SMOOTH && !LIFE_OFF.onset && isLaugh && L.t > -0.05 && L.t < 0.7) { // (laugh-v2: gone: a 0.14 s toss of the head and shoulders read as a twitch)
        const a = L.t, amp = L.reach > 0.02 ? 0.75 + 0.25 * L.reach : 0.85 * (L.smileOnly || 0);
        onsetUp = amp * smooth(a / 0.14) * (1 - smooth((a - 0.18) / 0.4));
        headPitch -= 0.1 * onsetUp; // (a small toss of the head as it lands)
      }
      // and the heave: the belly and chest contract on each "ha" (the shoulders come up with it), the gasp between bouts
      // lets go; a small laugh, a small heave; a smile alone, a silent chuckle in the shoulders
      if (!LIFE_OFF.comp && isLaugh) {
        const bt = SMOOTH ? 0.85 : L.bout ?? 1, hv = Math.min(1, LIFE_OFF.laugh ? lb * 1.6 : Math.sqrt(lb) * 1.25) * (0.6 + 0.4 * big) * bt + (lb < 0.05 ? 0.5 * (L.smileOnly || 0) * clamp01(L.smile * 2.5) : 0);
        const LB = LIFE_OFF.laugh ? 1 : 1.7; // (round 06: the laugh too small at TV distance: the body's share up by 40%)
        comp = SMOOTH ? 0 : hv * (ha - 0.3) * LB; heaveS = hv * (0.04 + 0.08 * haB) * LB; headPitch -= (st === 'over' || st === 'nose' ? -0.02 : 0.03) * hv * haB; // (laugh-v2: no heave of the chest on each "ha"; the shoulders up with the laugh, eased) // (the head goes back on each "ha", not down: a head dropping with an open mouth read as pain)
        if (!LIFE_OFF.laugh) lean += lb * (st === 'back' ? -0.08 : st === 'over' ? 0.06 : st === 'turn' ? -0.03 : 0); // (the torso goes with the take: back, or forward on a doubled-over one)
        // (round 09: everyone the laugh reaches shows it in the body, not one to three per strip: the shoulders up and the
        // weight back, a little, a smile's worth for those who only smile)
        if (!LIFE_OFF.laugh) headPitch -= lb * (st === 'back' || st === 'shake' || st === 'turn' ? 0.09 : st === 'giggle' ? 0.04 : 0) * (0.75 + 0.25 * haB); // (the head goes back with the laugh, at the stage: round 10)
        if (!LIFE_OFF.laugh) { const rc = Math.max(clamp01(Math.sqrt(lb) * 1.2), 0.7 * (L.smileOnly || 0) * clamp01(L.smile * 2.5)); heaveS += 0.06 * rc; if (st !== 'over') lean -= 0.05 * rc; }
        if (!SMOOTH) lean += lb * (0.03 + 0.04 * big) * LB * Math.sin(now * (0.7 + 0.4 * hash(lsd + 61)) * 6.283 + lsd); // (laugh-v2: the capture rocks the body; a second rock on top fought it) // (and the body rocks, forward and back, on its own slow rhythm)
      }
    }
    this._lifeAct = Math.max(lifeLook, Math.abs(whisper), onsetUp, lifeT); // (a head turn or a shift under way: posed every frame, not held at 5 Hz: no steps)
    this._lookE = (this.side || 1) * (0.3 * lifeLook + 0.2 * Math.max(0, whisper));
    this._whisper = whisper;
    lean -= 0.05 * upW;
    lean += 0.1 * vocal; headPitch += 0.1 * vocal; // calling out: head forward
    lean += 0.45 * Math.sin(Math.PI * stand) * (o.stand ? 0 : 1) * seatK; // rising out of (or lowering into) the seat
    if (walk) { lean += 0.05 * seatK; headPitch = lerp(headPitch, clip ? 0.06 : 0.15, walk); }
    // (seated: never slumped over the table or sliding off the chair; a doubled-over laugh may go further forward)
    // (someone whose resting hands couldn't reach their thighs with a bent elbow (a long back leaning back, short arms:
    // straightArm below) sits a little more upright, learnt over the next frames and forgotten over ~30 s)
    { const dt = now - (this._laT ?? now); this._laT = now; this._leanAdj = Math.max(0, (this._leanAdj || 0) - (dt > 0 && dt < 4 ? dt * 0.008 : 0));
      if (!ARM_OLD && this._leanAdjT) { const e = dt > 0 && dt < 0.5 ? 1 - Math.exp(-dt / 0.4) : 1, d = this._leanAdjT - this._leanAdj; this._leanAdj += d * e; this._leanAdjT = d * (1 - e) > 0.002 ? this._leanAdjT - (dt > 0 && dt < 4 ? dt * 0.008 : 0) : 0; } } // (arm-v2: the fall-back's lean eased over ~0.4 s, not a 4-degree step)
    lean += this._leanAdj || 0;
    // (at a two-top, sitting forward to it, the shoulders over the hips: the hands reach its top with the elbows bent,
    // and stay planted on it through a laugh; see REST_TABLE)
    const atTable = o.table && o.neighbour && stand < 0.3;
    if (atTable) lean += 0.06;
    // (and turned half way towards the table's middle: a seat set square to the row leaves the outer hand a long
    // reach across the body to the top, an arm straight out at the end of its reach that follows every shrug)
    if (atTable) turn *= 0.6; // (hands on the top: the shoulders turn less, the head does more of a look's turn)
    // (and the laugh's bounce taken mostly by the head and shoulders: the body's lean follows it over a third of a
    // second, so the planted hands' arms aren't pulled straight and let go by turns)
    if (atTable) { const dtL = clamp(now - (this._leanT ?? now), 0, 0.5); this._leanT = now; this._leanS = this._leanS === undefined || dtL >= 0.5 ? lean : this._leanS + (lean - this._leanS) * (1 - Math.exp(-dtL / 0.15)); lean = this._leanS; } else this._leanS = undefined; // (its own clock: _lsT is the laugh score's)
    if (stand < 0.3) { lean = clamp(lean, -0.2, (atTable ? 0.4 : 0.3) + 0.3 * lb * (st === 'over' ? 1 : 0.4)); side = clamp(side, -0.12, 0.12); } // (nor lying back across it)
    else if (walk < 0.05) lean = clamp(lean, -0.15, 0.2); // (standing, a laugh bends forward only as far as the feet keep the weight: the limbs rules)

    // nods while listening (and a couple of small ones as a laugh begins)
    let nod = 0;
    const ni = this.nods.findIndex((x) => x > now - 1.4);
    if (calm && ni >= 0 && this.nods[ni] < now && room.events.length === 0) nod = Math.sin((now - this.nods[ni]) * 9) * 0.07 * Math.sin(((now - this.nods[ni]) / 1.4) * Math.PI);
    if (!SMOOTH && L && L.t > -0.2 && L.t < 0.9 && lb < 0.35) nod += Math.sin(L.t * 10) * 0.06 * ls; // (laugh-v2: gone: it started and stopped mid-swing)
    if (G.nod) nod += Math.sin(G.nod.a * 8) * 0.08 * G.nod.w;

    const sh = o.seatH;
    // look at the performer (the stage camera), with glances; walkers look where they go
    const perf = _v[1].copy(room.performer);
    perf.x += this.gaze.x; perf.y += this.gaze.y;
    toL(perf);
    const eyeY = lerp(sh + 0.75, 1.6, stand);
    const hx = perf.x, hz = perf.z, hy = perf.y - eyeY;
    const gYaw = Math.atan2(hx, hz) + calm * noise(sd + 4, now * 0.25 * speed) * (room.mode === 'live' && mur < 0.5 ? 0.1 : 0.18); // (listening: within ~±6° of the performer)
    // (the stage is up and ahead: the eyes take most of that, the face tips up a few degrees at most, never chin-up)
    const gPitch = clamp(-Math.atan2(hy, Math.hypot(hx, hz)) * 0.5, -0.08, 0.08) + calm * noise(sd + 5, now * 0.2) * 0.04;
    const look = (1 - busyW * 0.6) * (0.55 + 0.45 * attention) * (1 - walk);
    let yaw = (gYaw - turn * 0.75) * look + headYaw;
    const gl = calm * clamp01((noise(sd + 11, now * 0.13) - (room.mode === 'live' && mur < 0.5 ? 0.68 : 0.55) + this.glance * 0.25 + mur * 0.2) * 4) * (1 - clamp01(lb * 2)); // (listening: fewer glances away)
    // (a walker's head leads the turn instead: no glances or heckle look while walking, so the neck never twists)
    if (this.glance > 0.5) yaw += this.side * 0.75 * gl * (1 - walk); else headPitch += 0.45 * gl * (1 - walk);
    if (hk > 0 && room.hecklerPos && !this.heckler && walk < 1) {
      const hp = toL(_v[2].copy(room.hecklerPos));
      yaw = lerp(yaw, Math.atan2(hp.x, hp.z), 0.55 * hk * (0.6 + 0.4 * this.eager) * (1 - walk));
    }
    if (walk && T && T.look) yaw += T.look * walk;
    // pelvis sits back on the seat (or stands over it); the spine carries lean, turn and side bend
    const seatedY = sh + 0.115 - rig.restY.thigh, bob = walk * Math.abs(Math.sin(wph)) * 0.025;
    // (standing and bending forward, in a laugh: the hips go back so the weight stays over the feet; the limbs rules)
    if (!clip) rig.model.position.set(0, lerp(seatedY, 0, stand) + bob, lerp(-0.11 + Math.min(lean, 0.3) * 0.05, -Math.max(0, lean) * 0.3 * (1 - walk), stand));
    // (seated or standing, the legs stay where the seat and the leg pass put them: the thighs hang from Spine, so the pelvis's and
    // the spine's lean and turn below are taken back out of them; a laugh's lean no longer drops the knees)
    // (laugh-v2: the posture's angles low-passed over 0.1 s, so a switch of take, style, gesture or look eases over a few
    // frames instead of popping in one; a jump in time (a cut in a still view, the first frame) takes the new pose at once)
    if (SMOOTH) { const fdt = now - (this._fT ?? -1e9); this._fT = now; this._fE = this.force || !(fdt > 0 && fdt < 0.5) ? 1 : 1 - Math.exp(-fdt / 0.1); lean = this._lp('lean', lean); turn = this._lp('turn', turn); side = this._lp('side', side); }
    if (OFF.lean) { lean = 0; turn = 0; side = 0; }
    const keepLegs = (stand < 0.3 || o.stand || (OV && stand > 0.9)) && !walk && !(T && !T.hidden) && b.lThigh && b.rThigh; // (standing too: the feet stay planted)
    if (keepLegs) _qk[0].copy(b.pelvis.quaternion).multiply(b.spine.quaternion);
    rig.setRot(b.pelvis, _q[5].setFromEuler(_e.set(lerp(-0.1, 0, stand) * seatK + lean * 0.15, turn * 0.25, side * 0.3, 'YXZ')));
    // (a look to the side turns the whole upper body, not the neck alone: the spine 20%, the chest 30%, neck and head 50%)
    // (not while sitting down, standing up or walking: the captures turn the body there, and the look stays the neck's)
    const ys = T && !T.hidden ? 0 : 1;
    rig.euler(b.spine, lean * 0.3 + 0.05 * (1 - stand) * seatK + breath, turn * 0.25, side * 0.35);
    if (keepLegs) { const D = _qk[1].copy(b.pelvis.quaternion).multiply(b.spine.quaternion).invert().multiply(_qk[0]); b.lThigh.quaternion.premultiply(D); b.rThigh.quaternion.premultiply(D); this._legsMoved = true; }
    rig.euler(b.spine1, lean * 0.32 + 0.04 * (1 - stand) * seatK + comp * 0.16 - onsetUp * 0.02, turn * 0.25 + yaw * 0.2 * ys, side * 0.35); // (the look's share on Spine1: the legs hang from Spine)
    rig.euler(b.spine2, lean * 0.3 + 0.03 * (1 - stand) * seatK - breath * 0.5 - breathC + comp * 0.13 - onsetUp * 0.05, turn * 0.25 + yaw * 0.3 * ys, 0);
    let pitch = gPitch * look + headPitch + nod - lean * 0.55;
    if (SMOOTH) { pitch = this._lp('pitch', pitch); yaw = this._lp('yaw', yaw); headRoll = this._lp('roll', headRoll); }
    if (OFF.look) { pitch = -lean * 0.55; yaw = 0; headRoll = 0; }
    rig.euler(b.neck, pitch * 0.4, yaw * (0.4 - 0.2 * ys), headRoll * 0.4);
    rig.euler(b.head, pitch * 0.6, yaw * (0.6 - 0.3 * ys), headRoll * 0.6);
    // shoulders: a shrug bounce with the laugh, up with the arms
    const haS = SMOOTH ? 0.5 : ha;
    let shrug = lb * (st === 'shake' ? 0.26 : 0.13 + 0.08 * clamp01((lb - 0.5) / 0.4)) * haS + 0.14 * (this._laughBig || 0) + 0.08 * haS * (isLaugh ? lb : 0) + (this._chuck || 0) * (0.06 + 0.08 * haS) + clapW * 0.03 + Math.sin(Math.PI * coat) * 0.12 + (tk ? tk.laugh : 0) * W.talk * 0.08 * ha + breathS + heaveS + 0.14 * onsetUp;
    // (at a two-top the forearms are on its top: the shoulders shake with the laugh, a third as far, not up and back off them)
    const shrugK = o.table && o.neighbour && stand < 0.3 && this._planted ? (LIFE_OFF.laugh ? 0.5 : 0.75) : 1;
    if (SMOOTH) shrug = this._lp('shrug', shrug);
    if (OFF.shrug) shrug = 0;
    rig.euler(b.lClav, 0, -0.12 * clapW, shrug * shrugK - 0.1 + 0.14 * upW);
    rig.euler(b.rClav, 0, 0.12 * clapW, -shrug * shrugK + 0.1 - 0.14 * upW);
    // jaw bone (also opens the mouth of the morph-less middle rows)
    // speech: phrases with pauses, syllables at the person's own 3.9–5.1 Hz; listeners keep their mouths shut
    const speaking = tk && tk.speaking ? W.talk : 0;
    const phrase = clamp01((noise(sd + 31, now * 0.85) + 0.35) * 3);
    const syl = Math.pow(0.5 + 0.5 * Math.sin(6.283 * (this.sylHz * now + 0.35 * noise(sd + 33, now * 0.6))), 1.4);
    let talk = speaking * phrase * (0.05 + 0.3 * syl * (0.65 + 0.35 * noise(sd + 35, now * 2.3)));
    if (!tk) talk = W.talk * Math.max(0, noise(sd + 6, now * 3.2)) * 0.5; // (no party: the old murmur)
    if (idle === 'heckle') talk = hk * (0.25 + 0.55 * Math.max(0, noise(sd + 8, now * 4.0)));
    if (this._whisper > 0) talk = Math.max(talk, this._whisper * phrase * (0.04 + 0.1 * syl)); // (a whisper: the lips barely part)
    const jaw = (st === 'giggle' ? 0.15 + 0.1 * ha : 0.3 + 0.2 * ha) * lb * (1 - vocal) + talk + vocal * 0.5;
    if (b.jaw && !face?.ok) rig.euler(b.jaw, jaw * 0.32, 0, 0);
    rig.upd(rig.model); SEC && SEC.mark('body');
    // standing, the knees soft, never locked, before the arms are posed (a softened knee brings the thigh forward into
    // a hanging hand; the arms' pass below then sees the legs as they will be) (the limbs rules: a captured or solved leg straighter than 6° is re-solved
    // to its own ankle 7 mm higher, about 12° of bend; the foot's lift doesn't show)
    if (stand > 0.9 && walk < 0.05 && rig.b.lThigh) for (const [s, th, ca, ft, bend] of [[1, b.lThigh, b.lCalf, b.lFoot, rig.bend.lLeg], [-1, b.rThigh, b.rCalf, b.rFoot, rig.bend.rLeg]]) {
      const H = worldPos(th, NV()), K = worldPos(ca, NV()), A = worldPos(ft, NV());
      const u = NV().copy(K).sub(H).normalize(), f = NV().copy(A).sub(K).normalize();
      if (u.dot(f) < Math.cos(6 * Math.PI / 180)) continue;
      rig.solve(th, ca, ft, A.addScaledVector(NV().set(0, 1, 0).transformDirection(rig.seat.matrixWorld), 0.007), NV().set(s * 0.2, 0, 1).transformDirection(rig.seat.matrixWorld), bend, rig.len.leg);
    }
    // the spine within its limits before the arms are posed on it (anatomy.js)
    // (this frame's: whether the hands will rest, as the posture check will judge it below)
    const restingNow = clip && !o.stand && stand < 0.3 && clamp01(1 - (o.table && o.neighbour ? 0 : this._fidW || 0) * 1.6) * (1 - walk) > 0.85 && W.talk < 0.1 && clapW < 0.02 && upW < 0.02 && lb < 0.05 && !(L && L.gestures.length) && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat;
    // (a look round turns the chest too, not the neck alone; not for hands at rest, whose shoulders stay square over them)
    if (rig.fit && rig.fit.ok && !ANATOMY_OFF && !OFF.clamps && walk < 0.05 && !(T && !T.hidden) && !restingNow) shareYaw(this);
    // (arm-v2: the resting limits come in over ~0.3 s, from the 42-degree cap, not in one frame: the chest squared to the
    // hips the frame a laugh ended turned the whole upper body 19 degrees at once)
    let restC = restingNow || !!this._resting, restE = 1;
    if (!ARM_OLD) { const dtE = now - (this._reT ?? -9); this._reT = now; this._reW = dtE > 0 && dtE < 0.5 ? clamp01((this._reW ?? (restC ? 1 : 0)) + (restC ? 1 : -1) * dtE / 0.3) : restC ? 1 : 0; restE = smooth(this._reW); restC = restE > 0; } // (and out again)
    if (rig.fit && rig.fit.ok && !ANATOMY_OFF && !OFF.clamps) clampSpine(this, restC, restE);
    // the face within -15..+20 degrees while they listen or laugh (a capture's own tilt plus the look and a glance can
    // otherwise drop it 30-45 degrees, a crown to the camera); dead air may let a bored head drop further, the phone
    // and a drink are looked at, and the doubled-over laugh goes down with the body
    if (rig.fit && rig.fit.ok && !ANATOMY_OFF && !OFF.clamps && !(W.phone > 0.2 || W.drink > 0.2 || walk > 0.05 || coat > 0 || (T && !T.hidden))) {
      const social = room.mode === 'preview' || room.mode === 'after';
      const lo = (lb > 0.4 && (st === 'over' || st === 'nose') ? -25 : lb > 0.15 && !LIFE_OFF.laugh ? -10 : mur > 0.5 || idle === 'chin' ? -28 : social ? -20 : lb > 0.3 ? -20 : -9) * DEG; // (listening: the face up at the stage, a little down at most)
      clampHead(this, lo, (lb > 0.5 && st === 'back' ? (LIFE_OFF.laugh ? 16 : 20) : lb > 0.3 && !LIFE_OFF.laugh ? 15 : 12) * DEG); // (a big laugh tips the head back a little, never a stare at the ceiling)
      clampRoll(this, 16 * DEG); // (and never laid over on a shoulder: a tilt of 16° at most, eased back)
    }
    // the head clear of the neighbours' heads and shoulders (a laugh thrown back into someone who leans in yields)
    if (rig.fit && rig.fit.ok && !ANATOMY_OFF && !OFF.clamps && this.near && this.near.length) clearHeads(this);
    // (laugh-v2: the chest, neck and head turn at most 330 degrees a second, as the arms do below: a clamp letting go, a
    // take or a look switching swung the upper body 15-22 degrees in one frame; Spine itself is left alone, the legs hang from it)
    if (SMOOTH && !this.force && b.spine1) {
      const dtT = now - (this._tmT ?? -1e9); this._tmT = now;
      const TB = (Person._torB ||= ['spine1', 'spine2', 'neck', 'head']), TQ = (this._tm ||= TB.map(() => new THREE.Quaternion()));
      const ok = !this.fresh && this._tmOk && dtT > 0 && dtT < 0.5, lim = 5.76 * dtT;
      let moved = false;
      for (let i = 0; i < TB.length; i++) {
        const bn = b[TB[i]]; if (!bn) continue;
        if (ok) { const d = 2 * Math.acos(Math.min(1, Math.abs(TQ[i].dot(bn.quaternion)))); if (d > lim) { bn.quaternion.copy(TQ[i].slerp(bn.quaternion, lim / d)); moved = true; } }
        TQ[i].copy(bn.quaternion);
      }
      this._tmOk = true;
      if (moved) b.spine1.updateMatrixWorld(true);
    }
    if (clip && !o.stand && stand < 0.3 && !(T && !T.hidden) && !OFF.legs && !ANATOMY_OFF) this.shinsApart(); // (the clamps above can swing the legs, which hang from Spine)
    SEC && SEC.mark('spineClamps'); // the torso is final for this frame: its sections once, for the rest poses, the fix and the neighbours' checks
    if (rig.fit && rig.fit.ok) { refreshFit(rig.fit); rig.fit.fresh = true; }
    // the people near enough for hands to meet, from where the seats are now (people walk past)
    if (this.rig && REG.length > 1) {
      const me = rig.seat.matrixWorld.elements, near = (this._nearL ||= []);
      near.length = 0;
      for (const q of REG) { if (q === this || !q.rig || q.hidden) continue; const e = q.rig.seat.matrixWorld.elements, dx = e[12] - me[12], dz = e[14] - me[14]; if (dx * dx + dz * dz < 0.95 * 0.95) near.push(q); }
      this.near = near;
    }

    SEC && SEC.mark('fitNear'); // ---- arms: IK targets in the seat frame, layered (rest < idle < gestures; later layers win) ----
    const p = this.p;
    const V = (x, y, z) => NV().set(x, y, z);
    const armW = { l: 0, r: 0 }; // how much a gesture has taken each arm (clip mode blends the IK in by it)
    // (a hand leaving a table's top for a gesture, a clap, the chest, goes up off it first: an arc 9 cm high over the
    // straight line, so it clears the glasses' and the jar's tops at once instead of passing behind them on the way)
    let plantFrom = false;
    const over = (w, tl, tr, pl, pr) => {
      if (w <= 0) return;
      w = clamp01(w);
      if (tl) armW.l = Math.max(armW.l, w); if (tr) armW.r = Math.max(armW.r, w);
      if (tl) p.tL.lerp(tl, w); if (tr) p.tR.lerp(tr, w); if (tl) p.pL.lerp(pl, w); if (tr) p.pR.lerp(pr, w);
      if (plantFrom) { const a = 0.09 * Math.sin(Math.PI * w); if (tl && tl.y > 0.86) p.tL.y += a; if (tr && tr.y > 0.86) p.tR.y += a; }
    };
    // one hand: g.hand > 0 is the left (+X in the seat frame); targets are built with that side's offsets
    const one = (g, tgt, pole) => (g.hand > 0 ? [tgt, null, pole, null] : [null, tgt, null, V(-pole.x, pole.y, pole.z)]);
    const lapY = sh + 0.2, fwd = 0.13 + lean * 0.25;
    const onTable = [V(0.13, sh + 0.32, 0.42), V(-0.12, sh + 0.32, 0.44)], onLap = [V(0.15, lapY, fwd + 0.06), V(-0.14, lapY, fwd + 0.08)];
    let hands = this.handsOn === 'table' ? onTable : this.handsOn === 'mixed' ? (this.side > 0 ? [onTable[0], onLap[1]] : [onLap[0], onTable[1]]) : onLap;
    if (!o.table && this.handsOn === 'mixed') { // a hand on the armrest
      hands = [NV().copy(hands[0]), NV().copy(hands[1])];
      hands[this.side > 0 ? 0 : 1] = V(this.side > 0 ? 0.2 : -0.2, sh + 0.24, 0.02);
    }
    if (stand > 0) {
      const sw = walk * 0.13 * Math.sin(wph);
      // walking always means arms down and swinging (also for people who stood at the rail or held a drink)
      // (at the rail, too: arms held out to the tube read as zombie arms over it from the stage; hands at the sides)
      const hold = walk > 0 || o.standHands === 'rail' ? 'down' : o.standHands;
      // rail: hands resting on top of the barrier's tube (top at 1.14 m, 0.29–0.37 m in front), not hanging over it on
      // the stage side, so the forearms stay above the barrier panel and the hands never look cut off from the body
      const up = hold === 'rail' ? [V(0.21, 1.19, 0.3), V(-0.2, 1.19, 0.31)] : hold === 'drink' ? [V(0.21, 0.84, 0.04), V(-0.1, 1.12, 0.24)] : [V(0.21, 0.84, 0.04 + sw), V(-0.21, 0.84, 0.04 - sw)];
      hands = [NV().copy(hands[0]).lerp(up[0], stand), NV().copy(hands[1]).lerp(up[1], stand)];
    }
    // with a capture, the hands start wherever the capture put them
    if (clip) hands = [toL(worldPos(b.lHand, NV())), toL(worldPos(b.rHand, NV()))];
    p.tL.copy(hands[0]); p.tR.copy(hands[1]); p.pL.set(0.7, -0.3, -1); p.pR.set(-0.7, -0.3, -1);
    // (a baked pose for the low-detail people names a rest pose from the library, placed on that body's fitted thighs)
    // (life-v1: a baked low-detail body without fitted thighs rests its hands on the thighs near the hips, the elbows bent;
    // the lap 19 cm ahead put the arms out straight, 173°, diagonally past the seat in front: the theatre's 'strap' arms)
    if (!clip && F.rest && !(rig.fit && rig.fit.ok && rig.fit.thighs.length) && stand < 0.3 && !LIFE_OFF.hands && !LIFE_OFF.bake && !BAKE_FAR_OLD) { p.tL.set(0.16, sh + 0.23, 0.06); p.tR.set(-0.16, sh + 0.23, 0.06); p.pL.set(0.35, -0.85, -0.35); p.pR.set(-0.35, -0.85, -0.35); }
    if (!clip && F.rest && rig.fit && rig.fit.ok && rig.fit.thighs.length && stand < 0.3) { refreshFit(rig.fit); const A = this.restTargets(F.rest); p.tL.copy(A.tL); p.tR.copy(A.tR); p.pL.copy(A.pL); p.pR.copy(A.pR); if (!LIFE_OFF.hands) { p.pL.set(0.35, -0.85, -0.35); p.pR.set(-0.35, -0.85, -0.35); } } // (life-v1: the baked pose's elbows down and a little out: straight back, on a body leaning back, they went through the chair and the flank, and the fix then swung the hands out beside the hips)
    // at the rail the elbows hang down and back, close to the body, rather than flaring out to the sides
    const railW = 0; // (no hands on the rail: see above)
    if (railW > 0) { p.pL.lerp(V(0.25, -1, -0.45), railW); p.pR.lerp(V(-0.25, -1, -0.45), railW); }
    if (clip && railW > 0) over(railW, V(0.21, 1.19, 0.3), V(-0.2, 1.19, 0.31), V(0.25, -1, -0.45), V(-0.25, -1, -0.45));
    // the hands at rest: a pose from the library, placed on this avatar's own fitted body (anatomy.js validates it),
    // whenever nothing else has them (no fidget capture, no talk, not walking or standing)
    let restW = 0, restKind = '', glassSide = -1;
    this._intentBack = T && (T.sit !== undefined || T.rise !== undefined) ? 2 : -1; // (reaching back for the seat)
    const restOn = clip && rig.fit && rig.fit.ok && !o.stand && stand < 0.3 && !ANATOMY_OFF;
    if (restOn) {
      // (someone walking past within reach: the hands come in to the lap, the talking hands too)
      // (and the talker's hands too: the speaker's beat is its own gesture below, and the capture keeps the head's)
      // (at a two-top a fidget never takes the hands: they stay planted on the table's top, the fidget moving the body
      // and the head about them; its own arms passed through the top's edge, a hand the cameras saw come and go)
      restW = OFF.rest ? 0 : clamp01(1 - (o.table && o.neighbour ? 0 : this._fidW || 0) * 1.6) * (1 - walk);
      this._passing = !!(this.near && this.near.some((q) => q.src && q.src._loco && !q.src._loco.hidden));
      if (restW > 0.01) {
        const RS = this.restPoseAt(now);
        const fade = REST_OLD ? RS.prev !== RS.kind : !RS.same;
        if (RS.k < 1 && fade) { const A = this.restTargets(RS.prev, REST_OLD ? undefined : RS.vPrev); over(restW, A.tL, A.tR, A.pL, A.pR); }
        const A = this.restTargets(RS.kind, REST_OLD ? undefined : RS.v);
        over(restW * (fade ? RS.k : 1), A.tL, A.tR, A.pL, A.pR);
        restKind = RS.k > 0.5 ? RS.kind : RS.prev;
        plantFrom = o.table && o.neighbour && restW > 0.85 && /^(tableBoth|forearmsTable)$/.test(restKind);
        if (restKind === 'chairBack') this._intentBack = A.back;
        // (a resting hand shifting now and then, along the leg, was tried: the arm passes then slid a hand off a narrow
        // thigh, the posture rule's floating hand)
        if (restKind === 'glass') glassSide = A.roll > 0 ? 0 : 1;
      }
    }
    SEC && SEC.mark('rest'); this.phoneAt = null;
    if (W.phone > 0.001) {
      const c = V(0.0, lerp(sh + 0.34 + (o.table ? 0.06 : 0), 1.1, stand) + lean * 0.05, 0.27 + lean * 0.12); // (at a table, held clear of its top)
      over(W.phone, V(c.x + 0.048, c.y, c.z), V(c.x - 0.048, c.y + 0.01, c.z), V(0.9, -0.5, -0.4), V(-0.9, -0.5, -0.4)); // (both hands on it, the fingertips apart)
      if (W.phone > 0.5) this.phoneAt = c;
    }
    if (W.folded > 0.001) {
      if (restOn) { /* the rest library has the hands (its rows don't line up); the closed posture keeps its lean */ }
      else {
        const c = toL(worldPos(b.spine2, NV()));
        if (ANATOMY_OFF) over(W.folded, V(c.x - 0.13, c.y - 0.1, c.z + 0.21), V(c.x + 0.13, c.y - 0.01, c.z + 0.16), V(0.9, -0.6, -0.1), V(-0.9, -0.6, -0.1)); // (the old pose: through the belly)
        else over(W.folded, V(c.x - 0.13, c.y - 0.13, c.z + 0.25), V(c.x + 0.13, c.y + 0.0, c.z + 0.22), V(0.6, -0.65, 0.6), V(-0.6, -0.65, 0.6)); // one forearm over the other
      }
    }
    if (W.chin > 0.001) {
      if (restOn) { /* bored: the lean and the head; the hands stay in their rest pose from the library */ }
      else {
        const chin = rig.ride(b.head, 0, -0.13, 0.11, NV());
        over(W.chin, clip ? null : hands[0], chin, V(0.6, -0.4, -1), V(-0.15, -1, 0.25));
      }
    }
    if (W.drink > 0.001) {
      // a sip now and then (the hand comes up to the mouth)
      const sip = calm * clamp01((noise(sd + 21, now * 0.22) - 0.35) * 4);
      if (sip > 0) over(W.drink * sip, null, rig.ride(b.head, -0.02, -0.12, 0.2, NV()), null, V(-0.4, -1, 0.3)); // (from in front: the forearm clear of the chest)
    }
    if (W.talk > 0.001 && (!clip || (tk && tk.speaking && !this._passing))) {
      const g = noise(sd + 7, now * 1.3);
      const gh = V(this.side > 0 ? 0.16 : -0.16, lerp(sh + 0.42, 1.12, stand) + g * 0.05, 0.3 + g * 0.04);
      if (this.side > 0) over(W.talk, gh, null, V(0.8, -0.6, -0.2), null);
      else over(W.talk, null, gh, null, V(-0.8, -0.6, -0.2));
    }
    if (idle === 'heckle' && hk > 0) {
      const jab = Math.max(0, noise(sd + 9, now * 2.2)) * 0.06;
      over(hk, null, V(-0.16, sh + 0.78 + jab, 0.5 + jab), null, V(-0.9, -0.4, -0.3));
    }
    // putting a coat on: one arm back and down into a sleeve, then the other, then both hands at the front doing it up
    // (elbows stay low: no arm ever comes up to shoulder height)
    if (coat > 0 && coat < 1) {
      const k = Math.sin(Math.PI * Math.min(1, coat * 1.15));
      const a1 = smooth(coat / 0.35) * (1 - smooth((coat - 0.35) / 0.15)), a2 = smooth((coat - 0.3) / 0.3) * (1 - smooth((coat - 0.65) / 0.12)), zip = smooth((coat - 0.68) / 0.2);
      // (from the chest, wherever the body stands: in front of the seat after the rise capture, at it without one)
      const c = toL(worldPos(b.spine2, NV()));
      const L1 = V(c.x + 0.17, c.y - 0.29, c.z - 0.15), R1 = V(c.x - 0.17, c.y - 0.29, c.z - 0.15), Z = V(c.x + 0.04, c.y - 0.17, c.z + 0.19), Zr = V(c.x - 0.04, c.y - 0.19, c.z + 0.19);
      over(k * Math.max(a1, zip), a1 > zip ? L1 : Z, null, V(0.8, -0.6, -0.2), null);
      over(k * Math.max(a2, zip), null, a2 > zip ? R1 : Zr, null, V(-0.8, -0.6, -0.2));
    }
    SEC && SEC.mark('idles'); // ---- gestures, each with its own timing ----
    const chestAt = () => rig.ride(b.spine2, 0.0, 0.03, 0.17, NV());
    if (G.chest) { const c = chestAt(), h = G.chest.hand; over(G.chest.w * 1.3, ...one(G.chest, V(c.x + 0.07 * h, c.y, c.z), V(0.8, -0.4, -0.3))); }
    if (G.knee) {
      const h = Math.max(0, Math.sin(G.knee.a * G.knee.rate * 6.283 + G.knee.phase)) * 0.06;
      // (down onto this body's own knees, from the fitted legs: a fixed point in front reached forward like a grab)
      const KA = rig.fit && rig.fit.ok ? this.restTargets('knees') : null;
      const kl = KA ? V(KA.tL.x, KA.tL.y + h, KA.tL.z) : V(0.13, sh + 0.21 + h, 0.36), kr = KA ? V(KA.tR.x, KA.tR.y + h * 0.6, KA.tR.z) : V(-0.13, sh + 0.21 + h * 0.6, 0.36);
      over(G.knee.w * 1.3, kl, kr, V(0.3, -0.85, -0.3), V(-0.3, -0.85, -0.3));
    }
    if (G.slap) {
      const h = Math.max(0, Math.sin(G.slap.a * G.slap.rate * 6.283 + G.slap.phase)) * 0.08;
      const x = 0.12 * G.slap.hand;
      // (a slap on the thigh: onto this body's own thigh top, from the fitted legs; at a table, on the table)
      const TA = !o.table && rig.fit && rig.fit.ok ? this.restTargets('thighs') : null;
      const tgt = TA ? (G.slap.hand > 0 ? V(TA.tL.x, TA.tL.y + h, TA.tL.z) : V(TA.tR.x, TA.tR.y + h, TA.tR.z)) : o.table ? V(x, sh + 0.32 + h, 0.42) : V(x, sh + 0.21 + h, 0.36);
      over(G.slap.w * 1.3, ...one(G.slap, tgt, V(0.35, -0.8, -0.5)));
    }
    const headAt = (g, x, y, z) => rig.ride(b.head, x * g.hand, y, z, NV());
    // a giggle behind the hand: in front of the mouth, not the chin (a hand at the chin reads as thinking)
    if (G.mouth) over(G.mouth.w * 1.25, ...one(G.mouth, headAt(G.mouth, 0.015, -0.072, 0.125), V(0.4, -1, 0.1)));
    if (G.wipe) over(G.wipe.w * 1.25, ...one(G.wipe, headAt(G.wipe, 0.05, 0.0, 0.11), V(0.5, -1, 0.1)));
    if (G.whistle) over(G.whistle.w * 1.3, ...one(G.whistle, headAt(G.whistle, 0.01, -0.09, 0.15), V(0.5, -0.9, 0.2)));
    if (G.callout) over(G.callout.w * 1.3, ...one(G.callout, headAt(G.callout, 0.09, -0.06, 0.12), V(0.8, -0.6, 0.1)));
    if (G.neighbour) over(G.neighbour.w, ...one({ hand: this.side }, V(0.48 * this.side, sh + 0.5, 0.12), V(0.4, -0.8, -0.4)));
    if (clapW > 0) {
      const C = G.clap || G.clapHigh || G.clapLow || G.clapShort;
      const chest = toL(worldPos(b.spine2, NV()));
      // the palms meet and stop (wrists ~5 cm apart at contact, palm to palm), the contact sharp, the dominant hand
      // travelling more; F.open (the instanced bake) pins it: 1 open, 0 together
      const g = F.open ?? Math.pow(Math.abs(Math.sin(Math.PI * (C.a ?? now) * C.rate + C.phase)), 0.6);
      const dom = C.hand > 0 ? 1 : -1;
      const lift = G.clapHigh ? (stand > 0.5 ? 0.14 + 0.08 * C.high : 0.05 + 0.05 * C.high) : G.clapLow ? -0.16 : (C.high - 0.5) * 0.1; // (seated, a high clap stays at the chest: higher hides the face)
      const cy = chest.y - 0.02 + lift + (F.clapUp || 0), cz = chest.z + 0.27 - (G.clapLow ? 0.06 : 0) + (F.clapUp || 0) * 0.6; // (the baked clap of the low-detail people sits higher: clear of the belly)
      over(clapW * 1.3, V(chest.x + CLAP_W + 0.006 * stand + (G.clapLow ? 0.012 : 0) + (dom > 0 ? 0.075 : 0.03) * g, cy + 0.01 * dom, cz + (dom > 0 ? 0 : 0.015)),
        V(chest.x - CLAP_W - 0.006 * stand - (G.clapLow ? 0.012 : 0) - (dom > 0 ? 0.03 : 0.075) * g, cy - 0.01 * dom, cz + (dom > 0 ? 0.015 : 0)), V(0.6, -1, -0.15), V(-0.6, -1, -0.15)); // elbows low, not flared
    }
    if (G.snap) {
      const c = toL(worldPos(b.spine2, NV()));
      const tick = Math.sin(G.snap.a * G.snap.rate * 6.283 + G.snap.phase) * 0.02;
      over(G.snap.w, V(c.x + 0.22, c.y + 0.12 + tick, c.z + 0.2), V(c.x - 0.22, c.y + 0.12 - tick, c.z + 0.2), V(1, -0.6, -0.3), V(-1, -0.6, -0.3));
    }
    if (G.fist) {
      const pump = Math.max(0, Math.sin(G.fist.a * G.fist.rate * 6.283 + G.fist.phase));
      // (a seated "yes!": the elbow down by the side, the forearm upright, the fist pumping in front of the shoulder)
      const top = room.vocab === 'stadium' ? 1.05 : 0.7;
      over(G.fist.w * 1.3, ...one(G.fist, V(0.21 * G.fist.hand, sh + 0.56 + pump * (top - 0.56) + stand * 0.4, 0.24), V(0.45, -1, -0.15)));
    }
    if (G.oneArm || G.armsUp || F.lu || F.both) {
      const A = G.armsUp || G.oneArm;
      const wave = Math.sin(now * 2.2 + sd) * 0.05;
      const yUp = lerp(sh + 1.45, 2.2, stand);
      if (A === G.armsUp) over(A.w * 1.4, V(0.24 + wave, yUp, 0.16), V(-0.24 - wave, yUp - 0.02, 0.16), V(1, 0.1, -0.3), V(-1, 0.1, -0.3));
      else over(A.w * 1.4, ...one(A, V((0.24 + wave) * A.hand, yUp, 0.16), V(1, 0.1, -0.3)));
    }
    const toW = (v) => rig.seat.localToWorld(v);
    const dirW = (v) => v.transformDirection(rig.seat.matrixWorld);
    // with a capture, an arm keeps it until a gesture takes it: the IK pose is blended in by the gesture's weight
    const armL = (this._al ||= [b.lUpper, b.lFore, b.lHand]), armR = (this._ar ||= [b.rUpper, b.rFore, b.rHand]);
    const KQ = (this._kq ||= [...Array(6)].map(() => new THREE.Quaternion()));
    const keepL = clip ? (this._kl ||= [KQ[0], KQ[1], KQ[2]]) : null, keepR = clip ? (this._kr ||= [KQ[3], KQ[4], KQ[5]]) : null;
    if (clip) for (let i = 0; i < 3; i++) { keepL[i].copy(armL[i].quaternion); keepR[i].copy(armR[i].quaternion); }
    // (at a two-top, whatever has the hands, a talk, a chin, a phone: never into the glasses or the candle jar, the
    // wrist and the fingertips 5 cm clear of them, slid off sideways over the top; anatomy.js limbs)
    if (o.table && o.neighbour && this.src && this.src.twoTop) for (const t of [p.tL, p.tR]) {
      const w = toW(NV().copy(t)), tt = this.src.twoTop, TO = this._tipO, f = TO ? dirW(NV().copy(TO[t === p.tL ? 0 : 1])).multiplyScalar(TO[t === p.tL ? 0 : 1].length()) : dirW(NV().set(t === p.tL ? -0.24 : 0.24, 0, 0.97)).multiplyScalar(0.09); // (the fingertips where they were last frame, from the wrist)
      if (w.y > (tt.y || 0) + 0.75 + 0.19 || Math.hypot(w.x - tt.x, w.z - tt.z) > TABLE_R + 0.15) continue;
      let moved = false;
      for (let k = 0; k < 3; k++) for (const [ox, oz, r, h] of TABLE_THINGS) {
        if (w.y > (tt.y || 0) + 0.75 + h + 0.05) continue;
        for (const fk of [0, 1]) {
          const ex = w.x + f.x * fk - tt.x - ox, ez = w.z + f.z * fk - tt.z - oz, e = Math.hypot(ex, ez), need = r + 0.05 + 0.01;
          if (e < need && e > 1e-4) { w.x += (ex / e) * (need - e); w.z += (ez / e) * (need - e); moved = true; }
        }
      }
      if (moved) t.copy(toL(w));
    }
    const ikL = !clip || armW.l > 0.002, ikR = !clip || armW.r > 0.002;
    if (ikL) rig.solve(b.lUpper, b.lFore, b.lHand, toW(NV().copy(p.tL)), dirW(NV().copy(p.pL)), rig.bend.lArm, rig.len.arm);
    if (ikR) rig.solve(b.rUpper, b.rFore, b.rHand, toW(NV().copy(p.tR)), dirW(NV().copy(p.pR)), rig.bend.rArm, rig.len.arm);
    // palms: down on the lap/table, turned towards each other when clapping
    const palm = lerp(this.rollRest, this.rollClap, clamp01(clapW * 1.5 + upW));
    // (a hand holding a glass grips it upright)
    // (life-v1: some resting hands lie on the little finger's edge, the palm turned in: each hand its own way)
    const eK = clip && !LIFE_OFF.hands && !LIFE_OFF.edge && this.restVar && !this.force ? restW * (1 - clamp01(clapW * 1.5 + upW)) : 0;
    const palmL = eK && this.restVar.edgeL ? lerp(palm, 0.5, eK) : palm, palmR = eK && this.restVar.edgeR ? lerp(palm, 0.5, eK) : palm;
    if (ikL) rig.roll(b.lHand, b.lFore, glassSide === 0 ? lerp(palmL, 0.35, restW) : palmL, rig.armRestQ.l);
    if (ikR) rig.roll(b.rHand, b.rFore, glassSide === 1 ? -lerp(palmR, 0.35, restW) : -palmR, rig.armRestQ.r);
    // a hand resting on a thigh or a knee lies along it, the fingers forward and over (the wrist straight, the knuckles
    // not dug into the leg)
    // (and a hand on the table lies flat on it, the fingers towards its middle, not dug into the top)
    if (restOn && restW > 0.3 && restKind === 'tableOne') {
      const sd = this._restSide || 1, flat = NV().set(-0.25 * sd, -0.06, 1).normalize().transformDirection(rig.seat.matrixWorld);
      if (sd > 0 && ikL) rig.aim(b.lHand, b.lTip, flat, 0.85 * restW * (1 - clapW));
      if (sd < 0 && ikR) rig.aim(b.rHand, b.rTip, flat, 0.85 * restW * (1 - clapW));
    }
    if (restOn && restW > 0.3 && (restKind === 'tableBoth' || restKind === 'forearmsTable')) { // (both flat on the top)
      const aw = (o.table && o.neighbour ? 1 : 0.85) * restW * (1 - clapW); // (planted at a two-top: the palm's own way, flat, not the forearm's)
      if (ikL) rig.aim(b.lHand, b.lTip, NV().set(-0.25, -0.04, 1).normalize().transformDirection(rig.seat.matrixWorld), aw);
      if (ikR) rig.aim(b.rHand, b.rTip, NV().set(0.25, -0.04, 1).normalize().transformDirection(rig.seat.matrixWorld), aw);
    }
    if (restOn && restW > 0.3 && (restKind === 'thighs' || restKind === 'knees' || restKind === 'thighKnee')) {
      const along = (th, ca, knee) => NV().copy(worldPos(ca, NV())).sub(worldPos(th, NV())).normalize().addScaledVector(NV().set(0, -1, 0).transformDirection(rig.seat.matrixWorld), knee ? 0.3 : 0.2).normalize(); // (the fingers drape over the leg's curve; transformDirection normalises: scale after)
      const rsd = !REST_OLD && this._rso && this._rso.v && !(o.table && o.neighbour) ? (this._rso.k > 0.5 || this._rso.same ? this._rso.v : this._rso.vPrev || this._rso.v).side : this._restSide || 1; // (rest-v2: this rest's own side)
      const kL = restKind === 'knees' || (restKind === 'thighKnee' && rsd > 0), kR = restKind === 'knees' || (restKind === 'thighKnee' && rsd < 0);
      if (ikL) rig.aim(b.lHand, b.lTip, along(b.lThigh, b.lCalf, kL), 0.6 * restW * (1 - clapW));
      if (ikR) rig.aim(b.rHand, b.rTip, along(b.rThigh, b.rCalf, kR), 0.6 * restW * (1 - clapW));
    }
    // what the posture check may expect of the hands: resting on something, or folded
    this._resting = restOn && restW > 0.85 && W.talk < 0.1 && clapW < 0.02 && upW < 0.02 && lb < 0.05 && !(L && L.gestures.length) && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat;
    // (hands planted on a table's top: the body moves about them, a laugh or a turn; nothing draws them off it)
    this._planted = restOn && restW > 0.85 && /^(tableBoth|forearmsTable)$/.test(restKind) && clapW < 0.02 && upW < 0.02 && !(L && L.gestures.length) && W.talk < 0.1 && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat;
    this._armsFolded = false;
    this._restKind = restKind; this._cheerW = Math.max(clapW, upW); this._standW = stand; this._inTraffic = !!(T && !T.hidden); // (sitting down, standing up, walking: not at rest)
    if (STEPPED) this._doing = `${restKind || '-'} idle:${idle} st:${st} clap:${clapW.toFixed(1)} g:${L ? L.gestures.map((g) => g.g).join('+') : ''} T:${T ? Object.keys(T).find((k) => ['walk', 'turn', 'sit', 'rise', 'coat'].includes(k)) || 'stand' : ''}`;
    const aimW = clamp01(clapW * 1.3) * (1 - clamp01(upW * 1.4));
    if (aimW > 0) {
      if (ikL) rig.aim(b.lHand, b.lTip, dirW(V(-0.35, 0.55, 0.76).normalize()), aimW);
      if (ikR) rig.aim(b.rHand, b.rTip, dirW(V(0.35, 0.55, 0.76).normalize()), aimW);
    }
    if (clip) for (let side = 0; side < 2; side++) {
      const arm = side ? armR : armL, keep = side ? keepR : keepL, w = side ? armW.r : armW.l;
      if (w <= 0.002 || w >= 0.62) continue;
      const k = smooth(w * 1.6);
      for (let i = 0; i < 3; i++) { const ik = _q[0].copy(arm[i].quaternion); arm[i].quaternion.copy(keep[i]).slerp(ik, k); }
      rig.upd(arm[0]);
    }
    // (last, after every arm layer: the arms off the bind direction first, then the hands where hands can be)
    if (clip) { const ob0 = this.armsOffBind(); if (ob0 && typeof window !== 'undefined' && window.__armTrace && window.__armTrace.includes(this.name)) this._ob0 = ob0; else this._ob0 = 0; }
    if (clip && stand > 0.6 && walk < 0.05 && clapW < 0.05 && upW < 0.05 && !(coat > 0 && coat < 1) && armW.l < 0.1 && armW.r < 0.1 && (!o.stand || o.standHands === 'down' || o.standHands === 'rail')) this.armsIn(0.7 * smooth((stand - 0.6) / 0.4));
    // anatomy (anatomy.js), last of all: joint limits, then the arms out of every body and the furniture, then the two
    // hands apart (palms meet in a clap, never pass) and the neighbours, then the limits again (a re-solve moves a wrist)
    const fitted = rig.fit && rig.fit.ok && !this._noAnatomy && !ANATOMY_OFF && !OFF.fix;
    const seatedNow = stand < 0.3 && !o.stand;
    // (window.__anaDbg = 'Male_Adult_12': that person's arm collisions after each stage, in their _stages)
    const DBG = typeof window !== 'undefined' && window.__anaDbg === this.name ? (this._stages = []) : null;
    const TR = typeof window !== 'undefined' && window.__armTrace && window.__armTrace.includes(this.name) ? (this._tr = [restKind, 'ob0:' + (this._ob0 || 0)]) : null; // (tools: which arm passes ran this frame)
    if (DBG) { const o = []; armCollisions(this, o); DBG.push('preList ' + JSON.stringify(o.map((x) => [x.what, x.side, x.depth, x.k]))); } if (DBG) DBG.push('pre ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3) + ' near ' + (this.near || []).map((q) => q.name));
    // arms that have barely moved since their last full pass (every arm bone and both collarbones within 0.9 degrees,
    // the chest within 4 mm, no neighbour on the move) take that pass's result again instead of redoing it: most
    // resting hands, most frames; a full pass at least every tenth update all the same
    SEC && SEC.mark('armTargets'); const AQ = (this._aq ||= { inp: [...Array(8)].map(() => new THREE.Quaternion()), out: [...Array(6)].map(() => new THREE.Quaternion()), at: new THREE.Vector3(), n: 99 });
    const AB = (this._ab ||= [b.lUpper, b.lFore, b.lHand, b.rUpper, b.rFore, b.rHand, b.lClav, b.rClav]);
    const chestW = worldPos(b.spine2, NV());
    // (still: this frame's arm pose is the one the last full pass started from; neighbours check each other's stillness)
    // (the chest's turn, and the thighs under resting hands, count too: the arms' own angles can hold while the body moves)
    const BW = (this._bw ||= { q: [0, 1, 2].map(() => new THREE.Quaternion()), now: [0, 1, 2].map(() => new THREE.Quaternion()), bones: [b.spine2, b.lThigh, b.rThigh] });
    for (let i = 0; i < 3; i++) worldQuat(BW.bones[i], BW.now[i]);
    let still = AQ.n < 99 && chestW.distanceToSquared(AQ.at) < 2.5e-5;
    if (still) for (let i = 0; i < 8; i++) if (!AB[i] || Math.abs(AB[i].quaternion.dot(AQ.inp[i])) < 0.99995) { still = false; break; }
    if (still) for (let i = 0; i < 3; i++) if (Math.abs(BW.now[i].dot(BW.q[i])) < 0.99995) { still = false; break; }
    this._armMoved = !still;
    // (arm-v2: hands at rest, as the fall-backs below have it, and the rest they are in)
    const restHold = restOn && restW > 0.5 && clapW < 0.02 && upW < 0.02 && !(L && L.gestures.length) && W.talk < 0.1 && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat ? restKind + (this._rso && this._rso.v ? ':' + this._rso.v.id : '') : '';
    let reuse = still && !REUSE_OFF && restOn && restW > 0.85 && W.talk < 0.1 && !(L && L.gestures.length) && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && clip && fitted && !DBG && AQ.n < 5 && !OV && !(T && !T.hidden) && clapW < 0.05 && upW < 0.05 && !this.fresh && !this._armOff && !/^(tableOne|tableBoth|forearmsTable)$/.test(restKind); // (not while an arm is out of its rest rules, see below; nor a hand on the table, which a turn of the body swings through the thigh)
    // (a neighbour on the move, or one whose moving hands come within reach of mine: the full pass)
    if (reuse && this.near) for (const q of this.near) {
      if (q.src && q.src._loco && !q.src._loco.hidden) { reuse = false; break; }
      if (q._armMoved && q.rig) { const qb = q.rig.b; let close = false; for (const hq of [qb.lHand, qb.rHand]) for (const hm of [b.lHand, b.rHand]) if (worldPos(hq, NV()).distanceToSquared(worldPos(hm, NV())) < 0.16) close = true; if (close) { reuse = false; break; } }
    }
    if (fitted && clip && Person.reuseCount) Person.reuseCount[reuse ? 'reuse' : still ? 'stillFull' : 'full']++;
    if (TR) TR.push(reuse ? 'reuse' : still ? 'stillFull' : 'full');
    if (reuse) {
      for (let i = 0; i < 6; i++) AB[i].quaternion.copy(AQ.out[i]);
      rig.upd(b.lUpper); rig.upd(b.rUpper);
      joints(this, true); // (the neck's limit, every frame)
      AQ.n++;
    } else {
      for (let i = 0; i < 8; i++) if (AB[i]) AQ.inp[i].copy(AB[i].quaternion);
      for (let i = 0; i < 3; i++) BW.q[i].copy(BW.now[i]);
      AQ.at.copy(chestW);
      let m1 = 0;
      if (fitted) { joints(this, true); m1 = fixArms(this, seatedNow, clapW > 0.05); }
      if (TR) TR.push('m1:' + m1);
      if (DBG) DBG.push('fix1 ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3) + ' elbows ' + limbMetrics(this).arms.map((a) => a.inside.toFixed(2) + '/' + a.out.toFixed(2) + '/' + a.fwd.toFixed(2)).join(' '));
      this._kho = false;
      if (clip && !OFF.fix) this.keepHandsOut(stand < 0.3, clapW > 0.05); // the two hands apart, the neighbours' hands
      if (DBG) DBG.push('keep ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3) + ' elbows ' + limbMetrics(this).arms.map((a) => a.inside.toFixed(2) + '/' + a.out.toFixed(2) + '/' + a.fwd.toFixed(2)).join(' '));
      if (fitted) {
        // (again if anything moved: the guard's own re-solve may have put an arm back in, and the first pass may not
        // have converged; nothing moved means nothing was found, so the pose is clean)
        const m2 = m1 || this._kho ? fixArms(this, seatedNow, clapW > 0.05) : 0;
        if (DBG) DBG.push('fix2 ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3) + ' elbows ' + limbMetrics(this).arms.map((a) => a.inside.toFixed(2) + '/' + a.out.toFixed(2) + '/' + a.fwd.toFixed(2)).join(' '));
        // a rest pose this body can't take cleanly (a bulky front and clasped hands): straight to the thighs, fixed again
        this._fellBack = this._fb1 = false;
        // (only hands that are resting: never a clap, a gesture, a phone, a drink, a talker's or a heckler's hand)
        const handsAtRest = restOn && restW > 0.5 && clapW < 0.02 && upW < 0.02 && !(L && L.gestures.length) && W.talk < 0.1 && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat;
        if (TR) TR.push('kho:' + this._kho, 'm2:' + m2);
        // (arm-v2: the fall-back held: by this rest's key, the kind and its variant)
        const fbKey = restKind + (this._rso && this._rso.v ? ':' + this._rso.v.id : ''), FBH = (this._fbh ||= { k1: '', k2: '', off: -9 });
        if (!handsAtRest) { if (now - FBH.off > 0.5) FBH.k1 = FBH.k2 = ''; } else FBH.off = now;
        const fb1c = handsAtRest && m2 > 0 && armCollisions(this) > 0;
        if (fb1c && !ARM_OLD) FBH.k1 = fbKey;
        if (fb1c || (!ARM_OLD && handsAtRest && FBH.k1 === fbKey)) {
          this._fellBack = this._fb1 = true; if (TR) TR.push(fb1c ? 'FB1' : 'fb1');
          const A = this.restTargets(o.table && o.neighbour ? 'tableBoth' : 'thighs'); // (at a table: on it)
          rig.solve(b.lUpper, b.lFore, b.lHand, rig.seat.localToWorld(NV().copy(A.tL)), NV().copy(A.pL).transformDirection(rig.seat.matrixWorld), rig.bend.lArm, rig.len.arm);
          rig.solve(b.rUpper, b.rFore, b.rHand, rig.seat.localToWorld(NV().copy(A.tR)), NV().copy(A.pR).transformDirection(rig.seat.matrixWorld), rig.bend.rArm, rig.len.arm);
          rig.roll(b.lHand, b.lFore, this.rollRest, rig.armRestQ.l); rig.roll(b.rHand, b.rFore, -this.rollRest, rig.armRestQ.r);
          rig.upd(b.lUpper); rig.upd(b.rUpper);
          fixArms(this, seatedNow, false);
        }
        // (a resting arm locked straight to its leg: the shoulders moved on after the targets were placed, a slouch or
        // a lean back. Placed again from where the shoulders are now, so the elbows rest bent: the limbs rules)
        const fb2c = handsAtRest && !this._fellBack && (this.straightArm(0) || this.straightArm(1) || this.armAngle(0) > 2.44 || this.armAngle(1) > 2.44 || (/^(thighs|knees)$/.test(restKind) && Math.abs(this.armAngle(0) - this.armAngle(1)) > 0.78));
        if (fb2c && !ARM_OLD) FBH.k2 = fbKey;
        if (fb2c || (!ARM_OLD && handsAtRest && !this._fellBack && FBH.k2 === fbKey)) {
          this._fellBack = true; if (TR) TR.push(fb2c ? 'FB2' : 'fb2');
          if (fb2c) { if (ARM_OLD) this._leanAdj = Math.min(0.3, (this._leanAdj || 0) + 0.07); else this._leanAdjT = Math.min(0.3, Math.max(this._leanAdjT || 0, this._leanAdj || 0) + 0.07); } // (arm-v2: eased in, below)
          // (hands planted on a table's top stay where they are: the lean brings the shoulders back over them)
          if (!this._planted) {
            const A = this.restTargets(restKind || 'thighs');
            rig.solve(b.lUpper, b.lFore, b.lHand, rig.seat.localToWorld(NV().copy(A.tL)), NV().copy(A.pL).transformDirection(rig.seat.matrixWorld), rig.bend.lArm, rig.len.arm);
            rig.solve(b.rUpper, b.rFore, b.rHand, rig.seat.localToWorld(NV().copy(A.tR)), NV().copy(A.pR).transformDirection(rig.seat.matrixWorld), rig.bend.rArm, rig.len.arm);
            rig.roll(b.lHand, b.lFore, this.rollRest, rig.armRestQ.l); rig.roll(b.rHand, b.rFore, -this.rollRest, rig.armRestQ.r);
            rig.upd(b.lUpper); rig.upd(b.rUpper);
            fixArms(this, seatedNow, false);
          }
        }
        if (m1 || m2 || this._kho || this._fellBack) joints(this, true); // (nothing moved since the first: still within them)
        // (a push out of a body can swing an upper arm back out to the bind pose's line: off it again, and clear)
        if (clip && this.armsOffBind()) { if (TR) TR.push('OB1'); fixArms(this, seatedNow, clapW > 0.05); joints(this, true); }
        // (the elbows' last word: anatomy.js, the limbs rules; not for someone walking, sitting down or standing up,
        // whose arms are the capture's swing)
        if (!(T && !T.hidden) && !coat && clapW < 0.05) { const gn = guardElbows(this, false); if (TR) TR.push('G:' + gn + ':' + (guardElbows.tried || '')); if (clip && this.armsOffBind()) { if (TR) TR.push('OB2'); fixArms(this, seatedNow, clapW > 0.05); joints(this, true); } }
        this._armOff = handsAtRest && (this.armAngle(0) > 2.44 || this.armAngle(1) > 2.44);
        // (resting on both legs, the two elbows alike: the more bent arm's hand slid on along its thigh, a few cm at a
        // time, until they are within 25°; kept only if nothing collides more)
        if (handsAtRest && /^(thighs|knees)$/.test(restKind) && Math.abs(this.armAngle(0) - this.armAngle(1)) > 0.75) { // (within about 43°: two arms at rest needn't match)
          if (TR) TR.push('BAL');
          const side = this.armAngle(0) < this.armAngle(1) ? 0 : 1, up = side ? b.rUpper : b.lUpper, fo = side ? b.rFore : b.lFore, ha = side ? b.rHand : b.lHand;
          const keep = [up.quaternion.clone(), fo.quaternion.clone(), ha.quaternion.clone()], before = armCollisions(this);
          const th = side ? b.rThigh : b.lThigh, ca = side ? b.rCalf : b.lCalf, along = NV().copy(worldPos(ca, NV())).sub(worldPos(th, NV())).normalize();
          for (let k = 0; k < 4 && Math.abs(this.armAngle(0) - this.armAngle(1)) > 0.75; k++) {
            const Wt = worldPos(ha, NV()).addScaledVector(along, 0.035);
            rig.solve(up, fo, ha, Wt, NV().copy(worldPos(fo, NV())).sub(worldPos(up, NV())).normalize(), side ? rig.bend.rArm : rig.bend.lArm, rig.len.arm);
          }
          if (armCollisions(this) > before) { up.quaternion.copy(keep[0]); fo.quaternion.copy(keep[1]); ha.quaternion.copy(keep[2]); rig.upd(up); }
        }
      }
      // (at the arena's barrier: no hand through it, whatever the pose put there (a phone held out, a talking hand): the
      // hand drawn back to the near side of the tube, below its top; the limbs rules)
      if (o.stand && this.src && this.src.rail) for (const [up, fo, ha, bend, s] of [[b.lUpper, b.lFore, b.lHand, rig.bend.lArm, 1], [b.rUpper, b.rFore, b.rHand, rig.bend.rArm, -1]]) {
        const H = worldPos(ha, NV());
        if (H.y > 1.17 || H.z > BARRIER_Z + 0.09) continue;
        H.z = BARRIER_Z + 0.09;
        rig.solve(up, fo, ha, H, rig.fit && rig.fit.ok ? NV().copy(bestElbow(this, s > 0 ? 0 : 1, H, false)) : NV().set(s * 0.4, -0.8, -0.3).transformDirection(rig.seat.matrixWorld).normalize(), bend, rig.len.arm);
      }
      // (a clap, once more after the wrists' own limits: they turn the hands, and the fingertips with them, towards each other)
      if (clip && clapW > 0.05 && !OFF.fix) { this._kho = false; this.keepHandsOut(stand < 0.3, true); if (this._kho && fitted) fixArms(this, seatedNow, true); } // (and the elbows out of the body again, if it moved them)
      // (arm-v2: a resting arm's elbow held near where it was last frame: the passes above choose an elbow's place on
      // its circle round the shoulder-wrist line among discrete answers (bestElbow's 24 points, a fall-back's pole, a
      // push out of the flank), and a body on the edge between two answers swung the whole arm 15-35 degrees in a frame.
      // The elbow and the hand turn towards their answer at most 180 degrees a second and the wrist moves at most 1 m a
      // second, each kept only if the arm then hits nothing more than the passes' answer does)
      if (!ARM_OLD && fitted && clip && seatedNow && restHold) this.holdElbows(now);
      for (let i = 0; i < 6; i++) AQ.out[i].copy(AB[i].quaternion);
      AQ.n = 0;
    }
    if (DBG) DBG.push('end ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3) + ' elbows ' + limbMetrics(this).arms.map((a) => a.inside.toFixed(2) + '/' + a.out.toFixed(2) + '/' + a.fwd.toFixed(2)).join(' '));

    // (last of all, the fingertips themselves clear of the glasses and the jar: a wrist whose palm or tip is within 5 cm
    // of one is moved off it sideways over the top, the elbow where it was; a talk or a gesture's capture turns the
    // hand its own way, and the passes above may have put it back)
    if (clip && o.table && o.neighbour && this.src && this.src.twoTop && stand < 0.3 && !(T && !T.hidden) && clapW < 0.05) {
      const tt = this.src.twoTop, ty = (tt.y || 0) + 0.75;
      for (const [up, fo, ha, tip, bend] of [[b.lUpper, b.lFore, b.lHand, b.lTip, rig.bend.lArm], [b.rUpper, b.rFore, b.rHand, b.rTip, rig.bend.rArm]]) {
        if (!tip) continue;
        const H = worldPos(ha, NV()), Tp = worldPos(tip, NV());
        if (H.y > ty + 0.2 || Math.hypot(H.x - tt.x, H.z - tt.z) > TABLE_R + 0.15) continue;
        const sh = NV().set(0, 0, 0);
        for (const q of [NV().copy(H).lerp(Tp, 0.5), Tp]) for (const [ox, oz, r, h] of TABLE_THINGS) {
          if (q.y > ty + h + 0.05) continue;
          const ex = q.x + sh.x - tt.x - ox, ez = q.z + sh.z - tt.z - oz, e = Math.hypot(ex, ez), need = r + 0.05 + 0.008;
          if (e < need && e > 1e-4) { sh.x += (ex / e) * (need - e); sh.z += (ez / e) * (need - e); }
        }
        if (sh.lengthSq() < 1e-8) continue;
        const pole = NV().copy(worldPos(fo, NV())).sub(worldPos(up, NV()));
        H.add(sh); H.y = Math.max(H.y, ty + 0.055); // (and on the top, not into it)
        rig.solve(up, fo, ha, H, pole, bend, rig.len.arm);
        rig.upd(up);
      }
    }
    // (where the fingertips are from the wrists, kept for the next frame's glass check above)
    if (o.table && o.neighbour && b.lTip && b.rTip) { const TO = (this._tipO ||= [new THREE.Vector3(), new THREE.Vector3()]); TO[0].copy(worldPos(b.lTip, NV())).sub(worldPos(b.lHand, NV())).transformDirection(rig.inv).multiplyScalar(worldPos(b.lTip, NV()).distanceTo(worldPos(b.lHand, NV()))); TO[1].copy(worldPos(b.rTip, NV())).sub(worldPos(b.rHand, NV())).transformDirection(rig.inv).multiplyScalar(worldPos(b.rTip, NV()).distanceTo(worldPos(b.rHand, NV()))); }
    SEC && SEC.mark('armFix'); // ---- legs: feet planted on the floor (seated, standing or stepping) ----
    const ankle = rig.restY.foot;
    if (!clip) for (const [s, th, ca, ft, bend] of [[1, b.lThigh, b.lCalf, b.lFoot, rig.bend.lLeg], [-1, b.rThigh, b.rCalf, b.rFoot, rig.bend.rLeg]]) {
      const step = Math.sin(wph + (s > 0 ? 0 : Math.PI));
      // (seated, the ankle under the knee: where a vertical shin puts it for this hip and these bones, a little behind,
      // within this person's own foot placement; the limbs rules)
      let fz = this.footFwd + (s > 0 ? 0.03 : 0);
      { const H = toL(worldPos(th, NV())), [l1, l2] = rig.len.leg, dy = ankle + l2 - H.y, h = l1 * l1 - dy * dy;
        if (h > 0) fz = Math.min(fz, H.z + Math.sqrt(h) - 0.02 + (s > 0 ? 0.015 : 0)); }
      const seatedT = _v[2].set(s * this.feet, ankle, fz);
      const standT = _v[3].set(s * 0.11, ankle + walk * Math.max(0, step) * 0.07, 0.02 + (o.stand ? (s > 0 ? 0.06 : -0.02) : 0) + walk * step * 0.2);
      const target = toW(NV().copy(seatedT).lerp(standT, stand));
      rig.solve(th, ca, ft, target, dirW(NV().set(s * 0.25, lerp(0.4, 0, stand), 1)), bend, rig.len.leg);
    }

    // ---- eyes: saccades between looks (the eye bones ride on the head, so they counter-roll against it for free) ----
    const xp = this.exprAt(now, room, calm);
    if (b.lEye && b.rEye) {
      const S = this.saccades;
      let lo = 0, hi = S.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t <= now) lo = m; else hi = m - 1; }
      const cur = S[lo], prev = S[Math.max(0, lo - 1)], k = smooth((now - cur.t) / 0.045); // a saccade takes ~45 ms
      const busyEyes = 1 - 0.7 * clamp01(lb * 2 + W.phone);
      const sx = (q) => (q.nb ? q.x * (this.side || 1) : q.x); // (a look to the friend: their side)
      let ex = lerp(sx(prev), sx(cur), k) * calm * busyEyes, ey = lerp(prev.y, cur.y, k) * calm * busyEyes;
      if (walk) { ex *= 0.4; ey = ey * 0.4 + 0.06; }
      ey += 0.22 * W.phone + xp.down * 0.2;
      ex += xp.rollX + (this._lookE || 0); ey += xp.rollY;
      rig.euler(b.lEye, ey, ex, 0); rig.euler(b.rEye, ey, ex, 0);
      this._eyeY = ey;
    }
    SEC && SEC.mark('legs2eyes'); // ---- face ----
    if (face && face.ok) {
      // (an attentive listener blinks less; the upper lids follow the eyes down; the lids alone go on between a calm
      // person's held poses, faceTick: never a frozen face)
      this._att = room.mode === 'live' && mur < 0.5 ? attention : 0; this._calmK = calm;
      const bl = this.blinkAt(now, this._att) * calm, lid = clamp01((this._eyeY || 0) / 0.22) * 0.3;
      const cl = (tk ? tk.laugh : 0) * W.talk; // a laugh at a friend's line
      const M = this.moodAt(now, room, lb, ls, hk); // (the moment's expression, by temperament: faces-v1)
      // (life-v1: listening is never a held face: a faint smile coming and going with the room's warmth, the brows up a
      // little as the room leans in (attention rising: a setup), the lips pressed now and then, the mouth parting, the
      // eyes narrowing with interest; slow, each on the person's own phase)
      if (!LIFE_OFF.face) {
        const lsd = this.lifeSeed || 0, dtA = now - (this._attT ?? -1e9);
        this._attS = this._attS === undefined || !(dtA > 0 && dtA < 0.5) ? attention : this._attS + (attention - this._attS) * (1 - Math.exp(-dtA / 2.5));
        this._attT = now;
        const mic = calm * (room.mode === 'live' || room.mode === undefined ? 1 : 0.6) * (1 - clamp01(lb * 4)) * (1 - clamp01(ls * 2)) * (1 - W.phone) * (mur < 0.5 ? 1 : 0.5);
        const setup = clamp01((attention - this._attS) * 6);
        const mk = (M._mk ||= {});
        mk.smile = mic * (0.03 + 0.07 * warmth) * clamp01(noise(lsd + 21, now * 0.09) * 1.5 + 0.4);
        mk.inner = mic * (0.1 * Math.max(0, noise(lsd + 23, now * 0.17)) + 0.3 * setup);
        mk.outer = mic * (0.08 * Math.max(0, noise(lsd + 29, now * 0.12)) + 0.2 * setup);
        mk.press = mic * 0.35 * clamp01((noise(lsd + 25, now * 0.13) - 0.25) * 2);
        mk.jaw = mic * 0.05 * clamp01(noise(lsd + 27, now * 0.07) + 0.2);
        mk.squint = mic * 0.12 * clamp01(noise(lsd + 31, now * 0.1));
        M.smile += mk.smile; M.inner += mk.inner; M.press += mk.press; M.squint += mk.squint; this._mkJaw = mk.jaw; this._mkOuter = mk.outer;
      } else { this._mkJaw = 0; this._mkOuter = 0; }
      const sm = clamp01(ls * (0.85 + 0.3 * this.eager) + this.smileBase * calm * (1 - W.phone) + cl * 0.9 + xp.smile + M.smile + speaking * 0.12);
      const g = clamp01(lb * 1.25 + cl * 0.7); // the laugh, graded: 0 a smile … 1 a full laugh
      const bored = W.chin, phone = W.phone;
      // Rocketbox shapes are small at weight 1 (smile 4.4 mm, cheek 7 mm, jaw 18 mm), so the smile is overdriven.
      // A Duchenne laugh: the eyes narrow and the cheeks rise with it, the upper lip lifts, and the jaw opens only as
      // far as the smile allows (never a round "O"), pulsing with each "ha".
      const sk = xp.smirk + M.smirk + (st === 'nose' ? this.smirkSide * 0.6 * Math.min(1, ls * 1.6) : 0); // an asymmetric smile: one corner only
      this._lidL = Math.max(lid, bored * 0.3, phone * 0.25, 0.12 * g); this._lidR = Math.max(lid, bored * 0.3, phone * 0.25, 0.115 * g);
      face.set('eyeBlinkLeft', Math.max(bl, this._lidL));
      face.set('eyeBlinkRight', Math.max(bl, this._lidR));
      // (pushed: at TV distance the shapes must read; a big laugh near full at the peak, a chuckle a clear smile)
      // (the laugh's face follows the take: an open-mouthed roar head back or doubled over, a closed-mouth giggle or
      // shoulder shake, a crinkle-eyed grin turning to a friend or through the nose)
      const fk = L && g > 0.05 ? FACE_TAKE[st] || FACE_TAKE.back : FACE_TAKE.none;
      const sq = xp.squint + M.squint + fk.sq * g, sqL = Math.min(1.1, 1.0 * g + 0.4 * sm + sq), sqR = Math.min(1.1, 0.95 * g + 0.4 * sm + sq * 0.8);
      const chL = Math.min(1.4, sm * 1.3 + 0.35 * g + (sk > 0 ? sk * 0.6 : 0)), chR = Math.min(1.4, sm * 1.25 + 0.35 * g + (sk < 0 ? -sk * 0.6 : 0));
      if (face.duo) face.set('duchenne', Math.min(1.4, Math.max((chL + chR) / 2, (sqL + sqR) / 1.6))); // (one shape on the TV: 0.8 squint + cheek)
      else { face.set('eyeSquintLeft', sqL); face.set('eyeSquintRight', sqR); face.set('cheekSquintLeft', chL); face.set('cheekSquintRight', chR); }
      // (no frown shape on the TV: the smile's corners come down a little instead)
      const fr = xp.frown + M.frown, frTV = face.slots.mouthFrownLeft.length ? 0 : fr * 0.4;
      face.set('mouthSmileLeft', 1.85 * sm + 0.35 * g + 0.1 + (sk > 0 ? sk * 1.3 : 0) - frTV); face.set('mouthSmileRight', 1.8 * sm + 0.35 * g + 0.1 + (sk < 0 ? -sk * 1.3 : 0) - frTV);
      face.set('mouthUpperUpLeft', 0.6 * g + M.upper); face.set('mouthUpperUpRight', 0.56 * g + M.upper);
      face.set('jawOpen', Math.min((LIFE_OFF.face ? 0.15 + 0.62 * sm : 0.2 + 0.8 * sm) + speaking * 0.3, Math.max(jaw * fk.jaw + (this._mkJaw || 0), g * (LIFE_OFF.face ? (0.45 + 0.25 * ha) * fk.jaw : (SMOOTH ? 0.5 + 0.4 * ha : 0.45 + 0.6 * ha) * fk.jaw * (L ? 0.6 + 0.75 * hash(this.seed * 0.71 + (L.id | 0) * 3.3) : 1)))));  // (life-v1: the mouth opens wider on each "ha", closes a little between) // (a big laugh's mouth visibly open, within the smile)
      face.set('eyeLookDownLeft', phone * 0.7 + (xp.down + M.down) * 0.5); face.set('eyeLookDownRight', phone * 0.7 + (xp.down + M.down) * 0.5);
      const surprise = Math.max(L && L.t > -0.1 && L.t < 0.35 && st === 'back' ? Math.sin(((L.t + 0.1) / 0.45) * Math.PI) * 0.6 : 0, xp.wide);
      face.set('eyeWideLeft', surprise + vocal * 0.3); face.set('eyeWideRight', surprise + vocal * 0.3);
      const emph = speaking * 0.3 * clamp01((noise(sd + 37, now * 1.1) - 0.25) * 3); // brows up on the stressed words
      const bL = surprise * 0.5 + 0.12 * g + vocal * 0.3 + emph * 0.7 + xp.browL + (this._mkOuter || 0) + (M.browOne && this.smirkSide > 0 ? M.browOne : 0);
      const bR = surprise * 0.5 + 0.12 * g + vocal * 0.3 + emph * 0.7 + xp.browR + (this._mkOuter || 0) * 0.9 + (M.browOne && this.smirkSide < 0 ? M.browOne : 0);
      const inner = 0.05 + 0.16 * g + surprise * 0.5 + mur * 0.12 + vocal * 0.3 + emph + xp.inner + M.inner;
      // (the TV has the left outer brow only: one brow up is the left one, both up goes to the inner brows)
      // (the brow and the press overdriven like the smile: at weight 1 they move a few millimetres, too little to read)
      if (face.oneBrow) { face.set('browInnerUp', inner + 0.5 * Math.min(bL, bR)); face.set('browOuterUpLeft', Math.min(1.7, Math.abs(bL - bR) * 1.9)); }
      else { face.set('browInnerUp', inner); face.set('browOuterUpLeft', bL); face.set('browOuterUpRight', bR); }
      face.set('mouthFrownLeft', bored * 0.35 + fr); face.set('mouthFrownRight', bored * 0.35 + fr * 0.8);
      const pk = face.duo ? 1.5 : 1; // (the TV's one press shape, overdriven as the brow)
      face.set('mouthPressLeft', Math.min(1.4, (bored * 0.4 + phone * 0.2 + xp.press + M.press) * pk)); face.set('mouthPressRight', Math.min(1.4, (bored * 0.4 + xp.press + M.press) * pk));
    }
    // (laugh-v2: the arms turn at most 330 degrees a second, about 11 a frame at 30 fps, and outside a clap or a raised
    // arm they are eased over 0.1 s: a switch in the arm pass (a short clap ending, a hand-to-chest gesture's elbow
    // flipping sides, a rest handed over) swung a whole arm 40-105 degrees in one frame, and a resting arm's solve could
    // flip between two answers frame by frame. The eased arms are kept only if they hit nothing the solved ones didn't
    // and a resting or planted hand stays on its rest (within 2 cm); otherwise the solved pose stands.)
    if (SMOOTH && !this.force && b.lUpper) {
      const dtA = now - (this._amT ?? -1e9); this._amT = now;
      const AB = (Person._armB ||= ['lClav', 'rClav', 'lUpper', 'rUpper', 'lFore', 'rFore', 'lHand', 'rHand']), AQ0 = (this._am ||= AB.map(() => new THREE.Quaternion()));
      const AQ1 = (this._am1 ||= AB.map(() => new THREE.Quaternion()));
      const ok = !this.fresh && this._amOk && dtA > 0 && dtA < 0.5, lim = 5.76 * dtA; // (330 degrees a second, in radians)
      let moved = false;
      if (ok) {
        const before = armCollisions(this), hL = NV().setFromMatrixPosition(b.lHand.matrixWorld), hR = NV().setFromMatrixPosition(b.rHand.matrixWorld);
        for (let i = 0; i < AB.length; i++) {
          const bn = b[AB[i]]; if (!bn) continue;
          AQ1[i].copy(bn.quaternion);
          const d = 2 * Math.acos(Math.min(1, Math.abs(AQ0[i].dot(bn.quaternion))));
          const k = Math.min(clapW > 0.05 || upW > 0.05 ? 1 : 1 - Math.exp(-dtA / 0.1), d > lim ? lim / d : 1);
          if (k < 1 && d > 1e-4) { bn.quaternion.copy((Person._qs ||= new THREE.Quaternion()).copy(AQ0[i]).slerp(bn.quaternion, k)); moved = true; }
        }
        if (moved) {
          b.lClav.updateMatrixWorld(true); b.rClav.updateMatrixWorld(true);
          const rest = this._resting || this._planted;
          const off = rest && (NV().setFromMatrixPosition(b.lHand.matrixWorld).distanceTo(hL) > 0.02 || NV().setFromMatrixPosition(b.rHand.matrixWorld).distanceTo(hR) > 0.02);
          if (off || armCollisions(this) > before) {
            // (the solved arms back, but the hands' own easing kept when it hits nothing: a hand's turn doesn't move the wrist)
            for (let i = 0; i < 6; i++) if (b[AB[i]]) b[AB[i]].quaternion.copy(AQ1[i]);
            b.lClav.updateMatrixWorld(true); b.rClav.updateMatrixWorld(true);
            if (armCollisions(this) > before) { for (let i = 6; i < AB.length; i++) if (b[AB[i]]) b[AB[i]].quaternion.copy(AQ1[i]); b.lHand.updateMatrixWorld(true); b.rHand.updateMatrixWorld(true); }
          }
        }
      }
      for (let i = 0; i < AB.length; i++) if (b[AB[i]]) AQ0[i].copy(b[AB[i]].quaternion);
      this._amOk = true;
    }
    if (!ARM_OLD && fitted && clip) this.keepElbows(now, restHold); // (arm-v2: where the arms are as shown, for the next frame's hold)
    // how visibly they are laughing (smoothed over ~0.8 s), for the director's choice of close-up (laughRank)
    {
      const gw = (k) => (G[k] ? G[k].w : 0);
      const vis = lb + 0.25 * ls + 0.4 * Math.min(1, clapW + gw('chest') + gw('knee') + gw('slap') + gw('mouth'));
      const dtS = now - (this._lsT ?? -1e9), e = dtS > 0 && dtS < 0.5 ? 1 - Math.exp(-dtS / 0.8) : 1;
      this._lsT = now;
      this.laughScore += (vis - this.laughScore) * e;
    }
    const S = (this.state ||= {});
    SEC && SEC.mark('face'); this._off = !inShot(NV().setFromMatrixPosition(b.pelvis.matrixWorld));
    this._calm = !L && clapW < 0.03 && upW < 0.03 && lb < 0.05 && W.talk < 0.05 && (this._fidW || 0) < 0.05 && (this._lifeAct || 0) < 0.02 && !OV && !(T && !T.hidden) && (o.stand || stand < 0.05);
    S.lb = lb; S.ls = ls; S.clap = clapW; S.up = upW; S.vocal = vocal; S.idle = idle; S.busy = busy; S.style = st; S.take = L && L.take ? L.take.sig : null; S.gestures = L ? L.gestures : NONE;
    // this person's matrices, up to date for the renderer (three's traversal skips the seat: see the Rig). Everything
    // posed after the full pass above refreshed its own subtree (the IK, rolls, aims, clamps), except the eyes.
    if (this._full === undefined || this.fresh) { rig.model.updateMatrixWorld(true); this._full = true; }
    else { if (b.lEye) b.lEye.updateMatrixWorld(true); if (b.rEye) b.rEye.updateMatrixWorld(true); if (b.lHand) b.lHand.updateMatrixWorld(true); if (b.rHand) b.rHand.updateMatrixWorld(true); } // (and the fingers, left out until now)
    for (let i = 0; i < rig.skeletons.length; i++) rig.skeletons[i].dirty = true;
    SEC && SEC.mark('matrices');
    if (vpi > 256 && !Person._vpWarned) { Person._vpWarned = true; console.warn('[crowd] Person.update used', vpi, 'scratch vectors of 256'); }
  }

  /** Between a calm person's held poses: the eyelids only (blinks are 250 ms; a 5 Hz pose would miss most of them). */
  faceTick(now) {
    const face = this.face;
    if (!face || !face.ok || this._lidL === undefined) return;
    const bl = this.blinkAt(now, this._att || 0) * (this._calmK ?? 1);
    face.set('eyeBlinkLeft', Math.max(bl, this._lidL)); face.set('eyeBlinkRight', Math.max(bl, this._lidR));
  }
  blinkAt(t, attentive = 0) {
    // binary search the schedule for the last blink before t; a blink closes in 80 ms and opens in 170 ms
    const a = this.blinks;
    let lo = 0, hi = a.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (a[mid] <= t) lo = mid; else hi = mid - 1; }
    const shape = (dt) => (dt < 0 ? 0 : dt < 0.08 ? smooth(dt / 0.08) : dt < 0.25 ? 1 - smooth((dt - 0.08) / 0.17) : 0);
    let v = this.blinkSkip && this.blinkSkip[lo] < 0.3 * attentive ? 0 : shape(t - a[lo]); // (held open a little longer while rapt)
    // and a big eye movement brings a blink with it
    const S = this.saccades;
    if (S && S.length) {
      let i = 0, j = S.length - 1;
      while (i < j) { const m = (i + j + 1) >> 1; if (S[m].t <= t) i = m; else j = m - 1; }
      if (i > 0 && Math.abs(S[i].x - S[i - 1].x) > 0.26) v = Math.max(v, shape(t - S[i].t + 0.02));
    }
    return v;
  }

  /**
   * This person's own expressions, from their temperament (a seeded schedule; each event decided by the state at
   * the time): a smirk, a brow raise, one brow up, surprise, pressed lips, a frown, a shy look down, and the
   * sceptic's eye-roll in dead air. Returns the shape offsets for this frame.
   */
  /** arm-v2: each elbow's place from its shoulder in the chest's frame, and the wrist's in the seat's, after the arm pass. */
  keepElbows(now, key) {
    const b = this.rig.b, H = (this._eh ||= { key: '', at: -9, e: [new THREE.Vector3(), new THREE.Vector3()], w: [new THREE.Vector3(), new THREE.Vector3()], h: [new THREE.Quaternion(), new THREE.Quaternion()] });
    H.h[0].copy(b.lHand.quaternion); H.h[1].copy(b.rHand.quaternion);
    const qi = worldQuat(b.spine2, _hq[0]).invert();
    for (let side = 0; side < 2; side++) {
      H.e[side].copy(worldPos(side ? b.rFore : b.lFore, _hv[0])).sub(worldPos(side ? b.rUpper : b.lUpper, _hv[1])).applyQuaternion(qi);
      H.w[side].copy(worldPos(side ? b.rHand : b.lHand, _hv[0])).applyMatrix4(this.rig.inv);
    }
    H.key = key; H.at = now;
  }
  /** arm-v2: see the arm pass. Turns each resting elbow from last frame's place towards this frame's, at most 6 degrees a frame. */
  holdElbows(now) {
    const H = this._eh, rig = this.rig, b = rig.b;
    const dt = now - (H ? H.at : -9);
    const TR = typeof window !== 'undefined' && window.__armTrace && window.__armTrace.includes(this.name) ? this._tr : null;
    if (TR) TR.push('H:' + (H ? H.key + '/' + dt.toFixed(3) : 'none'));
    if (!H || dt <= 0 || dt > 0.1) return; // (from whatever the arms did last frame: a gesture handing them back to the rest too)
    const lim = 3.14 * dt, q = worldQuat(b.spine2, _hq[0]);
    for (let side = 0; side < 2; side++) {
      const up = side ? b.rUpper : b.lUpper, fo = side ? b.rFore : b.lFore, ha = side ? b.rHand : b.lHand;
      const W = worldPos(ha, _hv[2]);
      // (and the wrist from last frame's place towards this frame's at most 1 m a second: a pass that drew a hand back
      // towards its own side one frame and not the next moved it 7 cm in a frame)
      const Wp = _hv[3].copy(H.w[side]).applyMatrix4(rig.seat.matrixWorld), dW = Wp.distanceTo(W), wl = 1.0 * dt;
      if (TR) TR.push('w' + side + ':' + dW.toFixed(3));
      if (dW > 0.25) continue; // (somewhere else altogether: no hold)
      const moveW = dW > wl, W0 = _hv[1].copy(W); // (W0: the passes' wrist)
      if (moveW) W.lerpVectors(Wp, W, wl / dW);
      const S = worldPos(up, _hv[4]), dNow = worldPos(fo, _hv[5]).sub(S).normalize(), dPrev = _hv[6].copy(H.e[side]).applyQuaternion(q).normalize();
      const ang = dNow.angleTo(dPrev), hAng = 2 * Math.acos(Math.min(1, Math.abs(ha.quaternion.dot(H.h[side])))), hNow = _hq[1].copy(ha.quaternion);
      // (the hand's own turn on the wrist, towards this frame's at the same rate: a wrist limit or a roll let go of, a frame
      // to the next, turned a resting hand 15-20 degrees)
      if (hAng > lim) { const keepH = _hq[2].copy(ha.quaternion), before = armCollisions(this); ha.quaternion.copy(H.h[side]).slerp(hNow, lim / hAng); rig.upd(ha); if (TR) TR.push('h' + side + ':' + (hAng * 57.3).toFixed(1)); if (armCollisions(this) > before) { ha.quaternion.copy(keepH); rig.upd(ha); } }
      if (TR) TR.push('a' + side + ':' + (ang * 57.3).toFixed(1));
      if (ang <= lim && !moveW) continue;
      const want = ang <= lim ? _hv[7].copy(dNow) : _hv[7].copy(dPrev).applyQuaternion(_hq[1].identity().slerp(_hq[2].setFromUnitVectors(dPrev, dNow), lim / ang)); // (towards this frame's answer, lim of the way)
      const keep = [up.quaternion.clone(), fo.quaternion.clone(), ha.quaternion.clone()], before = armCollisions(this), inBefore = elbowBad(this, side, false, true);
      const Wg = _hv[0], wg = _hv[4]; // (S is not needed past here)
      // (held where it was; if that hits something new or puts the elbow into the body, a quarter, a half, three
      // quarters of the way to the passes' answer: rather a few large steps than one jump)
      for (const g of [0, 0.25, 0.5, 0.75]) {
        Wg.lerpVectors(W, W0, g); wg.copy(want).lerp(dNow, g).normalize();
        rig.solve(up, fo, ha, Wg, wg, side ? rig.bend.rArm : rig.bend.lArm, rig.len.arm);
        rig.upd(up);
        const bad = (!inBefore && elbowBad(this, side, false, true)) || armCollisions(this) > before;
        if (TR) TR.push('g' + side + ':' + g + (bad ? 'x' : ''));
        if (!bad) break;
        up.quaternion.copy(keep[0]); fo.quaternion.copy(keep[1]); ha.quaternion.copy(keep[2]); rig.upd(up);
      }
    }
  }
  /** An elbow's angle (0 left, 1 right), radians. */
  armAngle(side) {
    const b = this.rig.b, S = worldPos(side ? b.rUpper : b.lUpper, _v[0]), E = worldPos(side ? b.rFore : b.lFore, _v[1]), H = worldPos(side ? b.rHand : b.lHand, _v[2]);
    return Math.acos(Math.max(-1, Math.min(1, S.sub(E).normalize().dot(H.sub(E).normalize()))));
  }
  /** An arm (0 left, 1 right) nearly straight at the elbow (over 142°): a resting arm shouldn't be. */
  straightArm(side) {
    const b = this.rig.b, S = worldPos(side ? b.rUpper : b.lUpper, _v[0]), E = worldPos(side ? b.rFore : b.lFore, _v[1]), H = worldPos(side ? b.rHand : b.lHand, _v[2]);
    return S.sub(E).normalize().dot(H.sub(E).normalize()) < -0.788;
  }

  /**
   * The moment's expression, by temperament (faces-v1): sceptical in dead air (one brow up, the lips pressed), a wince at
   * a heckle or a bit that died and then each one's verdict (amused, sympathetic, embarrassed), amused in their own way
   * on a chuckle (the sceptic's half smile under a raised brow, the shy one's look down), attentive while listening
   * (the brows a little up, coming and going). Returns the shape offsets for this frame.
   */
  moodAt(now, room, lb, ls, hk) {
    const M = (this._md ||= {});
    M.inner = 0; M.browOne = 0; M.press = 0; M.squint = 0; M.smirk = 0; M.smile = 0; M.down = 0; M.upper = 0; M.frown = 0;
    if (this.heckler) return M;
    const tp = this.temper, sd = this.seed, side = this.smirkSide;
    const live = room.mode === undefined || room.mode === 'live';
    // dead air (a drifting room) and the room's dead bits: the face settles into its verdict, drifting in and out
    const dead = live ? Math.max(clamp01((room.murmur - 0.3) / 0.5), (Math.min(room.deadBits || 0, 3) / 3) * 0.6) * (1 - clamp01(lb * 3)) : 0;
    if (dead > 0.01) {
      const k = dead * (0.6 + 0.4 * noise(sd + 71, now * 0.13));
      if (tp === 'sceptic') { M.browOne += 0.8 * k; M.press += 0.55 * k; M.smirk += side * 0.18 * k; M.squint += 0.15 * k; }
      else if (tp === 'laugher') { M.inner += 0.35 * k; M.press += 0.3 * k; M.smile += 0.06 * k; }
      else if (tp === 'shy') { M.press += 0.45 * k; M.down += 0.35 * k; M.inner += 0.15 * k; }
      else if (tp === 'talker') { M.browOne += 0.35 * k; M.press += 0.25 * k; M.smirk += side * 0.25 * k; }
      else { if (hash(sd * 1.7 + 9) < 0.5) M.browOne += 0.45 * k; else M.inner += 0.2 * k; M.press += 0.45 * k; } // (half the plain ones raise a brow)
    }
    // a heckle, and a bit that died (the room's count went up): a wince first (eyes narrowed, lips pressed, the upper
    // lip up), each at their own delay
    if (room.heckle && room.heckle.id !== this._hkId) { this._hkId = room.heckle.id; this._hkT = HECKLE_FORCE ? 0 : now; } // (a check view's heckle began at 0)
    const db = room.deadBits || 0;
    if (this._dbN === undefined) this._dbN = db;
    if (db > this._dbN) this._dbT = now;
    this._dbN = db;
    const wince = (t0, dur, amp) => { const a = now - t0 - this.delay * 0.6; return a > 0 && a < dur ? amp * smooth(a / 0.18) * smooth((dur - a) / 0.5) : 0; };
    const w = Math.max(hk > 0 && this._hkT !== undefined ? wince(this._hkT, 1.3, 1) : 0, this._dbT !== undefined ? wince(this._dbT, 1.6, 0.6) : 0);
    if (w > 0) { M.squint += 0.45 * w; M.press += 0.5 * w; M.upper += 0.3 * w; M.inner += 0.35 * w; }
    if (hk > 0 && this._hkT !== undefined && now - this._hkT > 1) { // then their verdict on the heckle
      const k = hk * smooth((now - this._hkT - 1) / 0.6);
      if (tp === 'sceptic') { M.smirk += side * 0.4 * k; M.browOne += 0.45 * k; }
      else if (tp === 'laugher') M.smile += 0.3 * k;
      else if (tp === 'shy') { M.inner += 0.45 * k; M.press += 0.45 * k; M.down += 0.3 * k; }
      else if (tp === 'talker') { M.browOne += 0.5 * k; M.smile += 0.12 * k; }
      else { M.inner += 0.4 * k; M.press += 0.35 * k; }
    }
    if (this._dbT !== undefined && now - this._dbT > 1.2 && now - this._dbT < 6) { // and sympathy for the bit (or a brow)
      const k = smooth((now - this._dbT - 1.2) / 0.8) * smooth((6 - (now - this._dbT)) / 1.5);
      if (tp === 'sceptic' || tp === 'talker') M.browOne += 0.3 * k; else { M.inner += 0.3 * k; M.press += 0.25 * k; }
    }
    // amused, each in their own way (a chuckle, not the big laugh, which is the same release for everyone)
    const ch = clamp01(ls * 1.4) * (1 - clamp01((lb - 0.4) * 2.5));
    if (ch > 0.01) {
      if (tp === 'sceptic') { M.smirk += side * 0.65 * ch; M.browOne += 0.35 * ch; }
      else if (tp === 'shy') { M.down += 0.3 * ch; M.smile += 0.15 * ch; }
      else if (tp === 'talker') M.inner += 0.25 * ch;
    }
    // listening: attentive, the brows a little up, coming and going
    if (live && dead < 0.05 && !hk && lb < 0.05) M.inner += 0.1 * clamp01(room.attention ?? 0.7) * (0.5 + 0.5 * noise(sd + 83, now * 0.35));
    return M;
  }

  exprAt(now, room, calm) {
    const X = (this._xp ||= {});
    for (const k of ['smile', 'smirk', 'inner', 'browL', 'browR', 'wide', 'press', 'frown', 'down', 'squint', 'rollX', 'rollY']) X[k] = 0;
    const E = this.exprs;
    if (!E || !calm) return X;
    let lo = 0, hi = E.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (E[m].t <= now) lo = m; else hi = m - 1; }
    const ev = E[lo], a = now - ev.t;
    if (a < 0 || a > ev.dur) return X;
    const dead = room.murmur > 0.5 || (room.deadBits || 0) >= 2;
    const fire = room.mode === 'live' ? (dead ? 0.85 : 0.5) : 0.7;
    if (ev.u > fire) return X;
    const L = {
      sceptic: [['smirk', 3], ['browOne', 2.5], ['press', 1.5], ['frown', 1], ['roll', dead ? 4 : 0.3]],
      laugher: [['smile', 3], ['brows', 1.5], ['smirk', 1]],
      shy: [['smileSmall', 2], ['down', 2.5], ['press', 1.2]],
      talker: [['brows', 2], ['smile', 2], ['wide', 1], ['smirk', 0.8]],
      plain: [['brows', 1], ['smirk', 1], ['press', 1], ['smile', 1], ['down', 0.5]],
    }[this.temper] || [['brows', 1]];
    const kind = pick(L, ev.k);
    const w = smooth(a / 0.25) * smooth((ev.dur - a) / 0.4), side = this.smirkSide;
    if (kind === 'smirk') X.smirk = side * 0.55 * w;
    else if (kind === 'smile') X.smile = 0.3 * w;
    else if (kind === 'smileSmall') { X.smile = 0.16 * w; X.down = 0.4 * w; }
    else if (kind === 'brows') { X.inner = 0.35 * w; X.browL = X.browR = 0.45 * w; }
    else if (kind === 'browOne') { if (side > 0) X.browL = 0.75 * w; else X.browR = 0.75 * w; X.squint = 0.25 * w; }
    else if (kind === 'wide') { X.wide = 0.45 * w; X.inner = 0.3 * w; }
    else if (kind === 'press') X.press = 0.55 * w;
    else if (kind === 'frown') { X.frown = 0.4 * w; X.inner = 0.15 * w; }
    else if (kind === 'down') X.down = 0.7 * w;
    else if (kind === 'roll') { // the eyes go up and across, then down again
      const k = clamp01(a / Math.min(1.1, ev.dur));
      X.rollY = -0.42 * Math.sin(Math.PI * k); X.rollX = 0.3 * side * Math.sin(Math.PI * 2 * k) * 0.6; X.press = 0.3 * w; X.smirk = side * 0.25 * w;
    }
    return X;
  }
}
