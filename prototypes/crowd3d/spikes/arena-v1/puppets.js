// Arena spike v1: forty invisible puppets that write a ring of live poses (plan C1, simplified).
//
// Each puppet: a captured Rocketbox idle at its own phase and speed, the captured laugh blended on top when it joins a
// reaction (its own onset, its own take), and arm gestures (claps, arms up, one arm, fist pump) solved by two-bone IK
// on the live pose. Forward kinematics in flat arrays; the 20 crowd bones' skin transforms go into one row of the ring
// texture per puppet per tick. The decisions here are a seeded stand-in for people.js Person.response (castShare-like
// share, per-reaction cast, temperaments); the spike tests the GPU path, not the decision layer.
import * as THREE from 'three';
import { CL, newPose, sample, mix } from './clips.js';
import { RING_CLIP, NRB, C, fk, skinOf, qmul, qrot } from './skeleton.js';

export const SLOTS = 36, TICK_HZ = 30, RING_W = NRB * 2 + 4; // 44 texels: 20 bones × (quat, translation) + 4 summary
export const N_STAND = 32, N_PUPPETS = 40; // 16 f + 16 m standing (0-15 f, 16-31 m), 4 f + 4 m seated (32-35, 36-39)

const hash = (a, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const minjerk = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (10 - 15 * x + 6 * x * x));
// arena share of the room that joins a reaction of strength s (about a third at 0.5, about four in five at 0.9)
export const share = (s) => Math.min(0.95, 1.18 * (0.28 * s + 0.6 * s * s));
const TEMPS = ['big', 'big', 'big', 'laugh', 'laugh', 'laugh', 'chuckle', 'chuckle', 'chuckle', 'friend', 'friend', 'clap', 'clap', 'phone', 'still', 'sceptic'];

/** Room events (measured moments in the real page; scripted by &state= here). */
export function levelAt(e, tt, att = 0.3) {
  if (tt <= 0) return 0;
  const a = smooth(tt / att), r = tt > e.hold ? 1 - smooth((tt - e.hold) / 1.2) : 1;
  return e.s * a * r;
}

export class Puppets {
  constructor(skels, ringData) {
    this.S = skels; // { f, m }
    this.data = ringData;
    this.pose = newPose(); this.tmp = newPose(); this.tmp2 = newPose(); this.lp = newPose();
    this.qw = new Float64Array(CL.NB * 4); this.pw = new Float64Array(CL.NB * 3);
    this.only = new Uint8Array(CL.NB); for (const c of [C.lClav, C.lUA, C.lFA, C.lHand, C.rClav, C.rUA, C.rFA, C.rHand]) this.only[c] = 1;
    const clip = (n) => CL.clips[n] || null;
    this.list = [];
    for (let i = 0; i < N_PUPPETS; i++) {
      const seated = i >= N_STAND, g = seated ? (i < 36 ? 'f' : 'm') : (i < 16 ? 'f' : 'm');
      const k = seated ? i - N_STAND : i % 16;
      const temp = seated ? 'laugh' : TEMPS[(k * 7 + (g === 'm' ? 3 : 0)) % 16];
      const idles = seated ? [`${g}_sit_chair_idle_neutral_01`, `${g}_sit_chair_breathe_01`, `${g}_sit_chair_idle_look_around`]
        : [`${g}_gestic_listen_neutral_01`, `${g}_gestic_listen_neutral_01`, `${g}_gestic_listen_accept_01`, `${g}_gestic_listen_accept_02`];
      const idle = clip(idles[Math.floor(hash(i, 1) * idles.length)]);
      this.list.push({
        i, g, seated, temp, idle, phase: hash(i, 2) * idle.dur, speed: 0.92 + 0.16 * hash(i, 3), clapHz: 1.8 + 1.4 * hash(i, 4),
        laughs: ['low', 'loud', 'extreme'].map((s) => clip(`${g}_gestic_laugh_${s}`)), rootOff: new Float64Array(3),
      });
    }
    // feet on the floor and no drift: per clip, the root shift that puts the captured feet where the avatar's bind
    // feet are, and takes out the capture's mean horizontal root position
    this.offs = new Map();
    for (const g of ['f', 'm']) {
      const S = this.S[g], footY = Math.min(S.joint[C.lFoot * 3 + 1], S.joint[C.rFoot * 3 + 1]);
      for (const c of Object.values(CL.clips)) {
        if (c.gender !== g) continue;
        sample(c, 0, this.pose, this.tmp);
        fk(S, this.pose, this.qw, this.pw, null);
        const fy = Math.min(this.pw[C.lFoot * 3 + 1], this.pw[C.rFoot * 3 + 1]);
        let mx = 0, mz = 0; const o = CL.NB * 4;
        for (let f = 0; f < c.n; f++) { mx += c.R[f * 3] * 0.001; mz += c.R[f * 3 + 2] * 0.001; }
        // (offset expressed in the root's parent frame: the vertical shift through the inverse arm rotation)
        const S2 = S, inv = new THREE.Quaternion(S2.armQ[0], S2.armQ[1], S2.armQ[2], S2.armQ[3]).invert();
        const dy = new THREE.Vector3(0, footY - fy, 0).applyQuaternion(inv);
        const seatedClip = /_sit_/.test(c.name);
        this.offs.set(c, seatedClip ? [0, 0, 0] : [-mx / c.n + dy.x, dy.y, -mz / c.n + dy.z]);
        void o;
      }
    }
    this.events = [];
    this.cost = { ticks: 0, ms: 0 };
  }

