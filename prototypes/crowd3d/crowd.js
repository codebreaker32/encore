// Encore · the live 3D audience (club, theatre, open mic, arena), seen from the stage.
//
// Standalone (demo director):
//   ?venue=club|theatre|openmic|arena
//   &state=listen|laugh|cycle|murmur|preview|after   cycle: listen 4 s → laugh (close-up cut) → settle, every 10 s;
//                  preview: the room fills up before the set; after: the last applause fades, people stand and leave
//   &s=0..1        laugh (or finale) strength (default 0.85)
//   &q= or &preset=low|high|tv   tv: 960×540, no MSAA, 6 morphing people, everyone else shader-instanced
//   &rows= &front= &mid=   rows of seats, full avatars, CPU-skinned middle rows (low/high)
//   &shot=wide|close   force a camera; &t= seconds (with &still: freeze at t); &seed=; &res=540|720|1080
//   &shadows=1     real-time shadows from the key light; &hud=0 hides the HUD; &exposure= &key= (key light) &rim= (rim term)
//   &noaa / &aa    MSAA off / on whatever the preset says; &fps=    frame cap (tv: 30; 0 = none)
//   &ab=a,b,…      A/B switches that turn a GPU cost off (docs/crowd-visual-plan.md §0): norim (the people-only rim
//                  and fill terms), nopost (no final grain/vignette pass), nograin (the pass without its grain),
//                  aces (ACES + sRGB instead of Hejl and the venue grade), nodither, noorder (no front-to-back draw
//                  order), nofog (no fog in any shader), nohaze (no beams), nofront (no skinned front people; their
//                  places stay empty), noinst (no instanced crowd), noroom (no furniture, floor or walls); Batch 2 adds
//                  nophong, nowrap, noa2c, nosplit. Every switch costs nothing when off.
//                  Speed candidates: vlit (the instanced crowd lit per vertex), noalpha (no alpha mask or discard on
//                  the crowd), farsolid (none on the far and xfar bands), fold (the final pass folded into the tone
//                  map, no full-screen pass), halfinst / inst75 (half or three quarters of the instances: diagnostics),
//                  dynres (drop a step of lines on a cut while p90 > 34 ms; turns fold off), vsync (the fps cap counts
//                  vsyncs instead of comparing rAF times). tv defaults (P.fast):
//                  vlit, opaque crowd bodies with alpha on the near rows' hair cards only, no beams, 800×450; undo
//                  them with lambert, alpha, haze and &res=540
//                  Arena (round 7, tools/render/tv-sweep.md): nosprites, nostands, noglows, nosky, nophones (parts
//                  out), nosort, imphalf, floor30, rows4, rows3, mediump, fan9 (candidates), overdraw (every
//                  surface a flat 1/16 grey added up, depth test on; overdrawall: off; tools/render/overdraw.mjs).
//                  oldsetups: the six front mid shots instead of each venue's coverage (director.js); setupsee: every
//                  setup adds what it sees to the build.
//   &res=360       draw at 640×360 (also 450, 540, 720, 1080)
//   &log=1&label=  console.log a '[crowd] sweep <label> …' line with fps, p50, p90, max, calls and tris every 2 s (the
//                  TV sweep: tools/render/tv-sweep.md); the same numbers go out as the stats message
//   &false=1       false-colour exposure bands (display value: <0.03 blue, 0.16–0.20 green, 0.45–0.55 grey,
//                  0.65–0.75 yellow, >0.92 red); &mirror=0 no mirrored instances
//   &mic=1         show the performer's mic stand in the foreground (off by default)
//   &look=classic  the look before the stage's-eye one (look.js: dark house, spill on rows 0-1, silhouettes, mid shots);
//                  &look=stagedark the stage look with the theatre's house as dark as before 2026-10-14
//   &sound=sprite  one recorded clip per cue (default: a fresh layered mix per reaction, sound.js)
//   &capture=1     no render loop: window.__renderAt(t) draws one frame at t (for frame-exact videos)
//   &view=avatar&name=<Avatar>[&lod=lod|sil|far][&zoom]   one seated person, front and side views
//   keys: L or Enter = a laugh at &s, M = dead air on/off; the first click or key turns the sound on
// Hosted by the TV app (?host=1): no demo director; window 'message' (string or object), document 'message'
//   (react-native-webview) and window.encoreMessage take:
//     {type:'venue', venue, act}  {type:'shot', kind, focus?}  {type:'drive', drive}  (CrowdDrive, packages/crowd/src/drive.ts)
//     {type:'mode', mode:'preview'|'live'|'after'}  (live until the first mode message)
//     {type:'cue', id, strength}  {type:'duck', on}  (crowd sound: ids are the TV's SoundId names)
//     {type:'snap', key}  → replies {type:'thumb', key, uri} (a 320×180 JPEG data URI of the next frame)
//   and reports {type:'ready'}, {type:'stats', fps, ms, p50, p90, max, aa, calls, tris} every 2 s (frame intervals
//   over the last 120 frames) and {type:'audio', state} to window.ReactNativeWebView and window.parent. HUD only with
//   &hud=1.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rig, Face, Person, rng, noise, pruneEmptyMorphs, initMotion, laughRank, laughCast } from './people.js';
import { bakeType, InstancedCrowd } from './instances.js';
import { seatYaw, setPerformer, CLUB } from './venue.js';
import { THEATRE, OPENMIC } from './rooms.js';
import { ARENA } from './arena.js';
import { makeTraffic } from './traffic.js';
import { CrowdSound, cueFor } from './sound.js';
import { applyLook } from './look.js';
import { realMasks, realLit, realOptions, Catchlights } from './real.js';
import { buildSetups, pickSetup, PACE } from './director.js';

const Q = new URLSearchParams(location.search);
const PRESET_NAME = ['low', 'high', 'tv'].includes(Q.get('preset')) ? Q.get('preset') : ['low', 'high', 'tv'].includes(Q.get('q')) ? Q.get('q') : 'low';
// front: full avatars (skinned, live morphs). mid: rows behind them; 'merged' = simplified avatars CPU-skinned in
// one SkinnedMesh, 'inst' = baked + shader-animated instances. inst bands: rows drawn as instances, by level
// (lod ≈2.5–3.7k tris, sil ≈0.6–1.4k, far ≈0.3–1k, xfar ≈0.2–0.8k), one draw call per (level, avatar type).
// The instanced bands' avatar types (docs/crowd-visual-plan.md R6): the sil band (the rows nearest the camera) draws
// only avatars that are not in this venue's front; far and xfar may use all twelve, cheapest first, with women and men
// mixed. One draw call per (level, type).
const PRESETS = {
  low: { res: 720, aa: true, front: 8, frontDistinct: 8, frontFile: '', frontMat: 'standard', rows: 8, midRows: 3, mid: 'merged', midLevel: 'lod', midTypes: 12,
    inst: [{ from: 3, to: 99, level: 'far', types: 4 }], candle: true, barLight: false, tex: 'small', micStandard: true, atlas: '', halfRate: false, fps: 0, aniso: 4 },
  high: { res: 1080, aa: true, front: 16, frontDistinct: 12, frontFile: '', frontMat: 'standard', rows: 9, midRows: 6, mid: 'merged', midLevel: 'lod', midTypes: 12,
    inst: [{ from: 6, to: 99, level: 'sil', types: 4 }], candle: true, barLight: true, tex: 'large', micStandard: true, atlas: '', halfRate: false, fps: 0, aniso: 4 },
  // fast: the TV speed defaults from the Google TV sweeps (tools/render/tv-sweep.md): the instanced crowd lit per
  // vertex, opaque bodies with alpha only on the near rows' hair cards, no haze beams, 800×450
  tv: { res: 450, fast: true, aa: false, front: 6, frontDistinct: 6, frontFile: '.tv', frontMat: 'lambert', rows: 6, midRows: 0, mid: 'inst', midLevel: 'sil', midTypes: 0,
    inst: [{ from: 0, to: 1, level: 'sil', types: 6, closeLod: true }, { from: 2, to: 99, level: 'far', types: 6 }], // (rows 0-1: lod in close-ups only)
    candle: false, barLight: false, tex: 'small', micStandard: false, atlas: '_1k', halfRate: true, fps: 30, aniso: 1 },
};
const VENUES = { club: CLUB, theatre: THEATRE, openmic: OPENMIC, arena: ARENA };
const VENUE_ID = VENUES[Q.get('venue')] ? Q.get('venue') : 'club';
const V = VENUES[VENUE_ID];
{ const el = document.querySelector('.lower-third .venue'); if (el) el.innerHTML = V.title; }
const P = { ...PRESETS[PRESET_NAME], ...(V.presets[PRESET_NAME] || {}) };
const LOOK = applyLook(Q.get('look') || 'stage', V, VENUE_ID, P); // the stage's-eye look (look.js); &look=classic: the old one
if (VENUE_ID === 'arena' && new Set((Q.get('ab') || '').split(',')).has('rows3')) P.rows = 3; // (the arena's old three 3D rows)
if (VENUE_ID === 'arena' && new Set((Q.get('ab') || '').split(',')).has('rows4')) P.rows = 4; // (round 7: between the two)
// &ab=types4: at most four avatar types per instanced band (fewer draws: a page-JS diagnostic for the TV)
if (new Set((Q.get('ab') || '').split(',')).has('types4')) P.inst = P.inst.map((b) => ({ ...b, types: Math.min(b.types, 4) }));
// &ab=fartypes3: the bands from row 2 back (silhouettes in the stage look) at three avatar types (fewer draws and
// programs; the near rows keep their variety)
if (new Set((Q.get('ab') || '').split(',')).has('fartypes3')) P.inst = P.inst.map((b) => (b.from >= 2 ? { ...b, types: Math.min(b.types, 3) } : b));
// &ab=res405: draw at 720×405 (also &res=405)
if (new Set((Q.get('ab') || '').split(',')).has('res405')) P.res = 405;
P.mic = Q.get('mic') === '1'; // the performer's mic stand in the foreground: off (it read as a ball in front of the tables)
const num = (k, d) => (Q.has(k) && !isNaN(parseFloat(Q.get(k))) ? parseFloat(Q.get(k)) : d);
// A/B switches: each turns one GPU cost off, for the device tests (see the header)
const AB = new Set((Q.get('ab') || '').split(',').map((s) => s.trim()).filter(Boolean));
const ab = (k) => AB.has(k);
const FALSE_COLOUR = Q.get('false') === '1';
const MIRROR = Q.get('mirror') !== '0';
const FPS_CAP = Math.max(0, num('fps', P.fps || 0));
// &ab=vsync: the cap counts vsyncs (the render loop)
const VSYNC_CAP = ab('vsync'); // (round 5: the time cap had the better p90 in a club set, 49.7 vs 60.8 ms: tv default again)
const LOG = Q.get('log') === '1', LABEL = (Q.get('label') || [...AB].join('+') || 'base').replace(/[^\w+.-]/g, '');
const MODE =['listen', 'laugh', 'cycle', 'murmur', 'preview', 'after'].includes(Q.get('state')) ? Q.get('state') : 'listen';
const S = Math.min(1, Math.max(0, num('s', 0.85)));
const ROWS = Math.max(2, Math.min(14, Math.round(num('rows', P.rows))));
const FRONT = Math.max(0, Math.min(30, Math.round(num('front', P.front))));
const MID_ROWS = Math.min(ROWS, Math.round(num('mid', P.midRows)));
const RES = Math.round(num('res', P.res));
const STILL = Q.has('still');
const CAPTURE = Q.has('capture');
const T0 = num('t', 0);
const SHADOWS = Q.get('shadows') === '1';
const HOST = Q.get('host') === '1'; // driven by the TV app (CrowdDrive messages); no demo director
const HUD = HOST ? Q.get('hud') === '1' : Q.get('hud') !== '0';
if (HOST) document.body.classList.add('host');
const VIEW = Q.get('view') || 'room';
const SEED = Math.round(num('seed', 20261011));
// atlas order follows tools/avatars.json; each venue shuffles its own cast (buildRoom)
const AVATARS = ['Female_Adult_02', 'Male_Adult_04', 'Female_Adult_13', 'Male_Adult_07', 'Female_Adult_03', 'Male_Adult_10',
  'Female_Adult_04', 'Male_Adult_12', 'Female_Adult_12', 'Male_Adult_06', 'Female_Adult_17', 'Male_Adult_17'];
