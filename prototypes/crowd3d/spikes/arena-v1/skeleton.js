// Arena spike v1: one avatar's Bip01 skeleton as flat arrays, for forward kinematics without the three.js scene graph.
//
// The skin transform of bone c is K_c = Pre · World_c · Post_c (Pre = meshWorld · bindMatrixInverse, Post_c =
// boneInverse_c · bindMatrix · meshWorld⁻¹), so a vertex in the mesh's bind-pose model space p goes to Σ w_c K_c p:
// exactly three.js's skinning. Pre is folded into the root's parent transform, Post_c is kept as a rigid (q, t).
import * as THREE from 'three';
import { CL } from './clips.js';

// the 20 crowd bones written to the ring, as clip-bone indices (Bip01 and the two toes are left out)
export const RING_CLIP = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21];
export const NRB = RING_CLIP.length;
export const RB = { pelvis: 0, spine: 1, spine1: 2, spine2: 3, neck: 4, head: 5, lClav: 6, lUA: 7, lFA: 8, lHand: 9, rClav: 10, rUA: 11, rFA: 12, rHand: 13, lThigh: 14, lCalf: 15, lFoot: 16, rThigh: 17, rCalf: 18, rFoot: 19 };
// each ring bone's left/right partner (mirrored people read their partner's transform, reflected)
export const PARTNER = [0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 6, 7, 8, 9, 17, 18, 19, 14, 15, 16];
export const C = { root: 0, pelvis: 1, spine2: 4, neck: 5, head: 6, lClav: 7, lUA: 8, lFA: 9, lHand: 10, rClav: 11, rUA: 12, rFA: 13, rHand: 14, lFoot: 17, rFoot: 21 };

export function skinnedMeshOf(scene) { let sk = null; scene.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; }); return sk; }

