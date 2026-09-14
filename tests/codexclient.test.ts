/**
 * Testes unitários para o cliente do Codex CLI (src/ai/CodexClient.ts).
 *
 * Cobrem as partes puras (resolução de binário, parse e comparação de versão),
 * que são justamente o que já quebrou na prática: `codex` no PATH apontando
 * para uma versão antiga demais para o GPT-6-Astra.
 *
 * @see ADR-0189 / SPEC-0190
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CODEX_MODEL,
  CODEX_MIN_VERSION,
  resolveCodexBin,
  parseCodexVersion,
  compareVersions,
} from '../src/ai/CodexClient.js';

describe('CodexClient — constantes', () => {
  it('usa o modelo GPT-6-Astra', () => {
    expect(CODEX_MODEL).toBe('gpt-6-astra');
  });

  it('exige no mínimo a 0.154.0 (a 0.151.0 recusa o astra com HTTP 400)', () => {
    expect(compareVersions(CODEX_MIN_VERSION, '0.151.0')).toBeGreaterThan(0);
  });
});

describe('parseCodexVersion', () => {
  it('extrai a versão da saída real do CLI', () => {
    expect(parseCodexVersion('codex-cli 0.154.0')).toBe('0.154.0');
  });

  it('extrai mesmo com quebra de linha e texto ao redor', () => {
    expect(parseCodexVersion('\ncodex-cli 1.2.30\n')).toBe('1.2.30');
  });

  it('devolve null quando não há versão na saída', () => {
    expect(parseCodexVersion('command not found')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('compara numericamente, não lexicograficamente', () => {
    // O caso que uma comparação de string erraria: "0.9.0" > "0.154.0".
    expect(compareVersions('0.9.0', '0.154.0')).toBeLessThan(0);
    expect(compareVersions('0.154.0', '0.9.0')).toBeGreaterThan(0);
  });

  it('reconhece versões iguais', () => {
    expect(compareVersions('0.154.0', '0.154.0')).toBe(0);
  });

  it('trata segmentos faltando como zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0);
  });
});

describe('resolveCodexBin', () => {
  let dir: string;
  const originalCodexPath = process.env['CODEX_PATH'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codexbin-'));
  });

  afterEach(() => {
    if (originalCodexPath === undefined) delete process.env['CODEX_PATH'];
    else process.env['CODEX_PATH'] = originalCodexPath;
    rmSync(dir, { recursive: true, force: true });
  });

  it('prefere CODEX_PATH quando o arquivo existe', () => {
    const fake = join(dir, 'codex-custom.exe');
    writeFileSync(fake, '');
    process.env['CODEX_PATH'] = fake;

    expect(resolveCodexBin()).toBe(fake);
  });

  it('ignora CODEX_PATH apontando para arquivo inexistente', () => {
    process.env['CODEX_PATH'] = join(dir, 'nao-existe.exe');

    expect(resolveCodexBin()).not.toBe(process.env['CODEX_PATH']);
  });

  it('sempre devolve algum candidato (o último é o "codex" do PATH)', () => {
    delete process.env['CODEX_PATH'];

    const bin = resolveCodexBin();
    expect(bin).toBeTruthy();
    expect(bin.toLowerCase()).toContain('codex');
  });
});
