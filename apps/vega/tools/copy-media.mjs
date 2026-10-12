// Copies shared-ui's clips and sounds into apps/vega/assets/raw/media/{clips,sounds}/ before a Vega build, where the
// package keeps them at /pkg/assets/raw/media/… for w3cmedia (see tools/babel-plugin-raw-media.js). Generated: gitignored.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(app, '../../packages/shared-ui/src/assets');
const out = join(app, 'assets/raw/media');
rmSync(out, { recursive: true, force: true });
let n = 0;
for (const [dir, ext] of [['clips', '.mp4'], ['sounds', '.mp3']]) {
  mkdirSync(join(out, dir), { recursive: true });
  for (const f of readdirSync(join(assets, dir)).filter((x) => x.endsWith(ext))) {
    copyFileSync(join(assets, dir, f), join(out, dir, f));
    n++;
  }
}
console.log(`copy-media: ${n} files to assets/raw/media`);
