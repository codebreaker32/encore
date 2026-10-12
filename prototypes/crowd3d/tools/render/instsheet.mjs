// Instanced people up close, on the build box: per venue, the wide shot at 1080p (tv preset) in four states, and the
// same six instanced people (three from the near rows, three from the middle) cropped from each.
//   node instsheet.mjs <page url without query> <out dir> [venues...]
// Writes <out>/anatomy-<TAG>-instanced-<venue>.png (TAG=v2) (rows: people, columns: states).
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, outDir, ...vs] = process.argv.slice(2);
const venues = vs.length ? vs : ['club', 'theatre', 'openmic', 'arena'];
const STATES = [['listen', 'state=listen', 4], ['laugh 0.9', 'state=laugh&s=0.9', 1.6], ['applause', 'state=after', 1.0], ['dead air', 'state=murmur', 9]];
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const TW = 320, TH = 400;
const GAMMA = process.env.GAMMA || '1.5'; // (the stage look's house is dark: a lift so the arms read on the sheet; labelled)
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const v of venues) {
    let pick = null;
    const tiles = []; // [person][state]
    for (const [label, q, t] of STATES) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`${base}?venue=${v}&${q}&preset=tv&res=1080&capture=1&hud=0&shot=wide&debug=1&ab=nofront`, { timeout: 240000 });
      await page.waitForFunction(() => typeof window.__renderAt === 'function', null, { timeout: 240000 });
      await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' }); // (the broadcast overlay off)
      const people = await page.evaluate((t) => {
        for (let k = Math.max(0, t - 1); k <= t + 1e-6; k += 0.2) window.__renderAt(k);
        const T = window.__THREE, cam = window.__camera, out = [], W = innerWidth, H = innerHeight;
        const sp = (x, y, z) => { const p = new T.Vector3(x, y, z).project(cam); return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H, p.z]; };
        window.__scene.traverse((o) => {
          if (!o.name.startsWith('instances-')) return;
          const g = o.geometry, X = g.attributes.aXform.array, S = g.attributes.aShape.array;
          for (let i = 0; i < g.instanceCount; i++) {
            if (S[i * 4] === 0 && S[i * 4 + 1] === 0) continue;
            const st = /stand/.test(o.name), [, yt] = sp(X[i * 4], X[i * 4 + 1] + (st ? 1.75 : 1.45), X[i * 4 + 2]), [, yb] = sp(X[i * 4], X[i * 4 + 1] + 0.1, X[i * 4 + 2]);
            // (the middle of the body: higher for the standing types; a body cut by the frame's bottom is centred on what shows)
            let [x, y, z] = sp(X[i * 4], X[i * 4 + 1] + (st ? 1.25 : 0.85), X[i * 4 + 2]);
            if (y > H - 60 && yt < H - 120) y = Math.min(H - 60, (yt + H) / 2);
            if (z > 1 || x < 60 || x > W - 60 || y < 60 || y > H - 60) continue;
            out.push({ id: o.name + '#' + i, x, y, h: Math.abs(yb - yt) });
          }
        });
        return out;
      }, t);
      if (!pick) {
        // three of the nearest and three from the middle of the room, each well clear of the others on screen (so no
        // two rows of the sheet show the same body)
        const byH = people.slice().sort((a, b) => b.h - a.h), chosen = [];
        const clear = (p, f) => chosen.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > Math.max(90 * f, 0.75 * f * Math.max(p.h, q.h)));
        const take = (list, n, f = 1) => { let k = 0; for (const p of list) { if (k >= n) break; if (clear(p, f)) { chosen.push(p); k++; } } };
        take(byH.slice(0, Math.max(12, Math.floor(byH.length * 0.2))), 3);
        // (the middle of the room from a tier that is lit enough to judge, where there is one: the stage look leaves the
        // farthest tier as silhouettes)
        const midBand = byH.slice(Math.floor(byH.length * 0.35), Math.floor(byH.length * 0.7));
        take([...midBand.filter((p) => !/xfar/.test(p.id)), ...byH.filter((p) => !/xfar/.test(p.id)), ...midBand], 3);
        take(byH, 6 - chosen.length); // (a small room: from anywhere, and closer together if it must)
        take(byH, 6 - chosen.length, 0.6);
        pick = chosen.map((p) => p.id);
      }
      const file = `${outDir}/inst-${v}-${label.replace(/[^a-z0-9]+/gi, '_')}.png`;
      await page.screenshot({ path: file, timeout: 240000 });
      await page.close();
      pick.forEach((id, k) => {
        const p = people.find((q) => q.id === id) || { x: 960, y: 540, h: 200 };
        const ch = Math.max(90, Math.round(p.h * 1.35)), cw = Math.round(ch * 0.8);
        const cx = Math.max(0, Math.min(1920 - cw, Math.round(p.x - cw / 2))), cy = Math.max(0, Math.min(1080 - ch, Math.round(p.y - ch * 0.55)));
        const tile = `${outDir}/inst-${v}-${k}-${label.replace(/[^a-z0-9]+/gi, '_')}.png`;
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=${TW}:${TH}:flags=lanczos,eq=gamma=${GAMMA},drawtext=fontfile=${FONT}:text='${label} · gamma ${GAMMA}${label === STATES[0][0] ? ' · ' + id.replace(/^instances-/, '').replace(/[:#]/g, ' ') : ''}':fontcolor=white:fontsize=13:x=5:y=5:box=1:boxcolor=black@0.6`, tile]);
        (tiles[k] ||= []).push(tile);
      });
    }
    if (!tiles.length) { console.log('no instanced people in frame for', v); continue; }
    const inputs = [], layout = [];
    tiles.forEach((row, r) => row.forEach((t, c) => { inputs.push('-i', t); layout.push(`${c * TW}_${r * TH}`); }));
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${layout.length}:layout=${layout.join('|')}`, '-frames:v', '1', `${outDir}/anatomy-${process.env.TAG || 'v2'}-instanced-${v}.png`]);
    console.log('sheet', v, pick.join(' '));
  }
} finally { await browser.close(); }
