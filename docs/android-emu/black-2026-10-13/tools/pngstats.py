import sys, glob, os, subprocess
import numpy as np
W, H = 320, 180
print('file yavg dark<20 p50 p90 bandR bandRstd nb')
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.png'))):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'scale={W}:{H}:out_range=full,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    if len(raw) < W*H: continue
    a = np.frombuffer(raw, np.uint8).reshape(H, W).astype(float)
    bw = int(W * .08); rb = a[:int(H*.78), W-bw:]; nb = a[:int(H*.78), W-2*bw:W-bw]
    print(f'{os.path.basename(f)} {a.mean():.1f} {(a<20).mean():.2f} {np.percentile(a,50):.0f} {np.percentile(a,90):.0f} {rb.mean():.1f} {rb.std():.1f} {nb.mean():.1f}')
