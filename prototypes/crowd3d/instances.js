// Shader-animated instanced people (everyone behind the front row on the TV preset, the far rows everywhere).
//
// At load, each avatar type is posed by the same rig and IK the front rows use, and its skinned vertices are read
// back with the arms and body in other poses (hands apart and together in front of the chest, an arm or both arms up,
// arms folded, standing up). Those become per-vertex offsets, like morph targets. Each frame the behaviour system
// writes a few floats per person (laugh body, clap amount, arm up, lean, head yaw/pitch, their own clap rate), and the
// vertex shader computes the pose: clap oscillation at that person's rate, arm raise, folded arms that open when the
// room is won over, laugh lean with a bounce on each "ha", breathing, sway (on the beat in the arena) and head turns
// about the neck, with skin weights deciding how much of each vertex follows. Two more vec4s per person place them
// (position, yaw, mirror, build, side lean) and say how far they have stood up, so people can arrive, stand, walk and
// leave. One draw call per avatar type and level. No frames are prerecorded: every frame comes from the live state.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Rig, Person, noise } from './people.js';
import { joints, fixArms, armCollisions, refreshFit, limbs, guardElbows } from './anatomy.js';
import { ANIM, newPose, sample, sampleCycle, applyPose, bonesOf, family, meanPose } from './anim.js';

// Captured moves baked per avatar type (anim.js clips): a walk cycle, sitting down, and three idle gestures, as
// per-vertex offsets in one RGBA16F texture (fetched by gl_VertexID; WebGL 2 only). Frames, in order:
// Low-detail people get no arm-up or hand-near-face poses (their arms are a few flat polygons): only the phone, held
// at chest height, as an idle gesture.
const MOVES = { walk: 8, sit: 6, idle: 1, laugh: 3 }; // laugh: a chuckle, a laugh, a big laugh (torso and head only)
const MOVE_W = 1024, STAND_OFF = 0.44; // as traffic.js
const WEBGL2 = typeof WebGL2RenderingContext !== 'undefined';
// what the anatomy check found left in each baked pose, after its fixes (window.__bakeAnatomy, tools/render/anatomy.mjs)
export const BAKE_REPORT = [];
if (typeof window !== 'undefined') window.__bakeAnatomy = () => BAKE_REPORT;
// &moves=off|nogest|nowalk: switch the captured moves off, or one part of them (for A/B checks)
const MOVES_Q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('moves') || '' : '';
// (life-v1: seated low-detail people sit a little forward, so the hands reach the thighs with the elbows bent; upright,
// a short arm reached them straight, diagonally out past the seat in front: &bake=old for the old pose)
const BAKE_OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bake') === 'old';
const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

const UPPER = /Spine|Neck|Head|Clavicle|UpperArm|Forearm|Hand|Finger|^Bip01_[LRM][A-Z]/;
const HEAD = /^Bip01_(Neck|Head|[LRM][A-Z])/;
const HAND = /Hand|Finger/;

/**
 * Pose one avatar type and bake rest + five targets + skin-derived weights.
 * opts: seatH, stand (a standing person: rest pose standing), standHands ('down'|'drink'|'rail'), bothArms (stadium).
 */
