/**
 * Kit de medição do export nativo (SPEC-0382): o veredito VÁLIDO/INVÁLIDO e a
 * tabela A/B do `native/scripts/perf/trace-stats.mjs`, com rodadas sintéticas
 * de resposta conhecida — inclusive as que enganaram as frentes do PRD-0009
 * (trace de 1 linha = tela de carregamento, trace sem seções, 0 apresentados).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeRun, abTable, summaryLine, WARMUP_MS, MIN_ROWS, GC_FROM_MS, MIN_AUTOPILOT_TRAVEL_M, SLOW_FRAME_MS, MAX_AUTOPILOT_CAM_DY, DRIVE_FAST_M_S, DRIVE_MIN_PATH_M, MAX_CAM_SPEED_M_S, DRIVE_REF_TRIS, DRIVE_REF_DRAWS } from '../../native/scripts/perf/trace-stats.mjs';

const SAMPLE_MS = 500;
const FRAME_WINDOWS = 8;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'perfkit-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function makeRun(
  name: string,
  opts: { rows?: number; world?: number; frameMs?: number; presented?: number; sections?: boolean; trace?: string | null; gc?: boolean;
    meta?: string; autopilot?: boolean; profile?: string; camStep?: number; camStepAt?: (i: number) => number; game?: (i: number) => Record<string, number> | undefined; camDyAt?: (i: number) => number; tris?: number; draws?: number; camDy?: number; frameMsAt?: (i: number) => number } = {},
) {
  const { rows = MIN_ROWS * 2, world = 2, frameMs = 16, presented = 300, sections = true } = opts;
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  let x = 0;
  const xs: number[] = [];
  for (let i = 0; i < rows; i++) {
    x += i === 0 ? 0 : (opts.camStepAt?.(i) ?? opts.camStep ?? 0);
    xs.push(x);
  }
  const camX = (i: number): number => xs[i]!;
  let trace = opts.trace;
  if (trace === undefined) {
    const lines = [JSON.stringify({ t: 0, precompile: { ms: 1 } })];
    if (opts.autopilot) lines.push(JSON.stringify({ t: 0, autopilot: { profile: opts.profile ?? 'walk', cycleS: 27.8 } }));
    for (let i = 0; i < rows; i++) {
      const row: Record<string, unknown> = {
        t: WARMUP_MS + i * SAMPLE_MS, frameMs: opts.frameMsAt?.(i) ?? frameMs, cpu: { world: 9, render: 9 }, draws: opts.draws ?? 150, tris: opts.tris ?? DRIVE_REF_TRIS,
        cam: { x: camX(i), y: 1, z: 0, dx: 0, dy: opts.camDyAt?.(i) ?? opts.camDy ?? -0.34, dz: 0.94 },
      };
      const game = opts.game?.(i);
      if (game) row.game = game;
      if (opts.gc) {
        // known answer: 0.5 MB, 1 young collection of 3 ms per sample; one old collection of 200 ms midway
        const old = i >= rows / 2 ? 1 : 0;
        row.gc = { allocatedMB: i * 0.5, youngCount: i, youngMs: i * 3, oldCount: old, oldWallMs: old * 200, oldCpuMs: 0 };
      }
      if (sections) {
        row.cpuAvg = { world, render: 8 };
        row.cpuP99 = { world: world * 2, render: 12 };
      }
      lines.push(JSON.stringify(row));
    }
    trace = lines.join('\n');
  }
  if (trace !== null) fs.writeFileSync(path.join(dir, 'perf-trace.jsonl'), trace);
  const log = Array.from(
    { length: FRAME_WINDOWS },
    () => `[10:00:00] frame-timing (300 frames, ${presented} apresentados) | poll med=0.04 p95=0.05 | js med=15.00 p95=20.00 | present med=0.3 p95=0.4`,
  );
  fs.writeFileSync(path.join(dir, 'perf-log.txt'), log.join('\n'));
  if (opts.meta) fs.writeFileSync(path.join(dir, 'meta.txt'), opts.meta);
  return dir;
}

describe('trace-stats validate', () => {
  it('aceita rodada boa e usa cpuAvg, não o cpu.<seção> sorteado', () => {
    const r = analyzeRun(makeRun('ok'));
    expect(r.valid).toBe(true);
    expect(r.world.avg).toBe(2);
    expect(r.render.p99).toBe(12);
  });

  it('reprova trace de 1 linha (tela de carregamento)', () => {
    const r = analyzeRun(makeRun('loading', { trace: JSON.stringify({ t: 0, precompile: { ms: 1 } }) }));
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/1 linha/);
  });

  it('reprova pasta sem trace, poucas amostras, world 0, sem seções e 0 apresentados', () => {
    expect(analyzeRun(makeRun('none', { trace: null })).reason).toMatch(/sem perf-trace/);
    expect(analyzeRun(makeRun('short', { rows: MIN_ROWS - 1 })).reason).toMatch(/amostras/);
    expect(analyzeRun(makeRun('stopped', { world: 0 })).reason).toMatch(/world = 0/);
    expect(analyzeRun(makeRun('nosec', { sections: false })).reason).toMatch(/cortexDebug=perf/);
    expect(analyzeRun(makeRun('dark', { presented: 0 })).reason).toMatch(/0 quadros/);
  });

  it('autopiloto (SPEC-0414): reprova sem o evento no trace e parado; aprova andando', () => {
    const meta = 'query=?cortexDebug=perf&spawn=setorO&autopilot=walk exp=x';
    expect(analyzeRun(makeRun('ap-old', { meta, camStep: 1 })).reason).toMatch(/sem SPEC-0414/);
    expect(analyzeRun(makeRun('ap-parked', { meta, autopilot: true })).reason).toMatch(/não andou/);
    const moving = analyzeRun(makeRun('ap-moving', { meta, autopilot: true, camStep: MIN_AUTOPILOT_TRAVEL_M / MIN_ROWS }));
    expect(moving.valid).toBe(true);
    expect(summaryLine(moving)).toMatch(/autopiloto walk andou \d+ m/);
    const sky = analyzeRun(makeRun('ap-sky', { meta, autopilot: true, camStep: 1, camDy: MAX_AUTOPILOT_CAM_DY + 0.5 }));
    expect(sky.reason).toMatch(/acima do horizonte/);
    // without autopilot in the query a round does not have to move
    expect(analyzeRun(makeRun('parked', { meta: 'query=?spawn=setorO' })).valid).toBe(true);
  });

  it('drive (SPEC-0595): reprova devagar ou curto, aprova dirigindo; teleporte não conta', () => {
    const meta = 'query=?autopilot=drive&drive=1';
    const sampleS = SAMPLE_MS / 1000;
    const rows = 220; // 110 s of steady samples, like the kit's 135 s round after the warm-up
    const fast = DRIVE_FAST_M_S + 3;
    // known answer: the legacy script crawls (the measured 1.7 m/s median)
    const legacy = analyzeRun(makeRun('legacy', { meta, autopilot: true, profile: 'drive-legacy', rows, camStep: 1.7 * sampleS }));
    expect(legacy.reason).toMatch(/drive não dirigiu/);
    const inCity = () => ({ urban: 1, trafficMoving: 2 });
    const driving = analyzeRun(makeRun('drive', { meta, autopilot: true, profile: 'drive', rows, camStep: fast * sampleS, game: inCity }));
    expect(driving.valid).toBe(true);
    expect(driving.fastPct).toBe(100);
    expect(driving.path).toBeGreaterThan(DRIVE_MIN_PATH_M);
    expect(driving.speedMed).toBeCloseTo(fast);
    // fast but short: 30 samples above the speed do not make 400 m
    expect(analyzeRun(makeRun('short', { meta, autopilot: true, profile: 'drive', rows: 30, camStep: fast * sampleS })).reason).toMatch(/caminho/);
    // a teleport jump is left out of the path
    const jump = analyzeRun(makeRun('jump', {
      meta, autopilot: true, profile: 'drive', rows, camStepAt: (i) => (i === 5 ? MAX_CAM_SPEED_M_S * 10 : 1.7 * sampleS),
    }));
    expect(jump.path).toBeLessThan(DRIVE_MIN_PATH_M);
    expect(jump.valid).toBe(false);
  });

  it('drive na cidade (SPEC-0595): reprova fora da cidade, rala, sem trânsito ou sem medidores', () => {
    const meta = 'query=?autopilot=drive&drive=1';
    const rows = 220;
    const camStep = (DRIVE_FAST_M_S + 3) * (SAMPLE_MS / 1000);
    const run = (name: string, extra: object) => analyzeRun(makeRun(name, { meta, autopilot: true, profile: 'drive', rows, camStep, ...extra }));
    expect(run('ok', { game: () => ({ urban: 1, trafficMoving: 1 }) }).valid).toBe(true);
    // known answer: the Hélio edge — fast, but out of the city and with no traffic in view
    const edge = run('edge', { game: (i: number) => ({ urban: i % 4 === 0 ? 1 : 0, trafficMoving: i % 5 === 0 ? 1 : 0 }) });
    expect(edge.reason).toMatch(/\(a\) 25% na cidade/);
    expect(edge.reason).toMatch(/\(c\) 20% com carro/);
    expect(run('thin', { game: () => ({ urban: 1, trafficMoving: 1 }), tris: DRIVE_REF_TRIS * 0.5 }).reason).toMatch(/\(b\)/);
    expect(run('fewdraws', { game: () => ({ urban: 1, trafficMoving: 1 }), draws: Math.floor(DRIVE_REF_DRAWS * 0.5) }).reason).toMatch(/\(b\)/);
    expect(run('nogauge', {}).reason).toMatch(/sem os medidores/);
  });

  it('drive com câmera livre (SPEC-0595): reprova a chase cam olhando o carro de cima', () => {
    const meta = 'query=?autopilot=drive&drive=1';
    const camStep = (DRIVE_FAST_M_S + 3) * (SAMPLE_MS / 1000);
    const run = (name: string, camDyAt: (i: number) => number) =>
      analyzeRun(makeRun(name, { meta, autopilot: true, profile: 'drive', rows: 220, camStep, camDyAt, game: () => ({ urban: 1, trafficMoving: 1 }) }));
    const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);
    expect(run('free', () => sin(-20)).valid).toBe(true);
    // known answer: the old chase cam, -33 deg median and ~88% below -30 deg
    const chase = run('chase', (i) => sin(i % 8 === 0 ? -28 : -33));
    expect(chase.reason).toMatch(/câmera presa no carro: inclinação mediana -33°/);
    // median fine but too many steep samples
    expect(run('steep', (i) => sin(i % 5 === 0 ? -40 : -20)).reason).toMatch(/20% abaixo de -30°/);
  });

  it('conta a fração de amostras acima de 33 ms', () => {
    const r = analyzeRun(makeRun('slow', { frameMsAt: (i) => (i % 4 === 0 ? SLOW_FRAME_MS + 1 : 16) }));
    expect(r.slowPct).toBe(25);
    expect(summaryLine(r)).toMatch(/>33ms 25%/);
  });

  it('alerta quando frameMs está no teto de 100 ms', () => {
    expect(summaryLine(analyzeRun(makeRun('sat', { frameMs: 100 })))).toMatch(/ALERTA \d+ amostras no teto/);
  });
});

describe('trace-stats gc (SPEC-0357)', () => {
  it('soma alocação e coletas a partir de GC_FROM_MS, em KB por quadro', () => {
    const r = analyzeRun(makeRun('gc', { gc: true, rows: MIN_ROWS * 4 }));
    // 1 MB/s a 16 ms/quadro (62,5 quadros/s) = 16,384 KB/quadro; 2 coletas/s de 3 ms = 6 ms/s
    expect(r.gc.kbPerFrame).toBeCloseTo(1024 / 62.5, 3);
    expect(r.gc.youngPerS).toBeCloseTo(2, 6);
    expect(r.gc.youngMsPerS).toBeCloseTo(6, 6);
    expect(r.gc.oldCount).toBe(1);
    expect(r.gc.oldWallMs).toBe(200);
    expect(summaryLine(r)).toMatch(/gc 16\.4 KB\/q, young 2\.00\/s 6\.0 ms\/s, old 1x 200 ms/);
    expect(GC_FROM_MS).toBeGreaterThan(WARMUP_MS);
  });

  it('sem o contador no trace, o resumo e a tabela continuam como antes', () => {
    const r = analyzeRun(makeRun('setorO-A-r1'));
    expect(r.gc).toBeNull();
    expect(summaryLine(r)).not.toMatch(/gc /);
    makeRun('setorO-B-r1');
    expect(abTable(root).some((l) => l.includes('gc KB'))).toBe(false);
  });
});

describe('trace-stats ab', () => {
  it('compara A e B por ponto e ignora rodada inválida', () => {
    makeRun('setorO-A-r1', { frameMs: 20 });
    makeRun('setorO-B-r1', { frameMs: 15 });
    makeRun('setorO-B-r2', { trace: null });
    const lines: string[] = abTable(root);
    expect(lines.some((l) => l.startsWith('INVÁLIDO setorO-B-r2'))).toBe(true);
    expect(lines).toContain('setorO | frameMs med | 20.00 (1) | 15.00 (1) | -5.00');
  });
});
