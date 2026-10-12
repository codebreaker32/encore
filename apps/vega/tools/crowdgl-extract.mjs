// SPIKE (src/crowdgl): writes every image embedded in the packed people GLBs to its own file, named by the FNV-1a hash
// and length of its bytes (src/crowdgl/env.js `fingerprint`), so expo-gl can decode it from a file:// localUri. React
// Native can't make a Blob from bytes, which is how GLTFLoader loads embedded images in a browser.
//   node apps/vega/tools/crowdgl-extract.mjs <peopleDir> <outDir>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [peopleDir, outDir] = process.argv.slice(2);
if (!peopleDir || !outDir) throw new Error('usage: crowdgl-extract.mjs <peopleDir> <outDir>');

function fingerprint(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, '0')}-${bytes.length}`;
}

mkdirSync(outDir, { recursive: true });
let n = 0;
let bytesOut = 0;
for (const f of readdirSync(peopleDir).filter((x) => x.endsWith('.glb'))) {
  const b = readFileSync(join(peopleDir, f));
  if (b.toString('ascii', 0, 4) !== 'glTF') continue;
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  for (const img of json.images || []) {
    if (img.bufferView === undefined) continue;
    const bv = json.bufferViews[img.bufferView];
    const bytes = new Uint8Array(b.buffer, b.byteOffset + binStart + (bv.byteOffset || 0), bv.byteLength);
    const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
    writeFileSync(join(outDir, `${fingerprint(bytes)}.${ext}`), bytes);
    n++;
    bytesOut += bytes.length;
  }
}
console.log(`extracted ${n} embedded images (${(bytesOut / 1e6).toFixed(1)} MB) to ${outDir}`);
