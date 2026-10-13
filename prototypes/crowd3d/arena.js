// The arena: a bowl seen from a big stage at one end (docs/venues-3d.md). The floor crowd stands at the barrier (full
// characters with arms on the rail, then shader-animated standing instances); the lower and upper tiers are
// thousands of procedural sprites, two triangles each, whose silhouette (head, shoulders, arms) is drawn live in the
// fragment shader: their colour, sway on the beat, bounce, raised arms and the wave that travels round the bowl all
// come from per-instance attributes and uniforms the behaviour sets each frame. Floodlight towers at the corners, a big
// moving coloured beams, phone lights (sparse during the set, a flood at
// the finale), the night sky above the roof line.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './people.js';
import { Collector, canvasTex, glowPoints, glowTexture } from './venue.js';

const AR = { halfW: 15, back: 40, stageH: 1.8, stageZ: 0, barrierZ: 2.67, ceil: 40 };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function layoutArena(rowCount) {
  const R = rng(808);
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const z = 3.0 + r * 0.62, off = r % 2 ? 0.3 : 0, seats = [];
    for (let x = -AR.halfW + 1.2 + off; x < AR.halfW - 1.2; x += 0.6) {
      const j = r ? 0.08 : 0; // the barrier row stands in a line, the rest of a standing crowd does not
      seats.push({ x: x + (R() - 0.5) * j * 2, z: z + (R() - 0.5) * j * 2, y: 0, row: r, cabaret: false, standing: true, rail: r === 0 });
    }
    rows.push({ z, y: 0, cabaret: false, seats });
  }
  return rows;
}

