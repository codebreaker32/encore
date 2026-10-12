// Packs the crowd page to ship inside the TV apps, where it is opened from file:// (Android:
// file:///android_asset/crowd/index.html, Vega: file:///pkg/assets/crowd/index.html):
//   node tools/pack.mjs [outDir=dist]
// Chromium refuses ES-module scripts and fetch() on file://, so the page becomes one classic script (three.js
// included), and fetch() of relative files falls back to XMLHttpRequest (the Android WebView needs
// allowFileAccessFromFileURLs). Textures load through <img>, which file:// allows. Served over http the packed page
// behaves exactly like the source page.
import { build } from '../../../services/relay/node_modules/esbuild/lib/main.js';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The output folder is relative to the current directory, like any CLI; without one, dist/ next to the page.
// --tv ships only what ?preset=tv loads (the .tv front models, the crowd levels, the 1K atlas): about a third of the size
const TV_ONLY = process.argv.includes('--tv');
const outArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const out = outArg ? resolve(process.cwd(), outArg) : join(root, 'dist');
const vendor = join(root, 'vendor/three');

const FETCH_SHIM = `(function () {
  if (location.protocol !== 'file:' || typeof XMLHttpRequest === 'undefined') return;
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (/^(https?:|data:|blob:)/.test(url) && nativeFetch) return nativeFetch(input, init);
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'arraybuffer';
      x.onload = function () {
        if (x.status === 0 || (x.status >= 200 && x.status < 300)) resolve(new Response(x.response, { status: 200 }));
        else reject(new TypeError('XHR ' + x.status + ' ' + url));
      };
      x.onerror = function () { reject(new TypeError('XHR failed for ' + url)); };
      x.send();
    });
  };
})();`;

const three = {
  name: 'three-vendor',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: join(vendor, 'build/three.module.min.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: join(vendor, 'examples/jsm', a.path.slice('three/addons/'.length)) }));
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const result = await build({
  entryPoints: [join(root, 'crowd.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  outfile: join(out, 'crowd.bundle.js'),
  banner: { js: FETCH_SHIM },
  plugins: [three],
  metafile: true,
  logLevel: 'warning',
});

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/<script type="module" src="crowd\.js"><\/script>/, '<script src="crowd.bundle.js"></script>');
if (!html.includes('crowd.bundle.js')) throw new Error('index.html: the module script tag was not found');
writeFileSync(join(out, 'index.html'), html);

const tvFile = (f) => !/^[A-Z][a-z]+_Adult_\d+\.glb$/.test(f) && f !== 'lod_atlas.jpg' && f !== 'lod_alpha.png';
// (anim/: the motion clips, when the folder exists)
for (const dir of ['people', 'overlay', 'sounds', 'anim'].filter((d) => existsSync(join(root, d)))) cpSync(join(root, dir), join(out, dir), { recursive: true, filter: (p) => !TV_ONLY || dir !== 'people' || statSync(p).isDirectory() || tvFile(p.split('/').pop()) });

const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : statSync(p).size);
const js = Object.values(result.metafile.outputs)[0].bytes;
console.log(`packed ${out}: crowd.bundle.js ${(js / 1e6).toFixed(2)} MB, total ${(size(out) / 1e6).toFixed(1)} MB`);
