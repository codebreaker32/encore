// Builds the laughter pool the page layers its reactions from (sound.js, mix mode): windows of seven CC0 crowd
// recordings from freesound.org (credits in sounds/CREDITS.md), each normalised to the same loudness, faded at both
// ends and laid end to end in one MP3, plus a JSON of sample-exact offsets, the source of each clip and how big a
// reaction it is (level 0..1: a titter at 0.25, a roar at 0.85).
//   node tools/build_pool.mjs <dir with the downloaded previews> [dir with the shouts' previews]
//   (needs ffmpeg; writes sounds/crowd-pool.mp3/.json, and with the second dir sounds/crowd-shouts.mp3/.json)
// The previews are the HQ MP3s freesound serves for each sound: https://cdn.freesound.org/previews/<id/1000>/<file>-hq.mp3
// The windows were chosen on the render box for crowd sound with no single voice or music in them (an autocorrelation
// voicing check under 0.25, and a spectral centroid that separates laughter from applause).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..', 'sounds');
const dir = process.argv[2];
if (!dir) throw new Error('usage: node tools/build_pool.mjs <dir with the previews>');
const RATE = 44100, LEAD = 0.25, GAP = 0.3, MAX = 6.5, RMS_DB = -21, PEAK_DB = -1; // (44.1 kHz at 96 kbps: 24 kHz at 40 kbps had codec artefacts)
// [source file, start s, duration s, kind, level]
const CLIPS = [
  ['17121_57789', 0, 3.4, 'laugh', 0.25], // cognito perceptu, small audience laughter
  ['507983_7137750', 0, 6.4, 'laugh', 0.35], // ChrisReierson, misc audience laughter noises
  ['383207_2247456', 0.3, 5.8, 'laugh', 0.4], // Kinoton, sitcom laughter, small audience
  ['383207_2247456', 15.25, 3.0, 'laugh', 0.3],
  ['383207_2247456', 30.2, 3.8, 'laugh', 0.35],
  ['581528_1654262', 0, 6.5, 'laugh', 0.55], // HowardV, live audience comedy show, genuine laughter (moderate)
  ['581528_1654262', 8, 6.5, 'laugh', 0.6],
  ['438402_2524442', 5.15, 6.5, 'laugh', 0.7], // craigsmith, radio show audience laughter (mic)
  ['438402_2524442', 12.65, 6.5, 'laugh', 0.75],
  ['438402_2524442', 137.0, 6.5, 'laugh', 0.65],
  ['438402_2524442', 192.1, 5.3, 'laugh', 0.6],
  ['245123_1038806', 162.7, 6.5, 'laugh', 0.85], // unfa, laugh (applause) track material
  ['245123_1038806', 191.5, 5.7, 'laugh', 0.8],
  ['245123_1038806', 346.75, 4.8, 'laugh', 0.8],
  ['347547_5662401', 0.35, 6.5, 'applause', 0.7], // Masgame, applause
];
const SRC = { '17121_57789': 'freesound-17121', '507983_7137750': 'freesound-507983', '383207_2247456': 'freesound-383207', '581528_1654262': 'freesound-581528', '438402_2524442': 'freesound-438402', '245123_1038806': 'freesound-245123', '347547_5662401': 'freesound-347547' };

// the crowd's shouts (sound.js shouts): single voices and small groups, real recordings, CC0 or CC BY (credited in
// sounds/CREDITS.md): [file, start s, duration s, kind]
const SHOUTS = [
  ['333421', 0, 3.4, 'woo'], ['84525', 47.3, 3.0, 'woo'], ['340364', 0, 0.76, 'woo'], ['539216', 0, 0.95, 'woo'],
  ['416843', 0, 0.56, 'yes'], ['340363', 0, 1.65, 'yes'], ['99636', 0, 1.62, 'yes'], ['715792', 0, 1.54, 'yes'], ['521965', 0, 0.8, 'yes'],
  ['46189', 0.3, 1.33, 'nice'],
  ['763915', 2.0, 2.6, 'whistle'], ['763915', 7.5, 2.6, 'whistle'],
  ['752707', 0, 2.28, 'boo'], ['264378', 0, 4.0, 'boo'], ['264378', 8, 4.0, 'boo'],
  ['124996', 0, 2.0, 'groan'], ['547589', 0, 1.2, 'groan'],
];
const decode = (file, ss, t) => {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-t', String(t), '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
};
function sprite(list, srcDir, name, srcOf, rms = RMS_DB) {
  const parts = [], clips = [];
  let at = Math.round(LEAD * RATE);
  parts.push(new Float32Array(at));
  list.forEach(([f, ss, d, kind, level], i) => {
    const x = decode(path.join(srcDir, `${f}.mp3`), ss, Math.min(d, MAX));
    let e = 0, pk = 0;
    for (const v of x) { e += v * v; pk = Math.max(pk, Math.abs(v)); }
    const g = Math.min(10 ** (rms / 20) / Math.sqrt(e / x.length), 10 ** (PEAK_DB / 20) / pk);
    const fin = Math.round(0.015 * RATE), fout = Math.round(Math.min(0.3, x.length / RATE / 4) * RATE);
    for (let k = 0; k < x.length; k++) x[k] *= g * Math.min(1, k / fin, (x.length - 1 - k) / fout);
    clips.push({ id: `${kind}-${i}`, src: srcOf(f), kind, ...(level !== undefined ? { level } : {}), start: at / RATE, dur: x.length / RATE, startSample: at, samples: x.length });
    parts.push(x);
    at += x.length;
    const gap = Math.round(GAP * RATE);
    parts.push(new Float32Array(gap));
    at += gap;
  });
  const all = new Int16Array(at);
  let o = 0;
  for (const p of parts) { for (let k = 0; k < p.length; k++) all[o + k] = Math.max(-32767, Math.min(32767, Math.round(p[k] * 32767))); o += p.length; }
  let first = 0;
  while (first < all.length && Math.abs(all[first]) < 650) first++; // ≈ -34 dBFS
  const wav = Buffer.alloc(44 + all.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + all.length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(all.length * 2, 40);
  Buffer.from(all.buffer).copy(wav, 44);
  const tmp = path.join(out, `.${name}.wav`);
  fs.writeFileSync(tmp, wav);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '96k', '-ar', String(RATE), '-ac', '1', path.join(out, `${name}.mp3`)]);
  fs.unlinkSync(tmp);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ file: `${name}.mp3`, sampleRate: RATE, totalSec: all.length / RATE, firstAudibleSample: first, clips }, null, 1));
  console.log(`${name} ${(all.length / RATE).toFixed(1)} s, ${clips.length} clips, ${(fs.statSync(path.join(out, `${name}.mp3`)).size / 1024).toFixed(0)} KB`);
}
if (dir !== '-') sprite(CLIPS, dir, 'crowd-pool', (f) => SRC[f]); // ('-': only the shouts)
if (process.argv[3]) sprite(SHOUTS, process.argv[3], 'crowd-shouts', (f) => `freesound-${f}`, -20);
