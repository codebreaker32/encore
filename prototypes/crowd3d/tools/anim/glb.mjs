// Minimal GLB reader (no deps): JSON + binary chunk, accessor reads.
import fs from 'node:fs';
export function readGlb(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl;
  const bl = b.readUInt32LE(bo);
  const bin = b.subarray(bo + 8, bo + 8 + bl);
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const n = N[a.type], off = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (a.componentType !== 5126) throw new Error('non-float accessor ' + a.componentType);
    const stride = v.byteStride || n * 4;
    const out = new Float32Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin.readFloatLE(off + k * stride + c * 4);
    return { data: out, n, count: a.count };
  };
  return { json, acc };
}
