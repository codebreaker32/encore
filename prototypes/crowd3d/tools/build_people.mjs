// People pipeline: Microsoft Rocketbox FBX (MIT) -> small GLBs for the live crowd prototype.
//
//   node tools/build_people.mjs [Name ...]          (default: every avatar in tools/avatars.json)
//
// Needs: tools/fetch_rocketbox.sh run first (cache in ~/.cache/encore-rocketbox, or $ROCKETBOX_CACHE),
// FBX2glTF 0.9.7 at ~/.cache/encore-tools/FBX2glTF (or $FBX2GLTF), python3 with Pillow.
//
// For each avatar it writes
//   people/<Name>.glb      front-row model: the skinned mesh (body, head, opacity primitives), 22 ARKit-style
//                          morph targets named in mesh.extras.targetNames, colour JPEG 1024, normal PNG 512,
//                          opacity PNG RGBA 1024 (alpha-tested, double-sided), roughness 0.75, metalness 0,
//                          no animation, sparse morph accessors.
//   people/<Name>.lod.glb  crowd levels: one primitive, no morph targets, UVs remapped into the shared atlas
//   people/<Name>.sil.glb  (people/lod_atlas*.jpg + lod_alpha*.png), no textures inside. Each source primitive is
//   people/<Name>.far.glb  simplified on its own (head keeps the largest share): lod ≈ 30–40%, sil ≈ 6–22%,
//   people/<Name>.xfar.glb far ≈ 3–12%, xfar ≈ 1–5% (theatre balcony and the arena tiers). The scene CPU-skins lod (low/high) or poses sil/far once and bakes them into
//                          InstancedMeshes animated in the vertex shader.
//   people/<Name>.tv.glb   front-row model for the TV preset: 12 morph targets (jawOpen, mouthSmile L/R, eyeBlink L/R,
//                          browInnerUp, cheekSquint L/R, eyeSquint L/R, mouthUpperUp L/R) on the head and hair primitives only; the body is a second
//                          mesh on the same skin, without targets, simplified to ~30%; colour JPEG 512 head, 384 body,
//                          opacity PNG 384 (colour dilated, alpha coverage kept), no normal maps.
import { NodeIO, VertexLayout } from '@gltf-transform/core';
import { prune, dedup, sparse, joinPrimitives, weldPrimitive, simplifyPrimitive, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const outDir = path.join(root, 'people');
const cache = process.env.ROCKETBOX_CACHE || path.join(os.homedir(), '.cache/encore-rocketbox');
const fbx2gltf = process.env.FBX2GLTF || path.join(os.homedir(), '.cache/encore-tools/FBX2glTF');
const work = process.env.WORK_DIR || path.join(os.tmpdir(), 'crowd3d-work');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'avatars.json'), 'utf8'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(manifest);
const order = Object.keys(manifest); // atlas tile index = position in avatars.json

// The ARKit shapes the behaviour drives (Rocketbox channel "AK_nn_<Name>" -> "<name>").
const KEEP = [
  'EyeBlinkLeft', 'EyeBlinkRight', 'EyeSquintLeft', 'EyeSquintRight', 'EyeLookDownLeft', 'EyeLookDownRight',
  'EyeWideLeft', 'EyeWideRight', 'BrowInnerUp', 'BrowOuterUpLeft', 'BrowOuterUpRight', 'CheekSquintLeft',
  'CheekSquintRight', 'MouthSmileLeft', 'MouthSmileRight', 'MouthFrownLeft', 'MouthFrownRight', 'MouthPressLeft',
  'MouthPressRight', 'MouthUpperUpLeft', 'MouthUpperUpRight', 'JawOpen',
];
// TV: 12 shapes here (the last four serve the laugh: narrowed eyes, a raised upper lip). tools/anim/tv_morphs.mjs then
// merges the symmetric pairs into 8 shapes (each costs vertices × 16 B of float morph texture); run it after this.
const TV_KEEP = ['EyeBlinkLeft', 'EyeBlinkRight', 'BrowInnerUp', 'CheekSquintLeft', 'CheekSquintRight', 'MouthSmileLeft', 'MouthSmileRight', 'JawOpen',
  'EyeSquintLeft', 'EyeSquintRight', 'MouthUpperUpLeft', 'MouthUpperUpRight'];
