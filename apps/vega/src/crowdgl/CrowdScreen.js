/**
 * SPIKE (crowdgl): the prototype's live crowd (prototypes/crowd3d/crowd.js and its modules, unmodified) running
 * natively under Hermes with an expo-gl context, at ?host=1&preset=tv&venue=club. The TV's host bridge becomes direct
 * calls: drive, shot and mode messages go to window.encoreMessage at 10 Hz, as CrowdStage would post them.
 *
 * It measures, per phase of a scripted timeline (listen, a big laugh with the close-up cut, settle, a big laugh in the
 * wide shot, listen): fps, JS ms per frame (avg, p95, max: the crowd's whole frame callback, scene update + three's
 * render + the upscale blit + endFrameEXP), draw calls and triangles; plus load time and memory. Everything is logged
 * as `[crowdgl] …` (the device log drops lines under load, so the summary is logged again every 10 s), because React
 * Native views can't be drawn over the GL surface as siblings (OverlayProbe.js); a transparent Modal can, so the live
 * numbers are shown in one. The Modal is mounted first and the GLView 1.5 s later, to check the Modal stays above a GL
 * surface created after it, and remote keys are logged while it is open.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { GLView } from '@amazon-devices/expo-gl';
import {
  DataTexture,
  FloatType,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { rendererHooks } from './three/renderer';
import { PREP_BASE, installBrowser } from './env';
import { probePackagedMedia } from './mediaProbe';

/** The run's settings (one per build: crowd.js runs once per JS session). RES 540 is ?preset=tv's own; 1080 fills the surface. */
const RES = 540;
/** false drops the front people's morph targets from the GPU (the faces' JS keeps running): isolates the morph path. */
const MORPHS = true;
/** debug=1 makes crowd.js expose window.__scene / __people / __room, which the scene checks below read. */
const SEARCH = `?host=1&preset=tv&venue=club&hud=0&debug=1${RES === 540 ? '' : `&res=${RES}`}`;
/** The surface in pixels (the window is 1920×1080 dp at ratio 1 on the VVD). */
const SW = 1920;
const SH = 1080;
/**
 * The expo-gl surface on Vega has no depth buffer (DEPTH_BITS 0 on the VVD, although getContextAttributes() says depth:
 * true), so a scene drawn straight to it has no depth test and overlapping bodies break into shards. true draws the scene
 * into a render target that has a depth buffer, at the preset's resolution (960×540 for ?preset=tv), and puts it on the
 * 1920×1080 surface with a full-screen quad; the quad's MeshBasicMaterial gets three's tone mapping and sRGB output,
 * which three skips when rendering into a target. Raw blitFramebuffer from the surface showed nothing on the VVD. On the
 * VVD true shows nothing at all (drawing into a render target fails with GL error 0x506), so it stays false there.
 */
const OFFSCREEN = false;

const clock = () => (global.performance && performance.now ? performance.now() : Date.now());
const log = (msg) => console.log(`[crowdgl] ${msg}`);

/** Seconds after 'ready': [name, from, to]. Warm-up first (shader compiles and the first uploads are excluded). */
const PHASES = [
  ['warmup', 0, 5],
  ['listen', 5, 25],
  ['laugh+close', 25, 31],
  ['settle', 31, 37],
  ['laugh wide', 37, 43],
  ['listen 2', 43, 55],
];
const LAUGHS = [
  { id: 1, at: 25, s: 0.95, close: true },
  { id: 2, at: 37, s: 0.95, close: false },
];
/** The club's laugh envelope, roughly (packages/crowd drive.ts: rise 0.25 s, the venue's hold, the kind's tail). */
const RISE = 0.25;
const HOLD = 2.4;
const TAIL = 2.6;
const level = (s, age) => (age < 0 ? 0 : age < RISE ? (s * age) / RISE : age <= HOLD ? s : age >= HOLD + TAIL ? 0 : s * (1 - (age - HOLD) / TAIL));

function pct(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}

function heap() {
  const H = global.HermesInternal;
  const s = H && typeof H.getInstrumentedStats === 'function' ? H.getInstrumentedStats() : null;
  if (!s) return 'Hermes stats n/a';
  const mb = (x) => (typeof x === 'number' ? (x / 1048576).toFixed(1) : '?');
  return `Hermes heap ${mb(s.js_heapSize)} MB, allocated ${mb(s.js_allocatedBytes)} MB, malloc ≈${mb(s.js_mallocSizeEstimate)} MB, VA ${mb(s.js_vaSize)} MB, GCs ${s.js_numGCs}`;
}