// ---------- sprites: the tiers and the back of the floor ----------
const SPRITE_VS = /* glsl */ `
attribute vec4 aP; attribute vec4 aC; attribute vec4 aS;
uniform float uTime, uBeat, uWave, uWaveFront, uArms, uBounce, uFill, uFogNear, uFogFar, uBeamPhase, uFall, uLaugh, uArmsFrac, uLaughT;
uniform vec3 uCam; uniform vec2 uNear;
varying vec2 vUv; varying vec3 vCloth; varying float vSkin, vArms, vFog, vCount, vBeam, vSide, vH, vSeed, vNear, vFall;
void main(){
  float ph = aP.w;
  float present = step(fract(ph * 0.618), uFill);
  vec3 base = aP.xyz;
  vec3 toCam = uCam - base; toCam.y = 0.0;
  // (each person turned up to 15° off the lens, so the floor isn't a grid of flat cards square to it)
  float yj = (fract(ph * 0.913) - 0.5) * 0.52, cy = cos(yj), sy = sin(yj);
  vec3 fw0 = normalize(toCam), fw = vec3(fw0.x * cy - fw0.z * sy, 0.0, fw0.x * sy + fw0.z * cy); vec3 right = vec3(fw.z, 0.0, -fw.x);
  float h = aS.x * 1.35, w = aS.y * aS.w;
  // (no shared rhythm: the user found the crowd's synced sway unreal.) Each person is mostly still, with a rare idle
  // event of their own (a weight shift or a lean, about 1 s in every 6-14 s, own phase, own size); a laugh reaches
  // each person after their own delay (0-0.4 s, the near pit first) and moves them at their own rate and size
  float r1 = fract(ph * 0.371), r2 = fract(ph * 0.613), r3 = fract(ph * 0.827), r4 = fract(ph * 0.291);
  float per = 6.0 + 8.0 * r1, tl = mod(uTime + ph * 13.7, per);
  float ev = smoothstep(0.0, 0.35, tl) * smoothstep(1.3, 0.75, tl);
  float sway = ev * (0.015 + 0.035 * r2) * (r3 < 0.5 ? -1.0 : 1.0);
  sway += sin(uTime * uBeat * 6.2832 * (0.96 + 0.08 * r4) + ph) * 0.06 * step(0.001, uBeat); // (sung: near the beat, not on it)
  float dly = 0.4 * clamp((length(base.xz) - 5.0) / 30.0, 0.0, 1.0) * (0.6 + 0.4 * r2) + 0.08 * r4;
  float lp = uLaugh * smoothstep(dly, dly + 0.25, uTime - uLaughT) * (0.6 + 0.8 * r3);
  float bounce = uBounce * abs(sin(uTime * 4.4 * (0.85 + 0.3 * r1) + ph * 2.0)) * 0.08 + lp * 0.045 * abs(sin(uTime * (6.5 + 6.0 * r1) + ph * 5.0));
  sway += lp * 0.03 * sin(uTime * (9.0 + 8.0 * r2) + ph * 11.0);
  float wave = uWave * smoothstep(0.075, 0.0, abs(aC.w - uWaveFront));
  vArms = clamp(max(wave, uArms * step(fract(ph * 1.37), uArmsFrac)), 0.0, 1.0); // (70% for a cheer, 15% for applause)
  #ifdef SPRITE_SHAPE
  // the outline is geometry (a fan round head, hair, shoulders and arms; position.z says what each y is measured from:
  // 0 the floor, 1 the top of the head, 2 a fraction of the height, 3 an arm tip that rises with vArms)
  float H = aS.x, an = position.z;
  float ly = an < 0.5 ? position.y : an < 1.5 ? H + position.y : an < 2.5 ? position.y * H : H + position.y + 0.6 * vArms;
  float lx = position.x;
  vec3 pos = base + right * (lx + sway * ly * 0.4) + vec3(0.0, ly + (bounce + vArms * 0.1) * ly / h, 0.0);
  vUv = vec2(lx / w + 0.5, ly / h);
  #else
  vec3 pos = base + right * (position.x * w + sway * position.y * h * 0.4) + vec3(0.0, position.y * h + (bounce + vArms * 0.1) * position.y, 0.0);
  vUv = vec2(position.x + 0.5, position.y);
  #endif
  pos = mix(base - vec3(0.0, 5.0, 0.0), pos, present);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vCloth = aC.rgb; vSkin = aS.z; vCount = aS.w; vH = aS.x; vSeed = fract(ph * 0.1031);
  // the stage light falls off with distance; faces show only where it reaches, further out heads are backlit
  float dS = length(base - vec3(0.0, 2.0, -2.0));
  vFall = 1.0 / (1.0 + pow(dS / uFall, 2.0));
  vNear = smoothstep(uNear.x, uNear.y, dS) * (0.6 + 0.4 * step(base.y, 0.5)); // (faces from 7 m to 30 m; the stage look: 5 to 10)
  vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  // (each sprite catches a passing wash on its own: half of them, at their own strength, so the stands show lit heads
  // in the beam rather than flat blue and red bands)
  float catchB = step(0.5, fract(ph * 0.7713)) * (0.4 + 0.6 * fract(ph * 0.3119));
  vBeam = catchB * smoothstep(0.8, 1.0, sin(aC.w * 17.0 - uTime * 0.85 + uBeamPhase)) * (0.6 + 0.4 * sin(uTime * 0.37 + aC.w * 9.0));
  vSide = step(0.5, fract(aC.w * 3.0 + uTime * 0.05));
}`;
// a head-and-shoulders silhouette in metres: hair cap (some long), a shaded face oval, neck, collar, rounded
// shoulders, raised arms when the wave or the finale lifts them
const SPRITE_FS = /* glsl */ `
uniform vec3 uBeamA, uBeamB, uFogColor, uWarm, uRim; uniform float uDim, uFace, uMaskY, uMaskOut, uGain, uWashK; uniform sampler2D uAtlas;
varying vec2 vUv; varying vec3 vCloth; varying float vSkin, vArms, vFog, vCount, vBeam, vSide, vH, vSeed, vNear, vFall;
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdRBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdEll(vec2 p, vec2 r){ float k = length(p / r); return (k - 1.0) * min(r.x, r.y); }
// skin in the measured proportions (Pawar et al. 2024: light 15%, medium 61%, dark 24%), hair mostly near-black
vec3 skinFor(float u){ vec3 c = u < 0.15 ? vec3(0.686, 0.576, 0.475) : u < 0.37 ? vec3(0.635, 0.514, 0.404) : u < 0.63 ? vec3(0.588, 0.459, 0.341) : u < 0.82 ? vec3(0.49, 0.376, 0.294) : vec3(0.396, 0.298, 0.247); return pow(c, vec3(2.2)); }
vec3 hairFor(float u){ vec3 c = u < 0.85 ? vec3(0.06, 0.05, 0.045) : u < 0.93 ? vec3(0.17, 0.11, 0.07) : u < 0.98 ? vec3(0.45, 0.44, 0.42) : vec3(0.29, 0.13, 0.09); return pow(c, vec3(2.2)); }
void main(){
  float n = vCount;
  float cx = fract(vUv.x * n), idx = floor(vUv.x * n);
  float seed = fract(vSeed + idx * 0.37);
  float H = vH;
  vec2 b = vec2((cx - 0.5) * 0.5, vUv.y * H * 1.35);           // metres: x across one person, y up from the floor/seat
  float hc = H - 0.115;                                         // head centre
  float up = vArms * step(0.35, fract(seed * 3.1 + 0.2));
  float dHead = sdEll(b - vec2(0.0, hc), vec2(0.082, 0.108));
  float dNeck = sdRBox(b - vec2(0.0, H - 0.235), vec2(0.04, 0.05), 0.02);
  float topY = H - 0.25, torsoH = topY * 0.5;
  float taper = mix(0.16, 0.2, clamp(b.y / topY, 0.0, 1.0));
  float dTorso = sdRBox(b - vec2(0.0, torsoH), vec2(taper, torsoH), 0.075);
  float aL = sdSeg(b, vec2(0.16, topY - 0.05), mix(vec2(0.2, topY - 0.55), vec2(0.21, H + 0.3), up)) - 0.042;
  float aR = sdSeg(b, vec2(-0.16, topY - 0.05), mix(vec2(-0.2, topY - 0.55), vec2(-0.21, H + 0.3), up)) - 0.042;
  bool longHair = seed > 0.55;                                  // about 45% long hair
  float dLong = longHair ? sdRBox(b - vec2(0.0, hc - 0.1), vec2(0.095, 0.13), 0.05) : 1.0;
  float d = min(min(min(dHead, dNeck), dTorso), min(min(aL, aR), dLong));
  float aa = fwidth(d) * 1.2;
  #ifdef SPRITE_ATLAS
  // our own avatars, baked from the tv models (people/arena_sprites.png, ?view=spritebake): one of twelve, from the
  // front or three-quarters, faces and clothes as rendered; raised arms are drawn over them
  float av = floor(fract(seed * 12.9898 + 0.137) * 12.0), vw = step(0.5, fract(seed * 7.31));
  float acol = mod(av, 8.0), arow = (av < 8.0 ? 0.0 : 2.0) + vw;
  vec2 cuv = vec2(0.5 + b.x / 0.975, b.y / 1.95) * vec2(1.0, 1.7 / H) + vec2(0.0, 0.0);
  vec4 tex = texture2D(uAtlas, vec2((acol + clamp(cuv.x, 0.0, 1.0)) / 8.0, 1.0 - (arow + 1.0 - clamp(cuv.y, 0.0, 1.0)) / 4.0));
  bool armUp = up > 0.05 && min(aL, aR) < 0.0 && b.y > topY;
  float inImg = (armUp ? 1.0 : step(0.5, tex.a)) * step(cuv.y, 1.0);
  #ifdef SPRITE_SHAPE
  float outside = 1.0 - inImg;
  #else
  if (inImg < 0.5) discard;
  #endif
  #else
  #ifdef SPRITE_SHAPE
  float outside = step(0.5, smoothstep(-aa, aa, d)); // no discard: the geometry's margin outside the outline is painted as the dark tier
  #else
  if (1.0 - smoothstep(-aa, aa, d) < 0.5) discard;
  #endif
  #endif
  vec3 skin = skinFor(vSkin);
  vec3 hair = hairFor(fract(seed * 7.3));
  vec3 col = vCloth;
  float lit = 0.08 + 0.26 * clamp(b.y / H, 0.0, 1.0) + 0.2 * vNear * clamp(b.y / H, 0.0, 1.0);
  if (dHead < 0.0) {
    vec2 hp = (b - vec2(0.0, hc)) / vec2(0.082, 0.108);
    float hairline = 0.25 + 0.12 * cos(hp.x * 3.0) - (longHair ? 0.0 : 0.05);  // a cap over the top, a fringe at the front
    // skin only inside the face, so the hair frames it; out of the stage light the face goes dark
    if (hp.y > hairline || abs(hp.x) > 0.78 - 0.2 * max(hp.y, 0.0)) { col = hair; lit *= 0.85 + 0.25 * clamp(hp.y, 0.0, 1.0); }
    else {
      col = mix(hair * 0.5, skin, vNear * uFace); // close-ups: no face oval, the rows behind are silhouettes
      lit *= 0.72 + 0.4 * clamp(0.5 - hp.y * 0.5, 0.0, 1.0) * (1.0 - 0.35 * abs(hp.x)); // lit forehead and cheeks, darker jaw
      if (hp.y > -0.05 && hp.y < 0.13 && abs(hp.x) > 0.15 && abs(hp.x) < 0.62) lit *= 0.62;  // the eyes
      if (hp.y < -0.62) lit *= 0.8;
    }
  } else if (dLong < 0.0 && dNeck > -0.005 && b.y > topY - 0.06) { col = hair; lit *= 0.8; }
  else if (dNeck < 0.0) { col = mix(hair * 0.5, skin, vNear); lit *= 0.72; }
  else if (min(aL, aR) < 0.0 && b.y > H + 0.12) col = skin;       // hands at the top of raised arms
  else if (seed > 0.5 && dTorso < 0.0 && abs(b.x) < (b.y - (topY - 0.13)) * 0.55 && b.y > topY - 0.13) { col = mix(hair * 0.5, skin, vNear); lit *= 0.8; } // open collar
  else lit *= 0.9 + 0.2 * smoothstep(topY - 0.15, topY, b.y);      // the light catches the shoulders
  #ifdef SPRITE_ATLAS
  if (armUp) { col = b.y > H + 0.12 ? skin : vCloth; lit = 0.5; }
  else {
    // (variety over 24 baked images: each person's brightness 0.7-1.1 and the clothes pulled a little towards the
    // sprite's own palette colour; the baked light is already in the image, so less of the scene's)
    vec3 tint = vCloth / max(1e-3, dot(vCloth, vec3(0.333))) ;
    col = tex.rgb * mix(0.7, 1.1, fract(seed * 5.3)) * mix(vec3(1.0), clamp(tint, 0.4, 2.2), 0.22);
    lit = 0.34 + 0.18 * vNear;
  }
  #endif
  col *= lit * vFall * uDim * uGain; // (uGain: the stage look's wash over the pit)
  col += uWarm * uWashK * uDim * vFall * (0.35 + 0.65 * clamp(b.y / H, 0.0, 1.0)); // the stage's warm spill over the heads (more in the stage look)
  // a thin cool rim from the far floodlights along the top of heads and shoulders
  float edge = smoothstep(-0.03, -0.004, d) * step(topY - 0.12, b.y);
  col += uRim * edge * (0.35 + 0.65 * (1.0 - vFall)) * uDim;
  // the moving beams light an edge band, they don't multiply the clothes
  col = mix(col, col * 1.35 + mix(uBeamA, uBeamB, vSide) * 0.06 * uDim * uDim, vBeam * smoothstep(uMaskY, uMaskY * 1.5, gl_FragCoord.y));
  #ifdef SPRITE_SHAPE
  col = mix(col, uFogColor * 0.6, outside);
  #endif
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef SPRITE_SHAPE
  if (uMaskOut > 0.5) gl_FragColor = vec4(vec3(1.0 - outside), 1.0); // (the box's crowd-coverage check: the people, not the margin)
  #else
  if (uMaskOut > 0.5) gl_FragColor = vec4(1.0); // (the box's crowd-coverage check: window.__crowdMask)
  #endif
}`;

