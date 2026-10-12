/**
 * SPIKE (crowdgl): just enough of a browser for prototypes/crowd3d to run unmodified under Hermes on Vega, drawing
 * through an expo-gl context. Installed before crowd.js is first required, because the crowd modules read the page at
 * import time.
 *
 *  - location / URLSearchParams: the page's query (?host=1&preset=tv&venue=club&hud=0). RN 0.72's URLSearchParams
 *    parses nothing and throws on get(), so a small working one replaces it.
 *  - document: #c is a canvas whose getContext('webgl2') is the expo-gl context; '.tv' is a style holder; every other
 *    query is empty (host mode hides the HTML overlay anyway).
 *  - 2D canvases (venue.js canvasTex): there is no Canvas 2D on Vega, so each canvas the page creates is matched, by
 *    creation order, to a PNG of the same canvas captured in Chromium (tools/crowdgl-canvases.cjs) and handed to three
 *    as an image with `localUri`, which expo-gl's texImage2D/texSubImage2D decode with stb_image.
 *  - <img> (TextureLoader): an object with `localUri` and the real width/height read from the file's header.
 *  - GLB embedded images (GLTFLoader builds a Blob from bytes, which RN refuses): a loader plugin hands three the same
 *    bytes extracted offline (tools/crowdgl-extract.mjs), named by a hash of their content.
 *  - TextDecoder (Hermes has none; w3cmedia's returns "" for views), navigator.userAgent, performance.getEntriesByType.
 *  - window events and ReactNativeWebView: the host bridge becomes direct calls (window.encoreMessage in, report out).
 * Sound stays off: there is no AudioContext, so sound.js reports 'unavailable'.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const CROWD_BASE = 'file:///pkg/assets/crowd/';
export const PREP_BASE = 'file:///pkg/assets/crowdgl/';

class SearchParams {
  constructor(init) {
    this.list = [];
    const s = typeof init === 'string' ? init.replace(/^\?/, '') : '';
    if (s)
      s.split('&').forEach((pair) => {
        if (!pair) return;
        const i = pair.indexOf('=');
        const k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
        const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
        this.list.push([k, v]);
      });
  }
  get(k) {
    const e = this.list.find((p) => p[0] === k);
    return e ? e[1] : null;
  }
  has(k) {
    return this.list.some((p) => p[0] === k);
  }
  set(k, v) {
    this.list = this.list.filter((p) => p[0] !== k);
    this.list.push([k, String(v)]);
  }
  append(k, v) {
    this.list.push([k, String(v)]);
  }
  delete(k) {
    this.list = this.list.filter((p) => p[0] !== k);
  }
  toString() {
    return this.list.map((p) => `${encodeURIComponent(p[0])}=${encodeURIComponent(p[1])}`).join('&');
  }
}

/** UTF-8 for GLTFLoader (GLB magic and JSON chunk). */
class Utf8Decoder {
  decode(input) {
    if (input === undefined) return '';
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

/** FNV-1a over the bytes, and their length: the name the extractor gives an embedded image. */
export function fingerprint(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, '0')}-${bytes.length}`;
}

/** Width and height from a PNG (IHDR) or JPEG (first SOFn) header; null if neither. */
export function imageSize(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: (b[i + 7] << 8) | b[i + 8], h: (b[i + 5] << 8) | b[i + 6] };
      i += 2 + len;
    }
  }
  return null;
}

const resolveUrl = (u) => (/^[a-z]+:/i.test(u) ? u : CROWD_BASE + u.replace(/^\.\//, ''));

/** An <img> that "loads" by reading the file's header; expo-gl decodes the file itself from `localUri`. */
function makeImage(log) {
  const listeners = {};
  const img = {
    width: 0,
    height: 0,
    naturalWidth: 0,
    naturalHeight: 0,
    complete: false,
    localUri: null,
    style: {},
    addEventListener(t, f) {
      (listeners[t] = listeners[t] || []).push(f);
    },
    removeEventListener(t, f) {
      listeners[t] = (listeners[t] || []).filter((x) => x !== f);
    },
  };
  const fire = (t) => (listeners[t] || []).slice().forEach((f) => f.call(img, { type: t, target: img }));
  Object.defineProperty(img, 'src', {
    get: () => img._src,
    set(url) {
      img._src = url;
      const uri = resolveUrl(url);
      fetch(uri)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          const d = imageSize(new Uint8Array(buf, 0, Math.min(buf.byteLength, 65536)));
          if (!d) throw new Error('unknown image format');
          img.width = img.naturalWidth = d.w;
          img.height = img.naturalHeight = d.h;
          img.localUri = uri;
          img.complete = true;
          fire('load');
        })
        .catch((e) => {
          log(`image failed ${uri}: ${e && e.message}`);
          fire('error');
        });
    },
  });
  return img;
}

/** A Canvas 2D context that draws nothing: the pixels come from the Chromium capture. */
function noop2d(canvas) {
  const gradient = { addColorStop() {} };
  const ctx = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 0 }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  };
  ['save', 'restore', 'beginPath', 'closePath', 'rect', 'clip', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'moveTo',
    'lineTo', 'arc', 'arcTo', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'translate', 'scale', 'rotate', 'setTransform',
    'resetTransform', 'transform', 'drawImage', 'fillText', 'strokeText', 'putImageData', 'setLineDash'].forEach((k) => {
    ctx[k] = () => undefined;
  });
  return ctx;
}

/**
 * Installs the shims. `canvases` is the Chromium capture's list ({i, w, h}); `gl` the expo-gl context for #c.
 * Returns what the harness needs to check the run against the capture.
 */
export function installBrowser({ gl, width, height, search, canvases, onReport, log, morphs = true }) {
  const g = global;
  const checks = { canvases: [], images: 0, embedded: 0, morphsDropped: 0 };
  g.URLSearchParams = SearchParams;
  g.location = {
    search,
    pathname: '/pkg/assets/crowd/index.html',
    protocol: 'file:',
    href: `${CROWD_BASE}index.html${search}`,
    replace: (u) => log(`location.replace(${u}) ignored`),
  };
  g.innerWidth = width;
  g.innerHeight = height;
  if (!g.self) g.self = g;
  g.TextDecoder = Utf8Decoder;
  if (!g.navigator) g.navigator = {};
  if (typeof g.navigator.userAgent !== 'string') g.navigator.userAgent = 'Vega';
  if (g.performance && typeof g.performance.getEntriesByType !== 'function') g.performance.getEntriesByType = () => [];
  const winListeners = {};
  g.addEventListener = (t, f) => {
    (winListeners[t] = winListeners[t] || []).push(f);
  };
  g.removeEventListener = (t, f) => {
    winListeners[t] = (winListeners[t] || []).filter((x) => x !== f);
  };
  g.ReactNativeWebView = {
    postMessage: (s) => {
      try {
        onReport(JSON.parse(s));
      } catch (e) {
        log(`bad report ${s}`);
      }
    },
  };

  const glCanvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getContext: (type) => (type === 'webgl2' || type === 'webgl' ? gl : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  };
  let made = 0;
  const makeCanvas = () => {
    const n = made++;
    const canvas = { width: 300, height: 150, style: {}, addEventListener() {}, removeEventListener() {} };
    canvas.getContext = (type) => {
      if (type !== '2d') return null;
      const want = canvases[n];
      const ok = !!want && want.w === canvas.width && want.h === canvas.height;
      checks.canvases.push({ n, w: canvas.width, h: canvas.height, ok });
      if (!ok) log(`canvas ${n} is ${canvas.width}x${canvas.height}, the capture has ${want ? `${want.w}x${want.h}` : 'none'}`);
      canvas.localUri = `${PREP_BASE}canvas-${n}.png`;
      return noop2d(canvas);
    };
    return canvas;
  };
  const tv = { style: {} };
  const element = () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, remove() {}, appendChild() {} });
  const create = (tag) => {
    const t = String(tag).toLowerCase();
    if (t === 'canvas') return makeCanvas();
    if (t === 'img') {
      checks.images++;
      return makeImage(log);
    }
    return element();
  };
  g.document = {
    body: { classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, appendChild() {} },
    getElementById: (id) => (id === 'c' ? glCanvas : null),
    querySelector: (sel) => (sel === '.tv' ? tv : null),
    querySelectorAll: () => [],
    createElement: create,
    createElementNS: (ns, tag) => create(tag),
    addEventListener() {},
    removeEventListener() {},
  };

  // Relative URLs ('people/…') resolve against the packed page in the app's assets, as file:// does in the WebView.
  THREE.DefaultLoadingManager.setURLModifier(resolveUrl);

  // GLB images: three reads the bytes from the GLB; the same bytes were extracted to a file named by their hash.
  if (!GLTFLoader.prototype.__encore) {
    GLTFLoader.prototype.__encore = true;
    const parse = GLTFLoader.prototype.parse;
    GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
      if (!this.__encorePlugin) {
        this.__encorePlugin = true;
        this.register((parser) => new EmbeddedImages(parser, checks, morphs));
      }
      return parse.call(this, data, path, onLoad, onError);
    };
  }
  return { checks, winListeners };
}

class EmbeddedImages {
  constructor(parser, checks, morphs) {
    this.name = 'ENCORE_embedded_images';
    this.checks = checks;
    this.morphs = morphs;
    const original = parser.loadImageSource.bind(parser);
    parser.loadImageSource = (sourceIndex, loader) => {
      const def = parser.json.images[sourceIndex];
      if (def.bufferView === undefined) return original(sourceIndex, loader);
      if (parser.sourceCache[sourceIndex] !== undefined) return parser.sourceCache[sourceIndex].then((t) => t.clone());
      const promise = parser.getDependency('bufferView', def.bufferView).then((buffer) => {
        const bytes = new Uint8Array(buffer);
        const d = imageSize(bytes) || { w: 1, h: 1 };
        const ext = def.mimeType === 'image/png' ? 'png' : 'jpg';
        const image = { width: d.w, height: d.h, naturalWidth: d.w, naturalHeight: d.h, complete: true, localUri: `${PREP_BASE}img/${fingerprint(bytes)}.${ext}` };
        const texture = new THREE.Texture(image);
        texture.needsUpdate = true;
        texture.userData.mimeType = def.mimeType;
        checks.embedded++;
        return texture;
      });
      parser.sourceCache[sourceIndex] = promise;
      return promise;
    };
  }

  /** morphs = false: the GPU gets no morph targets; the mesh keeps its dictionary and influences, so the faces' JS runs. */
  afterRoot(result) {
    if (this.morphs) return null;
    result.scene.traverse((o) => {
      if (o.geometry && o.geometry.morphAttributes && o.geometry.morphAttributes.position) {
        o.geometry.morphAttributes = {};
        this.checks.morphsDropped++;
      }
    });
    return null;
  }
}
