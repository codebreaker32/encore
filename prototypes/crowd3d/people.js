// People: a seated rig for the Rocketbox (3ds Max Biped) skeleton, two-bone IK, and the live behaviour model.
// The body's base layer is motion capture (anim.js: Rocketbox's own MIT clips for this rig): sitting idle, weight
// shifts and fidgets, walking played by distance, sitting down and standing up, talking and listening. Everything the
// room asks of a person (looking at the performer, laughing, clapping, phones, the heckle) is layered on top each
// frame from the room's state, the person's temperament and the clock, so nothing loops in step and every pose is a
// function of (seed, time): any frame can be reproduced.
import * as THREE from 'three';
import { fitBody, refreshFit, fixArms, joints, armCollisions, posture, clampSpine, clampHead, shareYaw } from './anatomy.js';
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
const _q = [...Array(6)].map(() => new THREE.Quaternion());
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
    upper.updateMatrixWorld(true);
  }

  /** Roll the hand about the forearm axis (radians, + = thumb up/out). */
  roll(hand, fore, angle, restQ) {
    hand.quaternion.copy(restQ);
    hand.updateMatrixWorld();
    const axis = worldPos(hand, _v[0]).sub(worldPos(fore, _v[1])).normalize();
    const Wh = worldQuat(hand, _q[2]).premultiply(_q[3].setFromAxisAngle(axis, angle));
    hand.quaternion.copy(worldQuat(fore, _q[4]).invert().multiply(Wh));
  }

  /** Swing the hand (weight w) so it points along dir (world), e.g. fingers forward and up for a clap. */
  aim(hand, tip, dir, w) {
    if (w <= 0 || !tip) return;
    hand.updateMatrixWorld(true);
    const cur = worldPos(tip, _v[1]).sub(worldPos(hand, _v[0])).normalize();
    const q = _q[4].identity().slerp(_q[3].setFromUnitVectors(cur, dir), w);
    const Wh = worldQuat(hand, _q[2]).premultiply(q);
    hand.quaternion.copy(worldQuat(hand.parent, _q[5]).invert().multiply(Wh));
    hand.updateMatrixWorld(true); // (the checks after read the hand and the fingers where they now are)
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
}