export function CrowdScreen() {
  const started = useRef(false);
  const [showGl, setShowGl] = useState(false);
  const [line, setLine] = useState('crowdgl · loading');
  const show = useRef(setLine);
  show.current = setLine;
  useEffect(() => {
    probePackagedMedia(log);
    const t = setTimeout(() => setShowGl(true), 1500);
    // remote keys while the Modal is open: do they still reach the app?
    let handler = null;
    try {
      const { TVEventHandler } = require('react-native');
      handler = new TVEventHandler();
      handler.enable({}, (_c, e) => {
        if (e && (e.eventKeyAction === 0 || e.eventKeyAction === undefined)) log(`key ${e.eventType} (Modal open)`);
      });
    } catch (e) {
      log(`TVEventHandler: ${e && e.message}`);
    }
    return () => {
      clearTimeout(t);
      if (handler) handler.disable();
    };
  }, []);
  const onContextCreate = useCallback((gl) => {
    if (started.current) return;
    started.current = true;
    const t0 = clock();
    log(`context ${gl.drawingBufferWidth}x${gl.drawingBufferHeight} (reported) · surface ${SW}x${SH} · ${gl.getParameter(gl.VERSION)}`);

    const run = { renderer: null, ready: null, frames: 0, firstFrame: null, phase: null, buckets: {}, summary: [] };
    let calls = 0;
    let tris = 0;

    // The renderer: endFrameEXP after every render (expo-gl presents on it), and the 960×540 frame scaled to the surface.
    let rt = null;
    let post = null;
    rendererHooks.onCreate = (r) => {
      run.renderer = r;
      const render = r.render.bind(r);
      run.rawRender = render;
      const size = new Vector2();
      r.render = (scene, camera) => {
        r.getDrawingBufferSize(size);
        const w = size.x;
        const h = size.y;
        if (OFFSCREEN) {
          if (!rt) {
            const half = r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float');
            rt = new WebGLRenderTarget(w, h, { type: half ? HalfFloatType : UnsignedByteType, depthBuffer: true, samples: 0 });
            const quad = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ map: rt.texture, depthTest: false, depthWrite: false }));
            quad.frustumCulled = false;
            post = { scene: new Scene(), camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
            post.camera.position.z = 0.5;
            post.scene.add(quad);
            log(`offscreen: ${w}x${h} ${half ? 'half-float' : '8-bit'} target with depth → ${SW}x${SH} quad`);
          }
          r.setRenderTarget(rt);
          render(scene, camera);
          calls = r.info.render.calls;
          tris = r.info.render.triangles;
          r.setRenderTarget(null);
          r.setViewport(0, 0, SW, SH);
          render(post.scene, post.camera);
          r.setViewport(0, 0, w, h);
          if (!run.offscreenChecked) {
            // one pixel from the middle of the target and of the surface: is anything drawn at each step?
            run.offscreenChecked = true;
            const a = new (rt.texture.type === HalfFloatType ? Uint16Array : Uint8Array)(4);
            r.readRenderTargetPixels(rt, Math.floor(w / 2), Math.floor(h / 3), 1, 1, a);
            const b = new Uint8Array(4);
            gl.readPixels(SW / 2, SH / 3, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
            run.offscreenProbe = `offscreen probe: target pixel ${Array.from(a).join(',')} · surface pixel ${Array.from(b).join(',')} · GL error 0x${gl.getError().toString(16)}`;
            log(run.offscreenProbe);
          }
        } else {
          render(scene, camera);
          calls = r.info.render.calls;
          tris = r.info.render.triangles;
        }
        gl.endFrameEXP();
      };
    };

    // What could make the skinned front people break up on the VVD while Chromium draws them cleanly.
    /**
     * Reads a float texture back through the GPU: every texel is texelFetch'ed into a w×h corner of the surface, encoded
     * as v·0.1 + 0.5, read with readPixels and compared with the values JS uploaded. Returns which rows came back wrong.
     */
    const readBack = (texture, w, h, expected) => {
      const r = run.renderer;
      const mat = new ShaderMaterial({
        uniforms: { t: { value: texture } },
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform highp sampler2D t;\nvoid main() { gl_FragColor = clamp(texelFetch(t, ivec2(gl_FragCoord.xy), 0) * 0.1 + 0.5, 0.0, 1.0); }',
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const scene = new Scene();
      const quad = new Mesh(new PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      scene.add(quad);
      const prev = r.getViewport(new Vector4());
      r.setViewport(0, 0, w, h);
      run.rawRender(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      r.setViewport(prev);
      mat.dispose();
      const badRows = [];
      let bad = 0;
      const used = Math.min(expected.length, w * h * 4);
      for (let i = 0; i < used; i++) {
        const want = Math.round(Math.min(1, Math.max(0, expected[i] * 0.1 + 0.5)) * 255);
        if (Math.abs(px[i] - want) > 3) {
          bad++;
          const row = Math.floor(i / 4 / w);
          if (badRows.indexOf(row) < 0) badRows.push(row);
        }
      }
      return `${bad}/${used} values off · rows wrong: ${badRows.length ? badRows.join(',') : 'none'} · first texel GPU ${px[0]},${px[1]},${px[2]},${px[3]}`;
    };

    const diagnose = () => {
      const r = run.renderer;
      if (!r) return;
      if (!run.readBackDone && run.rawRender) {
        run.readBackDone = true;
        try {
          const W = 20;
          const data = new Float32Array(W * W * 4);
          for (let i = 0; i < W * W; i++) {
            data[i * 4] = (i % W) * 0.2 - 2;
            data[i * 4 + 1] = Math.floor(i / W) * 0.2 - 2;
            data[i * 4 + 2] = ((i * 7) % 40) * 0.1 - 2;
            data[i * 4 + 3] = 1;
          }
          const synthetic = new DataTexture(data, W, W, RGBAFormat, FloatType);
          synthetic.needsUpdate = true;
          const a = readBack(synthetic, W, W, data);
          let b = 'no skinned mesh';
          const sc = global.__scene;
          let sk = null;
          if (sc) sc.traverse((o) => { if (!sk && o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) sk = o.skeleton; });
          if (sk) {
            const n = sk.boneTexture.image.width;
            b = `${sk.bones.length} bones, ${n}×${n}: ${readBack(sk.boneTexture, n, n, sk.boneMatrices)}`;
          }
          const line = `float texture readback · synthetic 20×20: ${a} · live bone texture ${b}`;
          log(line);
          run.summary.push(line);
          show.current(run.summary.join('\n'));
        } catch (e) {
          log(`readback failed: ${e && e.message}`);
        }
      }
      if (!run.fboChecked && global.__scene && global.__camera) {
        // one frame into a small render target: does an FBO work at all on this context?
        run.fboChecked = true;
        const t = new WebGLRenderTarget(320, 180, { samples: 0 });
        while (gl.getError() !== gl.NO_ERROR);
        r.setRenderTarget(t);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        r.render(global.__scene, global.__camera);
        const err = gl.getError();
        r.setRenderTarget(null);
        const line = `surface: DEPTH_BITS ${gl.getParameter(gl.DEPTH_BITS)}, STENCIL_BITS ${gl.getParameter(gl.STENCIL_BITS)}, SAMPLES ${gl.getParameter(gl.SAMPLES)} · context attributes ${JSON.stringify(
          gl.getContextAttributes ? gl.getContextAttributes() : null,
        )} · fbo probe: status 0x${status.toString(16)} (complete 0x8cd5), getError after a render 0x${err.toString(16)}`;
        log(line);
        run.summary.push(line);
        show.current(run.summary.join('\n'));
        t.dispose();
      }
      const c = r.capabilities;
      log(
        `caps webgl2 ${c.isWebGL2} · vertexTextures ${c.vertexTextures} (${c.maxVertexTextures}) · floatVertexTextures ${c.floatVertexTextures} · maxTexture ${c.maxTextureSize} · maxVertexUniforms ${c.maxVertexUniforms} · GL MAX_VERTEX_TEXTURE_IMAGE_UNITS ${gl.getParameter(
          gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS,
        )} · EXT_color_buffer_float ${r.extensions.has('EXT_color_buffer_float')} · OES_texture_float_linear ${r.extensions.has('OES_texture_float_linear')}`,
      );
      const sc = global.__scene;
      if (!sc) return log('no __scene (debug=1 missing?)');
      let skinned = 0;
      let badBones = 0;
      let maxAbs = 0;
      let morphs = 0;
      let badMorph = 0;
      let maxInfl = 0;
      sc.traverse((o) => {
        if (o.isSkinnedMesh && o.skeleton) {
          skinned++;
          const m = o.skeleton.boneMatrices;
          let bad = false;
          for (let i = 0; i < m.length; i++) {
            const v = m[i];
            if (!isFinite(v)) bad = true;
            else if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
          }
          if (bad) badBones++;
        }
        if (o.morphTargetInfluences && o.morphTargetInfluences.length) {
          morphs++;
          let bad = false;
          for (const x of o.morphTargetInfluences) {
            if (!isFinite(x)) bad = true;
            else if (Math.abs(x) > maxInfl) maxInfl = Math.abs(x);
          }
          if (bad) badMorph++;
        }
      });
      log(`scene: ${skinned} skinned (${badBones} with non-finite bones, max |bone| ${maxAbs.toFixed(2)}) · ${morphs} with morphs (${badMorph} non-finite, max |influence| ${maxInfl.toFixed(2)})`);
    };

    // Per-frame timing: crowd.js drives its loop with requestAnimationFrame; each callback is one whole frame of JS.
    const raf = global.requestAnimationFrame.bind(global);
    let lastStart = 0;
    global.requestAnimationFrame = (cb) =>
      raf((ts) => {
        const a = clock();
        cb(ts);
        const ms = clock() - a;
        run.frames++;
        if (run.firstFrame === null) run.firstFrame = a;
        if (run.phase) {
          const B = (run.buckets[run.phase] = run.buckets[run.phase] || { ms: [], gap: [], calls: 0, tris: 0, n: 0 });
          B.ms.push(ms);
          if (lastStart) B.gap.push(a - lastStart);
          B.calls = Math.max(B.calls, calls);
          B.tris = Math.max(B.tris, tris);
          B.n++;
        }
        lastStart = a;
      });

    const send = (msg) => {
      if (typeof global.encoreMessage === 'function') global.encoreMessage(msg);
    };
    const summarise = (name, seconds) => {
      const B = run.buckets[name];
      if (!B || !B.ms.length) return `${name}: no frames`;
      const ms = B.ms.slice().sort((a, b) => a - b);
      const gap = B.gap.slice().sort((a, b) => a - b);
      const avg = ms.reduce((s, x) => s + x, 0) / ms.length;
      return `${name}: ${(B.n / seconds).toFixed(1)} fps · JS ${avg.toFixed(1)} ms/frame (p95 ${pct(ms, 0.95).toFixed(1)}, max ${ms[ms.length - 1].toFixed(
        1,
      )}) · frame gap p95 ${pct(gap, 0.95).toFixed(0)} ms · ${B.calls} calls · ${B.tris} tris`;
    };

    const startScript = () => {
      const tReady = clock();
      const at = (s) => tReady + s * 1000;
      send({ type: 'venue', venue: 'club', act: 'standup' });
      send({ type: 'mode', mode: 'live' });
      send({ type: 'shot', kind: 'wide' });
      let phaseIdx = -1;
      const timer = setInterval(() => {
        const now = clock();
        const t = (now - tReady) / 1000;
        // phases
        let idx = PHASES.findIndex((p) => t >= p[1] && t < p[2]);
        if (t >= PHASES[PHASES.length - 1][2]) idx = PHASES.length;
        if (idx !== phaseIdx) {
          if (phaseIdx >= 0 && phaseIdx < PHASES.length) {
            const [name, a, b] = PHASES[phaseIdx];
            const line = summarise(name, b - a);
            run.summary.push(line);
            log(line);
            show.current(run.summary.join('\n'));
          }
          phaseIdx = idx;
          run.phase = idx < PHASES.length ? PHASES[idx][0] : 'after';
          if (idx === PHASES.length) {
            run.summary.push(heap());
            log('timeline done');
          }
        }
        // the drive, as useCrowdFeed posts it
        const reactions = [];
        let warmth = 0.2;
        for (const L of LAUGHS) {
          const age = t - L.at;
          const lv = level(L.s, age);
          if (lv > 0 || (age >= 0 && age < RISE)) reactions.push({ id: L.id, kind: 'laugh', strength: L.s, age, level: lv });
          if (age > 0) warmth = Math.min(1, warmth + L.s * Math.max(0, 1 - age / 24) * 0.5);
        }
        send({
          type: 'drive',
          drive: { phase: 'live', now: t, speaking: reactions.length === 0, silenceSec: 0, restless: 0, warmth, attention: 0.75, deadBits: 0, reactions, heckle: null, finale: null },
        });
        // the director: a reaction shot on the laugh that asks for it, held about 3.6 s, then back to wide (edge-triggered:
        // with 40–60 ms frames the 100 ms timer runs late and can skip a narrow window)
        for (const L of LAUGHS) {
          if (!L.close) continue;
          const age = t - L.at;
          if (age >= 0.3 && !L.cutIn) {
            L.cutIn = true;
            send({ type: 'shot', kind: 'reaction', focus: L.id });
          }
          if (age >= 3.9 && !L.cutOut) {
            L.cutOut = true;
            send({ type: 'shot', kind: 'wide' });
          }
        }
        // the summary again every 10 s once the timeline is done (the device log drops lines)
        if (idx === PHASES.length && Math.floor(t) % 10 === 0 && t % 1 < 0.1) {
          run.summary.forEach((l) => log(`summary · ${l}`));
          log(`summary · now: ${heap()}`);
        }
      }, 100);
      return timer;
    };

    const onReport = (msg) => {
      if (msg.type === 'ready' && run.ready === null) {
        run.ready = clock();
        const st = global.__stats || {};
        const line = `ready after ${((run.ready - t0) / 1000).toFixed(1)} s (crowd.js required at +${((run.required - t0) / 1000).toFixed(1)} s, first frame at +${(
          ((run.firstFrame || run.ready) - t0) /
          1000
        ).toFixed(1)} s) · ${st.front}+${st.mid}+${st.back} people · ${st.calls} calls · ${st.triangles} tris · tex ≈${(st.texMB || 0).toFixed(0)} MB · ${
          st.programs
        } programs · ${st.res} · ${heap()} · geometries ${run.renderer ? run.renderer.info.memory.geometries : '?'}, textures ${
          run.renderer ? run.renderer.info.memory.textures : '?'
        } · checks ${JSON.stringify(checksRef.checks || {})}`;
        run.summary.push(
          `load: ready ${((run.ready - t0) / 1000).toFixed(1)} s after the GL context · ${heap()} · GPU objects: ${
            run.renderer ? `${run.renderer.info.memory.geometries} geometries, ${run.renderer.info.memory.textures} textures` : '?'
          } · res ${RES}, morphs ${MORPHS ? 'on' : 'off'}`,
        );
        log(line);
        show.current(run.summary.join('\n'));
        startScript();
        setTimeout(diagnose, 1000);
        setTimeout(() => diagnose(), 3000);
        setTimeout(diagnose, 26500);
        setTimeout(() => {
          const st = global.__stats || {};
          log(`page __stats ${JSON.stringify(st)}`);
          if (run.offscreenProbe) run.summary.push(run.offscreenProbe);
          run.summary.push(`scene: ${st.front}+${st.mid}+${st.back} people · ${st.calls} calls · ${st.triangles} tris · textures ≈${(st.texMB || 0).toFixed(0)} MB · ${st.programs} programs · ${st.res}`);
          show.current(run.summary.join('\n'));
        }, 1200);
      } else if (msg.type === 'stats') {
        log(`page stats ${msg.fps} fps · ${msg.ms} ms · ${msg.calls} calls · ${msg.tris} tris`);
      } else if (msg.type === 'audio') {
        log(`audio ${msg.state}`);
      }
    };

    const checksRef = {};
    fetch(`${PREP_BASE}canvases.json`)
      .then((r) => r.json())
      .catch(() => {
        log('no canvas capture (tools/crowdgl-canvases.cjs): the room textures will be blank');
        return [];
      })
      .then((canvases) => {
        const { checks } = installBrowser({ gl, width: SW, height: SH, search: SEARCH, canvases, onReport, log, morphs: MORPHS });
        log(`run: res ${RES}, morphs ${MORPHS ? 'on' : 'off'}, offscreen ${OFFSCREEN ? 'on' : 'off'}`);
        checksRef.checks = checks;
        run.required = clock();
        try {
          // crowd.js builds the room at import (async) and starts its own requestAnimationFrame loop
          require('../../../../prototypes/crowd3d/crowd.js');
          log(`crowd.js imported in ${(clock() - run.required).toFixed(0)} ms`);
        } catch (e) {
          log(`crowd.js threw: ${e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)}`);
        }
        // crowd.js catches its own startup errors into window.__stats.error
        setTimeout(() => {
          if (run.ready === null) log(`not ready after 60 s · __stats ${JSON.stringify(global.__stats || null)} · frames ${run.frames} · checks ${JSON.stringify(checks)}`);
        }, 60000);
      });
  }, []);

  return (
    <View style={styles.fill}>
      {showGl ? <GLView style={styles.fill} onContextCreate={onContextCreate} /> : null}
      <Modal transparent visible animationType="none">
        <View pointerEvents="none" style={styles.panel}>
          <Text style={styles.line}>{line}</Text>
          <Text style={styles.note}>native expo-gl · crowd.js unmodified · this text is in a transparent Modal over the GL surface</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#07060a' },
  panel: { position: 'absolute', left: 60, right: 60, bottom: 50, padding: 14, backgroundColor: 'rgba(7,6,10,0.6)' },
  line: { color: '#f3e3c3', fontSize: 21, lineHeight: 28 },
  note: { color: '#c9a86a', fontSize: 20, marginTop: 6 },
});