export function bakeType(gltfScene, { seatH = 0.45, stand = false, standHands = 'down', bothArms = false } = {}) {
  if (standHands === 'rail') standHands = 'down'; // (arms out to the rail read as zombie arms from the stage: at the sides)
  const seat = new THREE.Object3D();
  const model = SkeletonUtils.clone(gltfScene);
  seat.add(model);
  seat.updateMatrixWorld(true);
  const rig = new Rig(seat, model);
  const p = new Person(rig, null, { seed: 11, row: 3, x: 0, table: false, seatH, idle: 'still', stand, standHands, noParty: true });
  Object.assign(p, { handsOn: 'lap', feet: 0.12, footFwd: 0.4, slouch: stand || BAKE_OLD ? 0 : 0.2, headTilt: 0, cheerer: 0.9, style: 'giggle', gaze: { x: 0, y: 0 }, glance: 0 });
  const room = { events: [], murmur: 0, murmurId: 0, performer: new THREE.Vector3(0, seatH + 0.75, 60) };
  let sk = null;
  model.traverse((o) => { if (o.isSkinnedMesh) sk = o; });
  const n = sk.geometry.attributes.position.count;
  const v = new THREE.Vector3();
  // every baked pose passes the anatomy check: joint limits and the arms out of the body (as for the front people), and
  // whatever is left is reported
  const typeName = (() => { let nm = ''; gltfScene.traverse((o) => { if (!nm && /_Adult_/.test(o.name)) nm = o.name; }); return nm; })();
  const audit = (label, seated) => {
    rig.seatChanged(); model.updateMatrixWorld(true);
    if (rig.fit && rig.fit.ok) { refreshFit(rig.fit); joints(p, true); fixArms(p, seated); joints(p, true); guardElbows(p, false); model.updateMatrixWorld(true); }
    const left = [];
    if (rig.fit && rig.fit.ok) { refreshFit(rig.fit); joints(p, false, left); armCollisions(p, left, { seated }); limbs(p, left, { seated, standing: !seated && (stand || !!(p.loco && p.loco.stand >= 1 && !p.loco.walk)), resting: !!p._resting, rest: p._restKind || '', cheer: (p._cheerW || 0) > 0.05, bounce: (p._cheerW || 0) > 0.3 }); }
    if (left.length) BAKE_REPORT.push({ type: typeName, stand, pose: label, left: left.map((x) => x.joint || x.what).join(', ') });
  };
  const bake = (force, loco = null) => {
    p.force = { still: true, lb: 0, ls: 0, ha: 0.5, ...force };
    p.loco = loco;
    p.update(0, room);
    audit(JSON.stringify(force) + (loco ? ' standing' : ''), !stand && !loco);
    model.updateMatrixWorld(true);
    const out = new Float32Array(n * 3);
    const P = sk.geometry.attributes.position;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i);
      sk.applyBoneTransform(i, v).applyMatrix4(sk.matrixWorld); // skinned, then out of the glTF node's Z-up frame
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    return out;
  };
  const readSkin = () => {
    model.updateMatrixWorld(true);
    const out = new Float32Array(n * 3), P = sk.geometry.attributes.position;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i); sk.applyBoneTransform(i, v).applyMatrix4(sk.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    return out;
  };
  // (the clap a little higher and further out than the front people's: the shader blends open and shut linearly, and
  // the in-between frames of a low clap lay the forearms across the belly)
  const clapA = bake({ lc: 1, open: 1, clapUp: 0.07 }), clapB = bake({ lc: 1, open: 0, clapUp: 0.07 });
  // ("folded" for these people is the hands-on-knees rest pose: folded arms on a low-detail body read as a forearm
  // through the belly)
  const cheer = bake(bothArms ? { both: 1 } : { lu: 1 }), folded = stand ? bake({ idle: 'folded' }) : bake({ rest: 'knees' });
  // the stand target: for seated types, standing up (arms down); for standing types, arms down from whatever they hold
  let up;
  if (stand) { const keep = p.o.standHands; p.o.standHands = 'down'; up = bake({}); p.o.standHands = keep; } else up = bake({}, { stand: 1 });
  const phoneP = bake({ idle: 'phone' });
  const rest = stand ? bake({}) : bake({ rest: 'thighs' }); // (seated: each hand on its own thigh, not hanging in the air)
  const pos = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  const hip = pos(rig.b.lThigh).add(pos(rig.b.rThigh)).multiplyScalar(0.5);
  const neck = pos(rig.b.neck);
  // ---- captured moves (seated types only: standing ones never walk) ----
  let moves = null;
  if (ANIM.ok && WEBGL2 && !stand && MOVES_Q !== 'off') {
    let female = false;
    gltfScene.traverse((o) => { if (/^Female/.test(o.name)) female = true; });
    const g = female ? 'f' : 'm', clip = (pre) => ANIM.clips[family(pre, g)[0]];
    const walkC = clip('walk_neutral_01') || clip('walk'), sitC = clip('sit_down_chair');
    if (walkC && sitC) {
      const pose = newPose(), frames = [];
      let frameNo = 0;
      const at = (fn, seated = true) => { fn(); audit('frame ' + frameNo++, seated); return readSkin(); };
      const atRaw = (fn) => { fn(); frameNo++; return readSkin(); };
      // the seated rest pose, to add the laugh captures to
      const ab = bonesOf(rig), restQ = ab.map((b) => (b ? b.quaternion.clone() : null)), restRoot = ab[0].position.clone(), restModel = model.position.clone();
      // (the rest pose's upper arms in the world, for the laughs below; the walk and the sit frames are posed after the
      // rest bake, so they are read from it again: the rest geometry's own arms)
      const armRestW = [];
      model.updateMatrixWorld(true);
      for (const u of [rig.b.lUpper, rig.b.rUpper]) if (u) { const q = new THREE.Quaternion(); u.getWorldQuaternion(q); armRestW.push([u, q]); }
      for (let f = 0; f < MOVES.walk; f++) frames.push(at(() => { applyPose(rig, sampleCycle(walkC, f / MOVES.walk, pose)); model.position.set(0, 0, 0); }, false));
      let neckW = null, hipW = null;
      { applyPose(rig, sampleCycle(walkC, 0, pose)); model.position.set(0, 0, 0); model.updateMatrixWorld(true); neckW = pos(rig.b.neck); hipW = pos(rig.b.lThigh).add(pos(rig.b.rThigh)).multiplyScalar(0.5); }
      // where the capture's seated hips land against the baked rest pose's: shift the capture onto them
      applyPose(rig, sample(sitC, sitC.dur, pose)); model.position.set(0, 0, 0); model.updateMatrixWorld(true);
      const off = hip.clone().sub(pos(rig.b.lThigh).add(pos(rig.b.rThigh)).multiplyScalar(0.5));
      // (the last sit-down frame is drawn as the seated rest pose itself, re-based below: it is the rest that is checked)
      for (let f = 0; f < MOVES.sit; f++) frames.push((f === MOVES.sit - 1 ? atRaw : at)(() => {
        sample(sitC, (f / (MOVES.sit - 1)) * sitC.dur, pose);
        pose[ANIM.NB * 4 + 2] *= STAND_OFF / Math.max(0.2, sitC.standZ || STAND_OFF);
        applyPose(rig, pose); model.position.copy(off).multiplyScalar(smooth01(f / (MOVES.sit - 1)));
      }, f >= MOVES.sit - 2));
      // the one idle gesture low-detail people get: the phone at chest height (the procedural pose)
      frames.push(phoneP);
      // three laughs (Rocketbox's chuckle, laugh and big laugh, this gender's): each capture's torso, neck, head and
      // shoulders at the moment it moves furthest from its own average, added to the seated rest pose. The arms ride
      // along (no arm-up or hand-at-face poses for low-detail people).
      // (the big laugh doubles the capture's actor over, the head down into the chest: on a low-detail body seen from
      // the stage that reads as a person without a head, so its neck and head take half the capture's bend, the spine
      // most of it)
      const TORSO = /Spine|Neck|Head|Clavicle/, HEAD = /Neck|Head/, qd = new THREE.Quaternion(), qm = new THREE.Quaternion(), qI = new THREE.Quaternion();
      const DAMP = { gestic_laugh_extreme: { head: 0.5, spine: 0.85 } };
      for (const pre of ['gestic_laugh_low', 'gestic_laugh_loud', 'gestic_laugh_extreme']) {
        const c = clip(pre);
        if (!c) { frames.push(rest); continue; }
        const mean = meanPose(c);
        let bestT = 0, bestD = -1;
        for (let k = 0; k <= 40; k++) {
          sample(c, (k / 40) * c.dur, pose);
          let d = 0;
          ab.forEach((b, i) => { if (!b || !TORSO.test(b.name)) return; const n4 = i * 4; d += 1 - Math.abs(pose[n4] * mean[n4] + pose[n4 + 1] * mean[n4 + 1] + pose[n4 + 2] * mean[n4 + 2] + pose[n4 + 3] * mean[n4 + 3]); });
          if (d > bestD) { bestD = d; bestT = (k / 40) * c.dur; }
        }
        sample(c, bestT, pose);
        frames.push(at(() => {
          ab.forEach((b, i) => {
            if (!b) return;
            b.quaternion.copy(restQ[i]);
            if (!TORSO.test(b.name)) return;
            const n4 = i * 4;
            qd.set(pose[n4], pose[n4 + 1], pose[n4 + 2], pose[n4 + 3]).multiply(qm.set(mean[n4], mean[n4 + 1], mean[n4 + 2], mean[n4 + 3]).invert());
            const D = DAMP[pre];
            if (D) qd.slerp(qI, 1 - (HEAD.test(b.name) ? D.head : /Spine/.test(b.name) ? D.spine : 1));
            b.quaternion.premultiply(qd);
          });
          // (the thighs hang from Spine in these rigs: the laugh's spine turn is taken back out of them, so the knees stay
          // where the seated rest has them; the limbs rules)
          { const si = ab.findIndex((x) => x && x.name === 'Bip01_Spine');
            if (si >= 0) { const D = new THREE.Quaternion().copy(ab[si].quaternion).invert().multiply(restQ[si]); for (const x of ab) if (x && /_Thigh$/.test(x.name)) x.quaternion.premultiply(D); } }
          ab[0].position.copy(restRoot); model.position.copy(restModel);
          // (life-v1: the arms keep the rest pose's own direction instead of swinging out with the laugh's twist of the
          // chest: the shoulders carry them, a hand moves a few cm; swung, a low-detail arm stuck out across the
          // neighbour's lap: &bake=old)
          if (!BAKE_OLD) {
            model.updateMatrixWorld(true);
            for (const [u, q] of armRestW) { const pq = new THREE.Quaternion(); u.parent.getWorldQuaternion(pq); u.quaternion.copy(pq.invert().multiply(q)); }
          }
        }));
      }
      // offsets from the seated rest; the seated end of the sit-down is re-based on the rest pose exactly
      const N = frames.length, rows = Math.ceil((n * N) / MOVE_W), data = new Uint16Array(MOVE_W * rows * 4);
      frames.forEach((F, k) => {
        const last = k === MOVES.walk + MOVES.sit - 1;
        for (let i = 0; i < n; i++) { const o = (k * n + i) * 4; for (let c = 0; c < 3; c++) data[o + c] = THREE.DataUtils.toHalfFloat(last ? 0 : F[i * 3 + c] - rest[i * 3 + c]); }
      });
      const tex = new THREE.DataTexture(data, MOVE_W, rows, THREE.RGBAFormat, THREE.HalfFloatType);
      tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
      moves = { tex, n, neckW, hipW, stride: walkC.stride, bytes: data.byteLength };
    }
  }
  // per vertex: upper-body weight, head weight, baked occlusion, clothing mask
  const si = sk.geometry.attributes.skinIndex, sw = sk.geometry.attributes.skinWeight, uv = sk.geometry.attributes.uv;
  const names = sk.skeleton.bones.map((b) => b.name);
  const w = new Float32Array(n * 4);
  const top = stand ? 1.75 : seatH + 0.45;
  for (let i = 0; i < n; i++) {
    let upw = 0, hd = 0, hand = 0;
    const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], wts = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    for (let k = 0; k < 4; k++) {
      const nm = names[idx[k]], wt = wts[k];
      if (UPPER.test(nm)) upw += wt;
      if (HEAD.test(nm)) hd += wt;
      if (HAND.test(nm)) hand += wt;
    }
    const ao = 0.38 + 0.62 * THREE.MathUtils.smoothstep(rest[i * 3 + 1], 0.12, top); // lower legs sit in the row's shadow
    const u = uv ? uv.getX(i) * 4 : 0, t = uv ? uv.getY(i) * 4 : 0;
    const cloth = uv && u - Math.floor(u) < 0.5 && t - Math.floor(t) < 0.5 && hand < 0.5 ? 1 : 0; // the body quadrant, not the hands
    w.set([upw, hd, ao, cloth], i * 4);
  }
  const d = (a) => { const o = new Float32Array(n * 3); if (a) for (let i = 0; i < o.length; i++) o[i] = a[i] - rest[i]; return o; };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(rest, 3));
  if (uv) g.setAttribute('uv', uv);
  g.setAttribute('dA', new THREE.BufferAttribute(d(clapA), 3));
  g.setAttribute('dB', new THREE.BufferAttribute(d(clapB), 3));
  g.setAttribute('dC', new THREE.BufferAttribute(d(cheer), 3));
  g.setAttribute('dD', new THREE.BufferAttribute(d(folded), 3));
  g.setAttribute('dS', new THREE.BufferAttribute(d(up), 3));
  g.setAttribute('aW', new THREE.BufferAttribute(w, 4));
  g.setIndex(sk.geometry.index);
  g.computeVertexNormals();
  return { geo: g, hip, neck, standing: stand, moves };
}