// ---------- the face ----------
const FACE_KEYS = ['eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeWideLeft', 'eyeWideRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekSquintLeft', 'cheekSquintRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'jawOpen'];
// The TV models merge symmetric pairs into one shape (tools/anim/tv_morphs.mjs): left and right values average onto it.
const MERGED = { eyeBlinkLeft: 'eyeBlink', eyeBlinkRight: 'eyeBlink', eyeSquintLeft: 'eyeSquint', eyeSquintRight: 'eyeSquint',
  cheekSquintLeft: 'cheekSquint', cheekSquintRight: 'cheekSquint', mouthUpperUpLeft: 'mouthUpperUp', mouthUpperUpRight: 'mouthUpperUp' };
export class Face {
  constructor(model) {
    this.slots = Object.fromEntries([...FACE_KEYS, ...new Set(Object.values(MERGED))].map((k) => [k, []]));
    this.half = {};
    model.traverse((o) => {
      if (!o.morphTargetDictionary || !o.morphTargetInfluences) return;
      for (const [k, i] of Object.entries(o.morphTargetDictionary)) if (this.slots[k]) this.slots[k].push([o.morphTargetInfluences, i]);
    });
    this.ok = Object.values(this.slots).some((s) => s.length);
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
  const out = { joints: [], collisions: [], posture: [] };
  const live = list.filter((p) => p.rig && p.rig.fit && p.rig.fit.ok && !p.hidden && p.rig.model.visible);
  for (const p of live) { p.rig.seatChanged(); refreshFit(p.rig.fit); }
  for (const p of live) {
    const seated = !p.o.stand && !(p.src && p.src._loco) && !p._ovOn;
    joints(p, false, out.joints);
    armCollisions(p, out.collisions, { seated });
    if (seated) posture(p, out.posture, { resting: !!p._resting, armsFolded: !!p._armsFolded });
  }
  return out;
}
if (typeof window !== 'undefined') window.__anatomy = () => anatomyCheck();

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
    const lib0 = p.o.table && p.o.neighbour ? REST_TABLE : REST_SEAT, lib = fr > 0.155 ? lib0.filter(([k]) => k !== 'knees' && k !== 'thighKnee' && k !== 'clasped') : lib0, row = rows.get(p.o.row) || [];
    const cap = Math.max(1, Math.floor(row.length / 3));
    const held = (k) => row.reduce((n, q) => n + (q !== p && q._rsCur === k ? 1 : 0), 0);
    const nb = (k) => (p.rowL && p.rowL._rsCur === k) || (p.rowR && p.rowR._rsCur === k);
    let opts = lib.filter(([k]) => k !== p._rsCur && !nb(k) && held(k) < cap);
    if (!opts.length) opts = lib.filter(([k]) => k !== p._rsCur && !nb(k));
    if (!opts.length) opts = lib.filter(([k]) => k !== p._rsCur);
    if (!opts.length) opts = lib; // (a library of one: it stays)
    const k = pick(opts, p._rsR());
    p._rs.push({ t, k }); p._rsCur = k;
  }
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
// &restpose=thighs|clasped|folded|chin|chairBack|tableOne|glass|forearmsTable: every resting person in that pose (the sheets)
const REST_FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('restpose') || '' : '';
// (a check view's one gesture for every response: &gesture=clap)
// (&reuse=0: every arm gets the full anatomy pass every frame, for A/B checks)
const REUSE_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('reuse') === '0';
const GESTURE_FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('gesture') || '' : '';
// ---------- hands at rest: a small library, placed from each avatar's own fitted body (anatomy.js) ----------
// (chin on hand and an arm over the chair back need a lean or a reach the seated captures don't give: they failed the
// visual check, so they're out of the schedule; chin stays for the bored 'chin' idle, which leans in)
// (folded arms likewise: the hands can't grip the upper arms yet, so they splay; the 'folded' idle gets clasped hands)
// each hand on its own thigh, each on its own knee, one of each, or (rarely) clasped well forward on the lap; every
// seat's schedule is drawn with its row (assignRest): no two neighbours in the same pose, at most a third of a row in one
const REST_SEAT = [['thighs', 2.2], ['knees', 1.6], ['thighKnee', 2], ['clasped', 0.8]];
// A cabaret table stands in front of its pair, off to one side of each of them: only the close-up pair knows which side
// (o.neighbour), so only they use the table, with the hand on its side (both forearms on it would leave one in the air)
// (the glass: nobody holds one yet, so it's out until there is a glass to hold)
const REST_TABLE = [['tableOne', 2], ['thighs', 1.5], ['knees', 1], ['thighKnee', 1.4], ['clasped', 0.5]];
const _rv = [...Array(8)].map(() => new THREE.Vector3());
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
    this.sylHz = 3.9 + r2() * 1.2;
    { const [lo, hi] = THETA[this.temper]; this.theta = lo + (hi - lo) * r2(); if (r2() < 0.05) this.theta = 0.97; } // ~5% stone faces
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
      hand.updateMatrixWorld(true);
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
      hand.updateMatrixWorld(true);
      this._kho = true;
    }
  }

  /**
   * A capture (standing up, a coat, a turn) can swing an upper arm out to the rig's bind direction (down and out at
   * about 45°), which reads as the T/A pose: swing it towards hanging down until it is at least 23° clear.
   */
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
      const Wq = worldQuat(up, _q[2]).premultiply(_q[3].setFromUnitVectors(d, want));
      up.quaternion.copy(worldQuat(up.parent, _q[4]).invert().multiply(Wq));
      up.updateMatrixWorld(true);
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
      up.updateMatrixWorld(true);
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
    const o = (this._rso ||= { kind: '', prev: '', k: 1 });
    o.kind = S[lo].k; o.prev = lo > 0 ? S[lo - 1].k : S[lo].k; o.k = smooth((now - S[lo].t) / 1.0);
    if (REST_FORCE) { o.kind = o.prev = REST_FORCE; o.k = 1; }
    return o;
  }
  /**
   * The seat-frame targets (wrists and elbow poles) of one rest pose, from this avatar's fitted thighs, belly and head in
   * their current pose: on the thighs, clasped in the lap above them, arms folded in front of the belly's own surface,
   * chin on a hand, an arm over the chair back, and at a table: a hand on it, a glass, the forearms on it.
   */
  restTargets(kind) {
    const rig = this.rig, fit = rig.fit, b = rig.b, sh = this.o.seatH, sd = this._restSide || 1;
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
    const reach = 0.985 * (rig.len.arm[0] + rig.len.arm[1]);
    const placed = (side, u, out) => {
      const sh0 = toL(worldPos(side > 0 ? b.lUpper : b.rUpper, _rv[0]));
      for (let uu = u; ; uu -= 0.04) { onThigh(side, uu, out); if (uu <= 0.5 + belly * 3 || out.distanceTo(sh0) <= reach) return out; } // (never back into a belly's way)
    };
    placed(1, uL, R.tL); placed(-1, uR, R.tR);
    if (uL > 0.7) R.pL.set(0.22, -0.85, -0.3); // (reaching the knee: the elbow down by the side, not out: an arm out and down is the bind pose's line)
    if (uR > 0.7) R.pR.set(-0.22, -0.85, -0.3);
    const one = (sideTgt, sidePole) => { if (sd > 0) { R.tL.copy(sideTgt); if (sidePole) R.pL.copy(sidePole); } else { R.tR.copy(sideTgt).setX(-sideTgt.x); if (sidePole) R.pR.copy(sidePole).setX(-sidePole.x); } };
    if (kind === 'clasped') {
      const m = _rv[0].copy(R.tL).add(R.tR).multiplyScalar(0.5);
      // (a deep belly: the clasped hands further along the thighs, so the forearms pass in front of it, not through)
      const fr = fit.front ? fit.front.spine || fit.front.pelvis || 0 : 0;
      m.z += Math.max(0, fr - 0.13) * 1.6;
      // one hand over the other, both clear of the thighs (the fingers curl down onto them)
      R.tL.copy(m).add(_rv[1].set(0.035, 0.06, 0.035)); R.tR.copy(m).add(_rv[1].set(-0.035, 0.022, 0.015)); // (resting on the lap, not held above it)
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
      if (tp.distanceTo(shT) <= reach) one(_rv[0].set(0.16, 0.775, 0.38), _rv[1].set(0.5, -1, -0.3));
    } // on the table's near edge, towards its middle
    else if (kind === 'glass') { one(_rv[0].set(0.15, 0.8, 0.37), _rv[1].set(0.6, -1, -0.2)); R.roll = sd; }
    else if (kind === 'forearmsTable') { R.tL.set(0.13, 0.775, 0.45); R.tR.set(-0.13, 0.775, 0.45); R.pL.set(0.4, -1, -0.2); R.pR.set(-0.4, -1, -0.2); }
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
        let lam = social ? 0.06 : 0.012 + 0.08 * clamp01(room.murmur) + 0.015 * Math.min(room.deadBits || 0, 3) + 0.03 * (1 - (room.attention ?? 0.6)); // (listening: hands mostly at rest)
        lam *= this.temper === 'shy' ? 1.3 : this.temper === 'talker' ? 1.15 : 1;
        d = null;
        if (ev.u < lam / 0.22) {
          const tw = TEMPER_FIDGET[this.temper] || {};
          const list = (dead ? FIDGETS.dead : social ? FIDGETS.social : FIDGETS.listen).map(([n, w]) => [n, w * (tw[n] || 1)]);
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
      if (tk.speaking) { sample(C.talk, t * 1.1, A); addLayer(pose, A, C.talkRef, c.W.talk * (walking ? 0.4 : seated ? 0.5 : 1), pose, MASK.talk); }
      else if (tk.nod > 0 && C.nod) { sample(C.nod, tk.nod * Math.min(2, C.nod.dur), A); addLayer(pose, A, C.nodRef, c.W.talk * Math.sin(Math.PI * tk.nod), pose, MASK.head); }
    }
    // a laugh's torso and head (the hands keep the gesture vocabulary, driven by the room's envelope)
    if (c.lb > 0.02 && c.L) {
      // this laugh's take: which capture (chuckle, laugh or big laugh, this gender's or the other's), from where in it,
      // at what speed and size, and mirrored or not
      const Tk = c.L.take;
      let k = c.L.reach > 0.85 ? 2 : c.L.reach > 0.45 ? 1 : 0;
      if (Tk) { if (Tk.band < 0.25) k = Math.max(0, k - 1); else if (Tk.band > 0.8) k = Math.min(2, k + 1); }
      const set = C.laughSet[k], j = Tk && Tk.other && set[1] ? 1 : 0, lc = set[j] || set[0];
      if (lc) {
        const ref = C.laughRefs[k][set[j] ? j : 0];
        sample(lc, (Tk ? Tk.t0 * Math.max(0, lc.dur - 3) : 0) + c.L.t * (Tk ? Tk.rate : 1), A);
        const w = Math.min(1, c.lb * 1.1) * (0.7 + 0.22 * clamp01((c.lb - 0.55) / 0.35)) * (Tk ? 0.6 + 0.5 * Tk.amp : 1); // (a big one rocks the body more)
        if (Tk && Tk.mirror) addLayerMirror(pose, A, ref, w, pose, MASK.torso, rig); else addLayer(pose, A, ref, w, pose, MASK.torso);
      }
    }
    applyPose(rig, pose);
    rig.model.position.set(0, seated ? this.o.seatH - CHAIR_H : 0, seated ? CHAIR_Z : 0);
    rig.additive = true;
    return { walking, seated };
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
    const list = base.map(([g, w]) => [g, w * (sw[g] ?? 1) * (big[g] ?? 1) * (g === 'armsUp' && vocab === 'club' && s < 0.75 ? 0 : 1)]);
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
  takeFor(ev) {
    const id = ev.id | 0;
    let T = this._takes.get(id);
    if (T) return T;
    const prev = this._lastTake;
    for (let tries = 0; tries < 5; tries++) {
      const R = rng((Math.imul(this.seed | 0, 1597334677) ^ Math.imul(id + 11 + tries * 131, 40503)) | 0);
      const style = pick(LAUGH_STYLES[this.temper] || LAUGH_STYLES.plain, R());
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
  response(ev, now, spread = 0.11, vocab = 'club') {
    const kind = ev.kind || 'laugh';
    if (kind === 'silence' || kind === 'murmur' || kind === 'heckle') return null;
    // the plan for this reaction (take, threshold, delay, gestures) is made once; each frame only reads the levels,
    // into the plan's own result object: nothing is allocated per frame (the TV's cores collect garbage slowly)
    const id = ev.id | 0;
    let c = this._rc.get(id);
    if (!c || c.kind !== kind || c.s !== ev.s || c.vocab !== vocab || c.spread !== spread || c.t0 !== ev.t) c = this.respPlan(ev, kind, spread, vocab, id);
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
      if (u < 0) { pulse = 0.5; bout = 0.6; }
      else if (inB > len) { pulse = 0.3; bout = 0.45; } // the gasp between bouts
      else { pulse = 0.5 + 0.5 * Math.sin(6.283 * T.hz * inB); bout = 0.55 + 0.45 * Math.pow(T.decay, k) * smooth(inB / 0.08) * smooth((len - inB) / 0.08); }
    }
    R.body = body * (kind === 'laugh' ? 0.75 + 0.25 * bout : 1); R.smile = smile; R.t = t; R.pulse = pulse; R.bout = bout;
    return R;
  }

  /** Make (once per reaction) everything about this person's response that does not change from frame to frame. */
  respPlan(ev, kind, spread, vocab, id) {
    const s = ev.s, jitter = hash(this.seed * 3.1 + id * 7.7), together = kind === 'applause' || kind === 'cheer';
    const T = this.takeFor(ev), theta = clamp01(this.theta + T.thetaJ);
    let reach, smileOnly = 0;
    if (together) reach = clamp01(0.55 + s * 0.6 + (this.eager - 0.5) * 0.4) * (s >= theta * 0.6 ? 1 : 0.4);
    else {
      reach = s >= theta ? clamp01(0.3 + ((s - theta) / Math.max(0.2, 1 - theta)) * 0.85 + (this.eager - 0.5) * 0.15 - this.o.row * 0.025) : 0;
      if (!reach && s > theta - 0.25) smileOnly = 1 - (theta - s) / 0.25;
    }
    const sp = laughSeed(id), dx = this.o.x - sp.x, dr = (this.o.row - sp.row) * 0.95, dist = Math.sqrt(dx * dx + dr * dr);
    let style = T.style;
    if (kind === 'laugh' && style === 'over' && !(reach > 0.72 && s > 0.62)) style = 'back'; // doubled over only on a big laugh
    // (a breath through the nose or a giggle can't carry a big laugh: most of them laugh with the head back, or fold over)
    if (kind === 'laugh' && s > 0.75 && (style === 'nose' || style === 'giggle') && jitter > 0.3) style = jitter > 0.7 ? 'over' : 'back';
    // the row neighbour on the left plans this reaction first (it's cached for when its own turn comes), so the two of
    // them never make the same gesture in the same beat
    let ex = '';
    const Lp = this.rowL;
    if (reach && Lp && Lp.rig && Lp._rc) {
      let lc = Lp._rc.get(id);
      if (!lc || lc.kind !== kind || lc.s !== ev.s || lc.vocab !== vocab || lc.spread !== spread || lc.t0 !== ev.t) lc = Lp.respPlan(ev, kind, spread, vocab, id);
      ex = lc.gs.length ? lc.gs[0].g : '';
    }
    const gs = reach ? this.gesturesFor(ev, kind, s, vocab, { style }, ex).gs : [];
    const c = {
      kind, s, vocab, spread, t0: ev.t, together, T, style, reach, smileOnly, none: reach <= 0.02 && smileOnly <= 0.02,
      delay: this.rt + dist * 0.085 * (1.2 - 0.5 * s) + this.o.row * spread * 0.5 * (1.25 - s) + jitter * 0.08 + (ev.delayFor ? ev.delayFor(this) : 0),
      k: 1 / Math.max(s, 0.05), hold: (ev.hold || 0.5 + 1.5 * s * Math.max(reach, 0.3)) + this.eager * 0.4, tail: ev.tail || 0.65,
      gs, go: gs.map((G) => ({ g: G.g, w: 0, rate: G.rate, phase: G.phase, hand: G.hand, high: G.high, a: 0 })),
    };
    c.res = { reach, body: 0, smile: 0, t: 0, jitter, style, gestures: [], kind, id, take: T, pulse: 0.5, bout: 1 };
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
    return Math.max(this.env0(c, ev, a * T.warp) * smooth(a / T.attack), T.keepAmp * this.env0(c, ev, (a - T.keepLag) * T.warp) * 0.7);
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
    rig.seatChanged();
    if (rig.fit) rig.fit.fresh = false; // (the body is about to be posed: its fitted sections are stale until refreshed below)
    // per-update scratch: a pool of vectors (nothing in this function allocates per frame)
    const VP = (this._vp ||= Array.from({ length: 112 }, () => new THREE.Vector3()));
    let vpi = 0;
    const NV = () => VP[vpi++ % 112];
    const toL = (v) => v.applyMatrix4(rig.inv);
    const o = this.o;
    const sd = this.seed;
    // ---- what the room asks of this person ----
    let L = null;
    let Ls = -1;
    for (let i = 0; i < room.events.length; i++) {
      const r = this.response(room.events[i], now, room.spread, room.vocab);
      if (!r) continue;
      let sc = r.body + r.smile;
      for (let j = 0; j < r.gestures.length; j++) sc += r.gestures[j].w;
      if (sc > Ls) { Ls = sc; L = r; }
    }
    const attention = room.attention ?? 0.6, warmth = room.warmth || 0;
    // `force` pins parts of the state (used once at load to bake poses for the shader-animated instances)
    const F = this.force || {};
    const calm = F.still ? 0 : 1;
    const G = {}; // gesture weights and their parameters
    if (L) for (const g of L.gestures) if (!G[g.g] || g.w > G[g.g].w) G[g.g] = g;
    if (F.lc) G.clap = { w: F.lc, rate: this.clapHz, phase: 0, hand: 1, high: 0.5 };
    if (F.lu) G.oneArm = { w: F.lu, rate: 1, phase: 0, hand: 1, high: 0.5 };
    if (F.both) G.armsUp = { w: F.both, rate: 1, phase: 0, hand: 1, high: 0.5 };
    const gw = (k) => (G[k] ? G[k].w : 0);
    const lb = F.lb ?? (L ? L.body : 0);
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
      this.clipBody(now, room, cb);
      // each person's own way of sitting: knees wider or closer, one a little further out than the other (a row of the
      // same capture otherwise sits mirror-image identical); a turn about the vertical at each hip keeps the feet down
      if (!o.stand && stand < 0.3 && !(T && !T.hidden) && rig.b.lThigh && rig.b.rThigh) {
        const sp = (this._legSp ??= (hash(sd * 3.7 + 1) - 0.4) * 0.24), as = (this._legAs ??= (hash(sd * 5.3 + 2) - 0.5) * 0.16);
        const up = _v[3].set(0, 1, 0).transformDirection(rig.seat.matrixWorld);
        for (const [th, a] of [[rig.b.lThigh, sp + as], [rig.b.rThigh, -(sp - as)]]) {
          th.updateMatrixWorld(true);
          const W = worldQuat(th, _q[2]).premultiply(_q[3].setFromAxisAngle(up, a));
          th.quaternion.copy(worldQuat(th.parent, _q[4]).invert().multiply(W));
        }
      }
    }
    else if (rig) rig.additive = false;
    const seatK = clip ? 0 : 1; // the procedural seated posture and drift, which the capture already has

    // ---- body ----
    // restlessness (dead air, a lost room) speeds the drift up, capped, and never widens it: no bobbleheads
    const speed = Math.min(restless, 1.6);
    const breath = calm * seatK * Math.sin(now * this.breathHz * 6.283 + sd) * 0.012;
    const shift = calm * seatK * noise(sd + 1, now * 0.11 * speed) * 0.06;
    const sway = calm * seatK * noise(sd + 2, now * 0.08 * speed) * 0.05 + (room.beat ? Math.sin(now * room.beat * 6.283 + sd * 0.3) * 0.035 : 0);
    let lean = this.slouch * (1 - stand) * (clip ? 0.5 : 1) + shift * 0.6, turn = sway * 0.5, side = calm * seatK * noise(sd + 3, now * 0.07) * 0.03;
    let headPitch = 0, headYaw = 0, headRoll = this.headTilt;
    if (W.phone > 0) { lean += 0.16 * W.phone; headPitch += 0.55 * W.phone; }
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
    lean += (attention - 0.55) * 0.18 * calm * (1 - stand); // locked in leans in, a lost room sits back
    // the seat's sitting style, with a slow weight shift (sitting up, settling back) every 20-60 s, never a pop
    if (clip && !o.stand && stand < 0.3) {
      const ps = this.posture || 'upright', drift = noise(sd + 71, now * 0.025) * 0.05 + noise(sd + 73, now * 0.011) * 0.03;
      lean += (ps === 'upright' ? 0.06 + 0.06 * clamp01((attention - 0.6) * 3) : ps === 'back' ? -0.17 : ps === 'slouch' ? 0.13 : 0) + drift;
      if (ps === 'slouch') headPitch -= 0.08; // (the head kept up over a rounded back)
      if (ps === 'shoulder') side += (this.side || 1) * 0.09;
      if (ps === 'turnIn') turn += (this.side || 1) * 0.2;
    }
    const hk = room.heckle ? room.heckle.level : 0;
    if (idle === 'heckle') { lean += 0.12 * hk; headPitch -= 0.08 * hk; } // (a bigger lean folds the belly onto the forearms)
    // laugh posture (the style is drawn per reaction too)
    // a laugh reads from the body at TV distance: a big one rocks the torso forward and back (~10°, on the person's own
    // slow rhythm), bounces on each "ha" and lifts the shoulders (below); a chuckle dips the head on each "ha"
    const isLaugh = !!(L && L.kind === 'laugh');
    const big = isLaugh ? clamp01((lb - 0.45) / 0.45) : 0, chuck = isLaugh ? lb * (1 - big) : 0;
    this._laughBig = big;
    if (big > 0) lean += big * (0.08 + 0.14 * Math.sin(now * (0.85 + 0.45 * hash(sd + 61)) * 6.283 + sd * 2.3)); // (rocking about a little forward)
    if (big > 0 && st !== 'over' && st !== 'back') headPitch -= 0.14 * big * (0.6 + 0.4 * ha); // (the head goes back on a big one, whatever the style)
    // a chuckle at ~60% of a big laugh: the head dips and tilts, the body leans in and rocks a little, the shoulders
    // bounce (below), and some glance at the neighbour (seeded per reaction)
    if (chuck > 0) {
      headPitch += chuck * (0.16 + 0.14 * ha); headRoll += 0.11 * chuck * (this.side || 1);
      lean += chuck * (0.1 + 0.06 * ha + 0.08 * Math.sin(now * (0.85 + 0.45 * hash(sd + 61)) * 6.283 + sd * 2.3));
      if (L && hash(this.seed * 0.71 + (L.id | 0) * 1.3) < 0.45) headYaw += (this.side || 1) * 0.5 * chuck;
    }
    this._chuck = chuck;
    if (st === 'back') { lean -= 0.12 * lb; headPitch -= (0.21 + 0.14 * big) * lb * (0.8 + 0.2 * ha); } // head back: ~12°, ~20° on a big one
    if (st === 'over') { lean += 0.42 * lb * (1 - 0.5 * stand) * (clip ? 0.45 : 1); headPitch += 0.28 * lb * (clip ? 0.6 : 1); } // (a capture's laugh bends too)
    if (st === 'giggle') { lean += 0.06 * lb; headRoll += 0.1 * lb; }
    if (st === 'turn') { turn += this.side * 0.25 * lb; headYaw += this.side * 0.75 * lb; side -= this.side * 0.1 * lb; }
    if (st === 'shake') lean += 0.04 * lb; // upright, the shoulders doing the laughing (below)
    if (st === 'nose') headPitch += 0.07 * lb * (0.5 + ha); // a breath out through the nose, the head dipping
    if (G.neighbour) { const w = G.neighbour.w; turn += this.side * 0.3 * w; headYaw += this.side * 0.6 * w; side -= this.side * 0.14 * w; }
    if (G.knee) lean += 0.3 * G.knee.w;
    lean += (ha - 0.5) * (0.07 + 0.09 * big) * lb; // bouncing with each "ha"
    lean -= 0.05 * upW;
    lean += 0.1 * vocal; headPitch += 0.1 * vocal; // calling out: head forward
    lean += 0.45 * Math.sin(Math.PI * stand) * (o.stand ? 0 : 1) * seatK; // rising out of (or lowering into) the seat
    if (walk) { lean += 0.05 * seatK; headPitch = lerp(headPitch, clip ? 0.06 : 0.15, walk); }
    // (seated: never slumped over the table or sliding off the chair; a doubled-over laugh may go further forward)
    if (stand < 0.3) { lean = clamp(lean, -0.2, 0.3 + 0.3 * lb * (st === 'over' ? 1 : 0.4)); side = clamp(side, -0.12, 0.12); } // (nor lying back across it)

    // nods while listening (and a couple of small ones as a laugh begins)
    let nod = 0;
    const ni = this.nods.findIndex((x) => x > now - 1.4);
    if (calm && ni >= 0 && this.nods[ni] < now && room.events.length === 0) nod = Math.sin((now - this.nods[ni]) * 9) * 0.07 * Math.sin(((now - this.nods[ni]) / 1.4) * Math.PI);
    if (L && L.t > -0.2 && L.t < 0.9 && lb < 0.35) nod += Math.sin(L.t * 10) * 0.06 * ls;
    if (G.nod) nod += Math.sin(G.nod.a * 8) * 0.08 * G.nod.w;

    const sh = o.seatH;
    // look at the performer (the stage camera), with glances; walkers look where they go
    const perf = _v[1].copy(room.performer);
    perf.x += this.gaze.x; perf.y += this.gaze.y;
    toL(perf);
    const eyeY = lerp(sh + 0.75, 1.6, stand);
    const hx = perf.x, hz = perf.z, hy = perf.y - eyeY;
    const gYaw = Math.atan2(hx, hz) + calm * noise(sd + 4, now * 0.25 * speed) * (room.mode === 'live' && mur < 0.5 ? 0.1 : 0.18); // (listening: within ~±6° of the performer)
    const gPitch = -Math.atan2(hy, Math.hypot(hx, hz)) + calm * noise(sd + 5, now * 0.2) * 0.05;
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
    if (!clip) rig.model.position.set(0, lerp(seatedY, 0, stand) + bob, lerp(-0.11 + Math.min(lean, 0.3) * 0.05, 0, stand));
    rig.setRot(b.pelvis, _q[5].setFromEuler(_e.set(lerp(-0.1, 0, stand) * seatK + lean * 0.15, turn * 0.25, side * 0.3, 'YXZ')));
    // (a look to the side turns the whole upper body, not the neck alone: the spine 20%, the chest 30%, neck and head 50%)
    // (not while sitting down, standing up or walking: the captures turn the body there, and the look stays the neck's)
    const ys = T && !T.hidden ? 0 : 1;
    rig.euler(b.spine, lean * 0.3 + 0.05 * (1 - stand) * seatK + breath, turn * 0.25, side * 0.35);
    rig.euler(b.spine1, lean * 0.32 + 0.04 * (1 - stand) * seatK, turn * 0.25 + yaw * 0.2 * ys, side * 0.35); // (the look's share on Spine1: the legs hang from Spine)
    rig.euler(b.spine2, lean * 0.3 + 0.03 * (1 - stand) * seatK - breath * 0.5, turn * 0.25 + yaw * 0.3 * ys, 0);
    const pitch = gPitch * look + headPitch + nod - lean * 0.55;
    rig.euler(b.neck, pitch * 0.4, yaw * (0.4 - 0.2 * ys), headRoll * 0.4);
    rig.euler(b.head, pitch * 0.6, yaw * (0.6 - 0.3 * ys), headRoll * 0.6);
    // shoulders: a shrug bounce with the laugh, up with the arms
    const shrug = lb * (st === 'shake' ? 0.26 : 0.13 + 0.08 * clamp01((lb - 0.5) / 0.4)) * ha + 0.14 * (this._laughBig || 0) + 0.08 * ha * (isLaugh ? lb : 0) + (this._chuck || 0) * (0.06 + 0.08 * ha) + clapW * 0.03 + Math.sin(Math.PI * coat) * 0.12 + (tk ? tk.laugh : 0) * W.talk * 0.08 * ha;
    rig.euler(b.lClav, 0, -0.12 * clapW, shrug - 0.1 + 0.14 * upW);
    rig.euler(b.rClav, 0, 0.12 * clapW, -shrug + 0.1 - 0.14 * upW);
    // jaw bone (also opens the mouth of the morph-less middle rows)
    // speech: phrases with pauses, syllables at the person's own 3.9–5.1 Hz; listeners keep their mouths shut
    const speaking = tk && tk.speaking ? W.talk : 0;
    const phrase = clamp01((noise(sd + 31, now * 0.85) + 0.35) * 3);
    const syl = Math.pow(0.5 + 0.5 * Math.sin(6.283 * (this.sylHz * now + 0.35 * noise(sd + 33, now * 0.6))), 1.4);
    let talk = speaking * phrase * (0.05 + 0.3 * syl * (0.65 + 0.35 * noise(sd + 35, now * 2.3)));
    if (!tk) talk = W.talk * Math.max(0, noise(sd + 6, now * 3.2)) * 0.5; // (no party: the old murmur)
    if (idle === 'heckle') talk = hk * (0.25 + 0.55 * Math.max(0, noise(sd + 8, now * 4.0)));
    const jaw = (st === 'giggle' ? 0.15 + 0.1 * ha : 0.3 + 0.2 * ha) * lb * (1 - vocal) + talk + vocal * 0.5;
    if (b.jaw && !face?.ok) rig.euler(b.jaw, jaw * 0.32, 0, 0);
    rig.model.updateMatrixWorld(true);
    // the spine within its limits before the arms are posed on it (anatomy.js)
    // (this frame's: whether the hands will rest, as the posture check will judge it below)
    const restingNow = clip && !o.stand && stand < 0.3 && clamp01(1 - (this._fidW || 0) * 1.6) * (1 - walk) > 0.85 && W.talk < 0.1 && clapW < 0.02 && upW < 0.02 && lb < 0.05 && !(L && L.gestures.length) && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat;
    // (a look round turns the chest too, not the neck alone; not for hands at rest, whose shoulders stay square over them)
    if (rig.fit && rig.fit.ok && !ANATOMY_OFF && walk < 0.05 && !(T && !T.hidden) && !restingNow) shareYaw(this);
    if (rig.fit && rig.fit.ok && !ANATOMY_OFF) clampSpine(this, restingNow || !!this._resting);
    // the face within -15..+20 degrees while they listen or laugh (a capture's own tilt plus the look and a glance can
    // otherwise drop it 30-45 degrees, a crown to the camera); dead air may let a bored head drop further, the phone
    // and a drink are looked at, and the doubled-over laugh goes down with the body
    if (rig.fit && rig.fit.ok && !ANATOMY_OFF && !(W.phone > 0.2 || W.drink > 0.2 || walk > 0.05 || coat > 0 || (T && !T.hidden))) {
      const social = room.mode === 'preview' || room.mode === 'after';
      const lo = (lb > 0.4 && (st === 'over' || st === 'nose') ? -25 : mur > 0.5 || idle === 'chin' ? -28 : social ? -20 : lb > 0.3 ? -20 : -9) * DEG; // (listening: the face up at the stage, a little down at most)
      clampHead(this, lo, (lb > 0.5 && st === 'back' ? 30 : 20) * DEG); // (a big laugh may throw the head back)
    }
    // the torso is final for this frame: its sections once, for the rest poses, the fix and the neighbours' checks
    if (rig.fit && rig.fit.ok) { refreshFit(rig.fit); rig.fit.fresh = true; }
    // the people near enough for hands to meet, from where the seats are now (people walk past)
    if (this.rig && REG.length > 1) {
      const me = rig.seat.matrixWorld.elements, near = (this._nearL ||= []);
      near.length = 0;
      for (const q of REG) { if (q === this || !q.rig || q.hidden) continue; const e = q.rig.seat.matrixWorld.elements, dx = e[12] - me[12], dz = e[14] - me[14]; if (dx * dx + dz * dz < 0.95 * 0.95) near.push(q); }
      this.near = near;
    }

    // ---- arms: IK targets in the seat frame, layered (rest < idle < gestures; later layers win) ----
    const p = this.p;
    const V = (x, y, z) => NV().set(x, y, z);
    const armW = { l: 0, r: 0 }; // how much a gesture has taken each arm (clip mode blends the IK in by it)
    const over = (w, tl, tr, pl, pr) => {
      if (w <= 0) return;
      w = clamp01(w);
      if (tl) armW.l = Math.max(armW.l, w); if (tr) armW.r = Math.max(armW.r, w);
      if (tl) p.tL.lerp(tl, w); if (tr) p.tR.lerp(tr, w); if (tl) p.pL.lerp(pl, w); if (tr) p.pR.lerp(pr, w);
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
    if (!clip && F.rest && rig.fit && rig.fit.ok && rig.fit.thighs.length && stand < 0.3) { refreshFit(rig.fit); const A = this.restTargets(F.rest); p.tL.copy(A.tL); p.tR.copy(A.tR); p.pL.copy(A.pL); p.pR.copy(A.pR); }
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
      restW = clamp01(1 - (this._fidW || 0) * 1.6) * (1 - walk);
      this._passing = !!(this.near && this.near.some((q) => q.src && q.src._loco && !q.src._loco.hidden));
      if (restW > 0.01) {
        const RS = this.restPoseAt(now);
        if (RS.k < 1 && RS.prev !== RS.kind) { const A = this.restTargets(RS.prev); over(restW, A.tL, A.tR, A.pL, A.pR); }
        const A = this.restTargets(RS.kind);
        over(restW * (RS.prev !== RS.kind ? RS.k : 1), A.tL, A.tR, A.pL, A.pR);
        restKind = RS.k > 0.5 ? RS.kind : RS.prev;
        if (restKind === 'chairBack') this._intentBack = A.back;
        if (restKind === 'glass') glassSide = A.roll > 0 ? 0 : 1;
      }
    }
    this.phoneAt = null;
    if (W.phone > 0.001) {
      const c = V(0.0, lerp(sh + 0.34, 1.1, stand) + lean * 0.05, 0.27 + lean * 0.12);
      over(W.phone, V(c.x + 0.04, c.y, c.z), V(c.x - 0.04, c.y + 0.01, c.z), V(0.9, -0.5, -0.4), V(-0.9, -0.5, -0.4));
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
    // ---- gestures, each with its own timing ----
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
      over(clapW * 1.3, V(chest.x + 0.034 + (dom > 0 ? 0.075 : 0.03) * g, cy + 0.01 * dom, cz + (dom > 0 ? 0 : 0.015)),
        V(chest.x - 0.034 - (dom > 0 ? 0.03 : 0.075) * g, cy - 0.01 * dom, cz + (dom > 0 ? 0.015 : 0)), V(0.6, -1, -0.15), V(-0.6, -1, -0.15)); // elbows low, not flared
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
    const ikL = !clip || armW.l > 0.002, ikR = !clip || armW.r > 0.002;
    if (ikL) rig.solve(b.lUpper, b.lFore, b.lHand, toW(NV().copy(p.tL)), dirW(NV().copy(p.pL)), rig.bend.lArm, rig.len.arm);
    if (ikR) rig.solve(b.rUpper, b.rFore, b.rHand, toW(NV().copy(p.tR)), dirW(NV().copy(p.pR)), rig.bend.rArm, rig.len.arm);
    // palms: down on the lap/table, turned towards each other when clapping
    const palm = lerp(this.rollRest, this.rollClap, clamp01(clapW * 1.5 + upW));
    // (a hand holding a glass grips it upright)
    if (ikL) rig.roll(b.lHand, b.lFore, glassSide === 0 ? lerp(palm, 0.35, restW) : palm, rig.armRestQ.l);
    if (ikR) rig.roll(b.rHand, b.rFore, glassSide === 1 ? -lerp(palm, 0.35, restW) : -palm, rig.armRestQ.r);
    // a hand resting on a thigh or a knee lies along it, the fingers forward and over (the wrist straight, the knuckles
    // not dug into the leg)
    // (and a hand on the table lies flat on it, the fingers towards its middle, not dug into the top)
    if (restOn && restW > 0.3 && restKind === 'tableOne') {
      const sd = this._restSide || 1, flat = NV().set(-0.25 * sd, -0.06, 1).normalize().transformDirection(rig.seat.matrixWorld);
      if (sd > 0 && ikL) rig.aim(b.lHand, b.lTip, flat, 0.85 * restW * (1 - clapW));
      if (sd < 0 && ikR) rig.aim(b.rHand, b.rTip, flat, 0.85 * restW * (1 - clapW));
    }
    if (restOn && restW > 0.3 && (restKind === 'thighs' || restKind === 'knees' || restKind === 'thighKnee')) {
      const along = (th, ca, knee) => NV().copy(worldPos(ca, NV())).sub(worldPos(th, NV())).normalize().addScaledVector(NV().set(0, -1, 0).transformDirection(rig.seat.matrixWorld), knee ? 0.3 : 0.2).normalize(); // (the fingers drape over the leg's curve; transformDirection normalises: scale after)
      const kL = restKind === 'knees' || (restKind === 'thighKnee' && (this._restSide || 1) > 0), kR = restKind === 'knees' || (restKind === 'thighKnee' && (this._restSide || 1) < 0);
      if (ikL) rig.aim(b.lHand, b.lTip, along(b.lThigh, b.lCalf, kL), 0.6 * restW * (1 - clapW));
      if (ikR) rig.aim(b.rHand, b.rTip, along(b.rThigh, b.rCalf, kR), 0.6 * restW * (1 - clapW));
    }
    // what the posture check may expect of the hands: resting on something, or folded
    this._resting = restOn && restW > 0.85 && W.talk < 0.1 && clapW < 0.02 && upW < 0.02 && lb < 0.05 && !(L && L.gestures.length) && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat;
    this._armsFolded = false;
    this._doing = `${restKind || '-'} idle:${idle} st:${st} clap:${clapW.toFixed(1)} g:${L ? L.gestures.map((g) => g.g).join('+') : ''} T:${T ? Object.keys(T).find((k) => ['walk', 'turn', 'sit', 'rise', 'coat'].includes(k)) || 'stand' : ''}`;
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
      arm[0].updateMatrixWorld(true);
    }
    // (last, after every arm layer: the arms off the bind direction first, then the hands where hands can be)
    if (clip) this.armsOffBind();
    if (clip && stand > 0.6 && walk < 0.05 && clapW < 0.05 && upW < 0.05 && !(coat > 0 && coat < 1) && armW.l < 0.1 && armW.r < 0.1 && (!o.stand || o.standHands === 'down' || o.standHands === 'rail')) this.armsIn(0.7 * smooth((stand - 0.6) / 0.4));
    // anatomy (anatomy.js), last of all: joint limits, then the arms out of every body and the furniture, then the two
    // hands apart (palms meet in a clap, never pass) and the neighbours, then the limits again (a re-solve moves a wrist)
    const fitted = rig.fit && rig.fit.ok && !this._noAnatomy && !ANATOMY_OFF;
    const seatedNow = stand < 0.3 && !o.stand;
    // (window.__anaDbg = 'Male_Adult_12': that person's arm collisions after each stage, in their _stages)
    const DBG = typeof window !== 'undefined' && window.__anaDbg === this.name ? (this._stages = []) : null;
    if (DBG) { const o = []; armCollisions(this, o); DBG.push('preList ' + JSON.stringify(o.map((x) => [x.what, x.side, x.depth, x.k]))); } if (DBG) DBG.push('pre ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3) + ' near ' + (this.near || []).map((q) => q.name));
    // arms that have barely moved since their last full pass (every arm bone and both collarbones within 0.9 degrees,
    // the chest within 4 mm, no neighbour on the move) take that pass's result again instead of redoing it: most
    // resting hands, most frames; a full pass at least every tenth update all the same
    const AQ = (this._aq ||= { inp: [...Array(8)].map(() => new THREE.Quaternion()), out: [...Array(6)].map(() => new THREE.Quaternion()), at: new THREE.Vector3(), n: 99 });
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
    let reuse = still && !REUSE_OFF && restOn && restW > 0.85 && W.talk < 0.1 && !(L && L.gestures.length) && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && clip && fitted && !DBG && AQ.n < 5 && !OV && !(T && !T.hidden) && clapW < 0.05 && upW < 0.05 && !this.fresh;
    // (a neighbour on the move, or one whose moving hands come within reach of mine: the full pass)
    if (reuse && this.near) for (const q of this.near) {
      if (q.src && q.src._loco && !q.src._loco.hidden) { reuse = false; break; }
      if (q._armMoved && q.rig) { const qb = q.rig.b; let close = false; for (const hq of [qb.lHand, qb.rHand]) for (const hm of [b.lHand, b.rHand]) if (worldPos(hq, NV()).distanceToSquared(worldPos(hm, NV())) < 0.16) close = true; if (close) { reuse = false; break; } }
    }
    if (fitted && clip && Person.reuseCount) Person.reuseCount[reuse ? 'reuse' : still ? 'stillFull' : 'full']++;
    if (reuse) {
      for (let i = 0; i < 6; i++) AB[i].quaternion.copy(AQ.out[i]);
      b.lUpper.updateMatrixWorld(true); b.rUpper.updateMatrixWorld(true);
      joints(this, true); // (the neck's limit, every frame)
      AQ.n++;
    } else {
      for (let i = 0; i < 8; i++) if (AB[i]) AQ.inp[i].copy(AB[i].quaternion);
      for (let i = 0; i < 3; i++) BW.q[i].copy(BW.now[i]);
      AQ.at.copy(chestW);
      let m1 = 0;
      if (fitted) { joints(this, true); m1 = fixArms(this, seatedNow, clapW > 0.05); }
      if (DBG) DBG.push('fix1 ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3));
      this._kho = false;
      if (clip) this.keepHandsOut(stand < 0.3, clapW > 0.05); // the two hands apart, the neighbours' hands
      if (DBG) DBG.push('keep ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3));
      if (fitted) {
        // (again if anything moved: the guard's own re-solve may have put an arm back in, and the first pass may not
        // have converged; nothing moved means nothing was found, so the pose is clean)
        const m2 = m1 || this._kho ? fixArms(this, seatedNow, clapW > 0.05) : 0;
        if (DBG) DBG.push('fix2 ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3));
        // a rest pose this body can't take cleanly (a bulky front and clasped hands): straight to the thighs, fixed again
        this._fellBack = false;
        // (only hands that are resting: never a clap, a gesture, a phone, a drink, a talker's or a heckler's hand)
        const handsAtRest = restOn && restW > 0.5 && clapW < 0.02 && upW < 0.02 && !(L && L.gestures.length) && W.talk < 0.1 && W.phone < 0.05 && W.drink < 0.05 && idle !== 'heckle' && !coat;
        if (handsAtRest && m2 > 0 && armCollisions(this) > 0) {
          this._fellBack = true;
          const A = this.restTargets('thighs');
          rig.solve(b.lUpper, b.lFore, b.lHand, rig.seat.localToWorld(NV().copy(A.tL)), NV().copy(A.pL).transformDirection(rig.seat.matrixWorld), rig.bend.lArm, rig.len.arm);
          rig.solve(b.rUpper, b.rFore, b.rHand, rig.seat.localToWorld(NV().copy(A.tR)), NV().copy(A.pR).transformDirection(rig.seat.matrixWorld), rig.bend.rArm, rig.len.arm);
          rig.roll(b.lHand, b.lFore, this.rollRest, rig.armRestQ.l); rig.roll(b.rHand, b.rFore, -this.rollRest, rig.armRestQ.r);
          b.lUpper.updateMatrixWorld(true); b.rUpper.updateMatrixWorld(true);
          fixArms(this, seatedNow, false);
        }
        if (m1 || m2 || this._kho || this._fellBack) joints(this, true); // (nothing moved since the first: still within them)
        // (a push out of a body can swing an upper arm back out to the bind pose's line: off it again, and clear)
        if (clip && this.armsOffBind()) { fixArms(this, seatedNow, clapW > 0.05); joints(this, true); }
      }
      for (let i = 0; i < 6; i++) AQ.out[i].copy(AB[i].quaternion);
      AQ.n = 0;
    }
    if (DBG) DBG.push('end ' + armCollisions(this) + ' L.y ' + toL(worldPos(b.lHand, NV())).y.toFixed(3));

    // ---- legs: feet planted on the floor (seated, standing or stepping) ----
    const ankle = rig.restY.foot;
    if (!clip) for (const [s, th, ca, ft, bend] of [[1, b.lThigh, b.lCalf, b.lFoot, rig.bend.lLeg], [-1, b.rThigh, b.rCalf, b.rFoot, rig.bend.rLeg]]) {
      const step = Math.sin(wph + (s > 0 ? 0 : Math.PI));
      const seatedT = _v[2].set(s * this.feet, ankle, this.footFwd + (s > 0 ? 0.03 : 0));
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
      let ex = lerp(prev.x, cur.x, k) * calm * busyEyes, ey = lerp(prev.y, cur.y, k) * calm * busyEyes;
      if (walk) { ex *= 0.4; ey = ey * 0.4 + 0.06; }
      ey += 0.22 * W.phone + xp.down * 0.2;
      ex += xp.rollX; ey += xp.rollY;
      rig.euler(b.lEye, ey, ex, 0); rig.euler(b.rEye, ey, ex, 0);
    }
    // ---- face ----
    if (face && face.ok) {
      const bl = this.blinkAt(now) * calm;
      const cl = (tk ? tk.laugh : 0) * W.talk; // a laugh at a friend's line
      const sm = clamp01(ls * (0.85 + 0.3 * this.eager) + this.smileBase * calm * (1 - W.phone) + cl * 0.9 + xp.smile + speaking * 0.12);
      const g = clamp01(lb * 1.25 + cl * 0.7); // the laugh, graded: 0 a smile … 1 a full laugh
      const bored = W.chin, phone = W.phone;
      // Rocketbox shapes are small at weight 1 (smile 4.4 mm, cheek 7 mm, jaw 18 mm), so the smile is overdriven.
      // A Duchenne laugh: the eyes narrow and the cheeks rise with it, the upper lip lifts, and the jaw opens only as
      // far as the smile allows (never a round "O"), pulsing with each "ha".
      const sk = xp.smirk + (st === 'nose' ? this.smirkSide * 0.6 * Math.min(1, ls * 1.6) : 0); // an asymmetric smile: one corner only
      face.set('eyeBlinkLeft', Math.max(bl, bored * 0.3, phone * 0.25, 0.12 * g));
      face.set('eyeBlinkRight', Math.max(bl, bored * 0.3, phone * 0.25, 0.115 * g));
      // (pushed: at TV distance the shapes must read; a big laugh near full at the peak, a chuckle a clear smile)
      face.set('eyeSquintLeft', Math.min(1.1, 1.0 * g + 0.4 * sm + xp.squint)); face.set('eyeSquintRight', Math.min(1.1, 0.95 * g + 0.4 * sm + xp.squint * 0.8));
      face.set('cheekSquintLeft', Math.min(1.4, sm * 1.3 + 0.35 * g + (sk > 0 ? sk * 0.6 : 0))); face.set('cheekSquintRight', Math.min(1.4, sm * 1.25 + 0.35 * g + (sk < 0 ? -sk * 0.6 : 0)));
      face.set('mouthSmileLeft', 1.85 * sm + 0.35 * g + 0.1 + (sk > 0 ? sk * 1.3 : 0)); face.set('mouthSmileRight', 1.8 * sm + 0.35 * g + 0.1 + (sk < 0 ? -sk * 1.3 : 0));
      face.set('mouthUpperUpLeft', 0.6 * g); face.set('mouthUpperUpRight', 0.56 * g);
      face.set('jawOpen', Math.min(0.15 + 0.62 * sm + speaking * 0.3, Math.max(jaw, g * (0.45 + 0.25 * ha)))); // (a big laugh's mouth visibly open, within the smile)
      face.set('eyeLookDownLeft', phone * 0.7 + xp.down * 0.5); face.set('eyeLookDownRight', phone * 0.7 + xp.down * 0.5);
      const surprise = Math.max(L && L.t > -0.1 && L.t < 0.35 && st === 'back' ? Math.sin(((L.t + 0.1) / 0.45) * Math.PI) * 0.6 : 0, xp.wide);
      face.set('eyeWideLeft', surprise + vocal * 0.3); face.set('eyeWideRight', surprise + vocal * 0.3);
      const emph = speaking * 0.3 * clamp01((noise(sd + 37, now * 1.1) - 0.25) * 3); // brows up on the stressed words
      face.set('browInnerUp', 0.05 + 0.16 * g + surprise * 0.5 + mur * 0.12 + vocal * 0.3 + emph + xp.inner);
      face.set('browOuterUpLeft', surprise * 0.5 + 0.12 * g + vocal * 0.3 + emph * 0.7 + xp.browL); face.set('browOuterUpRight', surprise * 0.5 + 0.12 * g + vocal * 0.3 + emph * 0.7 + xp.browR);
      face.set('mouthFrownLeft', bored * 0.35 + xp.frown); face.set('mouthFrownRight', bored * 0.35 + xp.frown * 0.8);
      face.set('mouthPressLeft', bored * 0.4 + phone * 0.2 + xp.press); face.set('mouthPressRight', bored * 0.4 + xp.press);
    }
    // how visibly they are laughing (smoothed over ~0.8 s), for the director's choice of close-up (laughRank)
    {
      const gw = (k) => (G[k] ? G[k].w : 0);
      const vis = lb + 0.25 * ls + 0.4 * Math.min(1, clapW + gw('chest') + gw('knee') + gw('slap') + gw('mouth'));
      const dtS = now - (this._lsT ?? -1e9), e = dtS > 0 && dtS < 0.5 ? 1 - Math.exp(-dtS / 0.8) : 1;
      this._lsT = now;
      this.laughScore += (vis - this.laughScore) * e;
    }
    const S = (this.state ||= {});
    S.lb = lb; S.ls = ls; S.clap = clapW; S.up = upW; S.vocal = vocal; S.idle = idle; S.busy = busy; S.style = st; S.take = L && L.take ? L.take.sig : null; S.gestures = L ? L.gestures : NONE;
    // this person's matrices, up to date for the renderer (three's traversal skips the seat: see the Rig). Everything
    // posed after the full pass above refreshed its own subtree (the IK, rolls, aims, clamps), except the eyes.
    if (this._full === undefined || this.fresh) { rig.model.updateMatrixWorld(true); this._full = true; }
    else { if (b.lEye) b.lEye.updateMatrixWorld(true); if (b.rEye) b.rEye.updateMatrixWorld(true); }
    for (let i = 0; i < rig.skeletons.length; i++) rig.skeletons[i].dirty = true;
    if (vpi > 112 && !Person._vpWarned) { Person._vpWarned = true; console.warn('[crowd] Person.update used', vpi, 'scratch vectors of 112'); }
  }

  blinkAt(t) {
    // binary search the schedule for the last blink before t; a blink closes in 80 ms and opens in 170 ms
    const a = this.blinks;
    let lo = 0, hi = a.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (a[mid] <= t) lo = mid; else hi = mid - 1; }
    const shape = (dt) => (dt < 0 ? 0 : dt < 0.08 ? smooth(dt / 0.08) : dt < 0.25 ? 1 - smooth((dt - 0.08) / 0.17) : 0);
    let v = shape(t - a[lo]);
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
