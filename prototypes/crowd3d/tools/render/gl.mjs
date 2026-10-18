// hands vs the table's glasses and jar for named people: node gl.mjs <base> <state> t:Name,...
import os from 'node:os';
const { chromium } = await import(`${os.homedir()}/tools/pw/node_modules/playwright/index.mjs`);
const [base, state, list] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(`${base}?venue=club&${state}&preset=tv&capture=1&hud=0&debug=1&venue-lock=1`, { timeout: 240000 });
await page.waitForFunction(() => typeof window.__renderAt === 'function' && window.__people, null, { timeout: 240000 });
for (const [t, name] of list.split(',').map((x) => x.split(':'))) {
  console.log(await page.evaluate(({ t, name }) => {
    window.__renderAt(+t); const T = window.__THREE, p = window.__people.find((q) => q.name === name && q.kind === 'front'), b = p.rig.b, tt = p.src.twoTop;
    const L = (v) => p.rig.seat.worldToLocal(v.clone()), f = (v) => v.toArray().map((x) => x.toFixed(3)).join(',');
    const W = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld);
    const things = [[-0.32, 0.11, 'glass14'], [0.32, 0.10, 'glass8'], [0.01, -0.06, 'jar']].map(([dx, dz, n]) => n + ' ' + f(L(new T.Vector3(tt.x + dx, 0.75, tt.z + dz))));
    return `t=${t} ${name} [${p._doing}] L ${f(L(W(b.lHand)))} tip ${f(L(W(b.lTip)))} | R ${f(L(W(b.rHand)))} tip ${f(L(W(b.rTip)))} | ${things.join(' | ')}`;
  }, { t, name }));
}
await browser.close();
