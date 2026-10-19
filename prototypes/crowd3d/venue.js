// The Basement: a small comedy club built in code. Stage lip and mic in the foreground (the performer's view),
// cabaret tables with drinks and candles at the front, raked rows of red seats with an aisle, brick walls with
// warm sconces, a bar glow at the back, a low ceiling with a lighting truss, and haze.
// Light on the walls is baked into their texture; furniture carries a baked height-based occlusion in its vertex
// colours. Static geometry is merged by material, so the whole room is about eight draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './people.js';

export const ROOM = { halfW: 5.2, back: 12.6, ceil: 3.55, stageZ: 0.5, stageH: 0.45 };
export const AISLE = [-2.95, -1.95]; // x range of the aisle
const PITCH = 0.62; // seat spacing along a row
export const PERFORMER_XZ = [0.28, -1.75]; // set per venue (setPerformer) before seats are laid out
export function setPerformer(x, z) { PERFORMER_XZ[0] = x; PERFORMER_XZ[1] = z; }

/** Seat yaw: rows face the stage, turned a little towards the performer so the rows stay orderly. */
export function seatYaw(s) {
  if (s.yaw !== undefined) return s.yaw;
  let d = Math.atan2(PERFORMER_XZ[0] - s.x, PERFORMER_XZ[1] - s.z) - Math.PI;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.PI + d * 0.45;
}

/**
 * Rows: the club seated at two-tops all the way back (the TV's "choir riser" finding: raked rows of upright people
 * square to the lens read as a choir). The first three rows on the floor, the rest on low risers (20 cm a step);
 * tables 1.35 m apart, each row staggered by half a table, so heads sit at different heights and depths rather than
 * in ranks. Each pair turns 13-22 degrees towards each other on top of the room's turn towards the performer. At most
 * seven rows, 1.4 m apart (the walkway behind a chair clears the next row's table).
 */
const TABLE_GAP = 1.35;
export function layoutSeats(rowCount) {
  const rows = [], R = rng(31);
  for (let r = 0; r < Math.min(rowCount, 7); r++) {
    const z = 1.95 + r * 1.4, y = r < 3 ? 0 : (r - 2) * 0.2;
    const seats = [];
    // the tables fill the floor on each side of the aisle (each pair 0.55 m clear of a wall or the aisle's edge)
    const centres = [];
    for (const [a, b] of [[-ROOM.halfW, AISLE[0]], [AISLE[1], ROOM.halfW]]) for (let cx = a + 0.6 + (r % 2 ? TABLE_GAP / 2 : 0); cx + 0.55 <= b; cx += TABLE_GAP) centres.push(cx);
    for (const cx of centres) {
      const turn = 0.22 + R() * 0.16;
      for (const side of [-1, 1]) {
        const st = { x: cx + side * 0.31, z: z + (R() - 0.5) * 0.08, y, row: r, cabaret: true };
        st.yaw = seatYaw(st) + side * turn; // the left seat turns towards +x (its tablemate), the right one towards -x
        seats.push(st);
      }
    }
    rows.push({ z, y, cabaret: true, seats });
  }
  return rows;
}

// (an 80 cm bistro top, from 62, 0.40 in front of the pair, from 0.47: room on it for both sitters' hands, planted on
// their own halves clear of the glasses and the candle, and both sitters' knees under it; people.js and anatomy.js
// read them. Motion agent: tools/render/handocc.mjs, tablegeo.mjs)
export const TABLE_R = 0.4, TABLE_D = 0.4;
/** The cabaret rows' two-tops: consecutive pairs of seats sharing a table in front of them. */
export function cabaretTables(rows) {
  const tables = [];
  for (const r of rows.filter((x) => x.cabaret)) for (let i = 0; i + 1 < r.seats.length; i += 2) {
    const a = r.seats[i], b = r.seats[i + 1];
    if (Math.abs(a.x - b.x) > PITCH * 1.5) { i--; continue; }
    // (TABLE_D in front of the pair, between them; each seat keeps its table as twoTop, which the people's hands, legs
    // and the anatomy checks use)
    const t = { x: (a.x + b.x) / 2, z: r.z - TABLE_D, y: r.y || 0, seats: [a, b] };
    a.twoTop = b.twoTop = t;
    tables.push(t);
  }
  return tables;
}

