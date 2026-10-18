// Is a front person's hand hidden by the room's static geometry (seats, armrests, tables, their glasses and candles)
// from where the cameras stand? Stepped page, host-driven reactions (a laugh, a clap, the finale), every 0.1 s, for the
// wide camera and each close-up setup: rays from the camera to each palm's middle and four points 3 cm round it. Per
// hand and camera the visibility is a sequence (hidden at 40% of the rays or fewer, seen at 60% or more, between: as it
// was; flickersRay is the old single ray to the palm's middle, which flips on a sub-millimetre drift at a glass's
// edge); a FLICKER is a hidden spell under 0.3 s between visible ones, or two or more toggles within 0.5 s; a
// hidden spell of 0.3 s or more is a smooth OCCLUSION (real: a hand moving behind a glass and staying there). The
// arena's barrier is excepted (it hides hands below the rail by design).   node handocc.mjs <base> <venue>
//   (HITS=n: the first n hidden samples with what hid them, in the person's seat frame)
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${process.env.EXTRA || ""}`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage, null, { timeout: 240000 });
const out = await page.evaluate(({ HITS, arena, KEY, KEYT0 }) => {
  const T = window.__THREE, sc = window.__scene;
  window.__renderAt(3);
  const cams = [['wide', window.__camera.position.clone()]];
  if (window.__closes) for (const s of window.__closes().setups) cams.push([s.label, new T.Vector3(...s.pos)]);
  const statics = []; sc.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.visible && !/instances|blob|sky|haze|post|glow/i.test(o.name)) statics.push(o); });
  const rc = new T.Raycaster();
  const drive = (t) => {
    const rs = [];
    if (t > 4 && t < 9) rs.push({ id: 41, kind: 'laugh', strength: 0.9, age: t - 4, level: 0.9 * Math.min(1, (t - 4) / 0.4) * (t < 7 ? 1 : 1 - (t - 7) / 2) });
    if (t > 10 && t < 16) rs.push({ id: 42, kind: 'applause', strength: 0.85, age: t - 10, level: 0.85 * Math.min(1, (t - 10) / 0.4) * (t < 14 ? 1 : 1 - (t - 14) / 2) });
    return { attention: 0.8, warmth: 0.7, reactions: rs, finale: t > 17 ? { strength: 0.9 } : null };
  };
  const seq = new Map(), res = { samples: 0, hidden: 0, by: {}, hits: [], minDist: {} };
  for (let t = 3; t <= 22; t += 0.1) {
    window.encoreMessage({ type: 'drive', drive: drive(t) }); window.__renderAt(+t.toFixed(2));
    for (const p of window.__people) {
      if (p.kind !== 'front' || p.hidden) continue;
      const b = p.rig.b;
      for (const [k, h, tip] of [['L', b.lHand, b.lTip], ['R', b.rHand, b.rTip]]) {
        const H = new T.Vector3().setFromMatrixPosition(h.matrixWorld), P = tip ? H.clone().lerp(new T.Vector3().setFromMatrixPosition(tip.matrixWorld), 0.5) : H;
        for (const [cn, cp] of cams) {
          const d = P.clone().sub(cp), L = d.length(); res.minDist[cn] = Math.min(res.minDist[cn] ?? 99, +L.toFixed(3));
          rc.set(cp, d.normalize()); rc.far = L - 0.03;
          let hit = rc.intersectObjects(statics, false)[0];
          if (hit && arena && hit.point.z > 2.4 && hit.point.z < 2.75 && hit.point.y < 1.17) hit = null; // (the barrier: by design)
          // (and how much of the hand: the palm's middle and four points 3 cm round it, across the line of sight; a hand
          // grazing a glass's edge reads half seen, not on and off)
          let seen = hit ? 0 : 1;
          { const dir = P.clone().sub(cp).normalize(), rt = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0)).normalize(), upv = new T.Vector3().crossVectors(rt, dir).normalize();
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const Q = P.clone().addScaledVector(rt, 0.03 * ox).addScaledVector(upv, 0.03 * oy), d2 = Q.clone().sub(cp), L2 = d2.length();
              rc.set(cp, d2.normalize()); rc.far = L2 - 0.03;
              let h2 = rc.intersectObjects(statics, false)[0];
              if (h2 && arena && h2.point.z > 2.4 && h2.point.z < 2.75 && h2.point.y < 1.17) h2 = null;
              if (!h2) seen++;
            } }
          const key = `${p.name} ${k} | ${cn}`;
          if (!seq.has(key)) seq.set(key, []);
          { const hl = p.rig.seat.worldToLocal(P.clone()); seq.get(key).push([+t.toFixed(2), !!hit, p._doing || '', +hl.y.toFixed(2), +hl.z.toFixed(2), +hl.x.toFixed(2), hit ? hit.object.name + (KEY ? '#' + hit.object.id + ' f' + hit.faceIndex : '') + '@' + (KEY ? hit.point.toArray().map((v) => v.toFixed(3)).join(',') + ' d' + hit.distance.toFixed(2) + '/' + L.toFixed(2) : hit.point.y.toFixed(2)) : '', KEY ? (p._dbgA || '') + ' W ' + P.toArray().map((v) => v.toFixed(4)).join(',') + ' cam ' + cp.toArray().map((v) => v.toFixed(3)).join(',') : '']); }
          { const arr = seq.get(key); arr[arr.length - 1][8] = seen / 5; }
          res.samples++;
          if (hit) { res.hidden++; const w = hit.object.name || 'mesh'; res.by[w] = (res.by[w] || 0) + 1;
            if (res.hits.length < HITS) { const l = p.rig.seat.worldToLocal(hit.point.clone()), hl = p.rig.seat.worldToLocal(P.clone()); res.hits.push(`t=${t.toFixed(1)} ${key}: hit ${l.toArray().map((v) => v.toFixed(2))} (${w}) hand ${hl.toArray().map((v) => v.toFixed(2))} [${p._doing || ''}]`); } }
        }
      }
    }
  }
  // the verdicts per hand and camera
  let flick = 0, occl = 0; const flickBy = {}, fd = [];
  for (const [key, s] of seq) {
    const toggles = [];
    for (let i = 1; i < s.length; i++) if (s[i][1] !== s[i - 1][1]) toggles.push(s[i][0]);
    let bad = new Set();
    for (let i = 0; i < toggles.length; i++) for (let j = i + 1; j < toggles.length && toggles[j] - toggles[i] <= 0.5 + 1e-6; j++) if (j - i >= 1 && toggles[j] - toggles[i] <= 0.5) { bad.add(toggles[i]); bad.add(toggles[j]); }
    // hidden spells: [start, end) between visible samples
    for (let i = 0; i < s.length; i++) {
      if (!s[i][1] || (i > 0 && s[i - 1][1])) continue;
      let j = i; while (j < s.length && s[j][1]) j++;
      const len = (j - i) * 0.1, bounded = i > 0 && j < s.length;
      if (bounded && len < 0.3 - 1e-6) bad.add(s[i][0]); else if (len >= 0.3 - 1e-6) occl++;
    }
    if (bad.size) { const n = Math.ceil(bad.size / 2); flick += n; const cn = key.split(' | ')[1]; flickBy[cn] = (flickBy[cn] || 0) + n; if (fd.length < 400) fd.push(`${key} at t ${[...bad].slice(0, 4).join(", ")} [${s.find((x) => bad.has(x[0]))?.[2] || ""}] y ${s.map((x) => x[3]).filter((y, i) => bad.has(s[i][0])).slice(0, 3).join("/")}`); }
  }
  // the same verdicts on how much of the hand is seen (hidden at 40% or less, seen at 60% or more, between: as it was)
  let flick5 = 0, occl5 = 0; const fd5 = [];
  for (const [key, s] of seq) {
    let st = (s[0][8] ?? 1) >= 0.5; const vis = s.map((x) => { const f = x[8] ?? (x[1] ? 0 : 1); if (f <= 0.4) st = false; else if (f >= 0.6) st = true; return !st; });
    const toggles = [];
    for (let i = 1; i < s.length; i++) if (vis[i] !== vis[i - 1]) toggles.push(s[i][0]);
    const bad = new Set();
    for (let i = 0; i < toggles.length; i++) for (let j = i + 1; j < toggles.length && toggles[j] - toggles[i] <= 0.5 + 1e-6; j++) { bad.add(toggles[i]); bad.add(toggles[j]); }
    for (let i = 0; i < s.length; i++) {
      if (!vis[i] || (i > 0 && vis[i - 1])) continue;
      let j = i; while (j < s.length && vis[j]) j++;
      const len = (j - i) * 0.1, bounded = i > 0 && j < s.length;
      if (bounded && len < 0.3 - 1e-6) bad.add(s[i][0]); else if (len >= 0.3 - 1e-6) occl5++;
    }
    if (bad.size) { flick5 += Math.ceil(bad.size / 2); if (fd5.length < 200) fd5.push(`${key} at t ${[...bad].slice(0, 4).join(', ')} seen ${s.filter((x) => bad.has(x[0])).map((x) => x[8]).join('/')}`); }
  }
  const dump = KEY ? Object.fromEntries(KEY.split('||').map((k) => { const [kk, t0] = k.split('@'); return [k, (seq.get(kk) || []).filter((x) => x[0] >= +t0 && x[0] <= +t0 + 1.2)]; })) : null;
  return { dump, samples: res.samples, hidden: res.hidden, flickers: flick5, occlusions: occl5, fd: fd5, flickersRay: flick, occlusionsRay: occl, fdRay: fd, flickBy, by: res.by, hits: res.hits, minDist: Math.min(...Object.values(res.minDist)) };
}, { HITS: +(process.env.HITS || 0), arena: venue === 'arena', KEY: process.env.KEY || '', KEYT0: +(process.env.KEYT0 || 0) });
console.log(venue, JSON.stringify(out));
await browser.close();
