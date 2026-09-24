/**
 * Validação do relatório A/B (`native/scripts/ab-report.mjs`, TDR-0007).
 *
 * O relatório decide se uma mudança de perf valeu. Se ELE estiver errado, todo
 * número que sair dele está errado junto — e esta campanha já perdeu tempo com
 * instrumento que mentia em silêncio.
 *
 * Por isso os casos aqui têm **resposta conhecida**: traces sintéticos com um
 * efeito injetado de tamanho conhecido, ou sem efeito nenhum. Dois merecem
 * destaque:
 *
 * - **trajetória diferente, mesmo custo**: é o cenário que motivou o TDR. A IA
 *   passou por lugares diferentes, então a média acusa piora, mas o custo por
 *   draw é idêntico. O relatório TEM de dizer que não há diferença. Uma versão
 *   anterior, com faixas de 30 draws, falhava aqui.
 * - **sem efeito nenhum**: com dez faixas a 95%, esperam-se ~0,5 falsos
 *   positivos por comparação. Sem a correção de Bonferroni este caso acusava
 *   uma faixa em "melhora" — e uma faixa isolada é exatamente o que alguém
 *   leria como ganho.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(raiz, 'native', 'scripts', 'ab-report.mjs');

/** Amostras por rodada — o bastante para encher as faixas de 10 draws. */
const AMOSTRAS_POR_RODADA = 400;
/** Rodadas por versão, como o protocolo recomenda. */
const RODADAS = 4;
/** Custo por draw do modelo sintético, em ms (a reta que o relatório enxerga). */
const MS_POR_DRAW = 0.05;
/** Custo fixo do frame, em ms. */
const MS_FIXO = 6;
/** Chance de um frame ter um pico, para a distribuição ter cauda à direita
 * como a real — é o que torna bootstrap preferível a supor normalidade. */
const CHANCE_DE_PICO = 0.05;

/**
 * Gerador com SEMENTE (mulberry32).
 *
 * Os dados precisam ser determinísticos: um teste de perf que falha uma vez a
 * cada tantas execuções é pior que nenhum, porque ensina a ignorar o vermelho.
 * O bootstrap dentro do relatório ainda sorteia, mas 2000 reamostragens sobre
 * dados fixos dão veredito estável.
 */
function geradorComSemente(semente: number): () => number {
  let estado = semente;
  return () => {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let dir: string;
let aleatorio: () => number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-report-'));
  aleatorio = geradorComSemente(20260923);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Um trace sintético: custo linear nos draws, mais ruído, mais `delta`. */
function escreverTrace(nome: string, rodada: number, drawMin: number, drawMax: number, delta: number): void {
  const linhas: string[] = [];
  for (let i = 0; i < AMOSTRAS_POR_RODADA; i++) {
    const draws = drawMin + Math.floor(aleatorio() * (drawMax - drawMin));
    const pico = aleatorio() < CHANCE_DE_PICO ? aleatorio() * 8 : 0;
    const frameMs = Math.max(1, MS_FIXO + draws * MS_POR_DRAW + aleatorio() * 2 + pico + delta);
    linhas.push(
      JSON.stringify({
        // Acima do descarte de aquecimento do relatório.
        t: 26_000 + i * 200,
        fps: 1000 / frameMs,
        frameMs: +frameMs.toFixed(2),
        cpu: { render: +(frameMs * 0.7).toFixed(2), world: 2.7, ui: 1.9 },
        draws,
        tris: 2_000_000,
      }),
    );
  }
  fs.writeFileSync(path.join(dir, `${nome}-${rodada}.jsonl`), linhas.join('\n'));
}

interface Contagem {
  melhoram: number;
  pioram: number;
}

/** Roda o relatório e devolve quantas faixas acusaram cada coisa. */
function rodar(aFaixa: [number, number], bFaixa: [number, number], delta: number): Contagem {
  for (let r = 1; r <= RODADAS; r++) {
    escreverTrace('A', r, aFaixa[0], aFaixa[1], 0);
    escreverTrace('B', r, bFaixa[0], bFaixa[1], delta);
  }
  const saida = execFileSync('node', [script, dir], { encoding: 'utf8' });
  const linha = saida.split('\n').find((l) => l.includes('VEREDITO')) ?? '';
  const m = linha.match(/(\d+) faixa\(s\) melhoram, (\d+) pioram/);
  if (!m) throw new Error(`o relatorio nao emitiu veredito:\n${saida}`);
  return { melhoram: Number(m[1]), pioram: Number(m[2]) };
}

const MESMA_FAIXA: [number, number] = [100, 200];

describe('ab-report — casos de resposta conhecida', () => {
  it('trajetórias diferentes com o MESMO custo por draw não viram diferença', () => {
    // B viu mais objetos. A mediana geral vai acusar piora; o relatório não pode.
    const r = rodar([100, 180], [140, 220], 0);
    expect(r.melhoram).toBe(0);
    expect(r.pioram).toBe(0);
  });

  it('sem efeito nenhum, nenhuma faixa acusa (a correção de múltiplas comparações)', () => {
    const r = rodar(MESMA_FAIXA, MESMA_FAIXA, 0);
    expect(r.melhoram).toBe(0);
    expect(r.pioram).toBe(0);
  });

  it('detecta ganho de 2 ms', () => {
    const r = rodar(MESMA_FAIXA, MESMA_FAIXA, -2);
    expect(r.melhoram).toBeGreaterThan(0);
    expect(r.pioram).toBe(0);
  });

  it('detecta ganho de 0,5 ms — o piso de sensibilidade documentado no TDR', () => {
    const r = rodar(MESMA_FAIXA, MESMA_FAIXA, -0.5);
    expect(r.melhoram).toBeGreaterThan(0);
    expect(r.pioram).toBe(0);
  });

  it('acusa PIORA quando a mudança custa caro', () => {
    const r = rodar(MESMA_FAIXA, MESMA_FAIXA, 1);
    expect(r.pioram).toBeGreaterThan(0);
    expect(r.melhoram).toBe(0);
  });
});