  /** Arm gesture targets for this puppet at time t (weights per arm), from the events. */
  decide(P, t) {
    let L = 0, lc = null, lt = 0; // laugh weight, clip, clip time
    const arms = this._arms || (this._arms = { l: { w: 0, kind: '', h: 0 }, r: { w: 0, kind: '', h: 0 } });
    arms.l.w = 0; arms.r.w = 0;
    for (const e of this.events) {
      const tt0 = t - e.t0;
      if (tt0 < 0 || tt0 > e.hold + 2.5) continue;
      const u = hash(P.i * 131 + 7, e.id);
      let sh = share(e.s);
      if (P.temp === 'still' && e.kind === 'laugh') sh = 0;
      if (P.temp === 'sceptic') sh = e.s > 0.8 ? sh * 0.5 : 0;
      if (P.temp === 'big' || P.temp === 'laugh') sh = Math.min(0.97, sh * 1.25);
      if (u >= sh) continue;
      const onset = 0.05 + 0.35 * hash(P.i, e.id * 3 + 1), tt = tt0 - onset;
      const env = levelAt(e, tt) / Math.max(e.s, 1e-3);
      if (env <= 0) continue;
      const gain = P.temp === 'big' ? 1 : P.temp === 'laugh' ? 0.9 : P.temp === 'chuckle' ? 0.6 : 0.5;
      if (e.kind === 'laugh' || e.kind === 'cheer') {
        let lvl = e.s >= 0.8 ? 2 : e.s >= 0.55 ? 1 : 0;
        if (P.temp === 'chuckle' || P.temp === 'friend' || P.temp === 'clap') lvl = Math.max(0, lvl - 1);
        if (e.kind === 'cheer') lvl = 1;
        const w = env * (e.kind === 'cheer' ? 0.55 : gain);
        if (w > L) { L = w; lc = P.laughs[lvl]; lt = hash(P.i, e.id * 5 + 2) * 8 + tt * (0.95 + 0.1 * hash(P.i, 9)); }
      }
      const att = 0.35 + 0.25 * hash(P.i, e.id * 7 + 3);
      const aw = minjerk(Math.min(1, tt / att)) * (tt > e.hold ? 1 - smooth((tt - e.hold) / (0.6 + 0.3 * hash(P.i, 11))) : 1);
      if (aw <= 0) continue;
      const g = hash(P.i * 17 + 3, e.id * 11 + 5);
      let kind = '', side = 'both', h = 0;
      if (e.kind === 'laugh') {
        if ((P.temp === 'clap' || g < 0.22) && e.s > 0.6) { kind = 'clap'; h = -0.18; }
        else if (e.s > 0.8 && g > 0.85) kind = 'up';
      } else if (e.kind === 'cheer') {
        if (g < 0.4) kind = 'up'; else if (g < 0.6) { kind = 'up'; side = hash(P.i, e.id) < 0.5 ? 'l' : 'r'; }
        else if (g < 0.75) { kind = 'pump'; side = 'r'; } else { kind = 'clap'; h = 0.12; }
      } else if (e.kind === 'applause') { kind = 'clap'; h = P.temp === 'big' ? 0.12 : -0.18; }
      if (!kind) continue;
      for (const s of ['l', 'r']) if (side === 'both' || side === s || kind === 'clap') if (aw > arms[s].w) { arms[s].w = aw; arms[s].kind = kind; arms[s].h = h; }
    }
    return { L, lc, lt, arms };
  }

