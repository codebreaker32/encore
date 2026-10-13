# bandstat.py SETDIR : during the live set (ENTER .. phone finished/end), the right 8% band vs the 8% to its left
import sys, csv, datetime, statistics as st
d = sys.argv[1]
tl = open(d + '/timeline.txt').read().splitlines()
day = datetime.date.today().isoformat()
def ep(line): return datetime.datetime.fromisoformat(day + 'T' + line[:12]).replace(tzinfo=datetime.timezone.utc).timestamp()
a = [ep(l) for l in tl if 'key ENTER' in l][0] + 8
b = [ep(l) for l in tl if 'finished' in l or 'end the set' in l][0]
rows = [r for r in csv.DictReader(open(d + '/scan/frames.csv')) if a <= float(r['t']) <= b]
band = [float(r['band']) for r in rows]; nb = [float(r['nbmean']) for r in rows]; bs = [float(r['bandcolstd']) for r in rows]
ratio = [x / y for x, y in zip(band, nb) if y > 3]
print(f"{d.split('/')[-1]}: live frames {len(rows)}; right band mean {st.median(band):.1f}, neighbour {st.median(nb):.1f}, median ratio {st.median(ratio):.2f}, p10 {sorted(ratio)[len(ratio)//10]:.2f}; frames with ratio<0.5: {sum(1 for r in ratio if r < 0.5)/len(ratio):.0%}")
