/**
 * SPIKE (2026-10-11, removable): could the live 3D crowd run natively on Vega, with no WebView (the Linux VVD has none)?
 * A full-screen GLView from @amazon-devices/expo-gl drives three r160 (prototypes/crowd3d/vendor) from React's JS thread:
 * a lit spinning box, 50 instanced boxes moved every frame, one of the crowd's GLB people parsed by GLTFLoader from the
 * app's own assets, and a texture uploaded from a bundled JPEG with expo-gl's texImage2D. Everything it learns is logged
 * as `[glspike] …` and shown on screen.
 *
 * Open it with GL_SPIKE below. To remove it: delete src/spike/, the GL_SPIKE line in src/App.tsx, the "expo-gl spike"
 * block in metro.config.js and the @amazon-devices/expo-gl dependency.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Image, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { GLView } from '@amazon-devices/expo-gl';
import { TextDecoder as W3CTextDecoder } from '@amazon-devices/react-native-w3cmedia';
import * as THREE from 'three';
import { GLTFLoader } from '../../../../prototypes/crowd3d/vendor/three/examples/jsm/loaders/GLTFLoader.js';

/** True opens the spike instead of Encore (src/App.tsx). */
export const GL_SPIKE = false;

const GLB = require('../../../../prototypes/crowd3d/people/Male_Adult_12.xfar.glb');
const JPEG = require('../../../../packages/shared-ui/src/assets/clips/club-wide-1-thumb.jpg');
/** How many seats the instanced crowd stand-in has. */
const SEATS = 50;
/** Stats are logged over this window. */
const WINDOW_MS = 2000;

const clock = () => (global.performance && typeof performance.now === 'function' ? performance.now() : Date.now());

/** UTF-8 for GLTFLoader (GLB magic and JSON chunk): see the TextDecoder check in onContextCreate. */
class Utf8Decoder {
  decode(input) {
    const u8 =
      input instanceof Uint8Array
        ? input
        : ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);
    let out = '';
    let i = 0;
    while (i < u8.length) {
      let c = u8[i++];
      if (c >= 0xf0) {
        c = (((c & 7) << 18) | ((u8[i++] & 63) << 12) | ((u8[i++] & 63) << 6) | (u8[i++] & 63)) - 0x10000;
        out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
        continue;
      }
      if (c >= 0xe0) c = ((c & 15) << 12) | ((u8[i++] & 63) << 6) | (u8[i++] & 63);
      else if (c >= 0xc0) c = ((c & 31) << 6) | (u8[i++] & 63);
      out += String.fromCharCode(c);
    }
    return out;
  }
}

function withTimeout(promise, ms, what) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);
}

/** The bytes of a packaged asset: fetch first, XHR if fetch refuses `file://`. */
function readBytes(uri) {
  return fetch(uri)
    .then((r) => r.arrayBuffer())
    .then((bytes) => ({ how: 'fetch', bytes }))
    .catch(
      (first) =>
        new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', uri);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => (xhr.response ? resolve({ how: 'xhr', bytes: xhr.response }) : reject(new Error('xhr: empty')));
          xhr.onerror = () => reject(new Error(`fetch: ${String(first)}; xhr: error`));
          xhr.send();
        }),
    );
}

