// Crowd sound inside the page: one decoded MP3 sprite (sounds/crowd-sprite.mp3, built by tools/build_sounds.mjs from
// packages/shared-ui/src/assets/sounds, credits in sounds/CREDITS.md) played through WebAudio by offset.
//   cue(id, strength): play that clip; its gain follows the reaction it belongs to (the same envelope that drives the
//                      faces): after a short attack it tracks the room's current level for that kind, and fades out
//                      when the reaction is over. Strength scales the gain.
//   duck(on):          drop everything by about 10 dB while the MC speaks (and back).
//   roomTone(id|null): a looping bed under the room (the club and the open mic).
// Mix mode (the default; &sound=sprite plays the single clips as before): a laugh, applause or cheer is a fresh mix
// each time, two to four layers from different recordings (the pool, sounds/crowd-pool.mp3 from tools/build_pool.mjs,
// plus the sprite's own clips), each from a random point, at ±1.5% rate at most, spread across the stereo field
// with a few voices first and the rest joining over 150-400 ms, ending one by one over long soft tails, now and then
// one laugh rising out of the crowd or a few claps, in a short room reverb for the venue. The reaction's strength picks how many layers, how big the
// recordings are (a titter at 0.3 is two small ones, a roar at 0.9 is four big ones), how long, how wide and how loud.
// The same set of recordings never plays twice running.
// Each venue sounds like itself (VENUE_SOUND; the user, 2026-10-13: "use different laughing sounds also when changing
// the laugh"): the open mic a few separate voices, dry and close; the club rowdy and close, with cackles and table
// thumps in a short room; the theatre a polite chuckle that ripples from the front rows back, with applause blending
// in; the arena a huge roar with whistles and a long tail. On top of the crowd layers, single people laugh
// (sounds/crowd-voices.mp3: women and men, each a roar, a giggle or a chuckle through the nose), as many as the laugh's
// cast (the motion agent's laughCast: read with the cue when it is already decided, else added by castArrived a frame
// or so later, while the ensemble starts at the reaction's own moment), never a clip or a set of layers heard in the
// last three laughs, each at its own pitch (within ±4%) and onset. feature() puts one voice of the right gender and
// laugh type a little forward when a close-up shows that person laughing hard.
// the mixes' level over the room tone (the emulator test: club laughs were a median +2 dB over the tone; with this
// and the quieter club tone a laugh at 0.6 peaks about +10 dB over it, a roar at 0.9 about +13 dB, a titter +7 dB)
const MIX_GAIN = 1.7;
/** Each venue's laugh: the room's reverb [seconds, wet], crowd layers for a small, medium and big laugh, single voices
 * [fewest, most], and its own touches. */
const VENUE_SOUND = {
  openmic: { verb: [0.3, 0.05], layers: [0, 1, 2], crowdMax: 0.45, voices: [1, 4], spread: 0.45, tail: 1, shouts: 0.3, sparse: true },
  club: { verb: [0.45, 0.12], layers: [2, 3, 3], voices: [1, 3], spread: 0.7, tail: 1, shouts: 1, thumps: true },
  theatre: { verb: [1.3, 0.2], layers: [2, 3, 4], voices: [0, 1], spread: 0.9, tail: 1.25, shouts: 0.35, ripple: true, applause: 0.55 },
  arena: { verb: [2.2, 0.26], layers: [3, 4, 4], voices: [0, 1], spread: 1, tail: 1.7, shouts: 1.4, roar: true, whistles: true },
};
const KIND = { 'laugh-small': 'laugh', 'laugh-medium': 'laugh', 'laugh-big': 'laugh', 'applause-small': 'applause', 'applause-big': 'applause', 'cheer-big': 'cheer', snaps: 'snap', murmur: 'murmur' };

/** The same rule the TV uses (packages/shared-ui/src/encore/world/sounds.ts cueFor), for the standalone demo. */
export function cueFor(kind, s) {
  if (kind === 'laugh') return s < 0.35 ? 'laugh-small' : s < 0.7 ? 'laugh-medium' : 'laugh-big';
  if (kind === 'applause') return s < 0.5 ? 'applause-small' : 'applause-big';
  if (kind === 'snap') return 'snaps';
  if (kind === 'cheer') return 'cheer-big';
  if (kind === 'murmur') return 'murmur';
  return null;
}

