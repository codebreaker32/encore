// The real-v1 pass (box session, 2026-10-18): the front people's skin and eyes, within the TV's budget. No new lights,
// passes or textures: the stage key's own light gives each term.
// - Masks from the skin weights, at load (realMasks): a vertex's weight on the eye bones (LEye, REye: the eyeballs) and
//   on the hand and finger bones, as the attribute aReal (eye, hand).
// - realLit replaces the Lambert direct term on a front material:
//   * skin (the head except the eyes, and the hands): the wrapped warm terminator that skinLit gave the heads, plus a
//     specular sheen (normalized Blinn, two lobes, skin's F0 of 0.028 with Schlick's Fresnel), so the forehead, nose,
//     cheekbones and knuckles catch the key and the highlight goes towards the light's colour, not orange clay;
//   * eyes: a tight, wet lobe, the catchlight of the stage key wherever it really falls on the eyeball;
//   * hands: the albedo pulled a little towards the face's tone (the hands read as pale gloves, brighter than the faces).
// &ab=noreal turns all of it off (back to skinLit on the heads), &ab=nospec only the specular lobes.
import * as THREE from 'three';

const EYE = /(^|[^a-z])[LR]Eye$/i, HAND = /(Hand|Finger\d*)$/;

/** Per-vertex (eye, hand) weights from a skinned mesh's bones, as the geometry attribute aReal. */
export function realMasks(mesh, geometry = mesh.geometry, ao = null) {
  const g = geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  if (!si || !sw || !mesh.skeleton || g.attributes.aReal) return;
  // the baked AO ([count, base64 of one byte a vertex], tools/bake_ao.mjs), or open everywhere (the shader reads aAO:
  // a missing attribute would read 0, black)
  let aoA = null;
  if (ao && ao[0] === si.count) { const bin = atob(ao[1]); aoA = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) aoA[i] = bin.charCodeAt(i); }
  else { if (ao) console.warn(`[crowd] ao: ${mesh.name} has ${si.count} vertices, the bake ${ao[0]}`); aoA = new Uint8Array(si.count).fill(255); }
  g.setAttribute('aAO', new THREE.BufferAttribute(aoA, 1, true));
  const bones = mesh.skeleton.bones.map((b) => b.name.replace(/^.*Bip01[ _]?/, ''));
  const isEye = bones.map((n) => EYE.test(n)), isHand = bones.map((n) => HAND.test(n));
  const a = new Float32Array(si.count * 2);
  let eyes = 0, hands = 0;
  for (let i = 0; i < si.count; i++) {
    let e = 0, h = 0;
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(i, k), w = sw.getComponent(i, k);
      if (isEye[b]) e += w;
      if (isHand[b]) h += w;
    }
    a[i * 2] = e > 0.5 ? 1 : 0; a[i * 2 + 1] = Math.min(1, h * 1.5);
    eyes += a[i * 2]; hands += h > 0.3 ? 1 : 0;
  }
  g.setAttribute('aReal', new THREE.BufferAttribute(a, 2));
  return { eyes, hands };
}

const NOSPEC = { v: false, fillK: 1, wrap: 0.35, nosheen: false, nopores: false, pores: 0.004 };
export function realOptions(o) { Object.assign(NOSPEC, { v: !!o.nospec, fill: !!o.fill, fillK: o.fillK ?? 1, wrap: o.wrap ?? 0.35, nosheen: !!o.nosheen, nopores: !!o.nopores, pores: o.pores ?? 0.004 }); } // (fill: the people fill's uniforms exist)

