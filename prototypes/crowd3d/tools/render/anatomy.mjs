// The anatomy sweep, on the build box: every venue × state, stepping each page through time (capture mode) and asking
// the page's validator (people.js anatomyCheck → window.__anatomy: joint limits, the arms against every body and the
// furniture, seated posture), the hand checker (window.__handCheck) and the instanced bake report
// (window.__bakeAnatomy). Clap, heckle and finale are driven through the host protocol (crowdDrive messages).
//   node anatomy.mjs <page url without query, e.g. http://127.0.0.1:8093/after/index.html> [venues...]
//   (EXTRA='&anatomy=off' appends to every page's query)        exit code 1 if anything is found
import os from 'node:os';
const { chromium } = await import(process.env.PW || `${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, ...vs] = process.argv.slice(2);
const venues = vs.length ? vs : ['club', 'theatre', 'openmic', 'arena'];
const EXTRA = process.env.EXTRA || '';
const range = (a, b, s) => { const o = []; for (let t = a; t <= b + 1e-6; t += s) o.push(+t.toFixed(2)); return o; };
// demo states (the page's own director) and host-driven ones (a drive message per step)
const SCEN = [
  { name: 'preview', q: 'state=preview', ts: range(2, 38, 3) },
  { name: 'listen', q: 'state=listen', ts: range(2, 14, 3) },
  { name: 'laugh 0.4', q: 'state=laugh&s=0.4', ts: range(0.4, 6, 0.8) },
  { name: 'laugh 0.9', q: 'state=laugh&s=0.9', ts: range(0.4, 6, 0.8) },
  { name: 'dead air', q: 'state=murmur', ts: range(2, 20, 3) },
  { name: 'after', q: 'state=after', ts: range(0.5, 44.5, 2) }, // (the leaving: standing, coats on, walking out)
  { name: 'clap', q: 'host=1', ts: range(1.2, 7, 0.6), drive: (t) => ({ attention: 0.8, warmth: 0.6, reactions: t > 1 ? [{ id: 7, kind: 'applause', strength: 0.85, age: t - 1, level: Math.min(1, (t - 1) / 0.4) * (t < 5 ? 0.85 : Math.max(0, 0.85 - (t - 5) * 0.4)) }] : [] }) },
  { name: 'heckle', q: 'host=1', ts: range(1.2, 6, 0.6), drive: (t) => ({ attention: 0.5, reactions: [], heckle: t > 1 && t < 5 ? { id: 3, level: Math.min(1, (t - 1) / 0.4) } : null }) },
  { name: 'finale', q: 'host=1', ts: range(1.2, 8, 0.6), drive: (t) => ({ attention: 0.9, warmth: 0.9, reactions: [], finale: t > 1 ? { strength: 0.9 } : null }) },
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let total = 0;
const tally = {};
try {
  for (const v of venues) for (const S of SCEN) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
    await page.goto(`${base}?venue=${v}&${S.q}&preset=tv&capture=1&hud=0&venue-lock=1${EXTRA}`, { timeout: 240000 });
    await page.waitForFunction(() => typeof window.__renderAt === 'function' && typeof window.__anatomy === 'function', null, { timeout: 240000 });
    const found = [];
    for (const t of S.ts) {
      const r = await page.evaluate(({ t, d, why }) => {
        // (a frame just before, as the live page would have drawn: a person posed early in the frame checks their
        // hands against a neighbour's previous pose, which after a 2 s jump is not where the neighbour is now)
        window.__renderAt(t - 0.1);
        if (d) { window.__renderAt(t - 0.05); window.encoreMessage({ type: 'drive', drive: d }); }
        window.__renderAt(t);
        const a = window.__anatomy(), h = window.__handCheck ? window.__handCheck() : [];
        return [...a.joints.map((x) => `joint · ${x.joint}${x.side ? ' ' + x.side : ''} · ${x.name} (${x.value}°)`),
          ...a.collisions.map((x) => `collision · ${x.what} · ${x.name} ${x.side} (${x.depth})${why ? ' k' + x.k + ' [' + x.doing + ']' : ''}`),
          ...a.posture.map((x) => `posture · ${x.posture} · ${x.name} (${x.value})`),
          ...h.map((x) => `collision · ${x.what || 'in ' + x.in} · ${x.name} ${x.hand} (${x.depth})`)];
      }, { t, d: S.drive ? S.drive(t) : null, why: !!process.env.WHY });
      for (const x of r) found.push(`t=${t} ${x}`);
    }
    const bake = await page.evaluate(() => (window.__bakeAnatomy ? window.__bakeAnatomy() : []));
    if (S.name === 'listen') for (const x of bake) found.push(`bake · ${x.type} · ${x.pose}: ${x.left}`);
    for (const e of errs) found.push('pageerror ' + e);
    total += found.length;
    for (const x of found) { const k = x.replace(/^t=[0-9.]+ /, '').split(' · ').slice(0, 2).join(' · '); tally[k] = (tally[k] || 0) + 1; }
    console.log(`${v.padEnd(8)} ${S.name.padEnd(10)} ${found.length ? found.length + ' found' : 'clean'}`);
    for (const x of found.slice(0, 4)) console.log('   ', x);
    await page.close();
  }
} finally { await browser.close(); }
console.log('by kind:', JSON.stringify(tally));
console.log(total ? `TOTAL ${total} anatomy findings` : 'TOTAL 0: no joint, collision or posture violations');
process.exit(total ? 1 : 0);