const isWoman = (name) => name.startsWith('Female');
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// ---------- the film look (docs/crowd-visual-plan.md R10) ----------
// The Hejl–Burgess-Dawson curve with this venue's grade (white balance, saturation, shadow lift) as compile-time
// constants (the page reloads on every venue change). Its output is already display-encoded, so the output colour
// space is Linear; fog and clear colours are therefore given as display values (`display()`). &ab=aces restores ACES
// with the sRGB curve. &false=1 replaces the result with exposure bands.
/** The drawing height for &res= (1080, 720, 540, 450 or 360; 16:9). */
function drawHeight(r) { return r >= 1080 ? 1080 : r >= 720 ? 720 : r >= 540 ? 540 : r >= 450 ? 450 : r >= 405 ? 405 : 360; } // (405: 720×405, a fifth fewer pixels than 450)
const DYNRES = ab('dynres') || (P.fast && !ab('nodynres')); // (tv default since 2026-10-16: &ab=nodynres keeps 800×450 fixed)
const FOLD = ab('fold') && !DYNRES; // the final pass folded into the tone map (its vignette is compiled for one size)
const EXPOSURE = num('exposure', 1.15);
const HEJL = !ab('aces');
if (HEJL) {
  const G = { wb: [1, 1, 1], sat: 0.92, lift: [0, 0, 0], ...(V.grade || {}) };
  const v3 = (a) => `vec3( ${a.map((x) => x.toFixed(4)).join(', ')} )`;
  const bands = FALSE_COLOUR ? `
     float fl = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
     c = fl < 0.03 ? vec3( 0.0, 0.15, 1.0 ) : fl < 0.16 ? vec3( fl * 0.5 ) : fl <= 0.2 ? vec3( 0.0, 0.9, 0.1 )
       : fl < 0.45 ? vec3( fl * 0.5 ) : fl <= 0.55 ? vec3( 0.55 ) : fl < 0.65 ? vec3( fl * 0.5 ) : fl <= 0.75 ? vec3( 1.0, 0.85, 0.0 )
       : fl <= 0.92 ? vec3( fl * 0.5 ) : vec3( 1.0, 0.0, 0.0 );` : '';
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 CustomToneMapping( vec3 color ) {
     color *= toneMappingExposure * ${v3(G.wb)};
     float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
     color = max( mix( vec3( l ), color, ${G.sat.toFixed(3)} ), 0.0 );
     vec3 x = max( vec3( 0.0 ), color - 0.004 );
     vec3 c = ( x * ( 6.2 * x + 0.5 ) ) / ( x * ( 6.2 * x + 1.7 ) + 0.06 );
     c = c + ${v3(G.lift)} * ( 1.0 - c );${FOLD ? `
     // the final pass folded in (&ab=fold): vignette and the lower-third band per lit fragment, no full-screen pass
     vec2 fuv = gl_FragCoord.xy / vec2( ${Math.round((drawHeight(RES) * 16) / 9)}.0, ${drawHeight(RES)}.0 );
     c *= ( 1.0 - 0.66 * clamp( ( length( ( fuv - vec2( 0.5, 0.54 ) ) / vec2( 0.78, 0.72 ) ) - 0.58 ) / 0.42, 0.0, 1.0 ) ) * ( 1.0 - 0.6 * clamp( ( 0.28 - fuv.y ) / 0.28, 0.0, 1.0 ) );` : ''}${bands}
     return c;
   }`);
}
/** A colour given as display values: fog and clear colours are uploaded unconverted in the output colour space. */
const display = (h) => (HEJL ? new THREE.Color().setRGB(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, THREE.LinearSRGBColorSpace) : new THREE.Color(h));

// ---------- renderer, scene, cameras ----------
const canvas = document.getElementById('c');
const AA = Q.has('noaa') ? false : Q.has('aa') ? true : !!P.aa;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: AA, stencil: false, precision: ab('mediump') ? 'mediump' : 'highp', powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
const CTX_AA = !!(renderer.getContext().getContextAttributes() || {}).antialias; // asked once, never per frame
let RH = drawHeight(RES), RW = Math.round((RH * 16) / 9); // (changed only by &ab=dynres, on a cut)
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.toneMapping = HEJL ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE;
renderer.outputColorSpace = HEJL ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = display(V.background ?? (V.stadium ? 0x05060c : 0x0a0706));
// linear haze, near black: the same shader programs in every shot (a cut never recompiles); the close-ups thicken it
// with depth so the rows behind the pair soften like a long lens
const FOG = V.fog;
scene.fog = ab('nofog') ? null : new THREE.Fog(display(V.fog.color), FOG.wide[0], FOG.wide[1]);
scene.matrixWorldAutoUpdate = false; // the people update their own bones; everything else is static

// ---------- lenses and shots (R3) ----------
// The wide camera stands upstage of the performer, a little higher and house right (+X), on a normal lens; the
// performer's eyes stay the target of everyone's gaze (and of the seats' yaw), 25–30° off the lens.
/** Vertical field of view of a full-frame lens on a 16:9 frame: 24 mm → 45.7°, 28 → 39.8°, 32 → 35.1°, 75 → 15.4°. */
const fovFor = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(10.125 / mm));
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, V.stadium ? 900 : 60);
const PERFORMER = new THREE.Vector3(...V.performer);
setPerformer(PERFORMER.x, PERFORMER.z);
const CAM = V.cam || { pos: [PERFORMER.x + 0.5, PERFORMER.y + 0.2, PERFORMER.z - 1.3], look: V.look, mm: 28 };
const SHOTS = {
  wide: { pos: new THREE.Vector3(...CAM.pos), look: new THREE.Vector3(...CAM.look), fov: fovFor(CAM.mm) },
  // the reaction and heckler shots: house right, three-quarter, long lenses (placed in buildRoom)
  close: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: fovFor(V.closeMm || 75) },
  heckler: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: fovFor(V.hecklerMm || 85) },
};
const camOf = (s) => { const c = new THREE.PerspectiveCamera(s.fov, 16 / 9, 0.05, 900); c.position.copy(s.pos); c.lookAt(s.look); c.updateMatrixWorld(); return c; };
let shot = '', cutAt = 0, cuts = 0, finaleCamAt = null;
// the wide and its two reaction variants from the same place (house right and house left halves of the room on 40 mm:
// inside the wide's own view, so they need no extra seats or furniture)
const WIDE0 = { pos: SHOTS.wide.pos.clone(), look: SHOTS.wide.look.clone(), fov: SHOTS.wide.fov };
let wideAt = 0, heldOn = null, closeOn = null;
function useWide(k) {
  wideAt = k;
  SHOTS.wide.pos.copy(WIDE0.pos);
  SHOTS.wide.fov = k ? fovFor(40) : WIDE0.fov;
  const d = WIDE0.look.clone().sub(SHOTS.wide.pos), a = k === 0 ? 0 : (k === 1 ? -1 : 1) * THREE.MathUtils.degToRad(11);
  SHOTS.wide.look.copy(SHOTS.wide.pos).add(d.applyAxisAngle(UPW_, a));
}
const UPW_ = new THREE.Vector3(0, 1, 0);
/** The setup on screen as the reaction shot (null on the wide and the heckler), and how it is lit. */
let curSetup = null, curFog = null;
function cut(name, setupIdx = -1) {
  if (name === shot && setupIdx < 0) return;
  shot = name;
  cutAt = room.now;
  cuts++;
  if (name === 'wide' && wideAt) useWide(0);
  curSetup = null;
  if (name === 'close' && CLOSES.length) {
    const i = setupIdx >= 0 ? setupIdx : pickClose();
    useClose(i); usedSetup(i);
    curSetup = CLOSES[i];
  }
  applyShotLight();
  if (DYNRES) dynamicRes();
  placeCamera(room.now);
  captionFor();
}
let featuredCut = -1;
/** A reaction shot that shows one person laughing hard: their voice a little forward in the mix (sound.js feature). */
function featureVoice(S) {
  if (!S || !S.seats.length || S.size === 'wide') return false;
  let best = null;
  for (const r of laughRank()) if (r.person.src && S.seats.includes(r.person.src) && (!best || r.score > best.score)) best = r;
  if (!best || best.score < 0.45) return false;
  let type = best.score > 0.7 ? 'roar' : 'giggle', gender = isWoman(best.name || '') ? 'f' : 'm';
  const me = laughCast().people.find((q) => q.person === best.person); // (the cast's own laugh type for this person)
  if (me) { type = me.type; gender = me.gender; }
  const v = new THREE.Vector3(best.person.src.x, eyesAt(best.person.src), best.person.src.z).project(camOf(S));
  return sound.feature({ gender, type, level: best.score, pan: v.x * 0.35 });
}
/**
 * The front people's bodies for this shot: the full body for whoever a close-up or a mid shot frames (and the heckler
 * in theirs), the drawn TV body for everyone else and in every wide. Called on each cut, so it never switches while a
 * shot is up.
 */
function setBodyDetail() {
  const lit = litNow();
  for (const p of people) {
    if (p.kind !== 'front') continue;
    if (p.bodyLow === undefined) { p.bodyLow = null; p.rig.model.traverse((o) => { if (o.isSkinnedMesh && HI_BODY.has(o.geometry)) { p.bodyMesh = o; p.bodyLow = o.geometry; p.bodyHi = HI_BODY.get(o.geometry); } }); }
    if (!p.bodyLow) continue;
    const hi = (lit === 'close' && p.focus) || (lit === 'heckler' && p.heckler);
    const g = hi ? p.bodyHi : p.bodyLow;
    if (p.bodyMesh.geometry !== g) p.bodyMesh.geometry = g;
  }
}
/** The shot's light: 'wide' (the wide, or a setup lit as the room is) or the reaction shot's light. */
// (a setup of the house, with no front people of its own, is lit as the wide is, whatever its `lit`: the reaction
// light dims everyone it isn't about, which on a house shot is everyone; the black-screen hunt, 2026-10-13. It keeps
// the reaction shot's wider spill.)
const houseShot = () => shot === 'close' && curSetup && !curSetup.seats.length;
const litNow = () => (shot === 'wide' || (shot === 'close' && curSetup && (curSetup.lit === 'wide' || !curSetup.seats.length)) ? 'wide' : shot);
function applyShotLight() {
  const lit = litNow(), wideLit = lit === 'wide', spill = !wideLit || (houseShot() && curSetup.lit === 'close');
  curFog = wideLit ? FOG.wide : FOG[lit] || FOG.wide;
  // (a setup further from its people than the reaction shots' 2.5-4 m pushes the close-up haze back with it)
  if (!wideLit && curSetup && curSetup.fogAt) curFog = [curFog[0] + curSetup.fogAt, curFog[1] + curSetup.fogAt];
  if (scene.fog) [scene.fog.near, scene.fog.far] = curFog;
  renderer.toneMappingExposure = EXPOSURE * ((V.exposure && V.exposure[lit]) ?? 1); // a uniform: no recompile
  // the close-ups are exposed for the pair: everyone behind them falls dark and reads by their rims
  showCloseLod(!wideLit);
  const dim = wideLit ? 1 : V.closeDim ?? 0.25;
  // (the near rows sit beside the subjects in a mid shot: they keep most of their light, or large bodies read as
  // faceless dummies; everyone else stays above pure black)
  for (const m of crowdMats) m.color.setScalar(wideLit ? 1 : m.userData.near ? Math.max(dim, 0.85) : Math.max(dim, 0.2));
  // the front people behind the subject too (the pair in a close-up, the heckler in theirs)
  for (const [m, who] of frontBgMats) m.color.setScalar(wideLit || (lit === 'heckler' && who.heckler) || (lit === 'close' && who.focus) ? 1 : dim);
  // (a close-up or mid shot: the stage spill opens wider, so the front rows beside and in front of the subjects are lit
  // people rather than big dark shapes; the wide keeps the narrow pool)
  if (V.closeKeyWiden) { key.angle = !spill ? K.angle : Math.min(1.25, K.angle * ((curSetup && curSetup.keyWiden) || V.closeKeyWiden)); key.penumbra = !spill ? K.penumbra ?? 0.75 : 0.8; } // (a setup may open the spill wider still, for people at the row ends)
  if (V.closeDimRoom && roomMat) roomMat.color.setScalar(wideLit ? 1 : 0.4);
  if (V.closeDimEmissive && emissiveMat) emissiveMat.color.setScalar(wideLit ? 1 : V.closeDimEmissive);
  setBodyDetail();
}
/**
 * &ab=dynres: on a cut, never mid-shot, step the drawing size down (540 → 450 → 360) while p90 over the last 120
 * frames is above 34 ms, and back up when it is under 22 ms. The canvas keeps its CSS size, so the frame only softens.
 */
const RES_STEPS = [360, 405, 450, 540, 720, 1080].filter((h) => h <= drawHeight(RES));
function dynamicRes() {
  if (frames < 90 || nIntervals < 60) return;
  const { p90 } = frameTimes(), i = RES_STEPS.indexOf(RH);
  const h = p90 > 34 && i > 0 ? RES_STEPS[i - 1] : p90 < 22 && i < RES_STEPS.length - 1 ? RES_STEPS[i + 1] : RH;
  if (h === RH) return;
  RH = h; RW = Math.round((RH * 16) / 9);
  renderer.setSize(RW, RH, false);
  if (camera.view && camera.view.enabled) camera.setViewOffset(1.3 * RW, RH, 0.3 * RW, 0, RW, RH);
  nIntervals = 0; iInterval = 0; // judge the new size on its own frames
  if (LOG) console.log(`[crowd] dynres ${RW}x${RH} (p90 was ${p90} ms)`);
}
/**
 * The camera of the current shot: a slow push-in over the first minute of live, a pull back for the finale and, on the
 * wide only, a faint drift (about ±0.04°, re-seeded on every cut). Close-ups are locked off. The bill (host
 * preview, where the menu covers the right side) shifts the room left with a view offset.
 */
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _look = new THREE.Vector3(), UPW = new THREE.Vector3(0, 1, 0);
function placeCamera(now) {
  const s = SHOTS[shot];
  if (!s) return;
  _fwd.copy(s.look).sub(s.pos);
  const dist = _fwd.length();
  _fwd.normalize();
  _right.crossVectors(_fwd, UPW).normalize();
  _up.crossVectors(_right, _fwd);
  camera.position.copy(s.pos);
  let fov = s.fov;
  if (shot === 'wide') {
    const live = room.mode === 'live' ? smooth01((now - room.modeAt) / 60) : 0; // a push-in you feel, not see
    if (room.finale && room.mode === 'live') { if (finaleCamAt === null) finaleCamAt = now; } else finaleCamAt = null;
    const back = finaleCamAt !== null ? smooth01((now - finaleCamAt) / 5) : 0;
    camera.position.addScaledVector(_fwd, 0.5 * live - 0.7 * back);
  }
  // Close-ups are locked off (no drift, no zoom creep), so the faces can be read; the wide only breathes. A setup may
  // track slowly sideways at a locked speed, or (the open mic) breathe like a handheld camera held still, and tilt.
  const S = shot === 'close' ? curSetup : null;
  _look.copy(s.look);
  if (S && S.track) { const tt = Math.min(Math.max(0, now - cutAt), 14); camera.position.addScaledVector(S.track, tt); _look.addScaledVector(S.track, tt); }
  const amp = shot === 'wide' ? (V.drift || 1) * 0.0007 : S ? S.drift : 0, sd = cuts * 7.31 + 3;
  camera.position.addScaledVector(_right, noise(sd + 2, now * 0.17) * 2.4 * amp).addScaledVector(_up, noise(sd + 3, now * 0.11) * 2.4 * amp);
  _look.addScaledVector(_right, noise(sd, now * 0.21) * amp * dist).addScaledVector(_up, noise(sd + 1, now * 0.14) * amp * dist);
  camera.lookAt(_look);
  if (S && S.roll) camera.rotateZ(S.roll);
  const bill = HOST && room.mode === 'preview';
  if (bill && !(camera.view && camera.view.enabled)) camera.setViewOffset(1.3 * RW, RH, 0.3 * RW, 0, RW, RH);
  if (!bill && camera.view && camera.view.enabled) { camera.clearViewOffset(); camera.aspect = RW / RH; }
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  lightView();
}

// ---------- light (R2): the key from the stage, house left, falling off with distance (decay 2) ----------
// Rim and fill are shader terms on the people only (PEOPLE_LIGHT below), so no scene light is added: every lit pixel
// pays for one spot and the hemisphere. The house lights (room.house) lift the hemisphere and the people fill, the
// key dims for the doors and after the set, and the glows brighten.
const LT = V.light;
const hemi = new THREE.HemisphereLight(LT.sky ?? 0x2a3040, LT.ground ?? 0x1a0e08, LT.hemi);
const HEMI_SKY = hemi.color.clone(), LAST_CALL_SKY = new THREE.Color(LT.lastCall ?? 0x8a9cc0);
scene.add(hemi);
const K = LT.key;
const KEY = num('key', K.intensity);
const key = new THREE.SpotLight(K.color || 0xffc48a, KEY, 0, K.angle, K.penumbra ?? 0.75, K.decay);
key.position.set(...K.pos);
key.target.position.set(...K.target);
scene.add(key, key.target);
const RIM = { dir: new THREE.Vector3(...(LT.rim?.dir || [0, 0.6, 0.8])).normalize(), color: new THREE.Color(LT.rim?.color ?? 0xffb070), k: num('rim', LT.rim?.k ?? 1) };
const FILL = { dir: new THREE.Vector3(...(LT.fill?.dir || [0, -0.3, -0.95])).normalize(), color: new THREE.Color(LT.fill?.color ?? 0xffc8a0), k: LT.fill?.k ?? 1, house: LT.fill?.house ?? 2 };
const peopleLight = {
  uRimColor: { value: new THREE.Color() }, uRimDir: { value: new THREE.Vector3() }, // view space, towards the source
  uFillColor: { value: new THREE.Color() }, uFillDir: { value: new THREE.Vector3() },
};
const PEOPLE_LIGHT = ab('norim') ? null : {
  uniforms: peopleLight,
  pars: 'uniform vec3 uRimColor; uniform vec3 uRimDir; uniform vec3 uFillColor; uniform vec3 uFillDir;',
  // after lights_fragment_end: a rim where the surface turns away from the lens and towards the source behind the
  // rows, and a wrapped fill (the stage floor's bounce, or the house lights)
  chunk: /* glsl */ `
  #ifdef KEY_DEPTH
  reflectedLight.directDiffuse *= FILL_SCALE; // (the stage look's arena: the stage key ends at the rail)
  #endif
  float rimF = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.directDiffuse += uRimColor * ( rimF * rimF * rimF ) * saturate( dot( geometryNormal, uRimDir ) + 0.35 ) * ( 0.25 + diffuseColor.rgb ) * RIM_SCALE;
  reflectedLight.indirectDiffuse += uFillColor * FILL_SCALE * ( 0.5 + 0.5 * dot( geometryNormal, uFillDir ) ) * BRDF_Lambert( diffuseColor.rgb );`,
  // the instanced crowd also scales the hemisphere (the house light) by its row depth²: the back rows fall dark
  hemi: THREE.ShaderChunk.lights_fragment_begin.replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * FILL_SCALE;'),
};
/** Give a people material (front avatars, the merged middle rows) the rim and fill terms. */
function peopleLit(m, rimScale = '1.0') {
  if (!PEOPLE_LIGHT) return m;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    Object.assign(sh.uniforms, PEOPLE_LIGHT.uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${PEOPLE_LIGHT.pars}\n#define RIM_SCALE ${rimScale}\n#define FILL_SCALE 1.0`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + PEOPLE_LIGHT.chunk);
  };
  const key0 = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key0() + '|people-' + rimScale;
  return m;
}
const _fd = new THREE.Vector3();
/** The people terms' directions in view space: after every camera move. */
function lightView() {
  peopleLight.uRimDir.value.copy(RIM.dir).transformDirection(camera.matrixWorldInverse);
  _fd.copy(FILL.dir).lerp(UPW, 0.7 * room.house).normalize(); // the house lights tilt the fill towards straight up
  peopleLight.uFillDir.value.copy(_fd).transformDirection(camera.matrixWorldInverse);
}
/** Light levels for the room's state (every frame): key, hemisphere, fill, rim, last call. */
/** &ab=vlit: the per-vertex crowd's light uniforms, in view space (after the camera has moved). */
// (tv default; &ab=lambert goes back to per-pixel Lambert, &ab=vlit turns it on elsewhere)
const VLIT = ab('vlit') || (P.fast && !ab('lambert')) ? { uKeyPos: { value: new THREE.Vector3() }, uKeyDir: { value: new THREE.Vector3() }, uKeyColor: { value: new THREE.Color() }, uKeyCos: { value: 0 }, uKeyPen: { value: 1 },
  uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uUp: { value: new THREE.Vector3() } } : null;
function vlitFrame() {
  if (!VLIT) return;
  const u = VLIT, vm = camera.matrixWorldInverse;
  u.uKeyPos.value.copy(key.position).applyMatrix4(vm);
  u.uKeyDir.value.copy(key.target.position).sub(key.position).normalize().transformDirection(vm);
  u.uKeyColor.value.copy(key.color).multiplyScalar(key.intensity);
  u.uKeyCos.value = Math.cos(key.angle); u.uKeyPen.value = Math.cos(key.angle * (1 - key.penumbra));
  u.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity); u.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
  u.uUp.value.set(0, 1, 0).transformDirection(vm);
}
function lightLevels() {
  key.intensity = KEY * room.key;
  // (a venue's bill: the stage spill opened wider while the room fills, V.previewWiden, so it isn't a dark room)
  if (V.previewWiden && V.closeKeyWiden && litNow() === 'wide' && !houseShot()) key.angle = room.mode === 'preview' ? Math.min(1.25, K.angle * V.previewWiden) : K.angle;
  hemi.intensity = LT.hemi + (LT.hemiHouse ?? 1.6) * room.house; // the house lights: a visible cool top light after the set
  hemi.color.copy(HEMI_SKY).lerp(LAST_CALL_SKY, room.lastCall);
  peopleLight.uRimColor.value.copy(RIM.color).multiplyScalar(RIM.k * (0.35 + 0.65 * room.key));
  // the people fill rises with the house lights: twice the set's level while the doors are open (house 0.6)
  peopleLight.uFillColor.value.copy(FILL.color).multiplyScalar(FILL.k * (1 + (LT.fillHouse ?? 1.67) * room.house));
}
const candle = P.candle && VENUE_ID === 'club' ? new THREE.PointLight(0xff9a4a, 0.9, 2.2, 2) : null;
if (candle) scene.add(candle);
if (P.barLight && VENUE_ID === 'club') {
  const barLight = new THREE.PointLight(0xff9a50, 6, 7, 1.6);
  barLight.position.set(-3.6, 2.6, V.room.back - 1.0);
  scene.add(barLight);
}
if (V.light.bar && PRESET_NAME !== 'tv') { // the open mic's bar hatch lights the back of the room from the side
  const b = V.light.bar, barLight = new THREE.PointLight(b.color, b.intensity, b.distance, 1.6);
  barLight.position.set(...b.pos);
  scene.add(barLight);
}
if (SHADOWS) {
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
}

// ---------- the room's state ----------
const capEl = document.getElementById('cut');
const room = {
  vocab: V.stadium ? 'stadium' : 'club', act: 'standup', events: [], murmur: MODE === 'murmur' ? 1 : 0, murmurId: 1, performer: PERFORMER, now: 0,
  attention: MODE === 'murmur' ? 0.3 : V.attention, warmth: 0, deadBits: 0, heckle: null, hecklerPos: null, spread: V.spread, house: 0,
  beat: V.beat || 0, mode: MODE === 'preview' || MODE === 'after' ? MODE : 'live', modeAt: 0, fill: 1, venueId: VENUE_ID,
  finale: MODE === 'after' ? { strength: S } : null, lastFinale: MODE === 'after' ? S : 0.6,
  key: 1, keyTarget: 1, lastCall: 0, // the stage key's level (dims for the doors and after the set) and "last call" after it
};
function captionFor() {
  if (!capEl) return;
  const laughing = room.events.some((e) => room.now - e.t > -0.1 && room.now - e.t < 4.5);
  const what = room.mode === 'preview' ? 'Doors open' : room.mode === 'after' ? 'House lights' : room.murmur > 0.5 ? 'Dead air' : laughing ? 'Laugh' : shot === 'close' ? 'Front table' : 'Wide';
  const why = room.mode === 'preview' ? 'the room fills up <span>· before the set</span>' : room.mode === 'after' ? 'the room empties <span>· after the set</span>'
    : room.murmur > 0.5 ? 'the room drifts <span>· test cue</span>'
    : laughing ? `the line landed <span>· test cue, strength ${S.toFixed(2)}</span>` : 'the room is listening <span>· test cue</span>';
  // only when it changes: rewriting the same HTML every half second made the WebView lay out and repaint it, which
  // the TV paid for as long frames
  const html = `<div class="what">${what}</div><div class="why">${why}</div>`;
  if (html !== capHtml) { capHtml = html; capEl.innerHTML = html; }
}
let capHtml = '';
/** The layout viewport in CSS px. Android's WebView reports `innerWidth` after its own zoom, so the stage fitted at the
 * wrong scale there and only its top-left quarter showed, at 2× (Google TV and the Android TV emulator, 2026-10-12). */
function viewport() {
  const d = document.documentElement;
  return { w: d.clientWidth || innerWidth, h: d.clientHeight || innerHeight };
}
const PREVIEW_KEY = num('previewkey', V.previewKey ?? 0.45); // the stage key while the room fills (the bill)
let pendingVenue = null; // (a venue change waiting for this frame to be kept: see onMessage)
/** The held frame of the previous venue gives way to this room (its first frame is on the canvas). */
function holdOff() {
  const img = document.getElementById('hold');
  if (img && img.style.display !== 'none') { img.style.display = 'none'; img.removeAttribute('src'); }
  try { sessionStorage.removeItem('encore-hold'); } catch (e) { /* none */ }
}
let frontShown = false, readySent = false; // (host: ready goes out once the front people are on screen)
function reportReady() {
  if (readySent || !HOST) return;
  readySent = true;
  const v = viewport(), r = canvas.getBoundingClientRect();
  report({ type: 'ready', load: loadLine(), view: `${v.w}×${v.h} css · dpr ${devicePixelRatio} · inner ${innerWidth}×${innerHeight} · canvas ${Math.round(r.width)}×${Math.round(r.height)} css, ${RW}×${RH} drawn` });
}
let stageFit = '';
function fitStage() {
  const tv = document.querySelector('.tv');
  const v = viewport();
  // the stage fills the viewport edge to edge: a viewport up to 12% off 16:9 is filled by scaling each axis on its
  // own (a few per cent of stretch, never a band of page background down one side, seen on the TV in APK o); only a
  // shape further off than that is letterboxed
  const kx = v.w / 1920, ky = v.h / 1080, k = Math.min(kx, ky);
  const fill = Math.abs(kx / ky - 1) < 0.12;
  const t = fill ? (Math.abs(kx - 1) > 0.001 || Math.abs(ky - 1) > 0.001 ? `scale(${kx}, ${ky})` : '') : Math.abs(k - 1) > 0.001 ? `scale(${k})` : '';
  tv.style.transformOrigin = '0 0';
  if (t !== stageFit) { tv.style.transform = t; stageFit = t; }
}
addEventListener('resize', fitStage);
if (window.visualViewport) visualViewport.addEventListener('resize', fitStage);
fitStage();
setInterval(fitStage, 2000); // (a WebView laid out again without a resize event still gets refitted)