// ---------- textures (canvas) ----------
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Brick courses with the light of the sconces painted in. lights: [{u, v, r, a}] in 0..1 of the region. */
export function drawBrick(g, X, Y, w, h, metres, lights, seed) {
  const R = rng(seed);
  g.save();
  g.beginPath(); g.rect(X, Y, w, h); g.clip();
  g.fillStyle = '#1b1210'; g.fillRect(X, Y, w, h);
  const bw = w / (metres / 0.23), bh = bw * 0.33;
  const m = Math.max(1, bw * 0.06);
  for (let row = 0, y = Y; y < Y + h; row++, y += bh) {
    for (let x = X + (row % 2 ? -bw / 2 : 0); x < X + w; x += bw) {
      const k = R();
      g.fillStyle = `rgb(${(70 + k * 45 + R() * 12) | 0},${(30 + k * 18 + R() * 8) | 0},${(24 + k * 12) | 0})`;
      g.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
      if (R() < 0.18) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m); }
    }
  }
  let gr = g.createLinearGradient(0, Y, 0, Y + h);
  gr.addColorStop(0, 'rgba(5,3,3,0.85)'); gr.addColorStop(0.35, 'rgba(5,3,3,0.35)'); gr.addColorStop(0.8, 'rgba(5,3,3,0.2)'); gr.addColorStop(1, 'rgba(5,3,3,0.7)');
  g.fillStyle = gr; g.fillRect(X, Y, w, h);
  g.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const cx = X + L.u * w, cy = Y + L.v * h, rad = L.r * h;
    gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, `rgba(255,170,90,${0.55 * L.a})`); gr.addColorStop(0.3, `rgba(220,110,50,${0.28 * L.a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(cx, cy); g.scale(0.75, 1.25); g.translate(-cx, -cy);
    g.fillStyle = gr; g.fillRect(cx - rad * 2, cy - rad * 2, rad * 4, rad * 4);
    g.restore();
  }
  g.restore();
}

export function planks(w, h, base, seed, n = 14) {
  const R = rng(seed);
  return canvasTex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const ph = h / n;
    for (let i = 0; i < n; i++) {
      const k = R();
      g.fillStyle = `rgba(${k > 0.5 ? 255 : 0},${k > 0.5 ? 200 : 0},${k > 0.5 ? 150 : 0},${0.03 + R() * 0.05})`;
      g.fillRect(0, i * ph, w, ph);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, i * ph, w, Math.max(1, h / 512));
      for (let s = 0; s < 3; s++) g.fillRect(R() * w, i * ph, Math.max(1, w / 512), ph);
      for (let s = 0; s < 30; s++) { g.fillStyle = `rgba(0,0,0,${R() * 0.08})`; g.fillRect(R() * w, i * ph + R() * ph, R() * w * 0.2, 1); }
    }
  });
}

export function glowTexture() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, false);
}
export function blobTexture() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, false);
}


const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const SEAT_GEOS = {
  // bistro chair: seat, back on two posts, front legs (the back legs are never seen from the stage)
  chair: () => mergeGeometries([
    box(0.4, 0.04, 0.4, 0, 0.44, 0), box(0.38, 0.3, 0.025, 0, 0.72, -0.19), box(0.03, 0.74, 0.03, -0.17, 0.37, -0.19), box(0.03, 0.74, 0.03, 0.17, 0.37, -0.19),
    box(0.025, 0.44, 0.025, -0.17, 0.22, 0.17), box(0.025, 0.44, 0.025, 0.17, 0.22, 0.17),
  ].map((g) => g.toNonIndexed())),
  // theatre seat, far rows: cushion and back only (the armrests vanish behind the people at that distance)
  theatreLite: (dh = 0) => mergeGeometries([box(0.5, 0.1, 0.46, 0, 0.4, 0.02), box(0.5, 0.55 + dh, 0.09, 0, 0.72 + dh / 2, -0.21)].map((g) => g.toNonIndexed())),
  // theatre seat: cushion, back, armrests
  theatre: (dh = 0) => mergeGeometries([
    // (armrest tops at 0.57 m, below hands resting at about 0.62: at 0.67 they hid the hands from the low side-on
    // setups frame to frame, tools/render/handocc.mjs)
    box(0.5, 0.1, 0.46, 0, 0.4, 0.02), box(0.5, 0.55 + dh, 0.09, 0, 0.72 + dh / 2, -0.21), box(0.05, 0.12, 0.46, -0.27, 0.51, 0), box(0.05, 0.12, 0.46, 0.27, 0.51, 0),
  ].map((g) => g.toNonIndexed())),
  // pub chair: a heavier wooden chair with a spindle back
  pub: () => mergeGeometries([
    box(0.42, 0.05, 0.42, 0, 0.45, 0), box(0.4, 0.06, 0.03, 0, 0.86, -0.2), box(0.035, 0.84, 0.035, -0.18, 0.42, -0.2), box(0.035, 0.84, 0.035, 0.18, 0.42, -0.2),
    box(0.02, 0.36, 0.02, -0.06, 0.66, -0.2), box(0.02, 0.36, 0.02, 0.06, 0.66, -0.2), box(0.03, 0.45, 0.03, -0.18, 0.22, 0.18), box(0.03, 0.45, 0.03, 0.18, 0.22, 0.18),
  ].map((g) => g.toNonIndexed())),
};
SEAT_GEOS.chairRow = SEAT_GEOS.chair; // the club's raked rows: the same chair, black
// the theatre's rows behind the front one: high-backed seats (THEATRE_BACK_RISE m taller, tops at 1.17 m). With the
// 1:3 rake and the wide 2.85 m up, the standard backs (tops at 1.0 m, 0.7 m above the next row's floor) cut each row
// behind at its hips, so the whole torso and the hands on the thighs showed: upright mannequins on risers. The taller
// backs cut them at the belly or lower chest, as an audience behind seats reads from the stage (rooms.js; &ab=lowbacks)
export const THEATRE_BACK_RISE = 0.17;
SEAT_GEOS.theatreHigh = () => SEAT_GEOS.theatre(THEATRE_BACK_RISE);
SEAT_GEOS.theatreLiteHigh = () => SEAT_GEOS.theatreLite(THEATRE_BACK_RISE);
// velvet in the dark for the theatre (0x4a1014), no red seats in the club (docs/crowd-visual-plan.md R2e, R11)
// (real-v1: theatre velvet that has aged unevenly, each seat a little lighter, darker or more faded than the next, so
// the rows aren't identical red blocks; vertex colours, no cost)
function velvet(s) {
  const h = Math.abs(Math.sin(s.x * 12.9898 + s.z * 78.233 + (s.row || 0) * 3.1) * 43758.5453) % 1;
  return new THREE.Color(0x4a1014).multiplyScalar(0.82 + 0.3 * h).lerp(new THREE.Color(0x3a1a1c), 0.25 * ((h * 7.3) % 1)).getHex();
}
const SEAT_COLOURS = { chair: () => 0x3a2418, chairRow: () => 0x1a1210, theatre: (s) => velvet(s), theatreLite: (s) => velvet(s), theatreHigh: (s) => velvet(s), theatreLiteHigh: (s) => velvet(s), pub: (s) => [0x3a2418, 0x4a2c1a, 0x2a1a12, 0x5a3a22, 0x30241c][Math.abs(Math.round(s.x * 7 + s.z * 3)) % 5] };
/**
 * Furniture for every visible seat (merged into the room's vertex-coloured mesh) and a contact blob under each.
 * depthFor(seat) darkens the furniture with the rows, the same falloff as the people in it.
 */
export function addSeats(scene, C0, seats, kindOf, depthFor = () => 1) {
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const geos = {};
  for (const s of seats) {
    const kind = kindOf(s);
    if (!kind) continue;
    geos[kind] ||= SEAT_GEOS[kind]();
    C0.add('lambert', geos[kind], new THREE.Color(SEAT_COLOURS[kind](s)).multiplyScalar(depthFor(s)), { matrix: mtx.clone().compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seatYaw(s)), one), ao: 0.6 });
  }
  // the contact under a seated person: a soft ellipse under the chair that reaches forward to the feet, turned with
  // the seat, so people sit with weight instead of floating
  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), Math.max(1, seats.length));
  const sc = new THREE.Vector3(0.68, 1, 1.05), up = new THREE.Vector3(0, 1, 0);
  seats.forEach((s, i) => {
    const yaw = seatYaw(s);
    blobs.setMatrixAt(i, mtx.compose(new THREE.Vector3(s.x + Math.sin(yaw) * 0.14, s.y + 0.006, s.z + Math.cos(yaw) * 0.14), q.setFromAxisAngle(up, yaw), sc));
  });
  blobs.count = seats.length;
  blobs.renderOrder = 1;
  blobs.name = 'blobs';
  scene.add(blobs);
}

// ---------- static geometry collector: merge by material, colour + baked occlusion in vertex colours ----------
export class Collector {
  constructor() { this.parts = {}; }
  add(kind, geo, color, { matrix = null, ao = 0.55, keepUv = false } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) g.deleteAttribute(k);
    const pos = g.attributes.position, n = pos.count;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
    const c = new THREE.Color(color), col = new Float32Array(n * 3);
    const span = Math.min(0.5, Math.max(0.05, maxY - minY));
    for (let i = 0; i < n; i++) {
      const a = ao > 0 ? 1 - ao + ao * THREE.MathUtils.smoothstep(pos.getY(i) - minY, 0, span) : 1;
      col[i * 3] = c.r * a; col[i * 3 + 1] = c.g * a; col[i * 3 + 2] = c.b * a;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (this.parts[kind] ||= []).push(g);
  }
  build(scene, kind, material, name) {
    if (!this.parts[kind]) return null;
    const m = new THREE.Mesh(mergeGeometries(this.parts[kind]), material);
    m.name = name;
    scene.add(m);
    return m;
  }
}

// ---------- glows: one Points draw call for candles, sconces, lenses, step lights, bar ----------
export function glowPoints(list, tex) {
  const n = list.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), flick = new Float32Array(n);
  list.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); col.set(p.c, i * 3); size[i] = p.s; flick[i] = p.f || 0; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('flick', new THREE.BufferAttribute(flick, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, time: { value: 0 }, scale: { value: 540 }, gain: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute float size; attribute float flick; varying vec3 vC; uniform float time; uniform float scale; uniform float gain;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
        float f = flick > 0.0 ? 0.82 + 0.18*sin(time*11.0+flick*37.0)*sin(time*7.3+flick*13.0) : 1.0;
        vC = color * f * gain; gl_PointSize = size * f * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  pts.name = 'glows';
  return pts;
}

// ---------- haze beams from the truss lights (one draw call) ----------
export function beams(list) {
  const geos = list.map(({ from, to, r0, r1 }) => {
    const len = from.distanceTo(to);
    const g = new THREE.CylinderGeometry(r0, r1, len, 18, 1, true);
    g.translate(0, -len / 2, 0);
    const along = new Float32Array(g.attributes.position.count);
    for (let i = 0; i < along.length; i++) along[i] = -g.attributes.position.getY(i) / len;
    g.setAttribute('along', new THREE.BufferAttribute(along, 1));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1)));
    return g;
  });
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffc890) }, strength: { value: 0.4 }, time: { value: 0 } },
    vertexShader: `attribute float along; varying float vA; varying vec3 vN; varying vec3 vV;
      void main(){ vA = along; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    // haze only where the light crosses it, with slow lumps of smoke along the beam
    fragmentShader: `uniform vec3 color; uniform float strength; uniform float time; varying float vA; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); // the first fifth fades in: seen from near the beam's axis, its walls would cut across the lamp's lens
        float fade = (1.0 - vA) * (1.0 - vA) * smoothstep(0.02, 0.22, vA);
        float lump = 0.75 + 0.25 * sin(vA * 9.0 - time * 0.35) * sin(vA * 4.3 + time * 0.21 + 1.3);
        gl_FragColor = vec4(color * strength * edge * fade * lump, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), m);
  mesh.renderOrder = 11;
  mesh.name = 'beams';
  return mesh;
}

/**
 * Build the room. P: preset ({ tex: 'small'|'large', micStandard: bool }). visible(seat) says whether furniture at
 * a seat can be seen from the wide shot (furniture nobody can see is left out).
 */
export function buildVenue(scene, rows, P, visible = () => true, depthFor = () => 1) {
  const R = rng(97);
  const glow = [];
  const C0 = new Collector();
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const W = ROOM.halfW, B = ROOM.back, C = ROOM.ceil;
  const lastY = rows.length ? rows[rows.length - 1].y : 0;
  const big = P.tex === 'large';

  // --- floors, risers, top platform, stage: one textured mesh (planks), tinted per part ---
  const floorTex = planks(big ? 1024 : 512, big ? 1024 : 512, '#2a1a12', 5, 18);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  const uvScale = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };
  C0.add('floor', uvScale(new THREE.PlaneGeometry(W * 2, B + 1).rotateX(-Math.PI / 2).translate(0, 0, B / 2), 4, 5), 0x9a8070, { ao: 0, keepUv: true });
  // a riser under each raised row: 0.95 m deep under a raked row, 1.4 m under a row of tables (its table in front)
  const riser = (r) => (r.cabaret ? [1.4, r.z - 0.35] : [0.95, r.z - 0.05]);
  for (const r of rows) if (r.y > 0) { const [d, cz] = riser(r); C0.add('floor', uvScale(box(W * 2, r.y, d, 0, r.y / 2, cz), 4, 0.5), 0x7a6458, { ao: 0.35, keepUv: true }); }
  const topZ = rows.length ? (([d, cz]) => cz + d / 2)(riser(rows[rows.length - 1])) : B;
  if (lastY > 0) C0.add('floor', uvScale(box(W * 2, lastY, B - topZ, 0, lastY / 2, topZ + (B - topZ) / 2), 4, 1), 0x7a6458, { ao: 0, keepUv: true });
  C0.add('floor', uvScale(box(W * 2, ROOM.stageH, 4.5, 0, ROOM.stageH / 2, ROOM.stageZ - 2.25), 3, 2), 0x9a8070, { ao: 0.5, keepUv: true });
  C0.add('basic', new THREE.PlaneGeometry(W * 2, 0.035).rotateX(-Math.PI / 2).translate(0, ROOM.stageH + 0.003, ROOM.stageZ - 0.05), 0x241e1a, { ao: 0 }); // (dark: a bright grey line ran along the bottom of the frame)
  C0.add('basic', new THREE.PlaneGeometry(W * 2, 0.02).translate(0, ROOM.stageH - 0.01, ROOM.stageZ + 0.002), 0x2a1c14, { ao: 0 }); // worn nosing
  // aisle runner along the steps, with step lights on each riser
  const ax = (AISLE[0] + AISLE[1]) / 2, aw = AISLE[1] - AISLE[0] - 0.2;
  C0.add('floor', new THREE.PlaneGeometry(aw, 4.0).rotateX(-Math.PI / 2).translate(ax, 0.004, 2.4), 0x7a2020, { ao: 0, keepUv: true });
  for (const r of rows) if (r.y > 0) {
    const [d, cz] = riser(r);
    C0.add('floor', new THREE.PlaneGeometry(aw, d).rotateX(-Math.PI / 2).translate(ax, r.y + 0.004, cz), 0x7a2020, { ao: 0, keepUv: true });
    for (const x of [AISLE[0] + 0.12, AISLE[1] - 0.12]) glow.push({ x, y: r.y - 0.06, z: cz - d / 2 + 0.02, c: [1.0, 0.55, 0.25], s: 0.05 });
  }
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, vertexColors: true });
  C0.build(scene, 'floor', floorMat, 'floor');

  // --- walls: one canvas for the back wall and both side walls, light of the sconces baked in ---
  const backLights = [-3.6, -1.2, 1.2, 3.6].map((x) => ({ x, y: 2.35 }));
  const sideLights = [3.6, 6.4, 9.2];
  const wallH = C - lastY;
  const TW = big ? 2048 : 1024, HB = big ? 640 : 256, HS = big ? 512 : 192, TH = HB + 2 * HS;
  const wallTex = canvasTex(TW, TH, (g) => {
    drawBrick(g, 0, 0, TW, HB, W * 2, backLights.map((l) => ({ u: (l.x + W) / (W * 2), v: 1 - (l.y - lastY) / wallH, r: 0.75, a: 1 })), 11);
    [-1, 1].forEach((s, k) => {
      drawBrick(g, 0, HB + k * HS, TW, HS, B, sideLights.map((z) => ({ u: s < 0 ? z / B : 1 - z / B, v: 1 - 2.25 / C, r: 0.8, a: 0.9 })), 21 + s);
      // the club's red: an uplight washing the brick near the stage
      const u = s < 0 ? 1.4 / B : 1 - 1.4 / B, cx = u * TW, cy = HB + k * HS + HS * 0.95, rad = HS * 1.1;
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, 'rgba(255,40,40,0.55)'); gr.addColorStop(0.4, 'rgba(180,20,30,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.translate(cx, cy); g.scale(0.55, 1.4); g.translate(-cx, -cy);
      g.fillStyle = gr; g.fillRect(cx - rad * 2, cy - rad * 2, rad * 4, rad * 4); g.restore();
    });
  });
  const region = (g, y0, h) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (y0 + h) / TH + uv.getY(i) * (h / TH)); return g; };
  const walls = [region(new THREE.PlaneGeometry(W * 2, wallH).rotateY(Math.PI).translate(0, lastY + wallH / 2, B), 0, HB)];
  [-1, 1].forEach((s, k) => walls.push(region(new THREE.PlaneGeometry(B, C).rotateY(-s * Math.PI / 2).translate(s * W, C / 2, B / 2), HB + k * HS, HS)));
  const wallMesh = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshBasicMaterial({ map: wallTex, color: 0x7a6e62 }));
  wallMesh.name = 'walls';
  scene.add(wallMesh);
  for (const l of backLights) {
    glow.push({ x: l.x, y: l.y, z: B - 0.08, c: [1.0, 0.62, 0.3], s: 0.55 });
    glow.push({ x: l.x, y: l.y, z: B - 0.1, c: [1.0, 0.85, 0.6], s: 0.13 });
    C0.add('basic', new THREE.CylinderGeometry(0.07, 0.05, 0.22, 10, 1, false, 0, Math.PI).rotateY(Math.PI / 2).translate(l.x, l.y - 0.05, B - 0.02), 0x8a5a2a, { ao: 0 });
  }
  for (const s of [-1, 1]) glow.push({ x: s * (W - 0.12), y: 0.15, z: 1.4, c: [1.0, 0.12, 0.1], s: 0.55 });
  // haze just behind the last row's heads, so they stand out against it as silhouettes
  const lastZ = rows.length ? rows[rows.length - 1].z : B - 2;
  for (const x of [-3.6, -1.2, 1.2, 3.6]) glow.push({ x, y: lastY + 1.45, z: Math.min(B - 0.4, lastZ + 0.7), c: [0.2, 0.11, 0.06], s: 3.0 });
  for (const s of [-1, 1]) for (const z of sideLights) {
    glow.push({ x: s * (W - 0.08), y: 2.25, z, c: [1.0, 0.62, 0.3], s: 0.5 });
    glow.push({ x: s * (W - 0.1), y: 2.25, z, c: [1.0, 0.85, 0.6], s: 0.12 });
    C0.add('basic', new THREE.CylinderGeometry(0.07, 0.05, 0.22, 10, 1, false, 0, Math.PI).rotateY(s < 0 ? 0 : Math.PI).translate(s * (W - 0.02), 2.2, z), 0x8a5a2a, { ao: 0 });
  }

  // --- ceiling, ducts, front-of-house truss with four lights pointing back at the stage ---
  C0.add('lambert', new THREE.PlaneGeometry(W * 2, B + 4).rotateX(Math.PI / 2).translate(0, C, B / 2 - 2), 0x1a1312, { ao: 0 });
  for (const x of [-3.2, 2.6]) C0.add('lambert', new THREE.CylinderGeometry(0.16, 0.16, B + 4, 10, 1, true).rotateX(Math.PI / 2).translate(x, C - 0.2, B / 2 - 2), 0x262020, { ao: 0 });
  const TZ = 4.3, TY = 3.1, ts = 0.15, metal = 0x2a2626;
  for (const [dy, dz] of [[0, 0], [ts, 0], [0, ts], [ts, ts]]) C0.add('lambert', new THREE.CylinderGeometry(0.018, 0.018, W * 2, 5).rotateZ(Math.PI / 2).translate(0, TY + dy, TZ + dz), metal, { ao: 0 });
  for (let x = -W + 0.1; x < W - 0.3; x += 0.3) {
    for (const [a, b] of [[[0, 0], [ts, 0]], [[0, ts], [ts, ts]], [[0, 0], [0, ts]], [[ts, 0], [ts, ts]]]) {
      const p0 = new THREE.Vector3(x, TY + a[0], TZ + a[1]), p1 = new THREE.Vector3(x + 0.3, TY + b[0], TZ + b[1]);
      const g = new THREE.CylinderGeometry(0.008, 0.008, p0.distanceTo(p1), 3, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()));
      g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
      C0.add('lambert', g, metal, { ao: 0 });
    }
  }
  for (const x of [-W + 0.2, W - 0.2]) C0.add('lambert', new THREE.CylinderGeometry(0.02, 0.02, C - TY, 5).translate(x, (C + TY) / 2, TZ + ts / 2), metal, { ao: 0 });
  const stagePoint = new THREE.Vector3(0.2, 1.4, -1.6);
  const truss = [-3.3, -1.1, 1.1, 3.3].map((x) => new THREE.Vector3(x, TY - 0.22, TZ + 0.07));
  for (const p of truss) {
    const dir = stagePoint.clone().sub(p).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    C0.add('lambert', new THREE.CylinderGeometry(0.1, 0.12, 0.32, 12).applyQuaternion(q).translate(p.x, p.y, p.z), 0x1e1c1c, { ao: 0 });
    C0.add('lambert', box(0.04, 0.24, 0.04, p.x, p.y + 0.14, p.z), metal, { ao: 0 });
    const lens = p.clone().addScaledVector(dir, 0.172);
    // &ab=lampfix: a point sprite has one depth, so a glow at the lens's centre is half hidden by the tilted lens (the
    // "split disc"); 8 cm in front of it, it clears the glass
    const halo = lens.clone().addScaledVector(dir, P.lampFix ? 0.08 : 0);
    // flagged (the TV's glare finding): the lens is hidden behind barn doors from the house, so the wide sees a dark
    // mouth and a faint warm leak instead of four discs; the light it throws stays in the key
    C0.add('basic', new THREE.CircleGeometry(0.125, 18).applyQuaternion(q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))).translate(lens.x, lens.y, lens.z), 0x17120f, { ao: 0 });
    glow.push({ x: halo.x, y: halo.y + 0.05, z: halo.z, c: [0.16, 0.1, 0.05], s: 0.7 });
  }
  const beamMesh = beams(truss.map((p) => ({ from: p.clone().addScaledVector(stagePoint.clone().sub(p).normalize(), 0.17), to: stagePoint.clone().add(new THREE.Vector3((p.x - 0.2) * 0.12, -0.9, -0.2)), r0: 0.1, r1: 0.95 })));
  scene.add(beamMesh);

  // --- the bar at the back left, on the top platform: counter, glowing back-bar, bottles ---
  const barY = lastY, bz = B - 0.75, bx0 = -W, bx1 = -2.2;
  C0.add('lambert', box(bx1 - bx0, 1.05, 0.55, (bx0 + bx1) / 2, barY + 0.525, bz), 0x3a1e14, { ao: 0.5 });
  C0.add('lambert', box(bx1 - bx0, 0.05, 0.62, (bx0 + bx1) / 2, barY + 1.07, bz), 0x5a3020, { ao: 0 });
  const shelf = new THREE.PlaneGeometry(bx1 - bx0 - 0.3, 0.9, 1, 6).rotateY(Math.PI).translate((bx0 + bx1) / 2, barY + 1.75, B - 0.03).toNonIndexed();
  {
    const pos = shelf.attributes.position, col = new Float32Array(pos.count * 3);
    const ramp = [[0, 0.02, 0.01, 0.0], [0.3, 1.0, 0.45, 0.12], [0.5, 1.0, 0.62, 0.3], [0.7, 0.8, 0.3, 0.08], [1, 0.02, 0.01, 0.0]];
    for (let i = 0; i < pos.count; i++) {
      const t = 1 - (pos.getY(i) - (barY + 1.3)) / 0.9;
      let k = 0; while (k < ramp.length - 2 && t > ramp[k + 1][0]) k++;
      const [t0, r0, g0, b0] = ramp[k], [t1, r1, g1, b1] = ramp[k + 1], u = THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1);
      const kb = 0.6; // (real-v1 round 12: the shelf's glow clipped flat as the brightest thing in the club's frames)
      col.set([(r0 + (r1 - r0) * u) * kb, (g0 + (g1 - g0) * u) * kb, (b0 + (b1 - b0) * u) * kb], i * 3);
    }
    shelf.setAttribute('color', new THREE.BufferAttribute(col, 3));
    shelf.deleteAttribute('uv');
    (C0.parts.basic ||= []).push(shelf);
  }
  const bottle = mergeGeometries([new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5).translate(0, 0.1, 0), new THREE.CylinderGeometry(0.012, 0.03, 0.1, 5).translate(0, 0.25, 0)]);
  for (let i = 0; i < 26; i++) {
    const x = bx0 + 0.3 + (i % 13) * ((bx1 - bx0 - 0.6) / 12) + (R() - 0.5) * 0.05, y = barY + 1.48 + Math.floor(i / 13) * 0.4;
    C0.add('basic', bottle, new THREE.Color().setHSL(0.05 + R() * 0.08, 0.6, 0.05 + R() * 0.07).getHex(), { matrix: new THREE.Matrix4().makeScale(1, 0.8 + R() * 0.5, 1).setPosition(x, y, B - 0.12), ao: 0 });
  }
  glow.push({ x: (bx0 + bx1) / 2, y: barY + 1.8, z: B - 0.3, c: [0.9, 0.45, 0.16], s: 2.2 });
  for (let x = bx0 + 0.4; x < bx1; x += 0.6) glow.push({ x, y: barY + 2.3, z: B - 0.25, c: [1.0, 0.7, 0.4], s: 0.16 });

  // --- stage foreground: monitor wedge and the mic stand ---
  const wg = new THREE.BoxGeometry(0.62, 0.32, 0.42);
  const wpos = wg.attributes.position;
  for (let i = 0; i < wpos.count; i++) if (wpos.getY(i) > 0 && wpos.getZ(i) < 0) wpos.setY(i, wpos.getY(i) - 0.22); // slope towards the performer
  wg.computeVertexNormals();
  C0.add('lambert', wg, 0x1a1a1a, { matrix: new THREE.Matrix4().compose(new THREE.Vector3(1.05, ROOM.stageH + 0.16, ROOM.stageZ - 0.55), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.25), new THREE.Vector3(1, 1, 1)), ao: 0.3 });
  const micBase = new THREE.Vector3(0.0, ROOM.stageH, -1.2), micHead = new THREE.Vector3(0.02, 1.62, -1.14); // low, right of centre on screen (+x is screen left from the stage), clear of the front faces
  const micParts = [];
  const head = new THREE.Object3D();
  head.position.copy(micHead);
  head.lookAt(new THREE.Vector3(0.2, 2.15, -1.62)); // the capsule tips up towards the performer's mouth
  head.rotateX(Math.PI / 2);
  head.updateMatrix();
  micParts.push([new THREE.CylinderGeometry(0.13, 0.15, 0.025, 20).translate(micBase.x, micBase.y + 0.012, micBase.z), 0x2a2a2c]);
  micParts.push([new THREE.CylinderGeometry(0.009, 0.011, micHead.y - micBase.y - 0.12, 8).translate(micBase.x, (micBase.y + micHead.y - 0.12) / 2, micBase.z), 0x3a3a3c]);
  micParts.push([new THREE.CylinderGeometry(0.024, 0.016, 0.17, 14).translate(0, -0.085, 0).applyMatrix4(head.matrix), 0x0c0c0d]);
  micParts.push([new THREE.SphereGeometry(0.029, 12, 9).applyMatrix4(head.matrix), 0x4a4a50]);
  micParts.push([new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16).translate(0, -0.012, 0).applyMatrix4(head.matrix), 0x18181a]);
  if (P.mic) for (const [g, c] of micParts) C0.add(P.micStandard ? 'mic' : 'lambert', g, c, { ao: 0 });

  // --- seats, tables, drinks, candles (only where the wide shot can see them) ---
  const all = rows.flatMap((r) => r.seats).filter(visible);
  addSeats(scene, C0, all, (st) => (st.cabaret ? 'chair' : 'chairRow'), depthFor);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
  const tables = cabaretTables(rows);
  const tableG = mergeGeometries([new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.03, 22).translate(0, 0.735, 0), new THREE.CylinderGeometry(0.025, 0.025, 0.72, 5).translate(0, 0.36, 0), new THREE.CylinderGeometry(0.2, 0.22, 0.02, 10).translate(0, 0.01, 0)]);
  const glassG = new THREE.CylinderGeometry(0.036, 0.03, 0.14, 8).translate(0, 0.82, 0);
  const jarG = new THREE.CylinderGeometry(0.035, 0.03, 0.07, 8).translate(0, 0.785, 0);
  for (const t of tables) {
    if (!visible({ x: t.x, y: t.y, z: t.z })) continue;
    const k = R();
    C0.add('lambert', tableG, 0x3a2216, { matrix: mtx.clone().makeTranslation(t.x, t.y, t.z), ao: 0.6 });
    // (the glasses on each sitter's outer side of the rim, off the line from the stage-side cameras to the hands, which
    // flickered behind them; the candle stays in the middle)
    C0.add('lambert', glassG, k > 0.4 ? 0x6a3a0c : 0x3a120a, { matrix: mtx.clone().makeTranslation(t.x - 0.32, t.y, t.z + 0.11), ao: 0 });
    C0.add('lambert', glassG, k > 0.7 ? 0x5a5448 : 0x4a2a0c, { matrix: mtx.clone().compose(new THREE.Vector3(t.x + 0.32, t.y - 0.035, t.z + 0.1), q.identity(), new THREE.Vector3(1.15, 0.6, 1.15)), ao: 0 });
    C0.add('basic', jarG, 0xc8402a, { matrix: mtx.clone().makeTranslation(t.x + 0.01, t.y, t.z - 0.06), ao: 0 });
    glow.push({ x: t.x + 0.01, y: t.y + 0.83, z: t.z - 0.06, c: [1.0, 0.55, 0.22], s: 0.3, f: R() + 0.1 });
    glow.push({ x: t.x + 0.01, y: t.y + 0.84, z: t.z - 0.06, c: [1.0, 0.85, 0.5], s: 0.06, f: R() + 0.1 });
  }

  // contact under the tables and the drinks on them (one more instanced draw)
  const shown = tables.filter((t) => visible({ x: t.x, y: t.y, z: t.z }));
  if (shown.length) {
    const tb = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), shown.length * 4);
    let k = 0;
    const put = (x, y, z, r) => tb.setMatrixAt(k++, mtx.clone().compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(r, 1, r)));
    for (const t of shown) {
      put(t.x, t.y + 0.007, t.z, 1.0);
      put(t.x - 0.32, t.y + 0.752, t.z + 0.11, 0.15); put(t.x + 0.32, t.y + 0.752, t.z + 0.1, 0.17); put(t.x + 0.01, t.y + 0.752, t.z - 0.06, 0.12);
    }
    tb.count = k;
    tb.renderOrder = 1;
    tb.name = 'blobs';
    scene.add(tb);
  }

  C0.build(scene, 'lambert', new THREE.MeshLambertMaterial({ vertexColors: true }), 'room');
  C0.build(scene, 'basic', new THREE.MeshBasicMaterial({ vertexColors: true }), 'room-emissive');
  if (P.mic && P.micStandard) C0.build(scene, 'mic', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.85 }), 'mic');
  const points = glowPoints(glow, glowTexture());
  scene.add(points);
  return { points, beamMesh, tables, walls: wallMesh };
}

/** The club as a venue spec (the other rooms are in rooms.js and follow the same shape). */
export const CLUB = {
  id: 'club', title: 'The Basement · <em>Comedy Club</em>', layout: layoutSeats, build: buildVenue, tables: cabaretTables, seatH: 0.45, room: ROOM,
  performer: [0.28, 2.0, -1.75],
  // the front six (crowd.js falls back to a seeded shuffle without it): every avatar is in exactly two venues' fronts,
  // three women and three men each. Female_Adult_02 (a skirt) and Female_Adult_12 (shorts) have their cloth weights
  // fitted to the thighs (tools/build_people.mjs clothFit); Male_Adult_17 (a sleeve that blades with the arms up) is in
  // two seated venues, never the arena, whose finale raises arms.
  cast: ['Female_Adult_13', 'Male_Adult_10', 'Female_Adult_03', 'Male_Adult_04', 'Female_Adult_02', 'Male_Adult_17'],
  // the wide: upstage of the performer, house right, low (about the seated eye line, 1.55 m: the TV's "choir riser"
  // finding came from a high lens looking down the rows), so the near tables and the first heads frame the bottom
  // and the rows behind stack up as heads at different heights
  cam: { pos: [0.7, 1.55, -2.9], look: [-0.3, 1.3, 8], mm: 28 },
  fog: { color: 0x0b0706, wide: [2.5, 22], close: [2.6, 6.5], heckler: [2.6, 6.5] },
  exposure: { wide: 1, close: 0.9, heckler: 0.9 },
  grade: { wb: [1.03, 1, 0.95], sat: 1.0, lift: [0.002, 0.003, 0.006] },
  // the key from the stage, house left, decay 2; rim from the truss over row 2; fill from the stage floor
  light: {
    hemi: 0.3, sky: 0x2a3040, ground: 0x1a0e08,
    key: { pos: [-2.4, 3.4, -0.6], target: [0.8, 1.1, 5.0], intensity: 110, angle: 1.1, penumbra: 1, decay: 2 },
    rim: { dir: [0, 0.64, 0.77], color: 0xffb070, k: 0.9 }, fill: { dir: [0, -0.3, -0.95], color: 0xffb890, k: 0.6, house: 3 },
  },
  previewWiden: 2.2, // (the bill: the stage spill opened wider while the room fills, crowd.js lightLevels)
  spread: 0.11, attention: 0.6,
  standing: [{ x: -2.7, z: ROOM.back - 1.35 }],
  tone: { id: 'room-tone-club', gain: 0.22 }, // (under the laughs: about 10 dB below a laugh at 0.6)
  // arrivals and departures: the door by the bar, the aisle, then along the row (behind the cabaret chairs, in
  // front of the raked rows)
  traffic: { aisles: [(AISLE[0] + AISLE[1]) / 2], door: { x: -4.4, z: ROOM.back - 0.8 }, via: ROOM.back - 1.9, lane: (st) => (st.cabaret ? st.z + 0.42 : st.z - 0.38) },
  presets: {},
};
