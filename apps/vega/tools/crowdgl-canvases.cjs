// SPIKE (src/crowdgl): captures the 2D canvases the crowd page paints its room textures on (venue.js canvasTex), in
// the order the page creates them, from a real run in headless Chromium. Vega has no Canvas 2D, so the native harness
// (src/crowdgl/env.js) hands three these PNGs in the same order. Also prints the page's own stats for comparison.
//   PW_DIR=~/tools/pw node apps/vega/tools/crowdgl-canvases.cjs <outDir> ['?host=1&preset=tv&venue=club&hud=0']
const fs = require('fs');
const http = require('http');
const path = require('path');

const { chromium } = require(path.join(process.env.PW_DIR || path.join(process.env.HOME, 'tools/pw'), 'node_modules/playwright'));
const root = path.resolve(__dirname, '../../../prototypes/crowd3d');
const out = path.resolve(process.argv[2] || path.join(__dirname, '../assets/crowdgl'));
const search = process.argv[3] || '?host=1&preset=tv&venue=club&hud=0';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', (e) => console.log(`page error: ${e.message}`));
    await page.addInitScript(() => {
      const made = [];
      const create = Document.prototype.createElement;
      Document.prototype.createElement = function (tag, options) {
        const el = create.call(this, tag, options);
        if (String(tag).toLowerCase() === 'canvas') made.push(el);
        return el;
      };
      window.__canvases = made;
    });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html${search}`);
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
    const list = await page.evaluate(() => window.__canvases.map((c, i) => ({ i, w: c.width, h: c.height, png: c.toDataURL('image/png') })));
    fs.mkdirSync(out, { recursive: true });
    for (const c of list) fs.writeFileSync(path.join(out, `canvas-${c.i}.png`), Buffer.from(c.png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(out, 'canvases.json'), JSON.stringify(list.map(({ i, w, h }) => ({ i, w, h }))));
    const stats = await page.evaluate(() => window.__stats);
    console.log(`captured ${list.length} canvases (${list.map((c) => `${c.w}x${c.h}`).join(', ')}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(`chromium page stats: ${JSON.stringify(stats)}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