// &ab=spriteshape: a person's outline as a fan of 16 triangles (x in metres, y, what y is measured from), for one or two
// people a sprite, instead of a quad whose corners the fragment shader discards: opaque, so the tile GPU can kill the
// pixels hidden behind nearer rows before shading them
const RING = [[-0.245, 0, 0], [-0.245, -0.33, 1], [-0.25, -0.3, 3], [-0.17, -0.25, 1], [-0.15, -0.24, 1], [-0.15, -0.11, 1], [-0.08, -0.03, 1], [0, 0, 1]];
const OUTLINE16 = [...RING, ...RING.slice(0, -1).reverse().map(([x, y, a]) => [-x, y, a])];
// (&ab=fan9: a coarser outline, 9 triangles, for the round 7 sweep: the sprites are 60k of the arena's 148k triangles)
const RING9 = [[-0.245, 0, 0], [-0.25, -0.3, 3], [-0.15, -0.24, 1], [-0.08, -0.03, 1], [0, 0, 1]];
const OUTLINE9 = [...RING9, ...RING9.slice(0, -1).reverse().map(([x, y, a]) => [-x, y, a])];
function outlineGeometry(count) {
  const OUTLINE = ARENA.ab && ARENA.ab.fan9 ? OUTLINE9 : OUTLINE16;
  const pos = [], idx = [];
  for (let k = 0; k < count; k++) {
    const dx = count === 1 ? 0 : (k - 0.5) * 0.5, c = pos.length / 3;
    pos.push(dx, 0.45, 2);
    for (const [x, y, a] of OUTLINE) pos.push(dx + x, y, a);
    for (let i = 0; i < OUTLINE.length; i++) idx.push(c, c + 1 + i, c + 1 + ((i + 1) % OUTLINE.length));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
// ---------- impostors: the far stands as blocks of people (approved by the user for the far upper stands only) ----------
// Each block is one quad standing in a tier, three rows of twelve people baked at load from the sprites' own palette
// and skin tones into one of eight variants (neighbours differ). The far stands still live: each block sways and
// shimmers on its own phase, its brightness and warmth follow the room's reaction level (the engine's drive, like
// everyone else), the preview fills it person by person, and the odd phone screen glints. Everything near (the floor,
// the rail, the lower twelve rows) stays person by person. &ab=noimpostor drops them (the far stands then stay empty).
const IMP_V = 8, IMP_COLS = 12, IMP_ROWS = 3, IMP_W = 192, IMP_H = 48;
function impostorTexture(R, palette) {
  const c = document.createElement('canvas');
  c.width = IMP_W * IMP_V; c.height = IMP_H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(13,16,26)'; g.fillRect(0, 0, c.width, c.height); // the seats between people
  const sum = palette.reduce((a, [, w]) => a + w, 0);
  const pick = () => { let x = R() * sum; for (const [h, w] of palette) if ((x -= w) <= 0) return h; return palette[0][0]; };
  const SKIN = ['#d9c3a8', '#cfae8f', '#bb9474', '#9c7a5f', '#7e604b'], HAIR = ['#141210', '#141210', '#2a1c12', '#6e6a62', '#4a2618'];
  const rgb = (hex, k) => `rgb(${[16, 8, 0].map((b) => Math.round(((hex >> b) & 255) * k)).join(',')})`;
  for (let v = 0; v < IMP_V; v++) for (let r = IMP_ROWS - 1; r >= 0; r--) for (let i = 0; i < IMP_COLS; i++) {
    if (R() < 0.07) continue; // an empty seat
    const cell = IMP_W / IMP_COLS, x = v * IMP_W + (i + 0.5) * cell + (R() - 0.5) * 3, base = IMP_H - r * 12 - 1;
    g.fillStyle = rgb(pick(), 0.7 + R() * 0.3);
    g.beginPath(); if (g.roundRect) g.roundRect(x - 5.5, base - 14, 11, 14, 4); else g.rect(x - 5.5, base - 14, 11, 14); g.fill();
    g.fillStyle = SKIN[Math.floor(R() * SKIN.length)];
    g.beginPath(); g.ellipse(x, base - 17, 3.1, 3.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = HAIR[Math.floor(R() * HAIR.length)];
    g.beginPath(); g.ellipse(x, base - 18.6, 3.3, 2.4, 0, Math.PI, 0); g.fill();
  }
  // the alpha says where a person is (for the preview's filling and the coverage check); the seats stay opaque below it
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) d.data[i + 3] = d.data[i] + d.data[i + 1] + d.data[i + 2] > 13 + 16 + 26 + 12 ? 255 : 0;
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  return t;
}
const IMP_VS = /* glsl */ `
attribute vec4 aB; attribute vec4 aV;
uniform vec3 uCam; uniform float uFogNear, uFogFar, uFall;
varying vec2 vUv; varying float vVar, vPh, vBr, vFog, vFall;
void main(){
  vec3 base = aB.xyz; vec3 toCam = uCam - base; toCam.y = 0.0;
  vec3 fw = normalize(toCam), right = vec3(fw.z, 0.0, -fw.x);
  vec3 pos = base + right * (position.x * aB.w) + vec3(0.0, position.y * aV.x, 0.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = vec2(position.x + 0.5, position.y); vVar = aV.y; vPh = aV.z; vBr = aV.w;
  vFall = 1.0 / (1.0 + pow(length(base - vec3(0.0, 2.0, -2.0)) / uFall, 2.0));
  vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
}`;
const IMP_FS = /* glsl */ `
uniform sampler2D map, uAtlas; uniform float uTime, uLevel, uFill, uDim, uGain, uWashK, uOn, uMaskOut; uniform vec3 uWarm, uFogColor;
varying vec2 vUv; varying float vVar, vPh, vBr, vFog, vFall;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float row = floor(uv.y * ${IMP_ROWS}.0);
  // each row sways a little on the block's own phase, more while the room reacts
  // (no shared rhythm: each row of each block moves now and then on its own, more often while the room reacts)
  float rr = fract(vPh * 7.13 + row * 0.371), per = 5.0 + 9.0 * rr - 3.0 * uLevel, tl = mod(uTime + rr * 40.0 + vPh * 17.0, per);
  float ev = smoothstep(0.0, 0.3, tl) * smoothstep(1.2, 0.7, tl);
  uv.x += ev * 0.008 * (rr < 0.5 ? -1.0 : 1.0) + uLevel * 0.004 * sin(uTime * (7.0 + 6.0 * rr) + rr * 30.0);
  uv.x = clamp(uv.x, 0.002, 0.998);
  vec2 cell = floor(vec2(uv.x * ${IMP_COLS}.0, uv.y * ${IMP_ROWS}.0));
  float h = hash(cell + vec2(vVar * 13.0, vPh * 71.0));
  #ifdef IMP_ATLAS
  // each place one of our avatars (the sprites' atlas), head and shoulders over the row in front; some seats empty
  vec2 lc = vec2(fract(uv.x * ${IMP_COLS}.0), fract(uv.y * ${IMP_ROWS}.0));
  float av = floor(fract(h * 9.13) * 12.0), vw = step(0.5, fract(h * 7.31));
  float ac = mod(av, 8.0), ar = (av < 8.0 ? 0.0 : 2.0) + vw;
  vec4 t = texture2D(uAtlas, vec2((ac + 0.12 + 0.76 * lc.x) / 8.0, 1.0 - (ar + 1.0 - (0.5 + 0.5 * lc.y)) / 4.0));
  t.a = step(0.5, t.a) * step(0.07, fract(h * 3.7));
  #else
  vec4 t = texture2D(map, vec2((vVar + uv.x) / ${IMP_V}.0, uv.y));
  #endif
  float here = t.a * step(h, uFill); // (the preview fills the stands person by person)
  vec3 seat = vec3(0.0039, 0.0052, 0.0101);
  // brightness: the stage light's falloff, the block's own level, the room's reaction (a shimmer of heads moving)
  // (0.3: the sprites' own light on a far person; the baked colours are unlit)
  float lift = 0.3 * vBr * (0.8 + 0.5 * uLevel) * (1.0 + 0.18 * uLevel * sin(uTime * (6.0 + 5.0 * fract(h * 3.3)) + h * 40.0));
  vec3 col = mix(seat, t.rgb * lift * vFall * uDim * uGain, here);
  col += uWarm * uWashK * 0.6 * uDim * vFall * here * (0.6 + 0.4 * uLevel);
  // the odd phone screen
  float ph = step(0.993 - 0.02 * uOn, hash(cell + floor(uTime * 0.4 + h * 7.0))) * here;
  col += vec3(0.5, 0.6, 0.85) * ph * 0.6;
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  if (uMaskOut > 0.5) gl_FragColor = vec4(vec3(here), 1.0);
}`;
function impostors(blocks, R, palette, spriteU, phoneU) {
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', quad.getAttribute('position')); g.setIndex(quad.getIndex());
  g.instanceCount = blocks.length;
  const B = new Float32Array(blocks.length * 4), Vv = new Float32Array(blocks.length * 4);
  blocks.forEach((b, i) => { B.set([b.x, b.y, b.z, b.w], i * 4); Vv.set([b.h, Math.floor(R() * IMP_V), R(), 0.85 + R() * 0.3], i * 4); });
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4)); g.setAttribute('aV', new THREE.InstancedBufferAttribute(Vv, 4));
  const share = (k) => spriteU[k];
  const u = {
    map: { value: impostorTexture(R, palette) }, uLevel: { value: 0 }, uCam: share('uCam'), uTime: share('uTime'), uFill: share('uFill'),
    uDim: share('uDim'), uGain: share('uGain'), uWashK: share('uWashK'), uWarm: share('uWarm'), uFogColor: share('uFogColor'),
    uFogNear: share('uFogNear'), uFogFar: share('uFogFar'), uFall: share('uFall'), uMaskOut: share('uMaskOut'), uOn: phoneU.uOn,
  };
  u.uAtlas = spriteU.uAtlas;
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: IMP_VS, fragmentShader: IMP_FS, defines: ARENA.ab && ARENA.ab.pillImp ? {} : { IMP_ATLAS: 1 } }));
  mesh.frustumCulled = false;
  mesh.name = 'sprites'; // (drawn with the sprites, and counted as crowd by the coverage check)
  return mesh;
}
/**
 * The far stands' blocks: twelve people wide, three rows deep, along the tiers the sprites leave out. The upper ring
 * keeps its lower six rows on the sides only: from the stage riser its end and its top rows ran along the frame's top
 * edge, behind the caption and LIVE.
 */
