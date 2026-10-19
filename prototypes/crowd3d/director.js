// The reaction coverage (the user, 2026-10-13: "laughs look the same; each laugh should focus on a different angle
// or a different set of people", in every venue). Each venue has its own setups (8 to 10) and its own pacing. A
// setup is only a camera pose: no new lights and no new geometry. It is lit with the room's existing light, in one
// of two ways. 'close' lighting is the reaction shot's light: the stage spill widened, the people it frames at full
// light, the rest dimmed. 'wide' lighting is the room exactly as the wide shows it.
//   open mic  intimate two-shots and singles, often one cluster of chairs; handheld in feel (a faint breath and a
//             slight tilt) but locked off
//   club      tight groups at the tables, low angles across the candles, a shot from the bar side; the quickest cuts
//   theatre   a high wide down the rake that shows the laugh travel back, row-length side angles, a composed mid of
//             the stalls; the longest holds
//   arena     big wides of the floor and the stands, a crane-high angle, a mid at floor level of the pit's arms, the
//             stand sections
// pickSetup chooses the next one. It never takes one of the last three used. It prefers the setups whose people are
// laughing most visibly now (laughRank, damped for whoever was featured in the last cuts, so it doesn't keep cutting
// to the same top laugher). It changes the shot size from the last cut, and on a big laugh it leans to the wider
// setups. A deterministic jitter breaks ties.
import * as THREE from 'three';
// (&laugh=old: the theatre's fly-gallery wide at its old height too; laugh-v2 lowered it 1.1 m: from 3.4 m the laugh
// read as the tops of bowed heads, rounds 16-17)
const Q_LAUGH_OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('laugh') === 'old';

/** The minimum hold of a reaction shot and of the wide, in seconds. The heckler cuts at once and is exempt. */
export const PACE = {
  club: { close: 4.5, wide: 8 },
  openmic: { close: 5.5, wide: 9 },
  theatre: { close: 6.5, wide: 11 },
  arena: { close: 5, wide: 8.5 },
};

const v3 = (a) => new THREE.Vector3(...a);
const centroid = (pts) => pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);

/**
 * The venue's setups. ctx: { venue, rows, frontPairs, tables, eyesAt, fovFor, pair(ss, mm, k, label, sx) (the mid
 * shots from the front, crowd.js) }. Each setup is { label, size: 'close'|'mid'|'wide', lit: 'close'|'wide', seats,
 * pos, look, fov, track (m/s, a slow lateral track), roll (rad), drift, w (the venue's taste) }.
 */
