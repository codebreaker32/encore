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
export function realMasks(mesh, geometry = mesh.geometry) {
  const g = geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  if (!si || !sw || !mesh.skeleton || g.attributes.aReal) return;
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

const NOSPEC = { v: false };
export function realOptions(o) { Object.assign(NOSPEC, { v: !!o.nospec, fill: !!o.fill }); } // (fill: the people fill's uniforms exist)

/** The direct term for a front material: kind 'head' (skin everywhere but the eyes) or 'body' (skin on the hands). */
export function realLit(m, kind) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aReal;\nvarying vec2 vReal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReal = aReal;');
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
	float skinWrap = saturate( ( skinNL + 0.35 ) / 1.35 );
	vec3 irradiance = ( dotNL + ( skinWrap - dotNL ) * vec3( 0.85, 0.36, 0.22 ) * skinK ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );${spec}`;
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
      .replace('#include <common>', '#include <common>\nvarying vec2 vReal;\n#define REAL_SKIN_SPEC 1.0')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + fillEye)
      .replace(`#include <${c}>`, out)
      // the hands: their albedo a little darker and warmer, towards the face (the texture's hands are pale)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${kind === 'body' ? 'diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.8, 0.72, 0.66 ), vReal.y );' : ''}`);
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