const camel = (s) => s[0].toLowerCase() + s.slice(1);

// Blend shape channel names, in file order, from the binary FBX (FBX2glTF drops them but keeps the order).
function morphNames(fbxPath) {
  const text = fs.readFileSync(fbxPath).toString('latin1');
  return [...text.matchAll(/([A-Za-z0-9_ .\-]{2,64})\x00\x01SubDeformer/g)]
    .map((m) => m[1])
    .filter((n) => n.startsWith('blendShape'))
    .map((n) => n.replace(/^blendShape\d*\./, ''));
}

const suffixOf = (mat) => (mat?.getName() || '').split('_').pop(); // body | head | opacity

const io = new NodeIO().setVertexLayout(VertexLayout.SEPARATE); // separate arrays: three can merge them

// The tv body is simplified by bone group, not as one piece (docs/crowd-visual-plan.md R13): at 540p a decimated hand
// reads as a paddle or a bony claw, so the hands keep most of their triangles, the legs (behind tables and seat backs)
// give up the most, and the total stays about where it was (30% of the source). The groups are cut along their shared
// edges, which stay locked while each is simplified, so the skin has no cracks; every kept vertex keeps its weights.
const HAND = /Hand|Finger/, LEG = /Thigh|Calf|Foot|Toe/;
// ratio and error bound per group: the hands get a fine error so the fingers stay fingers; the rest may move more
const TV_BODY = { hand: [0.42, 0.004], leg: [0.18, 0.03], rest: [0.33, 0.015] };
function rebalanceBody(doc, mesh, prim, skin) {
  const joints = skin.listJoints().map((j) => j.getName());
  const J = prim.getAttribute('JOINTS_0'), Wt = prim.getAttribute('WEIGHTS_0'), idx = prim.getIndices().getArray();
  const j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
  const vg = new Array(J.getCount());
  for (let v = 0; v < vg.length; v++) {
    J.getElement(v, j4); Wt.getElement(v, w4);
    let hand = 0, leg = 0;
    for (let k = 0; k < 4; k++) { const n = joints[j4[k]] || ''; if (HAND.test(n)) hand += w4[k]; else if (LEG.test(n)) leg += w4[k]; }
    vg[v] = hand >= 0.5 ? 'hand' : leg >= 0.5 ? 'leg' : 'rest';
  }
  const tris = { hand: [], leg: [], rest: [] };
  for (let t = 0; t < idx.length; t += 3) {
    const c = [vg[idx[t]], vg[idx[t + 1]], vg[idx[t + 2]]];
    const g = c.includes('hand') ? 'hand' : c.filter((x) => x === 'leg').length >= 2 ? 'leg' : 'rest';
    tris[g].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const buffer = prim.getIndices().getBuffer(), parts = [], count = {};
  for (const [g, list] of Object.entries(tris)) {
    if (!list.length) continue;
    const p = prim.clone();
    p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer));
    compactPrimitive(p);
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: TV_BODY[g][0], error: TV_BODY[g][1], lockBorder: true });
    count[g] = [list.length / 3, p.getIndices().getCount() / 3];
    parts.push(p);
  }
  const joined = joinPrimitives(parts);
  parts.forEach((p) => p.dispose());
  mesh.removePrimitive(prim);
  prim.dispose();
  mesh.addPrimitive(joined);
  console.log('  tv body (source → kept triangles)', JSON.stringify(count));
}
/**
 * Cloth that has to follow the thighs when seated (the 2026-10-12 review: a skirt that stayed a rigid plate from the
 * hip past the knee, with a void between the knees; a shorts hem that splayed into plates). The skirt or shorts are
 * the body texture's denim below the hips in the bind pose; their weights go from the pelvis at the waist to the thighs
 * at the hem. A skirt (one tube) blends across both thighs by its side, so its front spans the knees; shorts (a tube
 * round each leg) keep each vertex on its own thigh.
 */
