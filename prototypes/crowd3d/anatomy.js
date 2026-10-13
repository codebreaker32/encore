// Anatomy for the live crowd: each avatar's own body volumes (fitted from its .tv mesh), joint limits for the Bip01
// rig, self-collision, collision with the neighbours and the furniture, and the seated posture. Person.update runs
// the fixes after every other layer (captures, gestures, IK, look-at); window.__anatomy() and tools/render/anatomy.mjs
// run the same checks as a validator and count what is left.
//
// Body volumes: every vertex of the avatar's skinned meshes at rest is given to the bone that weighs most on it. For the
// pelvis, the three spine bones, the head, the thighs and the calves, the vertices are expressed in that bone's own
// frame (Biped bones run along their local X), and the section is an elliptic cylinder: the X range they span, and four
// half-widths (+Y, −Y, +Z, −Z) at a high percentile, so a bulky jacket sets the volume, not an idealised torso. The
// sections ride with their bones, so a bent spine carries its belly with it. Forearms get a radius the same way.
import * as THREE from 'three';

const N = (s) => 'Bip01_' + s;
const FIT = {
  pelvis: N('Pelvis'), spine: N('Spine'), spine1: N('Spine1'), spine2: N('Spine2'), neck: N('Neck'), head: N('Head'),
  lThigh: N('L_Thigh'), rThigh: N('R_Thigh'), lCalf: N('L_Calf'), rCalf: N('R_Calf'),
  lUpper: N('L_UpperArm'), rUpper: N('R_UpperArm'), lFore: N('L_Forearm'), rFore: N('R_Forearm'),
};
const TORSO = ['pelvis', 'spine', 'spine1', 'spine2'];
const WRISTS = 0.04; // the two forearms' axes never closer than this (the hand checker fails them at 3 cm; wrists in a clap ~5 cm)
const _v = [...Array(13)].map(() => new THREE.Vector3());
const _pp = new THREE.Vector3();
const _q = [...Array(8)].map(() => new THREE.Quaternion());
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wpos = (o, v) => v.setFromMatrixPosition(o.matrixWorld);
// (a bone's subtree, the fingers left for the end of the update when the rig can: people.js Rig.upd)
const UPD = (rig, o) => (rig.upd ? rig.upd(o) : o.updateMatrixWorld(true));
const wquat = (o, q) => q.setFromRotationMatrix(_m.extractRotation(o.matrixWorld));
const pct = (a, p) => { if (!a.length) return 0; a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))]; };
const DEG = Math.PI / 180;
const comp = (a, i, c) => (c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i)); // (r160 has no getComponent)

/** A section of the body: an elliptic cylinder in a bone's frame. Refresh its inverse once per pass. */
function section(bone, pts, kind, p = 0.92) {
  const xs = pts.map((v) => v.x), yp = [], yn = [], zp = [], zn = [], r = [];
  for (const v of pts) { (v.y >= 0 ? yp : yn).push(Math.abs(v.y)); (v.z >= 0 ? zp : zn).push(Math.abs(v.z)); r.push(Math.hypot(v.y, v.z)); }
  return {
    bone, kind, x0: pct(xs.slice(), 0.03) - 0.01, x1: pct(xs.slice(), 0.97) + 0.01,
    yP: Math.max(0.03, pct(yp, p)), yN: Math.max(0.03, pct(yn, p)), zP: Math.max(0.03, pct(zp, p)), zN: Math.max(0.03, pct(zn, p)), r: pct(r, 0.8),
    inv: new THREE.Matrix4(),
  };
}
/** How far inside a section a world point is: < 0 outside, 0 at the surface, 1 on the axis. */
export function depthIn(sec, p, shrink = 0) {
  // (the bone's inverse is affine: its rows straight, and the position along the bone first, which rules most out)
  const m = sec.inv.elements, x = p.x, y = p.y, z = p.z;
  const lx = m[0] * x + m[4] * y + m[8] * z + m[12];
  if (lx < sec.x0 || lx > sec.x1) return -1;
  const ly = m[1] * x + m[5] * y + m[9] * z + m[13], lz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const ey = (ly >= 0 ? sec.yP : sec.yN) - shrink, ez = (lz >= 0 ? sec.zP : sec.zN) - shrink;
  if (ey <= 0 || ez <= 0) return -1;
  const e = (ly / ey) * (ly / ey) + (lz / ez) * (lz / ez);
  return 1 - Math.sqrt(e);
}
/** The world direction out of a section at a point (radial in the section's plane). */
function outward(sec, p, out) {
  const l = _v[10].copy(p).applyMatrix4(sec.inv);
  out.set(0, l.y, l.z);
  if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
  return out.normalize().transformDirection(sec.bone.matrixWorld);
}

/**
 * Fit this rig's body (once, at rest, before anything is posed): the sections, the forearm radii, and the rest relations
 * the joint limits measure against. Cached on the rig.
 */
export function fitBody(rig) {
  if (rig.fit) return rig.fit;
  const model = rig.model, B = {};
  for (const [k, n] of Object.entries(FIT)) B[k] = model.getObjectByName(n) || null;
  model.updateMatrixWorld(true);
  const pts = {};
  for (const k of Object.keys(FIT)) pts[k] = [];
  const inv = {};
  for (const [k, b] of Object.entries(B)) if (b) inv[k] = new THREE.Matrix4().copy(b.matrixWorld).invert();
  const byName = new Map(Object.entries(FIT).map(([k, n]) => [n, k]));
  const v = new THREE.Vector3();
  model.traverse((m) => {
    if (!m.isSkinnedMesh || !m.geometry.attributes.skinIndex) return;
    const P = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, bones = m.skeleton.bones;
    for (let i = 0; i < P.count; i++) {
      let best = -1, bw = 0;
      for (let c = 0; c < 4; c++) { const w = comp(sw, i, c); if (w > bw) { bw = w; best = comp(si, i, c); } }
      if (bw < 0.45 || best < 0) continue;
      let k = byName.get(bones[best] && bones[best].name);
      if (k === 'neck') k = 'head';
      if (!k || !inv[k]) continue;
      v.fromBufferAttribute(P, i);
      m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld).applyMatrix4(inv[k]);
      pts[k].push(v.clone());
    }
  });
  const fit = { secs: [], torso: [], thighs: [], calves: [], head: null, foreR: [0.04, 0.04], ok: false, B };
  for (const k of TORSO) if (B[k] && pts[k].length > 12) { const s = section(B[k], pts[k], 'torso'); s.key = k; fit.torso.push(s); fit.secs.push(s); }
  // no gaps up the torso: a bone with few vertices of its own (the tv body gives Spine1 almost none) leaves a hole, so
  // each section reaches up to where the next one starts
  for (let i = 0; i + 1 < fit.torso.length; i++) {
    const A = fit.torso[i], Bn = fit.torso[i + 1];
    const start = new THREE.Vector3(Bn.x0, 0, 0).applyMatrix4(Bn.bone.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(A.bone.matrixWorld).invert());
    if (start.x > A.x1) A.x1 = start.x; // (with its own widths: the chest's would swell the waist)
  }
  for (const k of ['lThigh', 'rThigh']) if (B[k] && pts[k].length > 12) { const s = section(B[k], pts[k], 'thigh', 0.88); s.side = k === 'lThigh' ? 1 : -1; fit.thighs.push(s); fit.secs.push(s); }
  // the two thighs as one pair: a garment skinned to one thigh only (a tunic's hem) swells that side's section, and a
  // hand resting on it then floats above the leg; each extent takes the smaller of the two (the mirrored axis paired
  // with its mirror)
  if (fit.thighs.length === 2) {
    const [A, Bt] = fit.thighs, s = wquat(rig.seat, new THREE.Quaternion()).invert();
    const dir = (sec, ax) => new THREE.Vector3(0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0).applyQuaternion(wquat(sec.bone, new THREE.Quaternion())).applyQuaternion(s);
    for (const ax of ['y', 'z']) {
      const a = dir(A, ax), b = dir(Bt, ax);
      const same = a.x * -b.x + a.y * b.y + a.z * b.z > 0; // (the left axis mirrored across the body's midline vs the right)
      const P = ax + 'P', N = ax + 'N';
      const [aP, aN] = [A[P], A[N]], [bP, bN] = same ? [Bt[P], Bt[N]] : [Bt[N], Bt[P]];
      const mP = Math.min(aP, bP), mN = Math.min(aN, bN);
      A[P] = mP; A[N] = mN;
      if (same) { Bt[P] = mP; Bt[N] = mN; } else { Bt[N] = mP; Bt[P] = mN; }
    }
  }
  for (const k of ['lCalf', 'rCalf']) if (B[k] && pts[k].length > 12) { const s = section(B[k], pts[k], 'calf', 0.88); fit.calves.push(s); } // (not refreshed: nothing tests against them yet)
  if (B.head && pts.head.length > 12) { fit.head = section(B.head, pts.head, 'head', 0.82); fit.secs.push(fit.head); }
  ['lFore', 'rFore'].forEach((k, i) => { if (pts[k].length > 8) fit.foreR[i] = clamp(pct(pts[k].map((p) => Math.hypot(p.y, p.z)), 0.75), 0.025, 0.06); });
  // the rest relations for the joint limits
  const b = rig.b;
  fit.handRest = [b.lHand, b.rHand].map((h) => rig.rest.get(h).local.clone());
  // which local axis of each hand is the wrist's flexion axis (it lay along the world's forward at rest) and which its
  // deviation axis (along up): the fingers curl about forward at rest, so the palm then faced down
  fit.handAxes = [b.lHand, b.rHand].map((h) => {
    const q = wquat(h, new THREE.Quaternion()), seatQ = wquat(rig.seat, new THREE.Quaternion()).invert();
    q.premultiply(seatQ);
    const ax = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => a.applyQuaternion(q));
    const flex = Math.abs(ax[0].z) > Math.abs(ax[1].z) ? 1 : 2; // 1: local Y, 2: local Z
    return { flex, dev: flex === 1 ? 2 : 1 };
  });
  {
    const c = wquat(b.spine2, new THREE.Quaternion()), h = wquat(b.head, new THREE.Quaternion()), s = wquat(rig.seat, new THREE.Quaternion());
    fit.headRel0 = c.clone().invert().multiply(h); // the head in the chest's frame, at rest
    fit.chestInSeat = s.clone().invert().multiply(c); // the chest's rest orientation in the seat frame
    const pl = wquat(b.pelvis, new THREE.Quaternion());
    fit.chestRel0 = pl.clone().invert().multiply(c);
    fit.pelvisInSeat = s.clone().invert().multiply(pl);
    // where the face points, in the head bone's own frame (at rest it faces the seat's forward)
    fit.headFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s).applyQuaternion(h.clone().invert());
  }
  // how far each torso section reaches forward at rest (the seat's forward, m): a deep belly can't take clasped hands
  {
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(wquat(rig.seat, new THREE.Quaternion())), q = new THREE.Quaternion();
    fit.front = {};
    for (const sc of fit.torso) {
      const d = fw.clone().applyQuaternion(wquat(sc.bone, q).invert());
      const n = Math.hypot(d.y, d.z) || 1, dy = d.y / n, dz = d.z / n;
      fit.front[sc.key] = 1 / Math.sqrt((dy / (dy >= 0 ? sc.yP : sc.yN)) ** 2 + (dz / (dz >= 0 ? sc.zP : sc.zN)) ** 2);
    }
  }
  // the ball round the torso (refreshFit places it): half the chain's length plus the widest section, and a margin
  {
    let L = 0, R = 0;
    for (const sc of fit.torso) { L += sc.x1 - sc.x0; R = Math.max(R, sc.yP, sc.yN, sc.zP, sc.zN); }
    fit.ball = { c: new THREE.Vector3(), r: L / 2 + R + 0.03 };
  }
  fit.ok = fit.torso.length >= 2;
  return (rig.fit = fit);
}
/**
 * Refresh every section's inverse (once per pass, after the body is posed), and the ball round the torso (for a quick
 * "nowhere near this body" before the section tests: every point of the chain is within half its length of the
 * chord's middle). people.js marks a fit `fresh` once its body is posed for the frame, so the passes after don't redo it.
 */
