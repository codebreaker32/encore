// Builds the laughter pool the page layers its reactions from (sound.js, mix mode): windows of seven CC0 crowd
// recordings from freesound.org (credits in sounds/CREDITS.md), each normalised to the same loudness, faded at both
// ends and laid end to end in one MP3, plus a JSON of sample-exact offsets, the source of each clip and how big a
// reaction it is (level 0..1: a titter at 0.25, a roar at 0.85).
//   node tools/build_pool.mjs <dir with the downloaded previews> [dir with the shouts' previews]
//   (needs ffmpeg; writes sounds/crowd-pool.mp3/.json, and with the second dir sounds/crowd-shouts.mp3/.json)
//   node tools/build_pool.mjs --voices <dir with the voices' previews, named <freesound id>.mp3>
//   (writes sounds/crowd-voices.mp3/.json, single people laughing, and sounds/crowd-<venue>.mp3/.json for each venue)
// The previews are the HQ MP3s freesound serves for each sound: https://cdn.freesound.org/previews/<id/1000>/<file>-hq.mp3
// The windows were chosen on the render box for crowd sound with no single voice or music in them (an autocorrelation
// voicing check under 0.25, and a spectral centroid that separates laughter from applause).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..', 'sounds');
const VOICES_DIR = process.argv[2] === '--voices' ? process.argv[3] : null;
const dir = VOICES_DIR ? '-' : process.argv[2];
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

