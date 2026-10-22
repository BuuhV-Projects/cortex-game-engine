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
import { analyzeRun, abTable, summaryLine, WARMUP_MS, MIN_ROWS } from '../../native/scripts/perf/trace-stats.mjs';

const SAMPLE_MS = 500;
const FRAME_WINDOWS = 8;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'perfkit-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function makeRun(
  name: string,
  opts: { rows?: number; world?: number; frameMs?: number; presented?: number; sections?: boolean; trace?: string | null } = {},
) {
  const { rows = MIN_ROWS * 2, world = 2, frameMs = 16, presented = 300, sections = true } = opts;
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  let trace = opts.trace;
  if (trace === undefined) {
    const lines = [JSON.stringify({ t: 0, precompile: { ms: 1 } })];
    for (let i = 0; i < rows; i++) {
      const row: Record<string, unknown> = { t: WARMUP_MS + i * SAMPLE_MS, frameMs, cpu: { world: 9, render: 9 }, draws: 150 };
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

  it('alerta quando frameMs está no teto de 100 ms', () => {
    expect(summaryLine(analyzeRun(makeRun('sat', { frameMs: 100 })))).toMatch(/ALERTA \d+ amostras no teto/);
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
