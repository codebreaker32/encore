"""Arena spike v1: the Mali-G31 cost model.

Each layer's GPU cost in Mali Offline Compiler cycles (Mali-G31, malioc 8.8, longest path, bound unit):
    vertices x (position-variant cycles + s x varying-variant cycles) + fragments x fragment cycles
(IDVS: every vertex is position-shaded, only those of surviving triangles are varying-shaded; s is that share, 1 for
the camera-facing sprite fans). One constant, cycles per millisecond, is fitted to today's TV frame (APK t, a7-base
74 ms p50) from today's layers counted on the box (refcal.mjs), and checked against the TV's ablations
(res360, noinst, nosprites, nofront, nopost, noimpostor). The floor's cost is its cycles over that constant.

    python3 g31model.py <dir with mali-ref.json mali-spike.json layers.json trace.json frag.jsonl>
"""
import json
import sys

D = sys.argv[1] if len(sys.argv) > 1 else '.'
mr = json.load(open(f'{D}/mali-ref.json'))
ms = json.load(open(f'{D}/mali-spike.json'))
layers = json.load(open(f'{D}/layers.json'))['layers']
trace = json.load(open(f'{D}/trace.json'))
frag = [json.loads(l) for l in open(f'{D}/frag.jsonl') if l.startswith('{')]


def bound(row):
    return max(v for k, v in row.items() if k != 'Bound')


def vs(m, name, s):
    v = m[name]['variants']
    if 'position' in v:
        return bound(v['position']['longest']) + s * bound(v['varying']['longest'])
    return bound(v['main']['longest'])


def fs(m, name):
    return bound(m[name]['variants']['main']['longest'])


TV = {'base': 74, 'res360': 59, 'nosprites': 40, 'noinst': 52, 'nofront': 67, 'nopost': 68, 'noimpostor': 73}
PX = 800 * 450


def today(s):
    """Cycles per layer of today's arena wide (vertex, fragment)."""
    out = {}
    # rows, sprites, impostors: one program each
    out['rows'] = (layers['rows']['verts'] * vs(mr, 'rows-9.vert', s), layers['rows']['fragments'] * fs(mr, 'rows-9.frag'))
    out['sprites'] = (layers['sprites']['verts'] * vs(mr, 'sprites-2.vert', 1.0), layers['sprites']['fragments'] * fs(mr, 'sprites-2.frag'))
    out['impostors'] = (layers['impostors']['verts'] * vs(mr, 'impostors-4.vert', 1.0), layers['impostors']['fragments'] * fs(mr, 'impostors-4.frag'))
    # the front six: their vertices split between programs by triangles drawn; fragments at the body's cost
    fr = {k: v for k, v in trace.items() if k.startswith('front-')}
    tt = sum(v['tris'] for v in fr.values()) or 1
    fv = sum(layers['front']['verts'] * v['tris'] / tt * vs(mr, f'{k}.vert', s) for k, v in fr.items())
    ff = sum(layers['front']['fragments'] * v['tris'] / tt * fs(mr, f'{k}.frag') for k, v in fr.items())
    out['front'] = (fv, ff)
    out['post'] = (3 * vs(mr, 'post-0.vert', 1.0), PX * fs(mr, 'post-0.frag'))
    out['other'] = ((layers['other']['verts'] or 0) * vs(mr, 'other-8.vert', 1.0), (layers['other']['fragments'] or 0) * fs(mr, 'other-8.frag'))
    out['phones'] = (0, (layers['phones']['fragments'] or 0) * fs(mr, 'phones-3.frag'))
    return out


def total(L, fscale=1.0, drop=()):
    return sum(v + f * fscale for k, (v, f) in L.items() if k not in drop)


def floor_cycles(level_verts, level_frags, s, kind='lean'):
    names = {0: f'{kind}-l0', 1: f'{kind}-l0', 2: f'{kind}-l2', 3: f'{kind}-l3'}
    v = sum(level_verts[i] * vs(ms, names[i] + '.vert', s) for i in range(4))
    f = sum(level_frags[i] * fs(ms, names[i] + '.frag') for i in range(4))
    return v, f


print('cycles per unit (Mali-G31, longest path, bound unit; VS = position + s x varying)')
for n in ['rows-9', 'sprites-2', 'front-10', 'post-0', 'impostors-4']:
    v = mr[n + '.vert']['variants']
    print(f"  {n:12s} VS pos {bound(v['position']['longest']) if 'position' in v else bound(v['main']['longest']):6.2f}"
          f"  var {bound(v['varying']['longest']) if 'varying' in v else 0:6.2f}  FS {fs(mr, n + '.frag'):6.2f}")
for n in ['lean-l0', 'lean-l2', 'lean-l3', 'ref-l0']:
    v = ms[n + '.vert']['variants']
    print(f"  {n:12s} VS pos {bound(v['position']['longest']):6.2f}  var {bound(v['varying']['longest']):6.2f}  FS {fs(ms, n + '.frag'):6.2f}")
print()
for s in (0.4, 0.6, 0.8):
    L = today(s)
    k = total(L) / TV['base']  # cycles per ms
    print(f's = {s}: k = {k / 1000:.0f}k cycles/ms;  today per layer (ms): ' + ', '.join(f'{n} {(v + f) / k:.1f}' for n, (v, f) in L.items()))
    checks = {
        'res360': total(L, fscale=(640 * 360) / PX) / k,
        'nosprites': total(L, drop=('sprites',)) / k, 'noinst': total(L, drop=('rows',)) / k, 'nofront': total(L, drop=('front',)) / k,
        'nopost': total(L, drop=('post',)) / k, 'noimpostor': total(L, drop=('impostors',)) / k,
    }
    print('   predicted vs TV p50: ' + ', '.join(f'{n} {p:.0f}/{TV[n]}' for n, p in checks.items()))
    for F in frag:
        lv = F['r']['st']['levels']
        verts = [x['verts'] for x in lv]
        fr = [F['r']['fr'][f'l{i}']['fragments'] for i in range(4)]
        fv, ff = floor_cycles(verts, fr, s)
        fv2, ff2 = floor_cycles(verts, fr, s, 'ref')
        nv = sum(verts)
        print(f"   floor [{F['u']}] {nv / 1000:.1f}k verts, {sum(fr) / 1000:.0f}k frags: lean {(fv + ff) / k:.1f} ms "
              f"(vertex {fv / k:.1f}, fragment {ff / k:.1f}; {1000 * (fv + ff) / k / nv:.3f} us/vertex all-in)  ·  with today's varyings/FS (ref) {(fv2 + ff2) / k:.1f} ms")
    print()