// ---------- loading helpers ----------
const loader = new GLTFLoader();
/**
 * Load-phase timing (the TV took 35 s to its first ready, the box 5.6 s): phase marks in ms since the page's time
 * origin, and each GLB's fetch and parse. At the first frame one `[crowd] load …` line goes to the console and to the
 * host (report type 'load'; also the ready message's `load`).
 */
const LOADT = { marks: [], files: [], urls: new Set(), bake: 0, inst: 0, t: () => Math.round(performance.now()) };
const tmark = (name) => LOADT.marks.push([name, LOADT.t()]);
tmark('script');
/**
 * Every file the room needs, fetched once, at most five at a time, from script start: the tv pack ships
 * people/prefetch-tv.json (tools/render/manifest.mjs: each venue's GLBs and textures, the room's first and the front
 * people's slow .tv files last), and every load() and texture takes its bytes from here, so nothing is fetched twice.
 */
const fileBytes = new Map(); // url → Promise<ArrayBuffer>
const fetchQueue = [];
let fetchActive = 0;
function pumpFetches() {
  while (fetchActive < 5 && fetchQueue.length) {
    const job = fetchQueue.shift();
    fetchActive++;
    new THREE.FileLoader().setResponseType('arraybuffer').loadAsync(job.url).then(job.res, job.rej).finally(() => { fetchActive--; pumpFetches(); });
  }
}
function fetchBytes(url) {
  if (!fileBytes.has(url)) fileBytes.set(url, new Promise((res, rej) => { fetchQueue.push({ url, res, rej }); pumpFetches(); }));
  return fileBytes.get(url);
}
/** A texture from the shared bytes (a blob URL for the image decoder). */
async function loadTexture(url) {
  const buf = await fetchBytes(url);
  const u = URL.createObjectURL(new Blob([buf], { type: url.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
  try { return await texLoader.loadAsync(u); } finally { URL.revokeObjectURL(u); }
}
const PREFETCH = PRESET_NAME === 'tv' && !Q.has('noprefetch') ? fetch('people/prefetch-tv.json').then((r) => r.json()).then((m) => { for (const u of m[VENUE_ID] || []) fetchBytes(u); return true; }).catch(() => false) : Promise.resolve(false);
async function load(url) {
  const t0 = performance.now();
  const buf = await fetchBytes(url);
  const t1 = performance.now();
  const g = await loader.parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1));
  LOADT.files.push([url.replace(/^people\//, ''), Math.round(t1 - t0), Math.round(performance.now() - t1), Math.round(buf.byteLength / 1024)]);
  LOADT.urls.add(url);
  return g;
}
function loadLine() {
  const m = LOADT.marks.map(([n, t]) => `${n} ${(t / 1000).toFixed(1)}`).join(' · ');
  const f = LOADT.files.slice().sort((a, b) => b[1] + b[2] - a[1] - a[2]);
  const sum = (k) => LOADT.files.reduce((a, x) => a + x[k], 0);
  return `[crowd] load ${VENUE_ID} · s since start: ${m} · ${f.length} glb, fetch ${(sum(1) / 1000).toFixed(1)} s, parse ${(sum(2) / 1000).toFixed(1)} s (summed), ${(sum(3) / 1024).toFixed(1)} MB · crowd bake ${(LOADT.bake / 1000).toFixed(1)} s, crowd build ${(LOADT.inst / 1000).toFixed(1)} s · slowest ${f.slice(0, 4).map((x) => `${x[0]} ${x[1]}+${x[2]} ms`).join(', ')}`;
}
const texLoader = new THREE.TextureLoader();

/** Seat frame: origin on the floor under the seat, +Z towards the stage. */
const jR = rng(SEED + 3);
function makeSeat(s, jitter = false) {
  const seat = new THREE.Object3D();
  seat.position.set(s.x, s.y, s.z);
  seat.rotation.y = seatYaw(s);
  if (jitter) { // how this person sits (or stands) in their place: shifted a few cm, turned up to ±12°
    seat.translateX((jR() - 0.5) * 0.1); seat.translateZ((jR() - 0.5) * 0.1);
    seat.rotation.y += (jR() - 0.5) * 0.42;
  }
  scene.add(seat);
  seat.updateMatrixWorld(true);
  return seat;
}

/**
 * A one-channel alpha's mip chain that keeps, at every level, the share of texels passing the 0.5 alpha test: each
 * level is a 2×2 box of the one above, then its partial texels are scaled up until the share matches level 0 (thin
 * strands would otherwise fall under the cut at a distance and the hair cards break into holes).
 */
function coverageMips(data, w, h) {
  const share = (d, m) => { let n = 0; for (let i = 0; i < d.length; i++) if (d[i] * m >= 127.5) n++; return n / d.length; };
  const ref = share(data, 1), levels = [{ data, width: w, height: h }];
  let src = data, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const nw = Math.max(1, sw >> 1), nh = Math.max(1, sh >> 1), d = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.min(sh - 1, 2 * y) * sw, y1 = Math.min(sh - 1, 2 * y + 1) * sw;
      for (let x = 0; x < nw; x++) { const x0 = Math.min(sw - 1, 2 * x), x1 = Math.min(sw - 1, 2 * x + 1); d[y * nw + x] = (src[y0 + x0] + src[y0 + x1] + src[y1 + x0] + src[y1 + x1] + 2) >> 2; }
    }
    if (nw >= 4 && nh >= 4) {
      let lo = 1, hi = 3;
      for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (share(d, m) < ref) lo = m; else hi = m; }
      for (let i = 0; i < d.length; i++) d[i] = Math.min(255, Math.round(d[i] * hi));
    }
    levels.push({ data: d, width: nw, height: nh });
    src = d; sw = nw; sh = nh;
  }
  return levels;
}

/**
 * Skin on the front faces: a wrapped, warm terminator (light scattered under the skin: red where the stage light turns
 * away) instead of Lambert's hard, grey edge, so faces read warm and softly shaded rather than pale and flat. The
 * direct light's own term only; no extra lights or passes.
 */
const SKIN_DIRECT = [
  'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;',
  `float skinNL = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( skinNL );
	float skinWrap = saturate( ( skinNL + 0.35 ) / 1.35 );
	vec3 irradiance = ( dotNL + ( skinWrap - dotNL ) * vec3( 0.85, 0.36, 0.22 ) ) * directLight.color;`,
];
// real-v1 (real.js): the front people's skin, eyes and hands, the tv default (&ab=noreal turns it off, &ab=nospec drops
// only the specular lobes)
const REAL = !ab('noreal') && P.frontMat === 'lambert';
realOptions({ nospec: ab('nospec'), fill: !!PEOPLE_LIGHT });
const catchlights = REAL && !ab('nocatch') ? new Catchlights(scene, key) : null; // (&ab=nocatch: none)
function skinLit(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    for (const c of ['lights_lambert_pars_fragment', 'lights_physical_pars_fragment']) {
      if (!sh.fragmentShader.includes(`#include <${c}>`)) continue;
      const out = THREE.ShaderChunk[c].replace(SKIN_DIRECT[0], SKIN_DIRECT[1]);
      if (out === THREE.ShaderChunk[c]) console.warn(`[crowd] skin: ${c} has changed, the skin term is off`);
      sh.fragmentShader = sh.fragmentShader.replace(`#include <${c}>`, out);
    }
  };
  const key0 = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key0() + '|skin';
  return m;
}

// the TV models' full bodies (tools/tv_body.mjs: `<name>_bodyHi`, the source body, 3.5-4.8k triangles against the
// drawn body's 1.4-2k): taken out of the model at load, then swapped onto the body of the people a close-up or a mid
// shot frames, at the cut (setBodyDetail), so a shot never changes them while it is up
const HI_BODY = new WeakMap(); // the drawn body's geometry → the full body's geometry
function prepFront(gltf) {
  pruneEmptyMorphs(gltf.scene);
  {
    let low = null, hi = null;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh && /_bodyHi$/.test(o.name)) hi = o; else if (o.isSkinnedMesh && /_body$/.test(o.name)) low = o; });
    if (hi && REAL) realMasks(hi);
    if (hi) { hi.parent.remove(hi); if (low && !ab('nohibody')) HI_BODY.set(low.geometry, hi.geometry); else hi.geometry.dispose(); hi.material.dispose(); }
  }
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (P.frontMat === 'lambert') {
      // (tv: the hair cards cut at 0.4, not 0.5: the GPU's mips thin the strands' alpha at a distance)
      o.material = new THREE.MeshLambertMaterial({ map: m.map, alphaTest: m.alphaTest ? Math.min(m.alphaTest, 0.4) : 0, side: m.side, name: m.name });
      m.dispose();
    } else {
      m.roughness = 0.75; m.metalness = 0;
    }
    // (real-v1: skin and eyes on the heads, skin on the hands; &ab=noreal: skinLit on the heads, as before)
    if (REAL && o.isSkinnedMesh && !o.material.alphaTest) { realMasks(o); realLit(o.material, /head/.test(o.material.name || '') ? 'head' : 'body'); }
    else if (/head/.test(o.material.name || '') && !o.material.alphaTest) skinLit(o.material);
    if (!o.material.userData.people) { peopleLit(o.material); o.material.userData.people = true; }
    if (o.material.map) o.material.map.anisotropy = 4;
    o.castShadow = SHADOWS;
    o.frustumCulled = false;
  });
  // the renderer walks every visible node each frame (80 bones a person, 480 of the club's 612 nodes); the bones need
  // none of it (a skinned mesh updates its own skeleton), so each bone tree with no mesh in it is left out of the walk
  gltf.scene.traverse((o) => {
    if (!o.isBone || (o.parent && o.parent.isBone)) return;
    let mesh = false;
    o.traverse((c) => { if (c.isMesh) mesh = true; });
    if (!mesh) o.visible = false;
  });
  // WebGL 2 reads morph targets from a texture (built from geometry.morphAttributes), yet the renderer still walks every
  // morph attribute each frame and uploads each as a vertex buffer it never binds (59 attributes, 1.2 MB, for the six
  // tv avatars). Hidden from that walk (not enumerable), they are read only for the texture.
  if (renderer.capabilities.isWebGL2) gltf.scene.traverse((o) => {
    const ma = o.isMesh && o.geometry && o.geometry.morphAttributes;
    if (ma) for (const k of Object.keys(ma)) Object.defineProperty(ma, k, { value: ma[k], enumerable: false, writable: true, configurable: true });
  });
  return gltf.scene;
}

