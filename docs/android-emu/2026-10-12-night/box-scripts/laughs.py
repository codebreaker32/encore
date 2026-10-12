"""Do the room's laughs sound different each time? Compare the audio after each crowd cue in a recording.

usage: python laughs.py REC.mkv CUES.txt [WINDOW_S] [SKIP_LABEL_SUBSTRING]
CUES.txt: lines "<seconds into the recording> <label> <clock>" (cues.py output, which already adds +1.2 s; this script
subtracts it back and starts each window 0.3 s after the cue).
For every pair of windows: the peak normalized cross-correlation of the waveforms (lags within +-250 ms) and the
correlation of their 20 ms loudness envelopes. Replaying the same clip scores near 1.0 on both; fresh mixes score low.
"""
import itertools
import subprocess
import sys

import numpy as np

rec, cues = sys.argv[1], sys.argv[2]
win = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
skip = sys.argv[4] if len(sys.argv) > 4 else None
SR = 16000
pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", rec, "-vn", "-ac", "1", "-ar", str(SR),
                      "-f", "s16le", "-"], check=True, capture_output=True).stdout
audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
segs, names = [], []
for line in open(cues):
    t, label, clock = line.split()[:3]
    if skip and skip in label:
        continue
    start = float(t) - 1.2 + 0.3
    a = audio[int(start * SR): int((start + win) * SR)]
    if len(a) < win * SR * 0.9:
        continue
    segs.append(a - a.mean())
    names.append(clock)


def env(x: np.ndarray) -> np.ndarray:
    n = int(0.02 * SR)
    k = len(x) // n
    return np.sqrt((x[: k * n].reshape(k, n) ** 2).mean(axis=1))


def xcorr_peak(a: np.ndarray, b: np.ndarray, max_lag: int) -> float:
    n = 1 << (len(a) + len(b)).bit_length()
    c = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)
    c = np.concatenate([c[-max_lag:], c[: max_lag + 1]])
    return float(np.max(np.abs(c)) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


rms = [float(20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9)) for s in segs]
print(f"{len(segs)} windows of {win:.1f} s; level (dBFS) per window: " + " ".join(f"{r:.0f}" for r in rms))
wav, envs = [], []
for i, j in itertools.combinations(range(len(segs)), 2):
    wav.append(xcorr_peak(segs[i], segs[j], int(0.25 * SR)))
    ei, ej = env(segs[i]), env(segs[j])
    envs.append(float(np.corrcoef(ei, ej)[0, 1]))
wav, envs = np.array(wav), np.array(envs)
print(f"pairs: {len(wav)}")
print(f"waveform peak cross-correlation: median {np.median(wav):.3f}, max {wav.max():.3f}, pairs over 0.5: {(wav > 0.5).sum()}")
print(f"envelope correlation: median {np.median(envs):.3f}, max {envs.max():.3f}, pairs over 0.8: {(envs > 0.8).sum()}")
best = int(np.argmax(wav))
pairs = list(itertools.combinations(range(len(segs)), 2))
i, j = pairs[best]
print(f"most similar pair: {names[i]} and {names[j]} (waveform {wav[best]:.3f}, envelope {envs[best]:.3f})")