const _bl = [new THREE.Vector3(), new THREE.Vector3()];
export function refreshFit(fit) {
  for (const s of fit.secs) s.inv.copy(s.bone.matrixWorld).invert();
  const T = fit.torso;
  if (T.length && fit.ball) {
    const a = T[0], z = T[T.length - 1];
    const p0 = _bl[0].set(a.x0, 0, 0).applyMatrix4(a.bone.matrixWorld), p1 = _bl[1].set(z.x1, 0, 0).applyMatrix4(z.bone.matrixWorld);
    fit.ball.c.copy(p0).add(p1).multiplyScalar(0.5);
  }
}
/** Is a world point anywhere near this body's torso? (false: no torso section can hold it) */
const nearTorso = (fit, p) => !fit.ball || p.distanceToSquared(fit.ball.c) < fit.ball.r * fit.ball.r;

// ---------- the arm, sampled ----------
/** Points along a forearm (from just past the elbow to the wrist), the palm and the knuckles: world positions. */
function armSamples(rig, side, out) {
  const b = rig.b, fore = side ? b.rFore : b.lFore, hand = side ? b.rHand : b.lHand, tip = side ? b.rTip : b.lTip;
  const e = wpos(fore, _v[0]), w = wpos(hand, _v[1]);
  for (let k = 0; k < 5; k++) out[k].copy(e).lerp(w, 0.3 + 0.175 * k);
  if (tip) { const t = wpos(tip, _v[2]); out[5].copy(w).lerp(t, 0.5); out[6].copy(t); } else { out[5].copy(w); out[6].copy(w); }
  return out;
}
const SAMPLES = [[...Array(7)].map(() => new THREE.Vector3()), [...Array(7)].map(() => new THREE.Vector3())];
// the two whole forearms (elbow to wrist), as the hand checker measures them: their axes' nearest approach
const _fd = [...Array(5)].map(() => new THREE.Vector3());
function foreDist(rig) {
  const b = rig.b, a0 = wpos(b.lFore, _fd[0]), a1 = wpos(b.lHand, _fd[1]), b0 = wpos(b.rFore, _fd[2]), b1 = wpos(b.rHand, _fd[3]);
  let best = Infinity;
  for (let i = 0; i <= 8; i++) best = Math.min(best, segDist(_fd[4].copy(a0).lerp(a1, i / 8), b0, b1));
  return best;
}
const segDist = (p, a, b) => { const d = _v[9].copy(b).sub(a), L = Math.max(d.lengthSq(), 1e-9), u = clamp(_v[8].copy(p).sub(a).dot(d) / L, 0, 1); return _v[8].copy(a).addScaledVector(d, u).distanceTo(p); };

/**
 * Collisions for one person's arms: against their own torso, thighs and head, their other arm, the neighbours' bodies
 * and arms, and the furniture (seat, chair back, cabaret table). Returns a list of { what, side, depth } (a fresh array
 * only when `out` is given; otherwise counts only).
 */
export function armCollisions(person, out = null, opts = {}) {
  const rig = person.rig, fit = rig.fit;
  if (!fit || !fit.ok) return 0;
  let n = 0;
  let K = -1;
  const push = (what, side, depth) => { n++; if (out) out.push({ name: person.name, what, side: side ? 'R' : 'L', depth: +depth.toFixed(3), k: K, doing: person._doing || '' }); };
  const S = [armSamples(rig, 0, SAMPLES[0]), armSamples(rig, 1, SAMPLES[1])];
  const inv = rig.inv, sh = person.o.seatH, seated = opts.seated !== false;
  for (let side = 0; side < 2; side++) {
    const pts = S[side];
    for (let k = 0; k < 7; k++) {
      const p = pts[k];
      K = k;
      // (the forearm's distal two thirds: an elbow resting against the flank is how arms hang)
      if (k >= 1) for (const s of fit.torso) { const d = depthIn(s, p); if (d > 0.05) { push('own torso', side, d); break; } }
      for (const s of fit.thighs) { const d = depthIn(s, p); if (d > (k >= 5 ? 0.12 : 0.06)) { push('own thigh', side, d); break; } } // (a resting palm presses in a little)
      if (k >= 4 && fit.head) { const d = depthIn(fit.head, p); if (d > 0.18) push('own head', side, d); }
      // furniture, in the seat frame
      if (seated) {
        const l = _v[3].copy(p).applyMatrix4(inv);
        if (l.y < sh - 0.005 && l.y > sh - 0.12 && Math.abs(l.x) < 0.2 && l.z > -0.2 && l.z < 0.21) push('seat', side, sh - l.y);
        if (l.z < -0.165 && l.z > -0.25 && Math.abs(l.x) < 0.19 && l.y > sh + 0.1 && l.y < sh + 0.42) push('chair back', side, 0.05);
        if (person.o.table && l.y > 0.705 && l.y < 0.75 && l.z > 0.28 && l.z < 0.86 && Math.abs(l.x) < 0.55) push('table', side, 0.75 - l.y);
      }
    }
  }
  // the two forearms through each other
  const r = fit.foreR[0] + fit.foreR[1];
  for (let k = 0; k < 4; k++) { const d = segDist(S[0][k], S[1][0], S[1][3]); if (d < r * 0.7) { push('other arm', 0, r * 0.7 - d); break; } }
  { const d = foreDist(rig); if (d < WRISTS - 0.005) push('forearms through each other', 0, WRISTS - 0.005 - d); }
  // the neighbours' bodies and arms
  if (person.near) for (const q of person.near) {
    if (!q.rig || q.hidden || !q.rig.fit || !q.rig.fit.ok) continue;
    for (let side = 0; side < 2; side++) for (let k = 0; k < 7; k++) {
      const p = S[side][k];
      if (!nearTorso(q.rig.fit, p)) continue;
      for (const s of q.rig.fit.torso) { const d = depthIn(s, p); if (d > 0.02) { push('body of ' + q.name, side, d); break; } }
    }
  }
  return n;
}