// a phone (dark body, lit screen) that follows the hands of whoever is on it; one draw call, only while in use
const phoneGeo = (() => {
  const body = new THREE.BoxGeometry(0.075, 0.008, 0.15).toNonIndexed();
  const screen = new THREE.PlaneGeometry(0.066, 0.135).rotateX(-Math.PI / 2).translate(0, 0.0045, 0).toNonIndexed();
  screen.deleteAttribute('uv'); body.deleteAttribute('uv');
  const paint = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set(c, i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  return mergeGeometries([paint(body, [0.02, 0.02, 0.025]), paint(screen, [0.75, 0.85, 1.0])]);
})();
const phoneMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
function makePhone(seat) {
  const m = new THREE.Mesh(phoneGeo, phoneMat);
  m.visible = false;
  m.name = 'phone';
  seat.add(m);
  return m;
}
function placePhone(p) {
  if (!p.phone) return;
  const on = !!p.phoneAt && p.rig.model.visible;
  if (on) {
    p.phone.position.copy(p.phoneAt); p.phone.position.y += 0.03; p.phone.position.z -= 0.01;
    p.phone.rotation.set(-0.75, 0, 0); // screen tipped up towards the face
    p.phone.updateMatrixWorld();
  }
  p.phone.visible = on;
}

// what the shots can see: people and furniture only where a camera looks (the wide, plus the close and heckler shots
// once buildRoom has placed them, so a close-up never shows empty seats behind the pair)
const viewCams = [camOf(SHOTS.wide)];
const _vp = new THREE.Vector3(), _vq = new THREE.Vector3();
function visibleFromShots(s, margin = 1.1) {
  for (const c of viewCams) {
    const p = _vp.set(s.x, s.y + 1.1, s.z).project(c), q = _vq.set(s.x, s.y + 0.2, s.z).project(c);
    if (Math.abs(p.x) < margin + 0.04 && Math.min(p.y, q.y) < 1.15 && Math.max(p.y, q.y) > -1.2 && p.z < 1) return true;
  }
  return false;
}
/** Seat-to-light falloff for furniture and the instanced people: decay 2 does most of the darkening now (R2d). */
// rows 0–2 keep the light; from row 3 each row darkens (the fill and the house light then scale by depth² as well)
const depthFor = (s) => (s.balcony ? 0.35 : clamp01(Math.max(V.depthFloor ?? 0.25, 1 - Math.max(0, s.row - (V.depthFrom ?? 2)) * (V.depthSlope ?? (V.stadium ? 0.06 : 0.12)))));
/** Eye height above the floor at a place: seated, or standing (the arena's floor). */
const eyesAt = (s) => (s.y || 0) + (s.standing ? 1.6 : 1.2);
const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
// what one instanced person of each avatar costs at the far and sil levels (triangles, people/people.json): far bands
// take the cheapest with at least two women (R13 in Batch 2 thins the women's hair cards, then the mix can be even)
const FAR_COST = { Male_Adult_12: 336, Male_Adult_17: 355, Male_Adult_10: 385, Male_Adult_06: 417, Male_Adult_07: 492, Male_Adult_04: 516,
  Female_Adult_02: 521, Female_Adult_12: 614, Female_Adult_13: 701, Female_Adult_17: 733, Female_Adult_03: 814, Female_Adult_04: 1001 };
const SIL_COST = { Male_Adult_12: 644, Male_Adult_17: 679, Male_Adult_10: 698, Male_Adult_06: 797, Male_Adult_07: 837, Female_Adult_02: 885,
  Male_Adult_04: 900, Female_Adult_12: 945, Female_Adult_13: 1048, Female_Adult_03: 1081, Female_Adult_17: 1097, Female_Adult_04: 1354 };

const people = []; // Person (front, and middle on low/high)
const crowdMats = []; // materials of everyone behind the front row (dimmed in close-ups)
const frontBgMats = new Map(); // front materials → the person wearing them (dimmed behind a close-up's subject)
let roomMat = null, emissiveMat = null; // (emissive: the room's unlit strips and signs, dimmed in a venue's close-ups where V.closeDimEmissive says) // the room's merged furniture (dimmed in close-ups where the rake fills the background)
const crowds = []; // InstancedCrowd
const stats = { front: 0, mid: 0, back: 0, sprites: 0 };
let closeTable = null, traffic = null;
// the reaction setups (buildRoom): pairs and groups across the front; cut() takes a new one for each close-up
let frontPairs = [];
let closeLodSwap = null; // { lod: InstancedCrowd, wide: [groups] } (the tv's near rows: lod only in close-ups)
function showCloseLod(on) {
  if (!closeLodSwap) return;
  closeLodSwap.lod.hidden = !on;
  for (const G of closeLodSwap.lod.groups) G.mesh.visible = on;
  for (const G of closeLodSwap.wide) G.mesh.visible = !on;
}
// every placed person's seat, and window.__faceProbe(): where their faces fall on screen (a box harness reads the
// frame's brightness there, by row: tools/render/faceprobe.mjs)
const placed = [];
window.__faceProbe = () => {
  const v = new THREE.Vector3(), r = renderer.domElement.getBoundingClientRect();
  return placed.map((s) => { v.set(s.x, eyesAt(s) + 0.02, s.z).project(camera); return { row: s.row, balcony: !!s.balcony, x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, z: v.z }; })
    .filter((q) => q.z < 1 && q.x > r.left && q.x < r.right && q.y > r.top && q.y < r.bottom);
};
const CLOSES = [];
let closeAt = 0;
const closeLog = []; // the setups used, most recent first
const _fp = new THREE.Vector3();
/** Whether a seat's head is inside a setup's frame (with a margin). */
function inFrame(S, s, margin = 1.1) {
  if (!S.cam) S.cam = camOf(S);
  _fp.set(s.x, eyesAt(s), s.z).project(S.cam);
  return _fp.z < 1 && Math.abs(_fp.x) < margin && Math.abs(_fp.y) < margin;
}
function useClose(i) {
  const S = CLOSES[i];
  if (!S) return;
  closeAt = i;
  SHOTS.close.pos.copy(S.pos); SHOTS.close.look.copy(S.look); SHOTS.close.fov = S.fov;
  // everyone the frame shows keeps the light (a lit setup never has dark front people near the lens), the subjects
  // first; a wide-lit setup lights everyone as the wide does
  const set = new Set(S.seats);
  for (const p of people) if (p.kind === 'front') p.focus = set.has(p.src) || S.lit === 'wide' || inFrame(S, p.src);
}
/** Each setup's featured people: the cut number they were last featured in (pickSetup damps them for a few cuts). */
const featured = new Map();
let setupCuts = 0, lastSize = null;
/** The laugh being cut to: its strength (the TV's reaction, or the demo's &s=). */
let cutStrength = S;
/**
 * The next reaction setup (director.js pickSetup): never one of the last three, preferring whoever is laughing most
 * visibly now (laughRank from people.js) unless they were just featured, a change of shot size, and on a big laugh
 * a wider setup. size 'wide' picks among the wide setups only (the wide's own variants).
 */
function pickClose(size = null) {
  const forced = num('setup', -1);
  if (forced >= 0 && forced < CLOSES.length && !size) return forced;
  const n = CLOSES.length;
  if (n < 2 && !size) return 0;
  const vis = new Map();
  for (const r of laughRank()) if (r.person.src) vis.set(r.person.src, r.score);
  const i = pickSetup({ setups: CLOSES, history: closeLog, vis, featured, strength: cutStrength, n: setupCuts, size, lastSize });
  if (i < 0) return size ? -1 : (closeAt + 1) % n;
  return i;
}
/** Book-keeping for a setup that went on screen. */
function usedSetup(i) {
  const S = CLOSES[i];
  setupCuts++;
  closeLog.unshift(i); closeLog.length = Math.min(closeLog.length, 6);
  lastSize = S.size;
  for (const s of S.seats) featured.set(s, setupCuts);
}

let motionReady = Promise.resolve(false);
async function buildRoom() {
  let addLod = null;
  const rows = V.layout(ROWS, P.balcony);
  // the pair the reaction shot frames: the front table nearest the centre line, or the two front-row places nearest it
  const tables = V.tables ? V.tables(rows) : [];
  closeTable = tables.length ? tables.reduce((a, t) => (Math.abs(t.x) + t.z * 0.5 < Math.abs(a.x) + a.z * 0.5 ? t : a)) : null;
  const wideSees = (s) => { const c = viewCams.length; viewCams.length = 1; const v = visibleFromShots(s); viewCams.length = c; return v; };
  if (!closeTable) {
    // (in the arena the 24 mm wide clears the barrier row, so the pair may be out of the wide)
    const seen0 = rows[0].seats.filter(wideSees);
    const row0 = (seen0.length >= 2 ? seen0 : rows[0].seats).slice().sort((a, b) => Math.abs(a.x - PERFORMER.x) - Math.abs(b.x - PERFORMER.x)).slice(0, 2).sort((a, b) => a.x - b.x);
    closeTable = { x: (row0[0].x + row0[1].x) / 2, z: Math.min(row0[0].z, row0[1].z) - 0.56, seats: row0 };
  }
  // the reaction shots (the TV's cut sheet showed the same pair for every laugh): three pairs across the front (the
  // centre table or pair and the nearest one to each side) on 75 mm, and two groups of four across neighbouring pairs
  // on 50 mm, all house right and three-quarter, at the subjects' eyes (they keep looking at the performer, 25–30° off
  // the lens). cut() takes a different setup for each reaction (pickClose); the heckler's shot, from the same side at
  // 85 mm, stays on the heckler, who sits in the front row on the other side of the centre table.
  const OFF = V.closeOffset || [1.4, 0.1, -2.1];
  const eyesOf = (ss) => new THREE.Vector3(ss.reduce((a, s) => a + s.x, 0) / ss.length, ss.reduce((a, s) => a + eyesAt(s), 0) / ss.length, ss.reduce((a, s) => a + s.z, 0) / ss.length);
  frontPairs = (() => {
    if (tables.length) {
      const row0 = tables.filter((t) => t.seats[0].row === 0).sort((a, b) => a.x - b.x);
      // the centre table and the two nearest it (either side), within 2.2 m: neighbours, not across the aisle
      const near = row0.slice().sort((a, b) => Math.abs(a.x - closeTable.x) - Math.abs(b.x - closeTable.x));
      return near.filter((t, k) => k === 0 || Math.abs(t.x - near[0].x) < 2.2).slice(0, 3).map((t) => t.seats);
    }
    const row0 = rows[0].seats.slice().sort((a, b) => a.x - b.x), i = row0.indexOf(closeTable.seats[0]);
    return [closeTable.seats, row0.slice(Math.max(0, i - 2), i), row0.slice(i + 2, i + 4)].filter((pr) => pr.length === 2 && Math.abs(pr[0].x - pr[1].x) < 1.2);
  })();
  // (sx -1: the same shot from house left; a mid shot stands 0.35 m higher, so the stage floor between the lens and the
  // front row doesn't fill the bottom of the frame)
  const setup = (ss, mm, k, label, sx = 1) => {
    const e = eyesOf(ss), up = k > 1.5 ? 0.35 : 0;
    // (a mid shot aims a little above the eyes, so its bottom edge clears the stage lip in front of the lens)
    return { label, seats: ss, fov: fovFor(mm), look: e.clone().add(new THREE.Vector3(0, up ? 0.12 : -0.03, 0)), pos: e.clone().add(new THREE.Vector3(OFF[0] * k * sx, OFF[1] + up, OFF[2] * k)) };
  };
  CLOSES.length = 0;
  const side = (pr) => (pr === frontPairs[0] ? 'centre' : pr[0].x > frontPairs[0][0].x ? 'house right' : 'house left'); // (+x is house right)
  if (V.midShots && !ab('oldsetups')) {
    // the stage look: each venue's own coverage (director.js), 8-10 setups of different sizes and angles, camera
    // poses only (&ab=oldsetups: the six front mid shots from before)
    const pair = (ss, mm, k, label, sx) => ({ ...setup(ss, mm, k, label, sx), guard: true });
    CLOSES.push(...buildSetups({ venue: VENUE_ID, rows, frontPairs, tables, eyesAt, fovFor, pair }));
  } else if (V.midShots) { // &look=stage: mid shots of the front people (the groups on 40 mm, all six on 35 mm), no faces filling the frame
    // (each from house right and from house left: six compositions, so laughs close together or a long set rarely
    // repeat a frame)
    for (const sx of [1, -1]) {
      for (const pr of frontPairs.slice(1)) CLOSES.push(setup([...frontPairs[0], ...pr], 40, 1.75, `group ${side(pr)}${sx < 0 ? ' from house left' : ''}`, sx));
      CLOSES.push(setup(frontPairs.flat(), 30, 1.7, sx < 0 ? 'front from house left' : 'front', sx));
    }
  } else {
    frontPairs.forEach((pr) => CLOSES.push(setup(pr, V.closeMm || 75, 1, side(pr))));
    for (const pr of frontPairs.slice(1)) CLOSES.push(setup([...frontPairs[0], ...pr], 50, 1.5, 'group ' + side(pr)));
  }
  // (the older setups: mid shots in the reaction light, picked as before)
  for (const S of CLOSES) Object.assign(S, { size: S.size || 'mid', lit: S.lit || 'close', w: S.w ?? 1, roll: S.roll || 0, drift: S.drift || 0, track: S.track || null, guard: S.guard ?? !S.size, fogAt: Math.max(0, S.pos.distanceTo(S.look) - 3.2) });
  const hkSeat = rows[0].seats.filter((s) => s.x < closeTable.x - 0.5 && Math.abs(s.x - closeTable.x) < 2).sort((a, b) => b.x - a.x)[0];
  if (hkSeat) {
    const he = new THREE.Vector3(hkSeat.x, eyesAt(hkSeat), hkSeat.z);
    SHOTS.heckler.look.copy(he).add(new THREE.Vector3(0, -0.04, 0));
    SHOTS.heckler.pos.copy(he).add(new THREE.Vector3(OFF[0] * 1.1, OFF[1], OFF[2] * 1.1));
  }
  // composition guard: the subjects' heads stay at least 22% below the top and clear of the caption and LIVE corners,
  // and on the 75 mm pairs the hands (on the table, in a lap, on the rail) stay below the frame while the heads have
  // room; the camera tilts up 2 cm at a time until both hold
  const guard = (S, heads, hands = []) => {
    const c = new THREE.PerspectiveCamera(S.fov, 16 / 9, 0.05, 900), v = new THREE.Vector3();
    for (let k = 0; k < 40; k++) {
      c.position.copy(S.pos); c.lookAt(S.look); c.updateMatrixWorld();
      const tops = heads.map((p) => { v.copy(p).project(c); return [(1 - v.y) / 2, (v.x + 1) / 2]; });
      const bad = tops.some(([top, x]) => top < 0.22 || (top < 0.3 && (x < 0.34 || x > 0.8)));
      const handsIn = hands.some((p) => { v.copy(p).project(c); return v.y > -1.02 && Math.abs(v.x) < 1; });
      if (!bad && !(handsIn && tops.every(([top]) => top < 0.4))) return;
      S.look.y += 0.02;
    }
  };
  const headTop = (s) => new THREE.Vector3(s.x, eyesAt(s) + 0.15, s.z);
  const handsAt = (s) => new THREE.Vector3(s.x, s.standing ? eyesAt(s) - 0.5 : s.y + (s.cabaret ? 0.78 : 0.66), s.z - (s.cabaret ? 0.45 : 0.22)); // (on the table, in a lap, on the rail)
  for (const S of CLOSES) if (S.guard) guard(S, S.seats.map(headTop), S.seats.length === 2 ? S.seats.map(handsAt) : []);
  if (hkSeat) guard(SHOTS.heckler, [headTop(hkSeat)], [handsAt(hkSeat)]);
  useClose(Math.max(0, Math.min(CLOSES.length - 1, num('setup', 0))));
  viewCams.length = 1;
  if (hkSeat) viewCams.push(camOf(SHOTS.heckler));
  // (what gets built follows the wide and the reaction-lit setups; a wide-lit setup shows what those built, so the new
  // coverage adds no people or furniture: &ab=setupsee lets every setup add what it sees)
  for (const S of CLOSES) if (S.lit === 'close' || ab('setupsee')) viewCams.push(camOf(S));
  P.lampFix = !ab('oldlamps'); // (the lamps' glows in front of their lenses: see venue.js)
  // (arena.js: the sprite tiers. tv default since round 4: outline sprites, nearest first, no upper ring: 51 ms p50 vs 81;
  // &ab=quadsprites, &ab=alltiers bring back the quads and the full bowl)
  const tvArena = !!P.fast;
  P.arenaAB = { fan9: ab('fan9'), nosprites: ab('nosprites'), nostands: ab('nostands'), noglows: ab('noglows'), nosky: ab('nosky'), nophones: ab('nophones'), imphalf: ab('imphalf'), floor30: ab('floor30'), sort: (ab('spritesort') || (tvArena && !ab('quadsprites'))) && !ab('nosort'), few: ab('fewtiers') || (tvArena && !ab('alltiers')), shape: ab('spriteshape') || (tvArena && !ab('quadsprites')), imp: !ab('noimpostor'), pills: ab('pillsprites'), pillImp: ab('pillimpostors') }; // (imp: the far stands as impostor blocks wherever fewtiers leaves them out)
  tmark('setups');
  const venue = V.build(scene, rows, P, (s) => visibleFromShots(s, 1.2), depthFor);
  tmark('venue geometry');
  const lookGlows = LOOK && LOOK.extras(rows, { eyesAt, seen: (s) => visibleFromShots(s), hazeLite: ab('hazelite') }); // (&ab=hazelite: half the haze points behind the rows, each a little larger)
  if (lookGlows) { Object.assign(lookGlows.material.uniforms, { scale: venue.points.material.uniforms.scale, time: venue.points.material.uniforms.time }); scene.add(lookGlows); }
  scene.traverse((o) => { if (o.name === 'room') roomMat = o.material; if (o.name === 'room-emissive') emissiveMat = o.material; });
  stats.sprites = venue.spriteCount || 0;
  // the room's walkways for arrivals and departures; floor height by depth from the rows (steps on the rake)
  const sorted = rows.filter((r) => !r.balcony).slice().sort((a, b) => a.z - b.z);
  const yAt = (z) => { let y = 0; for (const r of sorted) if (z >= r.z - (r.cabaret ? 1.05 : 0.55)) y = r.y; return y; };
  traffic = makeTraffic({ yAt, ...(V.traffic || {}) });
  // (plus the front-row places beside the pair: the arena's wide clears the barrier, but its close-up is at the rail)
  // (the close-up setups' pairs come first, so every reaction shot frames skinned people with faces)
  const want = new Set(frontPairs.flat());
  const seats = rows.flatMap((r) => r.seats).filter((s) => visibleFromShots(s) || want.has(s) || (s.row === 0 && Math.abs(s.x - closeTable.x) < 1.9));
  const score = (s) => (want.has(s) ? -10 : 0) + s.row + Math.abs(s.x - closeTable.x) * 0.45;
  const frontSeats = seats.filter((s) => s.row < (V.frontRows || 2)).sort((a, b) => score(a) - score(b)).slice(0, FRONT);
  const frontSet = new Set(frontSeats);
  const mates = new Map();
  for (const pr of [...tables.map((t) => t.seats), ...frontPairs]) { mates.set(pr[0], pr[1].x > pr[0].x ? 1 : -1); mates.set(pr[1], pr[0].x > pr[1].x ? 1 : -1); }
  const rest = seats.filter((s) => !frontSet.has(s));
  const R = rng(SEED);
  // a couple of phone users and one bored chin-rester in the front, idle variety elsewhere
  const idleFor = (i, isFront) => {
    const k = R();
    if (isFront) return ['still', 'folded', 'lean', 'chin', 'still', 'phone', 'folded', 'still'][i % 8];
    return k < 0.05 ? 'phone' : k < 0.1 ? 'chin' : k < 0.25 ? 'folded' : k < 0.4 ? 'lean' : 'still';
  };
  // ---- casting (R6): every venue shuffles its own cast, so switching venue changes the faces ----
  const cR = rng((SEED ^ hashStr(VENUE_ID)) | 0);
  const order = [...AVATARS];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(cR() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  // the front: no twins, and at least two women and two men among them
  const nd = Math.min(P.frontDistinct, order.length);
  const cast = [];
  for (const n of order) {
    if (cast.length >= nd) break;
    const w = cast.filter(isWoman).length, m = cast.length - w, left = nd - cast.length;
    if (isWoman(n) ? m < 2 && left <= 2 - m : w < 2 && left <= 2 - w) continue; // keep the last places for the other half
    cast.push(n);
  }
  for (const n of order) if (cast.length < nd && !cast.includes(n)) cast.push(n);
  // a venue's own cast (R6/h: each avatar in at most two venues' front sixes), then the shuffle for any extra places
  if (V.cast && nd <= V.cast.length) cast.splice(0, cast.length, ...V.cast.filter((n) => AVATARS.includes(n)).slice(0, nd));
  // (the heroes sit in different places in each venue: the cast's women and men shuffled on the venue's own seed and
  // interleaved, so the centre table isn't the same two people everywhere)
  if (V.cast && nd <= V.cast.length) {
    const cR = rng(SEED + [...VENUE_ID].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    const mix = (a) => a.map((n) => [cR(), n]).sort((x, y) => x[0] - y[0]).map(([, n]) => n);
    const W = mix(cast.filter(isWoman)), M = mix(cast.filter((n) => !isWoman(n)));
    const first = cR() < 0.5 ? W : M, second = first === W ? M : W;
    cast.splice(0, cast.length, ...first.flatMap((n, i) => (second[i] ? [n, second[i]] : [n])), ...second.slice(first.length));
  }
  const pool = order.filter((n) => !cast.includes(n)); // everyone else: the rows behind never show a front face up close
  if (pool.length < 4) pool.push(...order.filter((n) => !pool.includes(n)).reverse()); // high: twelve in front, so the rows behind share them
  stats.cast = cast;

  // ---- front: full avatars, faces driven by morph targets ----
  const src = {};
  // seats are ordered outwards from the close-up table; when there are fewer models than seats (low, high), a repeat
  // goes to the far side of the row from its twin
  const frontNames = frontSeats.map((s, i) => {
    if (i < nd) return cast[i];
    let twin = 0;
    for (let j = 1; j < nd; j++) if (Math.abs(frontSeats[j].x - s.x) > Math.abs(frontSeats[twin].x - s.x)) twin = j;
    return cast[twin];
  });
  // (the crowd's atlas and alpha start loading now, alongside the front people)
  const texReady = Promise.all([loadTexture(`people/lod_atlas${P.atlas}.jpg`), P.atlas ? alphaR8() : loadTexture('people/lod_alpha.png')]);
  LOADT.urls.add(`people/lod_atlas${P.atlas}.jpg`); if (P.atlas) LOADT.urls.add('people/lod_alpha_512.r8');
  // the front people stream in after the room's first frame (their .tv files are the slowest to load): addFront, from
  // main; capture and still frames wait for them
  // (their bytes are prefetched; the parses, 2.5-4.6 s each on the TV's A55 and on the main thread, wait for addFront,
  // after the room's first frame, one at a time with a frame between them)
  const yieldFrame = () => new Promise((r) => (STILL || CAPTURE ? r() : requestAnimationFrame(() => setTimeout(r, 0))));
  const loadFront = async () => { for (const n of new Set(frontNames)) { src[n] = prepFront(await load(`people/${n}${P.frontFile}.glb`)); await yieldFrame(); } tmark('front glbs'); };
  const addFront = async () => {
  await loadFront();
  await motionReady; // (the people's motion clips)
  if (!ab('nofront')) frontSeats.forEach((s, i) => {
    const seat = makeSeat(s, !s.rail);
    const model = SkeletonUtils.clone(src[frontNames[i]]);
    seat.add(model);
    const rig = new Rig(seat, model);
    const neighbour = mates.get(s) || 0; // the side their tablemate (or the friend beside them) sits on
    const standing = !!s.standing;
    const p = new Person(rig, new Face(model), { seed: SEED + i * 101, row: s.row, x: s.x, table: s.cabaret, seatH: 0.46, idle: standing ? 'still' : idleFor(i, true), neighbour, stand: standing, standHands: s.rail ? 'rail' : 'down' });
    p.kind = 'front'; p.name = frontNames[i]; p.src = s; placed.push(s);
    p.home = { pos: seat.position.clone(), yaw: seat.rotation.y };
    p.phone = makePhone(seat);
    p.focus = CLOSES[closeAt] ? CLOSES[closeAt].seats.includes(s) : closeTable.seats.includes(s);
    // the skeleton is recomputed (and its bone texture uploaded) only on frames where this person was posed or moved:
    // on the TV's half-rate frames the bones haven't changed (p.skelDirty, cleared after each render)
    p.skelDirty = true;
    const sks = new Set();
    model.traverse((o) => { if (o.isSkinnedMesh) sks.add(o.skeleton); });
    for (const sk of sks) { const up = sk.update.bind(sk); sk.update = () => { if (p.skelDirty || STILL || CAPTURE) up(); }; }
    people.push(p);
  });
  stats.front = frontSeats.length;
  for (const p of people) if (p.kind === 'front') p.rig.model.traverse((o) => { if (o.isMesh && !frontBgMats.has(o.material)) frontBgMats.set(o.material, p); });
  if (catchlights) for (const p of people) if (p.kind === 'front') catchlights.add(p, p.rig.model);
  const hk = people.find((p) => p.kind === 'front' && p.src === hkSeat) || people.filter((p) => p.kind === 'front' && p.o.row === 0 && p.o.x < closeTable.x - 0.5).sort((a, b) => b.o.x - a.o.x)[0];
  if (hk) {
    hk.heckler = true;
    room.hecklerPos = hk.rig.seat.localToWorld(new THREE.Vector3(0, hk.o.stand ? 1.6 : 1.15, 0));
  }
  return people.filter((p) => p.kind === 'front');
  };

  // ---- atlas for everyone who is not in the front ----
  // tv: the hair alpha as one 8-bit channel (0.35 MB on the GPU instead of 1.4 MB as RGBA; tools/textures.py r8)
  async function alphaR8() {
    const buf = await fetchBytes('people/lod_alpha_512.r8');
    const t = new THREE.DataTexture(new Uint8Array(buf), 512, 512, THREE.RedFormat, THREE.UnsignedByteType);
    t.mipmaps = coverageMips(t.image.data, 512, 512); // (the GPU's own mips let the hair cards erode into holes)
    t.generateMipmaps = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  }
  const [atlas, alpha] = await texReady;
  tmark('front people, textures');
  atlas.flipY = false; atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = P.aniso;
  alpha.flipY = false;
  const shared = { uTime: { value: 0 }, uBeat: { value: room.beat }, light: PEOPLE_LIGHT, vlit: VLIT, clothFix: !ab('oldcloth'), rimFlat: !!V.rimFlat, keyDepth: !!V.keyDepth, uMaskOut: { value: 0 } };
  crowds.shared = shared;

  const midSeats = P.mid === 'merged' ? rest.filter((s) => s.row < MID_ROWS) : [];
  if (midSeats.length) {
    // simplified avatars merged into ONE skinned mesh (one draw call), bones still per person (CPU IK like the front)
    const names = midSeats.map((s, i) => order[(i * 5 + s.row * 3) % Math.min(P.midTypes, order.length)]);
    const srcLod = {};
    await Promise.all([...new Set(names)].map(async (n) => { srcLod[n] = await load(`people/${n}.${P.midLevel}.glb`); }));
    const geoms = [], bones = [], inverses = [];
    midSeats.forEach((s, i) => {
      const seat = makeSeat(s, true);
      const model = SkeletonUtils.clone(srcLod[names[i]].scene);
      let sk = null;
      model.traverse((o) => { if (o.isSkinnedMesh) sk = o; });
      seat.add(model);
      const rig = new Rig(seat, model);
      const p = new Person(rig, null, { seed: SEED + 5000 + i * 37, row: s.row, x: s.x, table: s.cabaret, seatH: s.cabaret ? 0.46 : 0.45, idle: idleFor(i, false) });
      p.kind = 'mid'; p.name = names[i]; p.src = s; placed.push(s);
      p.home = { pos: seat.position.clone(), yaw: seat.rotation.y };
      people.push(p);
      const g = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv', 'skinWeight']) g.setAttribute(k, sk.geometry.getAttribute(k));
      const si = sk.geometry.getAttribute('skinIndex');
      const arr = new Uint16Array(si.array.length);
      for (let j = 0; j < arr.length; j++) arr[j] = si.array[j] + bones.length;
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(arr, 4));
      g.setIndex(sk.geometry.index);
      geoms.push(g);
      bones.push(...sk.skeleton.bones);
      inverses.push(...sk.skeleton.boneInverses);
      sk.parent.remove(sk);
    });
    const mat = peopleLit(new THREE.MeshLambertMaterial({ map: atlas, alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide }), '0.8');
    crowdMats.push(mat);
    const merged = new THREE.SkinnedMesh(mergeGeometries(geoms), mat);
    merged.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    merged.frustumCulled = false;
    merged.castShadow = SHADOWS;
    merged.name = 'middle-rows';
    scene.add(merged);
    merged.updateMatrixWorld(true);
  }
  stats.mid = midSeats.length;

  // ---- everyone else: baked + shader-animated instances, one draw per (level, avatar type), darker towards the back ----
  const midSet = new Set(midSeats);
  const instSeats = rest.filter((s) => !midSet.has(s));
  // static per-person variety for the instances: clothing tone, mirror, build, a shift in the seat, body yaw, side lean
  const vR = rng(SEED + 77);
  const variety = (s) => ({
    hue: vR() < 0.6 ? (vR() - 0.5) * 2.6 : 0,
    sat: vR() < 0.3 ? 0.3 + vR() * 0.35 : 0.8 + vR() * 0.4,
    val: 0.62 + vR() * 0.5,
    depth: depthFor(s) * (0.93 + vR() * 0.14),
    fold: vR() < 0.2,
    mirror: vR() < 0.5 && MIRROR,
    sx: 0.95 + vR() * 0.1, sy: 0.96 + vR() * 0.08,
    yaw: (vR() - 0.5) * (s.rail ? 0.15 : 0.42), tilt: (vR() - 0.5) * 0.09,
    dx: (vR() - 0.5) * 0.1, dz: s.rail ? 0 : (vR() - 0.5) * 0.12,
  });
  // two empty seats in the back half (a full house, not a wall), and people standing by the bar
  const eR = rng(SEED + 5);
  const backHalf = instSeats.filter((s) => s.row >= 3 && !s.standing);
  // (a full house, not a wall: two empty seats, more in a big room: the theatre's rows read as a grid without them)
  const nEmpty = Math.max(2, Math.round(backHalf.length * (V.emptyShare || 0)));
  const empty = new Set(Array.from({ length: backHalf.length ? nEmpty : 0 }, () => backHalf[Math.floor(eR() * backHalf.length)]));
  // avatar types per band (R6): the near bands draw only avatars that are not in this front; far and xfar may use all
  // twelve. Each band takes its cheapest types with at least two women.
  const cheapest = (list, k, cost) => {
    const byCost = [...list].sort((a, b) => cost[a] - cost[b]), out = byCost.slice(0, k);
    for (const wmn of byCost.filter(isWoman)) {
      if (out.filter(isWoman).length >= Math.min(2, k) || out.includes(wmn)) continue;
      const drop = out.map((n, i) => [n, i]).filter(([n]) => !isWoman(n)).pop();
      if (drop) out[drop[1]] = wmn;
    }
    return out;
  };
  // (row 0 always counts as near: the front six and their look-alikes stay out of the instanced front row)
  // the lit near rows leave out the two whose clothes break up seated (a skirt plate, a shorts hem: the 2026-10-12 review)
  const nearPool = pool.filter((n) => n !== 'Female_Adult_02' && n !== 'Female_Adult_12');
  const nearTypes = nearPool.length >= 3 ? nearPool : pool;
  const typesFor = (band) => (band.level === 'sil' || band.level === 'lod' || band.from === 0 ? cheapest(band.from <= 1 && band.level !== 'xfar' && band.level !== 'far' ? nearTypes : pool, band.types, band.level === 'xfar' || band.level === 'far' ? FAR_COST : SIL_COST) : cheapest(order, band.types, FAR_COST));
  // a constrained greedy assignment instead of a repeating stride: never the same avatar within two places in a row,
  // or straight in front or behind; otherwise the type with the least of itself nearby
  const aR = rng(SEED + 31), near = [];
  const typeFor = (s, types) => {
    let best = types[0], bc = Infinity;
    for (const t of types) {
      let c = aR() * 0.01;
      for (const q of near) {
        if (q.t !== t) continue;
        const dx = Math.abs(q.x - s.x), dz = Math.abs(q.z - s.z);
        if ((q.row === s.row && dx < 1.3) || (Math.abs(q.row - s.row) === 1 && dx < 0.45)) c += 100;
        c += 1 / (0.15 + Math.hypot(dx, dz));
      }
      if (c < bc) { bc = c; best = t; }
    }
    near.push({ t: best, x: s.x, z: s.z, row: s.row });
    return best;
  };
  const plan = [];
  for (const band of P.inst) {
    const list = instSeats.filter((s) => s.row >= band.from && s.row <= band.to && !empty.has(s)).sort((a, b) => a.row - b.row || a.x - b.x);
    const types = typesFor(band);
    list.forEach((s, i) => plan.push({ s, level: band.level, type: typeFor(s, types), i, stand: !!s.standing, hands: s.rail ? 'rail' : 'down' }));
  }
  const lastRow = rows.filter((r) => !r.balcony).pop();
  V.standing.forEach((st, k) => plan.push({ s: { x: st.x, y: lastRow.y, z: st.z, row: Math.min(rows.length, 3), standing: true, bar: true }, level: 'sil', type: pool[(k * 2 + 1) % pool.length], stand: true, hands: 'drink' }));
  if (plan.length && !ab('noinst')) {
    // &ab=noalpha: no alpha mask (and no discard) anywhere in the crowd; &ab=farsolid: none in the far and xfar bands
    const solid = { map: atlas, side: THREE.DoubleSide }, cut = { map: atlas, alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide };
    // tv (fast): opaque bodies everywhere, and the near bands keep the alpha test on their hair cards only (a second
    // group of the same draw); &ab=alpha goes back to whole bodies alpha-tested
    const fastAlpha = P.fast && !ab('alpha');
    const near = (level) => level === 'sil' || level === 'lod';
    const c = await instanced(plan, ab('noalpha') || fastAlpha ? solid : cut, variety,
      (level) => (ab('farsolid') && (level === 'far' || level === 'xfar') ? solid : null),
      (level) => (fastAlpha && !ab('noalpha') && near(level) ? cut : null));
    // diagnostics: draw half (&ab=halfinst) or three quarters (&ab=inst75) of the instances
    const share = ab('halfinst') ? 0.5 : ab('inst75') ? 0.75 : 1;
    if (share < 1) for (const G of c.groups) G.mesh.geometry.instanceCount = Math.ceil(G.people.length * share);
    crowds.push(c);
    c.groups.forEach((G) => [].concat(G.mesh.material).forEach((m) => { m.userData.near = /instances-(sil|lod):/.test(G.mesh.name); crowdMats.push(m); }));
    // a band with closeLod (tv): the same places again on the lod level, drawn only in close-ups and mid shots, where
    // they are large; the wide keeps the cheaper level (the TV lost 5-7 fps with lod in every shot)
    const lodBands = P.inst.filter((b) => b.closeLod && !ab('lodalways'));
    // (only the places some close-up setup actually frames)
    const closeCams = CLOSES.filter((S) => S.lit === 'close').map(camOf), _p = new THREE.Vector3(); // (wide-lit setups keep the wide's levels)
    const inClose = (st) => closeCams.some((c) => { _p.set(st.x, eyesAt(st), st.z).project(c); return _p.z < 1 && Math.abs(_p.x) < 1.15 && Math.abs(_p.y) < 1.3; });
    const lodPlan = plan.filter((q) => lodBands.some((b) => q.s.row >= b.from && q.s.row <= b.to && q.level === b.level && !q.stand) && inClose(q.s)).map((q) => ({ ...q, level: 'lod' }));
    // (the close-ups' copy is built after the first frame, with the front people: the wide never shows it)
    // (&ab=nolodclose: no close-up copy, the close-ups keep the wide's levels: a third fewer triangles on a cut)
    if (lodPlan.length && !ab('nolodclose')) addLod = async () => {
      const cl = await instanced(lodPlan, ab('noalpha') || fastAlpha ? solid : cut, variety, () => null, (level) => (fastAlpha && !ab('noalpha') && near(level) ? cut : null));
      cl.closeOnly = true;
      crowds.push(cl);
      cl.groups.forEach((G) => [].concat(G.mesh.material).forEach((m) => { m.userData.near = true; crowdMats.push(m); }));
      closeLodSwap = { lod: cl, wide: c.groups.filter((G) => lodBands.some((b) => G.mesh.name.startsWith(`instances-${b.level}:`))) };
      showCloseLod(false);
      return cl;
    };
  }
  stats.back = plan.length;

  if (candle) candle.position.set(closeTable.x, 0.92, closeTable.z - 0.02);
  // the heckler: the front-row person in the heckler's seat (or the nearest on that side of the table)
  return { venue, addFront, addLod };

  async function instanced(plan, matParams, variety, paramsFor = () => null, cardFor = () => null) {
    const key = (q) => `${q.stand ? `stand-${q.hands}-` : ''}${q.level}:${q.type}`;
    const keys = [...new Set(plan.map(key))];
    const types = await Promise.all(keys.map(async (k) => {
      const m = k.match(/^(?:stand-(\w+)-)?(\w+):(\w+)$/);
      const [, hands, level, type] = m;
      const gl = await load(`people/${type}.${level}.glb`);
      const tb = performance.now();
      const baked = bakeType(gl.scene, { stand: !!hands, standHands: hands || 'down', bothArms: !!V.stadium });
      LOADT.bake += performance.now() - tb;
      return { name: k, matParams: paramsFor(level), cardParams: cardFor(level), rimSoft: !!V.rimFlat && (level === 'far' || level === 'xfar'), dropCards: P.fast && !ab('alpha') && !ab('noalpha') && (level === 'far' || level === 'xfar'), baked };
    }));
    tmark(`crowd types ${keys.length}`);
    const seatList = plan.map((q, i) => ({ seat: makeSeat(q.s), type: key(q), row: q.s.row, x: q.s.x, seed: SEED + 9000 + i * 13, src: q.s }));
    for (const q of plan) placed.push(q.s);
    const ti = performance.now();
    try { return new InstancedCrowd(scene, types, seatList, matParams, shared, {
      performer: PERFORMER, variety: (s) => variety(s),
      traffic: (s, now) => (s.bar || s.balcony ? null : traffic(s, room.mode, now - room.modeAt)),
    }); } finally { LOADT.inst += performance.now() - ti; tmark(`crowd built ${seatList.length}`); }
  }
}

// ---------- host protocol (?host=1): the TV app sends venue, shot, drive, mode, cue and duck messages ----------
// Messages may arrive before the scene is built; the latest venue and shot are kept, and every drive is folded into
// the per-reaction level history straight away (it touches no scene objects).
const CYCLE = 10;
const extra = [];
const latest = { venue: null, shot: null, drive: null };
const hist = new Map(); // reaction id -> { id, kind, s, t (local start), samples [[age, level]], ended }
let finaleAt = null, driveCount = 0;
function levelAtFor(h) {
  return (age) => {
    const a = h.samples;
    if (!a.length || age < 0) return 0;
    if (age <= a[0][0]) return a[0][0] <= 0.35 ? a[0][1] * (age / Math.max(a[0][0], 1e-3)) : a[0][1];
    for (let i = 1; i < a.length; i++) if (age <= a[i][0]) { const [a0, l0] = a[i - 1], [a1, l1] = a[i]; return l0 + (l1 - l0) * ((age - a0) / Math.max(a1 - a0, 1e-3)); }
    return h.ended ? 0 : a[a.length - 1][1];
  };
}
function applyDrive(d) {
  const nowL = clock();
  driveCount++;
  room.phase = d.phase;
  room.attention = typeof d.attention === 'number' ? d.attention : 0.6;
  room.warmth = d.warmth || 0;
  room.deadBits = d.deadBits || 0;
  let murmur = d.restless || 0;
  const seen = new Set();
  for (const r of d.reactions || []) {
    let h = hist.get(r.id);
    if (!h || h.kind !== r.kind) { h = { id: r.id, kind: r.kind, s: r.strength, t: nowL - r.age, samples: [], ended: false }; h.levelAt = levelAtFor(h); hist.set(r.id, h); }
    h.t = Math.min(h.t, nowL - r.age);
    h.s = r.strength;
    if (!h.samples.length || r.age > h.samples[h.samples.length - 1][0]) h.samples.push([r.age, r.level]);
    if (h.samples.length > 120) h.samples.shift();
    h.last = nowL; h.ended = false;
    seen.add(r.id);
    if (r.kind === 'murmur') murmur = Math.max(murmur, r.level);
  }
  for (const [id, h] of hist) {
    if (seen.has(id)) continue;
    if (!h.ended) { h.ended = true; h.samples.push([nowL - h.t, 0]); }
    if (nowL - h.last > 8) hist.delete(id);
  }
  if (murmur > 0.5 && room.murmur <= 0.5) room.murmurId++;
  room.murmur = murmur;
  room.heckle = d.heckle ? { id: d.heckle.id, level: d.heckle.level } : null;
  room.finale = d.finale || null;
  if (room.finale) room.lastFinale = room.finale.strength;
  if (room.finale && finaleAt === null) finaleAt = nowL;
  if (!room.finale) finaleAt = null;
}
function setMode(mode) {
  if (!['preview', 'live', 'after'].includes(mode) || mode === room.mode) return;
  room.mode = mode;
  room.modeAt = clock();
  captionFor();
}
function onMessage(raw) {
  let msg = raw;
  if (typeof raw === 'string') { try { msg = JSON.parse(raw); } catch { return; } }
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'drive' && msg.drive) { latest.drive = msg.drive; applyDrive(msg.drive); }
  else if (msg.type === 'venue') {
    latest.venue = msg;
    room.act = msg.act || 'standup';
    room.venueId = msg.venue;
    // how a laugh travels back through the rows; the theatre's wave takes about 0.4 s front to back
    room.spread = VENUES[msg.venue] ? VENUES[msg.venue].spread : room.spread;
    // a different room needs a different scene: reload into it (the host re-sends venue and shot after 'ready')
    if (VENUES[msg.venue] && msg.venue !== VENUE_ID && !Q.has('venue-lock')) {
      const q = new URLSearchParams(location.search); q.set('venue', msg.venue);
      // (the next frame keeps this room's picture for the reload, so the screen shows it, not black, until the new
      // room's first frame: see #hold in index.html)
      pendingVenue = location.pathname + '?' + q.toString();
      if (frames < 3) location.replace(pendingVenue);
    }
  }
  else if (msg.type === 'shot') latest.shot = msg;
  else if (msg.type === 'mode') setMode(msg.mode);
  else if (msg.type === 'cue') { sound.cue(String(msg.id), typeof msg.strength === 'number' ? msg.strength : 0.7); castWait = { id: String(msg.id), at: performance.now() }; } // (at once: the reaction's timing is measured; the cast's voices join when it is known, soundTick)
  else if (msg.type === 'duck') sound.duck(!!msg.on);
  else if (msg.type === 'snap' && msg.key !== undefined) snaps.push(String(msg.key));
}
// Cut-sheet thumbnails: the frame on screen (canvas only, no HUD or HTML overlays) as a 320×180 JPEG at 0.7, taken
// without stalling the page. Reading a WebGL canvas back synchronously (drawImage, then toDataURL) makes the main
// thread wait until the GPU has finished all its queued work: 2.6–6.7 s per snapshot on the build box's software GPU,
// which also froze the TV app's clock in the browser preview (the iframe shares its thread), and a hitch on every cut
// on a TV. Instead, straight after render() (the drawing buffer is still valid, so preserveDrawingBuffer stays off)
// the frame is blitted down to 320×180 on the GPU and copied into a pixel-pack buffer behind a fence; later frames
// poll the fence without waiting, read the 230 KB back once it has passed, and the JPEG is encoded by toBlob on a CPU
// canvas. Up to four snapshots can be on their way back at once (a slow GPU must not make a later cut's snapshot wait
// and catch the wrong shot). WebGL 1 keeps the synchronous path.
const SNAP_W = 320, SNAP_H = 180, SNAP_SLOTS = 4;
const snaps = [];
const snapJobs = []; // { keys, sync, frames, pbo }: snapshots on their way back from the GPU, oldest first
let snapGL = null; // framebuffers, free pixel-pack buffers and the CPU canvas, made at the first snapshot
function snapTargets(gl) {
  if (snapGL) return snapGL;
  // a multisampled canvas needs a resolve before the scaling blit (asked of the context's attributes: a
  // getParameter(SAMPLES) would itself wait for the GPU)
  const samples = gl.getContextAttributes().antialias ? 1 : 0;
  const fbo = (w, h) => {
    const fb = gl.createFramebuffer(), rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    return { fb, rb, w, h };
  };
  const free = [];
  for (let i = 0; i < SNAP_SLOTS; i++) {
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, SNAP_W * SNAP_H * 4, gl.STREAM_READ);
    free.push(pbo);
  }
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const canvas = document.createElement('canvas');
  canvas.width = SNAP_W; canvas.height = SNAP_H;
  snapGL = { fbo, samples, small: fbo(SNAP_W, SNAP_H), resolve: null, free, pixels: new Uint8Array(SNAP_W * SNAP_H * 4), canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
  return snapGL;
}
/** Right after render(): queue the GPU copy of this frame for the waiting snap keys. */
function takeSnaps() {
  let pbo = null;
  try {
    if (!renderer.capabilities.isWebGL2) {
      const keys = snaps.splice(0);
      const c = document.createElement('canvas');
      c.width = SNAP_W; c.height = SNAP_H;
      c.getContext('2d').drawImage(renderer.domElement, 0, 0, SNAP_W, SNAP_H);
      const uri = c.toDataURL('image/jpeg', 0.7);
      keys.forEach((key) => report({ type: 'thumb', key, uri }));
      return;
    }
    const gl = renderer.getContext();
    const T = snapTargets(gl);
    if (!T.free.length) return; // every buffer is still on its way back: the keys wait for the next frame
    const keys = snaps.splice(0);
    pbo = T.free.pop();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const scissor = renderer.getScissorTest();
    if (scissor) renderer.setScissorTest(false); // a blit is scissored
    let src = null; // the canvas's framebuffer
    if (T.samples > 0) {
      // multisampled: resolve at full size first (a scaling blit must read a single-sampled buffer)
      if (!T.resolve || T.resolve.w !== W || T.resolve.h !== H) {
        if (T.resolve) { gl.deleteFramebuffer(T.resolve.fb); gl.deleteRenderbuffer(T.resolve.rb); }
        T.resolve = T.fbo(W, H);
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.resolve.fb);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      src = T.resolve.fb;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.small.fb);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, SNAP_W, SNAP_H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.small.fb);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.readPixels(0, 0, SNAP_W, SNAP_H, gl.RGBA, gl.UNSIGNED_BYTE, 0); // into the buffer: no wait
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    // back to the canvas, which is what three.js has cached as bound after render()
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    if (scissor) renderer.setScissorTest(true);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    snapJobs.push({ keys, sync, frames: 0, pbo });
  } catch (e) {
    // no thumbnail this time; the buffer goes back to the pool
    if (pbo && snapGL && !snapJobs.some((j) => j.pbo === pbo)) snapGL.free.push(pbo);
  }
}
/** At the start of each frame: once the GPU has passed a fence, read those pixels and encode them off the thread. */
function pollSnap() {
  if (!snapJobs.length) return;
  const gl = renderer.getContext();
  for (const job of snapJobs) job.frames++;
  while (snapJobs.length) {
    const job = snapJobs[0];
    const st = gl.clientWaitSync(job.sync, 0, 0);
    if (st === gl.TIMEOUT_EXPIRED && job.frames < 120) return; // fences pass in order: the later ones are not ready
    snapJobs.shift();
    gl.deleteSync(job.sync);
    if (st !== gl.WAIT_FAILED) readSnap(gl, job);
    snapGL.free.push(job.pbo);
  }
}
function readSnap(gl, job) {
  try {
    const T = snapGL;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, job.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, T.pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    // rows arrive bottom-up; alpha is forced opaque (the canvas may keep junk in it)
    const img = T.ctx.createImageData(SNAP_W, SNAP_H), row = SNAP_W * 4, d = img.data;
    for (let y = 0; y < SNAP_H; y++) d.set(T.pixels.subarray((SNAP_H - 1 - y) * row, (SNAP_H - y) * row), y * row);
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    T.ctx.putImageData(img, 0, 0);
    T.canvas.toBlob((blob) => {
      if (!blob) return;
      const fr = new FileReader();
      fr.onload = () => job.keys.forEach((key) => report({ type: 'thumb', key, uri: fr.result }));
      fr.readAsDataURL(blob);
    }, 'image/jpeg', 0.7);
  } catch (e) { /* no thumbnail this time */ }
}
if (HOST) {
  addEventListener('message', (e) => onMessage(e.data));
  document.addEventListener('message', (e) => onMessage(e.data)); // react-native-webview (Android) dispatches here
  window.encoreDrive = (drive) => onMessage({ type: 'drive', drive });
  window.encoreMessage = onMessage;
}
function report(obj) {
  try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) { /* no host */ }
  try { if (window.parent !== window) window.parent.postMessage(obj, '*'); } catch (e) { /* no parent */ }
}
/**
 * Who laughs in this laugh, for the sound (sound.js cue's cast, castArrived): the motion agent's laughCast() (people.js:
 * { n, share, people: [{ person, gender, type: 'roar'|'giggle'|'exhale', level }] }), copied, since people.js reuses
 * its object. Read only once the people have seen this reaction (soundTick), so it is this laugh's cast, not the last.
 */