export class CrowdSound {
  constructor(base = 'sounds/', report = () => {}, opts = {}) {
    this.base = base;
    this.report = report;
    this.mix = opts.mix !== false;
    this.pool = null; // { map, buf, offset } once decoded
    this.lastSig = '';
    this.mixes = []; // the last mixes, for the box harness (window.__mixes)
    this.ctx = null;
    this.buf = null;
    this.map = null;
    this.offset = 0; // decoder delay measured on the decoded sprite (s)
    this.cues = [];
    this.tone = null;
    this.toneWant = null;
    this.ducked = false;
    this.lastState = '';
    this.data = fetch(base + 'crowd-sprite.json').then((r) => r.json()).then((m) => { this.map = m; return fetch(base + m.file); }).then((r) => r.arrayBuffer()).catch(() => null);
    this.shoutData = this.mix ? fetch(base + 'crowd-shouts.json').then((r) => r.json()).then((m) => fetch(base + m.file).then((r) => r.arrayBuffer()).then((b) => ({ m, b }))).catch(() => null) : Promise.resolve(null);
    this.shouts = null; this.lastShout = ''; this.lastBoo = -1e9;
    this.venue = opts.venue || new URLSearchParams(location.search).get('venue') || 'club';
    this.prof = VENUE_SOUND[this.venue] || VENUE_SOUND.club;
    this.recent = []; // the last three laughs: { ids: Set of clip ids, crowd: the crowd layers' signature, sig }
    this.lastLaugh = null; // the laugh's cue, for feature()
    const pack = (name) => (this.mix ? fetch(base + name + '.json').then((r) => r.json()).then((m) => fetch(base + m.file).then((r) => r.arrayBuffer()).then((b) => ({ m, b }))).catch(() => null) : Promise.resolve(null));
    this.voicesData = pack('crowd-voices');
    this.venueData = pack('crowd-' + this.venue);
    this.voices = null; this.vpack = null;
    this.poolData = this.mix ? fetch(base + 'crowd-pool.json').then((r) => r.json()).then((m) => fetch(base + m.file).then((r) => r.arrayBuffer()).then((b) => ({ m, b }))).catch(() => null) : Promise.resolve(null);
  }

  /** The decoder's delay on a decoded sprite, against the first audible sample its build step recorded. */
  static delay(buf, map) {
    const ch = buf.getChannelData(0);
    let i = 0;
    while (i < ch.length && Math.abs(ch[i]) < 0.0198) i++;
    return Math.max(-0.05, Math.min(0.1, (i - map.firstAudibleSample * (buf.sampleRate / map.sampleRate)) / buf.sampleRate));
  }

