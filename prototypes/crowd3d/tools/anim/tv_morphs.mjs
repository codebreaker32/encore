// Add face shapes to the TV front models without rebuilding them (and without touching their textures):
//   node tools/anim/tv_morphs.mjs [Name ...]        (run on the build box; default: every people/<Name>.tv.glb)
// The .tv.glb head and hair primitives are the full model's, vertex for vertex (checked here), so each missing shape
// is copied from people/<Name>.glb. The list matches TV_KEEP in tools/build_people.mjs, so a full rebuild gives the
// same shapes before the merge. Added for the laugh (docs/crowd-visual-plan.md R4): eyeSquint and mouthUpperUp (a
// laugh narrows the eyes and lifts the upper lip). Run it after tools/build_people.mjs, which writes the pairs.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, sparse } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const dir = path.resolve(here, '../../people');
// The TV set: 8 shapes, the same count (and float morph texture, vertices × 16 B each in three r160) as before.
// Symmetric pairs become one shape (the sum of the left and right deltas: a blink, a squint, both cheeks, the upper
// lip); the smile keeps its two sides for smirks. people.js Face writes left/right values onto a merged shape.
const FINAL = ['eyeBlink', 'browInnerUp', 'cheekSquint', 'mouthSmileLeft', 'mouthSmileRight', 'jawOpen', 'eyeSquint', 'mouthUpperUp'];
const SUM = { eyeBlink: ['eyeBlinkLeft', 'eyeBlinkRight'], cheekSquint: ['cheekSquintLeft', 'cheekSquintRight'], eyeSquint: ['eyeSquintLeft', 'eyeSquintRight'], mouthUpperUp: ['mouthUpperUpLeft', 'mouthUpperUpRight'] };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter((f) => f.endsWith('.tv.glb')).map((f) => f.slice(0, -7));
for (const name of names) {
  const full = await io.read(path.join(dir, name + '.glb')), tv = await io.read(path.join(dir, name + '.tv.glb'));
  const fm = full.getRoot().listMeshes().find((m) => (m.getExtras().targetNames || []).length);
  const fNames = fm.getExtras().targetNames;
  const buf = tv.getRoot().listBuffers()[0];
  for (const m of tv.getRoot().listMeshes()) {
    const tNames = m.getExtras().targetNames;
    if (!tNames || !tNames.length) continue;
    for (const prim of m.listPrimitives()) {
      const mat = prim.getMaterial() && prim.getMaterial().getName();
      const fp = fm.listPrimitives().find((p) => p.getMaterial() && p.getMaterial().getName() === mat);
      if (!fp) throw new Error(`${name}: no full primitive for ${mat}`);
      const a = prim.getAttribute('POSITION').getArray(), b = fp.getAttribute('POSITION').getArray();
      if (a.length !== b.length) throw new Error(`${name} ${mat}: ${a.length / 3} vs ${b.length / 3} vertices`);
      let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
      if (d > 1e-4) throw new Error(`${name} ${mat}: vertices differ by ${d}`);
      const delta = (n) => { const i = fNames.indexOf(n); if (i < 0) throw new Error(`${name}: no shape ${n}`); return fp.listTargets()[i].getAttribute('POSITION').getArray(); };
      prim.listTargets().forEach((t) => prim.removeTarget(t));
      for (const n of FINAL) {
        const arr = new Float32Array(a.length);
        for (const part of SUM[n] || [n]) { const src = delta(part); for (let i = 0; i < arr.length; i++) arr[i] += src[i]; }
        for (let i = 0; i < arr.length; i++) if (Math.abs(arr[i]) < 2e-5) arr[i] = 0; // as build_people: sparse-friendly
        prim.addTarget(tv.createPrimitiveTarget(n).setAttribute('POSITION', tv.createAccessor().setType('VEC3').setArray(arr).setBuffer(buf)));
      }
    }
    // (gltf-transform writes extras.targetNames from the targets' own names, so each target is named above too)
    m.setExtras({ ...m.getExtras(), targetNames: FINAL });
    m.setWeights(FINAL.map(() => 0));
  }
  await tv.transform(prune({ propertyTypes: ['Accessor'], keepLeaves: true }), sparse());
  await io.write(path.join(dir, name + '.tv.glb'), tv);
  console.log(name, FINAL.length, 'shapes,', (fs.statSync(path.join(dir, name + '.tv.glb')).size / 1024).toFixed(0), 'KB');
}