  /** Compute every puppet at time t and write ring slot `slot`. seatedToo: the seated ones (every other tick). */
  tick(t, slot, seatedToo = true) {
    const t0 = performance.now();
    for (const P of this.list) {
      const row = (slot * N_PUPPETS + P.i) * RING_W * 4;
      if (P.seated && !seatedToo) { // 15 Hz: repeat the previous slot
        const prev = (((slot + SLOTS - 1) % SLOTS) * N_PUPPETS + P.i) * RING_W * 4;
        this.data.copyWithin(row, prev, prev + RING_W * 4);
        continue;
      }
      this.solve(P, t);
      this.write(P, row);
    }
    this.cost.ticks++; this.cost.ms += performance.now() - t0;
  }

  solve(P, t) {
    const S = this.S[P.g], pose = this.pose;
    sample(P.idle, P.phase + t * P.speed, pose, this.tmp);
    const ro = this.offs.get(P.idle); P.rootOff[0] = ro[0]; P.rootOff[1] = ro[1]; P.rootOff[2] = ro[2];
    const D = P.seated ? null : this.decide(P, t);
    if (D && D.L > 0 && D.lc) {
      sample(D.lc, D.lt, this.lp, this.tmp2);
      mix(pose, this.lp, D.L, pose);
      const lo = this.offs.get(D.lc);
      for (let k = 0; k < 3; k++) P.rootOff[k] += (lo[k] - P.rootOff[k]) * D.L;
    }
    fk(S, pose, this.qw, this.pw, P.rootOff);
    if (D && (D.arms.l.w > 0 || D.arms.r.w > 0)) {
      this.gesture(P, S, pose, t, D.arms);
      fk(S, pose, this.qw, this.pw, P.rootOff, 0, this.only);
    }
  }