function laughCastNow() {
  const c = laughCast();
  return { n: c.n, share: c.share, people: c.people.map((e) => ({ person: e.person, gender: e.gender, type: e.type, level: e.level })) };
}
const sound = new CrowdSound('sounds/', report, { mix: Q.get('sound') !== 'sprite', venue: VENUE_ID }); // &sound=sprite: one clip per cue, as before
window.__mixes = () => sound.mixes; window.__sound = sound; window.__audioMB = () => sound.audioMB(); // (box harnesses)
const unlock = () => sound.unlock();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
if (HOST) sound.unlock(); // a WebView with mediaPlaybackRequiresUserAction off starts at once; otherwise it reports 'suspended'
sound.roomTone(V.tone ? V.tone.id : null, V.tone ? V.tone.gain : 0);

function hostEvents() {
  room.events = [];
  for (const h of hist.values()) if (h.kind !== 'murmur' && h.kind !== 'heckle' && h.kind !== 'silence') room.events.push(h);
  if (room.finale && finaleAt !== null && room.mode !== 'after') {
    const s = room.finale.strength;
    room.events.push({ id: 9999, kind: s > 0.7 ? 'cheer' : 'applause', s, t: finaleAt, levelAt: (a) => (a < 0 ? 0 : Math.min(1, a / 0.6) * s) });
  }
}
/**
 * The engine's reaction shots are short (1.8–2.6 s, the same window that spaces the room's reactions). On screen the
 * camera holds a close-up long enough to read the faces and lets the wide breathe before the next one; a heckler cuts
 * at once. Only the camera's timing changes: what the room does still comes from the engine (the user, 2026-10-12:
 * "the camera was too moving, I couldn't focus on faces").
 */
