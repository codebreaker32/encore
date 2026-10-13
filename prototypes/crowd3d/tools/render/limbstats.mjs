// The elbow and knee numbers across the anatomy sweep's venues and states (window.__limbMetrics), on the build box:
// percentiles per group (seated at rest, seated otherwise, standing) and the people at the extremes, for tuning the
// limbs rules in anatomy.js and for the report.   node limbstats.mjs <page url without query> [venues...]
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, ...vs] = process.argv.slice(2);
const venues = vs.length ? vs : ['club', 'theatre', 'openmic', 'arena'];
const range = (a, b, s) => { const o = []; for (let t = a; t <= b + 1e-6; t += s) o.push(+t.toFixed(2)); return o; };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; // (ONLY=preview,listen: just those states)
const SCEN = [
  { name: 'preview', q: 'state=preview', ts: range(2, 38, 6) },
  { name: 'listen', q: 'state=listen', ts: range(2, 14, 3) },
  { name: 'laugh 0.4', q: 'state=laugh&s=0.4', ts: range(0.4, 6, 1.6) },
  { name: 'laugh 0.9', q: 'state=laugh&s=0.9', ts: range(0.4, 6, 1.6) },
  { name: 'dead air', q: 'state=murmur', ts: range(2, 20, 6) },
  { name: 'clap', q: 'host=1', ts: range(1.2, 7, 1.2), drive: (t) => ({ attention: 0.8, warmth: 0.6, reactions: t > 1 ? [{ id: 7, kind: 'applause', strength: 0.85, age: t - 1, level: Math.min(1, (t - 1) / 0.4) * (t < 5 ? 0.85 : Math.max(0, 0.85 - (t - 5) * 0.4)) }] : [] }) },
  { name: 'finale', q: 'host=1', ts: range(1.2, 8, 1.2), drive: (t) => ({ attention: 0.9, warmth: 0.9, reactions: [], finale: t > 1 ? { strength: 0.9 } : null }) },
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rows = [];
try {
  for (const v of venues) for (const S of SCEN) {
    if (ONLY && !ONLY.includes(S.name)) continue;
    let page = null;
    for (let tries = 0; ; tries++) { // (one retry: a page load on the shared box can stall)
      page = await browser.newPage({ viewport: { width: 640, height: 360 } });
      try {
        await page.goto(`${base}?venue=${v}&${S.q}&preset=tv&capture=1&hud=0&venue-lock=1`, { timeout: 240000 });
        await page.waitForFunction(() => typeof window.__renderAt === 'function' && typeof window.__limbMetrics === 'function', null, { timeout: 240000 });
        break;
      } catch (e) { await page.close(); if (tries) throw e; console.log('  (retry', v, S.name + ')'); }
    }
    for (const t of S.ts) {
      const r = await page.evaluate(({ t, d }) => {
        window.__renderAt(t - 0.1);
        if (d) { window.__renderAt(t - 0.05); window.encoreMessage({ type: 'drive', drive: d }); }
        window.__renderAt(t);
        return { m: window.__limbMetrics(), f: window.__anatomy().limbs };
      }, { t, d: S.drive ? S.drive(t) : null });
      for (const m of r.m) rows.push({ v, s: S.name, t, ...m });
      for (const f of r.f) console.log(`  ${v} ${S.name} t=${t} ${f.what}${f.side ? ' ' + f.side : ''} · ${f.name} (${f.value})`);
    }
    await page.close();
  }
} finally { await browser.close(); }
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(rows));
const q = (a, p) => { const s = a.filter((x) => x !== null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const groups = { 'seated rest': (r) => r.seated && r.resting, 'seated other': (r) => r.seated && !r.resting, standing: (r) => !r.seated };
for (const [g, f] of Object.entries(groups)) {
  const R = rows.filter(f);
  if (!R.length) continue;
  console.log(`\n== ${g} (${R.length} person-frames)`);
  const show = (label, vals) => console.log(`  ${label.padEnd(12)} p1 ${q(vals, 0.01)}  p10 ${q(vals, 0.1)}  p50 ${q(vals, 0.5)}  p90 ${q(vals, 0.9)}  p99 ${q(vals, 0.99)}`);
  for (const k of ['out', 'fwd', 'angle', 'flank', 'inside', 'other']) show('elbow ' + k, R.flatMap((r) => r.arms.map((a) => a[k])));
  for (const k of ['kneeFwd', 'shinTilt', 'thighPitch', 'flex', 'footPitch']) show('leg ' + k, R.flatMap((r) => r.legs.map((a) => a[k])));
  for (const k of ['kneeGap', 'ankleGap', 'legNear']) show(k, R.map((r) => r[k]));
  const fg = {}; for (const r of R) for (const [w, gap] of r.furn) (fg[w.replace(/ of .*/, '')] ||= []).push(gap);
  for (const [w, a] of Object.entries(fg)) show(w, a);
}