// ---- the elbow's place (the limbs rules): the chest's own frame for one side ----
const _ef = { lat: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), S: new THREE.Vector3(), O: new THREE.Vector3(), H: new THREE.Vector3() };
function chestFrame(rig, side) {
  const b = rig.b, F = _ef;
  wpos(side ? b.rUpper : b.lUpper, F.S); wpos(side ? b.lUpper : b.rUpper, F.O);
  F.up.copy(wpos(b.neck, _ev[0])).sub(wpos(b.pelvis, _ev[1])).normalize();
  F.lat.copy(F.S).sub(F.O);
  F.fwd.crossVectors(F.lat, F.up).normalize();
  if (_ev[2].copy(F.fwd).applyMatrix4(_m.copy(rig.inv).setPosition(0, 0, 0)).z < 0) F.fwd.negate();
  const l = _ev[3].crossVectors(F.up, F.fwd).normalize();
  F.lat.copy(l.dot(F.lat) < 0 ? l.negate() : l);
  return F;
}
const _ev = [...Array(8)].map(() => new THREE.Vector3()), _eo = [0, 1, 2].map(() => new THREE.Vector3());
/** How badly an elbow at E breaks the rules (0: fine). The hand at H; F from chestFrame. */
function elbowCost(person, side, E, H, F, clapping, inOnly = false) {
  const fit = person.rig.fit, d = _ev[4].copy(E).sub(F.S), out = d.dot(F.lat), fwd = d.dot(F.fwd), upv = d.dot(F.up);
  const hout = _ev[5].copy(H).sub(F.S).dot(F.lat);
  let c = 0;
  for (const s of fit.torso) { const k = depthIn(s, E); if (k > 0.03) c += (k - 0.03) * 3; }
  if (inOnly) return c; // (on the move: only the body itself, see fixArms)
  if (!(person._intentBack === side || person._intentBack === 2) && fwd < -0.08) c += -0.08 - fwd;
  if (!clapping && upv < -0.05 && out > 0.14 && out - 0.7 * Math.max(0, hout) > 0.08) c += Math.min(out - 0.14, out - 0.7 * Math.max(0, hout) - 0.08);
  if (person._resting && out > 0.06) c += out - 0.06; // (resting, the elbows in by the flanks)
  if (person._resting && person._symOut !== undefined) c += Math.max(0, Math.abs(out - person._symOut) - 0.06); // (and alike)
  // (and clear of the other arm: the elbow's centre 7 cm from its upper arm and forearm; a clap brings them close)
  { const b = person.rig.b, o = side ? 0 : 1, S2 = wpos(o ? b.rUpper : b.lUpper, _eo[0]), E2 = wpos(o ? b.rFore : b.lFore, _eo[1]), H2 = wpos(o ? b.rHand : b.lHand, _eo[2]);
    const dd = Math.min(segDist(E, S2, E2), segDist(E, E2, H2)); if (dd < 0.07) c += 0.07 - dd; }
  return c;
}
function elbowBad(person, side, clapping, inOnly = false) {
  const rig = person.rig, b = rig.b, F = chestFrame(rig, side);
  return elbowCost(person, side, wpos(side ? b.rFore : b.lFore, _ev[6]), wpos(side ? b.rHand : b.lHand, _ev[7]), F, clapping, inOnly) > 0;
}
/** The pole (a world direction from the shoulder) for the best elbow on its circle for a wrist at W. */
const _bp = new THREE.Vector3(), _bc = new THREE.Vector3(), _bu = new THREE.Vector3(), _bv = new THREE.Vector3(), _bE = new THREE.Vector3(), _bW = new THREE.Vector3();
export function bestElbow(person, side, W, clapping, inOnly = false) {
  const rig = person.rig, b = rig.b, F = chestFrame(rig, side), [l1, l2] = rig.len.arm;
  // (a straight arm has no circle: the wrist drawn in a little first)
  const ax = _bW.copy(W).sub(F.S); let d = ax.length();
  if (d > 0.95 * (l1 + l2)) { W.copy(F.S).addScaledVector(ax.normalize(), 0.95 * (l1 + l2)); ax.copy(W).sub(F.S); d = ax.length(); }
  ax.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), r = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _bc.copy(F.S).addScaledVector(ax, a);
  _bu.copy(Math.abs(ax.dot(F.up)) < 0.9 ? F.up : F.fwd).addScaledVector(ax, -(Math.abs(ax.dot(F.up)) < 0.9 ? F.up : F.fwd).dot(ax)).normalize();
  _bv.crossVectors(ax, _bu);
  const cur = wpos(side ? b.rFore : b.lFore, _ev[6]).clone();
  let best = Infinity, bestRule = Infinity;
  for (let k = 0; k < 24; k++) {
    const t = (k / 24) * Math.PI * 2;
    _bE.copy(_bc).addScaledVector(_bu, r * Math.cos(t)).addScaledVector(_bv, r * Math.sin(t));
    // (out of the rules first; then, among those, the one nearest where the pose had it, a little down by preference)
    const rule = elbowCost(person, side, _bE, W, F, clapping, inOnly);
    const c = rule * 10 + _bE.distanceTo(cur) + 0.15 * Math.max(0, _ev[4].copy(_bE).sub(F.S).dot(F.up) + 0.1);
    if (c < best) { best = c; bestRule = rule; _bp.copy(_bE).sub(F.S); }
  }
  bestElbow.rule = bestRule;
  return _bp.normalize();
}
/**
 * The last word on the elbows (after the arms' collision fixes and the joint limits): an elbow still against the limbs
 * rules gets the best place on its circle; a hand that leaves no good place (reached across the body) is drawn back
 * towards its own side, up to 24 cm. Kept only if the arm then collides no more than before. Returns the count fixed.
 */
const _gq = [0, 1, 2].map(() => new THREE.Quaternion()), _gW = new THREE.Vector3();
export function guardElbows(person, clapping = false) {
  const rig = person.rig, b = rig.b;
  if (!rig.fit || !rig.fit.ok) return 0;
  let n = 0;
  for (let side = 0; side < 2; side++) {
    if (!elbowBad(person, side, clapping)) continue;
    const up = side ? b.rUpper : b.lUpper, fo = side ? b.rFore : b.lFore, ha = side ? b.rHand : b.lHand;
    _gq[0].copy(up.quaternion); _gq[1].copy(fo.quaternion); _gq[2].copy(ha.quaternion);
    const before = armCollisions(person) + joints(person, false) + (person.o.stand ? 0 : posture(person, null, { resting: !!person._resting }));
    // (the other elbow's place across, for a resting pair to match)
    { const Fo = chestFrame(rig, 1 - side); person._symOut = _ev[4].copy(wpos(side ? b.lFore : b.rFore, _ev[5])).sub(Fo.S).dot(Fo.lat); }
    const F = chestFrame(rig, side), W0 = wpos(ha, _ev[7]).clone();
    let pole = null;
    for (let k = 0; k <= (person._resting || clapping ? 0 : 7); k++) { // (a resting or clapping hand stays where it is)
      _gW.copy(W0).addScaledVector(F.lat, 0.06 * k).addScaledVector(F.up, -0.02 * k);
      pole = bestElbow(person, side, _gW, clapping);
      if (bestElbow.rule <= 0) break;
    }
    person._symOut = undefined;
    rig.solve(up, fo, ha, _gW, pole, side ? rig.bend.rArm : rig.bend.lArm, rig.len.arm);
    UPD(rig, ha);
    if (armCollisions(person) + joints(person, false) + (person.o.stand ? 0 : posture(person, null, { resting: !!person._resting })) > before) {
      up.quaternion.copy(_gq[0]); fo.quaternion.copy(_gq[1]); ha.quaternion.copy(_gq[2]); UPD(rig, up);
    } else n++;
  }
  return n;
}

/**
 * The fix for the arms (after every other layer): any forearm or hand inside the person's own torso, thigh or head,
 * the seat or chair back, the table, or a neighbour is moved out (along the body's outward normal by the section's
 * depth plus the forearm's radius and a margin; up out of a thigh, the seat or the table; towards their own middle
 * away from a neighbour), and the arm is re-solved by IK with its elbow forward and down. Up to three rounds.
 */