const CLOTH = { Female_Adult_02: ['skirt'], Female_Adult_12: ['shorts', 'hood'], Male_Adult_17: ['sleeve'] };
/**
 * Weights that tear when a limb moves (the same review): 'sleeve' - a jacket's sleeve and side kept small weights on the
 * other part (the sleeve on the spine, the hip on the forearm), so raised arms pulled a blade from the elbow to the
 * hip: each vertex goes to its arm if the arm owns it, or loses the arm below the armpit. 'hood' - a hood on the body
 * mesh followed the head and stood up as a fin when the head bent: its head weight moves to the neck.
 */
async function limbFit(rawIn, rawOut, kind) {
  const doc = await io.read(rawIn);
  const r = doc.getRoot(), skin = r.listSkins()[0], names = skin.listJoints().map((j) => j.getName());
  const ARM = /(UpperArm|Forearm|Hand|Clavicle|Finger)/, ji = (re) => names.findIndex((n) => re.test(n));
  const ibm = skin.getInverseBindMatrices().getArray();
  const at = (j) => {
    const m = ibm.slice(j * 16, j * 16 + 16);
    const A = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], b = [-m[12], -m[13], -m[14]];
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A);
    return [0, 1, 2].map((c) => det(A.map((row, i) => row.map((x, k) => (k === c ? b[i] : x)))) / D);
  };
  const pL = at(ji(/L Thigh$/)), kL = at(ji(/L Calf$/));
  const UP = [0, 1, 2].reduce((a, i) => (Math.abs(pL[i] - kL[i]) > Math.abs(pL[a] - kL[a]) ? i : a), 0);
  const armpit = at(ji(/L UpperArm$/))[UP] - 0.12, head = ji(/Head$/), neck = ji(/Neck$/);
  const shL = at(ji(/L UpperArm$/)), shR = at(ji(/R UpperArm$/));
  let n = 0;
  for (const prim of r.listMeshes()[0].listPrimitives()) {
    if (suffixOf(prim.getMaterial()) !== 'body') continue;
    const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
    const p = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
    for (let v = 0; v < P.getCount(); v++) {
      J.getElement(v, j4); W.getElement(v, w4); P.getElement(v, p);
      let keep;
      if (kind === 'sleeve') {
        let arm = 0, other = 0;
        for (let q = 0; q < 4; q++) if (w4[q] > 0) { if (ARM.test(names[j4[q]] || '')) arm += w4[q]; else other += w4[q]; }
        if (!arm || !other) continue;
        // (2026-10-16, the "jacket shards" on the TV: making every arm-owned vertex all arm cut the shoulder and the
        // back of the jacket off the spine, and a forward reach lifted that panel as a hard-edged hump. Now the sleeve
        // drops its body weights only away from the shoulder (more than 14 cm from the upper arm's root), and the side
        // below the armpit drops only its forearm and hand weights; the shoulder keeps its blend of clavicle, upper
        // arm and spine.)
        const FORE = /(Forearm|Hand|Finger)/;
        const dShoulder = Math.min(Math.hypot(p[0] - shL[0], p[1] - shL[1], p[2] - shL[2]), Math.hypot(p[0] - shR[0], p[1] - shR[1], p[2] - shR[2]));
        if (arm >= 0.5 && dShoulder > 0.14) keep = (q) => ARM.test(names[j4[q]] || '');
        else if (arm < 0.5 && p[UP] < armpit) keep = (q) => !FORE.test(names[j4[q]] || '');
        else continue;
        const w = w4.map((x, q) => (keep(q) ? x : 0)), sum = w.reduce((a, b) => a + b, 0);
        W.setElement(v, w.map((x) => x / sum));
      } else if (kind === 'hood' && head >= 0 && neck >= 0) {
        const h = j4.findIndex((x, q) => x === head && w4[q] > 0);
        if (h < 0) continue;
        const nq = j4.findIndex((x, q) => x === neck && w4[q] > 0);
        if (nq >= 0) { w4[nq] += w4[h]; w4[h] = 0; } else { j4[h] = neck; J.setElement(v, j4); }
        W.setElement(v, w4);
      } else continue;
      n++;
    }
  }
  await io.write(rawOut, doc);
  console.log(`  ${kind} fit: ${n} vertices`);
}
async function clothFit(rawIn, rawOut, tex, kind) {
  const { default: sharp } = await import('sharp');
  const doc = await io.read(rawIn);
  const r = doc.getRoot(), skin = r.listSkins()[0], names = skin.listJoints().map((j) => j.getName());
  const ji = (re) => names.findIndex((n) => re.test(n));
  const pel = ji(/Pelvis$/), tL = ji(/L Thigh$/), tR = ji(/R Thigh$/), cL = ji(/L Calf$/), cR = ji(/R Calf$/);
  if ([pel, tL, tR, cL, cR].some((i) => i < 0)) throw new Error(`clothFit: joints not found in ${names.slice(0, 8)}`);
  const ibm = skin.getInverseBindMatrices().getArray();
  const at = (j) => { // a joint's origin in mesh space: solve IBM · x = 0 (column-major, any scale)
    const m = ibm.slice(j * 16, j * 16 + 16);
    const A = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], b = [-m[12], -m[13], -m[14]];
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A);
    return [0, 1, 2].map((c) => det(A.map((row, i) => row.map((x, k) => (k === c ? b[i] : x)))) / D); // Cramer's rule
  };
  const [pL, pR, kL, kR] = [at(tL), at(tR), at(cL), at(cR)];
  // (the FBX's mesh space is Z-up: take the axis along which the knee lies below the hip)
  const UP = [0, 1, 2].reduce((a, i) => (Math.abs(pL[i] - kL[i]) > Math.abs(pL[a] - kL[a]) ? i : a), 0);
  const hipY = (pL[UP] + pR[UP]) / 2 + 0.06, kneeY = (kL[UP] + kR[UP]) / 2, xL = pL[0], xR = pR[0];
  const { data, info } = await sharp(path.join(tex, 'body_color.jpg')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const LEGS = /Thigh|Pelvis|Spine|Calf/;
  let n = 0;
  for (const prim of r.listMeshes()[0].listPrimitives()) {
    if (suffixOf(prim.getMaterial()) !== 'body') continue;
    const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
    const p = [0, 0, 0], uv = [0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
    for (let v = 0; v < P.getCount(); v++) {
      P.getElement(v, p);
      if (p[UP] > hipY || p[UP] < kneeY - 0.02) continue;
      UV.getElement(v, uv);
      const px = Math.min(info.width - 1, Math.max(0, Math.floor(uv[0] * info.width))), py = Math.min(info.height - 1, Math.max(0, Math.floor(uv[1] * info.height)));
      const k = (py * info.width + px) * 3, R = data[k], G = data[k + 1], B = data[k + 2];
      const denim = B >= R - 4 && B > 24 && R + G + B < 330;
      if (!denim) continue;
      J.getElement(v, j4); W.getElement(v, w4);
      let legs = 0, left = 0, right = 0;
      for (let q = 0; q < 4; q++) { const nm = names[j4[q]] || ''; if (LEGS.test(nm)) legs += w4[q]; if (/ L (Thigh|Calf)$/.test(nm)) left += w4[q]; if (/ R (Thigh|Calf)$/.test(nm)) right += w4[q]; }
      if (legs < 0.95) continue; // (not a hand or a sleeve hanging beside the hip)
      let t = Math.min(1, Math.max(0, (hipY - p[UP]) / (hipY - kneeY)));
      t = Math.pow(t, 0.7); // (the thighs take over soon below the waist)
      let s;
      if (kind === 'skirt') { s = Math.min(1, Math.max(0, (p[0] - xR) / (xL - xR))); s = s * s * (3 - 2 * s); }
      else s = left >= right ? 1 : 0;
      J.setElement(v, [pel, tL, tR, 0]);
      W.setElement(v, [1 - t, t * s, t * (1 - s), 0]);
      n++;
    }
  }
  await io.write(rawOut, doc);
  console.log(`  cloth fit (${kind}): ${n} vertices from the pelvis to the thighs`);
}
async function buildFront(raw, tex, channels, keepList, outFile, { name, tv }) {
  const doc = await io.read(raw);
  const r = doc.getRoot();
  r.listAnimations().forEach((a) => a.dispose());
  r.listTextures().forEach((t) => t.dispose());
  const mesh = r.listMeshes()[0];
  const prims = mesh.listPrimitives();
  for (const p of prims) for (const a of ['COLOR_0', 'TEXCOORD_1']) if (p.getAttribute(a)) p.setAttribute(a, null); // unused FBX extras
  const count = prims[0].listTargets().length;
  if (count !== channels.length) throw new Error(`${name}: ${count} morph targets but ${channels.length} FBX channels`);
  const keepIdx = keepList.map((k) => channels.findIndex((c) => c.startsWith('AK_') && c.replace(/^AK_\d+_/, '') === k));
  const kept = keepList.filter((_, i) => keepIdx[i] >= 0);
  for (const p of prims) {
    const targets = p.listTargets();
    targets.forEach((t) => p.removeTarget(t));
    keepIdx.filter((i) => i >= 0).forEach((i) => p.addTarget(targets[i]));
  }
  // Morph deltas carry float noise on every vertex; zero anything under 0.02 mm so the accessors go sparse.
  for (const p of prims) {
    for (const t of p.listTargets()) {
      for (const sem of t.listSemantics()) {
        const a = t.getAttribute(sem).clone();
        const e = [0, 0, 0];
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, e);
          if (Math.hypot(e[0], e[1], e[2]) < 2e-5) a.setElement(i, [0, 0, 0]);
        }
        t.setAttribute(sem, a);
      }
    }
  }
  mesh.setWeights(kept.map(() => 0));
  mesh.setExtras({ targetNames: kept.map(camel) });
  // gltf-transform writes extras.targetNames from the targets' own names, so name them too
  for (const p of prims) p.listTargets().forEach((t, j) => t.setName(camel(kept[j])));
  mesh.setName(`${name}_mesh`);
  const texture = (file, mime) =>
    doc.createTexture(path.basename(file)).setImage(fs.readFileSync(path.join(tex, file))).setMimeType(mime);
  const sfx = tv ? '_tv' : '';
  for (const mat of r.listMaterials()) {
    const kind = suffixOf(mat);
    mat.setRoughnessFactor(0.75).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]);
    mat.setEmissiveFactor([0, 0, 0]);
    if (kind === 'opacity') {
      const op = tv ? 'opacity_tv.png' : 'opacity_color.png'; // (tv: 384², colour dilated, alpha coverage kept: textures.py)
      if (fs.existsSync(path.join(tex, op))) mat.setBaseColorTexture(texture(op, 'image/png'));
      mat.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true);
    } else {
      mat.setBaseColorTexture(texture(`${kind}_color${sfx}.jpg`, 'image/jpeg'));
      if (!tv) mat.setNormalTexture(texture(`${kind}_normal.png`, 'image/png'));
      mat.setAlphaMode('OPAQUE').setDoubleSided(false);
    }
  }
  r.listScenes()[0].listChildren()[0]?.setName(name);
  if (tv) {
    // the body has no facial deltas: move it to its own mesh on the same skin, drop its targets, simplify it
    const node = r.listNodes().find((n) => n.getMesh() === mesh);
    const body = mesh.listPrimitives().find((p) => suffixOf(p.getMaterial()) === 'body');
    mesh.removePrimitive(body);
    body.listTargets().forEach((t) => body.removeTarget(t));
    const bodyMesh = doc.createMesh(`${name}_body`).addPrimitive(body);
    const bodyNode = doc.createNode(`${name}_body`).setMesh(bodyMesh).setSkin(node.getSkin());
    (node.getParentNode() || r.listScenes()[0]).addChild(bodyNode);
    weldPrimitive(body, {});
    rebalanceBody(doc, bodyMesh, body, node.getSkin());
  }
  await doc.transform(dedup(), sparse({ ratio: 1 / 3 }), prune());
  await io.write(outFile, doc);
  return kept;
}

