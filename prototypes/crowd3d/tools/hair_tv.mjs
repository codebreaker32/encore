// Resizes the hair (opacity) texture inside each people/*.tv.glb in place, for the TV's 30 MB texture cap (build k):
// 512² → 384² by default. The colour is already dilated into the transparent texels (textures.py opacity_tv), so the
// colour and the alpha are resized apart (no premultiplying, which would bring the black fringe back), and the alpha is
// scaled so the share of texels passing the 0.5 cut stays what it was at the larger size.
//   node tools/hair_tv.mjs [size=384]        (on the box: needs sharp and @gltf-transform/core)
import { NodeIO, VertexLayout } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';
const { default: sharp } = await import('sharp');
const here = path.dirname(new URL(import.meta.url).pathname), dir = path.join(here, '..', 'people');
const SIZE = +(process.argv[2] || 384), io = new NodeIO().setVertexLayout(VertexLayout.SEPARATE); // (as build_people writes them)
const share = (a, m) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] * m >= 127.5) n++; return n / a.length; };
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.tv.glb'))) {
  const doc = await io.read(path.join(dir, f));
  let done = 0;
  for (const mat of doc.getRoot().listMaterials()) {
    if (!/opacity/.test(mat.getName() || '')) continue;
    const tex = mat.getBaseColorTexture();
    if (!tex) continue;
    const src = sharp(Buffer.from(tex.getImage()));
    const { width } = await src.metadata();
    if (width <= SIZE) continue;
    const raw = await src.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = raw.info, px = raw.data;
    const rgb = Buffer.alloc(w * h * 3), al = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) { rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2]; al[i] = px[i * 4 + 3]; }
    const ref = share(al, 1);
    const rgbS = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).resize(SIZE, SIZE, { kernel: 'lanczos3' }).raw().toBuffer();
    const alS = await sharp(al, { raw: { width: w, height: h, channels: 1 } }).resize(SIZE, SIZE, { kernel: 'lanczos3' }).raw().toBuffer();
    let lo = 1, hi = 3;
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (share(alS, m) < ref) lo = m; else hi = m; }
    const out = Buffer.alloc(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) { out[i * 4] = rgbS[i * 3]; out[i * 4 + 1] = rgbS[i * 3 + 1]; out[i * 4 + 2] = rgbS[i * 3 + 2]; out[i * 4 + 3] = Math.min(255, Math.round(alS[i] * hi)); }
    tex.setImage(await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()).setMimeType('image/png');
    done++;
  }
  if (done) { await io.write(path.join(dir, f), doc); console.log(f, `hair → ${SIZE}²`, Math.round(fs.statSync(path.join(dir, f)).size / 1024), 'KB'); }
}