function impostorBlocks(half = false) {
  const out = [], W = IMP_COLS * 0.62;
  // (&ab=imphalf: every other block row, a fewer-layers candidate; the tier's dark plane shows between them)
  const band = (k0, rows, rise, at) => { for (let k = k0, j = 0; k < k0 + rows; k += IMP_ROWS, j++) if (!half || j % 2 === 0) at(k, IMP_ROWS * rise + 1.45); };
  for (const s of [-1, 1]) {
    band(12, 6, 0.42, (k, h) => { for (let z = 2 + W / 2; z < 40; z += W) out.push({ x: s * (16.6 + (k + 1) * 0.84), y: 1.4 + k * 0.42, z, w: W, h }); });
    band(0, 6, 0.5, (k, h) => { for (let z = W / 2; z < 57; z += W) out.push({ x: s * (33.4 + (k + 1) * 0.92), y: 15.6 + k * 0.5, z, w: W, h }); });
  }
  band(12, 6, 0.42, (k, h) => { for (let x = -15.5 + W / 2; x < 15.5; x += W) out.push({ x, y: 1.4 + k * 0.42, z: 41.3 + (k + 1) * 0.84, w: W, h }); });
  return out;
}

// the sprites' and the impostors' atlas of our avatars (one 512² texture); &ab=pillsprites goes back to the drawn shapes
let atlasTex = null;
const ATLAS_ON = () => !(ARENA.ab && ARENA.ab.pills);
function spriteAtlas() {
  if (!atlasTex) { atlasTex = new THREE.TextureLoader().load('people/arena_sprites.png'); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 2; }
  return atlasTex;
}
function spriteCrowd(list, cam, shape = 0) {
  const n = list.length;
  const quad = shape ? outlineGeometry(shape) : new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', quad.getAttribute('position'));
  g.setIndex(quad.getIndex());
  g.instanceCount = n;
  const P = new Float32Array(n * 4), C = new Float32Array(n * 4), S = new Float32Array(n * 4);
  list.forEach((s, i) => { P.set([s.x, s.y, s.z, s.ph], i * 4); C.set([s.r, s.g, s.b, s.az], i * 4); S.set([s.h, s.w, s.skin, s.count], i * 4); });
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
  g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  g.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 4));
  const u = {
    uTime: { value: 0 }, uBeat: { value: 0 }, uWave: { value: 0 }, uWaveFront: { value: -1 }, uArms: { value: 0 }, uBounce: { value: 0 }, uFill: { value: 1 },
    uFogNear: { value: 20 }, uFogFar: { value: 170 }, uBeamPhase: { value: 0 }, uCam: { value: cam.clone() },
    uBeamA: { value: new THREE.Color(0xff2a8a) }, uBeamB: { value: new THREE.Color(0x29c8ff) }, uFogColor: { value: new THREE.Color(0x06070d) }, uWarm: { value: new THREE.Color(0xffc890) }, uDim: { value: 1 },
    uLaugh: { value: 0 }, uLaughT: { value: -100 }, uArmsFrac: { value: 0.7 }, uAtlas: { value: spriteAtlas() }, uMaskOut: { value: 0 }, uGain: { value: (ARENA.stageLook && ARENA.stageLook.spriteGain) || 1 }, uWashK: { value: (ARENA.stageLook && ARENA.stageLook.spriteWash) || 0.004 }, uFall: { value: 18 }, uNear: { value: new THREE.Vector2(...((ARENA.stageLook && ARENA.stageLook.spriteNear) || [30, 7])) }, uFace: { value: 1 }, uMaskY: { value: 0 }, uRim: { value: new THREE.Color(0xb8c8ff).multiplyScalar(0.035 * (ARENA.stageLook ? ARENA.stageLook.spriteRim : 1)) },
  };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS, side: THREE.DoubleSide, defines: { ...(shape ? { SPRITE_SHAPE: 1 } : {}), ...(ATLAS_ON() ? { SPRITE_ATLAS: 1 } : {}) } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'sprites';
  return mesh;
}