// each venue's own pacing (director.js PACE: the theatre holds longest, the club cuts quickest), never under 4.5 s on
// a reaction shot nor 8 s on the wide
const PACE_V = PACE[VENUE_ID] || { close: 4.5, wide: 8 };
const CLOSE_MIN_SEC = Math.max(4.5, num('closehold', PACE_V.close)), WIDE_MIN_SEC = Math.max(8, num('widehold', PACE_V.wide));
/** A new reaction while the wide is still holding: the wide's own variant, a wide setup of the venue's (or the house
 * left or right half of the room on a longer lens, alternately, where the venue has none). */
function wideVariant() {
  const i = pickClose('wide');
  if (i >= 0) { const W = CLOSES[i]; SHOTS.wide.pos.copy(W.pos); SHOTS.wide.look.copy(W.look); SHOTS.wide.fov = W.fov; wideAt = 3; usedSetup(i); }
  else useWide(wideAt === 1 ? 2 : 1);
  cutAt = room.now; cuts++; placeCamera(room.now);
}
function hostShot() {
  const sh = latest.shot;
  let want = 'wide';
  if (sh && sh.kind === 'reaction' && room.mode === 'live') {
    const h = typeof sh.focus === 'number' ? hist.get(sh.focus) : null;
    want = h && h.kind === 'heckle' && room.hecklerPos ? 'heckler' : 'close';
    if (h && typeof h.s === 'number') cutStrength = h.s;
  }
  // a new reaction while a reaction shot is up: another setup (a cut between two reactions), once the current one has
  // held its minimum, so laughs close together don't give the cut sheet the same frame twice
  const rk = sh && typeof sh.focus === 'number' ? sh.focus : sh; // (the reaction: its id when the TV gives one)
  if (want === 'close' && shot === 'close' && rk !== closeOn && room.now - cutAt >= CLOSE_MIN_SEC && CLOSES.length > 1) {
    closeOn = rk; shot = ''; return cut('close');
  }
  if (want === 'close' && rk !== closeOn) closeOn = rk;
  if (want === shot || room.mode !== 'live' || want === 'heckler') return cut(want);
  if (!shot) return cut(want); // (a page loaded mid-set has no shot yet: the camera would sit at the origin, under the floor)
  const held = room.now - cutAt;
  if (want === 'wide' && held < CLOSE_MIN_SEC) return undefined; // still reading the faces
  if (want === 'close' && shot === 'wide' && cuts > 1 && held < WIDE_MIN_SEC) {
    // too soon after the last close-up: the laugh stays on a wide, but a new reaction gets a different one, so no two
    // cut-sheet frames in a row are the same
    if (rk !== heldOn) { heldOn = rk; wideVariant(); }
    return undefined;
  }
  return cut(want);
}
function schedule(now) {
  room.events = [];
  if (MODE === 'laugh') room.events.push({ id: 1, t: 0.3, s: S });
  if (MODE === 'cycle') {
    const k = Math.floor((now - 4) / CYCLE);
    for (const j of [k - 1, k]) if (j >= 0) room.events.push({ id: j + 1, t: 4 + j * CYCLE, s: S });
  }
  for (const e of extra) if (now - e.t < 12) room.events.push(e);
}
/** The mode's own timeline: house lights, the fading applause after the set, how full the arena's tiers are. */
function modeTimeline(now) {
  const age = now - room.modeAt;
  if (room.mode === 'preview') {
    room.events = []; // nothing is being performed or measured: no reactions
    room.fill = 0.55 + 0.45 * clamp01(age / 40);
    room.houseTarget = 0.6; // doors open: house lights about 60%, the stage dark
    room.keyTarget = PREVIEW_KEY; // (the stage at about half: the bill's room read as a black screen at 0.12, theatre mean luma 0.036)
    room.lastCallTarget = 0;
  } else if (room.mode === 'after') {
    const fs = room.lastFinale || 0.5, len = 2 + 3 * fs; // a stronger finish claps longer
    room.afterLevel = clamp01(1 - age / len);
    room.events = [{ id: 9998, kind: fs > 0.75 && room.vocab === 'stadium' ? 'cheer' : 'applause', s: fs, t: room.modeAt - 0.3, levelAt: (a) => (a < 0 ? 0 : fs * clamp01(1 - a / len)) }];
    room.fill = 1 - 0.85 * clamp01((age - 6) / 45);
    room.houseTarget = 1; // last call: house lights up and cooler, the stage at a third
    room.keyTarget = 0.35;
    room.lastCallTarget = 1;
  } else {
    room.fill = 1;
    room.houseTarget = room.finale ? 0.4 : 0; // the finale: house lights at about 40% with the stage still lit
    room.keyTarget = 1;
    room.lastCallTarget = 0;
  }
}
let holdShot = false; // (a harness's __cutTo holds its shot)
function director(now) {
  if (HOST) return hostShot();
  if (holdShot) return undefined;
  if (Q.has('shot')) return cut(Q.get('shot') === 'close' ? 'close' : 'wide');
  if (room.mode !== 'live') return cut('wide');
  if (MODE === 'laugh') return cut('close');
  if (MODE === 'cycle') {
    const c = (now - 4) % CYCLE;
    return cut(now >= 4 && c >= 0.25 && c < 3.6 ? 'close' : 'wide');
  }
  const last = extra[extra.length - 1];
  return cut(last && now - last.t > 0.25 && now - last.t < 3.6 ? 'close' : 'wide');
}
let captureT = T0;
const start = performance.now();
const clock = () => (CAPTURE ? captureT : STILL ? T0 : T0 + (performance.now() - start) / 1000);
addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L' || e.key === 'Enter') extra.push({ id: 100 + extra.length, t: clock(), s: S });
  if (e.key === 'm' || e.key === 'M') { room.murmur = room.murmur > 0.5 ? 0 : 1; room.murmurId++; }
});

// ---------- sound levels: each reaction kind's current level, so a cue's gain follows the same envelope ----------
const cued = new Set();
const _levels = {};
const soundSeen = { dead: 0, heckle: null };
let castWait = null; // the TV's last cue, whose cast the sound is waiting for (≤ 0.8 s)
const CUE_KIND = { 'laugh-small': 'laugh', 'laugh-medium': 'laugh', 'laugh-big': 'laugh' };
function soundTick(now) {
  // the laugh's cast: decided when the people first see the reaction in the drive (earlier in this frame)
  if (castWait) {
    const k = CUE_KIND[castWait.id];
    if (!k || performance.now() - castWait.at > 800) castWait = null;
    else if (room.events.some((e) => (e.kind || 'laugh') === k && now - e.t >= 0 && now - e.t < 1)) { sound.castArrived(laughCastNow()); castWait = null; }
  }
  const levels = _levels;
  for (const k in levels) levels[k] = 0;
  for (const ev of room.events) {
    const kind = ev.kind || 'laugh', age = now - ev.t;
    const lv = ev.levelAt ? ev.levelAt(age) : age < 0 ? 0 : age < 0.25 ? (ev.s * age) / 0.25 : age < 0.5 + 1.5 * ev.s ? ev.s : Math.max(0, ev.s * (1 - (age - 0.5 - 1.5 * ev.s) / 1.2));
    if (lv > (levels[kind] || 0)) { levels[kind] = lv; levels[kind + 'Peak'] = ev.s; }
    // the standalone demo cues its own sound (the TV sends cues itself)
    if (!HOST && !cued.has(ev.id) && age >= 0 && age < 0.5) { cued.add(ev.id); const id = cueFor(kind, ev.s); if (id) sound.cue(id, ev.s, kind === 'laugh' ? { cast: laughCastNow() } : null); } // (the cast is decided earlier in this frame: read at once)
  }
  sound.tick(levels, room.mode === 'preview' ? 1.2 : room.mode === 'after' ? 0.85 : 1);
  // a dead bit or a heckle in a tough room sometimes draws a boo or a groan (sound.js react; never at the open mic)
  if (room.mode === 'live') {
    if ((room.deadBits || 0) > soundSeen.dead) sound.react('dead', VENUE_ID);
    if (room.heckle && room.heckle.id !== soundSeen.heckle) sound.react('heckle', VENUE_ID);
  }
  soundSeen.dead = room.deadBits || 0; soundSeen.heckle = room.heckle ? room.heckle.id : soundSeen.heckle;
}

// ---------- the room's traffic applied to the skinned people ----------
function applyTraffic(p, now) {
  const L = p.src && traffic && !p.src.balcony ? traffic(p.src, room.mode, now - room.modeAt) : null;
  const seat = p.rig.seat;
  if (L && L.hidden) {
    // not in the room (yet, or any more): collapse their bones too, so a merged (CPU-skinned) person can't be left
    // standing in the bind pose
    if (!p.hidden) { p.rig.model.visible = false; p.rig.model.scale.setScalar(1e-4); p.rig.model.updateMatrixWorld(true); p.hidden = true; p.skelDirty = true; }
    p.loco = null;
    return false;
  }
  if (p.hidden) { p.rig.model.visible = true; p.rig.model.scale.setScalar(1); p.hidden = false; p.fresh = true; p.skelDirty = true; }
  if (L && L.x !== undefined) {
    seat.position.set(L.x, L.y, L.z);
    seat.rotation.y = L.yaw;
    seat.updateMatrixWorld(true);
    p.loco = { stand: 1, walk: 1, phase: L.phase, coat: 0 };
    p.moved = true;
    p.skelDirty = true;
  } else {
    if (p.moved) { seat.position.copy(p.home.pos); seat.rotation.y = p.home.yaw; seat.updateMatrixWorld(true); p.moved = false; p.skelDirty = true; }
    p.loco = L ? { stand: L.stand, walk: 0, phase: 0, coat: L.coat || 0 } : null;
  }
  return true;
}

// ---------- measurements ----------
function textureMB() {
  const seen = new Set();
  let bytes = 0;
  const addTex = (t) => {
    if (!t || seen.has(t) || !t.image) return;
    seen.add(t);
    const w = t.image.width || 0, h = t.image.height || 0;
    bytes += w * h * (t.format === THREE.RedFormat ? 1 : 4) * (t.generateMipmaps && t.minFilter !== THREE.LinearFilter ? 4 / 3 : 1);
  };
  const geos = new Set();
  scene.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      for (const k of ['map', 'alphaMap', 'normalMap', 'emissiveMap', 'roughnessMap']) addTex(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) addTex(u.value);
    }
    // morph target textures (RGBA32F, one texel per vertex per target) and bone textures
    if (o.geometry && o.geometry.morphAttributes && o.geometry.morphAttributes.position && !geos.has(o.geometry)) {
      geos.add(o.geometry);
      bytes += o.geometry.attributes.position.count * o.geometry.morphAttributes.position.length * 16;
    }
    if (o.isSkinnedMesh && o.skeleton && !seen.has(o.skeleton)) { seen.add(o.skeleton); bytes += o.skeleton.bones.length * 64; }
  });
  return bytes / 1048576;
}
function downloadsMB() {
  const list = performance.getEntriesByType('resource').filter((e) => /\/(people|sounds)\//.test(e.name));
  return list.reduce((a, e) => a + (e.encodedBodySize || e.transferSize || 0), 0) / 1048576;
}

// ---------- frame timing: the last 120 frame intervals, their p50, p90 and maximum (the device gate) ----------
const intervals = new Float32Array(120);
let nIntervals = 0, iInterval = 0;
function recordInterval(ms) { intervals[iInterval] = ms; iInterval = (iInterval + 1) % intervals.length; nIntervals = Math.min(nIntervals + 1, intervals.length); }
// the page's own JavaScript per frame (behaviour, uniforms and three's draw submission, up to the end of render()), in
// the same ring: if p90 frame time is high while this stays low, the GPU or the compositor holds the frame, not JS
const cpuRing = new Float32Array(120);
function recordCpu(ms) { cpuRing[iInterval] = ms; }
const pct = (arr, n, p) => { const a = Array.from(arr.subarray(0, n)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0; };
// every rAF callback: its period and how late it ran after its own timestamp, and the draws' spacing in vsyncs (the
// sweep's explanation of a p90: 2 = on the 30 fps cap, 3 = one vsync missed, 5 = 83 ms)
const rafDt = new Float32Array(240), rafLate = new Float32Array(240), drawV = new Uint16Array(6);
let nRaf = 0, iRaf = 0;
// the display's period: the Google TV reports 60 Hz (&hz= for another display). It is not estimated from the rAF
// periods: when the GPU holds every frame they never show the display's rate
const VSYNC_MS = 1000 / num('hz', 60);
const vsyncMs = () => VSYNC_MS;
function frameTimes() {
  const a = Array.from(intervals.subarray(0, nIntervals)).sort((x, y) => x - y);
  const q = (p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
  let long = 0; for (const x of a) if (x > 50) long++;
  return { p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), max: +(a.length ? a[a.length - 1] : 0).toFixed(1), long, n: a.length,
    cpu50: +pct(cpuRing, nIntervals, 0.5).toFixed(1), cpu90: +pct(cpuRing, nIntervals, 0.9).toFixed(1) };
}

// ---------- the box's crowd-coverage check (tools/render/aliveprobe.mjs) ----------
// on: every crowd surface white (the sprites, the instanced crowd, the skinned people), everything else hidden, the sky
// black; off: back as it was
let maskSaved = null;
function crowdMask(on) {
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  if (on && !maskSaved) {
    maskSaved = { objs: [], mats: [], bg: scene.background };
    const crowd = new Set();
    for (const p of people) p.rig.model.traverse((o) => crowd.add(o));
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine)) return; // (the final pass too: its vignette would darken the mask)
      const isCrowd = crowd.has(o) || o.name === 'sprites' || o.name.startsWith('instances') || o.name === 'middle-rows';
      if (!isCrowd) { maskSaved.objs.push([o, o.visible]); o.visible = false; }
      else if (crowd.has(o) || o.name === 'middle-rows') { maskSaved.mats.push([o, o.material]); o.material = white; }
      else if (o.material) for (const m of [].concat(o.material)) if (m.uniforms && m.uniforms.uMaskOut) m.uniforms.uMaskOut.value = 1;
    });
    if (crowds.shared) crowds.shared.uMaskOut.value = 1;
    scene.background = new THREE.Color(0);
  } else if (!on && maskSaved) {
    for (const [o, v] of maskSaved.objs) o.visible = v;
    for (const [o, m] of maskSaved.mats) o.material = m;
    scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if (m.uniforms && m.uniforms.uMaskOut) m.uniforms.uMaskOut.value = 0; });
    if (crowds.shared) crowds.shared.uMaskOut.value = 0;
    scene.background = maskSaved.bg; maskSaved = null;
  }
}

