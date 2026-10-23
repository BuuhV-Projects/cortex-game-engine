// Shared analysis for the perf kit (SPEC-0382): one verdict / one line per round.
// Usage:
//   node trace-stats.mjs validate <runDir...>   exit 1 if any round is invalid
//   node trace-stats.mjs summary  <runDir...>
//   node trace-stats.mjs ab       <runsRoot>    rounds named <point>-<A|B>-r<k>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Samples before this are loading/warm-up (pipelines, streaming).
export const WARMUP_MS = 30000;
// Fewer game samples than this after warm-up = not a measurement (~10 s at 0.5 s/sample).
export const MIN_ROWS = 20;
// The host clamps frameMs at 100 ms; above it frameMs/fps measure nothing.
export const FRAME_MS_CEILING = 100;
// frame-timing windows in the first quarter of the log are loading.
const FRAME_TIMING_SKIP_DIVISOR = 4;
// GC columns (SPEC-0357) start later than the other stats: the first old collection after the warm-up
// frame lands in the first ~40 s.
export const GC_FROM_MS = 40000;
// A sampled frame above this missed 30 fps: the drops the autopilot (SPEC-0414) is there to show.
export const SLOW_FRAME_MS = 33;
// An autopilot round whose camera never got this far from its first steady sample did not move.
export const MIN_AUTOPILOT_TRAVEL_M = 8;
// cam.dy above this = camera looking above the horizon: almost nothing on screen, the frame gets
// artificially cheap (the 3rd-person default in DDD 61 is -0.34).
export const MAX_AUTOPILOT_CAM_DY = 0;
const KB_PER_MB = 1024;
const MS_PER_S = 1000;
const P50 = 0.5;
const P95 = 0.95;
const P99 = 0.99;
const PERCENT = 100;

const FRAME_TIMING_RE = /frame-timing \((\d+) frames, (\d+) apresentados\).*?js med=([\d.]+) p95=([\d.]+)/;

const quantile = (values, p) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const fmt = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '-');
const readIf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

