// Motion capture for the crowd: the Microsoft Rocketbox animation library (MIT), made for the same Bip01 rig as every
// avatar in people/, so a clip's local bone rotations drop straight onto an avatar (tools/anim/build_anims.mjs packs
// them into anim/clips.bin + anim/clips.json; anim/CREDITS.md lists the sources).
//
// Everything here is stateless: a pose is a function of (clip, time), so any frame can be reproduced (&still&t=).
// A pose is a Float32Array: NB quaternions (x, y, z, w) followed by the Bip01 translation (x, y, z).
import * as THREE from 'three';

export const ANIM = { ok: false, bones: [], NB: 0, clips: {} };


export async function loadClips(base = 'anim/') {
  try {
    const get = (f, how) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r[how](); });
    const [meta, bin] = await Promise.all([get('clips.json', 'json'), get('clips.bin', 'arrayBuffer')]);
    if (meta.version !== 2) throw new Error('clips.json version ' + meta.version);
    ANIM.bones = meta.bones;
    ANIM.NB = meta.bones.length;
    for (const [name, c] of Object.entries(meta.clips)) {
      c.name = name;
      c.Q = new Int16Array(bin, c.q, c.n * ANIM.NB * 3);
      c.R = new Int16Array(bin, c.r, c.n * 3);
      ANIM.clips[name] = c;
    }
    ANIM.ok = true;
  } catch (e) {
    console.warn('[crowd] no motion clips, procedural only:', e && e.message);
  }
  return ANIM;
}

export const newPose = () => new Float32Array(ANIM.NB * 4 + 3);
const S = 1 / 32767;

/** The raw pose at clip time u (seconds, clamped to the clip). */
function sampleRaw(c, u, out) {
  const NB = ANIM.NB;
  const f = Math.min(Math.max(u, 0) * c.fps, c.n - 1.0001);
  const i = Math.floor(f), k = f - i, j = i + 1;
  // stored as x, y, z with w >= 0 (w rebuilt), in 1/32767 units
  const Q = c.Q, a = i * NB * 3, b = j * NB * 3;
  for (let n = 0, m = 0; n < NB * 4; n += 4, m += 3) {
    const x0 = Q[a + m] * S, y0 = Q[a + m + 1] * S, z0 = Q[a + m + 2] * S, w0 = Math.sqrt(Math.max(0, 1 - x0 * x0 - y0 * y0 - z0 * z0));
    let x1 = Q[b + m] * S, y1 = Q[b + m + 1] * S, z1 = Q[b + m + 2] * S, w1 = Math.sqrt(Math.max(0, 1 - x1 * x1 - y1 * y1 - z1 * z1));
    if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, z = z0 + (z1 - z0) * k, w = w0 + (w1 - w0) * k;
    const l = 1 / (Math.sqrt(x * x + y * y + z * z + w * w) || 1);
    out[n] = x * l; out[n + 1] = y * l; out[n + 2] = z * l; out[n + 3] = w * l;
  }
  const R = c.R, o = NB * 4;
  for (let m = 0; m < 3; m++) out[o + m] = (R[i * 3 + m] + (R[j * 3 + m] - R[i * 3 + m]) * k) * 0.001;
  return out;
}

const _tmp = [];
const tmp = (k) => (_tmp[k] ||= newPose());

/**
 * The pose at time t. Looping clips repeat with a crossfade of `x` seconds over the seam (the last x seconds blend
 * into the first), so a long idle never jumps; one-shots clamp.
 */
export function sample(c, t, out, x = 0.8) {
  if (!c.loop) return sampleRaw(c, t, out);
  x = Math.min(x, c.dur * 0.3);
  const P = c.dur - x;
  let s = t % P; if (s < 0) s += P;
  const u = s + x;
  if (u < c.dur - x || x <= 0) return sampleRaw(c, u, out);
  const w = (u - (c.dur - x)) / x;
  sampleRaw(c, u, out);
  return mix(out, sampleRaw(c, u - P, tmp(7)), w * w * (3 - 2 * w), out);
}

