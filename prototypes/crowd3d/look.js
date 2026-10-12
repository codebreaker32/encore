// The stage's-eye look, "the room as a comedian sees it from the stage": the default since the user approved it
// (2026-10-12; &look=classic brings back the old look for A/B tests). Mockups docs/mockups/stagepov-*.png, references
// docs/mockups/stagepov-references.md. The house is dark. The stage light
// spills onto the first one or two rows only: a few warm faces, with real falloff. Everyone behind reads as a
// silhouette with a rim against the haze, plus the odd glint (a phone screen, the exit sign, the bar, the candles).
// The close-up becomes a mid shot of four to six front people, never a face.
// Lit faces only in rows 0-1 (the user: "a lot of faces in theatre"): the spill's cone ends by row 2, behind row 1 the
// house and fill light fall to about 1-2% (row depth 0.15 then 0.1, squared), the skinned front people and the merged
// middle rows sit in rows 0-1 only, and the rows behind are instanced silhouettes. Their rim stays flat with depth
// (1.5), softer and weaker on the far levels, whose coarse normals speckled it. The silhouettes cost less than the lit
// faces.
import { glowPoints, glowTexture } from './venue.js';

const COMMON = { closeKeyWiden: 2.0, hemi: 0.35, fill: 0.35, rim: 1.0, depthFrom: 1, depthSlope: 0.85, depthFloor: 0.1, frontRows: 2, wallScale: 0.5, closeDim: 0.12, midShots: true, rimFlat: true };
// per venue: the spill (the stage key, aimed at the front rows, a cone that ends about row 2), the haze, the glints
const VENUES = {
  club: {
    key: { pos: [0.3, 3.3, -0.4], target: [0.1, 0.5, 2.4], intensity: 95, angle: 0.42, penumbra: 0.45 },
    fog: { color: 0x1a120d, wide: [3, 20] }, haze: [0.14, 0.09, 0.06], phones: 4,
    exits: [[-4.4, 2.45, 12.55], [5.15, 2.4, 9.5]],
  },
  theatre: {
    key: { pos: [0.3, 4.6, -0.3], target: [0.2, 0.6, 2.8], intensity: 200, angle: 0.36, penumbra: 0.4 }, // (row 1 at 12° off its axis, row 2 at 21°: outside)
    // (the back rows read as cardboard: a rim from the spill again now the far level's flecks are gone, and haze
    // between the rows, thicker towards the back, so each row stands against a lighter one)
    fog: { color: 0x10121a, wide: [4, 30] }, haze: [0.08, 0.09, 0.13], hazeRows: [0.035, 0.04, 0.06], phones: 6, rim: 0.85,
    exits: [[-7.55, 2.6, 1.6], [7.55, 2.6, 1.6]],
  },
  openmic: {
    key: { pos: [0.2, 2.5, -0.6], target: [0, 0.5, 1.8], intensity: 70, angle: 0.42, penumbra: 0.4 }, // (the back arc at 24° off: outside)
    fog: { color: 0x161009, wide: [3, 14] }, haze: [0.12, 0.08, 0.05], phones: 2, exits: [],
  },
  // the arena: only the rail is lit (its skinned people, and the instanced places in row 0); behind it the key falls
  // with row depth too (keyDepth), since a spot 14 m away can't end its pool at the rail
  // (the user, on the TV: "keep at least 2/5th of screen alive". The wide stands higher, on the stage's camera riser,
  // looking down into the pit, so the floor crowd fills the lower half of the frame instead of a thin band at the
  // rail; the stage light reaches 20 m into the pit and the lower tiers with falloff, faces show to 22 m. The dark is
  // for the upper ring only. tools/render/aliveprobe.mjs checks that at least 40% of the frame is lit crowd.)
  arena: { fog: { color: 0x0b0d16 }, haze: null, phones: 0, exits: [], spriteFall: 40, spriteGain: 3.6, spriteWash: 0.036, phonesOn: 0.12, spriteRim: 2, spriteNear: [22, 8], frontRows: 1, depthFrom: 1, depthSlope: 0.1, depthFloor: 0.6,
    cam: { pos: [0.8, 6.5, -5], look: [0, 0.4, 30], mm: 24 } },
};