export function GlSpike() {
  const [lines, setLines] = useState([]);
  const [stats, setStats] = useState('starting');
  const raf = useRef(0);
  /** One-off findings, logged again every few windows: the device log drops lines under load. */
  const setup = useRef([]);
  const log = useCallback((msg) => {
    console.log(`[glspike] ${msg}`);
    setup.current.push(msg);
    setLines((l) => [...l, msg].slice(-9));
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onContextCreate = useCallback(
    (gl) => {
      const win = Dimensions.get('window');
      const ratio = PixelRatio.get();
      const bufW = gl.drawingBufferWidth;
      const bufH = gl.drawingBufferHeight;
      // The drawing buffer size expo-gl reports, against the window in pixels; three's viewport uses the window's.
      const w = Math.round(win.width * ratio) || bufW;
      const h = Math.round(win.height * ratio) || bufH;
      log(`drawingBuffer ${bufW}x${bufH} · window ${win.width}x${win.height} dp × ${ratio} · viewport ${w}x${h}`);
      log(
        `context ${w}x${h} · ${gl.constructor && gl.constructor.name} · global WebGL2RenderingContext ${typeof WebGL2RenderingContext}`,
      );
      log(`${gl.getParameter(gl.VERSION)} · ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)} · ${gl.getParameter(gl.RENDERER)}`);
      const exts = gl.getSupportedExtensions() || [];
      console.log(`[glspike] extensions (${exts.length}): ${exts.join(' ')}`);
      // GLTFLoader reads the GLB's magic and JSON chunk with TextDecoder. Check what this runtime has, then use a plain
      // UTF-8 decoder (the first run failed the magic check with the decoder it found).
      const magic = new Uint8Array([0, 103, 108, 84, 70, 0]).subarray(1, 5);
      const probe = (D) => {
        try {
          return JSON.stringify(new D().decode(magic));
        } catch (e) {
          return `throws ${e && e.message}`;
        }
      };
      log(
        `TextDecoder: global ${typeof global.TextDecoder}${global.TextDecoder ? ` → ${probe(global.TextDecoder)}` : ''} · w3cmedia → ${probe(W3CTextDecoder)}`,
      );
      global.TextDecoder = Utf8Decoder;
      // GLTFParser reads navigator.userAgent (Safari/Firefox checks); React Native's navigator has none.
      if (global.navigator && typeof global.navigator.userAgent !== 'string') {
        log(`navigator.userAgent ${typeof global.navigator.userAgent}: set to 'Vega'`);
        global.navigator.userAgent = 'Vega';
      }

      const canvas = {
        width: w,
        height: h,
        clientWidth: w,
        clientHeight: h,
        style: {},
        addEventListener() {},
        removeEventListener() {},
      };
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, powerPreference: 'high-performance' });
      } catch (e) {
        log(`WebGLRenderer failed: ${e && e.message}`);
        return;
      }
      renderer.setSize(w, h, false);
      renderer.setClearColor(0x07070b);
      const caps = renderer.capabilities;
      log(`three r${THREE.REVISION} · isWebGL2 ${caps.isWebGL2} · precision ${caps.precision} · maxTextures ${caps.maxTextures}`);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.set(0, 2.4, 8);
      camera.lookAt(0, 0.9, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const key = new THREE.DirectionalLight(0xffe2c0, 1.8);
      key.position.set(3, 5, 4);
      scene.add(key);

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.45, metalness: 0.1 }),
      );
      box.position.set(0, 1.6, 0);
      scene.add(box);

      const crowd = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.35, 0.6, 0.35),
        new THREE.MeshLambertMaterial({ color: 0xd9b26f }),
        SEATS,
      );
      const seats = [];
      for (let i = 0; i < SEATS; i++) seats.push([((i % 10) - 4.5) * 0.7, 1.5 - Math.floor(i / 10) * 0.8]);
      scene.add(crowd);
      const m = new THREE.Matrix4();
      // Phase 2 (after 30 s): 1000 more instances, each moved from JS every frame, to see how the JS thread scales.
      const MORE = 1000;
      const more = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.12, 0.25, 0.12),
        new THREE.MeshLambertMaterial({ color: 0x8a6d43 }),
        MORE,
      );
      let phase2 = false;

      // (c1) A texture from a bundled JPEG through expo-gl's texImage2D({ localUri }), shown on a plane through three.
      try {
        const src = Image.resolveAssetSource(JPEG);
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        const t0 = clock();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, { localUri: src.uri });
        log(`texImage2D(localUri) ${src.uri.slice(-40)}: glError ${gl.getError()} in ${(clock() - t0).toFixed(0)} ms`);
        gl.bindTexture(gl.TEXTURE_2D, null);
        // Not renderer.resetState(): it reads gl.canvas.width, and expo-gl's context has no canvas.
        const texture = new THREE.Texture();
        texture.image = { width: 320, height: 180 };
        const props = renderer.properties.get(texture);
        props.__webglTexture = tex;
        props.__webglInit = true;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: texture }));
        plane.position.set(-3.4, 2.6, -1.5);
        scene.add(plane);
      } catch (e) {
        log(`texture failed: ${e && e.message}`);
      }

      // (c2) A crowd GLB (skinned, no images) read from the package and parsed by GLTFLoader.
      try {
        const glb = Image.resolveAssetSource(GLB);
        const t0 = clock();
        withTimeout(readBytes(glb.uri), 8000, 'read')
          .then(({ how, bytes }) => {
            log(`GLB read by ${how}: ${bytes.byteLength} bytes in ${(clock() - t0).toFixed(0)} ms`);
            const t1 = clock();
            new GLTFLoader().parse(
              bytes,
              '',
              (gltf) => {
                const person = gltf.scene;
                const size = new THREE.Box3().setFromObject(person).getSize(new THREE.Vector3());
                if (size.y > 0) person.scale.setScalar(1.7 / size.y);
                person.position.set(2.8, 0, 1);
                scene.add(person);
                let meshes = 0;
                let skinned = 0;
                person.traverse((o) => {
                  if (o.isMesh) meshes++;
                  if (o.isSkinnedMesh) skinned++;
                });
                log(`GLTF parsed in ${(clock() - t1).toFixed(0)} ms: ${meshes} meshes (${skinned} skinned), ${gltf.animations.length} clips`);
              },
              (e) => log(`GLTF parse failed: ${e && e.message}`),
            );
          })
          .catch((e) => log(`GLB read failed (${glb.uri.slice(-40)}): ${e && e.message}`));
      } catch (e) {
        log(`GLB failed: ${e && e.message}`);
      }

      // (b) The frame loop on React's JS thread, as expo-gl requires: time per frame is the JS side (scene update, three's
      // render, endFrameEXP), fps is what the loop achieved.
      const start = clock();
      let last = start;
      let frames = 0;
      let windows = 0;
      const times = [];
      const tick = () => {
        const a = clock();
        const t = (a - start) / 1000;
        box.rotation.x = t * 0.7;
        box.rotation.y = t * 1.1;
        for (let i = 0; i < SEATS; i++) {
          m.makeTranslation(seats[i][0], 0.3 + 0.12 * Math.abs(Math.sin(t * 3 + i)), seats[i][1]);
          crowd.setMatrixAt(i, m);
        }
        crowd.instanceMatrix.needsUpdate = true;
        if (!phase2 && t > 30) {
          phase2 = true;
          scene.add(more);
          log(`phase 2: +${MORE} instances moved from JS each frame`);
        }
        if (phase2) {
          for (let i = 0; i < MORE; i++) {
            m.makeTranslation(((i % 50) - 24.5) * 0.18, 0.1 + 0.08 * Math.abs(Math.sin(t * 4 + i * 0.37)), -2 - Math.floor(i / 50) * 0.25);
            more.setMatrixAt(i, m);
          }
          more.instanceMatrix.needsUpdate = true;
        }
        renderer.render(scene, camera);
        gl.endFrameEXP();
        const b = clock();
        times.push(b - a);
        frames++;
        if (b - last >= WINDOW_MS) {
          times.sort((x, y) => x - y);
          const avg = times.reduce((s, x) => s + x, 0) / times.length;
          const line = `${((frames * 1000) / (b - last)).toFixed(1)} fps · JS ${avg.toFixed(1)} ms/frame (p95 ${times[
            Math.floor(times.length * 0.95)
          ].toFixed(1)}, max ${times[times.length - 1].toFixed(1)}) · ${renderer.info.render.calls} calls · ${
            renderer.info.render.triangles
          } tris`;
          console.log(`[glspike] ${line}`);
          setStats(line);
          windows++;
          if (windows % 5 === 1) setup.current.forEach((msg, i) => console.log(`[glspike] setup ${i}: ${msg}`));
          frames = 0;
          times.length = 0;
          last = b;
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [log],
  );

  return (
    <View style={styles.fill}>
      <GLView style={styles.fill} onContextCreate={onContextCreate} />
      <View style={styles.panel} pointerEvents="none">
        <Text style={styles.stats}>{stats}</Text>
        {lines.map((l, i) => (
          <Text key={i} style={styles.line}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#07070b' },
  panel: { position: 'absolute', left: 48, bottom: 40, right: 48 },
  stats: { color: '#f3e3c3', fontSize: 30, marginBottom: 10 },
  line: { color: '#c9a86a', fontSize: 22 },
});
