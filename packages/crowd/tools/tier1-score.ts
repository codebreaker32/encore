/**
 * Tier 1 content score per line, for calibrating the content judge (docs/judge-calibration.md).
 *
 *   vite-node tools/tier1-score.ts <in.jsonl> <out.jsonl> [standup|poetry|speech]
 *
 * Each input row is {"id": ..., "text": "the line", "context": ["earlier line", ...]} (rJokes: context = [title],
 * text = body). Each output row is {"id", "tier1": the capped Tier 1 bonus, "features": [...]}. The earlier lines are
 * treated as the same bit, one second apart, so a callback (which needs an earlier bit) never fires here.
 * A dev tool: Node only, not part of the package's pure source.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CONTENT_CAP, contentHits, contentWeight } from '../src/content';
import type { ActId, LineEvent } from '../src/types';

const [input, output, actArg] = process.argv.slice(2);
const act = (actArg || 'standup') as ActId;

function lineOf(id: number, text: string, t0: number): LineEvent {
  return { id, t0, t1: t0 + 1, level: 0.2, endLevel: 0.2, peakLevel: 0.22, pauseBefore: 0, text };
}

const rows = readFileSync(input, 'utf8')
  .split('\n')
  .filter((l) => l.trim());
const out: string[] = [];
for (const raw of rows) {
  const row = JSON.parse(raw) as { id: unknown; text: string; context?: string[] };
  const context = (row.context || []).filter((c) => !!c && c.trim());
  const earlier = context.map((c, i) => ({ line: lineOf(i + 1, c, i * 2), bit: 1 }));
  const line = lineOf(context.length + 1, row.text, context.length * 2);
  const hits = contentHits(line, { act, earlier, bit: 1 });
  const tier1 = Math.min(CONTENT_CAP[act], contentWeight(act, hits));
  out.push(
    JSON.stringify({ id: row.id, tier1: Math.round(tier1 * 1000) / 1000, features: hits.map((h) => h.feature) }),
  );
}
writeFileSync(output, `${out.join('\n')}\n`);
console.log(`${out.length} rows scored (${act})`);
