// Screenshot every mockup HTML at 1920×1080.
import { chromium } from '/tmp/claude-1000/-home-aman-projects-adh/7fc43422-bfa5-416d-b8d3-3abcf1bf98db/scratchpad/pw/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2] ?? path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
  await page.goto(`file://${path.join(dir, file)}`);
  await page.waitForTimeout(300);
  const target = path.join(out, file.replace('.html', '.png'));
  await page.screenshot({ path: target });
  console.log('wrote', target);
}
await browser.close();