/** The direct term for a front material: kind 'head' (skin everywhere but the eyes) or 'body' (skin on the hands). */
export function realLit(m, kind) {
  const prev = m.onBeforeCompile;
  // (each front material its own candle: the table candle in front of whoever wears it, Candles below)
  const cu = (m.userData.candle = { uCandle: { value: new THREE.Vector4() }, uCandleColor: { value: new THREE.Color(1.0, 0.5, 0.2) }, uClothRot: { value: new THREE.Matrix3() } });
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    Object.assign(sh.uniforms, cu);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aReal;\nvarying vec2 vReal;\nattribute float aAO;\nvarying float vAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReal = aReal; vAO = aAO;');
    const spec = NOSPEC.v ? '' : /* glsl */ `
	vec3 hv = normalize( directLight.direction + geometryViewDir );
	float nh = saturate( dot( geometryNormal, hv ) ), vh = saturate( dot( geometryViewDir, hv ) );
	float fr = pow( 1.0 - vh, 5.0 );
	// skin: a broad lobe and a tighter oily one (normalized Blinn: (n + 8) / 8pi), F0 0.028
	float sSkin = ( 0.028 + 0.972 * fr ) * ( 0.8 * 1.11 * pow( nh, 20.0 ) + 0.2 * 3.5 * pow( nh, 80.0 ) );
	// the eye: wet and tight, the key's catchlight (F0 0.02 raised by the tear film)
	float sEye = ( 0.05 + 0.95 * fr ) * 14.0 * pow( nh, 160.0 );
	reflectedLight.directDiffuse += dotNL * directLight.color * ( sSkin * skinK * REAL_SKIN_SPEC + sEye * vReal.x );`;
    const body = /* glsl */ `
	float skinNL = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( skinNL );
	// (the head's material also has caps, beanies and hair: skin where the albedo is skin's, red over green over blue)
	vec3 al = material.diffuseColor;
	float tone = saturate( ( al.r - al.b ) * 5.0 - 0.1 ) * step( al.b, al.g + 0.02 ) * step( al.g, al.r );
	float skinK = ${kind === 'head' ? '( 1.0 - vReal.x ) * tone' : 'vReal.y'};
	float skinWrap = saturate( ( skinNL + ${NOSPEC.wrap.toFixed(3)} ) / ${(1 + NOSPEC.wrap).toFixed(3)} );
	vec3 irradiance = ( dotNL + ( skinWrap - dotNL ) * vec3( 0.85, 0.36, 0.22 ) * skinK ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );${spec}`;
    // (the teeth, on the head: white, inside the closed lips in the bind pose, so the bake blacks them out; a laughing
    // mouth shows them, so they keep at least 0.6 of the light)
    // the table candle (club): a warm point a few tens of centimetres below the face, wrapped, inverse square; its
    // strength (uCandle.w) is 0 for anyone without a candle
    const CANDLE = /* glsl */ `
	if ( uCandle.w > 0.0 ) { vec3 cl = uCandle.xyz - geometryPosition; float d2 = max( dot( cl, cl ), 0.03 );
	  float cn = dot( geometryNormal, cl * inversesqrt( d2 ) );
	  reflectedLight.directDiffuse += uCandleColor * ( uCandle.w / d2 ) * saturate( ( cn + 0.25 ) / 1.25 ) * BRDF_Lambert( material.diffuseColor ); }`;
    // skin's fine breakup on the head (off: invisible at the TV's 800×450; &pores=0.15 to try): two octaves of smooth value noise in the head texture's space
    // (stable as the face moves: no shimmer) bump the normal a little where the albedo is skin, so the sheen breaks into
    // pores instead of sliding like wax. Screen-space derivatives, no texture.
    const PORES = kind === 'head' && !NOSPEC.nopores && NOSPEC.pores > 0 && sh.fragmentShader.includes('vMapUv') ? `
float realH( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  float a = fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ), b = fract( sin( dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  float c = fract( sin( dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 ), d = fract( sin( dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ); }` : '';
    const PORE_N = /* glsl */ `
	{ vec3 al0 = diffuseColor.rgb;
	  float tone0 = saturate( ( al0.r - al0.b ) * 5.0 - 0.1 ) * step( al0.b, al0.g + 0.02 ) * step( al0.g, al0.r ) * ( 1.0 - vReal.x );
	  float h = realH( vMapUv * 900.0 ) * 0.6 + realH( vMapUv * 2100.0 ) * 0.4;
	  vec3 ps = - vViewPosition, sx = dFdx( ps ), sy = dFdy( ps );
	  vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx ); float det = dot( sx, r1 );
	  vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
	  normal = normalize( abs( det ) * normal - grad * ${NOSPEC.pores.toFixed(4)} * tone0 ); }`;
    const c = 'lights_lambert_pars_fragment';
    const src = THREE.ShaderChunk[c];
    const i0 = src.indexOf('void RE_Direct_Lambert'), i1 = src.indexOf('{', i0), i2 = src.indexOf('}', i1);
    const out = src.slice(0, i1 + 1) + body + '\n' + src.slice(i2);
    // the stage's wash and floor bounce (the people fill, uFillDir: towards the stage, a little down) in the eye too: a
    // broad source in front of the audience, so a soft second catchlight low in the iris
    const fillEye = NOSPEC.v || !NOSPEC.fill ? '' : /* glsl */ `
	{ vec3 fh = normalize( uFillDir + geometryViewDir );
	  reflectedLight.directDiffuse += uFillColor * vReal.x * 30.0 * pow( saturate( dot( geometryNormal, fh ) ), 300.0 ) * saturate( dot( geometryNormal, uFillDir ) ); }`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vReal;\nvarying float vAO;\nuniform vec4 uCandle; uniform vec3 uCandleColor; uniform mat3 uClothRot;\n#define REAL_SKIN_SPEC 1.0${PORES}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${PORES ? PORE_N : ''}`)
      // the baked AO (open above 0.92, cavities under 0.12 black): all of the fill and house light, most of the key (a person's own small shadows, which the TV
      // can't draw: the mouth's inside, under the chin, inside a collar)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + fillEye + CANDLE + `\n\t{ float aoK = smoothstep( 0.12, 0.92, vAO );${kind === 'head' ? ' vec3 tw = material.diffuseColor; aoK = max( aoK, 0.6 * smoothstep( 0.42, 0.62, min( tw.r, min( tw.g, tw.b ) ) ) * ( 1.0 - vReal.x ) );' : ''} reflectedLight.indirectDiffuse *= aoK * ${NOSPEC.fillK.toFixed(3)}; reflectedLight.directDiffuse *= mix( 1.0, aoK, 0.85 ); }`)
      .replace(`#include <${c}>`, out)
      // the hands: their albedo a little darker and warmer, towards the face (the texture's hands are pale)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${kind === 'body' ? `diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.8, 0.72, 0.66 ), vReal.y );
	// the venue's own clothes (&ab=nocloth): the garments' hue turned about the grey axis by this person's angle in this
	// venue, by how saturated each texel is (denim, black and white barely move); never the hands or skin-toned texels
	{ vec3 cc = diffuseColor.rgb; float mx = max( cc.r, max( cc.g, cc.b ) ), mn = min( cc.r, min( cc.g, cc.b ) );
	  float sat = ( mx - mn ) / max( mx, 1e-3 );
	  float hueO = ( cc.g - cc.b ) / max( cc.r - cc.b, 1e-3 ); // (0 red, 1 yellow: skin sits at about 0.25-0.7)
	  float skinT = step( cc.b, cc.g ) * step( cc.g, cc.r ) * smoothstep( 0.12, 0.25, hueO ) * ( 1.0 - smoothstep( 0.7, 0.85, hueO ) );
	  float w = smoothstep( 0.3, 0.6, sat ) * ( 1.0 - vReal.y ) * ( 1.0 - skinT );
	  vec3 rc = uClothRot * cc; rc = mix( vec3( dot( rc, vec3( 0.3, 0.59, 0.11 ) ) ), rc, 0.85 );
	  diffuseColor.rgb = mix( cc, max( rc, 0.0 ), w ); }` : ''}`);
  };
  const key0 = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key0() + '|real-' + kind + (NOSPEC.v ? '-nospec' : '');
  return m;
}

