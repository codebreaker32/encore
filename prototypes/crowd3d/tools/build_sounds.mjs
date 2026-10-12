// Builds the crowd-sound sprite the page plays through WebAudio: every clip in packages/shared-ui/src/assets/sounds
// decoded and laid end to end (with short silences between) into one MP3, plus a JSON of sample-exact offsets.
//   node tools/build_sounds.mjs            (needs ffmpeg on PATH; writes sounds/crowd-sprite.mp3 and .json)
// Mono at 24 kHz keeps the decoded buffer near 5 MB on a 1.4 GB TV. The JSON also carries the first audible sample of
// the sprite, so the page can measure and remove any decoder delay before it trusts the offsets (loops need that).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const src = path.resolve(root, '../../packages/shared-ui/src/assets/sounds');
const out = path.join(root, 'sounds');
const RATE = 24000, LEAD = 0.25, GAP = 0.35;
const CLIPS = [ // id, loop
  ['laugh-small', false], ['laugh-medium', false], ['laugh-big', false], ['applause-small', false], ['applause-big', false],
  ['cheer-big', false], ['snaps', false], ['murmur', true], ['room-tone-club', true],
];

fs.mkdirSync(out, { recursive: true });
const decode = (file) => {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  return new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
};
const parts = [], segments = {};
let at = Math.round(LEAD * RATE);
parts.push(new Int16Array(at));
for (const [id, loop] of CLIPS) {
  const pcm = decode(path.join(src, `${id}.mp3`));
  segments[id] = { start: at / RATE, dur: pcm.length / RATE, loop, startSample: at, samples: pcm.length };
  parts.push(pcm);
  at += pcm.length;
  const gap = Math.round(GAP * RATE);
  parts.push(new Int16Array(gap));
  at += gap;
}
const all = new Int16Array(at);
let o = 0;
for (const p of parts) { all.set(p, o); o += p.length; }
let first = 0;
while (first < all.length && Math.abs(all[first]) < 650) first++; // ≈ -34 dBFS
// a WAV in memory, then MP3 64 kbps mono
const wav = Buffer.alloc(44 + all.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + all.length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(all.length * 2, 40);
Buffer.from(all.buffer).copy(wav, 44);
const tmp = path.join(out, '.sprite.wav');
fs.writeFileSync(tmp, wav);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ar', String(RATE), '-ac', '1', path.join(out, 'crowd-sprite.mp3')]);
fs.unlinkSync(tmp);
const json = { file: 'crowd-sprite.mp3', sampleRate: RATE, totalSec: all.length / RATE, firstAudibleSample: first, segments };
fs.writeFileSync(path.join(out, 'crowd-sprite.json'), JSON.stringify(json, null, 1));
console.log(`sprite ${(all.length / RATE).toFixed(2)} s, ${(fs.statSync(path.join(out, 'crowd-sprite.mp3')).size / 1024).toFixed(0)} KB`);
for (const [id, s] of Object.entries(segments)) console.log(id.padEnd(16), s.start.toFixed(3), s.dur.toFixed(3), s.loop ? 'loop' : '');
