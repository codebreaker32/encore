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
// the mixes' level over the room tone (the emulator test: club laughs were a median +2 dB over the tone; with this
// and the quieter club tone a laugh at 0.6 peaks about +10 dB over it, a roar at 0.9 about +13 dB, a titter +7 dB)
const MIX_GAIN = 1.7;
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
        this.ctx = new AC({ latencyHint: 'playback' });
        this.master = this.ctx.createGain();
        this.duckGain = this.ctx.createGain();
        // gentle compression at the end: four loud layers of a roar must not clip
        const lim = this.ctx.createDynamicsCompressor();
        lim.threshold.value = -16; lim.knee.value = 12; lim.ratio.value = 2.5; lim.attack.value = 0.03; lim.release.value = 0.35; // (gentle: a brick wall pumped on big laughs)
        this.master.connect(this.duckGain).connect(lim).connect(this.ctx.destination);
        // the room: a short generated reverb on everything the crowd makes, mixed low (small for the club and the open
        // mic, bigger for the theatre, big for the arena); one ConvolverNode, about 0.4-1.6 s of impulse
        if (!/(^|,)noverb(,|$)/.test(new URLSearchParams(location.search).get('ab') || '')) try { // (&ab=noverb prices it on the TV)
          const venue = new URLSearchParams(location.search).get('venue') || 'club';
          const [T, wet] = { club: [0.5, 0.13], openmic: [0.4, 0.11], theatre: [1.1, 0.18], arena: [1.6, 0.22] }[venue] || [0.5, 0.13];
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
        const bytes = await this.data;
        if (!bytes) return this.state('unavailable');
        this.buf = await this.ctx.decodeAudioData(bytes.slice(0));
        this.offset = CrowdSound.delay(this.buf, this.map);
        if (this.toneWant !== null) this.roomTone(this.toneWant.id, this.toneWant.gain);
        // the pool decodes after the sprite (a mix falls back to the single clip until it is ready)
        this.poolData.then(async (p) => {
          if (!p) return;
          const buf = await this.ctx.decodeAudioData(p.b.slice(0));
          this.pool = { map: p.m, buf, offset: CrowdSound.delay(buf, p.m) };
          const q = await this.shoutData;
          if (q) { const sb = await this.ctx.decodeAudioData(q.b.slice(0)); this.shouts = { map: q.m, buf: sb, offset: CrowdSound.delay(sb, q.m) }; }
        }).catch(() => {});
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (e) { /* stays silent */ }
    this.state(this.ctx ? this.ctx.state : 'unavailable');
  }

  state(s) { if (s !== this.lastState) { this.lastState = s; this.report({ type: 'audio', state: s }); } }

  seg(id) { return this.map && this.map.segments[id]; }

  cue(id, strength = 0.7) {
    this.unlock();
    const S = this.seg(id);
    if (!S || !this.buf || !this.ctx) return;
    if (this.mix && this.pool && ['laugh', 'applause', 'cheer'].includes(KIND[id])) return this.cueMix(KIND[id], strength);
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

  /** A laugh, applause or cheer as a fresh mix (see the header). */
  cueMix(kind, strength) {
    const ctx = this.ctx, t = ctx.currentTime, s = Math.max(0, Math.min(1, strength));
    const cand = this.candidates(kind);
    const n = Math.min(cand.length, s < 0.4 ? 2 : s < 0.75 ? 3 : 4);
    let pick = [], sig = '';
    for (let tries = 0; tries < 8; tries++) {
      pick = this.choose(cand, n, s);
      sig = pick.map((c) => c.id).sort().join('|');
      if (sig !== this.lastSig) break;
    }
    this.lastSig = sig;
    const D = 1.8 + 4.2 * s; // how long the reaction runs (s): about 3 s for a titter, 5.6 s for a roar
    const spread = 0.15 + 0.65 * s;
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
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; lg.connect(p).connect(g); } else lg.connect(g);
      src.start(at, Math.max(0, c.at + off), play * rate + 0.05);
      src.stop(at + play + 0.05);
      live++;
      src.onended = () => { if (--live === 0) { this.cues = this.cues.filter((x) => x !== cue); g.disconnect(); } };
      cue.srcs.push(src);
      cue.end = Math.max(cue.end, at + play);
    };
    pick.forEach((c, i) => {
      // pitch barely moves (±1.5%: more read as machine-y); the variety comes from the clip, its offset and its gain
      const rate = 1 + (Math.random() - 0.5) * 0.03;
      const len = i === 0 ? D : D * (0.5 + Math.random() * 0.45); // the layers drop out one by one
      const off = c.dur > len * rate ? Math.random() * (c.dur - len * rate) : 0;
      const play = Math.min(len, (c.dur - off) / rate);
      // a few voices first, the rest joining over 150-400 ms (later for a titter, sooner for a roar)
      const at = t + (i === 0 ? 0 : 0.15 + Math.random() * (0.1 + 0.15 * (1 - s)) + i * 0.04);
      const amp = ((i === 0 ? 1 : 0.5 + Math.random() * 0.35) * 1.25) / Math.sqrt(pick.length);
      const pan = i === 0 ? (Math.random() - 0.5) * 0.2 : (i % 2 ? 1 : -1) * spread * (0.55 + 0.45 * Math.random());
      layer(c, at, play, off, amp, pan, i === 0 ? 0.08 + 0.06 * (1 - s) : 0.15 + Math.random() * 0.15, Math.min(play * 0.6, 0.8 + Math.random() * 1.2), rate);
    });
    // people, not a texture: now and then one laugh rises out of the crowd (a small group's recording, short, off to
    // one side), and in a big laugh a few claps or a whoop
    if ((kind === 'laugh' || kind === 'cheer') && Math.random() < 0.25 + 0.3 * s) {
      const solo = cand.filter((c) => c.level <= 0.45);
      if (solo.length) {
        const c = solo[Math.floor(Math.random() * solo.length)], play = Math.min(c.dur, 1.1 + Math.random() * 0.9);
        layer(c, t + 0.3 + Math.random() * 0.9, play, Math.random() * Math.max(0, c.dur - play), 0.75 / Math.sqrt(pick.length), (Math.random() < 0.5 ? -1 : 1) * (0.45 + 0.35 * Math.random()), 0.06, Math.min(play * 0.6, 0.7), 1 + (Math.random() - 0.5) * 0.02);
      }
    }
    if (kind === 'laugh' && s > 0.65 && Math.random() < 0.35) {
      const extra = this.candidates(Math.random() < 0.6 ? 'applause' : 'cheer').filter((c) => c.dur > 1);
      if (extra.length) {
        const c = extra[Math.floor(Math.random() * extra.length)], play = 0.7 + Math.random() * 0.5;
        layer(c, t + 0.6 + Math.random() * 1.2, play, Math.random() * Math.max(0, c.dur - play), 0.35 / Math.sqrt(pick.length), (Math.random() - 0.5) * 1.2, 0.05, 0.45, 1);
      }
    }
    // voices in the crowd: a big laugh or a cheer sometimes gets one or two shouts ("woo!", "yeah!", "nice one!", a
    // whistle), each placed somewhere in the room (pan, distance as gain, the venue's reverb), never the same clip twice
    // running; they ride this reaction's envelope like its layers
    const shouted = [];
    if (this.shouts && s >= 0.6 && Math.random() < 0.15 + 0.85 * (s - 0.6)) {
      const kinds = kind === 'laugh' ? ['woo', 'yes', 'nice', 'whistle'] : ['woo', 'yes', 'whistle'];
      const n = s > 0.85 && Math.random() < 0.4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const c = this.shoutClip(kinds);
        if (!c) break;
        shouted.push(c.id);
        const near = Math.random();
        layer(c, t + 0.4 + Math.random() * 1.6 + k * 0.7, c.dur, 0, (0.35 + 0.5 * near) / Math.sqrt(pick.length), (Math.random() - 0.5) * 1.4, 0.03, Math.min(c.dur * 0.4, 0.4), 1 + (Math.random() - 0.5) * 0.02);
      }
    }
    this.cues.push(cue);
    this.mixes.push({ kind, s: +s.toFixed(2), layers: pick.map((c) => c.id), sig, ...(shouted.length ? { shouts: shouted } : {}) });
    if (this.mixes.length > 20) this.mixes.shift();
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