const VERT_HEAD = /* glsl */ `
attribute vec3 dA; attribute vec3 dB; attribute vec3 dC; attribute vec3 dD; attribute vec3 dS; attribute vec4 aW;
attribute vec4 aState; attribute vec4 aPose; attribute vec4 aVar; attribute vec4 aXform; attribute vec4 aShape;
uniform float uTime; uniform vec3 uHip; uniform vec3 uNeck; uniform float uBeat;
varying vec4 vCrowd; varying vec4 vTint;
#ifdef CROWD_MOVES
// captured moves (instances.js MOVES): frames 0-7 a walk cycle, 8-13 sitting down (standing … seated), 14 the phone,
// 15-17 three laughs. aShape.w: 0…1 the old stand amount, 2…3 walking (the cycle's phase), 4…5 sitting (0 standing … 1 seated).
// aState.y < 0: an idle gesture instead of a clap, -(2·kind + weight).
uniform highp sampler2D uMoves; uniform int uMoveN; uniform vec3 uNeckW; uniform vec3 uHipW;
vec3 moveD( int f ) { int L = f * uMoveN + gl_VertexID; return texelFetch( uMoves, ivec2( L % 1024, L / 1024 ), 0 ).xyz; }
#endif
mat3 crX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 crY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 crZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }
void crowdPose(inout vec3 p, inout vec3 n){
  float body = aState.x, clap = max(aState.y, 0.0), cheer = aState.z, lean = aState.w;
#ifdef CROWD_MOVES
  float laughZ = cheer; cheer = 0.0; // here aState.z is the laugh: variant (0–2) + size (the fraction)
#endif
  float ph = aPose.z, rate = aPose.w, sw = aShape.w, stand = clamp(sw, 0.0, 1.0), up = stand;
  float hz = 3.8 + 1.8 * fract(ph * 0.371);                   // this person's laugh rhythm
  float ha = 0.5 + 0.5 * sin(uTime * hz * 6.2832 + ph * 1.3);
  // laughter comes in bouts: a few "ha"s, a gasp, again (each person their own bout rhythm)
  float boutEnv = smoothstep(-0.35, 0.35, sin(uTime * (0.9 + 0.5 * fract(ph * 0.53)) * 6.2832 + ph * 2.1));
  ha = 0.3 + (ha - 0.3) * (0.35 + 0.65 * boutEnv);
  float clapOsc = 0.5 + 0.5 * sin(uTime * rate * 6.2832 + ph); // their own clap rate and phase
  vec3 mv = dS * stand;
  vec3 neckP = uNeck, hipP = uHip;
#ifdef CROWD_MOVES
  if (sw > 1.5) {
    if (sw < 3.5) { float f = fract(sw) * 8.0; int f0 = int(floor(f)); mv = mix(moveD(f0), moveD((f0 + 1) - 8 * ((f0 + 1) / 8)), f - float(f0)); up = 1.0; }
    else { float k = clamp(sw - 4.0, 0.0, 1.0) * 5.0; int f0 = min(int(floor(k)), 4); mv = mix(moveD(8 + f0), moveD(9 + f0), k - float(f0)); up = 1.0 - clamp(sw - 4.0, 0.0, 1.0); }
    stand = 1.0;
  }
  if (aState.y < 0.0) mv += moveD(14) * clamp(-aState.y, 0.0, 1.0) * aW.x; // the phone (upper body only)
  if (laughZ > 0.0 && body > 0.0) { int lv = min(int(floor(laughZ)), 2); mv += moveD(15 + lv) * body * (0.35 + 0.65 * fract(laughZ)) * (0.75 + 0.25 * ha) * aW.x; }
  neckP = mix(uNeck, uNeckW, up); hipP = mix(uHip, uHipW, up); // walkers and standers turn about their own neck
#endif
  float fold = step(aVar.y, 0.0) * clamp(1.0 - body * 1.6 - clap - cheer - stand * 3.0, 0.0, 1.0);
  clap *= 1.0 - stand; cheer *= 1.0 - stand; // walking: arms down
  p += mv + mix(dB, dA, clapOsc) * clap + dC * cheer + dD * fold;
  float wh = aW.y, wu = aW.x;
  float roll = 0.14 * sin(ph * 7.1) + 0.03 * sin(uTime * 0.4 + ph);
  float bob = body * 0.15 * (ha - 0.5); // the head bobs with each "ha"
  mat3 Rh = crY(aPose.x * wh) * crX((aPose.y + bob) * wh) * crZ(roll * wh);
  p = neckP + Rh * (p - neckP); n = Rh * n;
  float l = lean + body * (ha - 0.5) * 0.08;
  float sway = 0.03 * sin(uTime * 0.23 + ph * 5.0) + 0.02 * sin(uTime * 0.61 + ph * 2.0) + 0.05 * step(0.001, uBeat) * sin(uTime * uBeat * 6.2832 + ph * 0.25);
  mat3 Ru = crY(sway * wu * 0.6) * crZ(sway * wu * 0.5 * step(0.001, uBeat)) * crX(l * wu);
  p = hipP + Ru * (p - hipP); n = Ru * n;
  float shoulders = clamp((p.y - hipP.y) / 0.45, 0.0, 1.0); // the shake grows towards the shoulders
  p.y += wu * (0.005 * sin(uTime * 1.45 + ph) + body * (0.008 + 0.02 * shoulders) * ha);
  // place the person: mirror and build, a side lean about the hips, their yaw, their spot. Mirroring flips the
  // winding, so a mirrored person's outside is back-facing and DoubleSide negates its normal in
  // normal_fragment_begin: pre-flip y and z, and after that negation the normal is the mirror image of n (-x).
  p *= vec3(aShape.x, aShape.y, abs(aShape.x)); n *= vec3(1.0, sign(aShape.x), sign(aShape.x));
  mat3 Rt = crZ(aShape.z);
  p = hipP + Rt * (p - hipP); n = Rt * n;
  mat3 Ry = crY(aXform.w);
  p = Ry * p + aXform.xyz; n = Ry * n;
  vCrowd = aW; vTint = vec4(aVar.x, abs(aVar.y), aVar.z, aVar.w);
}
`;
const FRAG_HEAD = /* glsl */ `
varying vec4 vCrowd; varying vec4 vTint;
`;
// clothing tone: hue rotation and saturation in YIQ, then value; skin, faces and hair keep their colour
const FRAG_TINT = /* glsl */ `
{
  vec3 c = diffuseColor.rgb;
  float Y = dot(c, vec3(0.299, 0.587, 0.114));
  vec2 iq = vec2(dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
  float cs = cos(vTint.x), sn = sin(vTint.x);
  iq = vec2(iq.x * cs - iq.y * sn, iq.x * sn + iq.y * cs) * vTint.y;
  vec3 t = vec3(Y + 0.956 * iq.x + 0.621 * iq.y, Y - 0.272 * iq.x - 0.647 * iq.y, Y - 1.106 * iq.x + 1.703 * iq.y);
  #ifdef CLOTH_FIX
  // clothes compressed towards dark, muted tones: a white shirt or a saturated jacket on a few big triangles read as
  // white bibs and kite-shaped torsos in the far rows
  t = max(t, 0.0); float Lt = dot(t, vec3(0.299, 0.587, 0.114));
  t = mix(vec3(Lt), t, 0.7) * min(1.0, 0.36 / max(Lt, 1e-3));
  #endif
  diffuseColor.rgb = mix(c, max(t, 0.0), vCrowd.w) * mix(1.0, vTint.z, vCrowd.w) * vTint.w * vCrowd.z;
}
`;

