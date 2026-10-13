# darkest.py SCANDIR FROM_EPOCH TO_EPOCH : the darkest stretches (1 s means) within a window, and the yavg spread
import sys, csv, datetime
rows = [r for r in csv.DictReader(open(sys.argv[1] + '/frames.csv')) if float(sys.argv[2]) <= float(r['t']) <= float(sys.argv[3])]
y = [float(r['yavg']) for r in rows]; d = [float(r['dark']) for r in rows]
s = sorted(y)
print(f'n {len(y)}  yavg min {s[0]:.1f} p1 {s[len(s)//100]:.1f} p10 {s[len(s)//10]:.1f} p50 {s[len(s)//2]:.1f}  dark max {max(d):.2f}')
w = 30; best = []
for i in range(0, len(y) - w, 15):
    best.append((sum(y[i:i+w]) / w, rows[i]['t'], rows[i]['i']))
for m, t, i in sorted(best)[:6]:
    print(f'  1s mean {m:.1f} at {datetime.datetime.utcfromtimestamp(float(t)).strftime("%H:%M:%S.%f")[:-3]} frame {i}')
