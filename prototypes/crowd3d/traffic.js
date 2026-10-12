// Room traffic for the TV's `mode` message: who is in the room, and where, at each moment.
//   preview: the room fills up. Most people are already seated; the rest walk in from the door, along the aisle and
//            the row to the spot in front of their seat, turn to face the stage, and sit down (the Rocketbox
//            sit-down capture), spread over the first ~40 s.
//   live:    everyone in their seat (the crowd drive does the rest).
//   after:   the last applause fades (crowd.js), then people stand up (the stand-up capture), some put a coat on, turn
//            towards the row and file out along it and up the aisle to the door, spread over ~45 s.
// Everything is a function of the mode's age and the seat (seeded), so any frame can be reproduced.
//
// Walking: each person keeps their own pace (0.95–1.3 m/s). The walk is a captured cycle played by distance, not
// time (`dist` / the clip's stride), so a planted foot stays where it was put. Corners are rounded (the path is
// smoothed twice), and the head leads a turn: `look` is the yaw towards where the path goes 0.9 m ahead.
import { seatYaw } from './venue.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// how long the in-place parts take (the person plays their capture over the same time)
export const TURN_T = 0.75, SIT_T = 3.0, RISE_T = 2.6, COAT_T = 1.8;
// how far in front of the seat a person stands before sitting (the capture steps back about this far)
export const STAND_OFF = 0.44;