/**
 * A Lambert material whose vertex stage runs crowdPose; programs are shared between avatar types. `shared.light`
 * (optional) adds the page's people-only rim and fill terms: { uniforms, pars, chunk }, with the rim fading by the
 * square root of the row depth, so the back rows stay rimmed silhouettes without becoming a wall of outlines.
 */
export function crowdMaterial(params, shared, hip, neck) {
  const m = new THREE.MeshLambertMaterial({ ...params });
  if (shared.clothFix) m.defines = { CLOTH_FIX: 1 };
  m.userData.uniforms = { uTime: shared.uTime, uBeat: shared.uBeat, uHip: { value: hip.clone() }, uNeck: { value: neck.clone() } };
  const L = shared.light;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms, L ? L.uniforms : {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 crowdP = position;\ncrowdPose(crowdP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = crowdP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD + (L ? `\n${L.pars}\n${shared.keyDepth ? '#define KEY_DEPTH\n' : ''}#define RIM_SCALE ${shared.rimFlat ? (params.rimSoft ? '0.4' : '1.5') : '( 2.5 * sqrt( vTint.w ) )'}\n#define FILL_SCALE ( vTint.w * vTint.w )` : ''))
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_TINT)
      // the alpha mask is one channel: .r reads it whether it was uploaded as RGBA (grey) or as RedFormat (tv)
      .replace('#include <alphamap_fragment>', '#ifdef USE_ALPHAMAP\n  diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).r;\n#endif');
    if (L) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', L.hemi).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + L.chunk);
  };
  m.customProgramCacheKey = () => 'crowd-instances-v6-' + (params.map ? 'map' : 'plain') + (params.alphaMap ? '-alpha' : '') + (L ? '-people' : '') + (shared.rimFlat ? '-rimflat' : '') + (params.rimSoft ? '-rimsoft' : '') + (shared.keyDepth ? '-keydepth' : '');
  return m;
}

