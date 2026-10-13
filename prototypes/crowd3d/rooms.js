// The other rooms (docs/venues-3d.md): the theatre and the open-mic pub back room. Same rules as the club: the
// camera stands where the performer stands, the light comes from the stage side, the back falls into haze, the
// light on the walls is baked into their textures and static geometry is merged by material. No readable signage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './people.js';
import { Collector, canvasTex, planks, glowPoints, glowTexture, beams, addSeats } from './venue.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const uvScale = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };

/** Wall boards (vertical timber or panelling) with light pools painted in. */
function timber(w, h, base, lights, seed, vertical = true) {
  const R = rng(seed);
  return canvasTex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const n = vertical ? 48 : 10, step = (vertical ? w : h) / n;
    for (let i = 0; i < n; i++) {
      const k = R();
      g.fillStyle = `rgba(${k > 0.5 ? 255 : 0},${k > 0.5 ? 190 : 0},${k > 0.5 ? 140 : 0},${0.02 + R() * 0.05})`;
      if (vertical) g.fillRect(i * step, 0, step, h); else g.fillRect(0, i * step, w, step);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      if (vertical) g.fillRect(i * step, 0, Math.max(1, w / 1024), h); else g.fillRect(0, i * step, w, Math.max(1, h / 256));
    }
    g.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const cx = L.u * w, cy = L.v * h, rad = L.r * h;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, `rgba(${L.c || '255,170,90'},${0.5 * L.a})`); gr.addColorStop(0.35, `rgba(${L.c || '220,110,50'},${0.22 * L.a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(cx, cy); g.scale(0.7, 1.3); g.translate(-cx, -cy);
      g.fillStyle = gr; g.fillRect(cx - rad * 2, cy - rad * 2, rad * 4, rad * 4); g.restore();
    }
  });
}

// =====================================================================================================
// Theatre: a raked auditorium seen from the stage, red seats in strict rows, two aisles with step lights, a balcony
// lip across the upper third with faces above it, dark timber side walls with dim sconces, house dark, haze.
// =====================================================================================================
const TH = { halfW: 7.6, back: 17.5, ceil: 9, stageZ: 0.6, stageH: 0.9, pitch: 0.6, aisles: [[-3.3, -2.5], [2.5, 3.3]], balconyZ: 12.4, balconyY: 4.7 };

function layoutTheatre(rowCount, balconyRows = 2) {
  const rows = [];
  const add = (r, z, y, balcony) => {
    const off = r % 2 ? TH.pitch / 2 : 0, seats = [];
    for (let x = -TH.halfW + 0.45 + off; x < TH.halfW - 0.4; x += TH.pitch) {
      if (TH.aisles.some(([a, b]) => x > a - 0.2 && x < b + 0.2)) continue;
      seats.push({ x, z, y, row: r, cabaret: false, balcony });
    }
    rows.push({ z, y, cabaret: false, balcony, seats });
  };
  for (let r = 0; r < rowCount; r++) add(r, 2.5 + r * 0.92, r * 0.3, false); // a 1:3 rake
  for (let b = 0; b < balconyRows; b++) add(rowCount + b, TH.balconyZ + 0.6 + b * 0.95, TH.balconyY + 0.05 + b * 0.38, true);
  return rows;
}

function buildTheatre(scene, rows, P, visible, depthFor = () => 1) {
  const glow = [];
  const C0 = new Collector();
  const W = TH.halfW, B = TH.back, C = TH.ceil;
  const big = P.tex === 'large';
  const main = rows.filter((r) => !r.balcony), balc = rows.filter((r) => r.balcony);
  const lastY = main.length ? main[main.length - 1].y : 0, lastZ = main.length ? main[main.length - 1].z : 3;
  // floor: carpeted rake, one riser per row, then a flat platform under the balcony
  const carpet = planks(big ? 1024 : 512, big ? 1024 : 512, '#2a0e10', 13, 40);
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  C0.add('floor', uvScale(new THREE.PlaneGeometry(W * 2, 3).rotateX(-Math.PI / 2).translate(0, 0, 1.5 + TH.stageZ), 4, 1), 0x6a4a44, { ao: 0, keepUv: true });
  for (const r of main) if (r.y > 0) C0.add('floor', uvScale(box(W * 2, r.y, 0.92, 0, r.y / 2, r.z - 0.05), 4, 0.4), 0x5a3a36, { ao: 0.4, keepUv: true });
  C0.add('floor', uvScale(box(W * 2, lastY + 0.3, B - lastZ - 0.4, 0, (lastY + 0.3) / 2, (lastZ + 0.4 + B) / 2), 4, 2), 0x4a3430, { ao: 0, keepUv: true });
  // stage (the lip is the bottom edge of the wide)
  C0.add('floor', uvScale(box(W * 2, TH.stageH, 5, 0, TH.stageH / 2, TH.stageZ - 2.5), 3, 2), 0x6a5040, { ao: 0.5, keepUv: true });
  C0.add('basic', new THREE.PlaneGeometry(W * 2, 0.035).rotateX(-Math.PI / 2).translate(0, TH.stageH + 0.003, TH.stageZ - 0.05), 0x5a544a, { ao: 0 });
  const floorMesh = C0.build(scene, 'floor', new THREE.MeshLambertMaterial({ map: carpet, vertexColors: true }), 'floor');
  floorMesh.material.map.repeat.set(1, 1);
  // aisle step lights
  for (const r of main) for (const [a, b] of TH.aisles) for (const x of [a + 0.1, b - 0.1]) glow.push({ x, y: r.y - 0.06, z: r.z - 0.5, c: [1.0, 0.6, 0.3], s: 0.05 });
  // side walls and back wall: dark timber, sconces at a fifth of their brightness
  const sconceZ = [3, 6.5, 10, 14];
  const TW = big ? 2048 : 1024, TH2 = big ? 512 : 256;
  const wallTex = timber(TW, TH2 * 3, '#1a100c', [], 31, true);
  const sides = [-1, 1].map((s, k) => {
    const g = new THREE.PlaneGeometry(B, C).rotateY(-s * Math.PI / 2).translate(s * W, C / 2, B / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (k + uv.getY(i)) / 3);
    return g;
  });
  const backG = new THREE.PlaneGeometry(W * 2, C).rotateY(Math.PI).translate(0, C / 2, B);
  { const uv = backG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (2 + uv.getY(i)) / 3); }
  const walls = new THREE.Mesh(mergeGeometries([...sides, backG]), new THREE.MeshBasicMaterial({ map: wallTex, color: 0x6c5a4e }));
  walls.name = 'walls';
  scene.add(walls);
  for (const s of [-1, 1]) for (const z of sconceZ) {
    glow.push({ x: s * (W - 0.08), y: 2.6 + z * 0.15, z, c: [0.5, 0.3, 0.15], s: 0.45 });
    glow.push({ x: s * (W - 0.1), y: 2.6 + z * 0.15, z, c: [0.6, 0.45, 0.3], s: 0.1 });
  }
  // exit lights: plain green boxes, no lettering
  for (const [x, y, z, ry] of [[-W + 0.03, 2.4, 1.6, Math.PI / 2], [W - 0.03, 2.4, 1.6, -Math.PI / 2], [-4.8, lastY + 2.4, B - 0.03, Math.PI], [4.8, lastY + 2.4, B - 0.03, Math.PI]]) {
    C0.add('basic', new THREE.PlaneGeometry(0.36, 0.16).rotateY(ry).translate(x, y, z), 0x2a8a3a, { ao: 0 });
    glow.push({ x, y, z, c: [0.12, 0.5, 0.18], s: 0.7 });
  }
  // balcony: the lip crosses the upper third; its front carries four lights aimed at the stage
  const BZ = TH.balconyZ, BY = TH.balconyY;
  C0.add('lambert', box(W * 2, 0.75, 0.3, 0, BY - 0.15, BZ), 0x2a1a14, { ao: 0.3 });
  C0.add('lambert', box(W * 2, 0.25, B - BZ, 0, BY - 0.45, (BZ + B) / 2), 0x140c0a, { ao: 0 });
  C0.add('basic', box(W * 2, 0.02, 0.02, 0, BY + 0.23, BZ - 0.16), 0x6a4020, { ao: 0 });
  for (const r of balc) C0.add('lambert', box(W * 2, 0.38, 0.95, 0, r.y - 0.19, r.z - 0.05), 0x1c1210, { ao: 0.3 });
  const stagePoint = new THREE.Vector3(0.2, 1.8, -1.5);
  // hung on short pipes below the balcony front, so the wide keeps them below the caption band
  const lamps = [-4.5, -1.5, 1.5, 4.5].map((x) => new THREE.Vector3(x, BY - 1.55, BZ - 0.2));
  for (const p of lamps) C0.add('lambert', box(0.03, 1.0, 0.03, p.x, BY - 1.0, BZ - 0.2), 0x161414, { ao: 0 });
  for (const p of lamps) {
    const dir = stagePoint.clone().sub(p).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    C0.add('lambert', new THREE.CylinderGeometry(0.09, 0.11, 0.3, 10).applyQuaternion(q).translate(p.x, p.y, p.z), 0x161414, { ao: 0 });
    const lens = p.clone().addScaledVector(dir, 0.158);
    const halo = lens.clone().addScaledVector(dir, P.lampFix ? 0.08 : 0); // (&ab=lampfix: see venue.js)
    C0.add('basic', new THREE.CircleGeometry(0.115, 16).applyQuaternion(q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))).translate(lens.x, lens.y, lens.z), 0xffe2b8, { ao: 0 });
    glow.push({ x: halo.x, y: halo.y, z: halo.z, c: [0.9, 0.62, 0.34], s: 1.0 });
    glow.push({ x: halo.x, y: halo.y, z: halo.z, c: [1.0, 0.9, 0.7], s: 0.45 });
    glow.push({ x: halo.x, y: halo.y, z: halo.z, c: [0.12, 0.083, 0.045], s: 2.5 }); // glare: a lamp facing the lens
  }
  // haze under the balcony, just behind the last row's heads
  for (const x of [-4.5, -1.5, 1.5, 4.5]) glow.push({ x, y: lastY + 1.5, z: lastZ + 0.8, c: [0.12, 0.1, 0.09], s: 3.4 });
  scene.add(beams(lamps.map((p) => ({ from: p.clone().addScaledVector(stagePoint.clone().sub(p).normalize(), 0.16), to: stagePoint.clone().add(new THREE.Vector3(p.x * 0.1, -1.2, 0)), r0: 0.08, r1: 1.1 }))));
  C0.add('lambert', new THREE.PlaneGeometry(W * 2, B + 4).rotateX(Math.PI / 2).translate(0, C, B / 2 - 2), 0x0a0707, { ao: 0 });
  // seats: theatre seats in every visible place (balcony too)
  addSeats(scene, C0, rows.flatMap((r) => r.seats).filter(visible), (st) => (st.row >= 2 ? 'theatreLite' : 'theatre'), depthFor);
  C0.build(scene, 'lambert', new THREE.MeshLambertMaterial({ vertexColors: true }), 'room');
  C0.build(scene, 'basic', new THREE.MeshBasicMaterial({ vertexColors: true }), 'room-emissive');
  const points = glowPoints(glow, glowTexture());
  scene.add(points);
  return { points, tables: [], walls };
}

export const THEATRE = {
  id: 'theatre', title: 'The Playhouse · <em>Theatre</em>', frontRows: 3, layout: layoutTheatre, build: buildTheatre, seatH: 0.45, room: TH,
  previewKey: 0.8, previewWiden: 2.6, // (the stage key while the room fills, the bill: stronger and wider)
  closeDimEmissive: 0.25, // (the stage lip's unlit strip crossed the side angles as a bright diagonal line)
  performer: [0.3, 2.55, -1.6],
  cast: ['Female_Adult_04', 'Male_Adult_07', 'Female_Adult_03', 'Male_Adult_12', 'Female_Adult_17', 'Male_Adult_17'], // (not F13 beside F04: two near-identical blondes in the front row)
  cam: { pos: [0.8, 2.85, -3.0], look: [-0.2, 0.5, 10], mm: 32 },
  depthSlope: 0.2, // the key hangs high over the stage, so distance alone darkens the rake less than in the club
  wallHouse: 20, // dark timber: the house lights have to lift it a long way to read
  fog: { color: 0x07080b, wide: [4, 28], close: [2.6, 6.0], heckler: [2.6, 6.0] },
  exposure: { wide: 1, close: 0.9, heckler: 0.9 },
  grade: { wb: [1, 1, 1.02], sat: 0.85, lift: [0, 0, 0] },
  emptyShare: 0.06, // a few empty seats through the back rows
  closeDimRoom: true, // the raked seats behind the front row would fill a close-up with red
  light: {
    hemi: 0.22, sky: 0x2a3040, ground: 0x120a08, hemiHouse: 3.6, // (the house lights: the bill's room came out darkest of the four, 0.047 mean luma)
    key: { pos: [-2.8, 6.0, -1.0], target: [0.5, 0.6, 3.6], intensity: 380, angle: 0.8, penumbra: 1, decay: 2 },
    rim: { dir: [0, 0.21, 0.98], color: 0xd8e0ff, k: 0.8 }, fill: { dir: [0, -0.3, -0.95], color: 0xffc8a8, k: 0.45, house: 3 },
  },
  spread: 0.07, attention: 0.78, standing: [],
  // arrivals and departures: the doors at the front corners, along the front, up an aisle, along the row
  traffic: { aisles: [-2.9, 2.9], door: (st) => ({ x: st.x < 0 ? -7.2 : 7.2, z: 1.6 }), via: 1.6, lane: (st) => st.z - 0.38 },
  presets: {
    // (rows 0-1 stay on sil: lod, even in close-ups only, costs the two long front rows 70k triangles)
    tv: { rows: 7, balcony: 2, front: 6, inst: [{ from: 0, to: 1, level: 'sil', types: 6 }, { from: 2, to: 99, level: 'xfar', types: 6 }] },
    low: { rows: 9, balcony: 2, front: 8, midRows: 3, inst: [{ from: 3, to: 4, level: 'far', types: 4 }, { from: 5, to: 99, level: 'xfar', types: 5 }] },
    high: { rows: 12, balcony: 3, front: 20, midRows: 5, inst: [{ from: 5, to: 99, level: 'far', types: 8 }] },
  },
};

// =====================================================================================================
// Open mic: a pub back room. Low ceiling with one beam and a string of bare bulbs, panelling to shoulder height and
// yellowed plaster above, a bar hatch glowing on the left wall, a green exit light at the back. Mismatched wooden
// chairs in three loose arcs with a couple of gaps, four people standing at the back by the bar.
// =====================================================================================================
const OM = { halfW: 3.2, back: 9.6, ceil: 2.7, stageZ: -0.6, stageH: 0.2 };
const OM_PERF = [0.2, 1.85, -1.3];

function layoutOpenMic() {
  const R = rng(404);
  const rows = [];
  const [px, , pz] = OM_PERF;
  const arcs = [{ r: 3.0, n: 9, span: 1.15 }, { r: 4.15, n: 10, span: 1.0 }, { r: 5.3, n: 11, span: 0.9 }];
  arcs.forEach((a, k) => {
    const seats = [];
    for (let i = 0; i < a.n; i++) {
      if ((k === 1 && i === 7) || (k === 2 && i === 2)) continue; // a Tuesday: two empty chairs
      const ang = -a.span / 2 + (a.span * i) / (a.n - 1) + (R() - 0.5) * 0.05;
      const rr = a.r + (R() - 0.5) * 0.14;
      const x = px + Math.sin(ang) * rr, z = pz + Math.cos(ang) * rr;
      if (Math.abs(x) > OM.halfW - 0.35) continue;
      seats.push({ x, z, y: 0, row: k, cabaret: false, yaw: Math.atan2(px - x, pz - z) + (R() - 0.5) * 0.35 });
    }
    rows.push({ z: pz + a.r, y: 0, cabaret: false, seats });
  });
  return rows;
}

function buildOpenMic(scene, rows, P, visible, depthFor = () => 1) {
  const glow = [];
  const C0 = new Collector();
  const W = OM.halfW, B = OM.back, C = OM.ceil;
  const big = P.tex === 'large';
  // floor: worn boards; the performer's riser
  const boards = planks(big ? 1024 : 512, big ? 1024 : 512, '#2e1e12', 17, 16);
  boards.wrapS = boards.wrapT = THREE.RepeatWrapping;
  C0.add('floor', uvScale(new THREE.PlaneGeometry(W * 2, B + 2).rotateX(-Math.PI / 2).translate(0, 0, B / 2 - 1), 3, 5), 0x9a7a60, { ao: 0, keepUv: true });
  C0.add('floor', uvScale(box(2.6, OM.stageH, 2.2, 0.2, OM.stageH / 2, OM.stageZ - 1.1), 1, 1), 0x5a4030, { ao: 0.4, keepUv: true });
  C0.build(scene, 'floor', new THREE.MeshLambertMaterial({ map: boards, vertexColors: true }), 'floor');
  // walls: panelling to 1.2 m, yellowed plaster above, light pools from the bulbs and the bar baked in
  const TW = big ? 2048 : 1024, TH2 = big ? 512 : 256;
  const bulbsX = [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4];
  const beamZ = 4.2;
  const wallTex = canvasTex(TW, TH2 * 3, (g) => {
    const R = rng(55);
    for (let k = 0; k < 3; k++) {
      const Y = k * TH2;
      g.fillStyle = '#8a7438'; g.fillRect(0, Y, TW, TH2); // nicotine plaster
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${R() > 0.5 ? '60,40,10' : '200,170,90'},${R() * 0.08})`; const r = 10 + R() * 60; g.beginPath(); g.arc(R() * TW, Y + R() * TH2 * 0.6, r, 0, 6.28); g.fill(); }
      const panelTop = Y + TH2 * (1 - 1.2 / C);
      g.fillStyle = '#2a1a10'; g.fillRect(0, panelTop, TW, Y + TH2 - panelTop); // panelling
      for (let x = 0; x < TW; x += TW / 24) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, panelTop, 2, Y + TH2 - panelTop); }
      g.fillStyle = '#3a2614'; g.fillRect(0, panelTop - 6, TW, 8); // dado rail
      // soot near the ceiling and warm pools
      let gr = g.createLinearGradient(0, Y, 0, Y + TH2 * 0.5); gr.addColorStop(0, 'rgba(20,12,4,0.6)'); gr.addColorStop(1, 'rgba(20,12,4,0)');
      g.fillStyle = gr; g.fillRect(0, Y, TW, TH2 * 0.5);
      g.globalCompositeOperation = 'lighter';
      const pools = k === 2 ? bulbsX.map((x) => ({ u: (x + W) / (W * 2), v: 0.12, r: 0.6, a: 0.5 })) : [{ u: k === 0 ? 1 - beamZ / B : beamZ / B, v: 0.1, r: 0.8, a: 0.6 }, ...(k === 1 ? [] : [{ u: 1 - 7.5 / B, v: 0.45, r: 0.9, a: 0.9 }])];
      for (const L of pools) {
        const cx = L.u * TW, cy = Y + L.v * TH2, rad = L.r * TH2;
        gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        gr.addColorStop(0, `rgba(255,180,90,${0.45 * L.a})`); gr.addColorStop(0.4, `rgba(200,120,50,${0.2 * L.a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      }
      g.globalCompositeOperation = 'source-over';
    }
  });
  const region = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (2 - k + uv.getY(i)) / 3); return g; };
  // canvas rows from the top: 0 = +X wall (screen left), 1 = -X wall, 2 = back wall
  const wallG = mergeGeometries([
    region(new THREE.PlaneGeometry(B + 2, C).rotateY(-Math.PI / 2).translate(W, C / 2, B / 2 - 1), 0),
    region(new THREE.PlaneGeometry(B + 2, C).rotateY(Math.PI / 2).translate(-W, C / 2, B / 2 - 1), 1),
    region(new THREE.PlaneGeometry(W * 2, C).rotateY(Math.PI).translate(0, C / 2, B), 2),
  ]);
  const walls = new THREE.Mesh(wallG, new THREE.MeshBasicMaterial({ map: wallTex, color: 0x6c6156 }));
  walls.name = 'walls';
  scene.add(walls);
  C0.add('lambert', new THREE.PlaneGeometry(W * 2, B + 2).rotateX(Math.PI / 2).translate(0, C, B / 2 - 1), 0x2a2218, { ao: 0 });
  // the beam and its string of bare bulbs
  C0.add('lambert', box(W * 2, 0.22, 0.2, 0, C - 0.11, beamZ), 0x2a1a0e, { ao: 0 });
  for (const x of bulbsX) {
    C0.add('basic', new THREE.SphereGeometry(0.03, 8, 6).translate(x, C - 0.38, beamZ), 0xffe0a0, { ao: 0 });
    glow.push({ x, y: C - 0.38, z: beamZ, c: [1.0, 0.7, 0.35], s: 0.5 });
    glow.push({ x, y: C - 0.38, z: beamZ, c: [1.0, 0.96, 0.9], s: 0.16 }); // the filament: the brightest thing in the room
  }
  // the bar hatch on the left wall (+X is screen left from the stage), glowing warm, with a shelf
  C0.add('basic', new THREE.PlaneGeometry(2.0, 0.9, 1, 4).rotateY(-Math.PI / 2).translate(W - 0.02, 1.55, 7.6), 0x7a4618, { ao: 0.5 });
  C0.add('lambert', box(0.35, 0.06, 2.2, W - 0.18, 1.08, 7.6), 0x3a2414, { ao: 0 });
  glow.push({ x: W - 0.3, y: 1.55, z: 7.6, c: [0.6, 0.32, 0.12], s: 2.2 });
  // a green exit light over the back door, no lettering
  C0.add('basic', new THREE.PlaneGeometry(0.36, 0.16).rotateY(Math.PI).translate(-2.0, 2.25, B - 0.02), 0x2a8a3a, { ao: 0 });
  glow.push({ x: -2.0, y: 2.25, z: B - 0.05, c: [0.12, 0.5, 0.18], s: 0.7 });
  // the clip-on spot over the performer
  C0.add('lambert', new THREE.CylinderGeometry(0.06, 0.08, 0.18, 10).rotateX(-0.9).translate(0.2, C - 0.15, -0.9), 0x111111, { ao: 0 });
  // chairs
  addSeats(scene, C0, rows.flatMap((r) => r.seats).filter(visible), () => 'pub', depthFor);
  C0.build(scene, 'lambert', new THREE.MeshLambertMaterial({ vertexColors: true }), 'room');
  C0.build(scene, 'basic', new THREE.MeshBasicMaterial({ vertexColors: true }), 'room-emissive');
  const points = glowPoints(glow, glowTexture());
  scene.add(points);
  return { points, tables: [], walls };
}

export const OPENMIC = {
  id: 'openmic', title: 'The Back Room · <em>Open Mic</em>', frontRows: 3, layout: layoutOpenMic, build: buildOpenMic, seatH: 0.45, room: OM,
  performer: OM_PERF,
  cast: ['Female_Adult_17', 'Male_Adult_04', 'Female_Adult_13', 'Male_Adult_12', 'Female_Adult_12', 'Male_Adult_06'],
  cam: { pos: [0.7, 2.05, -2.6], look: [-0.8, 0.95, 7], mm: 28 }, // 0.5 m house right, aimed 1 m house left
  drift: 2, // a handheld feel in the pub
  fog: { color: 0x120d08, wide: [3, 16], close: [2.6, 6.5], heckler: [2.6, 6.5] },
  exposure: { wide: 0.8, close: 0.92, heckler: 0.92 },
  grade: { wb: [1.02, 1, 0.92], sat: 0.9, lift: [0.002, 0.005, 0.004] },
  // pubs don't black out: house lights half up, warm from the bulbs, with the clip-on spot as the key
  light: {
    hemi: 0.35, sky: 0xffc890, ground: 0x2a1a10,
    key: { pos: [0.2, 2.5, -0.9], target: [0, 0.6, 3.0], intensity: 90, angle: 1.0, penumbra: 1, decay: 2, color: 0xffbf80 },
    rim: { dir: [0, 0.43, 0.9], color: 0xffc080, k: 0.7 }, fill: { dir: [0, 1, 0.1], color: 0xffd0a0, k: 1.6, house: 2 },
    bar: { pos: [2.6, 1.7, 7.4], color: 0xff9a50, intensity: 4, distance: 6 },
  },
  spread: 0.14, attention: 0.55,
  tone: { id: 'room-tone-club', gain: 0.24 },
  traffic: { aisles: [], noAisle: true, door: { x: -2.0, z: 9.3 }, lane: (st) => st.z + 0.55, yAt: () => 0 },
  standing: [{ x: 2.3, z: 7.0 }, { x: 2.4, z: 8.1 }, { x: 1.6, z: 7.6 }, { x: 1.5, z: 8.7 }],
  presets: {
    // one sil band from row 0, six types from the non-front pool (row 0 used to be lod: 2.5k triangles a person)
    // (the small room puts its instanced people close: the near arcs on the next level up, whose limbs hold their shape)
    tv: { rows: 3, front: 6, inst: [{ from: 0, to: 1, level: 'lod', types: 4 }, { from: 2, to: 99, level: 'sil', types: 6 }] },
    low: { rows: 3, front: 10, midRows: 3, inst: [] },
    high: { rows: 3, front: 30, midRows: 3, inst: [] },
  },
};