// ---------- phone lights ----------
function phones(list) {
  const n = list.length;
  const pos = new Float32Array(n * 3), thr = new Float32Array(n);
  list.forEach((s, i) => { pos.set([s.x + (s.ph % 1 - 0.5) * 0.3, s.y + s.h * 0.85, s.z], i * 3); thr[i] = (s.ph * 0.4142) % 1; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('thr', new THREE.BufferAttribute(thr, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0.04 }, uTime: { value: 0 }, uScale: { value: 540 } },
    vertexShader: `attribute float thr; uniform float uOn, uTime, uScale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float on = step(thr, uOn);
        float f = 0.75 + 0.25 * sin(uTime * (2.0 + thr * 5.0) + thr * 40.0);
        vA = on * f; gl_PointSize = on * (1.5 + 60.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * vA * (1.0 - d * 3.0), 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.name = 'phones';
  return pts;
}

// ---------- moving beams: six cones from the stage roof sweeping the crowd (one draw call) ----------
function sweepBeams(origins, colors) {
  const geos = origins.map((o, k) => {
    const g = new THREE.CylinderGeometry(0.15, 3.2, 60, 14, 1, true).translate(0, -30, 0); // apex at the origin, pointing down
    const n = g.attributes.position.count;
    const along = new Float32Array(n), idx = new Float32Array(n);
    for (let i = 0; i < n; i++) { along[i] = -g.attributes.position.getY(i) / 60; idx[i] = k; }
    g.setAttribute('along', new THREE.BufferAttribute(along, 1));
    g.setAttribute('bidx', new THREE.BufferAttribute(idx, 1));
    return g;
  });
  const u = { uTime: { value: 0 }, uO: { value: origins }, uC: { value: colors }, uK: { value: 0.11 }, uMaskY: { value: 0 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `attribute float along; attribute float bidx; uniform float uTime; uniform vec3 uO[6]; uniform vec3 uC[6];
      varying float vA; varying vec3 vC; varying vec3 vN; varying vec3 vV;
      mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
      mat3 ry(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
      void main(){ int k = int(bidx + 0.5); float fk = bidx;
        float yaw = sin(uTime * (0.21 + 0.05 * fk) + fk * 1.7) * 0.75 + (fk - 2.5) * 0.12;
        float pitch = -1.02 + sin(uTime * (0.17 + 0.03 * fk) + fk) * 0.22;
        mat3 R = ry(yaw) * rx(pitch);
        vec3 p = uO[k] + R * position; vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = along; vC = uC[k]; vN = normalize(normalMatrix * (R * normal)); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    // masked out under the lower third (uMaskY: its top edge in drawing-buffer pixels)
    fragmentShader: `uniform float uK; uniform float uMaskY; varying float vA; varying vec3 vC; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float fade = (1.0 - vA) * smoothstep(0.0, 0.05, vA) * smoothstep(uMaskY, uMaskY * 1.5, gl_FragCoord.y);
        gl_FragColor = vec4(vC * uK * edge * fade, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  mesh.name = 'beams';
  return mesh;
}

function buildArena(scene, rows, P) {
  const R = rng(4242);
  const glow = [];
  const C0 = new Collector();
  const tv = P.tex !== 'large';
  // the night sky and stars above the roof line
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false, depthWrite: false }));
  {
    const pos = sky.geometry.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = THREE.MathUtils.clamp(pos.getY(i) / 420, 0, 1); col.set([0.001 + 0.004 * (1 - k), 0.0015 + 0.005 * (1 - k), 0.004 + 0.012 * (1 - k)], i * 3); }
    sky.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  sky.renderOrder = -1;
  sky.name = 'sky';
  scene.add(sky);
  for (let i = 0; i < 160; i++) {
    const a = R() * Math.PI * 2, el = 0.12 + R() * 1.2;
    glow.push({ x: Math.cos(a) * 380 * Math.cos(el), y: 380 * Math.sin(el) + 10, z: Math.abs(Math.sin(a)) * 380 * Math.cos(el) + 60, c: [0.6, 0.65, 0.8].map((v) => v * (0.3 + R() * 0.7)), s: 0.8 + R() * 0.9 });
  }
  // the pitch, the stage the camera stands on, its lip lights, the barrier
  C0.add('lambert', new THREE.PlaneGeometry(36, 60).rotateX(-Math.PI / 2).translate(0, 0, 28), 0x0e0e12, { ao: 0 });
  C0.add('lambert', box(36, AR.stageH, 14, 0, AR.stageH / 2, -7), 0x101014, { ao: 0.4 });
  C0.add('basic', new THREE.PlaneGeometry(36, 0.04).rotateX(-Math.PI / 2).translate(0, AR.stageH + 0.004, -0.06), 0x1c1c22, { ao: 0 }); // (dark: no grey line along the bottom of the frame)
  for (let x = -16; x <= 16; x += 1.6) glow.push({ x, y: AR.stageH - 0.1, z: 0.02, c: [0.36, 0.2, 0.08], s: 0.22 }); // dim: they sit by the lower third
  C0.add('lambert', box(30, 0.08, 0.08, 0, 1.1, AR.barrierZ), 0x2a2a2e, { ao: 0 });
  // the panel on the stage side of the tube, up to just under it: a rail hand hanging over the top stays behind it
  // (from the stage a forearm below the tube read as a loose hand with no body)
  C0.add('lambert', box(30, 1.04, 0.05, 0, 0.54, AR.barrierZ - 0.12), 0x16161a, { ao: 0.4 });
  for (let x = -15; x <= 15; x += 1.5) C0.add('lambert', box(0.06, 1.1, 0.06, x, 0.55, AR.barrierZ), 0x111114, { ao: 0 });
  // tiers: lower around the floor, upper above, a roof edge
  const tiers = [];
  const addTier = (kind, xs, z0, z1, y0, rise, deep) => tiers.push({ kind, xs, z0, z1, y0, rise, deep });
  const AB0 = P.arenaAB || {};
  const C1 = AB0.nostands ? new Collector() : C0; // (&ab=nostands: the tiers' planes, roof edges and towers are left out)
  for (const s of [-1, 1]) {
    C1.add('lambert', new THREE.PlaneGeometry(40, 16.2).rotateX(-Math.PI / 2).rotateZ(s * -0.46).translate(s * 24.5, 5.2, 21), 0x18181e, { ao: 0 });
    C1.add('lambert', new THREE.PlaneGeometry(58, 13).rotateX(-Math.PI / 2).rotateZ(s * -0.5).translate(s * 39.5, 18.6, 28), 0x141418, { ao: 0 });
    C1.add('lambert', box(1.2, 1.2, 62, s * 46, 25.6, 28), 0x222228, { ao: 0 }); // roof edge
    // floodlight towers at the corners
    // (pushed out to the bowl's far corners, outside the 24 mm wide: nothing bright under the caption or LIVE)
    for (const [tz, tx, top] of [[78, s * 56, 31]]) {
      C1.add('lambert', box(0.8, top + 1, 0.8, tx, (top + 1) / 2, tz), 0x2a2a30, { ao: 0 });
      C1.add('lambert', box(5, 3, 0.4, tx - s * 0.6, top + 0.5, tz), 0x1a1a1e, { ao: 0 });
      for (let i = 0; i < 8; i++) {
        const lx = tx - s * 0.6 + (i % 4 - 1.5) * 1.1, ly = top - 0.2 + Math.floor(i / 4) * 1.4;
        glow.push({ x: lx, y: ly, z: tz - 0.3, c: [0.95, 0.95, 1.0], s: 2.8 });
        glow.push({ x: lx, y: ly, z: tz - 0.3, c: [0.25, 0.3, 0.45], s: 12 });
      }
    }
  }
  C1.add('lambert', new THREE.PlaneGeometry(32, 16.2).rotateX(-Math.PI / 2 + 0.46).translate(0, 5.2, 48.5), 0x18181e, { ao: 0 });
  C1.add('lambert', new THREE.PlaneGeometry(80, 13).rotateX(-Math.PI / 2 + 0.5).translate(0, 18.6, 64), 0x141418, { ao: 0 });
  C1.add('lambert', box(94, 1.2, 1.2, 0, 25.6, 70.5), 0x222228, { ao: 0 });
  // (no big screen: the user had the jumbotron with the performer's silhouette taken out, 2026-10-12. The side tier it
  // stood in front of is seated there instead. `screen` stays as an off-scene stand-in for the house-light hook.)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  // sprites on the tiers (one person, or two side by side on the upper tier) and at the back of the floor
  // clothes from a weighted palette (mostly dark neutrals and denim), about half the instanced tops' lightness
  const PALETTE = [[0x141416, 35], [0x1c2440, 15], [0x2c2c30, 12], [0xd8d2c4, 10], [0x2b3a55, 10], [0x5a2228, 5], [0x4a4a2a, 5], [0x8a6a22, 5], [0xc0306a, 1], [0x1a8a5a, 1], [0xd07a1a, 1]];
  const PAL_SUM = PALETTE.reduce((a, [, w]) => a + w, 0);
  const cloth = () => { let x = R() * PAL_SUM; for (const [h, w] of PALETTE) { if ((x -= w) <= 0) return new THREE.Color(h).multiplyScalar(0.45 + R() * 0.2); } return new THREE.Color(0x141416); };
  const list = [];
  const AB = AB0;
  ARENA.ab = { pills: !!AB.pills, pillImp: !!AB.pillImp, fan9: !!AB.fan9 };
  // &ab=fewtiers: no upper ring and the lower tiers twelve rows deep (from eighteen): a diagnostic for the tiers' cost
  const push = (x, y, z, az, h, count) => { if (AB.few && (count === 2 || y > 1.4 + 11.5 * 0.42)) return; const c = cloth(); list.push({ x, y, z, az, r: c.r, g: c.g, b: c.b, h: h * (0.92 + R() * 0.16), w: 0.5, skin: R(), count, ph: R() * 1000 }); };
  const step = tv ? 0.62 : 0.55;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 18; k++) for (let z = 2; z < 40; z += step) push(s * (16.6 + k * 0.84), 1.4 + k * 0.42, z + (R() - 0.5) * 0.1, s < 0 ? 0.8 + (1 - z / 40) * 0.2 : 0.2 * (z / 40), 1.0, 1);
    for (let k = 0; k < 13; k++) for (let z = 0; z < 57; z += step * 2) push(s * (33.4 + k * 0.92), 15.6 + k * 0.5, z, s < 0 ? 0.75 + (1 - z / 57) * 0.25 : 0.25 * (z / 57), 1.0, 2);
  }
  for (let k = 0; k < 18; k++) for (let x = -15.5; x < 15.5; x += step) push(x + (R() - 0.5) * 0.1, 1.4 + k * 0.42, 41.3 + k * 0.84, 0.25 + 0.5 * ((15.5 - x) / 31) * 0 + 0.5 - x / 62, 1.0, 1);
  for (let k = 0; k < 13; k++) for (let x = -38; x < 38; x += step * 2) push(x, 15.6 + k * 0.5, 58.6 + k * 0.92, 0.5 - x / 152, 1.0, 2);
  // the floor behind the 3D rows: a standing crowd
  const lastZ = rows.length ? rows[rows.length - 1].z : 3;
  for (let z = lastZ + 1.5; z < (AB.floor30 ? 30 : 38); z += tv ? 0.7 : 0.62) for (let x = -14; x < 14; x += tv ? 0.66 : 0.6) push(x + (R() - 0.5) * 0.6, 0, z + (R() - 0.5) * 0.6, 0.5 - x / 60, 1.7 + (R() - 0.5) * 0.08, 1); // (±0.3 m, ±4 cm: not a grid)
  const cam = new THREE.Vector3(...(ARENA.cam || ARENA_CAM).pos); // the sprites turn to face the wide camera (the look may move it)
  // &ab=spritesort: nearest the wide camera first, so a tile's nearer sprites write depth before the ones behind are shaded
  if (AB.sort) list.sort((a, b) => (a.x - cam.x) ** 2 + (a.y - cam.y) ** 2 + (a.z - cam.z) ** 2 - ((b.x - cam.x) ** 2 + (b.y - cam.y) ** 2 + (b.z - cam.z) ** 2));
  const sprites = spriteCrowd(AB.shape ? list.filter((q) => q.count === 1) : list, cam, AB.shape ? 1 : 0);
  scene.add(sprites);
  if (AB.shape) { // (the upper ring's two-person sprites need their own outline: a second draw sharing the material)
    const two = spriteCrowd(list.filter((q) => q.count === 2), cam, 2);
    two.material.dispose(); two.material = sprites.material;
    scene.add(two);
  }
  if (AB.nosprites) scene.traverse((o) => { if (o.name === 'sprites') o.visible = false; }); // (&ab=nosprites: no sprite crowd)
  const phoneList = list.filter((_, i) => i % 3 === 0);
  const ph = phones(phoneList);
  scene.add(ph);
  if (AB.nophones) ph.visible = false;
  const imp = AB.few && AB.imp ? impostors(impostorBlocks(AB.imphalf), R, PALETTE, sprites.material.uniforms, ph.material.uniforms) : null;
  if (imp) scene.add(imp);
  // beams from the stage roof
  const O = [-9, -5.5, -2, 2, 5.5, 9].map((x) => new THREE.Vector3(x, 13.5, -3));
  const COL = [0xff2a8a, 0x29c8ff, 0xff2a8a, 0x29c8ff, 0xff2a8a, 0x29c8ff].map((c) => new THREE.Color(c));
  const beams = sweepBeams(O, COL);
  scene.add(beams);
  for (const o of O) { glow.push({ x: o.x, y: o.y, z: o.z, c: [0.9, 0.5, 0.8], s: 1.6 }); C0.add('lambert', box(0.5, 0.5, 0.6, o.x, o.y + 0.3, o.z), 0x111114, { ao: 0 }); }
  C0.add('lambert', box(24, 0.4, 0.4, 0, 14.2, -3), 0x18181c, { ao: 0 }); // the stage roof truss
  C0.build(scene, 'lambert', new THREE.MeshLambertMaterial({ vertexColors: true }), 'room');
  C0.build(scene, 'basic', new THREE.MeshBasicMaterial({ vertexColors: true }), 'room-emissive');
  const points = glowPoints(glow, glowTexture());
  scene.add(points);
  if (AB.noglows) points.visible = false;
  if (AB.nosky) sky.visible = false;
  const walls = screen; // the house-light hook dims/brightens this
  // per frame: beams, beat, wave, arms, bounce, phones, fill
  const animate = (now, room) => {
    const u = sprites.material.uniforms;
    u.uTime.value = now; beams.material.uniforms.uTime.value = now; ph.material.uniforms.uTime.value = now;
    if (room.camPos) u.uCam.value.copy(room.camPos); // (the sprites turn to whichever camera the shot uses: the crane, the stands, the pit)
    u.uBeat.value = room.beat || 0; // crowd.js sets the beat only for singing and the preview
    // arms go up for cheers and the finale, never for a laugh; the bounce is for sung cheers only, on the beat
    let cheer = 0, laugh = 0, clap = 0;
    for (const ev of room.events) {
      const age = now - ev.t, lv = ev.levelAt ? ev.levelAt(age) : 0;
      if (ev.kind === 'cheer') cheer = Math.max(cheer, lv);
      else if (ev.kind === 'applause') clap = Math.max(clap, lv);
      else if (!ev.kind || ev.kind === 'laugh') laugh = Math.max(laugh, lv);
    }
    if (laugh > 0.05 && u.uLaugh.value < 0.03) u.uLaughT.value = now; // (when this laugh began: each person's delay counts from it)
    u.uLaugh.value += (laugh - u.uLaugh.value) * 0.2;
    // the wave only while the room fills (crowds do waves in lulls): 12 m/s round the bowl every 30 s
    const wt = room.mode === 'preview' ? (now % 30) / 10 : 2;
    u.uWave.value = wt < 1 ? 1 : 0; u.uWaveFront.value = wt * 1.15 - 0.05;
    u.uBounce.value = room.act === 'singing' ? cheer : 0;
    u.uArms.value = room.finale ? Math.min(1, room.finale.strength) * (room.mode === 'after' ? room.afterLevel ?? 1 : 1) : Math.max(cheer * 0.6, clap);
    u.uArmsFrac.value = room.finale || cheer > clap ? 0.7 : 0.15; // (applause: about one in seven with arms up)
    u.uFill.value = room.fill ?? 1;
    if (imp) { // the far stands follow the room's reaction (the drive's laughs, cheers and applause)
      let lv = 0;
      for (const ev of room.events) { const age = now - ev.t; lv = Math.max(lv, ev.levelAt ? ev.levelAt(age) : 0); }
      if (room.finale) lv = Math.max(lv, room.finale.strength * (room.mode === 'after' ? room.afterLevel ?? 1 : 1));
      imp.material.uniforms.uLevel.value += (lv - imp.material.uniforms.uLevel.value) * 0.15;
    }
    // close-ups are exposed for the barrier: the floor behind falls dark and soft
    const close = room.shot && room.shot !== 'wide';
    // (in the stage look's close-up the sprites behind the 3D rows fall darker and into the haze, so they sit back as
    // a crowd instead of flat cut-outs)
    u.uDim.value = close ? (ARENA.stageLook ? 0.7 : 0.25) : 1; // (0.11 left the rail shots 62% near-black, at half the wide's mean luma) u.uFace.value = close ? 0 : 1;
    u.uMaskY.value = beams.material.uniforms.uMaskY.value = room.maskY || 0; u.uFogNear.value = close ? 6 : 20; u.uFogFar.value = close ? (ARENA.stageLook ? 70 : 14) : 170; // (the stage look's rail shots keep the floor and the stands behind: at 10 m they were a black top third)
    ph.material.uniforms.uOn.value = room.finale ? 0.25 + 0.5 * room.finale.strength : room.act === 'singing' ? 0.25 : room.mode === 'preview' ? 0.12 : 0.04;
    if (ARENA.stageLook) { u.uFall.value = ARENA.stageLook.spriteFall; ph.material.uniforms.uOn.value = Math.max(ph.material.uniforms.uOn.value, ARENA.stageLook.phonesOn); } // &look=stage
    const pulse = 0.75 + 0.25 * Math.sin(now * 0.9);
    screen.material.color.setRGB(0.6 * pulse, 0.6 * (0.85 + 0.15 * Math.sin(now * 0.6 + 1)), 0.54);
  };
  return { points, tables: [], walls, animate, spriteCount: list.length, phones: phoneList.length, impostors: imp ? imp.geometry.instanceCount : 0 };
}

// the wide from the back of the stage, 1.6 m above it: the stage floor fills the bottom fifth, so no heads sit under the
// lower third; the barrier rows show just above the lip
const ARENA_CAM = { pos: [0.8, 3.4, -7.0], look: [0, 4.5, 40], mm: 24 };
export const ARENA = {
  id: 'arena', title: 'The Bowl · <em>Arena</em>', frontRows: 1, layout: layoutArena, build: buildArena, seatH: 0.45, room: AR,
  performer: [0, 3.5, -2.6], cam: ARENA_CAM,
  cast: ['Female_Adult_02', 'Male_Adult_06', 'Female_Adult_04', 'Male_Adult_07', 'Female_Adult_12', 'Male_Adult_10'], standingCrowd: true, stadium: true, beat: 1.5,
  fog: { color: 0x06070d, wide: [14, 170], close: [2.6, 7.5], heckler: [2.6, 7.5] },
  closeDim: 0.7, // the standing rows right behind the pair stay lit (0.15 left the rail shots at half the wide's brightness; look.js has the stage look's value)
  exposure: { wide: 1, close: 0.9, heckler: 0.9 },
  grade: { wb: [0.97, 1, 1.04], sat: 0.9, lift: [0.001, 0.002, 0.006] },
  light: {
    hemi: 0.2, sky: 0x2a3040, ground: 0x0a0a10,
    key: { pos: [-6, 12, -4], target: [2, 1.2, 10], intensity: 1750, angle: 0.9, penumbra: 1, decay: 2, color: 0xfff0e0 },
    rim: { dir: [0, 0.55, 0.83], color: 0xb8c8ff, k: 0.8 }, fill: { dir: [0, -0.3, -0.95], color: 0xc8c8e0, k: 0.6, house: 3 },
  },
  spread: 0.06, attention: 0.6, standing: [],
  tone: { id: 'murmur', gain: 0.16 },
  traffic: { aisles: [], noAisle: true, door: (s) => ({ x: s.x < 0 ? -15 : 15, z: Math.max(4, s.z) }), lane: (s) => s.z + 0.3, yAt: () => 0 },
  presets: {
    // the wide now sees the whole barrier from 10 m (heads about 20 px tall): xfar for every instanced place; the close-up
    // frames the six skinned people at the rail
    // (the lit rail on the far level: on xfar its heads were pale pins on long necks; the dark rows behind stay xfar)
    // (six 3D rows in front of the sprites, so the near pit is people with faces: &ab=rows3 for the old three)
    // (rows 1-2 on far: in the rail close-up the xfar level's coarse jackets broke into grey shards)
    tv: { rows: 6, front: 6, mid: 'inst', inst: [{ from: 0, to: 2, level: 'far', types: 6 }, { from: 3, to: 99, level: 'xfar', types: 6 }] },
    low: { rows: 5, front: 10, mid: 'inst', inst: [{ from: 0, to: 1, level: 'sil', types: 6 }, { from: 2, to: 99, level: 'far', types: 6 }] },
    high: { rows: 7, front: 20, mid: 'inst', inst: [{ from: 0, to: 2, level: 'lod', types: 8 }, { from: 3, to: 99, level: 'sil', types: 8 }] },
  },
};