/** Chaikin corner cutting (keeps the ends): rounds every corner into a short arc. */
function chaikin(pts, k = 2) {
  for (let it = 0; it < k; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z), c = Math.min(0.25, 0.35 / Math.max(L, 1e-6)); // cut at most 0.35 m
      if (i > 0) out.push({ x: a.x + (b.x - a.x) * c, z: a.z + (b.z - a.z) * c });
      if (i < pts.length - 2) out.push({ x: b.x - (b.x - a.x) * c, z: b.z - (b.z - a.z) * c });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/**
 * venue: { aisles: [x...], door: {x, z} or door(seat), via (z where the walk joins the aisle), lane(seat) -> z of the walkway beside that seat's row, yAt(z) -> floor height,
 *          noAisle: walk straight from the door (open mic) }
 */
export function makeTraffic(venue) {
  const cache = new Map();
  // every seat, as the page asks about them (each seat every frame): once a seat comes round a second time, all are
  // known, and the rows with their walkway behind them can be put in order (below)
  const known = new Map();
  let sealed = false;
  const keyOf = (s) => s._tk || (s._tk = `${s.x.toFixed(2)},${s.z.toFixed(2)}`); // (kept on the seat: no string per frame)
  const planFor = (s) => {
    const key = keyOf(s);
    let P = cache.get(key);
    if (P) return P;
    const h1 = hash(s.x, s.z), h2 = hash(s.z + 3.1, s.x - 1.7), h3 = hash(s.x * 2.3, s.z * 0.7), h4 = hash(s.x * 0.37 + 9.1, s.z * 1.9);
    const yaw = seatYaw(s), fx = Math.sin(yaw), fz = Math.cos(yaw); // the seat's forward (towards the stage)
    const front = { x: s.x + fx * STAND_OFF, z: s.z + fz * STAND_OFF }; // where they stand to sit down
    // the walk between the door and the spot in front of the seat, as a polyline
    const pts = [];
    // a walkway in front of a row runs through the seated people's knees: keep walkers 0.1 m further out
    const lane0 = venue.lane(s), lane = lane0 + ((lane0 - s.z) * Math.cos(seatYaw(s)) > 0.15 ? Math.sign(lane0 - s.z) * 0.1 : 0);
    const door = typeof venue.door === 'function' ? venue.door(s) : venue.door;
    pts.push({ x: door.x, z: door.z });
    if (!venue.noAisle && venue.aisles.length) {
      const ax = venue.aisles.reduce((a, x) => (Math.abs(x - s.x) < Math.abs(a - s.x) ? x : a));
      if (venue.via) pts.push({ x: ax, z: venue.via });
      pts.push({ x: ax, z: lane });
    } else pts.push({ x: s.x + (h3 - 0.5) * 0.6, z: lane + 0.4 });
    // the walkway may run behind the seat (cabaret chairs with a table in front): step round the chair's side
    const laneFwd = (lane - s.z) * fz; // > 0: the walkway is in front of the seat
    if (laneFwd < 0.15) {
      // round the chair through the gap beside it, on the row-end side (the neighbours there are not in their seats while
      // this person passes: see order() below)
      const side = s._endSide || (pts[pts.length - 1].x < s.x ? -1 : 1);
      pts.push({ x: s.x + side * 0.3, z: lane });
      pts.push({ x: s.x + side * 0.3, z: s.z });
    } else pts.push({ x: front.x + (pts[pts.length - 1].x < s.x ? -0.3 : 0.3), z: lane });
    pts.push(front);
    const sm = chaikin(pts);
    let len = 0;
    sm[0].d = 0;
    for (let i = 1; i < sm.length; i++) { len += Math.hypot(sm[i].x - sm[i - 1].x, sm[i].z - sm[i - 1].z); sm[i].d = len; }
    P = {
      pts: sm, len, seatYaw: yaw, front, behind: laneFwd < 0.15,
      speed: 0.95 + 0.35 * h4, // m/s, their own pace
      arrives: h1 < 0.42, arriveAt: 1.5 + h2 * 38, // 42% walk in during the preview
      leaveAt: 1.5 + h3 * 34 + h1 * 6, coat: h2 < 0.55, // after: stand at leaveAt, coat or not, then go
    };
    cache.set(key, P);
    return P;
  };
  /**
   * Rows whose walkway runs behind them (cabaret chairs, the open mic's arcs): nobody can get past a seated neighbour.
   * Each half row (split at its middle) goes in and out through its own end: leaving, the end seat first, each person
   * waiting until the one beside them is out (2.4 s); arriving, the middle first, outwards, and if a seat nearer the end
   * is taken from the start, nobody further in walks in either. Decided once every seat is known.
   */
  let ordered = false;
  const order = () => {
    if (ordered || !sealed) return;
    ordered = true;
    const rows = new Map();
    for (const s of known.values()) { const P = planFor(s); if (!P.behind) continue; const k = s.row; (rows.get(k) || rows.set(k, []).get(k)).push(s); }
    for (const list of rows.values()) {
      list.sort((a, b) => a.x - b.x);
      const mid = (list[0].x + list[list.length - 1].x) / 2;
      for (const half of [list.filter((s) => s.x < mid).reverse(), list.filter((s) => s.x >= mid)]) { // each from the middle out
        const sideOf = half.length && half[0].x < mid ? -1 : 1;
        half.forEach((s) => { if (s._endSide !== sideOf) { s._endSide = sideOf; cache.delete(keyOf(s)); } });
        const P = half.map((s) => planFor(s));
        // leaving: the end seat (last in the list) first
        for (let i = P.length - 2; i >= 0; i--) P[i].leaveAt = Math.max(P[i].leaveAt, P[i + 1].leaveAt + 2.4);
        // arriving: the middle first; nobody walks in past someone seated from the start
        let blocked = false;
        for (let i = P.length - 1; i >= 0; i--) if (!P[i].arrives) { for (let j = 0; j < i; j++) P[j].arrives = false; blocked = true; break; }
        void blocked;
        for (let i = 1; i < P.length; i++) if (P[i].arrives && P[i - 1].arrives) P[i].arriveAt = Math.max(P[i].arriveAt, P[i - 1].arriveAt + P[i - 1].len / P[i - 1].speed + TURN_T + SIT_T);
      }
    }
  };
  const along = (P, d) => {
    d = Math.max(0, Math.min(P.len, d));
    const p = P.pts;
    let lo = 1, hi = p.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (p[m].d < d) lo = m + 1; else hi = m; }
    const a = p[lo - 1], b = p[lo];
    const seg = Math.max(1e-6, b.d - a.d), k = clamp01((d - a.d) / seg);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  };
  // the body's heading: the path direction averaged over the next and last 0.25 m (no snap at a vertex)
  const heading = (P, d) => {
    const a = along(P, d - 0.25), b = along(P, d + 0.25);
    return Math.hypot(b.x - a.x, b.z - a.z) > 1e-4 ? Math.atan2(b.x - a.x, b.z - a.z) : along(P, d).yaw;
  };
  const walker = (P, d, dir, dist) => {
    const w = along(P, d);
    const yaw = dir > 0 ? heading(P, d) : heading(P, d) + Math.PI;
    const ahead = dir > 0 ? heading(P, d + 0.9) : heading(P, d - 0.9) + Math.PI;
    const look = Math.max(-0.6, Math.min(0.6, angDiff(ahead, yaw) * 0.8));
    return { x: w.x, y: venue.yAt(w.z), z: w.z, yaw, stand: 1, walk: 1, dist, look, speed: P.speed };
  };
  /**
   * Where this seat's person is:
   *   null (seated as normal) | { hidden: true }
   *   { walk: 1, x, y, z, yaw, dist, look, stand: 1 }   walking (dist: metres walked so far, for the gait phase)
   *   { turn: k, x, y, z, yaw, dist, stand: 1 }         turning on the spot in front of the seat (k: 0 → 1)
   *   { sit: k, stand }  sitting down (k: 0 standing in front of the seat → 1 seated)
   *   { rise: k, stand } standing up (k: 0 seated → 1 standing in front of the seat)
   *   { stand: 1, coat: k, front: 1 }                    standing in front of the seat, putting a coat on
   * `stand` (0 seated … 1 standing) is kept for the shader-animated people.
   */
  // the latest answer is kept on the seat (people.js reads the full state from it; a plain property, no map lookups)
  const at = (s, mode, age) => {
    const key = keyOf(s);
    if (known.has(key)) sealed = true; else if (!sealed) known.set(key, s);
    order();
    const r = place(s, mode, age); s._loco = r; return r;
  };
  return at;
  function place(s, mode, age) {
    if (!mode || mode === 'live') return null;
    const P = planFor(s);
    const walkT = P.len / P.speed;
    if (mode === 'preview') {
      if (!P.arrives) return null;
      const t = age - P.arriveAt;
      if (t < 0) return { hidden: true };
      if (t < walkT) return walker(P, t * P.speed, 1, t * P.speed);
      const e = along(P, P.len), endYaw = heading(P, P.len - 0.01);
      if (t < walkT + TURN_T) {
        const k = (t - walkT) / TURN_T;
        return { turn: k, x: e.x, y: venue.yAt(e.z), z: e.z, yaw: endYaw + angDiff(P.seatYaw, endYaw) * smooth(k), dist: P.len + k * 0.5, stand: 1, look: angDiff(P.seatYaw, endYaw) * 0.5 * (1 - smooth(k)) };
      }
      const k = (t - walkT - TURN_T) / SIT_T;
      return k < 1 ? { sit: k, stand: 1 - smooth((k - 0.15) / 0.75) } : null;
    }
    if (mode === 'after') {
      const t = age - P.leaveAt;
      if (t < 0) return null;
      if (t < RISE_T) { const k = t / RISE_T; return { rise: k, stand: smooth((k - 0.1) / 0.75) }; }
      const coatT = P.coat ? COAT_T : 0;
      if (t < RISE_T + coatT) return { stand: 1, coat: (t - RISE_T) / coatT, front: 1 };
      const e = along(P, P.len), outYaw = heading(P, P.len - 0.01) + Math.PI;
      const t2 = t - RISE_T - coatT;
      if (t2 < TURN_T) {
        const k = t2 / TURN_T;
        return { turn: k, x: e.x, y: venue.yAt(e.z), z: e.z, yaw: P.seatYaw + angDiff(outYaw, P.seatYaw) * smooth(k), dist: k * 0.5, stand: 1, look: angDiff(outYaw, P.seatYaw) * 0.5 * (1 - smooth(k)) };
      }
      const walked = (t2 - TURN_T) * P.speed;
      const d = P.len - walked;
      if (d <= 0) return { hidden: true };
      return walker(P, d, -1, 0.5 + walked);
    }
    return null;
  }
}