export function fixArms(person, seated, clapping = false) {
  const rig = person.rig, fit = rig.fit;
  if (!fit || !fit.ok) return 0;
  // (a fit refreshed once this body was posed is current; the head only may have turned since, by the neck's limit)
  if (!fit.fresh) refreshFit(fit); else if (fit.head) fit.head.inv.copy(fit.head.bone.matrixWorld).invert();
  if (person.near) for (const q of person.near) if (q.rig && q.rig.fit && q.rig.fit.ok && !q.hidden && !q.rig.fit.fresh) refreshFit(q.rig.fit);
  const b = rig.b, seat = rig.seat, sh = person.o.seatH;
  let moved = 0;
  for (let round = 0; round < 6; round++) {
    let any = false;
    for (let side = 0; side < 2; side++) {
      const pts = armSamples(rig, side, SAMPLES[side]);
      const hand = side ? b.rHand : b.lHand, fore = side ? b.rFore : b.lFore, upper = side ? b.rUpper : b.lUpper, sgn = side ? -1 : 1;
      const shift = _v[4].set(0, 0, 0);
      let worst = 0;
      for (let k = 0; k < 7; k++) {
        const p = pts[k];
        if (k >= 1) for (const s of fit.torso) {
          const d = depthIn(s, p);
          if (d > 0.02) { // push out along the section's outward normal (a forearm resting against the hip may touch it), flattened to the horizontal, plus the forearm radius
            const n = outward(s, p, _v[5]); n.y *= 0.3; n.normalize();
            // (a point near the elbow moves only part as far as the wrist does: scale the shift by where it is)
            const need = (d * Math.max(s.zP, s.yP, s.zN, s.yN) * 1.1 + fit.foreR[side] + 0.015) / Math.min(1, 0.3 + 0.175 * k + 0.25);
            if (need > worst) { worst = need; shift.copy(n).multiplyScalar(need); }
          }
        }
        for (const s of fit.thighs) { const d = depthIn(s, p); if (d > (k >= 5 ? 0.1 : 0.02)) { const need = d * s.r + 0.03; /* (a palm and knuckles resting on a leg press into it a little: the section's surface is its 88th-percentile skin) */ if (need > shift.y) shift.y = need; worst = Math.max(worst, need); } }
        if (k >= 4 && fit.head) { const d = depthIn(fit.head, p); if (d > 0.12) { const n = outward(fit.head, p, _v[5]); const need = d * fit.head.r + 0.02; shift.addScaledVector(n, need); worst = Math.max(worst, need); } }
        if (seated) {
          const l = _v[3].copy(p).applyMatrix4(rig.inv);
          if (l.y < sh && l.y > sh - 0.12 && Math.abs(l.x) < 0.2 && l.z > -0.2 && l.z < 0.21) { const up = _v[6].set(0, sh + 0.03 - l.y, 0).transformDirection(seat.matrixWorld).multiplyScalar(sh + 0.03 - l.y); shift.add(up); worst = Math.max(worst, 0.03); }
          if (l.z < -0.165 && l.z > -0.25 && Math.abs(l.x) < 0.19 && l.y > sh + 0.1 && l.y < sh + 0.42) { const k2 = (-0.12 - l.z) / Math.min(1, 0.3 + 0.175 * k + 0.25); shift.add(_v[6].set(0, 0, 1).transformDirection(seat.matrixWorld).multiplyScalar(k2)); worst = Math.max(worst, k2); }
          if (person.o.table && l.y > 0.7 && l.y < 0.76 && l.z > 0.28 && l.z < 0.86 && Math.abs(l.x) < 0.55) { shift.add(_v[6].set(0, 1, 0).transformDirection(seat.matrixWorld).multiplyScalar(0.775 - l.y)); worst = Math.max(worst, 0.03); }
        }
        if (person.near) for (const q of person.near) {
          if (!q.rig || q.hidden || !q.rig.fit || !q.rig.fit.ok || !nearTorso(q.rig.fit, p)) continue;
          for (const s of q.rig.fit.torso) { // out of their body, along its outward normal (flattened), and towards our own middle
            const d = depthIn(s, p), moving = !!(q._ovOn || (q.src && q.src._loco)); // (a neighbour on the move is seen a frame late: no slack, more margin)
            if (d > (moving ? 0 : 0.01)) { // (an elbow brushing a neighbour's sleeve is no collision)
              const n = outward(s, p, _v[5]); n.y = 0; if (n.lengthSq() < 1e-6) n.set(1, 0, 0); n.normalize();
              const k = d * Math.max(s.zP, s.yP, s.zN, s.yN) * 1.1 + fit.foreR[side] + (moving ? 0.045 : 0.02);
              const lx = _v[3].copy(p).applyMatrix4(rig.inv).x;
              shift.addScaledVector(n, k).add(_v[6].set(-Math.sign(lx || sgn), 0, 0).transformDirection(seat.matrixWorld).multiplyScalar(0.03));
              worst = Math.max(worst, k); break;
            }
          }
        }
      }
      // the elbow itself (the samples start 30% down the forearm): inside the flank, tucked behind the chest, or winged
      // out beyond its own hand (the limbs rules, measured as limbMetrics does). The same wrist, the elbow placed at the
      // best point of the circle it can take round the shoulder-wrist line
      // (walking, sitting down, standing up: the capture's arms swing as they will, only kept out of the body)
      const inOnly = !!person._inTraffic, eb = elbowBad(person, side, clapping, inOnly);
      if (worst <= 0 && !eb) continue;
      any = true; moved++;
      const wrist = wpos(hand, _v[7]).add(shift);
      if (eb) {
        const pole = bestElbow(person, side, wrist, clapping, inOnly);
        rig.solve(upper, fore, hand, wrist, pole, side ? rig.bend.rArm : rig.bend.lArm, rig.len.arm);
        UPD(rig, hand);
        continue;
      }
      // the elbow forward and down (out of the flank), on this arm's side
      // (the elbow where the pose had it for the first rounds, so a small push doesn't swing it out from the flank; then
      // forward and down, out of the flank)
      const pole = round < 2 ? _v[6].copy(wpos(fore, _v[8])).sub(wpos(upper, _v[9])) : _v[6].set(0.55 * sgn, -0.75, 0.45 + 0.25 * Math.min(round, 2)).normalize().transformDirection(seat.matrixWorld);
      rig.solve(upper, fore, hand, wrist, pole, side ? rig.bend.rArm : rig.bend.lArm, rig.len.arm);
      UPD(rig, hand);
    }
    // the forearms through each other (their upper three quarters: the wrists may meet, as in a clap): the higher
    // one goes up and forward, clear by both radii (not while clapping: the hands are meant to meet)
    // (and the two forearms never through each other anywhere, clap or not: wrist to wrist is about 5 cm when palms meet)
    {
      const A = armSamples(rig, 0, SAMPLES[0]), Bs = armSamples(rig, 1, SAMPLES[1]), r = fit.foreR[0] + fit.foreR[1];
      let dmin = Infinity, dw = Infinity;
      // (clapping, the wrists meet but the forearms behind them never do)
      for (let k = 0; k < (clapping ? 3 : 4); k++) dmin = Math.min(dmin, segDist(A[k], Bs[0], Bs[clapping ? 2 : 3]));
      dw = foreDist(rig);
      const need = Math.max(dmin < r * 0.8 ? r * 0.8 - dmin : 0, dw < WRISTS ? WRISTS - dw : 0);
      if (need > 0) {
        const top = wpos(b.lHand, _v[0]).applyMatrix4(rig.inv).y >= wpos(b.rHand, _v[1]).applyMatrix4(rig.inv).y ? 0 : 1;
        const hand = top ? b.rHand : b.lHand, fore = top ? b.rFore : b.lFore, upper = top ? b.rUpper : b.lUpper, sgn = top ? -1 : 1;
        const wrist = wpos(hand, _v[7]).add(_v[4].set(0, need + 0.03, 0.02).transformDirection(seat.matrixWorld).multiplyScalar(need + 0.035));
        rig.solve(upper, fore, hand, wrist, _v[6].set(0.55 * sgn, -0.75, 0.45).normalize().transformDirection(seat.matrixWorld), top ? rig.bend.rArm : rig.bend.lArm, rig.len.arm);
        UPD(rig, hand);
        any = true; moved++;
      }
    }
    if (!any) break;
  }
  return moved;
}

/** The twist of a rotation about the vertical (swing-twist), radians: an Euler yaw flips when the chest bends far forward. */
function twistY(q) { const w = q.w < 0 ? -q.w : q.w, y = q.w < 0 ? -q.y : q.y; return 2 * Math.atan2(y, w); }

// ---------- joint limits ----------
const LIM = {
  wristFlex: 70 * DEG, wristDev: 25 * DEG, wristTwist: 80 * DEG,
  neckYaw: 60 * DEG, neckPitch: 45 * DEG, neckRoll: 30 * DEG,
  elbowMax: 147 * DEG, elbowHyper: 8 * DEG, elbowSide: 28 * DEG,
  kneeHyper: 8 * DEG, spineTwist: 45 * DEG, shoulderBack: 65 * DEG, // (reaching back for the seat while sitting down is ~60°)
};
/** A quaternion's rotation vector (axis × angle), into out. */
function rotVec(q, out) {
  const s = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z), w = q.w < 0 ? -1 : 1;
  if (s < 1e-8) return out.set(0, 0, 0);
  const a = 2 * Math.atan2(s, Math.abs(q.w));
  return out.set((q.x / s) * a * w, (q.y / s) * a * w, (q.z / s) * a * w);
}
function fromRotVec(r, out) {
  const a = r.length();
  if (a < 1e-8) return out.identity();
  return out.setFromAxisAngle(_v[8].copy(r).multiplyScalar(1 / a), a);
}

/**
 * Joint limits, measured (and with `fix`, clamped) after every other layer:
 *   wrist: flexion/extension ±70°, radial/ulnar deviation ±25°, forearm twist ±80° (the hand's rotation from rest);
 *   neck: the head against the chest, yaw ±70°, pitch ±45°, roll ±30°;
 *   elbow: a hinge, 0–147°, never bent backwards or out of its plane (re-solved by IK with the elbow where it bends);
 *   knee: never bent backwards; spine: twist ≤ 45°; shoulder: the upper arm never more than 55° behind the body.
 * Returns the count, and fills `out` with { name, joint, side, value (degrees) } when given.
 */