// single people laughing (sound.js voices), real recordings, CC0 or CC BY (credited in sounds/CREDITS.md), licences
// checked on each sound's page on 2026-10-13: [freesound id, start s, duration s, 'voice', level, { gender, type }]
// type: roar (a full, open laugh), giggle (quick, high, light), exhale (a chuckle through the nose or closed lips)
const v = (f, ss, d, gender, type, level) => [f, ss, d, 'voice', level, { gender, type }];
const VOICES = [
  v('611781', 0.25, 0.85, 'f', 'giggle', 0.4), v('635014', 0, 1.1, 'f', 'giggle', 0.45), v('218308', 3.0, 0.95, 'f', 'giggle', 0.4),
  v('335581', 0.2, 1.35, 'f', 'giggle', 0.5), v('504737', 10.15, 1.65, 'f', 'giggle', 0.5), v('504737', 30.35, 1.35, 'f', 'giggle', 0.45),
  v('556251', 0.35, 3.2, 'f', 'roar', 0.8), v('556250', 0.2, 3.0, 'f', 'roar', 0.75), v('468514', 0.3, 2.0, 'f', 'roar', 0.7),
  v('433921', 0.2, 1.9, 'f', 'roar', 0.7), v('382998', 0.15, 3.5, 'f', 'roar', 0.75), v('852284', 2.85, 3.5, 'f', 'roar', 0.8),
  v('377742', 0.8, 0.95, 'f', 'exhale', 0.25), v('865415', 0, 1.8, 'f', 'exhale', 0.3), v('687349', 4.7, 1.2, 'f', 'exhale', 0.3), v('687349', 18.45, 1.35, 'f', 'exhale', 0.3),
  v('438805', 1.9, 3.5, 'm', 'roar', 0.85), v('481735', 0.55, 3.1, 'm', 'roar', 0.8), v('720133', 0, 2.65, 'm', 'roar', 0.7),
  v('119459', 0.05, 3.5, 'm', 'roar', 0.75), v('859265', 11.3, 2.8, 'm', 'roar', 0.75), v('810179', 0.2, 3.4, 'm', 'roar', 0.8),
  v('643665', 0.05, 1.1, 'm', 'giggle', 0.4), v('643665', 4.25, 1.1, 'm', 'giggle', 0.4), v('536811', 0, 1.45, 'm', 'giggle', 0.5),
  v('418368', 10.1, 1.05, 'm', 'giggle', 0.4), v('418368', 16.05, 0.8, 'm', 'giggle', 0.35),
  v('823548', 2.95, 1.5, 'm', 'exhale', 0.3), v('458101', 0.05, 0.9, 'm', 'exhale', 0.3), v('790713', 1.85, 1.1, 'm', 'exhale', 0.25),
  v('790713', 5.8, 1.55, 'm', 'exhale', 0.3), v('418368', 0.7, 0.6, 'm', 'exhale', 0.25),
];
// each venue's own sounds (the page loads its venue's only): the club's table thumps, the theatre's polite chuckles and
// its applause, the arena's roar and whistles, the open mic's sparse room
const VENUE_SOUNDS = {
  club: [['507939', 0.86, 0.6, 'thump'], ['507940', 0.8, 0.6, 'thump'], ['548622', 2.25, 0.55, 'thump'], ['548622', 5.89, 0.55, 'thump'],
    ['548622', 10.14, 0.55, 'thump'], ['548622', 13.47, 0.55, 'thump'], ['151897', 1.43, 0.55, 'thump'], ['151897', 5.31, 0.55, 'thump']],
  theatre: [['438401', 3.0, 4.0, 'ripple', 0.5], ['438401', 10.0, 4.0, 'ripple', 0.55], ['438401', 28.0, 4.0, 'ripple', 0.5], ['438401', 38.8, 3.4, 'ripple', 0.45],
    ['678668', 0, 1.2, 'ripple', 0.25], ['678669', 0, 2.0, 'ripple', 0.3], ['678670', 0, 2.05, 'ripple', 0.3], ['242244', 0, 1.8, 'ripple', 0.35],
    ['807725', 5, 4.0, 'applause', 0.6], ['807725', 40, 4.0, 'applause', 0.65]],
  arena: [['397434', 0, 5.0, 'roar', 0.9], ['397434', 9, 5.0, 'roar', 0.9], ['397435', 2, 5.0, 'roar', 0.9], ['645337', 12, 5.0, 'roar', 0.85], ['645337', 32, 5.0, 'roar', 0.85],
    ['764029', 1.0, 3.5, 'whistle'], ['764029', 6.0, 3.5, 'whistle']],
  openmic: [['763965', 0, 5.25, 'sparse', 0.3]],
};
const decode = (file, ss, t) => {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-t', String(t), '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
};
function sprite(list, srcDir, name, srcOf, rms = RMS_DB) {
  const parts = [], clips = [];
  let at = Math.round(LEAD * RATE);
  parts.push(new Float32Array(at));
  list.forEach(([f, ss, d, kind, level, extra], i) => {
    const x = decode(path.join(srcDir, `${f}.mp3`), ss, Math.min(d, MAX));
    let e = 0, pk = 0;
    for (const v of x) { e += v * v; pk = Math.max(pk, Math.abs(v)); }
    const g = Math.min(10 ** (rms / 20) / Math.sqrt(e / x.length), 10 ** (PEAK_DB / 20) / pk);
    const fin = Math.round(0.015 * RATE), fout = Math.round(Math.min(0.3, x.length / RATE / 4) * RATE);
    for (let k = 0; k < x.length; k++) x[k] *= g * Math.min(1, k / fin, (x.length - 1 - k) / fout);
    clips.push({ id: `${kind}-${i}`, src: srcOf(f), kind, ...(level !== undefined && level !== null ? { level } : {}), ...(extra || {}), start: at / RATE, dur: x.length / RATE, startSample: at, samples: x.length });
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
if (!VOICES_DIR && process.argv[3]) sprite(SHOUTS, process.argv[3], 'crowd-shouts', (f) => `freesound-${f}`, -20);
if (VOICES_DIR) {
  sprite(VOICES, VOICES_DIR, 'crowd-voices', (f) => `freesound-${f}`, -20);
  for (const [venue, list] of Object.entries(VENUE_SOUNDS)) sprite(list, VOICES_DIR, `crowd-${venue}`, (f) => `freesound-${f}`, -21);
}