/** The walk cycle at `cycles` (distance walked / stride): the phase of the in-place cycle, so planted feet stay put. */
export function sampleCycle(c, cycles, out) {
  let f = cycles % 1; if (f < 0) f += 1;
  return sampleRaw(c, f * c.dur, out);
}

/** out = nlerp(a, b, w) per bone; `mask` (optional) scales w per bone; the root follows `rootW` (default w). */
export function mix(a, b, w, out, mask = null, rootW = w) {
  const NB = ANIM.NB;
  for (let i = 0, n = 0; i < NB; i++, n += 4) {
    const k = mask ? w * mask[i] : w;
    if (k <= 0) { if (out !== a) { out[n] = a[n]; out[n + 1] = a[n + 1]; out[n + 2] = a[n + 2]; out[n + 3] = a[n + 3]; } continue; }
    let x1 = b[n], y1 = b[n + 1], z1 = b[n + 2], w1 = b[n + 3];
    if (a[n] * x1 + a[n + 1] * y1 + a[n + 2] * z1 + a[n + 3] * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    const x = a[n] + (x1 - a[n]) * k, y = a[n + 1] + (y1 - a[n + 1]) * k, z = a[n + 2] + (z1 - a[n + 2]) * k, ww = a[n + 3] + (w1 - a[n + 3]) * k;
    const l = 1 / (Math.sqrt(x * x + y * y + z * z + ww * ww) || 1);
    out[n] = x * l; out[n + 1] = y * l; out[n + 2] = z * l; out[n + 3] = ww * l;
  }
  const o = NB * 4;
  for (let m = 0; m < 3; m++) out[o + m] = a[o + m] + (b[o + m] - a[o + m]) * rootW;
  return out;
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
/**
 * Additive layer: out = base · (clip · ref⁻¹) per masked bone, weight w (local frames). Keeps the seated base posture
 * and adds what the clip does relative to its own reference frame (a nod, a laugh's bend, a talker's hand beats).
 */
export function addLayer(base, clip, ref, w, out, mask) {
  const NB = ANIM.NB;
  if (out !== base) out.set(base);
  for (let i = 0, n = 0; i < NB; i++, n += 4) {
    const k = w * (mask ? mask[i] : 1);
    if (k <= 0) continue;
    qa.set(clip[n], clip[n + 1], clip[n + 2], clip[n + 3]);
    qb.set(ref[n], ref[n + 1], ref[n + 2], ref[n + 3]).invert();
    qa.multiply(qb); // the clip's change from its reference, in the parent's frame
    qc.identity().slerp(qa, Math.min(k, 1));
    qb.set(base[n], base[n + 1], base[n + 2], base[n + 3]);
    qc.multiply(qb);
    out[n] = qc.x; out[n + 1] = qc.y; out[n + 2] = qc.z; out[n + 3] = qc.w;
  }
  return out;
}

/**
 * Mirror data for one rig (cached): each clip bone's left/right partner, and the body's left-right axis in the frame
 * of the bone's parent at rest, so a change of pose can be reflected across the body's centre plane.
 */
export function mirrorOf(rig) {
  if (rig._mir) return rig._mir;
  const bones = bonesOf(rig), X = new THREE.Vector3(1, 0, 0);
  const partner = ANIM.bones.map((n, i) => { const m = n.replace(/_L_/, '_#_').replace(/_R_/, '_L_').replace(/_#_/, '_R_'); const j = ANIM.bones.indexOf(m); return j >= 0 ? j : i; });
  const nrm = bones.map((b) => { const r = b && rig.rest && rig.rest.get(b); return r ? X.clone().applyQuaternion(r.Pinv) : X.clone(); });
  return (rig._mir = { partner, nrm });
}
const qd = new THREE.Quaternion();
/**
 * As addLayer, but the clip's change is mirrored left for right first: a left-handed take of the same capture.
 * A change q = (v, w) in the parent's frame reflects across the plane with normal n as (2 (v·n) n − v, w).
 */
export function addLayerMirror(base, clip, ref, w, out, mask, rig) {
  const NB = ANIM.NB, M = mirrorOf(rig);
  if (out !== base) out.set(base);
  for (let i = 0, n = 0; i < NB; i++, n += 4) {
    const k = w * (mask ? mask[i] : 1);
    if (k <= 0) continue;
    const j = M.partner[i] * 4; // the change of the partner bone, reflected
    qa.set(clip[j], clip[j + 1], clip[j + 2], clip[j + 3]);
    qb.set(ref[j], ref[j + 1], ref[j + 2], ref[j + 3]).invert();
    qa.multiply(qb);
    const N = M.nrm[i], d = 2 * (qa.x * N.x + qa.y * N.y + qa.z * N.z);
    qd.set(d * N.x - qa.x, d * N.y - qa.y, d * N.z - qa.z, qa.w);
    qc.identity().slerp(qd, Math.min(k, 1));
    qb.set(base[n], base[n + 1], base[n + 2], base[n + 3]);
    qc.multiply(qb);
    out[n] = qc.x; out[n + 1] = qc.y; out[n + 2] = qc.z; out[n + 3] = qc.w;
  }
  return out;
}

/** A clip's mean pose (per-bone average rotation): an additive layer taken against it adds only the motion. */
export function meanPose(c, out = newPose(), n = 24) {
  const NB = ANIM.NB, acc = new Float64Array(NB * 4 + 3), p = newPose();
  for (let k = 0; k < n; k++) {
    sampleRaw(c, (k / (n - 1)) * c.dur, p);
    for (let i = 0; i < NB * 4; i += 4) {
      const s = k && acc[i] * p[i] + acc[i + 1] * p[i + 1] + acc[i + 2] * p[i + 2] + acc[i + 3] * p[i + 3] < 0 ? -1 : 1;
      for (let m = 0; m < 4; m++) acc[i + m] += s * p[i + m];
    }
    for (let m = 0; m < 3; m++) acc[NB * 4 + m] += p[NB * 4 + m] / n;
  }
  for (let i = 0; i < NB * 4; i += 4) { const l = Math.hypot(acc[i], acc[i + 1], acc[i + 2], acc[i + 3]) || 1; for (let m = 0; m < 4; m++) out[i + m] = acc[i + m] / l; }
  for (let m = 0; m < 3; m++) out[NB * 4 + m] = acc[NB * 4 + m];
  return out;
}

/** Bone masks by name pattern, in ANIM.bones order: 1 for matching bones, 0 otherwise (or the given weights). */
export function maskOf(fn) { return Float32Array.from(ANIM.bones, (b, i) => fn(b, i)); }

/**
 * The bones of one rig in ANIM.bones order (null where the avatar lacks one), cached on the rig.
 */
export function bonesOf(rig) {
  if (rig._ab) return rig._ab;
  rig._ab = ANIM.bones.map((n) => rig.model.getObjectByName(n) || null);
  // mark them for the rig's additive mode (people.js Rig.setRot adds to a clip-posed bone instead of its rest)
  if (rig.rest) for (const b of rig._ab) { const r = b && rig.rest.get(b); if (r) r.clip = true; }
  return rig._ab;
}

/** Write a pose onto a rig's bones (local quaternions); the Bip01 translation goes on the root bone. */
export function applyPose(rig, pose, rootOffset = null) {
  const bones = bonesOf(rig);
  for (let i = 0, n = 0; i < bones.length; i++, n += 4) {
    const b = bones[i];
    if (b) b.quaternion.set(pose[n], pose[n + 1], pose[n + 2], pose[n + 3]);
  }
  const root = bones[0];
  if (root) {
    const o = ANIM.NB * 4;
    root.position.set(pose[o], pose[o + 1], pose[o + 2]);
    if (rootOffset) root.position.add(rootOffset);
  }
}

/** Pick one clip name from a list by a value u in [0, 1). */
export const pickOf = (list, u) => list[Math.min(list.length - 1, Math.floor(u * list.length))];
/** The clips of one family for a gender ('m' or 'f'), falling back to the other gender. */
export function family(prefix, g) {
  const names = Object.keys(ANIM.clips);
  const own = names.filter((n) => n.startsWith(g + '_' + prefix));
  return own.length ? own : names.filter((n) => n.slice(2).startsWith(prefix));
}