export function joints(person, fix = false, out = null) {
  const rig = person.rig, fit = rig.fit, b = rig.b;
  if (!fit) return 0;
  let n = 0;
  const flag = (joint, side, value) => { n++; if (out) out.push({ name: person.name, joint, side: side === null ? '' : side ? 'R' : 'L', value: +(value / DEG).toFixed(0) }); };
  // wrists
  for (let side = 0; side < 2; side++) {
    const hand = side ? b.rHand : b.lHand, rest = fit.handRest[side], ax = fit.handAxes[side];
    const D = _q[0].copy(rest).invert().multiply(hand.quaternion); // the hand's rotation from rest, in its own rest frame
    // twist about the hand's long axis (local X), then the swing
    const tw = _q[1].set(D.x, 0, 0, D.w).normalize(), sw = _q[2].copy(D).multiply(_q[3].copy(tw).invert());
    const r = rotVec(sw, _v[0]), t = rotVec(tw, _v[1]).x;
    const fl = ax.flex === 1 ? r.y : r.z, dv = ax.dev === 1 ? r.y : r.z;
    const bad = Math.abs(fl) > LIM.wristFlex + 0.02 || Math.abs(dv) > LIM.wristDev + 0.02 || Math.abs(t) > LIM.wristTwist + 0.02;
    if (bad) {
      if (!fix) { if (Math.abs(fl) > LIM.wristFlex + 0.02) flag('wrist flexion', side, fl); if (Math.abs(dv) > LIM.wristDev + 0.02) flag('wrist deviation', side, dv); if (Math.abs(t) > LIM.wristTwist + 0.02) flag('forearm twist', side, t); }
      else {
        const fl2 = clamp(fl, -LIM.wristFlex, LIM.wristFlex), dv2 = clamp(dv, -LIM.wristDev, LIM.wristDev), t2 = clamp(t, -LIM.wristTwist, LIM.wristTwist);
        r.x = 0; if (ax.flex === 1) { r.y = fl2; r.z = dv2; } else { r.z = fl2; r.y = dv2; }
        const q = fromRotVec(r, _q[4]).multiply(_q[5].setFromAxisAngle(_v[2].set(1, 0, 0), t2));
        hand.quaternion.copy(rest).multiply(q);
        UPD(rig, hand);
        n++;
      }
    }
  }
  // neck: the head against the chest, in the seat's axes
  {
    const c = wquat(b.spine2, _q[0]), h = wquat(b.head, _q[1]);
    const rel = _q[2].copy(c).invert().multiply(h);
    const D = _q[3].copy(rel).multiply(_q[4].copy(fit.headRel0).invert());
    const Ds = _q[4].copy(fit.chestInSeat).multiply(D).multiply(_q[5].copy(fit.chestInSeat).invert());
    _e.setFromQuaternion(Ds, 'YXZ');
    const yaw = _e.y, pitch = _e.x, roll = _e.z;
    if (Math.abs(yaw) > LIM.neckYaw + 0.02 || Math.abs(pitch) > LIM.neckPitch + 0.02 || Math.abs(roll) > LIM.neckRoll + 0.02) {
      if (!fix) { if (Math.abs(yaw) > LIM.neckYaw + 0.02) flag('neck yaw', null, yaw); if (Math.abs(pitch) > LIM.neckPitch + 0.02) flag('neck pitch', null, pitch); if (Math.abs(roll) > LIM.neckRoll + 0.02) flag('neck roll', null, roll); }
      else {
        _e.set(clamp(pitch, -LIM.neckPitch, LIM.neckPitch), clamp(yaw, -LIM.neckYaw, LIM.neckYaw), clamp(roll, -LIM.neckRoll, LIM.neckRoll), 'YXZ');
        const Ds2 = _q[4].setFromEuler(_e);
        const D2 = _q[5].copy(fit.chestInSeat).invert().multiply(Ds2).multiply(fit.chestInSeat);
        const hw = _q[6].copy(c).multiply(D2).multiply(fit.headRel0); // the head's corrected world rotation
        const nw = wquat(b.neck, _q[7]);
        b.head.quaternion.copy(nw.invert().multiply(hw));
        UPD(rig, b.head);
        n++;
      }
    }
  }
  // elbows: a hinge (measured from the bones' positions)
  for (let side = 0; side < 2; side++) {
    const up = side ? b.rUpper : b.lUpper, fo = side ? b.rFore : b.lFore, ha = side ? b.rHand : b.lHand;
    const S = wpos(up, _v[0]), E = wpos(fo, _v[1]), W = wpos(ha, _v[2]);
    const u = _v[3].copy(E).sub(S).normalize(), f = _v[4].copy(W).sub(E).normalize();
    const bend = _v[5].copy(side ? rig.bend.rArm : rig.bend.lArm).applyQuaternion(wquat(up, _q[0])); // where it folds
    const flex = Math.acos(clamp(u.dot(f), -1, 1));
    const hinge = _v[6].copy(u).cross(bend).normalize();
    const sideOff = Math.asin(clamp(Math.abs(f.dot(hinge)), 0, 1));
    const back = flex > 0.12 && f.dot(bend) < -Math.sin(LIM.elbowHyper);
    const bad = back || flex > LIM.elbowMax || (flex > 0.35 && sideOff > LIM.elbowSide);
    if (!bad) continue;
    if (!fix) { flag(back ? 'elbow bent backwards' : flex > LIM.elbowMax ? 'elbow over-bent' : 'elbow out of its hinge', side, back ? -flex : flex > LIM.elbowMax ? flex : sideOff); continue; }
    // re-solve to the same wrist, the elbow where it naturally goes (away from the fold, a little out and down)
    const pole = _v[7].copy(bend).negate().addScaledVector(_v[8].set(0.35 * (side ? -1 : 1), -0.4, 0).transformDirection(rig.seat.matrixWorld), 0.6).normalize();
    const target = _v[9].copy(W);
    if (flex > LIM.elbowMax) { // the wrist out from the shoulder to where the elbow opens to 145°
      const [l1, l2] = rig.len.arm, dmin = Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(Math.PI - (LIM.elbowMax - 3 * DEG)));
      const dir = _v[10].copy(W).sub(S); const d = dir.length();
      if (d < dmin) target.copy(S).addScaledVector(dir.multiplyScalar(1 / Math.max(d, 1e-4)), dmin);
    }
    rig.solve(up, fo, ha, target, pole, side ? rig.bend.rArm : rig.bend.lArm, rig.len.arm);
    UPD(rig, ha);
    n++;
  }
  if (!fix) {
    // knees: never bent backwards
    for (let side = 0; side < 2; side++) {
      const th = side ? b.rThigh : b.lThigh, ca = side ? b.rCalf : b.lCalf, ft = side ? b.rFoot : b.lFoot;
      const H = wpos(th, _v[0]), K = wpos(ca, _v[1]), F = wpos(ft, _v[2]);
      const u = _v[3].copy(K).sub(H).normalize(), f = _v[4].copy(F).sub(K).normalize();
      const bend = _v[5].copy(side ? rig.bend.rLeg : rig.bend.lLeg).applyQuaternion(wquat(th, _q[0]));
      if (Math.acos(clamp(u.dot(f), -1, 1)) > 0.12 && f.dot(bend) < -Math.sin(LIM.kneeHyper)) flag('knee bent backwards', side, 0);
    }
    // spine twist: the chest against the pelvis
    {
      const pl = wquat(b.pelvis, _q[0]), c = wquat(b.spine2, _q[1]);
      const D = _q[2].copy(pl).invert().multiply(c).multiply(_q[3].copy(fit.chestRel0).invert());
      const Ds = _q[3].copy(fit.pelvisInSeat).multiply(D).multiply(_q[4].copy(fit.pelvisInSeat).invert());
      const tw = twistY(Ds);
      if (Math.abs(tw) > LIM.spineTwist) flag('spine twist', null, tw);
    }
    // shoulders: an upper arm far behind the body (unless the pose means it: an arm over the chair back)
    for (let side = 0; side < 2; side++) {
      if (person._intentBack === side || person._intentBack === 2) continue;
      const up = side ? b.rUpper : b.lUpper, fo = side ? b.rFore : b.lFore;
      const d = _v[0].copy(wpos(fo, _v[1])).sub(wpos(up, _v[2])).normalize().transformDirection(_m.copy(rig.inv));
      if (d.z < -Math.sin(LIM.shoulderBack)) flag('arm behind the back', side, Math.asin(-d.z));
    }
  }
  return n;
}

/**
 * Before the arms are posed (they ride on the chest): the chest's twist on the pelvis capped at 42° (the captures and
 * the turn towards a friend add up), and, when the person is at rest, the shoulders brought within 8° of level.
 * Counter-rotates the lowest spine bone about the seat's up (twist) or forward (lean) axis.
 */