  gesture(P, S, pose, t, arms) {
    const pw = this.pw;
    const L = C.lUA * 3, R = C.rUA * 3;
    // body frame: right = left shoulder → right shoulder, up, forward = up × right
    let rx = pw[R] - pw[L], rz = pw[R + 2] - pw[L + 2]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const fx = rz, fz = -rx; // (0,1,0) × (rx,0,rz) = (rz, 0, -rx)
    const mx = (pw[L] + pw[R]) / 2, my = (pw[L + 1] + pw[R + 1]) / 2, mz = (pw[L + 2] + pw[R + 2]) / 2;
    for (const s of ['l', 'r']) {
      const A = arms[s]; if (A.w <= 0) continue;
      const sg = s === 'l' ? -1 : 1, ua = s === 'l' ? C.lUA : C.rUA, sh = ua * 3, lens = S.arm[s], reach = lens[0] + lens[1];
      let tx, ty, tz, px, py, pz;
      if (A.kind === 'up' || A.kind === 'pump') {
        // the shoulder girdle rises with the arm (about a third of the elevation is the clavicle's), and the elbow
        // stays a little bent: the upper arm turns about 130 degrees, not 170, so its skin doesn't tear at the armpit
        this.shrug(S, pose, s === 'l' ? C.lClav : C.rClav, sg, fx, fz, 0.42 * A.w);
        const k = A.kind === 'pump' ? 0.58 + 0.24 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 1.9 + P.i)) : 0.8;
        tx = pw[sh] + sg * rx * 0.16 + fx * 0.12; ty = pw[sh + 1] + reach * k; tz = pw[sh + 2] + sg * rz * 0.16 + fz * 0.12;
        px = sg * rx * 0.9 - fx * 0.2; py = -0.2; pz = sg * rz * 0.9 - fz * 0.2;
      } else { // clap: hands meet in front of the chest (or high), apart and together at this puppet's own rate
        const sep = 0.05 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * P.clapHz + P.i * 1.7));
        const fwd = A.h > 0.3 ? 0.18 : 0.33;
        tx = mx + fx * fwd + sg * rx * sep; ty = my + A.h; tz = mz + fz * fwd + sg * rz * sep;
        px = sg * rx * 0.8 - fx * 0.1; py = -0.6; pz = sg * rz * 0.8 - fz * 0.1;
      }
      this.ik(S, pose, ua, ua + 1, ua + 2, tx, ty, tz, px, py, pz, lens, A.w);
    }
  }

  /** Raise one clavicle about the body's forward axis by `ang` radians (its lateral end up), and redo that arm's FK. */
  shrug(S, pose, cl, sg, fx, fz, ang) {
    const qw = this.qw, B = this._sh || (this._sh = { r: new Float64Array(4), q: new Float64Array(4), inv: new Float64Array(4), loc: new Float64Array(4), only: new Uint8Array(CL.NB) });
    const h = (-sg * ang) / 2, sn = Math.sin(h); // (a positive turn about +F lowers the right side: the right, sg = +1, turns negative)
    B.r[0] = fx * sn; B.r[1] = 0; B.r[2] = fz * sn; B.r[3] = Math.cos(h);
    qmul(B.r, 0, qw, cl * 4, B.q, 0);
    const pa = S.parent[cl];
    qmul(qw, pa * 4, S.offQ, cl * 4, B.inv, 0); conj(B.inv);
    qmul(B.inv, 0, B.q, 0, B.loc, 0);
    pose[cl * 4] = B.loc[0]; pose[cl * 4 + 1] = B.loc[1]; pose[cl * 4 + 2] = B.loc[2]; pose[cl * 4 + 3] = B.loc[3];
    B.only.fill(0); for (let c = cl; c <= cl + 3; c++) B.only[c] = 1;
    fk(S, pose, qw, this.pw, null, 0, B.only);
  }

  /** Two-bone IK on the live pose: the upper arm and forearm's local rotations move towards the solution by w. */
  ik(S, pose, ua, fa, hd, tx, ty, tz, px, py, pz, lens, w) {
    const qw = this.qw, pw = this.pw, l1 = lens[0], l2 = lens[1];
    const sx = pw[ua * 3], sy = pw[ua * 3 + 1], sz = pw[ua * 3 + 2];
    let dx = tx - sx, dy = ty - sy, dz = tz - sz; let dl = Math.hypot(dx, dy, dz) || 1e-6;
    dx /= dl; dy /= dl; dz /= dl;
    dl = Math.min(Math.max(dl, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.005);
    const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pd = px * dx + py * dy + pz * dz; let qx = px - dx * pd, qy = py - dy * pd, qz = pz - dz * pd; const ql = Math.hypot(qx, qy, qz) || 1; qx /= ql; qy /= ql; qz /= ql;
    const ex = sx + dx * a + qx * h, ey = sy + dy * a + qy * h, ez = sz + dz * a + qz * h; // elbow
    const hx = sx + dx * dl, hy = sy + dy * dl, hz = sz + dz * dl; // hand (reachable)
    const B = this._ik || (this._ik = { s: new Float64Array(4), q: new Float64Array(4), q2: new Float64Array(4), inv: new Float64Array(4), v: new Float64Array(3), loc: new Float64Array(4), pf: new Float64Array(4), fs: new Float64Array(4), fw: new Float64Array(4), floc: new Float64Array(4) });
    // upper arm: swing its current direction onto the elbow
    swing(pw[fa * 3] - sx, pw[fa * 3 + 1] - sy, pw[fa * 3 + 2] - sz, ex - sx, ey - sy, ez - sz, B.s);
    qmul(B.s, 0, qw, ua * 4, B.q, 0); // new world rotation of the upper arm
    const pa = S.parent[ua];
    qmul(qw, pa * 4, S.offQ, ua * 4, B.inv, 0); conj(B.inv);
    qmul(B.inv, 0, B.q, 0, B.loc, 0);
    // forearm, from the new upper arm
    const parentFa = B.pf; qmul(B.q, 0, S.offQ, fa * 4, parentFa, 0); // world of the forearm's parent frame
    qrot(B.q, 0, S.offP[fa * 3], S.offP[fa * 3 + 1], S.offP[fa * 3 + 2], B.v, 0);
    const Ex = sx + B.v[0], Ey = sy + B.v[1], Ez = sz + B.v[2];
    qmul(parentFa, 0, pose, fa * 4, B.q2, 0); // forearm world before its own swing
    qrot(B.q2, 0, S.offP[hd * 3], S.offP[hd * 3 + 1], S.offP[hd * 3 + 2], B.v, 0);
    swing(B.v[0], B.v[1], B.v[2], hx - Ex, hy - Ey, hz - Ez, B.fs);
    qmul(B.fs, 0, B.q2, 0, B.fw, 0);
    conj(parentFa); qmul(parentFa, 0, B.fw, 0, B.floc, 0);
    nlerpInto(pose, ua * 4, B.loc, w); nlerpInto(pose, fa * 4, B.floc, w);
  }

  write(P, row) {
    const S = this.S[P.g], d = this.data, qw = this.qw, pw = this.pw;
    for (let r = 0; r < NRB; r++) {
      const k = skinOf(S, qw, pw, RING_CLIP[r]), o = row + r * 8;
      d[o] = k[0]; d[o + 1] = k[1]; d[o + 2] = k[2]; d[o + 3] = k[3]; d[o + 4] = k[4]; d[o + 5] = k[5]; d[o + 6] = k[6]; d[o + 7] = 0;
    }
    // summary texels (stands and phones read these): head offset, arms up, clap phase; standing, right hand
    const o = row + NRB * 8, h = C.head * 3, p0 = C.pelvis * 3, rh = C.rHand * 3;
    d[o] = pw[h] - pw[p0]; d[o + 1] = pw[h + 1] - pw[p0 + 1]; d[o + 2] = Math.max(0, pw[rh + 1] - pw[h + 1]); d[o + 3] = 0;
    d[o + 4] = P.seated ? 0 : 1; d[o + 5] = pw[rh]; d[o + 6] = pw[rh + 1]; d[o + 7] = pw[rh + 2];
    for (let k = 8; k < 16; k++) d[o + k] = 0;
  }
}

