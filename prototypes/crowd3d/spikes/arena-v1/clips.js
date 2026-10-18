// Arena spike v1: the Rocketbox capture library (anim/clips.bin v2, MIT), read with the spike's own sampler so the
// spike never depends on anim.js while the motion agent edits it. Same format: per frame, NB bones as int16 x, y, z
// (w rebuilt, w >= 0) in 1/32767 units, then the Bip01 translation as int16 millimetres.
export const CL = { ok: false, bones: [], NB: 0, clips: {} };

export async function loadClips(base) {
  const get = (f, how) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r[how](); });
  const [meta, bin] = await Promise.all([get('clips.json', 'json'), get('clips.bin', 'arrayBuffer')]);
  if (meta.version !== 2) throw new Error('clips.json version ' + meta.version);
  CL.bones = meta.bones; CL.NB = meta.bones.length;
  for (const [name, c] of Object.entries(meta.clips)) {
    c.name = name;
    c.Q = new Int16Array(bin, c.q, c.n * CL.NB * 3);
    c.R = new Int16Array(bin, c.r, c.n * 3);
    CL.clips[name] = c;
  }
  CL.ok = true;
  return CL;
}

export const newPose = () => new Float32Array(CL.NB * 4 + 3);
const S = 1 / 32767;

/** Raw pose at clip time u (clamped). */
export function sampleRaw(c, u, out) {
  const NB = CL.NB;
  const f = Math.min(Math.max(u, 0) * c.fps, c.n - 1.0001);
  const i = Math.floor(f), k = f - i, j = i + 1;
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

/** Looping sample with a crossfade over the seam (as anim.js sample); one-shots clamp. */
export function sample(c, t, out, tmp, x = 0.8) {
  if (!c.loop) return sampleRaw(c, t, out);
  x = Math.min(x, c.dur * 0.3);
  const P = c.dur - x;
  let s = t % P; if (s < 0) s += P;
  const u = s + x;
  if (u < c.dur - x || x <= 0) return sampleRaw(c, u, out);
  const w = (u - (c.dur - x)) / x;
  sampleRaw(c, u, out);
  sampleRaw(c, u - P, tmp);
  return mix(out, tmp, w * w * (3 - 2 * w), out);
}

/** out = nlerp(a, b, w) per bone, root translation lerped by w. */
export function mix(a, b, w, out) {
  const NB = CL.NB;
  for (let n = 0; n < NB * 4; n += 4) {
    let x1 = b[n], y1 = b[n + 1], z1 = b[n + 2], w1 = b[n + 3];
    if (a[n] * x1 + a[n + 1] * y1 + a[n + 2] * z1 + a[n + 3] * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    const x = a[n] + (x1 - a[n]) * w, y = a[n + 1] + (y1 - a[n + 1]) * w, z = a[n + 2] + (z1 - a[n + 2]) * w, ww = a[n + 3] + (w1 - a[n + 3]) * w;
    const l = 1 / (Math.sqrt(x * x + y * y + z * z + ww * ww) || 1);
    out[n] = x * l; out[n + 1] = y * l; out[n + 2] = z * l; out[n + 3] = ww * l;
  }
  const o = NB * 4;
  for (let m = 0; m < 3; m++) out[o + m] = a[o + m] + (b[o + m] - a[o + m]) * w;
  return out;
}