export function clampSpine(person, resting) {
  const rig = person.rig, fit = rig.fit, b = rig.b;
  if (!fit || !fit.ok) return 0;
  let n = 0;
  const twist = () => {
    const pl = wquat(b.pelvis, _q[0]), c = wquat(b.spine2, _q[1]);
    const D = _q[2].copy(pl).invert().multiply(c).multiply(_q[3].copy(fit.chestRel0).invert());
    const Ds = _q[3].copy(fit.pelvisInSeat).multiply(D).multiply(_q[4].copy(fit.pelvisInSeat).invert());
    return twistY(Ds);
  };
  const turnTo = (axisSeat, angle) => {
    const ax = _v[0].copy(axisSeat).transformDirection(rig.seat.matrixWorld);
    // (Spine1, not Spine: the thighs hang from Spine in these rigs, so turning it swings the legs round off the seat)
    const sp = b.spine1 || b.spine2;
    const sw = wquat(sp, _q[5]).premultiply(_q[6].setFromAxisAngle(ax, angle));
    sp.quaternion.copy(wquat(sp.parent, _q[7]).invert().multiply(sw));
    UPD(rig, sp);
    n++;
  };
  const cap = 42 * DEG;
  // (the seat's up is not the pelvis's when it leans: a few steps to land within the cap)
  for (let i = 0; i < 3; i++) { const y = twist(); if (Math.abs(y) <= cap) break; turnTo(_v[1].set(0, 1, 0), -(y - Math.sign(y) * (cap - 0.01))); }
  // resting (hands on the thighs), the shoulders square to the hips within 7°: a chest turned further puts one hand
  // beyond its arm's reach (the elbow locked straight) and the elbows out of symmetry (the limbs rules)
  if (resting && b.lThigh && b.rThigh) for (let i = 0; i < 3; i++) {
    const inv = rig.inv, a = wpos(b.lUpper, _v[2]).applyMatrix4(inv), d = wpos(b.rUpper, _v[3]).applyMatrix4(inv);
    const h0 = wpos(b.lThigh, _v[4]).applyMatrix4(inv), h1 = wpos(b.rThigh, _v[5]).applyMatrix4(inv);
    let y = Math.atan2(-(a.z - d.z), a.x - d.x) - Math.atan2(-(h0.z - h1.z), h0.x - h1.x);
    y = Math.atan2(Math.sin(y), Math.cos(y));
    const lim = 7 * DEG;
    if (Math.abs(y) <= lim) break;
    turnTo(_v[1].set(0, 1, 0), -(y - Math.sign(y) * (lim - 0.01)));
  }
  if (resting) for (let i = 0; i < 3; i++) { // (Spine1 sits higher than Spine: a few steps to level the shoulders)
    const inv = rig.inv, a = wpos(b.lUpper, _v[2]).applyMatrix4(inv), d = wpos(b.rUpper, _v[3]).applyMatrix4(inv);
    const roll = Math.atan2(a.y - d.y, Math.hypot(a.x - d.x, a.z - d.z)), lim = 6 * DEG; // (6: the check allows 10, and the arms' own pass can tip them a little after)
    if (Math.abs(roll) <= lim) break;
    // (about the axis across the shoulder line, whichever way the chest faces: a turned chest has no 'forward' roll)
    const sl = _v[4].copy(a).sub(d), hz = Math.hypot(sl.x, sl.z) || 1e-6, sn = _v[5].copy(sl).normalize();
    const target = _v[6].set(sl.x, Math.sign(sl.y) * Math.tan(lim - 0.01) * hz, sl.z).normalize();
    const Qs = _q[5].setFromUnitVectors(sn, target), sq = _q[6].copy(rig.invQ).invert();
    const Qw = _q[7].copy(sq).multiply(Qs).multiply(rig.invQ);
    const sp = b.spine1 || b.spine2, W = wquat(sp, _q[4]).premultiply(Qw);
    sp.quaternion.copy(wquat(sp.parent, _q[3]).invert().multiply(W)); UPD(rig, sp); n++;
  }
  return n;
}

/**
 * A look to the side shared down the body: when the face turns more than 25 degrees from the chest (a capture's look
 * round, a glance, the heckler), the chest takes 30% and the spine 20% of the turn and the neck keeps the rest, with
 * the face still pointing where it did. Returns the turn it found (radians, face against chest).
 */
export function shareYaw(person) {
  const rig = person.rig, fit = rig.fit, b = rig.b;
  if (!fit || !fit.headFwd || !fit.chestInSeat || !b.spine2) return 0;
  const yawOf = (q, local) => { const f = _v[0].copy(local).applyQuaternion(q); return Math.atan2(f.x, f.z); };
  const sq = rig.invQ;
  const hy = yawOf(_q[0].copy(sq).multiply(wquat(b.head, _q[1])), fit.headFwd);
  const cy = yawOf(_q[0].copy(sq).multiply(wquat(b.spine2, _q[1])).multiply(_q[2].copy(fit.chestInSeat).invert()), _v[1].set(0, 0, 1));
  let rel = hy - cy; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  if (Math.abs(rel) <= 25 * DEG) return rel;
  const extra = rel - Math.sign(rel) * 25 * DEG;
  const up = _v[2].set(0, 1, 0).transformDirection(rig.seat.matrixWorld);
  const turn = (bone, a) => { const W = wquat(bone, _q[3]).premultiply(_q[4].setFromAxisAngle(up, a)); bone.quaternion.copy(wquat(bone.parent, _q[5]).invert().multiply(W)); UPD(rig, bone); };
  const headW = _q[7].copy(wquat(b.head, _q[6])); // (the face's world rotation, kept)
  turn(b.spine1 || b.spine2, extra * 0.2); turn(b.spine2, extra * 0.3); // (Spine1: the thighs hang from Spine)
  b.head.quaternion.copy(wquat(b.head.parent, _q[5]).invert().multiply(headW)); UPD(rig, b.head);
  return rel;
}

/**
 * The face's pitch (up +, down -, in the seat frame) kept within [lo, hi] radians: a seated capture already tips the
 * head, and the look and a glance add to it, so a listener could end up studying their lap. The correction goes 40% into
 * the neck and the rest into the head. Returns the pitch it found.
 */
export function clampHead(person, lo, hi) {
  const rig = person.rig, fit = rig.fit, b = rig.b;
  if (!fit || !fit.headFwd || !b.head || !b.neck) return 0;
  const face = () => _v[0].copy(fit.headFwd).applyQuaternion(wquat(b.head, _q[0])).applyQuaternion(rig.invQ);
  let f = face();
  const p = Math.asin(clamp(f.y, -1, 1));
  if (p >= lo && p <= hi) return p;
  const seatQ = _q[1].copy(rig.invQ).invert();
  const fix = (bone, part) => {
    f = face();
    const pp = Math.asin(clamp(f.y, -1, 1)), p2 = clamp(pp, lo, hi);
    const hz = Math.hypot(f.x, f.z) || 1;
    const f2 = _v[1].set((f.x / hz) * Math.cos(p2), Math.sin(p2), (f.z / hz) * Math.cos(p2));
    const Qs = _q[2].setFromUnitVectors(f, f2);
    const Qw = _q[3].copy(seatQ).multiply(Qs).multiply(rig.invQ); // (the seat-frame turn, in the world)
    if (part < 1) _q[3].copy(_q[4].identity().slerp(Qw, part));
    const W = wquat(bone, _q[5]).premultiply(_q[3]);
    bone.quaternion.copy(wquat(bone.parent, _q[6]).invert().multiply(W));
    UPD(rig, bone);
  };
  fix(b.neck, 0.4);
  fix(b.head, 1);
  return p;
}

// ---------- seated posture ----------
/**
 * Seated posture, in the seat frame: the pelvis on the seat, feet on the floor, knees in front of the seat edge,
 * shoulders level within 10° (when nothing is going on), and a resting hand on a surface (a thigh, the lap, the seat,
 * the table, the other hand), never floating. Returns the count; fills `out`.
 */
export function posture(person, out = null, state = {}) {
  const rig = person.rig, fit = rig.fit, b = rig.b, inv = rig.inv, sh = person.o.seatH;
  let n = 0;
  const flag = (what, value) => { n++; if (out) out.push({ name: person.name, posture: what, value: +value.toFixed(3) }); };
  const L = (o, v) => wpos(o, v).applyMatrix4(inv);
  const pel = L(b.pelvis, _v[0]);
  if (pel.y < sh - 0.02 || pel.y > sh + 0.3) flag('pelvis off the seat', pel.y - sh);
  for (const ft of [b.lFoot, b.rFoot]) { const f = L(ft, _v[1]); if (f.y < -0.04 || f.y > 0.22) flag(f.y < 0 ? 'foot through the floor' : 'foot floating', f.y); }
  for (const ca of [b.lCalf, b.rCalf]) { const k = L(ca, _v[2]); if (k.z < 0.12) flag('knee behind the seat edge', k.z); }
  if (state.resting) {
    const a = L(b.lUpper, _v[3]), c = L(b.rUpper, _v[4]);
    const roll = Math.atan2(a.y - c.y, Math.hypot(a.x - c.x, a.z - c.z));
    if (Math.abs(roll) > 10 * DEG) flag('shoulders not level', roll / DEG);
    // hands resting on something
    if (fit && fit.ok) {
      const palms = [b.lHand, b.rHand].map((h, i) => { const t = i ? b.rTip : b.lTip; const p = L(h, _v[5 + i]); if (t) p.lerp(L(t, _v[7]), 0.5); return p; });
      palms.forEach((p, i) => {
        const pw = _v[9].copy(p).applyMatrix4(rig.seat.matrixWorld);
        let ok = palms[0].distanceTo(palms[1]) < 0.13; // clasped (one hand on the other)
        for (const s of fit.thighs) { const d = depthIn(s, pw, -0.09); if (d > -0.0) ok = true; } // within 9 cm of a thigh
        // (on the leg itself, hip joint to knee joint, where a fitted section stops short of the knee)
        // (the same 9 cm from the leg's surface as the section test: the fitted radius, or a typical one)
        { const q = _pp.copy(pw), R = fit.thighs.length ? Math.max(...fit.thighs.map((t) => Math.max(t.yP, t.zP))) : 0.1; for (const [th, ca] of [[b.lThigh, b.lCalf], [b.rThigh, b.rCalf]]) if (th && ca && segDist(q, wpos(th, _v[11]), wpos(ca, _v[12])) < R + 0.09) ok = true; } // (segDist uses _v[8], _v[9])
        if (fit.thighs.length === 1) { const m = _v[10].copy(p).setX(-p.x).applyMatrix4(rig.seat.matrixWorld); if (depthIn(fit.thighs[0], m, -0.09) > 0) ok = true; } // (the leg fitted on one side only: the other is its mirror)
        if (p.y < sh + 0.14 && Math.abs(p.x) < 0.32 && p.z > -0.22 && p.z < 0.32) ok = true; // on the seat beside them
        if (person.o.table && p.y > 0.72 && p.y < 0.84 && p.z > 0.28 && p.z < 0.86) ok = true; // on the table
        if (person._intentBack === i && p.z < -0.15) ok = true; // over the chair back
        if (state.armsFolded) ok = true;
        if (!ok) flag('hand floating', p.y - sh);
      });
    }
  }
  return n;
}