await MeshoptSimplifier.ready;
fs.mkdirSync(outDir, { recursive: true });
const report = [];

for (const name of names) {
  const exportDir = path.join(cache, name, 'Export');
  const fbx = path.join(exportDir, `${name}_facial.fbx`);
  const w = path.join(work, name);
  fs.mkdirSync(w, { recursive: true });
  let raw = path.join(w, 'raw.glb');
  if (!fs.existsSync(raw)) {
    execFileSync(fbx2gltf, ['-i', fbx, '-o', path.join(w, 'raw'), '--binary'], { cwd: exportDir, stdio: 'ignore' });
  }
  const tex = path.join(w, 'tex');
  if (!fs.existsSync(path.join(tex, 'head_color_tv.jpg')) || !fs.existsSync(path.join(tex, 'opacity_tv.png'))) {
    execFileSync('python3', ['-P', path.join(here, 'textures.py'), 'person', path.join(cache, name, 'Textures'), tex], {
      stdio: 'inherit',
    });
  }
  const channels = morphNames(fbx);
  for (const kind of CLOTH[name] || []) { // (each fit writes its own copy, so every level below is built from it)
    const fitted = path.join(w, `raw-${kind}.glb`);
    if (kind === 'skirt' || kind === 'shorts') await clothFit(raw, fitted, tex, kind); else await limbFit(raw, fitted, kind);
    raw = fitted;
  }

  const front = path.join(outDir, `${name}.glb`);
  const tvFile = path.join(outDir, `${name}.tv.glb`);
  // ONLY=tv rebuilds just the .tv.glb front models (leaves every other file, the atlas and people.json alone)
  if (process.env.ONLY === 'tv') { await buildFront(raw, tex, channels, TV_KEEP, tvFile, { name, tv: true }); console.log('tv', name, Math.round(fs.statSync(tvFile).size / 1024), 'KB'); continue; }
  // ONLY=front rebuilds the full and the .tv.glb front models (then run tools/anim/tv_morphs.mjs, tools/hair_tv.mjs and
  // tools/tv_body.mjs on them); the crowd levels, the atlas and people.json are left alone
  if (process.env.ONLY === 'front') { await buildFront(raw, tex, channels, KEEP, front, { name, tv: false }); await buildFront(raw, tex, channels, TV_KEEP, tvFile, { name, tv: true }); console.log('front', name, Math.round(fs.statSync(front).size / 1024), Math.round(fs.statSync(tvFile).size / 1024), 'KB'); continue; }
  const kept = await buildFront(raw, tex, channels, KEEP, front, { name, tv: false });
  await buildFront(raw, tex, channels, TV_KEEP, tvFile, { name, tv: true });

  // ---- crowd levels (atlas UVs, no morphs): each primitive is simplified on its own, so the head keeps most of
  // the triangles (faces stay faces) while the clothes and hair cards give theirs up, then they are joined ----
  const levels = {
    lod: { body: 0.3, head: 0.4, opacity: 0.5, err: 0.004 },
    sil: { body: 0.06, head: 0.14, opacity: 0.22, err: 0.02 },
    far: { body: 0.03, head: 0.075, opacity: 0.12, err: 0.04 },
    xfar: { body: 0.012, head: 0.03, opacity: 0.05, err: 0.1 },
  };
  const tris = (m) => m.listPrimitives().reduce((acc, p) => acc + p.getIndices().getCount() / 3, 0);
  const levelTris = {};
  for (const [level, spec] of Object.entries(levels)) {
    const lod = await io.read(raw);
    const lr = lod.getRoot();
    lr.listAnimations().forEach((x) => x.dispose());
    lr.listTextures().forEach((x) => x.dispose());
    const lmesh = lr.listMeshes()[0];
    const atlasMat = lod.createMaterial('lod_atlas').setRoughnessFactor(0.8).setMetallicFactor(0);
    const tile = order.indexOf(name);
    const TILE = 512, QUAD = 256, PAD = 2, SIZE = 2048;
    const quadrant = { body: [0, 0], head: [QUAD, 0], opacity: [0, QUAD] };
    for (const p of lmesh.listPrimitives()) {
      p.listTargets().forEach((t) => p.removeTarget(t));
      for (const x of ['COLOR_0', 'TEXCOORD_1']) if (p.getAttribute(x)) p.setAttribute(x, null);
      const kind = suffixOf(p.getMaterial());
      const [qx, qy] = quadrant[kind];
      const ox = (tile % 4) * TILE + qx + PAD, oy = Math.floor(tile / 4) * TILE + qy + PAD, span = QUAD - 2 * PAD;
      const uv = p.getAttribute('TEXCOORD_0').clone();
      const e = [0, 0];
      for (let i = 0; i < uv.getCount(); i++) {
        uv.getElement(i, e);
        uv.setElement(i, [(ox + e[0] * span) / SIZE, (oy + e[1] * span) / SIZE]);
      }
      p.setAttribute('TEXCOORD_0', uv);
      p.setMaterial(atlasMat);
      weldPrimitive(p, {});
      simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: spec[kind], error: kind === 'head' ? spec.err : spec.err * 3 });
    }
    lmesh.setWeights([]);
    const joined = joinPrimitives(lmesh.listPrimitives());
    lmesh.listPrimitives().forEach((p) => p.dispose());
    lmesh.addPrimitive(joined).setName(`${name}_${level}`);
    lr.listScenes()[0].listChildren()[0]?.setName(`${name}_${level}`);
    await lod.transform(dedup(), prune({ keepAttributes: true })); // the atlas UVs have no texture in this file; keep them
    await io.write(path.join(outDir, `${name}.${level}.glb`), lod);
    levelTris[level] = tris(lr.listMeshes()[0]);
  }
  const lodFile = path.join(outDir, `${name}.lod.glb`);
  const [lodTris, silTris, farTris, xfarTris] = [levelTris.lod, levelTris.sil, levelTris.far, levelTris.xfar];

  report.push({
    name,
    morphs: `${kept.length}/${channels.length}`,
    frontKB: Math.round(fs.statSync(front).size / 1024),
    tvKB: Math.round(fs.statSync(tvFile).size / 1024),
    lodKB: Math.round(fs.statSync(lodFile).size / 1024),
    lodTris,
    silTris,
    farTris,
    xfarTris,
  });
  console.log(report.at(-1));
}

// Shared middle-row atlas (always rebuilt from every avatar in avatars.json, in manifest order).
if (process.env.ONLY === 'tv' || process.env.ONLY === 'front') process.exit(0);
execFileSync(
  'python3',
  ['-P', path.join(here, 'textures.py'), 'atlas', outDir, ...order.map((n) => path.join(cache, n, 'Textures'))],
  { stdio: 'inherit' },
);
fs.writeFileSync(path.join(outDir, 'people.json'), JSON.stringify({ avatars: order, morphs: KEEP.map(camel), tvMorphs: TV_KEEP.map(camel), report }, null, 1));
console.table(report);
