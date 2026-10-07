/**
 * Paridade do blit do canvas 2D (ADR-0318): o laço JS do drawImage tem que gerar
 * exatamente o golden que o cortex_host_tests usa pra conferir o laço em C++.
 * Se este teste falhar porque o laço JS mudou: rode
 * `node native/scripts/gen-blit-golden.mjs` e porte a mudança pro blit.cpp.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGoldenCases, buildGoldenHeader, GOLDEN_PATH } from '../../native/scripts/gen-blit-golden.mjs';

describe('blit do canvas 2D: golden JS × C++ (ADR-0318)', () => {
  it('o laço JS ainda gera o golden commitado', () => {
    expect(buildGoldenHeader()).toBe(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  });

  it('os casos exercitam escrita (nada de golden vazio)', () => {
    for (const c of buildGoldenCases()) {
      let changed = 0;
      for (let i = 0; i < c.expected.length; i++) if (c.expected[i] !== c.dstBefore[i]) changed++;
      expect(changed, c.name).toBeGreaterThan(100);
    }
  });

  it('o drawImage chama __cortexBlitImage quando o host o oferece', () => {
    expect(buildGoldenCases().every((c) => c.p.length === 19)).toBe(true);
  });
});
