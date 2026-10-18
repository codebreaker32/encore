// Mali Offline Compiler (Arm Performance Studio 2025.5, malioc 8.8) over a folder of .vert/.frag files, for Mali-G31:
// the longest-path cycles per unit (A arithmetic, LS load/store, V varying, T texture) for each variant (vertex
// shaders: IDVS position and varying shading), and the bound unit.   node mali.mjs <dir> [core=Mali-G31]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
const [dir, core = 'Mali-G31'] = process.argv.slice(2);
const M = `${os.homedir()}/spike-arena/tools/Arm_Performance_Studio_2025.5/mali_offline_compiler/malioc`;
const out = {};
for (const f of fs.readdirSync(dir).filter((x) => /\.(vert|frag)$/.test(x)).sort()) {
  let txt = '';
  try { txt = execFileSync(M, ['-c', core, f.endsWith('.vert') ? '-v' : '-f', `${dir}/${f}`], { encoding: 'utf8' }); } catch (e) { txt = String(e.stdout || '') + String(e.stderr || ''); }
  const res = { variants: {} };
  const lines = txt.split('\n');
  let variant = 'main', cols = null;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (/^Position variant/.test(L)) variant = 'position';
    else if (/^Varying variant/.test(L)) variant = 'varying';
    else if (/^Main shader/.test(L) && f.endsWith('.frag')) variant = 'main';
    const wr = L.match(/^Work registers: (\d+)/); if (wr) (res.variants[variant] ||= {}).regs = +wr[1];
    if (/^\s+A\s+(LS|FMA)/.test(L) || /^\s+FMA\s+/.test(L)) cols = L.trim().split(/\s+/);
    const m = L.match(/^(Total instruction|Shortest path|Longest path) cycles:\s+(.*)$/);
    if (m && cols) {
      const vals = m[2].trim().split(/\s+/), row = {};
      cols.forEach((c, k) => { row[c] = c === 'Bound' ? vals[k] : +vals[k]; });
      (res.variants[variant] ||= {})[m[1].split(' ')[0].toLowerCase()] = row;
    }
    if (/ERROR|error:/.test(L)) (res.errors ||= []).push(L.trim());
  }
  out[f] = res;
}
console.log(JSON.stringify(out, null, 1));