export function buildSkeleton(scene) {
  scene.updateMatrixWorld(true);
  const sk = skinnedMeshOf(scene);
  const bones = sk.skeleton.bones, idx = new Map(bones.map((b, i) => [b.name, i]));
  const NB = CL.NB, clipBone = CL.bones.map((n) => (idx.has(n) ? bones[idx.get(n)] : scene.getObjectByName(n)));
  if (clipBone.some((b) => !b)) throw new Error('avatar lacks a clip bone');
  const set = new Set(clipBone);
  const parent = new Int8Array(NB), offQ = new Float64Array(NB * 4), offP = new Float64Array(NB * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const Pre = sk.matrixWorld.clone().multiply(sk.bindMatrixInverse), MwInv = sk.matrixWorld.clone().invert();
  let maxScaleErr = 0;
  const armQ = new Float64Array(4), armP = new Float64Array(3);
  for (let c = 0; c < NB; c++) {
    const b = clipBone[c];
    let a = b.parent; while (a && !set.has(a)) a = a.parent;
    parent[c] = a ? clipBone.indexOf(a) : -1;
    if (parent[c] >= c) throw new Error('clip bones out of order');
    if (parent[c] < 0) {
      m.copy(Pre).multiply(b.parent.matrixWorld).decompose(p, q, s);
      armQ.set([q.x, q.y, q.z, q.w]); armP.set([p.x, p.y, p.z]);
      offQ.set([0, 0, 0, 1], c * 4);
    } else {
      m.copy(a.matrixWorld).invert().multiply(b.parent.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(b.position.x, b.position.y, b.position.z));
      m.decompose(p, q, s);
      offQ.set([q.x, q.y, q.z, q.w], c * 4); offP.set([p.x, p.y, p.z], c * 3);
    }
    maxScaleErr = Math.max(maxScaleErr, Math.abs(s.x - 1), Math.abs(s.y - 1), Math.abs(s.z - 1));
  }
  // Post per clip bone, and the bind-pose joint positions in model space (the translation of Post⁻¹)
  const postQ = new Float64Array(NB * 4), postT = new Float64Array(NB * 3), joint = new Float64Array(NB * 3);
  for (let c = 0; c < NB; c++) {
    const bi = idx.get(CL.bones[c]);
    if (bi === undefined) { postQ.set([0, 0, 0, 1], c * 4); continue; } // (Bip01 is a node, not a skin joint: never in the ring)
    m.copy(sk.skeleton.boneInverses[bi]).multiply(sk.bindMatrix).multiply(MwInv);
    m.decompose(p, q, s);
    maxScaleErr = Math.max(maxScaleErr, Math.abs(s.x - 1), Math.abs(s.y - 1), Math.abs(s.z - 1));
    postQ.set([q.x, q.y, q.z, q.w], c * 4); postT.set([p.x, p.y, p.z], c * 3);
    m.invert(); joint.set([m.elements[12], m.elements[13], m.elements[14]], c * 3);
  }
  // every skeleton joint → the ring bone it follows (nearest clip-bone ancestor; Bip01 → pelvis, toes → feet)
  const jointToRing = new Int8Array(bones.length);
  for (let j = 0; j < bones.length; j++) {
    let a = bones[j]; while (a && !set.has(a)) a = a.parent;
    let c = a ? clipBone.indexOf(a) : 0;
    if (c === 0) c = 1; if (c === 18) c = 17; if (c === 22) c = 21;
    jointToRing[j] = RING_CLIP.indexOf(c);
  }
  // rest pose locals (the nodes as loaded) for the FK self-check
  const restPose = new Float32Array(NB * 4 + 3);
  for (let c = 0; c < NB; c++) { const b = clipBone[c]; restPose.set([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], c * 4); }
  restPose.set([clipBone[0].position.x, clipBone[0].position.y, clipBone[0].position.z], NB * 4);
  const len = (a, b) => Math.hypot(joint[a * 3] - joint[b * 3], joint[a * 3 + 1] - joint[b * 3 + 1], joint[a * 3 + 2] - joint[b * 3 + 2]);
  const skel = {
    NB, parent, offQ, offP, armQ, armP, postQ, postT, joint, jointToRing, restPose, maxScaleErr,
    arm: { l: [len(C.lUA, C.lFA), len(C.lFA, C.lHand)], r: [len(C.rUA, C.rFA), len(C.rFA, C.rHand)] },
    sk, clipBone, Pre,
  };
  // self-check: K from flat FK at the rest pose against three.js's own Pre · World · Post
  const qw = new Float64Array(NB * 4), pw = new Float64Array(NB * 3);
  fk(skel, restPose, qw, pw, null);
  let err = 0, restErr = 0;
  const K = new THREE.Matrix4(), K3 = new THREE.Matrix4(), I = new THREE.Matrix4();
  for (let c = 0; c < NB; c++) {
    if (!idx.has(CL.bones[c])) continue;
    const k = skinOf(skel, qw, pw, c);
    K.compose(new THREE.Vector3(k[4], k[5], k[6]), new THREE.Quaternion(k[0], k[1], k[2], k[3]), new THREE.Vector3(1, 1, 1));
    const bi = idx.get(CL.bones[c]);
    K3.copy(Pre).multiply(clipBone[c].matrixWorld).multiply(sk.skeleton.boneInverses[bi]).multiply(sk.bindMatrix).multiply(MwInv);
    for (let e = 0; e < 16; e++) { err = Math.max(err, Math.abs(K.elements[e] - K3.elements[e])); restErr = Math.max(restErr, Math.abs(K3.elements[e] - I.elements[e])); }
  }
  skel.check = { fkVsThree: err, restIsBind: restErr, scale: maxScaleErr };
  return skel;
}

// ---- quaternion helpers on flat arrays ----
export function qmul(a, ai, b, bi, o, oi) {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by;
  o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}
/** o = q ⊗ (x, y, z) */
export function qrot(q, qi, x, y, z, o, oi) {
  const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  o[oi] = x + qw * tx + (qy * tz - qz * ty);
  o[oi + 1] = y + qw * ty + (qz * tx - qx * tz);
  o[oi + 2] = z + qw * tz + (qx * ty - qy * tx);
}
const T4 = new Float64Array(4), T3 = new Float64Array(3);

/** World (qw, pw) of every clip bone for a pose of local quaternions + root translation. rootOff: added to the root. */
export function fk(S, pose, qw, pw, rootOff, from = 0, only = null) {
  const NB = S.NB, o = NB * 4;
  for (let c = from; c < NB; c++) {
    if (only && !only[c]) continue;
    if (c === 0) {
      qmul(S.armQ, 0, pose, 0, qw, 0);
      const rx = pose[o] + (rootOff ? rootOff[0] : 0), ry = pose[o + 1] + (rootOff ? rootOff[1] : 0), rz = pose[o + 2] + (rootOff ? rootOff[2] : 0);
      qrot(S.armQ, 0, rx, ry, rz, pw, 0);
      pw[0] += S.armP[0]; pw[1] += S.armP[1]; pw[2] += S.armP[2];
      continue;
    }
    const pa = S.parent[c];
    qmul(qw, pa * 4, S.offQ, c * 4, T4, 0);
    qmul(T4, 0, pose, c * 4, qw, c * 4);
    qrot(qw, pa * 4, S.offP[c * 3], S.offP[c * 3 + 1], S.offP[c * 3 + 2], pw, c * 3);
    pw[c * 3] += pw[pa * 3]; pw[c * 3 + 1] += pw[pa * 3 + 1]; pw[c * 3 + 2] += pw[pa * 3 + 2];
  }
}
const K7 = new Float64Array(7);
/** The skin transform of clip bone c as (qx, qy, qz, qw, tx, ty, tz). */
export function skinOf(S, qw, pw, c, out = K7) {
  qmul(qw, c * 4, S.postQ, c * 4, out, 0);
  qrot(qw, c * 4, S.postT[c * 3], S.postT[c * 3 + 1], S.postT[c * 3 + 2], T3, 0);
  out[4] = pw[c * 3] + T3[0]; out[5] = pw[c * 3 + 1] + T3[1]; out[6] = pw[c * 3 + 2] + T3[2];
  return out;
}

/** How far two skeletons of a gender differ: bone offsets and skin bind (mm and degrees). */
export function compareSkeletons(A, B) {
  let off = 0, post = 0, ang = 0;
  for (let c = 0; c < A.NB; c++) {
    off = Math.max(off, Math.hypot(A.offP[c * 3] - B.offP[c * 3], A.offP[c * 3 + 1] - B.offP[c * 3 + 1], A.offP[c * 3 + 2] - B.offP[c * 3 + 2]));
    post = Math.max(post, Math.hypot(A.joint[c * 3] - B.joint[c * 3], A.joint[c * 3 + 1] - B.joint[c * 3 + 1], A.joint[c * 3 + 2] - B.joint[c * 3 + 2]));
    const d = Math.abs(A.postQ[c * 4] * B.postQ[c * 4] + A.postQ[c * 4 + 1] * B.postQ[c * 4 + 1] + A.postQ[c * 4 + 2] * B.postQ[c * 4 + 2] + A.postQ[c * 4 + 3] * B.postQ[c * 4 + 3]);
    ang = Math.max(ang, 2 * Math.acos(Math.min(1, d)) * 57.2958);
  }
  return { offsetMm: off * 1000, jointMm: post * 1000, bindDeg: ang };
}