export function buildSetups(ctx) {
  const { venue, rows, frontPairs, eyesAt, fovFor, pair } = ctx;
  const out = [];
  const eyes = (s) => new THREE.Vector3(s.x, eyesAt(s), s.z);
  const add = (S) => { out.push({ size: 'mid', lit: 'close', track: null, roll: 0, drift: 0, w: 1, seats: [], ...S }); return S; };
  const pose = (label, size, lit, pos, look, mm, seats = [], extra = {}) => add({ label, size, lit, pos: v3(pos), look: v3(look), fov: fovFor(mm), seats, ...extra });
  const fromPair = (S, size, extra = {}) => add({ ...S, size, ...extra });
  const [P0, P1 = [], P2 = []] = frontPairs;
  const row0 = rows[0].seats.slice().sort((a, b) => a.x - b.x);
  const front = frontPairs.flat();
  const c0 = centroid(P0.map(eyes));
  if (venue === 'club') {
    // tight groups at the tables (the centre table and a neighbour), and the front six from house left
    if (P1.length) fromPair(pair([...P0, ...P1], 40, 1.75, 'tables: group house right', 1), 'mid', { w: 1.1 });
    if (P2.length) fromPair(pair([...P0, ...P2], 40, 1.75, 'tables: group house left, from house left', -1), 'mid', { w: 1.1 });
    { const F = pair(front, 35, 1.9, 'tables: over the front from the stage', 1); F.pos.y += 0.55; fromPair(F, 'wide', { w: 0.8 }); }
    // low across the candles: the lens at the table's height, the candle jar between it and the pair's faces
    for (const [pr, sx, nm] of [[P0, 1, 'centre table'], [P2.length ? P2 : P1, -1, 'next table']]) {
      if (!pr.length) continue;
      const e = centroid(pr.map(eyes)), z0 = Math.min(...pr.map((s) => s.z));
      pose(`low across the candles: ${nm}`, 'close', 'close', [e.x + 0.6 * sx, 0.86, z0 - 1.9], [e.x + 0.1 * sx, e.y - 0.12, e.z], 32, pr, { w: 1.2 });
    }
    // from the bar side: the house-left wall in front of the first tables, along the front of the room
    pose('from the bar side', 'mid', 'close', [-4.3, 1.45, 0.95], [-1.3, 1.0, 2.5], 40, front, { w: 1.1 });
    // the stage wing, house right: on the stage, looking across the front tables
    pose('from the stage wing', 'mid', 'close', [3.3, 1.95, 0.15], [-0.7, 1.05, 2.4], 35, front);
    // a slow lateral track along the front tables (locked speed, no shake)
    const tk = pair(front, 45, 1.5, 'track along the front tables', -1);
    fromPair(tk, 'mid', { track: new THREE.Vector3(-0.11, 0, 0), pos: tk.pos.clone().add(new THREE.Vector3(0.3, -0.25, 0)), look: tk.look.clone().add(new THREE.Vector3(0.3, -0.1, 0)) });
    // the high wide from the upstage corner
    pose('high wide from the upstage corner', 'wide', 'close', [4.1, 3.0, -1.4], [-1.2, 0.85, 4.8], 35, [], { w: 0.9 });
  } else if (venue === 'openmic') {
    // intimate: two-shots and singles on longer lenses, often one cluster of chairs; a breath of handheld, locked off
    const hand = (k) => ({ drift: 0.0006, roll: [0.016, -0.012, 0.02, -0.018, 0.01, -0.022, 0.014, -0.01, 0.012][k % 9] });
    let k = 0;
    fromPair(pair(P0, 60, 1.1, 'two-shot: centre', 1), 'close', { ...hand(k++), w: 1.3 });
    const PL = P2.length ? P2 : P1;
    if (PL.length) fromPair(pair(PL, 60, 1.1, 'two-shot: the next chairs, from house left', -1), 'close', { ...hand(k++), w: 1.2 });
    // singles, from a seated eye line (lower than the two-shots) on a long lens
    for (const [s, sx] of [[P0[0], 1], [P0[1], -1]]) {
      if (!s) continue;
      const S1 = pair([s], 85, 1.05, `single: row ${s.row} at ${s.x.toFixed(1)}${sx < 0 ? ', from house left' : ''}`, sx);
      S1.pos.y -= 0.12;
      fromPair(S1, 'close', { ...hand(k++), w: 1.15 });
    }
    // low from the riser's edge, up at the centre chairs (one cluster's reaction)
    { const e = centroid(P0.map(eyes)); pose('low from the riser: the centre chairs', 'mid', 'close', [e.x - 0.5, 0.95, e.z - 2.3], [e.x + 0.1, e.y + 0.05, e.z + 0.4], 32, P0, { ...hand(k++), w: 1.1 }); }
    if (P1.length) fromPair(pair([...P0, ...P1], 40, 1.6, 'the chairs: group house right', 1), 'mid', hand(k++));
    fromPair(pair(front, 30, 1.6, 'the chairs: the front from house left', -1), 'mid', hand(k++));
    // from the side wall by the riser, across the first arc
    pose('from the side wall', 'mid', 'close', [2.75, 1.45, 0.25], [-1.1, 1.0, 2.6], 30, front, hand(k++));
    // the comic's eye line, low and centred (the wide is higher and off to house right)
    pose("the comic's eye line", 'wide', 'wide', [0.15, 1.7, -0.95], [0.0, 1.0, 5.0], 26, [], { ...hand(k++), w: 0.8 });
  } else if (venue === 'theatre') {
    fromPair(pair([...P0, ...(P1.length ? P1 : P2)], 40, 1.75, 'stalls: group house right', 1), 'mid');
    fromPair(pair(front, 30, 1.7, 'stalls: the front from house left', -1), 'mid', { w: 0.9 });
    fromPair(pair(P0, 65, 1.1, 'stalls: two-shot, centre', 1), 'close', { w: 0.8 });
    // the high wide down the rake: the laugh travels back through the rows (spread 0.4 s front to back)
    pose('high wide from the fly gallery: the ripple', 'wide', 'close', [-1.0, Q_LAUGH_OLD ? 3.4 : 2.3, 0.2], [0.2, Q_LAUGH_OLD ? 1.1 : 1.25, 4.6], 30, [], { w: 1.3, keyWiden: 2.8 });
    // from the stage box, house left, high: the stalls on the diagonal
    pose('high wide from the stage box', 'wide', 'close', [-6.0, 3.6, 0.8], [0.4, 1.15, 3.3], 55, [], { w: 1.2, keyWiden: 2.8 });
    // row-length side angles: from the apron's corners along the front rows
    pose('along the front row from house right', 'mid', 'close', [4.4, 2.15, 1.0], [-1.4, 1.1, 4.3], 38, front, { w: 1.1, keyWiden: 2.8 });
    pose('along the front row from house left', 'mid', 'close', [-4.2, 2.1, 1.0], [1.6, 1.1, 4.3], 38, front, { w: 1.1, keyWiden: 2.8 });
    // a composed mid of the stalls, centred, from the stage
    pose('a composed mid of the stalls', 'mid', 'close', [0.25, 3.0, -1.2], [0.25, 1.1, 4.2], 40, [], { w: 1.1, keyWiden: 2.4 });
    // a slow lateral track along the front row
    const tk = pair(front, 38, 1.7, 'track along the front row', 1);
    fromPair(tk, 'mid', { track: new THREE.Vector3(0.07, 0, 0), pos: tk.pos.clone().add(new THREE.Vector3(-0.3, 0, 0)), look: tk.look.clone().add(new THREE.Vector3(-0.3, 0, 0)) });
  } else if (venue === 'arena') {
    fromPair(pair([...P0, ...(P1.length ? P1 : P2)], 40, 1.75, 'rail: group house right', 1), 'mid');
    fromPair(pair(front, 30, 1.7, 'rail: the front from house left', -1), 'mid', { w: 0.9 });
    // big wides of the floor and the stands, from the stage's house-left corner
    pose('big wide from stage left', 'wide', 'wide', [-8.5, 5.2, -1.6], [3.5, 1.2, 22], 20, [], { w: 1.2 });
    // the crane, high over the pit
    pose('crane high over the pit', 'wide', 'wide', [2.5, 13.5, -3.5], [-0.8, 0.0, 17], 26, [], { w: 1.2 });
    // floor level, from the pit in front of the barrier: the crowd's arms (a cheer, the finale) against the stands
    pose('floor level from the pit', 'mid', 'wide', [2.6, 2.2, 1.55], [-1.2, 2.3, 12], 28, [], { w: 1.1 });
    // the floor crowd, a mid from the stage
    pose('the floor crowd', 'mid', 'wide', [-1.6, 5.4, -2.8], [1.0, 1.0, 14], 38, [], { w: 1.1 });
    // the stand sections, house right and house left, from the stage
    pose('the stand, house right', 'mid', 'wide', [-2.0, 5.0, -2.5], [15, 4.0, 13], 50, []);
    pose('the stand, house left', 'mid', 'wide', [2.0, 5.0, -2.5], [-15, 4.0, 13], 50, []);
    // a two-shot at the rail
    fromPair(pair(P0, 65, 1.1, 'rail: two-shot, centre', 1), 'close', { w: 0.8 });
  } else {
    // (any other room: the front mid shots from both sides)
    for (const sx of [1, -1]) {
      for (const pr of frontPairs.slice(1)) fromPair(pair([...P0, ...pr], 40, 1.75, `group${sx < 0 ? ' from house left' : ''}`, sx), 'mid');
      fromPair(pair(front, 30, 1.7, sx < 0 ? 'front from house left' : 'front', sx), 'mid');
    }
  }
  void c0; void row0;
  return out;
}