/** Parses one round folder into the numbers every mode needs. */
export function analyzeRun(dir) {
  const name = path.basename(path.resolve(dir));
  const traceText = readIf(path.join(dir, 'perf-trace.jsonl'));
  const logText = readIf(path.join(dir, 'perf-log.txt')) ?? '';
  const meta = readIf(path.join(dir, 'meta.txt')) ?? '';
  const lines = traceText === null ? [] : traceText.split('\n').filter((l) => l.trim());
  const rows = [];
  let autopilot = null;
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.autopilot) autopilot = row.autopilot;
      if (row.cpu && row.t >= WARMUP_MS) rows.push(row);
    } catch {
      // the host may be killed mid-line: the last line can be truncated
    }
  }
  const windows = [];
  for (const line of logText.split('\n')) {
    const m = line.match(FRAME_TIMING_RE);
    if (m) windows.push({ frames: +m[1], presented: +m[2], jsMed: +m[3], jsP95: +m[4] });
  }
  const steady = windows.slice(Math.floor(windows.length / FRAME_TIMING_SKIP_DIVISOR));
  const section = (key) => ({
    avg: mean(rows.map((r) => r.cpuAvg?.[key] ?? r.cpu[key] ?? 0)),
    p99: quantile(rows.map((r) => r.cpuP99?.[key] ?? 0), P50),
  });
  const frameMs = rows.map((r) => r.frameMs);
  const framesSum = steady.reduce((a, w) => a + w.frames, 0);
  const presentedSum = steady.reduce((a, w) => a + w.presented, 0);
  const camRows = rows.filter((r) => r.cam);
  const travel = camRows.length
    ? Math.max(...camRows.map((r) => Math.hypot(r.cam.x - camRows[0].cam.x, r.cam.z - camRows[0].cam.z)))
    : 0;
  const autopilotWanted = /[?&]autopilot=/.test(meta);
  const maxCamDy = camRows.length ? Math.max(...camRows.map((r) => r.cam.dy)) : NaN;

  let reason = null;
  if (traceText === null) reason = 'sem perf-trace.jsonl (rodada interrompida ou em andamento)';
  else if (lines.length === 0) reason = 'trace vazio: o jogo morreu na carga (veja error_log.txt / run.log)';
  else if (lines.length === 1) reason = 'trace de 1 linha: ficou na tela de carregamento';
  else if (rows.length < MIN_ROWS) reason = `${rows.length} amostras após ${WARMUP_MS / 1000} s (mínimo ${MIN_ROWS})`;
  else if (!rows.some((r) => r.cpuAvg && 'world' in r.cpuAvg)) reason = 'trace sem seções cpuAvg (rodou sem ?cortexDebug=perf): world não medido';
  else if (!(section('world').avg > 0)) reason = 'world = 0: simulação parada';
  else if (!windows.length) reason = 'perf-log sem frame-timing (rodou sem CORTEX_FRAME_TIMING?)';
  else if (presentedSum === 0) reason = '0 quadros apresentados';
  else if (/FROZE/.test(meta)) reason = 'congelou (FROZE no meta.txt)';
  else if (autopilotWanted && !autopilot) reason = 'query pede autopiloto, mas o trace não tem o evento autopilot (engine sem SPEC-0414?)';
  else if (autopilotWanted && travel < MIN_AUTOPILOT_TRAVEL_M) {
    reason = `autopiloto não andou: a câmera se afastou ${fmt(travel)} m (mínimo ${MIN_AUTOPILOT_TRAVEL_M})`;
  } else if (autopilotWanted && maxCamDy > MAX_AUTOPILOT_CAM_DY) {
    reason = `câmera acima do horizonte (cam.dy até ${fmt(maxCamDy, 2)}): olhando o céu, o quadro fica barato`;
  }

  return {
    name,
    gc: gcStats(rows),
    valid: reason === null,
    reason,
    rows: rows.length,
    frameMed: quantile(frameMs, P50),
    frameP95: quantile(frameMs, P95),
    frameP99: quantile(frameMs, P99),
    saturated: frameMs.filter((v) => v >= FRAME_MS_CEILING).length,
    slowPct: frameMs.length ? (PERCENT * frameMs.filter((v) => v > SLOW_FRAME_MS).length) / frameMs.length : NaN,
    travel,
    autopilot: autopilot?.profile ?? null,
    jsMed: mean(steady.map((w) => w.jsMed)),
    jsP95: mean(steady.map((w) => w.jsP95)),
    presentedPct: framesSum ? (PERCENT * presentedSum) / framesSum : NaN,
    render: section('render'),
    world: section('world'),
    draws: quantile(rows.map((r) => r.draws), P50),
  };
}

/**
 * Allocation and collector totals over the steady part of the round (SPEC-0357). `null` when the trace
 * has no `gc.allocatedMB` (host without the counter): the summary then stays as it was.
 * Frames in the interval = elapsed / mean sampled frameMs.
 */
export function gcStats(rows) {
  const gcRows = rows.filter((r) => r.t >= GC_FROM_MS && typeof r.gc?.allocatedMB === 'number');
  if (gcRows.length < 2) return null;
  const a = gcRows[0];
  const b = gcRows[gcRows.length - 1];
  const elapsedMs = b.t - a.t;
  const frames = elapsedMs / mean(gcRows.map((r) => r.frameMs));
  const seconds = elapsedMs / MS_PER_S;
  return {
    kbPerFrame: ((b.gc.allocatedMB - a.gc.allocatedMB) * KB_PER_MB) / frames,
    youngPerS: (b.gc.youngCount - a.gc.youngCount) / seconds,
    youngMsPerS: (b.gc.youngMs - a.gc.youngMs) / seconds,
    oldCount: b.gc.oldCount - a.gc.oldCount,
    oldWallMs: b.gc.oldWallMs - a.gc.oldWallMs,
  };
}

export function verdictLine(r) {
  return r.valid ? `VÁLIDO   ${r.name}` : `INVÁLIDO ${r.name}: ${r.reason}`;
}