/**
 * Catchlights (&ab=nocatch turns them off): the stage key's reflection on each front person's eyes, one Points draw.
 * The eye bones sit at the eyeballs' centres, so each frame (scene.onBeforeRender, before the draw list is built) a
 * point goes on the eyeball's surface where the normal halves the directions to the key and to the lens, the mirror
 * point. Shown only on the cornea's side of the eye, scaled by how much of the key's cone reaches the face; the lids
 * hide it by depth (a blink, a squint). About 2.5 mm across: a few pixels in a face close, sub-pixel and faded on the
 * wide.
 */
export class Catchlights {
  constructor(scene, key, max = 32) {
    this.key = key; this.eyes = []; this.on = 1;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.k = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('aK', this.k); g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uColor: { value: new THREE.Color(1.0, 0.93, 0.82) } },
      vertexShader: /* glsl */ `
        attribute float aK; uniform float uScale; varying float vK;
        void main() {
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mv;
          gl_Position.z -= 0.0004 * gl_Position.w; // (in front of the eyeball it sits on; the lids are further out)
          float px = 0.0025 * uScale / -mv.z;
          gl_PointSize = max( px, 1.0 );
          vK = aK * min( 1.0, px * px );
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vK;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep( 0.25, 0.0, dot( d, d ) ) * vK;
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( uColor * a, 1.0 );
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.name = 'catchlights'; this.points.renderOrder = 5;
    scene.add(this.points);
    this.max = max;
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (r, s, cam, rt) => { if (prev) prev.call(scene, r, s, cam, rt); this.update(cam, r); };
  }
  /** A front person: their eye bones and the eyeballs' radius and front direction, in bone space. */
  add(person, model) {
    model.traverse((o) => {
      const a = o.isSkinnedMesh && o.geometry.attributes.aReal;
      if (!a) return;
      const sk = o.skeleton, si = o.geometry.attributes.skinIndex, pos = o.geometry.attributes.position;
      for (const nm of ['LEye', 'REye']) {
        const bi = sk.bones.findIndex((b) => b.name.endsWith(nm));
        if (bi < 0) continue;
        const inv = sk.boneInverses[bi], v = new THREE.Vector3(), mean = new THREE.Vector3();
        let r = 0, n = 0;
        for (let i = 0; i < pos.count; i++) if (a.getX(i) > 0 && si.getX(i) === bi) { v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(inv); r += v.length(); mean.add(v); n++; }
        if (n < 8 || this.eyes.length >= this.max) continue;
        this.eyes.push({ person, bone: sk.bones[bi], r: r / n, fwd: mean.normalize() });
      }
    });
  }
  update(cam, renderer) {
    const E = this.eyes, P = this.pos.array, K = this.k.array, key = this.key;
    const h = renderer.getDrawingBufferSize ? renderer.getDrawingBufferSize(_v2).y : 450;
    this.mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 40) / 2));
    const kd = _kd.copy(key.target.position).sub(key.position).normalize(), cosO = Math.cos(key.angle), cosI = Math.cos(key.angle * (1 - key.penumbra));
    let n = 0;
    if (this.on && key.intensity > 0) for (const e of E) {
      const p = e.person;
      if (p.hidden || !p.rig || !p.rig.model.visible) continue;
      const b = e.bone;
      b.updateMatrix(); _m.multiplyMatrices(b.parent.matrixWorld, b.matrix);
      const c = _c.setFromMatrixPosition(_m), s = _s.setFromMatrixScale(_m).x;
      const L = _l.copy(key.position).sub(c).normalize(), V = _vv.copy(cam.position).sub(c).normalize();
      const N = _n.copy(L).add(V).normalize();
      const fwd = _f.copy(e.fwd).transformDirection(_m);
      const face = (N.dot(fwd) - 0.55) / 0.3; // (the cornea: within about 45° of the eye's axis)
      const spot = (-L.dot(kd) - cosO) / Math.max(1e-3, cosI - cosO); // (in the key's cone, its soft edge)
      const k = Math.min(1, Math.max(0, face)) * Math.min(1, Math.max(0, spot)) * Math.min(1, Math.max(0, V.dot(fwd) * 2));
      if (k <= 0.01) continue;
      c.addScaledVector(N, e.r * s);
      P[n * 3] = c.x; P[n * 3 + 1] = c.y; P[n * 3 + 2] = c.z; K[n] = k;
      n++;
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.visible = n > 0;
    this.pos.needsUpdate = true; this.k.needsUpdate = true;
  }
}
const _v2 = new THREE.Vector2(), _kd = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Vector3(), _s = new THREE.Vector3();
const _l = new THREE.Vector3(), _vv = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3();

/**
 * Table candles light the people at them (&ab=nocandle): each front person at a two-top gets its candle's position in
 * view space and a flicker, every frame (scene.onBeforeRender), in their own materials' uniforms. No scene light: the
 * TV pays one point term in the front people's shaders only.
 */
export class Candles {
  constructor(scene, strength = 0.05) {
    this.list = []; this.k = strength; this.now = 0;
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (r, s, cam, rt) => { if (prev) prev.call(scene, r, s, cam, rt); this.update(cam); };
  }
  add(person, model, pos, seed) {
    const us = [];
    model.traverse((o) => { if (o.isMesh && o.material.userData.candle) us.push(o.material.userData.candle.uCandle); });
    if (us.length) this.list.push({ person, us, pos: pos.clone(), seed });
  }
  update(cam) {
    cam.updateMatrixWorld();
    const t = this.now;
    for (const c of this.list) {
      const fl = 0.85 + 0.15 * Math.sin(t * 11 + c.seed) * Math.sin(t * 7.3 + c.seed * 2.1);
      _cp.copy(c.pos).applyMatrix4(cam.matrixWorldInverse);
      for (const u of c.us) u.value.set(_cp.x, _cp.y, _cp.z, this.k * fl);
    }
  }
}
const _cp = new THREE.Vector3();

/** A hue turn of `deg` about the grey axis (luminance kept), for a front material's clothes (uClothRot). */
export function clothHue(m, deg) {
  const u = m.userData.candle && m.userData.candle.uClothRot;
  if (!u) return;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = 1 / 3, q = Math.sqrt(k);
  // Rodrigues about (1,1,1)/sqrt(3)
  const e = (i, j) => (i === j ? c + k * (1 - c) : k * (1 - c) + ((j - i + 3) % 3 === 1 ? -1 : 1) * q * s);
  u.value.set(e(0, 0), e(0, 1), e(0, 2), e(1, 0), e(1, 1), e(1, 2), e(2, 0), e(2, 1), e(2, 2));
}

/**
 * Hands on a table cast a contact shadow (&ab=nohandshadow): one instanced draw of soft dark discs on the club's table
 * tops, under each front person's palms, each frame (scene.onBeforeRender). A disc is placed where the stage key would
 * throw the palm's shadow onto the top, darker and tighter the nearer the palm is to it, gone above about 15 cm or off
 * the table. The TV draws no real shadows; this is the one people notice most (the judges: "hands hover on the table").
 */
export class HandShadows {
  constructor(scene, key, max = 24) {
    this.key = key; this.hands = [];
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.k = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aK', this.k);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `attribute float aK; varying float vK; varying vec2 vP;
        void main() { vK = aK; vP = position.xz * 2.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `varying float vK; varying vec2 vP;
        void main() { float r = dot( vP, vP ); float a = vK * ( 1.0 - smoothstep( 0.0, 1.0, r ) ); if ( a < 0.01 ) discard; gl_FragColor = vec4( 0.0, 0.0, 0.0, a ); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.name = 'hand-shadows'; this.mesh.renderOrder = 3;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.max = max;
    scene.add(this.mesh);
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (r, s, cam, rt) => { if (prev) prev.call(scene, r, s, cam, rt); this.update(); };
  }
  /** A person's two palms over a round table top (centre x, z, top y, radius). */
  add(person, b, table) {
    for (const [h, tip] of [[b.lHand, b.lTip], [b.rHand, b.rTip]]) if (h) this.hands.push({ person, h, tip: tip || h, t: table });
  }
  update() {
    let n = 0;
    const M = this.mesh, kp = this.key.position;
    for (const e of this.hands) {
      if (n >= this.max) break;
      const p = e.person;
      if (p.hidden || !p.rig || !p.rig.model.visible) continue;
      _ha.setFromMatrixPosition(e.h.matrixWorld); _hb.setFromMatrixPosition(e.tip.matrixWorld);
      const palm = _ha.lerp(_hb, 0.5), t = e.t, hgt = palm.y - t.top;
      if (hgt < -0.05 || hgt > 0.16) continue;
      // (the key's shadow of the palm on the top: along the line from the key, down to the top's plane)
      _hd.copy(palm).sub(kp).normalize();
      const s = Math.max(0, hgt) / Math.max(0.2, -_hd.y);
      const x = palm.x + _hd.x * s, z = palm.z + _hd.z * s;
      if ((x - t.x) * (x - t.x) + (z - t.z) * (z - t.z) > (t.r - 0.03) * (t.r - 0.03)) continue;
      const near = 1 - Math.min(1, Math.max(0, (hgt - 0.015) / 0.14));
      const size = 0.11 + 0.5 * Math.max(0, hgt);
      _hm.compose(_hp.set(x, t.top + 0.002, z), _hq.identity(), _hs.set(size, 1, size * 1.3));
      M.setMatrixAt(n, _hm); this.k.array[n] = 0.6 * near * near;
      n++;
    }
    M.count = n; M.visible = n > 0;
    M.instanceMatrix.needsUpdate = true; this.k.needsUpdate = true;
  }
}
const _ha = new THREE.Vector3(), _hb = new THREE.Vector3(), _hd = new THREE.Vector3(), _hp = new THREE.Vector3(), _hs = new THREE.Vector3();
const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion();

/**
 * Hair cards (&ab=nohairspec): a strand highlight instead of a matte shell. Kajiya-Kay's anisotropic lobe with the
 * strands taken as falling down the head (world up, projected onto the card), two shifted lobes (a white primary, a
 * tinted secondary), from the stage key only, plus a soft wrap so the hair's dark side isn't a cut-out.
 */
export function realHair(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    const c = 'lights_lambert_pars_fragment';
    const src = THREE.ShaderChunk[c];
    const i0 = src.indexOf('void RE_Direct_Lambert'), i1 = src.indexOf('{', i0), i2 = src.indexOf('}', i1);
    const body = /* glsl */ `
	float nl = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( nl ), wrapNL = saturate( ( nl + 0.4 ) / 1.4 );
	reflectedLight.directDiffuse += wrapNL * directLight.color * BRDF_Lambert( material.diffuseColor );
	vec3 up = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	vec3 T = normalize( up - geometryNormal * dot( up, geometryNormal ) + 1e-4 );
	vec3 H = normalize( directLight.direction + geometryViewDir );
	float th1 = dot( normalize( T + geometryNormal * 0.12 ), H ), th2 = dot( normalize( T - geometryNormal * 0.1 ), H );
	float s1 = pow( sqrt( max( 0.0, 1.0 - th1 * th1 ) ), 80.0 ), s2 = pow( sqrt( max( 0.0, 1.0 - th2 * th2 ) ), 20.0 );
	reflectedLight.directDiffuse += directLight.color * wrapNL * ( 0.025 * s1 + 0.03 * s2 * ( material.diffuseColor + 0.1 ) );`;
    sh.fragmentShader = sh.fragmentShader.replace(`#include <${c}>`, src.slice(0, i1 + 1) + body + '\n' + src.slice(i2));
  };
  const key0 = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key0() + '|hair';
  return m;
}

/**
 * Velvet on the room's red upholstery (the theatre's seats; `&ab=novelvet` via the caller): fibres standing up off the
 * cloth catch light at grazing angles, so a seat's edges and curves glow softly instead of reading as flat red blocks.
 * Only where the albedo is a saturated red; a few ALU on the room's pixels.
 */
export function velvetLit(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
	{ vec3 vc = diffuseColor.rgb; float red = saturate( ( vc.r - 2.0 * max( vc.g, vc.b ) ) * 12.0 );
	  float nv = saturate( dot( geometryNormal, geometryViewDir ) );
	  reflectedLight.indirectDiffuse += red * pow( 1.0 - nv, 2.5 ) * ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) * 1.6; }`);
  };
  const key0 = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key0() + '|velvet';
  return m;
}
