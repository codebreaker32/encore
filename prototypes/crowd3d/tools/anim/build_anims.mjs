// Rocketbox animations (MIT) -> one small binary for the live crowd: anim/clips.bin + anim/clips.json.
//
//   node tools/anim/build_anims.mjs <glb dir> <out dir>      (run on the build box after tools/anim/fetch.sh)
//
// The clips are made for the Rocketbox Bip01 (3ds Max Biped) rig, the same skeleton as every avatar in people/, and
// FBX2glTF writes them in the same bone frames as the avatar GLBs, so a clip's local rotations drop straight onto an
// avatar's bones: no retargeting. Per clip, 23 bones (root to toes, no fingers) are resampled at the clip's rate from
// clips.txt and stored as int16 quaternions (x, y, z · 32767, with w >= 0 rebuilt by the page), plus the Bip01
// translation in millimetres.
// Root motion:
//   walks (xy):  the forward progress is taken out (an in-place cycle) and stored as `speed` (m/s) and `stride` (m per
//                cycle), so the page can play the cycle at the rate the path moves: the planted foot stays put.
//   sit/stand (xyz): the translation is kept, re-based so the seated end (sit down) or seated start (stand up) is at
//                x = z = 0: the page puts that point on the seat.
//   static:      kept as is (breathing, weight shifts).
import fs from 'node:fs';
import path from 'node:path';
import { readGlb } from './glb.mjs';

const [glbDir, outDir] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const list = fs.readFileSync(path.join(here, 'clips.txt'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/));
const BONES = ['Bip01', 'Bip01 Pelvis', 'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 Neck', 'Bip01 Head',
  'Bip01 L Clavicle', 'Bip01 L UpperArm', 'Bip01 L Forearm', 'Bip01 L Hand', 'Bip01 R Clavicle', 'Bip01 R UpperArm', 'Bip01 R Forearm', 'Bip01 R Hand',
  'Bip01 L Thigh', 'Bip01 L Calf', 'Bip01 L Foot', 'Bip01 L Toe0', 'Bip01 R Thigh', 'Bip01 R Calf', 'Bip01 R Foot', 'Bip01 R Toe0'];
const NB = BONES.length;

function sampler(times, vals, n) { // linear resampling; quaternions (n = 4) take the short way round and are renormalised
  return (t, out) => {
    let i = 0;
    if (t <= times[0]) i = 0; else if (t >= times[times.length - 1]) i = times.length - 2; else { let lo = 0, hi = times.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; } i = lo; }
    if (times.length < 2) { for (let c = 0; c < n; c++) out[c] = vals[c]; return out; }
    const t0 = times[i], t1 = times[i + 1], k = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-6, t1 - t0)));
    let s = 1;
    if (n === 4) { let d = 0; for (let c = 0; c < 4; c++) d += vals[i * 4 + c] * vals[(i + 1) * 4 + c]; if (d < 0) s = -1; }
    for (let c = 0; c < n; c++) out[c] = vals[i * n + c] * (1 - k) + s * vals[(i + 1) * n + c] * k;
    if (n === 4) { const l = Math.hypot(...out.slice(0, 4)) || 1; for (let c = 0; c < 4; c++) out[c] /= l; }
    return out;
  };
}

const chunks = [], index = {};
let offset = 0;
for (const [folder, name, fpsS, maxS] of list) {
  const file = path.join(glbDir, name + '.glb');
  if (!fs.existsSync(file)) { console.log('missing', name); continue; }
  const { json, acc } = readGlb(file);
  const nodes = json.nodes, anim = json.animations[0];
  const byName = new Map(nodes.map((n, i) => [n.name, i]));
  const tracks = {};
  let dur = 0;
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler], t = acc(s.input), v = acc(s.output);
    (tracks[ch.target.node] ||= {})[ch.target.path] = sampler(t.data, v.data, v.n);
    dur = Math.max(dur, t.data[t.count - 1]);
  }
  const fps = +fpsS, max = +maxS;
  const len = max > 0 ? Math.min(dur, max) : dur;
  const n = Math.max(2, Math.round(len * fps) + 1);
  const Qb = new Int16Array(n * NB * 3), R = new Float32Array(n * 3), Qf = new Float32Array(n * NB * 4);
  const q = [0, 0, 0, 0], p = [0, 0, 0];
  for (let f = 0; f < n; f++) {
    const t = Math.min(len, f / fps);
    BONES.forEach((bn, b) => {
      const ni = byName.get(bn), tr = tracks[ni];
      const r = tr && tr.rotation ? tr.rotation(t, q) : (nodes[ni]?.rotation || [0, 0, 0, 1]);
      const sg = r[3] < 0 ? -1 : 1;
      for (let c = 0; c < 4; c++) Qf[(f * NB + b) * 4 + c] = r[c] * sg;
      for (let c = 0; c < 3; c++) Qb[(f * NB + b) * 3 + c] = Math.round(Math.max(-1, Math.min(1, r[c] * sg)) * 32767);
    });
    const ri = byName.get('Bip01'), rt = tracks[ri] && tracks[ri].translation ? tracks[ri].translation(t, p) : nodes[ri].translation;
    R.set(rt, f * 3);
  }
  const hipY = nodes[byName.get('Bip01')].translation[1];
  const meta = { kind: folder, fps, n, dur: (n - 1) / fps, hipY: +hipY.toFixed(4), gender: name[0] };
  const at = (f) => [R[f * 3], R[f * 3 + 1], R[f * 3 + 2]];
  if (folder === 'xy') {
    const a = at(0), b = at(n - 1);
    meta.speed = +((b[2] - a[2]) / meta.dur).toFixed(4);
    meta.stride = +(b[2] - a[2]).toFixed(4);
    for (let f = 0; f < n; f++) { R[f * 3 + 2] -= a[2] + (b[2] - a[2]) * (f / (n - 1)); R[f * 3] -= a[0] + (b[0] - a[0]) * (f / (n - 1)); }
    meta.loop = true;
  } else if (folder === 'xyz') {
    const seated = name.includes('sit_down') ? at(n - 1) : at(0), other = name.includes('sit_down') ? at(0) : at(n - 1);
    for (let f = 0; f < n; f++) { R[f * 3] -= seated[0]; R[f * 3 + 2] -= seated[2]; }
    meta.standZ = +(other[2] - seated[2]).toFixed(4); // where the standing end is, in front of the seat (+Z)
    meta.seatY = +seated[1].toFixed(4);
  } else meta.loop = true;
  // how well the last frame matches the first (a loop seam): the mean quaternion distance in degrees
  let err = 0;
  for (let b = 0; b < NB; b++) { let d = 0; for (let c = 0; c < 4; c++) d += Qf[b * 4 + c] * Qf[((n - 1) * NB + b) * 4 + c]; err += 2 * Math.acos(Math.min(1, Math.abs(d))) * 57.3; }
  meta.seamDeg = +(err / NB).toFixed(2);
  const Rm = new Int16Array(n * 3);
  for (let i = 0; i < R.length; i++) Rm[i] = Math.round(R[i] * 1000);
  meta.q = offset; chunks.push(Buffer.from(Qb.buffer)); offset += Qb.byteLength;
  meta.r = offset; chunks.push(Buffer.from(Rm.buffer)); offset += Rm.byteLength;
  index[name] = meta;
  console.log(name, JSON.stringify(meta));
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'clips.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(outDir, 'clips.json'), JSON.stringify({ version: 2, bones: BONES.map((b) => b.replace(/ /g, '_')), clips: index }));
console.log('total', (offset / 1024).toFixed(0), 'KB,', Object.keys(index).length, 'clips');
