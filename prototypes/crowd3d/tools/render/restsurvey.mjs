// restsurvey: node restsurvey.mjs <page> <venue> <extra> [seconds=60]
// steps listening (no laughs) at 0.5 s and reports, for the front people, how often row neighbours (adjacent by x,
// same row, within 1.3 m) show the same rest kind at the same moment (_restKind as displayed, a fall back counted as thighs)
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, venue, extra = '', secArg = '60'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(`${base}?venue=${venue}&host=1&preset=tv&capture=1&hud=0&debug=1&venue-lock=1${extra}`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people && window.encoreMessage && window.__cutTo, null, { timeout: 240000 });
  const sched = {}, fb1 = {}, bel = new Set(); let pairs = 0, same = 0, sameExact = 0, kinds = {}, changes = 0, n = 0; const prevK = new Map(); const per = {};
  for (let t = 0; t <= +secArg; t += 0.5) {
    const r = await page.evaluate((t) => {
      window.encoreMessage({ type: 'drive', drive: { attention: 0.8, warmth: 0.6, reactions: [] } }); window.__cutTo(-1); window.__renderAt(t);
      return window.__people.filter((p) => p.kind === 'front' && !p.hidden && p.rig && p._resting).map((p) => ({ n: p.name, row: p.o.row, x: p.o.x, k: p._fb1 ? (p.o.table && p.o.neighbour ? 'tableBoth' : 'thighs') : p._restKind, sig: '', sk: p._rso ? p._rso.kind : '', fb1: !!p._fb1, belly: !!(p.rig.fit && p.rig.fit.front && (p.rig.fit.front.spine || p.rig.fit.front.pelvis || 0) > 0.155) }));
    }, t);
    const rows = {};
    for (const p of r) (rows[p.row] ||= []).push(p);
    for (const L of Object.values(rows)) { L.sort((a, b) => a.x - b.x); for (let i = 1; i < L.length; i++) if (Math.abs(L[i].x - L[i - 1].x) < 1.3) { pairs++; if (L[i].k === L[i - 1].k) { same++; if (L[i].sig === L[i - 1].sig) sameExact++; } } }
    for (const p of r) { sched[p.sk] = (sched[p.sk] || 0) + 1; if (p.fb1) fb1[p.sk] = (fb1[p.sk] || 0) + 1; if (p.belly) bel.add(p.n); kinds[p.k] = (kinds[p.k] || 0) + 1; n++; const pk = prevK.get(p.n); if (pk !== undefined && pk !== p.k + p.sig) changes++; prevK.set(p.n, p.k + p.sig); (per[p.n] ||= new Set()).add(p.k + (p.sig ? '/' + p.sig : '')); }
  }
  console.log(JSON.stringify({ venue, extra, pairs, sameKind: same, sameFrac: +(same / Math.max(1, pairs)).toFixed(3), sameExact, kinds, sched, fb1, belly: bel.size, people: prevK.size, changesPerPersonMin: +(changes / Math.max(1, prevK.size) / (+secArg / 60)).toFixed(2), variantsPerPerson: +(Object.values(per).reduce((a, s) => a + s.size, 0) / Math.max(1, Object.keys(per).length)).toFixed(2) }));
} finally { await browser.close(); }