// ---------- elbows and knees ----------
// (the limbs pass: the reviewer's rules for seated and standing people as numbers, in the seat's frame: x across, y up,
// z forward. limbMetrics measures; limbs flags what breaks a rule. Sprites and impostors have no joints: not checked.)
/** Metres outside a section (negative inside), along the section's own ellipse (a fair estimate near the surface). */
function gapTo(sec, p) {
  const l = _v[10].copy(p).applyMatrix4(sec.inv);
  if (l.x < sec.x0 - 0.04 || l.x > sec.x1 + 0.04) return Infinity;
  const ey = l.y >= 0 ? sec.yP : sec.yN, ez = l.z >= 0 ? sec.zP : sec.zN;
  const e = Math.sqrt((l.y / ey) ** 2 + (l.z / ez) ** 2), r = Math.hypot(l.y, l.z);
  return e > 1e-6 ? r - r / e : -Math.min(ey, ez);
}
const segSeg = (a0, a1, b0, b1) => { let best = Infinity; for (let i = 0; i <= 6; i++) best = Math.min(best, segDist(_pp.copy(a0).lerp(a1, i / 6), b0, b1)); return best; };
const BARRIER_Z = 2.67; // the arena's barrier (arena.js AR.barrierZ: the tube at 1.1 m, the panel 12 cm in front of it)
/** The numbers for one person's elbows and knees (plain objects: a validator, not the frame loop). */
export function limbMetrics(person) {
  const rig = person.rig, fit = rig.fit, b = rig.b, inv = rig.inv;
  const W = (o) => wpos(o, new THREE.Vector3());
  const L = (v) => v.clone().applyMatrix4(inv);
  const S = [W(b.lUpper), W(b.rUpper)], E = [W(b.lFore), W(b.rFore)], H = [W(b.lHand), W(b.rHand)];
  const sl = S.map(L), el = E.map(L), up = new THREE.Vector3(0, 1, 0);
  // (in the chest's own frame: across the shoulders, up the spine, and forward out of the chest, so a body leaning back
  // with its arms hanging along it has its elbows beside the flanks, not 'behind')
  const spineUp = L(W(b.neck)).sub(L(W(b.pelvis))).normalize();
  const arms = [0, 1].map((i) => {
    const lat = sl[i].clone().sub(sl[1 - i]).normalize(); // outwards, this side
    const fwd = new THREE.Vector3().crossVectors(lat, spineUp).normalize(); if (fwd.z < 0) fwd.negate();
    lat.copy(new THREE.Vector3().crossVectors(spineUp, fwd).normalize().multiplyScalar(Math.sign(lat.dot(new THREE.Vector3().crossVectors(spineUp, fwd))) || 1));
    const d = el[i].clone().sub(sl[i]), hd = L(H[i]).sub(sl[i]);
    const a = S[i].clone().sub(E[i]).normalize(), c = H[i].clone().sub(E[i]).normalize();
    let flank = Infinity, inside = -1;
    if (fit) for (const s of fit.torso) { flank = Math.min(flank, gapTo(s, E[i])); inside = Math.max(inside, depthIn(s, E[i])); }
    const other = Math.min(segSeg(E[i], E[i], S[1 - i], E[1 - i]), segSeg(E[i], E[i], E[1 - i], H[1 - i]));
    return { out: d.dot(lat), hout: hd.dot(lat), up: d.dot(spineUp), fwd: d.dot(fwd), drop: -d.y, angle: Math.acos(clamp(a.dot(c), -1, 1)) / DEG, flank, inside, other };
  });
  const Hp = [W(b.lThigh), W(b.rThigh)], K = [W(b.lCalf), W(b.rCalf)], A = [W(b.lFoot), W(b.rFoot)];
  const toe = [b.lFoot, b.rFoot].map((f) => (f._toe ??= f.children.find((c) => /Toe0$/.test(c.name)) || null));
  const hl = Hp.map(L), kl = K.map(L), al = A.map(L);
  const legs = [0, 1].map((i) => {
    const shin = kl[i].clone().sub(al[i]), th = kl[i].clone().sub(hl[i]);
    const u = K[i].clone().sub(Hp[i]).normalize(), f = A[i].clone().sub(K[i]).normalize();
    let footPitch = 0;
    if (toe[i]) { const t = L(W(toe[i])).sub(al[i]); footPitch = Math.atan2(t.y, Math.hypot(t.x, t.z)) / DEG; }
    return {
      kneeFwd: kl[i].z - al[i].z, shinTilt: Math.atan2(Math.hypot(shin.x, shin.z), shin.y) / DEG,
      thighPitch: Math.atan2(th.y, Math.hypot(th.x, th.z)) / DEG, flex: Math.acos(clamp(u.dot(f), -1, 1)) / DEG, footPitch,
      knee: kl[i], ankle: al[i], hip: hl[i],
      minSlope: (Math.asin(clamp((hl[i].y - al[i].y - rig.len.leg[1]) / rig.len.leg[0], -1, 1)) / DEG),
    };
  });
  const sx = Math.sign(hl[0].x - hl[1].x) || 1;
  const kneeGap = (kl[0].x - kl[1].x) * sx, ankleGap = (al[0].x - al[1].x) * sx, hipGap = (hl[0].x - hl[1].x) * sx;
  // clearance: the legs (hip to knee to ankle) against the neighbours' legs, centre line to centre line
  let legNear = Infinity, legNearWho = '';
  if (person.near) for (const q of person.near) {
    if (!q.rig || q.hidden || !q.rig.model.visible) continue;
    const qb = q.rig.b, qH = [W(qb.lThigh), W(qb.rThigh)], qK = [W(qb.lCalf), W(qb.rCalf)], qA = [W(qb.lFoot), W(qb.rFoot)];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const d = Math.min(segSeg(Hp[i].clone().lerp(K[i], 0.5), K[i], qH[j].clone().lerp(qK[j], 0.5), qK[j]), segSeg(K[i], A[i], qK[j], qA[j]));
      if (d < legNear) { legNear = d; legNearWho = q.name; }
    }
  }
  // the furniture in front: the club's two-top (its post and top), the theatre seat in the row in front (its back), any
  // occupied chair in front (from that person's seat), the arena's barrier (world z)
  const furn = [];
  const legPts = [];
  for (let i = 0; i < 2; i++) { for (let k = 0; k <= 4; k++) legPts.push(K[i].clone().lerp(A[i], k / 4)); legPts.push(Hp[i].clone().lerp(K[i], 0.75)); }
  const src = person.src || {}, venue = person._venue || '';
  if (person.o.table && src.x !== undefined && person.o.neighbour) {
    const post = new THREE.Vector3(src.x + person.o.neighbour * 0.31, src.y || 0, src.z - 0.56);
    let d = Infinity;
    for (const p of legPts) if (p.y < (src.y || 0) + 0.72) d = Math.min(d, Math.hypot(p.x - post.x, p.z - post.z) - 0.025);
    furn.push({ what: 'table post', gap: d });
    let top = Infinity;
    for (let i = 0; i < 2; i++) { const k = K[i]; if (Math.hypot(k.x - post.x, k.z - post.z) < 0.31 + 0.05) top = Math.min(top, (src.y || 0) + 0.72 - (k.y + 0.06)); }
    furn.push({ what: 'table top', gap: top });
  }
  if (venue === 'theatre' && (src.row | 0) >= 1 && !src.balcony) {
    // the seat in front: 0.92 m ahead and 0.3 m down; its back's rear face 0.255 m behind its centre (rooms.js, venue.js)
    // (seats turn to the performer: along this one's forward the next row's line is 0.92 / cos(turn) away)
    const fz = Math.abs(_v[11].set(0, 0, 1).transformDirection(rig.seat.matrixWorld).z), ahead = 0.92 / Math.max(0.6, fz);
    let d = Infinity;
    for (const p of legPts) { const l = L(p); if (l.y > -0.3 + 0.445 && l.y < -0.3 + 1.0) d = Math.min(d, ahead - 0.255 - l.z); }
    furn.push({ what: 'seat in front', gap: d - 0.05 }); // (a knee's or shin's radius)
  }
  if (src.standing && venue === 'arena') {
    let d = Infinity, a = Infinity;
    for (const p of legPts) d = Math.min(d, p.z - (BARRIER_Z - 0.095) - 0.05); // (below the tube: its panel's back face)
    for (const p of [...E, ...H]) if (p.y < 1.16) a = Math.min(a, p.z - (p.y > 1.04 ? BARRIER_Z + 0.04 : BARRIER_Z - 0.095) - 0.04);
    furn.push({ what: 'barrier', gap: d }, { what: 'barrier (arms)', gap: a });
  }
  // (occupied chairs in front: only for someone sitting; a person on the move is checked against people, not seats)
  if (person.o.table === false && person.near && !(person.src && person.src._loco) && !person._inTraffic && !person.o.stand && (person._standW || 0) < 0.3) for (const q of person.near) {
    if (!q.rig || q.o.stand || q.hidden) continue;
    // (their chair stays where it is when they get up: its frame from their home seat, not from where they are now)
    const away = q.home && (q._inTraffic || (q.src && q.src._loco));
    const qi = away ? new THREE.Matrix4().compose(q.home.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), q.home.yaw), new THREE.Vector3(1, 1, 1)).invert() : q.rig.inv;
    const ql = L(away ? q.home.pos.clone() : W(q.rig.seat));
    if (ql.z < 0.35 || Math.abs(ql.x) > 0.5) continue; // (only a chair in front of this person)
    let d = Infinity;
    for (const p of legPts) {
      const l = p.clone().applyMatrix4(qi), sh = q.o.seatH;
      if (Math.abs(l.x) > 0.26 || l.y < 0.1 || l.y > sh + 0.5 || l.z < -0.4 || l.z > -0.1) continue; // (at their chair's back: not anywhere behind it, nor past it)
      d = Math.min(d, -0.26 - l.z - 0.05); // (their chair back's rear face, from behind: a knee's radius clear of it)
    }
    furn.push({ what: 'chair of ' + q.name, gap: d });
  }
  const com = L(W(b.pelvis)).multiplyScalar(0.55).add(L(W(b.spine2)).multiplyScalar(0.3)).add(L(W(b.head)).multiplyScalar(0.15));
  return { arms, legs, kneeGap, ankleGap, hipGap, legNear, legNearWho, furn, com };
}

