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
// An autopilot round whose camera never got this far from its first steady sample did not move: the
// input never reached the game (a parked round stays at 0.0 m). Low on purpose: a confined spawn
// (DDD 61 setorO: parked car, tree and wall around the player) walks only 4-8 m and still exercises it.
export const MIN_AUTOPILOT_TRAVEL_M = 2;
// cam.dy above this = camera looking above the horizon: almost nothing on screen, the frame gets
// artificially cheap (the 3rd-person default in DDD 61 is -0.34).
export const MAX_AUTOPILOT_CAM_DY = 0;
// Profile `drive` (SPEC-0595): a round only counts as driving with this share of camera intervals
// above DRIVE_FAST_M_S and this path after the warm-up (the user's real session: 44% above 9 m/s).
export const DRIVE_PROFILE = 'drive';
export const DRIVE_FAST_M_S = 9;
export const DRIVE_MIN_FAST_PCT = 40;
export const DRIVE_MIN_PATH_M = 400;
/** `drive` and its known answer `drive-legacy` (SPEC-0595). */
export const isDriveProfile = (name) => typeof name === 'string' && name.startsWith(DRIVE_PROFILE);
// Driving inside the city (SPEC-0595, user's request): the game's gauges (`game.urban`,
// `game.trafficMoving`) and the scene density of the user's real car session
// (builded-ddd-61/perf-trace.jsonl, 2026-10-25: median tris 1 450 290, draws 147 after the warm-up).
export const DRIVE_MIN_URBAN_PCT = 80;
export const DRIVE_MIN_TRAFFIC_PCT = 50;
export const DRIVE_REF_TRIS = 1450290;
export const DRIVE_REF_DRAWS = 147;
export const DRIVE_MIN_DENSITY = 0.9;
// Free camera while driving (SPEC-0595, user's request): the pitch of the user's real car session
// (median -21 deg, 1% below -30 deg) and of `walk` (-20 deg); the old chase cam sat at -33 deg.
export const DRIVE_PITCH_MIN_DEG = -25;
export const DRIVE_PITCH_MAX_DEG = -10;
export const DRIVE_STEEP_DEG = -30;
export const DRIVE_MAX_STEEP_PCT = 10;
const DEG_PER_RAD = 180 / Math.PI;
// A camera interval faster than this is a teleport (respawn, car reset), not driving: left out.
export const MAX_CAM_SPEED_M_S = 60;
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
  const motion = camMotion(camRows);
  const city = cityStats(rows);
  const pitch = camPitch(camRows);
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
  } else if (isDriveProfile(autopilot?.profile)) {
    const fails = [];
    if (motion.fastPct < DRIVE_MIN_FAST_PCT || motion.path < DRIVE_MIN_PATH_M) {
      fails.push(
        `drive não dirigiu: ${fmt(motion.fastPct, 0)}% acima de ${DRIVE_FAST_M_S} m/s (mínimo ${DRIVE_MIN_FAST_PCT}%), ` +
          `caminho ${fmt(motion.path, 0)} m (mínimo ${DRIVE_MIN_PATH_M})`,
      );
    }
    const outside = cityReason(city, quantile(rows.map((r) => r.tris), P50), quantile(rows.map((r) => r.draws), P50));
    if (outside) fails.push(outside);
    if (!(pitch.pitchMed >= DRIVE_PITCH_MIN_DEG && pitch.pitchMed <= DRIVE_PITCH_MAX_DEG) || pitch.steepPct > DRIVE_MAX_STEEP_PCT) {
      fails.push(
        `câmera presa no carro: inclinação mediana ${fmt(pitch.pitchMed, 0)}° (faixa ${DRIVE_PITCH_MIN_DEG}..${DRIVE_PITCH_MAX_DEG}°), ` +
          `${fmt(pitch.steepPct, 0)}% abaixo de ${DRIVE_STEEP_DEG}° (máximo ${DRIVE_MAX_STEEP_PCT}%)`,
      );
    }
    reason = fails.length ? fails.join(' | ') : null;
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
    ...motion,
    ...city,
    ...pitch,
    tris: quantile(rows.map((r) => r.tris), P50),
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
 * Camera motion between consecutive steady samples (SPEC-0595): path (sum of the intervals), median
 * speed and the % of intervals above DRIVE_FAST_M_S. Intervals faster than MAX_CAM_SPEED_M_S are
 * teleports and are left out.
 */
export function camMotion(camRows) {
  const speeds = [];
  let pathM = 0;
  for (let i = 1; i < camRows.length; i++) {
    const a = camRows[i - 1];
    const b = camRows[i];
    const dt = (b.t - a.t) / MS_PER_S;
    if (!(dt > 0)) continue;
    const d = Math.hypot(b.cam.x - a.cam.x, b.cam.z - a.cam.z);
    const v = d / dt;
    if (v > MAX_CAM_SPEED_M_S) continue;
    speeds.push(v);
    pathM += d;
  }
  return {
    path: pathM,
    speedMed: quantile(speeds, P50),
    fastPct: speeds.length ? (PERCENT * speeds.filter((v) => v > DRIVE_FAST_M_S).length) / speeds.length : 0,
  };
}

/** Camera pitch in degrees (asin of `cam.dy`): median, % below DRIVE_STEEP_DEG and median height. */
export function camPitch(camRows) {
  const deg = camRows.map((r) => Math.asin(Math.max(-1, Math.min(1, r.cam.dy))) * DEG_PER_RAD);
  return {
    pitchMed: quantile(deg, P50),
    steepPct: deg.length ? (PERCENT * deg.filter((d) => d < DRIVE_STEEP_DEG).length) / deg.length : NaN,
    camYMed: quantile(camRows.map((r) => r.cam.y), P50),
  };
}

/** % of samples with the camera in the city and with a moving traffic car in view (game gauges). */
export function cityStats(rows) {
  const gauged = rows.filter((r) => r.game && typeof r.game.urban === 'number');
  const pct = (pred) => (gauged.length ? (PERCENT * gauged.filter(pred).length) / gauged.length : NaN);
  return {
    gauged: gauged.length,
    urbanPct: pct((r) => r.game.urban > 0),
    trafficPct: pct((r) => (r.game.trafficMoving ?? 0) >= 1),
  };
}

/** Why a drive round is not "inside the city", or `null` (SPEC-0595 rules a, b, c). */
export function cityReason(city, trisMed, drawsMed) {
  if (!city.gauged) return 'drive sem os medidores do jogo (game.urban/trafficMoving): jogo sem a SPEC-0196';
  const fails = [];
  if (city.urbanPct < DRIVE_MIN_URBAN_PCT) fails.push(`(a) ${fmt(city.urbanPct, 0)}% na cidade (mínimo ${DRIVE_MIN_URBAN_PCT}%)`);
  if (trisMed < DRIVE_MIN_DENSITY * DRIVE_REF_TRIS || drawsMed < DRIVE_MIN_DENSITY * DRIVE_REF_DRAWS) {
    fails.push(`(b) tris ${fmt(trisMed / 1e6, 2)} M / draws ${drawsMed} (mínimo ${fmt((DRIVE_MIN_DENSITY * DRIVE_REF_TRIS) / 1e6, 2)} M / ${Math.ceil(DRIVE_MIN_DENSITY * DRIVE_REF_DRAWS)})`);
  }
  if (city.trafficPct < DRIVE_MIN_TRAFFIC_PCT) fails.push(`(c) ${fmt(city.trafficPct, 0)}% com carro do trânsito andando à vista (mínimo ${DRIVE_MIN_TRAFFIC_PCT}%)`);
  return fails.length ? `drive fora da cidade: ${fails.join('; ')}` : null;
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
    (isDriveProfile(r.autopilot) ? ` (caminho ${fmt(r.path, 0)} m, v med ${fmt(r.speedMed)} m/s, >${DRIVE_FAST_M_S} m/s ${fmt(r.fastPct, 0)}%)` : '') +
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
  if (mode === 'drive') {
    if (!dirs.length) throw new Error('uso: trace-stats.mjs drive <pastaDaRodada...>');
    for (const r of dirs.map(analyzeRun)) {
      console.log(
        `${r.name} | v med ${fmt(r.speedMed)} m/s | >${DRIVE_FAST_M_S} m/s ${fmt(r.fastPct, 0)}% | caminho ${fmt(r.path, 0)} m` +
          ` | cidade ${fmt(r.urbanPct, 0)}% | trânsito ${fmt(r.trafficPct, 0)}% | tris ${fmt(r.tris / 1e6, 2)} M draws ${r.draws}` +
          ` | câmera ${fmt(r.pitchMed, 0)}° (${fmt(r.steepPct, 0)}% < ${DRIVE_STEEP_DEG}°) a ${fmt(r.camYMed)} m` +
          ` | ${r.valid ? 'VÁLIDO' : `INVÁLIDO: ${r.reason}`}`,
      );
    }
    return 0;
  }
  if (mode === 'ab' && dirs.length === 1) {
    for (const line of abTable(dirs[0])) console.log(line);
    return 0;
  }
  throw new Error('uso: trace-stats.mjs validate|summary|drive <pastaDaRodada...> | ab <pastaDasRodadas>');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
}