function conj(q) { q[0] = -q[0]; q[1] = -q[1]; q[2] = -q[2]; }
/** The shortest rotation taking direction a onto direction b. */
function swing(ax, ay, az, bx, by, bz, out) {
  const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
  ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
  const d = ax * bx + ay * by + az * bz;
  if (d < -0.9999) { out[0] = 0; out[1] = 1; out[2] = 0; out[3] = 0; return; }
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx, w = 1 + d, l = Math.hypot(cx, cy, cz, w);
  out[0] = cx / l; out[1] = cy / l; out[2] = cz / l; out[3] = w / l;
}
function nlerpInto(pose, i, q, w) {
  let x = q[0], y = q[1], z = q[2], ww = q[3];
  if (pose[i] * x + pose[i + 1] * y + pose[i + 2] * z + pose[i + 3] * ww < 0) { x = -x; y = -y; z = -z; ww = -ww; }
  const a = pose[i] + (x - pose[i]) * w, b = pose[i + 1] + (y - pose[i + 1]) * w, c = pose[i + 2] + (z - pose[i + 2]) * w, dd = pose[i + 3] + (ww - pose[i + 3]) * w;
  const l = 1 / (Math.hypot(a, b, c, dd) || 1);
  pose[i] = a * l; pose[i + 1] = b * l; pose[i + 2] = c * l; pose[i + 3] = dd * l;
}