/** Hash of an integer to [0, 1): the picker's tie-break, the same every run. */
const jitter = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

/**
 * The next setup. setups: buildSetups' list. history: the setups used, most recent first (indices). vis: Map from
 * seat to how visibly that person laughs now (laughRank). featured: Map from seat to the cut number they were last
 * featured in. size: when given, only setups of that size ('wide' for the wide's own variants). strength: the
 * laugh's strength (0 to 1). n: the cut count (for the jitter). Returns an index, or -1 when nothing fits.
 */
export function pickSetup({ setups, history, vis, featured, strength = 0.6, n = 0, size = null, lastSize = null }) {
  let best = -1, bestV = -Infinity;
  const recent = new Set(history.slice(0, Math.min(3, Math.max(0, setups.length - 2))));
  for (let i = 0; i < setups.length; i++) {
    const S = setups[i];
    if (size && S.size !== size) continue;
    if (recent.has(i)) continue;
    // whoever the setup features, by how visibly they laugh, damped when they were featured in the last four cuts
    let who = 0;
    for (const s of S.seats) {
      const ago = featured.has(s) ? n - featured.get(s) : 99;
      who = Math.max(who, (vis.get(s) || 0) * (ago < 4 ? 0.35 + 0.16 * ago : 1));
    }
    // a setup of the house (no skinned people) gets the room's laugh: big laughs light the whole house
    const house = S.seats.length ? 0 : 0.6 * Math.max(0, strength - 0.5); // (the house setups: big laughs only)
    const age = history.indexOf(i);
    const fresh = age < 0 ? 1.0 : Math.min(0.9, 0.15 * age); // (unused setups first, then the longest unused)
    const sizeV = size ? 0 : S.size === lastSize ? -0.4 : 0;
    const scale = S.size === 'wide' ? 0.3 * (strength - 0.6) : S.size === 'close' ? 0.25 * (0.6 - strength) : 0;
    const v = Math.max(who, house) + fresh + sizeV + scale + 0.4 * (S.w - 1) + 0.25 * jitter(n * 31 + i);
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}
