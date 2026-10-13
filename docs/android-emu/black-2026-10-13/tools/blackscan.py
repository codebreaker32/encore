#!/usr/bin/env python3
"""Scan a recording (or a folder of PNGs) for black / near-black / mostly-black frames and a flat right-edge band.
usage: blackscan.py VIDEO.mkv OUTDIR [--t0 EPOCH] [--region full|stage]
Frames are decoded at 320x180, full-range luma. Per frame:
  yavg      mean luma (0-255)
  dark      fraction of pixels with luma < 20
  sdark     the same over the stage area (left 61%: the bill's running order is a house-black column on the right)
  band      the right 8% columns: mean, std; and the 8% band left of it: mean
Flags: black (yavg < 12), mostly (dark > 0.85), sbl (sdark > 0.90 and stage mean < 14), bandflat (right band std < 2.5
and its mean < 0.6 * the neighbour band mean, neighbour mean > 12).
Writes frames.csv, intervals.txt (runs of >= 2 flagged frames), and a jpg at the middle of each interval."""
import subprocess, sys, os, json, warnings
warnings.filterwarnings("ignore")
import numpy as np
W, H = 320, 180
vid, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
args = sys.argv[3:]
t0 = None
if '--t0' in args: t0 = float(args[args.index('--t0') + 1])
# frame timestamps
pts = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', vid],
                     capture_output=True, text=True).stdout.split()
pts = [float(x.strip(',')) for x in pts if x.strip(',') and x.strip(',') != 'N/A']
start = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=start_time', '-of', 'csv=p=0', vid], capture_output=True, text=True).stdout.strip().strip(',') or 0)
if t0 is None: t0 = start if start > 1e9 else 0.0
p = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', vid, '-vf', f'scale={W}:{H}:out_range=full,format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
rows = []
i = 0
bw = int(W * 0.08)
sw = int(W * 0.61)
while True:
    buf = p.stdout.read(W * H)
    if len(buf) < W * H: break
    a = np.frombuffer(buf, np.uint8).reshape(H, W).astype(np.float32)
    t = (pts[i] - start if i < len(pts) else i / 30.0) + t0
    yavg = a.mean(); dark = (a < 20).mean()
    st = a[:, :sw]; sdark = (st < 20).mean(); smean = st.mean()
    rb = a[:int(H * 0.78), W - bw:]; nb = a[:int(H * 0.78), W - 2 * bw:W - bw]  # above the lower third
    rows.append((i, t, yavg, dark, sdark, smean, rb.mean(), rb.std(), nb.mean(), rb.mean(axis=0).std()))
    i += 1
p.wait()
fl = []
with open(os.path.join(out, 'frames.csv'), 'w') as f:
    f.write('i,t,yavg,dark,sdark,smean,band,bandstd,nbmean,bandcolstd,flags\n')
    for r in rows:
        i, t, yavg, dark, sdark, smean, bm, bs, nm, bcs = r
        flags = []
        if yavg < 12: flags.append('black')
        if dark > 0.85: flags.append('mostly')
        if sdark > 0.90 and smean < 14: flags.append('sbl')
        if bs < 2.5 and nm > 12 and bm < 0.6 * nm: flags.append('bandflat')
        fl.append(flags)
        f.write(f'{i},{t:.3f},{yavg:.1f},{dark:.3f},{sdark:.3f},{smean:.1f},{bm:.1f},{bs:.2f},{nm:.1f},{bcs:.2f},{"|".join(flags)}\n')
def runs(name):
    out_r, s = [], None
    for k, flags in enumerate(fl + [[]]):
        on = name in flags
        if on and s is None: s = k
        if not on and s is not None:
            if k - s >= 2: out_r.append((s, k - 1))
            s = None
    return out_r
import datetime
def hms(t):
    return datetime.datetime.utcfromtimestamp(t).strftime('%H:%M:%S.%f')[:-3] if t > 1e9 else f'{t:.2f}s'
summary = {}
with open(os.path.join(out, 'intervals.txt'), 'w') as f:
    for name in ['black', 'mostly', 'sbl', 'bandflat']:
        rr = runs(name)
        summary[name] = len(rr)
        for (a, b) in rr:
            ta, tb = rows[a][1], rows[b][1]
            mid = (a + b) // 2
            jpg = os.path.join(out, f'{name}-{a:06d}.jpg')
            if name != 'bandflat' or len(rr) < 40:
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', vid, '-vf', f'select=eq(n\\,{mid}),scale=640:360', '-frames:v', '1', jpg])
            ymin = min(rows[k][2] for k in range(a, b + 1))
            f.write(f'{name}\t{hms(ta)}\t{hms(tb)}\t{tb - ta + 1/30:.2f}s\tframes {a}-{b}\tyavg_min {ymin:.1f}\t{os.path.basename(jpg)}\n')
n = len(rows)
summary['frames'] = n
summary['band_frames'] = sum(1 for x in fl if 'bandflat' in x)
summary['t_first'] = hms(rows[0][1]) if rows else None
print(json.dumps(summary))
print(open(os.path.join(out, 'intervals.txt')).read())