/**
 * The tv crowd lit per vertex (&ab=vlit): the same crowdPose, but the key spot, the hemisphere and the people fill and
 * rim are evaluated in the vertex shader, so a fragment only samples the atlas, tints it and tone-maps it. The crowd
 * covers many pixels several layers deep, and on the TV's GPU its per-pixel Lambert was the most expensive thing in
 * the frame. `shared.vlit` holds the light uniforms (view space), updated by the page every frame; `params.alphaTest`
 * 0 drops the alpha mask and its discard.
 */
export function crowdMaterialVlit(params, shared, hip, neck) {
  const L = shared.light, VL = shared.vlit;
  const alpha = !!(params.alphaMap && params.alphaTest);
  const uniforms = {
    uTime: shared.uTime, uBeat: shared.uBeat, uHip: { value: hip.clone() }, uNeck: { value: neck.clone() }, uMaskOut: shared.uMaskOut || { value: 0 },
    map: { value: params.map }, alphaMap: { value: params.alphaMap || null }, diffuse: { value: new THREE.Color(1, 1, 1) },
    ...THREE.UniformsLib.fog, ...(L ? L.uniforms : {}), ...VL,
  };
  const m = new THREE.ShaderMaterial({
    uniforms, fog: true, side: params.side ?? THREE.DoubleSide,
    defines: { ...(alpha ? { CROWD_ALPHA: 1 } : {}), ...(shared.clothFix ? { CLOTH_FIX: 1 } : {}), ...(shared.rimFlat ? { RIM_FLAT: 1 } : {}), ...(shared.rimFlat && params.rimSoft ? { RIM_SOFT: 1 } : {}), ...(shared.keyDepth ? { KEY_DEPTH: 1 } : {}) },
    vertexShader: `#include <common>
#include <fog_pars_vertex>
${VERT_HEAD}
uniform vec3 uKeyPos, uKeyDir, uKeyColor, uSky, uGround, uUp; uniform float uKeyCos, uKeyPen;
${L ? L.pars : 'uniform vec3 uRimColor; uniform vec3 uRimDir; uniform vec3 uFillColor; uniform vec3 uFillDir;'}
varying vec2 vUv; varying vec3 vLit; varying vec3 vLitB; varying vec3 vNv; varying vec3 vPv; varying float vRimK; varying float vMir;
void main() {
  vec3 p = position, n = normal;
  crowdPose(p, n);
  if (aShape.x < 0.0) n = -n; // the mirror pre-flip expects the fragment stage's DoubleSide negation; do it here
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec3 N = normalize(normalMatrix * n), V = normalize(-mvPosition.xyz);
  vec3 Lk = uKeyPos - mvPosition.xyz; float d = length(Lk); Lk /= d;
  float spot = smoothstep(uKeyCos, uKeyPen, dot(Lk, -uKeyDir));
  #ifdef KEY_DEPTH
  spot *= aVar.w * aVar.w; // the stage look's arena: a far spot can't separate the rail from the rows behind it
  #endif
  vec3 irr = uKeyColor * (max(dot(N, Lk), 0.0) * spot / max(d * d, 0.01));
  float depth2 = aVar.w * aVar.w; // the row-depth falloff on the house light and the fill
  irr += mix(uGround, uSky, 0.5 + 0.5 * dot(N, uUp)) * depth2;
  irr += uFillColor * (0.5 + 0.5 * dot(N, uFillDir)) * depth2;
  vLit = irr * RECIPROCAL_PI;
  // the inside of a coarse level, seen through its gaps (a sleeve, a collar), lit as the inside (-N): lit with the
  // outside's normal it came out as light and dark shards; the fragment stage picks by facing (and the mirror)
  vec3 irrB = uKeyColor * (max(dot(-N, Lk), 0.0) * spot / max(d * d, 0.01));
  irrB += mix(uGround, uSky, 0.5 - 0.5 * dot(N, uUp)) * depth2;
  irrB += uFillColor * (0.5 - 0.5 * dot(N, uFillDir)) * depth2;
  vLitB = irrB * RECIPROCAL_PI;
  vMir = aShape.x;
  // the rim is evaluated per fragment: per vertex, on the coarse far levels, it flooded whole triangles (white kites)
  vNv = N; vPv = mvPosition.xyz;
  #if defined(RIM_SOFT)
  vRimK = 0.4; // the stage look's far levels: their coarse normals speckled a full rim
  #elif defined(RIM_FLAT)
  vRimK = 1.5; // the stage look: the rows behind read by their rims, so the rim doesn't fall with depth
  #else
  vRimK = 2.5 * sqrt(aVar.w);
  #endif
  vUv = uv;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `#include <common>
#include <fog_pars_fragment>
${FRAG_HEAD}
uniform sampler2D map; uniform sampler2D alphaMap; uniform vec3 diffuse; uniform float uMaskOut;
uniform vec3 uRimColor; uniform vec3 uRimDir;
varying vec2 vUv; varying vec3 vLit; varying vec3 vLitB; varying vec3 vNv; varying vec3 vPv; varying float vRimK; varying float vMir;
void main() {
  vec4 diffuseColor = vec4(diffuse, 1.0) * texture2D(map, vUv);
  #ifdef CROWD_ALPHA
  if (texture2D(alphaMap, vUv).r < 0.5) discard;
  #endif
${FRAG_TINT}
  vec3 Nf = normalize(vNv), lit = vLit;
  if (gl_FrontFacing == (vMir < 0.0)) { Nf = -Nf; lit = vLitB; } // (the inside: the mirror flips the winding)
  #ifdef RIM_FLAT
  // a back face seen through a coarse level's gaps faces away from the lens: with the plain clamp it took the full rim
  // (the theatre's white flecks); |N·V| gives it none
  float rimF = 1.0 - abs(dot(Nf, normalize(-vPv)));
  #else
  float rimF = 1.0 - clamp(dot(Nf, normalize(-vPv)), 0.0, 1.0);
  #endif
  #ifdef RIM_SOFT
  rimF *= rimF; // only the most grazing edge (rimF to the 6th)
  #endif
  vec3 rim = uRimColor * (rimF * rimF * rimF) * clamp(dot(Nf, uRimDir) + 0.35, 0.0, 1.0) * vRimK;
  gl_FragColor = vec4(diffuseColor.rgb * lit + (0.25 + diffuseColor.rgb) * rim, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  if (uMaskOut > 0.5) gl_FragColor = vec4(1.0); // (the box's crowd-coverage check: window.__crowdMask)
}`,
  });
  m.color = uniforms.diffuse.value; // the close-up dim sets .color, as on the Lambert path
  m.userData.uniforms = uniforms;
  return m;
}

/**
 * Seats → instances. types: [{ name, baked }], seats: [{ seat (Object3D), type, row, x, seed, src }].
 * opts.variety(seat) → { hue, sat, val, depth, fold, mirror, sx, sy, yaw, tilt, dx, dz }: static per-instance variation.
 * opts.traffic(src, now) → null (in the seat) or { hidden, x, y, z, yaw, stand }: arriving, standing, walking, gone.
 * The CPU part of the behaviour runs per person each frame and writes a handful of floats.
 */
export class InstancedCrowd {
  constructor(scene, types, seats, matParams, shared, opts = {}) {
    this.opts = opts;
    this.groups = types.map((t) => {
      const list = seats.filter((s) => s.type === t.name);
      if (!list.length) return null;
      const g = new THREE.InstancedBufferGeometry();
      for (const [k, a] of Object.entries(t.baked.geo.attributes)) g.setAttribute(k, a);
      g.setIndex(t.baked.geo.index);
      const n = list.length;
      g.instanceCount = n;
      const attr = (name, dyn) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); if (dyn) a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
      const st = attr('aState', true), po = attr('aPose', true), va = attr('aVar', false), xf = attr('aXform', true), sh = attr('aShape', true);
      const mp = t.matParams || matParams; // (a type may carry its own: the far bands drop the alpha mask on tv)
      const make = (params) => { const m = (shared.vlit ? crowdMaterialVlit : crowdMaterial)({ ...params, rimSoft: !!t.rimSoft }, shared, t.baked.hip, t.baked.neck); if (t.baked.moves) withMoves(m, t.baked.moves); return m; };
      let material = null;
      if (t.cardParams || t.dropCards) {
        // body/card split (tv, the near bands): the body draws opaque, so the GPU can reject hidden layers early, and
        // only the hair cards (the atlas's opacity quadrant) keep the alpha test, as a second group of the same draw
        const idx = g.index.array, uv = g.attributes.uv, body = [], card = [];
        for (let k = 0; k < idx.length; k += 3) {
          const u = uv.getX(idx[k]) * 4, v = uv.getY(idx[k]) * 4;
          (u - Math.floor(u) < 0.5 && v - Math.floor(v) >= 0.5 ? card : body).push(idx[k], idx[k + 1], idx[k + 2]);
        }
        if (t.dropCards && body.length) {
          // far rows on tv: no hair cards at all (drawn opaque they were pale quads round the heads; the head keeps its
          // painted hair), and fewer triangles
          g.setIndex(new THREE.BufferAttribute(new idx.constructor(body), 1));
        } else if (card.length && body.length) {
          const all = new idx.constructor(idx.length);
          all.set(body); all.set(card, body.length);
          g.setIndex(new THREE.BufferAttribute(all, 1));
          g.addGroup(0, body.length, 0); g.addGroup(body.length, card.length, 1);
          material = [make(mp), make(t.cardParams)];
        }
      }
      const mesh = new THREE.Mesh(g, material || make(mp));
      mesh.frustumCulled = false;
      mesh.name = 'instances-' + t.name;
      const people = list.map((s, i) => {
        const V = opts.variety ? opts.variety(s.src) : { hue: 0, sat: 1, val: 1, depth: 1, fold: 0, mirror: false, sx: 1, sy: 1, yaw: 0, tilt: 0, dx: 0, dz: 0 };
        va.setXYZW(i, V.hue, V.fold && !t.baked.standing ? -V.sat : V.sat, V.val, V.depth); // fold rides on the sign of saturation
        // home: the seat frame shifted a little in the seat and turned by the body yaw
        const home = new THREE.Vector3(V.dx, 0, V.dz).applyMatrix4(s.seat.matrixWorld);
        const yaw = s.seat.rotation.y + V.yaw;
        xf.setXYZW(i, home.x, home.y, home.z, yaw);
        sh.setXYZW(i, (V.mirror ? -1 : 1) * V.sx, V.sy, V.tilt, 0);
        const t2 = new Person(null, null, { seed: s.seed, row: s.row, x: s.x, table: false, seatH: 0.45 });
        // where 'the stage' is for this person: the performer's body or the mic, seldom the lens
        const target = opts.performer.clone().add(new THREE.Vector3(t2.gaze.x, t2.gaze.y, 0));
        const perf = s.seat.worldToLocal(target);
        const mir = V.mirror ? -1 : 1;
        const yaw0 = mir * (Math.atan2(perf.x, perf.z) - V.yaw), pitch0 = -Math.atan2(perf.y - 1.2, Math.hypot(perf.x, perf.z));
        return { t: t2, i, yaw0, pitch0, mir, slouch: t2.slouch * 0.7, seat: s.seat, src: s.src, home, yaw, V, moved: false };
      });
      scene.add(mesh);
      mesh.updateMatrixWorld(true);
      return { mesh, st, po, xf, sh, people, mv: t.baked.moves, tris: ((g.index ? g.index.count : g.attributes.position.count) / 3) * n };
    }).filter(Boolean);
    this.count = seats.length;
  }

  update(now, room) {
    const leanFor = { back: -0.2, over: 0.36, giggle: 0.06, turn: 0.02 };
    const attention = room.attention ?? 0.6, hk = room.heckle ? room.heckle.level : 0;
    const restless = 1 + room.murmur * 2.2 + (1 - attention) * 0.5;
    // restlessness speeds the drift up (capped), it never widens it: no bobbleheads in dead air
    const speed = Math.min(restless, 1.6);
    const hp = new THREE.Vector3();
    const traffic = this.opts.traffic;
    // seated people update on alternate frames, half the groups each frame (15 Hz at 30 fps; the shader animates in
    // between, and every change eases over 0.3 s); anyone moving updates every frame
    const f = (this._f = (this._f || 0) + 1);
    const SUM = (this._S ||= {});
    for (let gi = 0; gi < this.groups.length; gi++) {
      const G = this.groups[gi];
      const st = G.st.array, po = G.po.array, xf = G.xf.array, sh = G.sh.array;
      const rest = f > 3 && ((f + gi) & 1) === 1 && now - (G.lastT ?? -1e9) < 0.1 && now >= G.lastT;
      if (!rest) G.lastT = now;
      let placed = false, touched = false;
      for (const P of G.people) {
        const t = P.t, k = P.i * 4;
        // where they are: in their seat, or arriving / leaving / gone (the room's traffic)
        const L = traffic ? traffic(P.src, now) : null;
        if (rest && !L && !P.moved) continue;
        touched = true;
        if (L || P.moved) {
          placed = true;
          if (!L) { xf[k] = P.home.x; xf[k + 1] = P.home.y; xf[k + 2] = P.home.z; xf[k + 3] = P.yaw; sh[k] = P.mir * P.V.sx; sh[k + 1] = P.V.sy; sh[k + 3] = 0; P.moved = false; }
          else if (L.hidden) { sh[k] = 0; sh[k + 1] = 0; P.moved = true; }
          else {
            const walking = L.x !== undefined;
            xf[k] = walking ? L.x : P.home.x; xf[k + 1] = walking ? L.y : P.home.y; xf[k + 2] = walking ? L.z : P.home.z; xf[k + 3] = walking ? L.yaw : P.yaw;
            // with captured moves: 2…3 the walk cycle's phase (by distance, so the feet stay planted), 4…5 sitting
            let w = L.stand;
            if (G.mv && MOVES_Q !== 'nowalk') {
              if (walking) { const c = (L.dist || 0) / G.mv.stride; w = 2 + (c - Math.floor(c)) * 0.9999; }
              else if (L.sit !== undefined) w = 4 + Math.min(1, L.sit);
              else if (L.rise !== undefined) w = 5 - Math.min(1, L.rise);
              else if (L.stand >= 1) w = 4;
            }
            sh[k] = P.mir * P.V.sx; sh[k + 1] = P.V.sy; sh[k + 3] = w; P.moved = true;
          }
        }
        const walker = L && L.x !== undefined, inSeat = !L || L.hidden;
        let body = 0, best = null, bestScore = 0;
        for (let e = 0; e < room.events.length; e++) {
          const r = t.response(room.events[e], now, room.spread, room.vocab, room.venueId);
          if (!r) continue;
          let sc = r.body;
          for (let j = 0; j < r.gestures.length; j++) sc += r.gestures[j].w;
          if (sc > bestScore) { bestScore = sc; best = r; }
          body = Math.max(body, r.body);
        }
        const S = Person.summary(best, SUM);
        const turn = best && best.style === 'turn' ? t.side * 0.7 * body : 0;
        // a glance at a friend comes and goes (5–20 s at a time) instead of holding for the whole show
        const glancing = t.glance > 0.93 && noise(t.seed + 21, now / 9) > 0.35;
        // talkers turn to their friend while they talk, and back now and then (not one fixed turn for the whole preview)
        const chatting = (room.murmur > 0.5 && hash01(t.seed) < 0.12 * room.murmur) || (room.mode === 'preview' && t.chatty < 0.38);
        const chat = (chatting && noise(t.seed + 51, now * 0.16) > -0.35) || glancing ? t.side * 0.9 : 0;
        let yaw = P.yaw0 + P.mir * (turn + chat) + noise(t.seed + 4, now * 0.25 * speed) * 0.16;
        // idle moves in the seat (a phone check, a look round), from a seeded schedule
        let gest = 0, gk = 0;
        // (not in the two rows behind the close-up pair while a close shot is up: their low-poly arms read as shards)
        const nearClose = room.shot && room.shot !== 'wide' && P.src && P.src.row <= 1;
        if (G.mv && MOVES_Q !== 'nogest' && !nearClose && inSeat && S.clap < 0.01 && S.cheer < 0.01 && body < 0.1) {
          const F = t.fidgets;
          let lo = 0, hi = F.length - 1;
          while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= now) lo = m; else hi = m - 1; }
          const ev = F[lo], dur = 2.4 + 3.2 * hash01(t.seed + lo), a = now - ev.t;
          const dead = room.murmur > 0.5 || (room.deadBits || 0) >= 2, social = room.mode !== 'live';
          const lam = social ? 0.07 : 0.025 + 0.08 * Math.min(1, room.murmur) + 0.015 * Math.min(room.deadBits || 0, 3) + 0.03 * (1 - attention);
          // a phone check (dead air and before/after the set mostly); otherwise a look round (the head only)
          if (a >= 0 && a < dur && ev.u < lam / 0.22) {
            let env = Math.min(1, a / 0.6, (dur - a) / 0.7);
            env = env * env * (3 - 2 * env);
            if ((dead || social) && ev.k < 0.55) { gk = 1; gest = env; } // (the phone: in dead air and the chat only; a listener looks round)
            else yaw += (hash01(t.seed + lo * 1.7) < 0.5 ? -1 : 1) * 0.55 * env * Math.sin(Math.PI * Math.min(1, a / dur));
          }
        }
        if (hk > 0 && room.hecklerPos) {
          hp.copy(room.hecklerPos); P.seat.worldToLocal(hp);
          yaw += (P.mir * Math.atan2(hp.x, hp.z) - yaw) * 0.5 * hk;
        }
        const down = Math.max(0, noise(t.seed + 11, now * 0.13) - 0.6 + t.glance * 0.2) * 1.2 * (1 - Math.min(1, body * 2)) + (room.mode === 'preview' && t.chatty > 0.38 && t.chatty < 0.56 ? 0.5 : 0);
        const style = best ? best.style : t.style;
        st[k] = body;
        // no arm up for low-detail people: a cheer is a clap here (their raised arm reads as a flat paddle)
        st[k + 1] = gest > 0.001 ? -gest : Math.max(S.clap * (S.low ? 0.6 : 1), S.cheer * 0.8);
        // the laugh's take (instanced): which of the three baked laughs, how big (no arms: see MOVES)
        st[k + 2] = G.mv && body > 0.01 && best && best.kind === 'laugh' ? S.variant + 0.02 + 0.97 * Math.min(1, S.amp) : 0;
        // (with a baked laugh playing, the capture already bends them: doubled over, the lean and the head's drop are
        // mostly the capture's, or the head ends up in the chest)
        const baked = st[k + 2] > 0, overK = baked && style === 'over' ? 0.35 : 1;
        // each seat's sitting style (seeded): upright, leaning back, or slouched, plus a little of its own and a slow
        // weight shift, so the back rows don't sit like a grid
        if (P.pst === undefined) { const u = hash01(t.seed * 1.91 + 7); P.pst = (u < 0.4 ? 0.05 : u < 0.75 ? -0.12 : 0.11) + (hash01(t.seed * 3.3 + 1) - 0.5) * 0.06; }
        const lean = P.slouch + (inSeat ? P.pst + noise(t.seed + 71, now * 0.025) * 0.04 : 0) + (leanFor[style] || 0) * overK * body + (attention - 0.55) * 0.18 + noise(t.seed + 1, now * 0.11 * speed) * 0.04 + S.vocal * 0.12;
        let pitch = P.pitch0 * 0.8 + (style === 'back' ? -0.22 : style === 'over' ? 0.25 * overK : 0) * body + noise(t.seed + 5, now * 0.2) * 0.05 + down * 0.5 + S.vocal * 0.15;
        pitch += gest * (gk === 1 ? 0.5 : 0.1) + (chat ? 0.04 * noise(t.seed + 53, now * 1.6) : 0);
        // heads up (down is +): within 15 degrees down and 20 up while they listen and laugh; a bored dead-air head and the
        // phone may drop further (stacked, the seat's tilt, a glance and the laugh sank heads into chests)
        pitch = Math.max(-0.35, Math.min(gk === 1 && gest > 0.1 ? 0.6 : room.murmur > 0.5 || (room.deadBits || 0) >= 2 ? 0.42 : room.mode === 'live' && body < 0.1 ? 0.15 : 0.26, pitch)); // (listening: the face up at the stage)
        let leanW = lean;
        // walkers: the head leads the turn (no seat gaze, no glances, no heckle look), the body upright
        if (walker) { yaw = (L.look || 0) * P.mir / 0.8; pitch = 0.06; leanW = 0; }
        // every switch eases over about 0.3 s (murmur crossing 0.5 used to turn heads 0.72 rad in one frame); a still
        // frame, or the first one, snaps to the target
        const dt = now - (P.smT ?? -1e9);
        const e = dt > 0 && dt < 0.5 ? 1 - Math.exp(-dt / 0.3) : 1;
        P.smT = now;
        P.sYaw = e === 1 ? yaw * 0.8 : P.sYaw + (yaw * 0.8 - P.sYaw) * e;
        P.sPitch = e === 1 ? pitch : P.sPitch + (pitch - P.sPitch) * e;
        P.sLean = e === 1 ? leanW : P.sLean + (leanW - P.sLean) * e;
        st[k + 3] = Math.max(inSeat ? -0.15 : -0.25, Math.min(0.38, P.sLean)); // (never far enough to look like sliding off the seat, or lying back on it)
        po[k] = P.sYaw;
        po[k + 1] = P.sPitch;
        po[k + 2] = (t.seed % 997) * 0.37 + (best && best.kind === 'laugh' ? S.phase : 0); // each laugh its own rhythm
        po[k + 3] = S.rate;
      }
      if (touched) { G.st.needsUpdate = true; G.po.needsUpdate = true; }
      if (placed) { G.xf.needsUpdate = true; G.sh.needsUpdate = true; }
    }
  }
}

/** Give a crowd material (either kind) the captured moves: the texture, its size and the walking pivots. */
function withMoves(m, mv) {
  const u = { uMoves: { value: mv.tex }, uMoveN: { value: mv.n }, uNeckW: { value: mv.neckW }, uHipW: { value: mv.hipW } };
  Object.assign(m.isShaderMaterial ? m.uniforms : m.userData.uniforms, u);
  m.defines = { ...(m.defines || {}), CROWD_MOVES: 1 };
}

const hash01 = (n) => { const s = Math.sin(n * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); };
// (for the box's perf harness, tools/render/jsperf.mjs)
if (typeof window !== 'undefined') window.__InstancedCrowd = InstancedCrowd;