// ---------- HUD ----------
const hudEl = document.getElementById('hud');
if (!HUD && hudEl) hudEl.remove();
let lastReport = 0;
let frameMs = 0, cpuMs = 0, lastHud = 0, frames = 0, lastT = performance.now(), texMB = 0, dlMB = 0;
function hud() {
  if (!HUD || !hudEl) return;
  if (performance.now() - lastHud < 1000 && !STILL && !CAPTURE) return; // (each update repaints a text layer)
  lastHud = performance.now();
  const i = renderer.info.render, ft = frameTimes();
  hudEl.textContent = `${frameMs.toFixed(1)} ms/frame (${(1000 / Math.max(frameMs, 0.1)).toFixed(0)} fps) · p50 ${ft.p50} p90 ${ft.p90} max ${ft.max} ms · cpu ${cpuMs.toFixed(1)} ms · ${i.calls} draws · ${(i.triangles / 1000).toFixed(1)}k tris · ${stats.front}+${stats.mid}+${stats.back}${stats.sprites ? '+' + stats.sprites : ''} people · tex ≈${texMB.toFixed(0)} MB · dl ${dlMB.toFixed(1)} MB · ${PRESET_NAME} ${RW}×${RH} · aa ${CTX_AA ? 'on' : 'off'}${FPS_CAP ? ` · cap ${FPS_CAP}` : ''}${AB.size ? ' · ab ' + [...AB].join(',') : ''}`;
}

// ---------- the final pass (R10): grain, vignette and the lower-third band in one full-screen triangle ----------
// It multiplies the frame (out = 2·src·dst), so 0.5 leaves a pixel alone. It replaces the old CSS layers, whose
// mix-blend-mode made the compositor run another full-screen pass every frame, and it gives the TV app's lower third its
// dark band. New grain every frame. &ab=nopost turns the pass off, &ab=nograin only its grain.
function finalPass() {
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      void main() {
        float vig = 1.0 - 0.66 * clamp( ( length( ( vUv - vec2( 0.5, 0.54 ) ) / vec2( 0.78, 0.72 ) ) - 0.58 ) / 0.42, 0.0, 1.0 );
        float low = 1.0 - 0.6 * clamp( ( 0.28 - vUv.y ) / 0.28, 0.0, 1.0 );
        // grain: light in the middle of the frame, where the faces are (at 540p, upscaled on the TV, full-strength grain
        // turned skin blotchy), full towards the edges
        float gr = length( ( vUv - vec2( 0.5, 0.52 ) ) * vec2( 1.6, 1.0 ) );
        float g = ${ab('nograin') ? '0.0' : '( hash( gl_FragCoord.xy + fract( uTime ) * 91.0 ) - 0.5 ) * mix( 0.016, 0.05, smoothstep( 0.35, 0.95, gr ) )'};
        gl_FragColor = vec4( vec3( 0.5 * vig * low + g ), 1.0 );
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 1000;
  m.name = 'final';
  return m;
}
// real-v1 lens (tv, with FXAA): depth of field (&ab=nodof) and a gentle grade (&ab=nograde)
const DOF = !ab('nodof'), GRADE = !ab('nograde');
const _af = new THREE.Vector3(), _afh = new THREE.Vector3();
/**
 * Autofocus, as a focus puller would: the front person whose head is nearest the frame's centre (a little above it),
 * and the circle of confusion a 16:9 Super 35 camera at f/2.4 gives behind and before them at this lens. Wide shots
 * focus the same way; at their short lens the circle stays under a pixel except far back.
 */
function autofocus(u) {
  let best = 1e9, dist = 0;
  for (const p of people) {
    if (p.kind !== 'front' || p.hidden || !p.rig || !p.rig.model.visible) continue;
    _afh.setFromMatrixPosition(p.rig.b.head.matrixWorld);
    _af.copy(_afh).project(camera);
    if (_af.z > 1 || Math.abs(_af.x) > 0.9 || Math.abs(_af.y) > 0.95) continue;
    const sc = Math.hypot(_af.x, (_af.y - 0.15) * 1.3);
    if (sc < best) { best = sc; dist = _afh.distanceTo(camera.position); }
  }
  if (!dist || ab('nodof')) { u.y = 0; return; }
  const f = 0.007 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), N = 2.4; // (the focal length from the lens: a 14 mm-high gate)
  u.set(dist, ((f * f) / (N * Math.max(0.05, dist - f)) / 0.014) * RH, camera.near, camera.far);
}
const post = VIEW === 'avatar' || ab('nopost') || (FOLD && HEJL) || ab('fxaa') || (P.fast && !ab('nofxaa')) ? null : finalPass(); // (FXAA, below, does the final pass's work on tv)
if (post) scene.add(post);
/**
 * &ab=fxaa: the frame drawn into a render target (tone-mapped there exactly as on the canvas: three treats an XR target
 * like the screen), then one full-screen pass to the canvas that does FXAA (the 9-tap console variant, with an early
 * out on flat areas) and the final pass's vignette, low band and grain in the same shader, so it costs one pass, not
 * two. The target follows the drawing size (dynres).
 */
const FXAA = VIEW !== 'avatar' && (ab('fxaa') || (P.fast && !ab('nofxaa') && !ab('nopost'))) ? (() => { // (tv default since 2026-10-16; &ab=nofxaa)
  // (real-v1 lens, DOF: the target keeps its depth as a texture and its colour gets mips, so a defocused pixel is one
  // mip read, not a gather; &ab=nodof)
  const rt = new THREE.WebGLRenderTarget(RW, RH, { depthBuffer: true, stencilBuffer: false, minFilter: DOF ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: DOF });
  if (DOF) rt.depthTexture = new THREE.DepthTexture(RW, RH);
  rt.isXRRenderTarget = true; // (tone mapping and the output colour space as for the canvas)
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uPx: { value: new THREE.Vector2(1 / RW, 1 / RH) }, uTime: { value: 0 }, tDepth: { value: rt.depthTexture }, uDof: { value: new THREE.Vector4() } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform vec2 uPx; uniform float uTime; varying vec2 vUv;${DOF ? '\n      uniform sampler2D tDepth; uniform vec4 uDof;' : ''}
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      void main() {
        const vec3 W = vec3( 0.299, 0.587, 0.114 );
        vec3 cM = texture2D( tDiffuse, vUv ).rgb;
        vec3 cNW = texture2D( tDiffuse, vUv + vec2( -1.0, -1.0 ) * uPx ).rgb, cNE = texture2D( tDiffuse, vUv + vec2( 1.0, -1.0 ) * uPx ).rgb;
        vec3 cSW = texture2D( tDiffuse, vUv + vec2( -1.0, 1.0 ) * uPx ).rgb, cSE = texture2D( tDiffuse, vUv + vec2( 1.0, 1.0 ) * uPx ).rgb;
        float lM = dot( cM, W ), lNW = dot( cNW, W ), lNE = dot( cNE, W ), lSW = dot( cSW, W ), lSE = dot( cSE, W );
        float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) ), lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );
        vec3 c = cM;
        if ( lMax - lMin > max( 0.03, lMax * 0.125 ) ) { // (flat areas keep the centre tap: most of a dark room)
          vec2 dir = vec2( -( ( lNW + lNE ) - ( lSW + lSE ) ), ( lNW + lSW ) - ( lNE + lSE ) );
          float red = max( ( lNW + lNE + lSW + lSE ) * 0.03125, 1.0 / 128.0 );
          dir = clamp( dir / ( min( abs( dir.x ), abs( dir.y ) ) + red ), -8.0, 8.0 ) * uPx;
          vec3 a = 0.5 * ( texture2D( tDiffuse, vUv - dir * 0.1667 ).rgb + texture2D( tDiffuse, vUv + dir * 0.1667 ).rgb );
          vec3 b = a * 0.5 + 0.25 * ( texture2D( tDiffuse, vUv - dir * 0.5 ).rgb + texture2D( tDiffuse, vUv + dir * 0.5 ).rgb );
          float lB = dot( b, W );
          c = ( lB < lMin || lB > lMax ) ? a : b;
        }
        // the final pass, folded in: vignette, the low band under the lower third, grain (as finalPass's multiply)
        float vig = 1.0 - 0.66 * clamp( ( length( ( vUv - vec2( 0.5, 0.54 ) ) / vec2( 0.78, 0.72 ) ) - 0.58 ) / 0.42, 0.0, 1.0 );
        float low = 1.0 - 0.6 * clamp( ( 0.28 - vUv.y ) / 0.28, 0.0, 1.0 );
        float gr = length( ( vUv - vec2( 0.5, 0.52 ) ) * vec2( 1.6, 1.0 ) );
        float g = ${ab('nograin') ? '0.0' : '( hash( gl_FragCoord.xy + fract( uTime ) * 91.0 ) - 0.5 ) * mix( 0.016, 0.05, smoothstep( 0.35, 0.95, gr ) )'};
        ${DOF ? `// the lens: depth of field from the autofocus distance (uDof: focus m, the circle at infinity in px, near, far)
        if ( uDof.y > 0.0 ) {
          float zb = texture2D( tDepth, vUv ).x;
          float z = uDof.z * uDof.w / ( uDof.w - zb * ( uDof.w - uDof.z ) );
          float coc = uDof.y * abs( z - uDof.x ) / z;
          if ( coc > 0.8 ) {
            float lod = clamp( log2( coc ) - 0.6, 0.0, 4.0 );
            vec2 o = uPx * coc * 0.3;
            vec3 b = 0.25 * ( textureLod( tDiffuse, vUv + vec2( o.x, o.y ), lod ).rgb + textureLod( tDiffuse, vUv + vec2( -o.x, o.y ), lod ).rgb
              + textureLod( tDiffuse, vUv + vec2( o.x, -o.y ), lod ).rgb + textureLod( tDiffuse, vUv - o, lod ).rgb );
            c = mix( c, b, smoothstep( 0.8, 2.5, coc ) );
          }
        }` : ''}
        ${GRADE ? `// a gentle grade: the stage's orange pulled a little towards neutral, as a camera balanced for tungsten would
        { float l = dot( c, W ); c = mix( vec3( l ), c, 0.86 ) * vec3( 0.97, 1.0, 1.05 ); }` : ''}
        gl_FragColor = vec4( c * ( vig * low + 2.0 * g ), 1.0 );
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), mat);
  quad.frustumCulled = false;
  const fxScene = new THREE.Scene(), fxCam = new THREE.Camera();
  fxScene.add(quad);
  return {
    render(now) {
      if (rt.width !== RW || rt.height !== RH) { rt.setSize(RW, RH); mat.uniforms.uPx.value.set(1 / RW, 1 / RH); }
      mat.uniforms.uTime.value = now;
      if (DOF) autofocus(mat.uniforms.uDof.value);
      renderer.info.autoReset = false; renderer.info.reset(); // (the stats count the scene's draws and the pass's)
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(fxScene, fxCam);
    },
  };
})() : null;

// ---------- single-avatar check: one seated person, front and side views ----------
async function avatarView() {
  const name = Q.get('name') || 'Male_Adult_04';
  document.body.classList.add('host'); // no broadcast overlay on the model check
  scene.fog = null;
  scene.background = new THREE.Color(0x1d1a1c);
  const lod = Q.get('lod');
  const g = await load(`people/${name}${lod ? '.' + lod : P.frontFile}.glb`);
  const srcScene = lod ? g.scene : prepFront(g);
  const seat = makeSeat({ x: 0, y: 0, z: 0 });
  seat.rotation.y = 0; seat.updateMatrixWorld(true);
  const model = SkeletonUtils.clone(srcScene);
  seat.add(model);
  const rig = new Rig(seat, model);
  const p = new Person(rig, lod ? null : new Face(model), { seed: num('pseed', 3), row: 0, x: 0, table: false, seatH: 0.46, idle: Q.get('idle') || 'still' });
  const chairM = new THREE.MeshLambertMaterial({ color: 0x5a3a2a });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4).translate(0, 0.44, 0), chairM));
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.03).translate(0, 0.7, -0.2), chairM));
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3436 })));
  scene.add(new THREE.GridHelper(6, 30, 0x555055, 0x2a2628));
  const sun = new THREE.DirectionalLight(0xfff0e0, 2.2); sun.position.set(1, 3, 4); scene.add(sun);
  const viewer = new THREE.Vector3(0, 1.25, 5);
  const kind = Q.get('kind') || 'laugh';
  const fake = { events: Q.get('state') === 'laugh' ? [{ id: num('rid', 1), t: 0, s: S, kind }] : [], murmur: MODE === 'murmur' ? 1 : 0, murmurId: 1, performer: viewer, vocab: Q.get('vocab') || 'club' };
  if (Q.has('style')) p.style = Q.get('style');
  if (Q.has('rollc')) p.rollClap = num('rollc', 0.1);
  if (Q.has('rollr')) p.rollRest = num('rollr', 1.2);
  if (Q.has('stand')) p.loco = { stand: num('stand', 1), walk: num('walk', 0), phase: num('phase', 0), coat: num('coat', 0) };
  p.phone = makePhone(seat);
  scene.updateMatrixWorld(true);
  const camF = new THREE.PerspectiveCamera(30, RW / 2 / RH, 0.05, 30), camS = camF.clone();
  camF.position.set(0, 1.0, 3.2); camF.lookAt(0, 0.75, 0);
  if (Q.has('zoom')) { camF.position.set(0, 1.18, 0.95); camF.lookAt(0, 1.1, 0); camF.fov = 24; camF.updateProjectionMatrix(); }
  camS.position.set(3.2, 1.0, 0.25); camS.lookAt(0, 0.75, 0.25);
  [camF, camS].forEach((c) => c.updateMatrixWorld());
  renderer.setScissorTest(true);
  const loop = () => {
    p.update(clock(), fake);
    placePhone(p);
    if (Q.has('zoom') && frames === 0) {
      const h = new THREE.Vector3().setFromMatrixPosition(rig.b.head.matrixWorld).add(new THREE.Vector3(0, 0.06, 0));
      camF.position.copy(h).add(new THREE.Vector3(0, 0.03, 0.85)); camF.lookAt(h); camF.updateMatrixWorld();
    }
    for (const [c, x] of [[camF, 0], [camS, RW / 2]]) { renderer.setViewport(x, 0, RW / 2, RH); renderer.setScissor(x, 0, RW / 2, RH); renderer.render(scene, c); }
    frames++;
    if (frames === 3) { document.body.dataset.ready = '1'; window.__stats = { name, style: p.style, state: p.state }; }
    if (!STILL || frames < 3) requestAnimationFrame(loop);
  };
  loop();
}

// ---------- the arena's sprite atlas, baked from our own avatars (tools/render/spritebake.mjs saves it) ----------
// ?view=spritebake: each of the twelve tv avatars standing, lit by a warm stage key and a cool rim, from the front and
// from three-quarters, into 64×128 cells of a 512×512 atlas (8 across: rows 0-1 front then three-quarter for avatars
// 0-7, rows 2-3 for 8-11), on a transparent ground. The arena's sprites and impostor blocks draw from it, so the far
// crowd are our people with faces, not drawn shapes. window.__bake() returns the PNG.
async function spriteBake() {
  document.body.classList.add('host');
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NoToneMapping;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0x8090b0, 0x302018, 0.9));
  const key = new THREE.DirectionalLight(0xffd8b0, 2.6); key.position.set(0.6, 1.6, 3); sc.add(key);
  const back = new THREE.DirectionalLight(0xb8c8ff, 1.4); back.position.set(-1, 2, -3); sc.add(back);
  peopleLight.uRimColor.value.set(0.5, 0.55, 0.7); peopleLight.uRimDir.value.set(0, 0.5, -0.85).normalize();
  peopleLight.uFillColor.value.set(0.25, 0.2, 0.16); peopleLight.uFillDir.value.set(0, -0.3, 0.95).normalize();
  const cam = new THREE.OrthographicCamera(-0.4875, 0.4875, 1.95, 0, 0.1, 20);
  cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  r.setScissorTest(true);
  r.clear();
  const fake = { events: [], murmur: 0, murmurId: 1, performer: new THREE.Vector3(0, 1.6, 6), vocab: 'stadium', attention: 0.8, warmth: 0.4, deadBits: 0, heckle: null, spread: 0.1, house: 0, beat: 0, mode: 'live', modeAt: 0, fill: 1, now: 0, act: 'standup', finale: null, shot: 'wide' };
  let bakeT = 0.5;
  for (let i = 0; i < AVATARS.length; i++) {
    const g = await load(`people/${AVATARS[i]}${P.frontFile}.glb`);
    for (let v = 0; v < 2; v++) {
      const seat = new THREE.Object3D(); sc.add(seat);
      seat.rotation.y = v ? -0.6 : 0; seat.updateMatrixWorld(true);
      const model = SkeletonUtils.clone(prepFront(g));
      seat.add(model);
      const p = new Person(new Rig(seat, model), new Face(model), { seed: 11 + i * 7 + v, row: 0, x: 0, table: false, seatH: 0.46, idle: 'still', stand: true, standHands: 'rail' });
      p.loco = { stand: 1, walk: 0, phase: 0, coat: 0 };
      for (let k = 0; k < 150; k++) { bakeT += 1 / 30; fake.now = bakeT; p.update(bakeT, fake); } // (5 s settling; time only moves forward)
      // arms hanging at the sides whatever the standing rules left (some avatars stayed in the bind pose's T): each
      // upper arm and forearm turned to point down, a little out and forward
      sc.updateMatrixWorld(true);
      const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
      const aim = (b, child, dir) => {
        if (!b || !child) return;
        const a0 = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld), a1 = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
        const q = new THREE.Quaternion().setFromUnitVectors(a1.sub(a0).normalize(), dir.clone().normalize());
        const wq = b.getWorldQuaternion(new THREE.Quaternion()), pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
        b.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
        b.updateMatrixWorld(true);
      };
      const nameOf = (re) => Object.keys(bones).find((n) => re.test(n));
      for (const [side, sx] of [['L', 1], ['R', -1]]) {
        const ua = bones[nameOf(new RegExp(`[ _]${side}[ _]UpperArm$`))], fa = bones[nameOf(new RegExp(`[ _]${side}[ _]Forearm$`))], hd = bones[nameOf(new RegExp(`[ _]${side}[ _]Hand$`))];
        const out = new THREE.Vector3(1, 0, 0).applyQuaternion(seat.quaternion).multiplyScalar(sx * 0.12), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.quaternion);
        aim(ua, fa, new THREE.Vector3(0, -1, 0).add(out).addScaledVector(fwd, 0.05));
        aim(fa, hd, new THREE.Vector3(0, -1, 0).add(out.clone().multiplyScalar(0.3)).addScaledVector(fwd, 0.35));
      }
      sc.updateMatrixWorld(true);
      const col = i % 8, row = (i < 8 ? 0 : 2) + v; // (cells from the top-left)
      const x = col * 64, y = 512 - (row + 1) * 128;
      r.setViewport(x, y, 64, 128); r.setScissor(x, y, 64, 128);
      r.render(sc, cam);
      sc.remove(seat);
    }
  }
  window.__bake = () => cv.toDataURL('image/png');
  document.body.dataset.ready = '1';
}