  /** Create (or resume) the audio context; browsers and WebViews may keep it suspended until a gesture. */
  async unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return this.state('unavailable');
        // (32 kHz: crowd sound has nothing above 16 kHz worth its memory; every decoded clip is resampled to the
        // context's rate, so this is two thirds of the 48 kHz buffers: about 36 MB for everything instead of 54)
        try { this.ctx = new AC({ latencyHint: 'playback', sampleRate: 32000 }); } catch (e) { this.ctx = new AC({ latencyHint: 'playback' }); }
        this.master = this.ctx.createGain();
        this.duckGain = this.ctx.createGain();
        // gentle compression at the end: four loud layers of a roar must not clip
        const lim = this.ctx.createDynamicsCompressor();
        lim.threshold.value = -16; lim.knee.value = 12; lim.ratio.value = 2.5; lim.attack.value = 0.03; lim.release.value = 0.35; // (gentle: a brick wall pumped on big laughs)
        this.master.connect(this.duckGain).connect(lim).connect(this.ctx.destination);
        // the room: a short generated reverb on everything the crowd makes, mixed low (small for the club and the open
        // mic, bigger for the theatre, big for the arena); one ConvolverNode, about 0.4-1.6 s of impulse
        if (!/(^|,)noverb(,|$)/.test(new URLSearchParams(location.search).get('ab') || '')) try { // (&ab=noverb prices it on the TV)
          const [T, wet] = this.prof.verb;
          const ctx = this.ctx, len = Math.round(T * ctx.sampleRate), ir = ctx.createBuffer(2, len, ctx.sampleRate);
          for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / len) * 0.5;
            for (const [ms, a] of [[11 + ch * 3, 0.5], [19 - ch * 2, 0.35], [29 + ch * 4, 0.25]]) { const k = Math.round((ms / 1000) * ctx.sampleRate); if (k < len) d[k] += a; } // early reflections
          }
          const conv = ctx.createConvolver(), wg = ctx.createGain();
          conv.buffer = ir; wg.gain.value = wet;
          this.master.connect(conv).connect(wg).connect(this.duckGain);
        } catch (e) { /* no reverb */ }
        this.decodeAll();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (e) { /* stays silent */ }
    this.state(this.ctx ? this.ctx.state : 'unavailable');
  }

  /**
   * Decoding waits for the room: nothing is decoded until crowd.js calls go() after its first frame (on the TV the
   * decodes took the A55s while the room loaded: 48 s to the first ready). Then one file at a time, with a pause
   * between them: the sprite (single clips, the room tone), the pool (the mixes), the shouts, this venue's own sounds,
   * the single voices. Every cue plays from whatever is decoded so far.
   */
  go() { this.allowed = true; this.decodeAll(); }
  async decodeAll() {
    if (!this.ctx || !this.allowed || this.decoding) return;
    this.decoding = true;
    const pause = () => new Promise((r) => setTimeout(r, 250));
    const t0 = performance.now();
    try {
      const bytes = await this.data;
      if (!bytes) { this.state('unavailable'); return; }
      this.buf = await this.ctx.decodeAudioData(bytes.slice(0));
      this.offset = CrowdSound.delay(this.buf, this.map);
      if (this.toneWant !== null) this.roomTone(this.toneWant.id, this.toneWant.gain);
      for (const [key, data] of [['pool', this.poolData], ['shouts', this.shoutData], ['vpack', this.venueData], ['voices', this.voicesData]]) {
        await pause();
        const d = await data;
        if (!d) continue;
        const b = await this.ctx.decodeAudioData(d.b.slice(0));
        this[key] = { map: d.m, buf: b, offset: CrowdSound.delay(b, d.m) };
        d.b = null; // (the encoded bytes are not needed once decoded)
      }
    } catch (e) { /* plays what it has */ }
    this.decodeMs = Math.round(performance.now() - t0);
    const line = `[crowd] load audio · decoded ${this.audioMB().mb} MB at ${this.ctx.sampleRate} Hz in ${(this.decodeMs / 1000).toFixed(1)} s, done ${(performance.now() / 1000).toFixed(1)} s since start`;
    console.log(line);
    this.report({ type: 'load', line });
  }

  /** The decoded audio's size in MB (each buffer: length × channels × 4 bytes). */
  audioMB() {
    const bufs = [this.buf, this.pool && this.pool.buf, this.shouts && this.shouts.buf, this.voices && this.voices.buf, this.vpack && this.vpack.buf].filter(Boolean);
    return { mb: +(bufs.reduce((a, b) => a + b.length * b.numberOfChannels * 4, 0) / 1e6).toFixed(1), rate: this.ctx ? this.ctx.sampleRate : 0, buffers: bufs.length, decodeMs: this.decodeMs ?? null };
  }

  state(s) { if (s !== this.lastState) { this.lastState = s; this.report({ type: 'audio', state: s }); } }

  seg(id) { return this.map && this.map.segments[id]; }

  cue(id, strength = 0.7, opts = null) {
    this.unlock();
    const S = this.seg(id);
    if (!S || !this.buf || !this.ctx) return;
    if (this.mix && this.pool && ['laugh', 'applause', 'cheer'].includes(KIND[id])) return this.cueMix(KIND[id], strength, opts);
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.buf;
    const g = ctx.createGain();
    const base = MIX_GAIN * (0.25 + 0.75 * Math.pow(Math.max(0, Math.min(1, strength)), 1.3));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(base, t + 0.06);
    src.connect(g).connect(this.master);
    src.start(t, Math.max(0, S.start + this.offset), S.dur);
    const cue = { src, g, base, kind: KIND[id] || 'laugh', started: t, end: t + S.dur, follow: 1, quietSince: null };
    src.onended = () => { this.cues = this.cues.filter((c) => c !== cue); };
    this.cues.push(cue);
  }

  /** The recordings a reaction of this kind can be layered from: [{ buf, at, dur, src, level, id }]. */
  candidates(kind) {
    const out = [];
    const sprite = { 'laugh-small': ['laugh', 0.3, 'freesound-262981'], 'laugh-medium': ['laugh', 0.55, 'freesound-397034'], 'laugh-big': ['laugh', 0.9, 'freesound-72843'],
      'applause-small': ['applause', 0.4, 'freesound-139972'], 'applause-big': ['applause', 0.85, 'freesound-277021'], 'cheer-big': ['cheer', 0.9, 'freesound-528799'] };
    const want = kind === 'cheer' ? ['cheer', 'applause'] : [kind];
    for (const [id, [k, level, src]] of Object.entries(sprite)) {
      const S = this.seg(id);
      if (S && want.includes(k)) out.push({ buf: this.buf, at: S.start + this.offset, dur: S.dur, src, level, id });
    }
    for (const c of this.pool.map.clips) if (want.includes(c.kind)) out.push({ buf: this.pool.buf, at: c.start + this.pool.offset, dur: c.dur, src: c.src, level: c.level, id: c.id });
    return out;
  }

  /** n recordings, each from a different source where possible, nearest the strength first (weighted at random). */
  choose(cand, n, s) {
    const pick = [], used = new Set();
    const draw = (target, width) => {
      const pool = cand.filter((c) => !pick.includes(c) && !used.has(c.src));
      const from = pool.length ? pool : cand.filter((c) => !pick.includes(c));
      if (!from.length) return null;
      const w = from.map((c) => Math.exp(-(((c.level - target) / width) ** 2)) + 0.03);
      let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
      while (i < from.length - 1 && (r -= w[i]) > 0) i++;
      return from[i];
    };
    for (let k = 0; k < n; k++) {
      const c = draw(k === 0 ? s : s * 0.85, k === 0 ? 0.2 : 0.3); // the supporting layers may be a little smaller
      if (!c) break;
      pick.push(c); used.add(c.src);
    }
    return pick;
  }

  /** A clip of the venue's own pack of this kind: [{ buf, at, dur, src, level, id }]. */
  venueClips(kind) {
    if (!this.vpack) return [];
    return this.vpack.map.clips.filter((c) => c.kind === kind).map((c) => ({ buf: this.vpack.buf, at: c.start + this.vpack.offset, dur: c.dur, src: c.src, level: c.level ?? 0.5, id: c.id }));
  }

  /** Clip ids heard in the last three laughs. */
  recentIds() { const ids = new Set(); for (const r of this.recent) for (const i of r.ids) ids.add(i); return ids; }

  /** One single person's laugh of this gender and type ('' for any), not heard in the last three laughs where possible. */
  voiceClip(gender, type, taken) {
    if (!this.voices) return null;
    const recent = this.recentIds(), all = this.voices.map.clips;
    const fit = (c) => (!gender || c.gender === gender) && (!type || c.type === type) && !taken.has(c.id);
    let list = all.filter((c) => fit(c) && !recent.has(c.id));
    if (!list.length) list = all.filter((c) => fit(c) && !taken.has(c.src)); // (a thin type: at least another recording)
    if (!list.length) list = all.filter(fit);
    if (!list.length) return null;
    const c = list[Math.floor(Math.random() * list.length)];
    return { buf: this.voices.buf, at: c.start + this.voices.offset, dur: c.dur, src: c.src, level: c.level, id: c.id, gender: c.gender, type: c.type };
  }

  /** A laugh, applause or cheer as a fresh mix (see the header). */
  cueMix(kind, strength, opts = null) {
    const ctx = this.ctx, t = ctx.currentTime, s = Math.max(0, Math.min(1, strength)), P = this.prof, laugh = kind === 'laugh';
    // who laughs: the cast (how many, which people) when crowd.js gives it, else the strength alone
    // (the ensemble starts at the reaction's moment, sized by its strength; the cast's own voices join a frame or so
    // later, castArrived; a cast already decided for this laugh is read now)
    let cast = null;
    try { cast = laugh && opts && opts.cast ? opts.cast : null; } catch (e) { cast = null; }
    const share = cast && typeof cast.share === 'number' ? Math.max(0, Math.min(1, cast.share)) : s;
    // the crowd layers: the venue's count for a small, medium or big laugh (the open mic's are small groups only)
    let cand = this.candidates(kind);
    if (laugh && P.ripple) cand = cand.concat(this.venueClips('ripple')); // (the theatre's own polite chuckles)
    if (laugh && P.crowdMax) cand = cand.filter((c) => c.level <= P.crowdMax);
    const nWant = laugh ? Math.max(P.layers[s < 0.4 ? 0 : s < 0.75 ? 1 : 2], this.voices ? 0 : 2) : s < 0.4 ? 2 : s < 0.75 ? 3 : 4; // (no voices yet: two crowd layers at least)
    const n = Math.min(cand.length, nWant);
    const target = laugh && P.crowdMax ? Math.min(s, P.crowdMax) : s;
    // never a set of layers heard in the last three laughs, and no clip from the last laugh
    let pick = [], sig = '';
    const sigs = new Set(this.recent.map((r) => r.crowd).concat([this.lastSig]));
    const last = this.recent.length ? this.recent[this.recent.length - 1].ids : new Set();
    // (the theatre: the laugh starts as one of its own polite chuckles, the rest of the house joining behind it)
    const heard0 = this.recentIds();
    const lead = laugh && P.ripple ? this.venueClips('ripple').filter((c) => !heard0.has(c.id)) : []; // (not a chuckle from the last three laughs)
    for (let tries = 0; tries < 10; tries++) {
      pick = n ? this.choose(cand, n, target) : [];
      if (lead.length && pick.length) { const l = lead[Math.floor(Math.random() * lead.length)]; pick = [l, ...pick.filter((c) => c !== l && c.src !== l.src)].slice(0, n); }
      sig = pick.map((c) => c.id).sort().join('|');
      if ((!sig || !sigs.has(sig)) && (tries > 5 || !pick.some((c) => last.has(c.id)))) break;
    }
    this.lastSig = sig;
    const D = (1.8 + 4.2 * s) * (laugh ? P.tail : 1); // how long the reaction runs (s): about 3 s for a titter, 5.6 s for a roar; the arena's longer
    const spread = (0.15 + 0.65 * s) * (laugh ? P.spread : 1);
    const g = ctx.createGain();
    const base = MIX_GAIN * (0.25 + 0.75 * Math.pow(s, 1.3)); // (a roar much louder than a titter)
    g.gain.setValueAtTime(base, t); // (each layer shapes its own onset and tail)
    g.connect(this.master);
    const cue = { srcs: [], g, base, kind, started: t, end: t, follow: 1, quietSince: null, sig };
    let live = 0;
    // one layer of voices: from `at`, `play` seconds of clip c from offset off, a soft onset over `rise`, a long tail
    const layer = (c, at, play, off, amp, pan, rise, fade, rate) => {
      const src = ctx.createBufferSource();
      src.buffer = c.buf;
      src.playbackRate.value = rate;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, at);
      lg.gain.setTargetAtTime(amp, at, rise / 3); // (an exponential approach: no hard start)
      lg.gain.setTargetAtTime(0, at + Math.max(rise, play - fade), fade / 3.5); // (and a long, soft tail)
      src.connect(lg);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); lg.connect(p).connect(g); } else lg.connect(g);
      src.start(at, Math.max(0, c.at + off), play * rate + 0.05);
      src.stop(at + play + 0.05);
      live++;
      src.onended = () => { if (--live === 0) { this.cues = this.cues.filter((x) => x !== cue); g.disconnect(); if (this.lastLaugh === cue) this.lastLaugh = null; } };
      cue.srcs.push(src);
      cue.end = Math.max(cue.end, at + play);
    };
    cue.layer = layer;
    const norm = 1 / Math.sqrt(Math.max(1, pick.length));
    // the onsets: a few voices first, the rest joining over 150-400 ms (later for a titter, sooner for a roar); in the
    // theatre each layer is a row further back, so the laugh travels from the front to the back over about a second
    const onset = (i) => (i === 0 ? 0 : P.ripple && laugh ? i * (0.22 + 0.12 * Math.random()) : 0.15 + Math.random() * (0.1 + 0.15 * (1 - s)) + i * 0.04);
    pick.forEach((c, i) => {
      // pitch barely moves (±1.5%: more read as machine-y); the variety comes from the clip, its offset and its gain
      const rate = 1 + (Math.random() - 0.5) * 0.03;
      const len = i === 0 ? D : D * (0.5 + Math.random() * 0.45); // the layers drop out one by one
      const off = c.dur > len * rate ? Math.random() * (c.dur - len * rate) : 0;
      const play = Math.min(len, (c.dur - off) / rate);
      const back = P.ripple && laugh ? Math.pow(0.82, i) : 1; // (the back rows quieter)
      const amp = ((i === 0 ? 1 : 0.5 + Math.random() * 0.35) * 1.25 * back) * norm;
      const pan = i === 0 ? (Math.random() - 0.5) * 0.2 : (i % 2 ? 1 : -1) * spread * (0.55 + 0.45 * Math.random());
      layer(c, t + onset(i), play, off, amp, pan, i === 0 ? 0.08 + 0.06 * (1 - s) : 0.15 + Math.random() * 0.15, Math.min(play * 0.6, (0.8 + Math.random() * 1.2) * (laugh ? P.tail : 1)), rate);
    });
    const used = new Set(pick.map((c) => c.id)), voices = [];
    if (laugh) {
      // single people: as many as the cast (the venue's range), their genders and laugh types from the cast's people
      // where it names them, each at its own pitch and onset
      const [lo, hi] = P.voices;
      let nv = Math.round(lo + (hi - lo) * share + (Math.random() - 0.4) * 0.8);
      nv = Math.max(lo, Math.min(hi, nv));
      if (!this.voices) nv = 0;
      const named = cast && Array.isArray(cast.people) ? cast.people.filter((q) => q && q.gender).slice().sort((x, y) => (y.level || 0) - (x.level || 0)) : [];
      const typeFor = () => (s > 0.7 ? (Math.random() < 0.7 ? 'roar' : 'giggle') : s > 0.4 ? ['roar', 'giggle', 'exhale'][Math.floor(Math.random() * 3)] : Math.random() < 0.6 ? 'exhale' : 'giggle');
      const taken = new Set();
      for (let k = 0; k < nv; k++) {
        const who = named[k] || null;
        const c = this.voiceClip(who ? who.gender : Math.random() < 0.5 ? 'f' : 'm', who && who.type ? who.type : typeFor(), taken) || this.voiceClip('', '', taken);
        if (!c) break;
        taken.add(c.id); taken.add(c.src); voices.push(c.id); used.add(c.id);
        const rate = 1 + (Math.random() - 0.5) * 0.08; // (±4%: one person's own voice)
        const play = Math.min(c.dur / rate, D * 0.9);
        const near = this.venue === 'openmic' || this.venue === 'club' ? 0.75 + 0.25 * Math.random() : 0.45 + 0.3 * Math.random();
        layer(c, t + 0.05 + Math.random() * (0.25 + 0.6 * (1 - s)) + k * 0.12, play, 0, (0.55 + 0.35 * s) * near, (Math.random() - 0.5) * 2 * Math.min(0.85, spread + 0.25), 0.03, Math.min(play * 0.4, 0.5), rate);
      }
    }
    // people, not a texture: now and then one laugh rises out of the crowd (a small group's recording, short, off to
    // one side), and in a big laugh a few claps or a whoop
    if (!laugh || !this.voices) {
      if ((kind === 'laugh' || kind === 'cheer') && Math.random() < 0.25 + 0.3 * s) {
        const solo = cand.filter((c) => c.level <= 0.45);
        if (solo.length) {
          const c = solo[Math.floor(Math.random() * solo.length)], play = Math.min(c.dur, 1.1 + Math.random() * 0.9);
          layer(c, t + 0.3 + Math.random() * 0.9, play, Math.random() * Math.max(0, c.dur - play), 0.75 * norm, (Math.random() < 0.5 ? -1 : 1) * (0.45 + 0.35 * Math.random()), 0.06, Math.min(play * 0.6, 0.7), 1 + (Math.random() - 0.5) * 0.02);
        }
      }
    }
    const extras = [];
    const heard = this.recentIds();
    const one = (list) => { const fresh = list.filter((c) => !heard.has(c.id)); const from = fresh.length ? fresh : list; return from[Math.floor(Math.random() * from.length)]; }; // (not one heard in the last three laughs, where the venue has another)
    if (laugh && P.thumps && s > 0.55 && Math.random() < 0.35 + 0.5 * s) {
      // the club: a hand or two slapping a table in the big ones (sometimes twice quickly)
      const th = this.venueClips('thump');
      const k = s > 0.8 && Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < k && th.length; i++) {
        const c = one(th), at = t + 0.35 + Math.random() * 1.1;
        extras.push(c.id);
        layer(c, at, c.dur, 0, (0.35 + 0.3 * Math.random()) * norm * 1.4, (Math.random() - 0.5) * 1.2, 0.005, 0.15, 1 + (Math.random() - 0.5) * 0.06);
        if (Math.random() < 0.4) layer(c, at + 0.16 + Math.random() * 0.08, c.dur, 0, 0.3 * norm, (Math.random() - 0.5) * 1.2, 0.005, 0.15, 1.03);
      }
    }
    if (laugh && P.applause && s > 0.6 && Math.random() < P.applause) {
      // the theatre: applause blending in under a big laugh, from the middle of the house
      const ap = this.venueClips('applause');
      if (ap.length) { const c = one(ap), play = Math.min(c.dur, 1.6 + 1.8 * s); extras.push(c.id); layer(c, t + 0.7 + Math.random() * 0.6, play, Math.random() * Math.max(0, c.dur - play), 0.5 * norm, (Math.random() - 0.5) * 0.4, 0.35, play * 0.5, 1); }
    }
    if (laugh && P.roar && s > 0.45) {
      // the arena: the stadium's roar under the laugh, and its long tail
      const ro = this.venueClips('roar');
      if (ro.length) { const c = one(ro), play = Math.min(c.dur, D); extras.push(c.id); layer(c, t + 0.1, play, Math.random() * Math.max(0, c.dur - play), (0.35 + 0.4 * s) * norm, (Math.random() - 0.5) * 0.3, 0.3, play * 0.6, 1 + (Math.random() - 0.5) * 0.02); }
    }
    if (laugh && P.whistles && s > 0.5 && Math.random() < 0.3 + 0.6 * s) {
      const wh = this.venueClips('whistle');
      if (wh.length) { const c = one(wh), play = Math.min(c.dur, 1.4 + Math.random()); extras.push(c.id); layer(c, t + 0.5 + Math.random() * 1.2, play, Math.random() * Math.max(0, c.dur - play), 0.4 * norm, (Math.random() - 0.5) * 1.6, 0.05, 0.5, 1 + (Math.random() - 0.5) * 0.04); }
    }
    if (laugh && P.sparse && s < 0.55 && Math.random() < 0.4) {
      // the open mic: the back room's own few people and their chatter under a small laugh
      const sp = this.venueClips('sparse');
      if (sp.length) { const c = one(sp), play = Math.min(c.dur, 2 + Math.random()); extras.push(c.id); layer(c, t + 0.2, play, Math.random() * Math.max(0, c.dur - play), 0.45 * norm, (Math.random() - 0.5) * 0.6, 0.2, play * 0.5, 1); }
    }
    if (kind === 'laugh' && s > 0.65 && Math.random() < (P.applause ? 0.15 : 0.35)) {
      const extra = this.candidates(Math.random() < 0.6 ? 'applause' : 'cheer').filter((c) => c.dur > 1);
      if (extra.length) {
        const c = extra[Math.floor(Math.random() * extra.length)], play = 0.7 + Math.random() * 0.5;
        layer(c, t + 0.6 + Math.random() * 1.2, play, Math.random() * Math.max(0, c.dur - play), 0.35 * norm, (Math.random() - 0.5) * 1.2, 0.05, 0.45, 1);
      }
    }
    // voices in the crowd: a big laugh or a cheer sometimes gets one or two shouts ("woo!", "yeah!", "nice one!", a
    // whistle), each placed somewhere in the room (pan, distance as gain, the venue's reverb), never the same clip twice
    // running; they ride this reaction's envelope like its layers (the arena shouts most, the open mic least)
    const shouted = [];
    const sp = laugh ? P.shouts : 1;
    if (this.shouts && s >= 0.6 && Math.random() < Math.min(1, (0.15 + 0.85 * (s - 0.6)) * sp)) {
      const kinds = kind === 'laugh' ? ['woo', 'yes', 'nice', 'whistle'] : ['woo', 'yes', 'whistle'];
      const nsh = s > 0.85 && Math.random() < 0.4 * sp ? 2 : 1;
      for (let k = 0; k < nsh; k++) {
        const c = this.shoutClip(kinds);
        if (!c) break;
        shouted.push(c.id);
        const near = Math.random();
        layer(c, t + 0.4 + Math.random() * 1.6 + k * 0.7, c.dur, 0, (0.35 + 0.5 * near) * norm, (Math.random() - 0.5) * 1.4, 0.03, Math.min(c.dur * 0.4, 0.4), 1 + (Math.random() - 0.5) * 0.02);
      }
    }
    this.cues.push(cue);
    if (laugh) {
      cue.voices = voices.length; cue.s = s; cue.t0 = t; cue.cast = !!cast; cue.D = D; cue.spread = spread;
      this.lastLaugh = cue;
      for (const id of extras) used.add(id);
      this.recent.push({ ids: used, crowd: sig, sig: sig + '#' + voices.slice().sort().join('|') });
      if (this.recent.length > 3) this.recent.shift();
    }
    this.mixes.push({ kind, s: +s.toFixed(2), venue: this.venue, layers: pick.map((c) => c.id), sig, ...(voices.length ? { voices } : {}), ...(extras.length ? { extras } : {}), ...(shouted.length ? { shouts: shouted } : {}), ...(cast ? { cast: { n: cast.n, share: +share.toFixed(2), named: (cast.people || []).length } } : {}) });
    if (this.mixes.length > 20) this.mixes.shift();
  }

  /**
   * The laugh's cast is known (a frame or so after the cue): single voices are added up to the cast's own count, with
   * the cast's genders and laugh types, joining the laugh within its first second. Once per laugh.
   */
  castArrived(cast) {
    const L = this.lastLaugh, P = this.prof;
    if (!this.ctx || !this.voices || !L || L.cast || !cast) return false;
    const t = this.ctx.currentTime;
    if (t - L.t0 > 0.8) return false;
    L.cast = true;
    const share = Math.max(0, Math.min(1, cast.share || 0));
    const [lo, hi] = P.voices;
    const want = Math.max(lo, Math.min(hi, Math.round(lo + (hi - lo) * share)));
    const named = (cast.people || []).filter((q) => q && q.gender).slice().sort((x, y) => (y.level || 0) - (x.level || 0));
    const rec = this.recent[this.recent.length - 1], taken = new Set(rec ? rec.ids : []);
    const added = [];
    for (let k = L.voices; k < want; k++) {
      const who = named[k - L.voices] || named[0];
      const c = (who && this.voiceClip(who.gender, who.type, taken)) || this.voiceClip('', '', taken);
      if (!c) break;
      taken.add(c.id); added.push(c.id); if (rec) rec.ids.add(c.id);
      const rate = 1 + (Math.random() - 0.5) * 0.08, play = Math.min(c.dur / rate, L.D * 0.85);
      L.layer(c, t + 0.03 + Math.random() * 0.25, play, 0, (0.55 + 0.35 * L.s) * (0.6 + 0.3 * Math.random()), (Math.random() - 0.5) * 2 * Math.min(0.85, L.spread + 0.25), 0.03, Math.min(play * 0.4, 0.5), rate);
    }
    this.mixes.push({ kind: 'cast', n: cast.n, share: +share.toFixed(2), named: named.length, added });
    if (this.mixes.length > 20) this.mixes.shift();
    return true;
  }

  /**
   * A close-up shows this person laughing hard: one voice of their gender and laugh type, a little forward in the mix
   * (dry, near the centre, on the laugh's own envelope), at most once every 3 s.
   */
  feature({ gender, type = 'roar', level = 0.8, pan = 0 } = {}) {
    if (!this.ctx || !this.voices || !gender) return false;
    const t = this.ctx.currentTime, L = this.lastLaugh;
    if (this.lastFeature && t - this.lastFeature < 3) return false;
    if (!L || t > L.end - 0.6) return false; // (no laugh on: nothing to put forward)
    const taken = new Set(this.recent.length ? this.recent[this.recent.length - 1].ids : []);
    const c = this.voiceClip(gender, type, taken) || this.voiceClip(gender, '', taken);
    if (!c) return false;
    this.lastFeature = t;
    const rate = 1 + (Math.random() - 0.5) * 0.06;
    const play = Math.min(c.dur / rate, Math.max(0.8, L.end - t));
    // (+3 dB over the other single voices, against the laugh's gain)
    L.layer(c, t + 0.04, play, 0, (0.8 + 0.35 * level) * 1.4, Math.max(-0.35, Math.min(0.35, pan)), 0.03, Math.min(play * 0.4, 0.5), rate);
    if (this.recent.length) this.recent[this.recent.length - 1].ids.add(c.id);
    this.mixes.push({ kind: 'feature', gender, type, clip: c.id, got: c.type });
    if (this.mixes.length > 20) this.mixes.shift();
    return true;
  }

  /** A shout of one of these kinds, never the clip played last. */
  shoutClip(kinds) {
    const list = this.shouts.map.clips.filter((c) => kinds.includes(c.kind) && c.id !== this.lastShout);
    if (!list.length) return null;
    const c = list[Math.floor(Math.random() * list.length)];
    this.lastShout = c.id;
    return { buf: this.shouts.buf, at: c.start + this.shouts.offset, dur: c.dur, id: c.id };
  }

  /**
   * The room's displeasure, from the engine's drive: a dead bit or a heckle in a tough room (the club, the theatre, the
   * arena; never the open mic) sometimes gets a "boo" or a groan, at most one every 20 s.
   */
  react(what, venue, force = false) {
    if (!this.ctx || !this.shouts || !['club', 'theatre', 'arena'].includes(venue)) return;
    const t = this.ctx.currentTime;
    if (!force && (t - this.lastBoo < 20 || Math.random() > (what === 'heckle' ? 0.5 : 0.35))) return;
    const c = this.shoutClip(what === 'heckle' ? ['boo', 'groan'] : ['groan', 'groan', 'boo']);
    if (!c) return;
    this.lastBoo = t;
    const g = this.ctx.createGain(), src = this.ctx.createBufferSource();
    src.buffer = c.buf;
    g.gain.setValueAtTime(0, t + 0.2); g.gain.setTargetAtTime(0.45 * MIX_GAIN, t + 0.2, 0.05); g.gain.setTargetAtTime(0, t + 0.2 + c.dur * 0.7, 0.15);
    let node = g;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = (Math.random() - 0.5) * 1.2; g.connect(p); node = p; }
    node.connect(this.master);
    src.connect(g);
    src.start(t + 0.2, Math.max(0, c.at), c.dur);
    this.mixes.push({ kind: what, layers: [c.id] });
  }

  duck(on) {
    this.ducked = !!on;
    if (this.ctx) this.duckGain.gain.setTargetAtTime(on ? 0.32 : 1, this.ctx.currentTime, 0.08);
  }

  roomTone(id, gain = 0.32) {
    this.toneWant = id ? { id, gain } : null;
    if (!this.ctx || !this.buf) return;
    if (this.tone) { try { this.tone.src.stop(); } catch (e) { /* already stopped */ } this.tone = null; }
    const S = id && this.seg(id);
    if (!S) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buf;
    src.loop = true;
    src.loopStart = S.start + this.offset + 0.004;
    src.loopEnd = S.start + this.offset + S.dur - 0.004;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.8);
    src.connect(g).connect(this.master);
    src.start(this.ctx.currentTime, src.loopStart);
    this.tone = { src, g, gain };
  }

  /** Per frame: levels = the room's current reaction level by kind (0..1), from the drive or the demo. */
  tick(levels, toneScale = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const c of this.cues) {
      if (t - c.started < 0.35) continue; // the attack plays as cued
      const lv = levels[c.kind] ?? 0;
      if (lv <= 0.01) { if (c.quietSince === null) c.quietSince = t; } else c.quietSince = null;
      const follow = c.quietSince !== null && t - c.quietSince > 0.25 ? 0 : Math.max(0.35, Math.min(1, lv / Math.max(0.2, levels[c.kind + 'Peak'] || lv)));
      c.g.gain.setTargetAtTime(c.base * follow, t, follow === 0 ? 0.6 : 0.15); // (the reaction's end: a soft tail, about 2 s)
    }
    if (this.tone) this.tone.g.gain.setTargetAtTime(this.tone.gain * toneScale, t, 0.5);
  }
}