// ---------- the ring texture ----------
// float → half by table (van der Zijp): the f16 ring converts 7,040 floats a tick
const _f = new Float32Array(1), _u = new Uint32Array(_f.buffer), BASE = new Uint16Array(512), SHIFT = new Uint8Array(512);
for (let i = 0; i < 256; i++) {
  const e = i - 127;
  let b, s;
  if (e < -24) { b = 0; s = 24; } else if (e < -14) { b = 0x0400 >> (-e - 14); s = -e - 1; } else if (e <= 15) { b = (e + 15) << 10; s = 13; } else if (e < 128) { b = 0x7c00; s = 24; } else { b = 0x7c00; s = 13; }
  BASE[i] = b; BASE[i | 0x100] = b | 0x8000; SHIFT[i] = s; SHIFT[i | 0x100] = s;
}
void _f; void _u;

export class PoseRing {
  constructor(renderer, fmt = 'f32') {
    this.renderer = renderer; this.fmt = fmt;
    this.W = RING_W; this.H = SLOTS * N_PUPPETS;
    this.data = new Float32Array(this.W * this.H * 4);
    this.u32 = new Uint32Array(this.data.buffer);
    if (fmt === 'f16') {
      this.half = new Uint16Array(this.W * this.H * 4);
      this.tex = new THREE.DataTexture(this.half, this.W, this.H, THREE.RGBAFormat, THREE.HalfFloatType);
    } else this.tex = new THREE.DataTexture(this.data, this.W, this.H, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; this.tex.flipY = false;
    this.tex.needsUpdate = true;
    this.bytes = this.W * this.H * 4 * (fmt === 'f16' ? 2 : 4);
    this.cost = { uploads: 0, ms: 0, bytes: 0 };
  }
  toHalf(from, to) { const u = this.u32, h = this.half; for (let i = from; i < to; i++) { const x = u[i], e = x >>> 23; h[i] = BASE[e] + ((x & 0x007fffff) >>> SHIFT[e]); } }
  /** Upload everything (first frame, still frames). */
  full() { if (this.fmt === 'f16') this.toHalf(0, this.data.length); this.tex.needsUpdate = true; }
  /** Upload one slot: a 44 × 40 strip through texSubImage2D, bound through three's state cache. */
  slot(s) {
    const t0 = performance.now();
    const r = this.renderer, gl = r.getContext(), props = r.properties.get(this.tex);
    const y = s * N_PUPPETS, off = y * this.W * 4, n = N_PUPPETS * this.W * 4;
    if (!props.__webglTexture || this.tex.needsUpdate) { if (this.fmt === 'f16') this.toHalf(off, off + n); this.tex.needsUpdate = true; return; }
    r.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (this.fmt === 'f16') { this.toHalf(off, off + n); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, this.W, N_PUPPETS, gl.RGBA, gl.HALF_FLOAT, this.half, off); }
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, this.W, N_PUPPETS, gl.RGBA, gl.FLOAT, this.data, off);
    this.cost.uploads++; this.cost.ms += performance.now() - t0; this.cost.bytes += n * (this.fmt === 'f16' ? 2 : 4);
  }
}
