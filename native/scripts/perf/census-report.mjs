// Native renderer census report (SPEC-0505): reads the `rendererCensus` events of a round's
// perf-trace.jsonl and prints coverage plus the largest classes and refusals.
// Usage: node census-report.mjs <runDir...> [--top N]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TOP = 15;
const PERCENT = 100;

/** Parses `label=n;label=n` into [label, n] pairs. */
export function parseCounts(text) {
  if (!text) return [];
  return text.split(';').map((item) => {
    const at = item.lastIndexOf('=');
    return [item.slice(0, at), Number(item.slice(at + 1))];
  });
}

/** Aggregates the census events of one trace (array of parsed JSON lines). */
export function aggregateCensus(lines) {
  const totals = { samples: 0, objects: 0, covered: 0, refused: 0, skip: 0 };
  const classes = new Map();
  for (const line of lines) {
    const ev = line.rendererCensus;
    if (!ev) continue;
    totals.samples++;
    for (const key of ['objects', 'covered', 'refused', 'skip']) totals[key] += ev[key];
    for (const [label, n] of parseCounts(ev.classes)) classes.set(label, (classes.get(label) ?? 0) + n);
  }
  const sorted = [...classes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const drawn = totals.objects - totals.skip;
  return {
    ...totals,
    coveragePct: drawn > 0 ? (PERCENT * totals.covered) / drawn : 0,
    coveredClasses: sorted.filter(([label]) => !label.startsWith('refused:') && label !== 'skip'),
    refusals: sorted.filter(([label]) => label.startsWith('refused:')),
  };
}

function readLines(dir) {
  const file = path.join(dir, 'perf-trace.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((text) => {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    });
}

function main(argv) {
  const topAt = argv.indexOf('--top');
  const top = topAt >= 0 ? Number(argv[topAt + 1]) : DEFAULT_TOP;
  const dirs = topAt >= 0 ? argv.filter((_, i) => i !== topAt && i !== topAt + 1) : argv;
  if (!dirs.length) throw new Error('uso: census-report.mjs <pastaDaRodada...> [--top N]');
  for (const dir of dirs) {
    const r = aggregateCensus(readLines(dir));
    const perSample = (n) => (r.samples ? (n / r.samples).toFixed(1) : '0');
    console.log(
      `${path.basename(dir)}: amostras=${r.samples} objetos/amostra=${perSample(r.objects)} ` +
        `cobertos=${perSample(r.covered)} recusados=${perSample(r.refused)} skip=${perSample(r.skip)} ` +
        `cobertura=${r.coveragePct.toFixed(1)}%`,
    );
    for (const [label, n] of r.coveredClasses.slice(0, top)) console.log(`  + ${perSample(n)}  ${label}`);
    for (const [label, n] of r.refusals.slice(0, top)) console.log(`  - ${perSample(n)}  ${label}`);
  }
  return 0;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
}