// ---------- main loop ----------
const hazeTimes = [];
async function main() {
  // the motion clips (anim/) load while the room's files are fetched; the people wait for them (buildRoom)
  motionReady = initMotion().then((ok) => { tmark('motion'); return ok; });
  if (VIEW === 'avatar' || VIEW === 'spritebake') await motionReady;
  if (VIEW === 'avatar') return avatarView();
  if (VIEW === 'spritebake') return spriteBake();
  const { venue, addFront, addLod } = await buildRoom();
  tmark('room built');
  // (capture, still frames and the low and high presets have the front people from the first frame; live tv pages draw
  // the room first and add them as they arrive: frontIn below)
  const streamFront = P.fast && !CAPTURE && !STILL && !Q.has('frontfirst');
  if (!streamFront) { if (addLod) await addLod(); await addFront(); tmark('front people'); document.body.dataset.front = '1'; }
  const wallBase = venue.walls.material.color.clone().multiplyScalar(V.wallScale ?? 1);
  // ---- budget enablers (E) ----
  // opaque objects front to back: people, then the room, the floor, the walls and the sky (r160 sorts opaque by
  // renderOrder before material, and the venue's materials were made first), so early depth tests reject the hidden layers
  if (!ab('noorder')) {
    const ORDER = { sprites: 3, room: 5, 'room-emissive': 5, floor: 6, walls: 7, sky: 7, screen: 7 };
    scene.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent) o.renderOrder = o.name.startsWith('instances-') ? 1 : ORDER[o.name] ?? o.renderOrder; });
  }
  scene.traverse((o) => {
    if ((o.name !== 'floor' && o.name !== 'walls') || !o.material) return;
    o.material.dithering = !ab('nodither'); // 8-bit TV panels band in dark gradients
    if (o.material.map) o.material.map.anisotropy = P.aniso;
  });
  // sweep switches: take whole parts of the scene out
  // (tv: no haze beams by default, &ab=haze keeps them)
  const OFF = new Set([...(ab('nohaze') || (P.fast && !ab('haze')) ? ['beams'] : []), ...(ab('noroom') ? ['room', 'room-emissive', 'floor', 'walls', 'blobs'] : [])]);
  if (OFF.size) scene.traverse((o) => { if (OFF.has(o.name)) o.visible = false; });
  if (ab('nofront')) stats.front = 0;
  // &ab=overdraw: every surface drawn as a faint flat grey, added up and with no depth test, so the frame's brightness
  // is how many layers each pixel paid for (a box diagnostic: tools/render/overdraw.mjs counts them)
  // (&ab=overdraw keeps the draw order and the depth test, so it counts the fragments that are shaded; overdrawall
  // takes the depth test off too and counts every fragment rasterised)
  if (ab('overdraw') || ab('overdrawall')) scene.traverse((o) => {
    if (!o.material || !(o.isMesh || o.isPoints)) return;
    for (const m of [].concat(o.material)) {
      Object.assign(m, { blending: THREE.AdditiveBlending, toneMapped: false, fog: false }, ab('overdrawall') ? { transparent: true, depthTest: false, depthWrite: false } : {});
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); const i = sh.fragmentShader.lastIndexOf('}'); sh.fragmentShader = sh.fragmentShader.slice(0, i) + '  gl_FragColor = vec4(vec3(1.0 / 16.0), 1.0);\n}'; };
      const k0 = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => k0() + '|overdraw';
      m.needsUpdate = true;
    }
  });
  // the haze beams' slow smoke
  scene.traverse((o) => { if (o.name === 'beams' && o.material.uniforms && o.material.uniforms.time) hazeTimes.push(o.material.uniforms.time); });
  // every program now (the phones too), so the first cut never waits for a shader
  const phonesOff = people.map((p) => p.phone).filter(Boolean);
  phonesOff.forEach((m) => (m.visible = true));
  tmark('scene ready');
  try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
  tmark('shaders compiled');
  // the front people, once the room is on screen: built hidden, their programs compiled without a stall, then shown
  // at a frame's start; the shot's light is applied to them again
  const frontIn = async () => {
    if (addLod) { // (the close-ups' lod copy first: hidden, then compiled off the scene like the people)
      const cl = await addLod();
      const meshes = cl.groups.map((G) => G.mesh), holder = new THREE.Group(), was = meshes.map((m) => [m.parent, m.visible]);
      for (const m of meshes) { holder.add(m); m.visible = true; }
      try { await renderer.compileAsync(holder, camera, scene); } catch (e) { /* compiled on first draw */ }
      meshes.forEach((m, i) => { (was[i][0] || scene).add(m); m.visible = was[i][1]; });
      tmark('close-up copy');
      if (shot && litNow() !== 'wide') showCloseLod(true);
    }
    const front = await addFront();
    // (off the scene while their programs compile: compile only looks at visible objects, and the frame must not draw
    // them first, which would compile them in its own frame)
    const holder = new THREE.Group(), parents = front.map((p) => p.rig.seat.parent);
    for (const p of front) { holder.add(p.rig.seat); if (p.phone) p.phone.visible = true; }
    try { await renderer.compileAsync(holder, camera, scene); } catch (e) { /* compiled on first draw */ }
    front.forEach((p, i) => { (parents[i] || scene).add(p.rig.seat); if (p.phone) p.phone.visible = false; });
    applyShotLight();
    fileBytes.clear(); // (every file is parsed)
    tmark('front people');
    document.body.dataset.front = '1';
    // (shown: after the next frame has drawn them, the held frame goes and the shell hears ready)
    requestAnimationFrame(() => requestAnimationFrame(() => { frontShown = true; if (frames >= 3) { holdOff(); reportReady(); } }));
    const line = loadLine();
    console.log(line);
    if (HOST) report({ type: 'load', line });
  };
  // (a front that fails or takes over 20 s must not keep the shell's plate up: ready goes out anyway)
  const readyAnyway = () => { frontShown = true; if (frames >= 3) { holdOff(); reportReady(); } };
  if (streamFront) { setTimeout(() => frontIn().catch((e) => { console.error(e); readyAnyway(); }), 0); setTimeout(readyAnyway, 20000); } else fileBytes.clear();
  phonesOff.forEach((m) => (m.visible = false));
  if (Q.has('debug') || CAPTURE) Object.assign(window, { __scene: scene, __camera: camera, __THREE: THREE, __people: people, __room: room, __catch: catchlights });
  // (box harnesses: every front person's full body on or off, whatever the shot)
  // (box harnesses: one frame through the whole pipeline, post passes included, from a camera of theirs)
  if (Q.has('debug') || CAPTURE) window.__renderWith = (cam) => {
    camera.position.copy(cam.position); camera.quaternion.copy(cam.quaternion); camera.fov = cam.fov; camera.near = cam.near;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); lightView(); vlitFrame();
    if (FXAA) FXAA.render(room.now); else renderer.render(scene, camera);
    camera.near = 0.05; camera.updateProjectionMatrix();
  };
  if (Q.has('debug') || CAPTURE) window.__bodyDetail = (on) => { setBodyDetail(); for (const p of people) if (p.bodyMesh) p.bodyMesh.geometry = on ? p.bodyHi : p.bodyLow; };
  // a check the box harness runs in every mode: is anyone visible still in the bind pose (arms out)?
  const bindDir = new THREE.Vector3(0.72, -0.69, 0).normalize(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), inv = new THREE.Matrix4();
  window.__bindCheck = () => people.filter((p) => !p.hidden && p.rig.model.visible).map((p) => {
    inv.copy(p.rig.seat.matrixWorld).invert();
    const arm = (u, f, sx) => { tmpA.setFromMatrixPosition(u.matrixWorld).applyMatrix4(inv); tmpB.setFromMatrixPosition(f.matrixWorld).applyMatrix4(inv); const d = tmpB.sub(tmpA).normalize(); return d.angleTo(new THREE.Vector3(sx * bindDir.x, bindDir.y, 0)) * 57.3; };
    return { kind: p.kind, name: p.name, posed: !!p.posed, l: Math.round(arm(p.rig.b.lUpper, p.rig.b.lFore, 1)), r: Math.round(arm(p.rig.b.rUpper, p.rig.b.rFore, -1)) };
  }).filter((x) => !x.posed || x.l < 14 || x.r < 14);
  scene.updateMatrixWorld(true);
  const frame = (now) => {
    const fStart = performance.now();
    room.now = now;
    pollSnap(); // a snapshot on its way back from the GPU (before this frame's own work is queued)
    if (HOST) hostEvents(); else schedule(now);
    modeTimeline(now);
    // a beat to sway to only when someone sings, or while the room fills (stand-up has no beat)
    room.maskY = 0.22 * RH; // the lower third's top edge in drawing-buffer pixels (the arena masks its beams below it)
    room.beat = room.act === 'singing' || room.mode === 'preview' ? V.beat || 0 : 0;
    // arms overhead belong to a stadium: the arena, or the finale of a sung set
    room.vocab = V.stadium || room.venueId === 'arena' || (room.finale && room.act === 'singing') ? 'stadium' : 'club';
    // house lights: up for the finale and after the set, about 60% while the room fills; the stage key dims for the
    // doors and after the set
    const ease = CAPTURE || STILL ? 1 : 0.04;
    room.house += ((room.houseTarget ?? 0) - room.house) * ease;
    room.key += ((room.keyTarget ?? 1) - room.key) * ease;
    room.lastCall += ((room.lastCallTarget ?? 0) - room.lastCall) * ease;
    venue.walls.material.color.copy(wallBase).multiplyScalar(1 + (V.wallHouse ?? 8) * room.house);
    // house lights thin the dark: the haze recedes so the walls and the back of the room come up
    if (scene.fog) { const f = curFog || FOG[shot] || FOG.wide, k = 1 + 1.5 * room.house; scene.fog.near = f[0] * k; scene.fog.far = f[1] * k; }
    director(now);
    // (0.7 s into a reaction shot, once the faces have started: the laugher it shows, forward in the sound)
    if (shot === 'close' && curSetup && featuredCut !== cuts && now - cutAt > 0.6) { if (featureVoice(curSetup) || now - cutAt > 2.5) featuredCut = cuts; }
    placeCamera(now);
    lightLevels();
    vlitFrame();
    const t0 = performance.now();
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (!applyTraffic(p, now)) { placePhone(p); continue; }
      // TV: the people the shot is about update every frame, everyone else on alternate frames (15 Hz at 30 fps)
      // (and the front people dimmed out of focus in a close-up or heckler shot at a quarter: 7.5 Hz)
      if (P.halfRate && p.posed && !p.fresh && !(p.focus && shot === 'close') && (frames + i) % (shot !== 'wide' && !p.focus && p.kind === 'front' ? 4 : 2) && !STILL && !CAPTURE && !p.moved) continue;
      p.update(now, room);
      p.skelDirty = true;
      p.posed = true; p.fresh = false;
      placePhone(p);
    }
    for (const c of crowds) if (!c.hidden) c.update(now, room);
    if (crowds.shared) { crowds.shared.uTime.value = now; crowds.shared.uBeat.value = room.beat; }
    room.camPos = camera.position;
    room.shot = litNow(); // (the venue's own close-up treatment follows the light: a wide-lit setup is a wide to it)
    if (venue.animate) venue.animate(now, room);
    cpuMs = cpuMs * 0.9 + (performance.now() - t0) * 0.1;
    const gu = venue.points.material.uniforms;
    gu.time.value = now;
    // glow points keep their size in metres whatever the lens (0.7 reproduces the old size at the old 50° lens)
    gu.scale.value = (0.7 * RH) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    if (gu.gain) gu.gain.value = 1 + 2 * room.house; // sconces and the bar brighten with the house lights (×3 after the set)
    if (post) post.material.uniforms.uTime.value = now;
    for (const u of hazeTimes) u.value = now;
    if (candle) candle.intensity = 0.9 * (0.85 + 0.15 * Math.sin(now * 11) * Math.sin(now * 7.3));
    soundTick(now);
    if (frames % 15 === 0) captionFor();
    if (FXAA) FXAA.render(now); else renderer.render(scene, camera);
    if (pendingVenue) { // (a venue change: keep this frame for the reload, then go)
      try { sessionStorage.setItem('encore-hold', JSON.stringify({ t: Date.now(), uri: canvas.toDataURL('image/jpeg', 0.82) })); } catch (e) { /* no hold: black until ready */ }
      const to = pendingVenue; pendingVenue = null;
      location.replace(to);
    }
    for (let i = 0; i < people.length; i++) people[i].skelDirty = false;
    if (snaps.length) takeSnaps();
    frames++;
    const pn = performance.now();
    frameMs = frames < 3 ? pn - lastT : frameMs * 0.9 + (pn - lastT) * 0.1;
    if (frames > 2) { recordCpu(pn - fStart); recordInterval(pn - lastT); }
    lastT = pn;
    if (frames === 2) { texMB = textureMB(); dlMB = downloadsMB(); }
    hud();
    if (frames === 1) tmark('first frame');
    if (frames === 3) {
      tmark('third frame');
      const line = loadLine();
      console.log(line);
      if (HOST) report({ type: 'load', line });
      window.__load = () => ({ marks: LOADT.marks, files: LOADT.files, urls: [...LOADT.urls], line: loadLine() });
    }
    if (HOST && frames === 3) {
      // (the first frame, for timing; `ready`, which lifts the TV shell's plate, waits until the front people are in
      // and shown, so the screen goes from the plate to the full room, never to empty front rows)
      report({ type: 'first', load: loadLine() });
      if (!streamFront || frontShown) reportReady();
    }
    if ((HOST || LOG) && frames > 3 && pn - lastReport > 2000) {
      lastReport = pn;
      const i = renderer.info.render, ft = frameTimes();
      const vv = viewport();
      const st = { type: 'stats', view: `${vv.w}x${vv.h}`, fit: stageFit, fps: Math.round(1000 / Math.max(frameMs, 0.1)), ms: +frameMs.toFixed(1), p50: ft.p50, p90: ft.p90, max: ft.max, long: ft.long, cpu50: ft.cpu50, cpu90: ft.cpu90, aa: CTX_AA, calls: i.calls, tris: i.triangles };
      report(st);
      if (LOG) console.log(`[crowd] sweep ${LABEL} · ${st.fps} fps · p50 ${st.p50} ms · p90 ${st.p90} ms · max ${st.max} ms · over50 ${st.long}/${ft.n} · cpu p50 ${st.cpu50} p90 ${st.cpu90} ms · ${st.calls} calls · ${st.tris} tris · ${RW}x${RH} · raf ${pct(rafDt, nRaf, 0.5).toFixed(1)} ms, late p50 ${pct(rafLate, nRaf, 0.5).toFixed(1)} p90 ${pct(rafLate, nRaf, 0.9).toFixed(1)} · draws in vsyncs 1:${drawV[1]} 2:${drawV[2]} 3:${drawV[3]} 4:${drawV[4]} 5+:${drawV[5]}${VSYNC_CAP ? ' · vsync cap' : ''}`);
      drawV.fill(0);
    }
    if (frames === 3) {
      document.body.dataset.ready = '1';
      setTimeout(() => sound.go(), 800); // (the sound decodes only now the room is on screen)
      window.__firstFrameMs = Math.round(performance.now());
      if (!streamFront || frontShown) holdOff(); // (the last frame of the previous venue, held over the reload, gives way to this room, once it is whole)
      const i = renderer.info.render;
      const breakdown = { front: 0, inst: {}, other: 0 };
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const tri = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        const n = tri * (o.geometry.isInstancedBufferGeometry ? o.geometry.instanceCount : o.isInstancedMesh ? o.count : 1);
        if (o.name.startsWith('instances-')) breakdown.inst[o.name.slice(10)] = Math.round(n); else if (o.isSkinnedMesh && o.name !== 'middle-rows') breakdown.front += n; else breakdown.other += n;
      });
      breakdown.front = Math.round(breakdown.front); breakdown.other = Math.round(breakdown.other);
      window.__stats = { breakdown, venue: VENUE_ID, mode: room.mode, preset: PRESET_NAME, res: `${RW}x${RH}`, calls: i.calls, triangles: i.triangles, front: stats.front, mid: stats.mid, back: stats.back, sprites: stats.sprites, shot, cpuMs, texMB, dlMB, programs: renderer.info.programs.length, aa: CTX_AA, cast: stats.cast };
    }
    if (frames === 4) window.__frameTimes = frameTimes; // for the box harnesses
    if (frames === 4 || CAPTURE) window.__crowdMask = crowdMask;
    if (frames === 4) window.__shot = () => ({ shot, setup: shot === 'close' && curSetup ? curSetup.label : shot === 'wide' && wideAt === 3 ? 'wide variant' : null, size: curSetup && shot === 'close' ? curSetup.size : shot, lit: litNow(), i: shot === 'close' ? closeAt : -1 });
    // (box harnesses: cut to setup i now, or back to the wide with -1)
    if (frames === 4 || CAPTURE) window.__cutTo = (i) => { holdShot = true; shot = ''; if (i < 0) cut('wide'); else cut('close', i); return window.__shot ? window.__shot() : null; };
    if (frames === 4) window.__closes = () => ({ at: closeAt, log: closeLog.slice(), setups: CLOSES.map((S) => ({ label: S.label, size: S.size, lit: S.lit, seats: S.seats.map((x) => [+x.x.toFixed(2), x.row]), pos: S.pos.toArray().map((v) => +v.toFixed(2)), look: S.look.toArray().map((v) => +v.toFixed(2)) })), front: people.filter((p) => p.kind === 'front').map((p) => [+p.src.x.toFixed(2), p.src.row, !!p.focus]) });
  };
  if (CAPTURE) {
    // frame-exact capture: the harness steps the clock and screenshots each frame
    window.__renderAt = (t) => { captureT = t; frame(t); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; };
    frame(T0); frame(T0); frame(T0);
    return;
  }
  // tv: a 30 fps cap for steady pacing on the slowest GPU (&fps= changes it, 0 removes it)
  // &ab=vsync: the cap counts vsyncs instead of comparing times (draw every second rAF at 60 Hz, and at once when a
  // callback comes a vsync late), so a frame whose callback ran late can't make the next on-time one look too early
  let lastDraw = -1e9, lastRaf = 0, since = 99;
  const loop = (t) => {
    const late = performance.now() - t;
    const vs = vsyncMs();
    if (lastRaf) { rafDt[iRaf] = t - lastRaf; rafLate[iRaf] = late; iRaf = (iRaf + 1) % rafDt.length; nRaf = Math.min(nRaf + 1, rafDt.length); since += Math.max(1, Math.round((t - lastRaf) / vs)); }
    lastRaf = t;
    const capped = FPS_CAP && !STILL && frames > 3;
    const draw = !capped || (VSYNC_CAP ? since >= Math.max(1, Math.round(1000 / FPS_CAP / vs)) : t - lastDraw >= 1000 / FPS_CAP - 4);
    if (draw) { if (lastDraw > 0) drawV[Math.min(5, Math.round((t - lastDraw) / vs))]++; since = 0; lastDraw = t; frame(clock()); }
    if (!STILL || frames < 3) requestAnimationFrame(loop);
  };
  loop(performance.now());
}
main().catch((e) => { console.error(e); document.body.dataset.ready = '1'; window.__stats = { error: String((e && e.stack) || e) }; });