// ---------- heads and shoulders between neighbours ----------
const _hc = [0, 1, 2, 3].map(() => new THREE.Vector3());
/** The middle of a fitted head, world. */
function headCentre(fit, out) { return out.set((fit.head.x0 + fit.head.x1) / 2, 0, 0).applyMatrix4(fit.head.bone.matrixWorld); }
/**
 * How far this person's head is into a neighbour's (heads 2 cm apart at their fitted radii) or into their chest and
 * shoulders (the torso sections widened by most of the head's radius), metres > 0 for contact; with whom and the
 * horizontal direction away from them (world). Returns the worst.
 */
const _contact = { depth: 0, who: null, away: new THREE.Vector3() };
export function headContact(person) {
  const fit = person.rig && person.rig.fit, C = _contact;
  C.depth = 0; C.who = null;
  if (!fit || !fit.ok || !fit.head || !person.near) return C;
  const H = headCentre(fit, _hc[0]), r = fit.head.r || 0.09;
  for (const q of person.near) {
    const qf = q.rig && q.rig.fit;
    if (!qf || !qf.ok || !qf.head || q.hidden || !q.rig.model.visible) continue;
    const Q = headCentre(qf, _hc[1]), dq = H.distanceTo(Q);
    if (dq > 0.9) continue;
    let d = (r + (qf.head.r || 0.09) + 0.02) - dq;
    if (d > C.depth) { C.depth = d; C.who = q; C.away.copy(H).sub(Q); }
    for (const sec of qf.torso) {
      const k = depthIn(sec, H, -r * 0.8);
      if (k > 0) { const dd = k * r; if (dd > C.depth) { C.depth = dd; C.who = q; C.away.copy(H).sub(wpos(sec.bone, _hc[2])); } }
    }
  }
  C.away.y = 0; if (C.away.lengthSq() < 1e-8) C.away.set(1, 0, 0); C.away.normalize();
  return C;
}
/**
 * The fix: a head that leans or throws itself back into a neighbour's head or shoulder yields, the upper body tipped
 * away from them at Spine1 (the legs hang from Spine), a few degrees a step until clear. Returns the steps taken.
 */
export function clearHeads(person) {
  const rig = person.rig, b = rig.b, sp = b.spine1 || b.spine2;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const C = headContact(person);
    if (C.depth <= 0) break;
    const up = _hc[3].set(0, 1, 0), ax = _v[0].crossVectors(up, C.away).normalize(); // (about this axis the head moves towards 'away')
    const ang = Math.min(0.22, (C.depth + 0.015) / 0.5);
    const sw = wquat(sp, _q[5]).premultiply(_q[6].setFromAxisAngle(ax, ang));
    sp.quaternion.copy(wquat(sp.parent, _q[7]).invert().multiply(sw));
    UPD(rig, sp);
    n++;
  }
  return n;
}

/**
 * The rules (seated: hands at rest on the thighs or knees, or anything else; standing: the arena floor and rail).
 * st: { seated, resting, rest (the rest pose's name), cheer (arms up or clapping: elbows may lift), bounce }.
 */
export function limbs(person, out = null, st = {}) {
  const rig = person.rig;
  if (!rig || !rig.fit || !rig.fit.ok) return 0;
  const M = limbMetrics(person);
  let n = 0;
  const flag = (what, side, value) => { n++; if (out) out.push({ name: person.name, what, side: side === null ? '' : side ? 'R' : 'L', value: +value.toFixed(3) }); };
  const symmetric = st.resting && !st.asym && /^(thighs|knees|clasped)$/.test(st.rest || ''); // (a lean to one shoulder or a turn towards a friend is meant to be asymmetric)
  M.arms.forEach((a, i) => {
    if (a.inside > 0.05) flag('elbow inside the torso', i, a.inside);
    if (a.other < 0.06) flag('elbow inside the other arm', i, a.other);
    // (winged: the elbow out to the side beyond where its own hand is, a chicken wing; a hand gesturing out to the side
    // takes its elbow with it, which is how an arm moves)
    if (!st.cheer && !st.moving && a.up < -0.05 && a.out > (st.seated ? 0.16 : 0.2) && a.out - 0.7 * Math.max(0, a.hout) > 0.1) flag('elbow winged out', i, a.out);
    if (!st.cheer && !st.moving && a.fwd < -0.1) flag('elbow tucked behind', i, a.fwd); // (a walker's arm swings back)
    if (st.resting && /^(thighs|knees|thighKnee)$/.test(st.rest || '') && (a.angle < 80 || a.angle > 145)) flag('elbow angle at rest', i, a.angle);
    if (st.resting && st.rest === 'clasped' && (a.angle < 70 || a.angle > 150)) flag('elbow angle at rest', i, a.angle);
    if (st.resting && (a.flank > 0.14 && a.out > 0.1)) flag('elbow off the flank at rest', i, a.flank);
  });
  if (symmetric) {
    const [l, r] = M.arms;
    if (Math.abs(l.angle - r.angle) > 30) flag('elbows not symmetric (angle)', null, l.angle - r.angle);
    if (Math.abs(l.out - r.out) > 0.1) flag('elbows not symmetric (out)', null, l.out - r.out);
  }
  if (st.seated) {
    M.legs.forEach((g, i) => {
      if (g.kneeFwd < -0.15) flag('ankle in front of the knee', i, g.kneeFwd);
      if (g.kneeFwd > 0.22) flag('foot tucked under the seat', i, g.kneeFwd);
      if (g.shinTilt > 32) flag('shin far from vertical', i, g.shinTilt);
      // (level as this body allows: with the shin upright, a short leg on a high seat has to slope its thigh; flagged
      // when it slopes 8° more than that, and never under 30°)
      if (Math.abs(g.thighPitch) > Math.max(30, g.minSlope + 8)) flag('thigh not level', i, g.thighPitch);
      // (the ankle joint sits ~36° above the ball of the foot, avatar to avatar: flat is about -36°)
      if (g.footPitch > -14 || g.footPitch < -60) flag(g.footPitch > -14 ? 'toes up' : 'on tiptoe', i, g.footPitch);
    });
    if (M.kneeGap < 0.11) flag(M.kneeGap < 0 ? 'legs crossed' : 'knees through each other', null, M.kneeGap);
    if (M.kneeGap > 0.55) flag('knees splayed', null, M.kneeGap);
    if (M.ankleGap < 0.1) flag(M.ankleGap < 0 ? 'ankles crossed' : 'ankles together', null, M.ankleGap);
  } else if (st.standing) {
    M.legs.forEach((g, i) => {
      if (g.flex < 2) flag('knee locked', i, g.flex);
      if (g.flex > (st.bounce ? 45 : 28)) flag('knee deep-bent', i, g.flex);
    });
    if (M.ankleGap < 0.1 || M.ankleGap > 0.5) flag('feet not under the hips', null, M.ankleGap);
    // (the weight over the feet: the body's centre (hips, chest and head, roughly weighted) within 16 cm of the point
    // between the ankles. Hips alone over-flag a laugh bent double, where the hips go back to balance the chest)
    const am = M.legs[0].ankle.clone().add(M.legs[1].ankle).multiplyScalar(0.5), com = M.com;
    if (Math.hypot(com.x - am.x, com.z - am.z) > 0.16) flag('weight off the feet', null, Math.hypot(com.x - am.x, com.z - am.z));
  }
  if (M.legNear < 0.09) flag('legs through ' + M.legNearWho, null, M.legNear);
  { const C = headContact(person); if (C.depth > 0.005) flag('head against ' + (C.who && C.who.name), null, C.depth); } // (2 cm apart at the heads' fitted radii; the shoulders a head's radius)
  for (const f of M.furn) if (f.gap < 0) flag('leg through the ' + f.what, null, f.gap);
  return n;
}