/** Apply a look to the venue spec before the page reads it (crowd.js, right after the preset). Returns null without one. */
export function applyLook(name, V, venueId, P) {
  if (name === 'classic') return null;
  const L = { ...COMMON, ...(VENUES[venueId] || {}) };
  const lt = V.light;
  lt.hemi *= L.hemi;
  if (lt.fill) lt.fill = { ...lt.fill, k: (lt.fill.k ?? 1) * L.fill };
  if (lt.rim) lt.rim = { ...lt.rim, k: (lt.rim.k ?? 1) * L.rim };
  if (L.key) lt.key = { ...lt.key, ...L.key };
  if (L.cam) V.cam = L.cam;
  V.fog = { ...V.fog, color: L.fog.color, ...(L.fog.wide ? { wide: L.fog.wide } : {}), close: [3.5, 12], heckler: [3.5, 12] };
  Object.assign(V, { closeKeyWiden: L.closeKeyWiden, keyDepth: !!L.keyDepth, depthFrom: L.depthFrom, depthSlope: L.depthSlope, depthFloor: L.depthFloor, wallScale: L.wallScale, closeDim: L.closeDim, midShots: L.midShots, rimFlat: L.rimFlat });
  if (V.exposure) V.exposure = { ...V.exposure, close: 1, heckler: 1 };
  if (L.spriteFall) V.stageLook = { spriteFall: L.spriteFall, spriteGain: L.spriteGain, spriteWash: L.spriteWash, phonesOn: L.phonesOn, spriteRim: L.spriteRim, spriteNear: L.spriteNear };
  // skinned people (front, and the merged middle rows on low/high) only where faces are lit: rows 0-1; the instanced
  // bands start where the merged rows end
  V.frontRows = Math.min(V.frontRows || 2, L.frontRows);
  // no point lights on the back rows (the club's bar lamp on high, the open mic's bar hatch): the bar still glows
  if (P) P.barLight = false;
  if (lt.bar) lt.bar = null;
  if (P && P.mid === 'merged' && P.midRows > 2) {
    P.midRows = 2;
    P.inst = P.inst.map((b, i) => (i === 0 ? { ...b, from: Math.min(b.from, 2) } : b));
  }
  return { name, extras: (rows, opts) => extras(L, V, rows, opts) };
}

/**
 * The glints and the haze behind the rows, as one more glow draw call: a few phone screens in the rows behind (cool,
 * at chest height, in front of the person), the exit signs, and a wider, warmer haze band behind the last row's heads.
 */
function extras(L, V, rows, { eyesAt, seen }) {
  const glow = [];
  let k = 0;
  const R = () => ((k = (k * 16807 + 11) % 2147483647) / 2147483647);
  k = 4242;
  const back = rows.filter((r) => !r.balcony).slice(2).flatMap((r) => r.seats).filter(seen);
  for (let i = 0; i < L.phones && back.length; i++) {
    const s = back[Math.floor(R() * back.length)];
    const p = { x: s.x + (R() - 0.5) * 0.2, y: eyesAt(s) - 0.36, z: s.z - 0.3 };
    glow.push({ ...p, c: [0.22, 0.3, 0.45], s: 0.35 }, { ...p, c: [0.7, 0.8, 1.0], s: 0.05 });
  }
  for (const [x, y, z] of L.exits) glow.push({ x, y, z, c: [0.08, 0.5, 0.2], s: 0.5 }, { x, y, z, c: [0.4, 1.0, 0.6], s: 0.12 });
  const floor = rows.filter((r) => !r.balcony);
  if (L.hazeRows) floor.forEach((r, i) => {
    if (i < 2 || i % 2) return;
    const hw = (V.room && V.room.halfW) || 5, k = i / Math.max(1, floor.length - 1);
    for (let x = -hw + 1.2; x <= hw - 1.2; x += 2.4) glow.push({ x, y: r.y + 1.55, z: r.z + 0.5, c: L.hazeRows.map((c) => c * (0.5 + k)), s: 3.2 });
  });
  if (L.haze && floor.length) {
    const last = floor[floor.length - 1], hw = (V.room && V.room.halfW) || 5;
    for (let x = -hw + 1; x <= hw - 1; x += 1.6) glow.push({ x, y: last.y + 1.6, z: last.z + 0.9, c: L.haze, s: 4.5 });
  }
  if (!glow.length) return null;
  const g = glowPoints(glow, glowTexture());
  g.name = 'look-glows';
  return g;
}
