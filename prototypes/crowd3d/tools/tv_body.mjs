// The TV front models' bodies, rebuilt from the full models without a full people rebuild (the user on the TV,
// 2026-10-16: "curves are sharp"; the tv body was 32% of the source, 1.5k triangles, and its shoulders and jackets
// read as flat panels in the close-ups):
//   - with NEW_LOW=1, `<name>_body`, the body every shot draws, simplified again from the full model's body with meshoptimizer's
//     attribute-aware simplifier (positions, normals and UVs weighted; UV seams and the hand/leg/rest group cuts
//     locked), at a little more of the source than before (rest 45% instead of 33%);
//   - `<name>_bodyHi`, the full model's body as it is (about 4.7k triangles), on the same skin and material, which
//     crowd.js swaps in for the people a close-up or a mid shot frames (and back on the wide).
// The head, hair and morph targets in the .tv.glb are left exactly as they are.
//   node tools/tv_body.mjs [Name ...]        (on the build box; default: every people/<Name>.tv.glb)
import { NodeIO, VertexLayout } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname), dir = path.join(here, '..', 'people');
const io = new NodeIO().setVertexLayout(VertexLayout.SEPARATE);
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter((f) => f.endsWith('.tv.glb')).map((f) => f.replace('.tv.glb', ''));
// ratio of the source triangles kept, and the error bound, per bone group (the hands keep their fingers, the legs sit
// behind tables and seat backs)
const GROUPS = { hand: [0.5, 0.004], leg: [0.25, 0.02], rest: [0.45, 0.01] };
const HAND = /Hand|Finger/, LEG = /Thigh|Calf|Foot|Toe/;
// how much a normal or a UV difference counts against moving a vertex (positions are in metres, a body ~1.7 m)
const W_NORMAL = 0.35, W_UV = 0.6;
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;

const bodyOf = (doc) => {
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) if (/_body$/.test(p.getMaterial()?.getName() || '')) return { mesh: m, prim: p };
  return null;
};
const jointNames = (doc) => doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());

function simplifyBody(src, joints) {
  const P = src.getAttribute('POSITION').getArray(), N = src.getAttribute('NORMAL').getArray(), UV = src.getAttribute('TEXCOORD_0').getArray();
  const J = src.getAttribute('JOINTS_0'), Wt = src.getAttribute('WEIGHTS_0'), idx = src.getIndices().getArray();
  const nv = P.length / 3, j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0], group = new Array(nv);
  for (let v = 0; v < nv; v++) {
    J.getElement(v, j4); Wt.getElement(v, w4);
    let hand = 0, leg = 0;
    for (let k = 0; k < 4; k++) { const n = joints[j4[k]] || ''; if (HAND.test(n)) hand += w4[k]; else if (LEG.test(n)) leg += w4[k]; }
    group[v] = hand >= 0.5 ? 'hand' : leg >= 0.5 ? 'leg' : 'rest';
  }
  // the attributes the simplifier weighs: the normal and the UV, scaled
  const attr = new Float32Array(nv * 5);
  for (let v = 0; v < nv; v++) {
    attr.set([N[v * 3] * W_NORMAL, N[v * 3 + 1] * W_NORMAL, N[v * 3 + 2] * W_NORMAL, UV[v * 2] * W_UV, UV[v * 2 + 1] * W_UV], v * 5);
  }
  // vertices on a group cut are locked (each group is simplified apart, so the skin has no cracks); UV seams are
  // separate vertices with the same position, which the border lock keeps
  const tris = { hand: [], leg: [], rest: [] };
  for (let t = 0; t < idx.length; t += 3) {
    const c = [group[idx[t]], group[idx[t + 1]], group[idx[t + 2]]];
    const g = c.includes('hand') ? 'hand' : c.filter((x) => x === 'leg').length >= 2 ? 'leg' : 'rest';
    tris[g].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const out = [], count = {};
  for (const [g, list] of Object.entries(tris)) {
    if (!list.length) continue;
    const ind = new Uint32Array(list), target = Math.floor((list.length * GROUPS[g][0]) / 3) * 3;
    const [res] = MeshoptSimplifier.simplifyWithAttributes(ind, P, 3, attr, 5, [1, 1, 1, 1, 1], null, target, GROUPS[g][1], ['LockBorder']);
    count[g] = [list.length / 3, res.length / 3];
    out.push(...res);
  }
  return { indices: new Uint32Array(out), count };
}

for (const name of names) {
  const srcDoc = await io.read(path.join(dir, `${name}.glb`)), tvFile = path.join(dir, `${name}.tv.glb`), doc = await io.read(tvFile);
  const sj = jointNames(srcDoc), tj = jointNames(doc);
  if (sj.length !== tj.length || sj.some((n, i) => n !== tj[i])) throw new Error(`${name}: the full and tv skins differ`);
  const s = bodyOf(srcDoc), t = bodyOf(doc);
  if (!s || !t) throw new Error(`${name}: no body primitive`);
  const r = doc.getRoot(), skin = r.listSkins()[0], mat = t.prim.getMaterial();
  const tvNode = r.listNodes().find((n) => n.getMesh() === t.mesh);
  // the source body's vertex data, copied into this document (no morph targets: the body has none on the TV)
  const buffer = r.listBuffers()[0];
  const copy = (sem) => { const a = s.prim.getAttribute(sem); return doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setNormalized(a.getNormalized()).setBuffer(buffer); };
  const makePrim = (indices) => {
    const p = doc.createPrimitive().setMaterial(mat).setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer));
    for (const sem of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) p.setAttribute(sem, copy(sem));
    return p;
  };
  // the low body, simplified again (NEW_LOW=1; by default the drawn body stays as build_people made it: people.js and
  // anatomy.js fit the sections the hands and the table checks use to the drawn body's vertices, and the new one moved
  // them enough to give 79 anatomy findings in the club, against 0)
  let count = 'kept';
  if (process.env.NEW_LOW === '1') {
    const res = simplifyBody(s.prim, sj);
    count = res.count;
    const low = makePrim(res.indices);
    t.mesh.removePrimitive(t.prim); t.prim.dispose();
    t.mesh.addPrimitive(low);
    const { compactPrimitive } = await import('@gltf-transform/functions');
    compactPrimitive(low); // (drop the vertices the low body no longer uses)
  }
  // the full body, for close-ups
  for (const n of r.listNodes()) if (n.getName() === `${name}_bodyHi`) { n.getMesh()?.dispose(); n.dispose(); }
  const hi = makePrim(s.prim.getIndices().getArray().slice());
  const hiMesh = doc.createMesh(`${name}_bodyHi`).addPrimitive(hi);
  const hiNode = doc.createNode(`${name}_bodyHi`).setMesh(hiMesh).setSkin(skin);
  (tvNode.getParentNode() || r.listScenes()[0]).addChild(hiNode);
  await doc.transform(prune());
  await io.write(tvFile, doc);
  console.log(name, 'low', JSON.stringify(count), 'hi', hi.getIndices().getCount() / 3, 'tris,', Math.round(fs.statSync(tvFile).size / 1024), 'KB');
}