export function summaryLine(r) {
  if (!r.valid) return verdictLine(r);
  const alert = r.saturated
    ? ` | ALERTA ${r.saturated} amostras no teto de ${FRAME_MS_CEILING} ms: frameMs não mede, compare render/world/draws`
    : '';
  return (
    `VÁLIDO ${r.name} n=${r.rows} | frameMs ${fmt(r.frameMed)}/${fmt(r.frameP95)}/${fmt(r.frameP99)} (med/p95/p99)` +
    ` >${SLOW_FRAME_MS}ms ${fmt(r.slowPct, 0)}%` +
    ` | js ${fmt(r.jsMed, 2)}/${fmt(r.jsP95, 2)} | render ${fmt(r.render.avg, 2)} p99 ${fmt(r.render.p99)}` +
    ` | world ${fmt(r.world.avg, 2)} p99 ${fmt(r.world.p99)} | draws ${r.draws} | apresentados ${fmt(r.presentedPct, 0)}%` +
    (r.gc
      ? ` | gc ${fmt(r.gc.kbPerFrame)} KB/q, young ${fmt(r.gc.youngPerS, 2)}/s ${fmt(r.gc.youngMsPerS)} ms/s, old ${r.gc.oldCount}x ${r.gc.oldWallMs} ms`
      : '') +
    (r.autopilot ? ` | autopiloto ${r.autopilot} andou ${fmt(r.travel, 0)} m` : '') +
    alert
  );
}

const AB_NAME_RE = /^(.+)-(A|B)-r\d+$/;
const AB_METRICS = [
  ['frameMs med', (r) => r.frameMed],
  ['frameMs p95', (r) => r.frameP95],
  ['frameMs p99', (r) => r.frameP99],
  [`>${SLOW_FRAME_MS}ms %`, (r) => r.slowPct],
  ['js p95', (r) => r.jsP95],
  ['render', (r) => r.render.avg],
  ['world', (r) => r.world.avg],
  ['draws', (r) => r.draws],
  ['gc KB/quadro', (r) => r.gc?.kbPerFrame ?? NaN],
  ['gc young ms/s', (r) => r.gc?.youngMsPerS ?? NaN],
];

/** Table per point: mean over valid rounds of each arm, and B - A. */
export function abTable(runsRoot) {
  const groups = new Map();
  const out = [];
  for (const entry of fs.readdirSync(runsRoot).sort()) {
    const m = entry.match(AB_NAME_RE);
    if (!m) continue;
    const r = analyzeRun(path.join(runsRoot, entry));
    if (!r.valid) out.push(verdictLine(r));
    const point = groups.get(m[1]) ?? { A: [], B: [] };
    if (r.valid) point[m[2]].push(r);
    groups.set(m[1], point);
  }
  out.push(`ponto | métrica | A (n) | B (n) | B-A`);
  for (const [point, arms] of groups) {
    for (const [label, pick] of AB_METRICS) {
      const a = mean(arms.A.map(pick));
      const b = mean(arms.B.map(pick));
      if (!Number.isFinite(a) && !Number.isFinite(b)) continue; // metric absent in this trace (e.g. gc on an old host)
      out.push(`${point} | ${label} | ${fmt(a, 2)} (${arms.A.length}) | ${fmt(b, 2)} (${arms.B.length}) | ${fmt(b - a, 2)}`);
    }
  }
  return out;
}

function main(argv) {
  const [mode, ...dirs] = argv;
  if (mode === 'validate' || mode === 'summary') {
    if (!dirs.length) throw new Error(`uso: trace-stats.mjs ${mode} <pastaDaRodada...>`);
    const results = dirs.map(analyzeRun);
    for (const r of results) console.log(mode === 'validate' ? verdictLine(r) : summaryLine(r));
    return mode === 'validate' && results.some((r) => !r.valid) ? 1 : 0;
  }
  if (mode === 'ab' && dirs.length === 1) {
    for (const line of abTable(dirs[0])) console.log(line);
    return 0;
  }
  throw new Error('uso: trace-stats.mjs validate|summary <pastaDaRodada...> | ab <pastaDasRodadas>');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
}
