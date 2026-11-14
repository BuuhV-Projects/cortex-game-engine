/**
 * Paridade da escolha de cascata do receptor nativo com o `CSMShadowNode` do three (SPEC-0690, item 5): a função
 * pura que o WGSL `nativeShadowCsm` reproduz contra uma transcrição linha a linha do `_setupFade` /
 * `_setupStandard` (three 0.184), em pontos da emenda. O texto do three também é conferido, para um upgrade que
 * mude a fórmula quebrar aqui e não na tela.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { csmShadowFactor, viewZToOrthographicDepth } from '../../../src/scene/csm/csmCascadeMath.js';
import { csmWgsl } from '../../../src/render/native/frame/shadowWgsl.js';

const THREE_CSM = resolve(__dirname, '../../../node_modules/three/examples/jsm/csm/CSMShadowNode.js');

/** Duas cascatas como as do DDD 00 (frações de shadowFar) e três como o padrão da engine. */
const TWO = [0, 0.3, 0.3, 1];
const THREE = [0, 0.12, 0.12, 0.4, 0.4, 1];
/** Fator de cada cascata no ponto (0 = sombra): valores distintos para a mistura aparecer. */
const SAMPLES = [0.2, 0.6, 0.45];
const sample = (i: number) => SAMPLES[i]!;
/** Passo da varredura e o salto máximo entre dois pontos vizinhos com fade. */
const STEP = 1e-4;
const MAX_JUMP = 1e-2;

/** `_setupFade` do three, transcrito: `ret` começa em 1 e cada cascata em alcance tira `(1 - s) · ratio`. */
function threeSetupFade(linearDepth: number, cascades: number[], shadowNodes: number[]): number {
  let ret = 1;
  const lastCascade = cascades.length / 2 - 1;
  for (let i = 0; i < cascades.length / 2; i++) {
    const isLastCascade = i === lastCascade;
    const cascade = { x: cascades[2 * i]!, y: cascades[2 * i + 1]! };
    const cascadeCenter = (cascade.x + cascade.y) / 2.0;
    const closestEdge = linearDepth < cascadeCenter ? cascade.x : cascade.y;
    const margin = 0.25 * Math.pow(closestEdge, 2.0);
    const csmX = cascade.x - margin / 2.0;
    const csmY = isLastCascade ? cascade.y : cascade.y + margin / 2.0;
    const inRange = linearDepth >= csmX && linearDepth <= csmY;
    if (inRange) {
      const dist = Math.min(linearDepth - csmX, csmY - linearDepth);
      let ratio = Math.min(Math.max(dist / margin, 0.0), 1.0);
      if (i === 0) ratio = linearDepth > cascadeCenter ? ratio : 1;
      ret -= (1 - shadowNodes[i]!) * ratio;
    }
  }
  return ret;
}

/** `_setupStandard` do three, transcrito: a última cascata em alcance vence. */
function threeSetupStandard(linearDepth: number, cascades: number[], shadowNodes: number[]): number {
  let ret = 1;
  for (let i = 0; i < cascades.length / 2; i++) {
    if (linearDepth >= cascades[2 * i]! && linearDepth <= cascades[2 * i + 1]!) ret = shadowNodes[i]!;
  }
  return ret;
}

/** Pontos de interesse: bordas, centros e as margens de cada emenda. */
function seamPoints(cascades: number[]): number[] {
  const points = [0, 0.5, 1, 1.05, -0.01];
  for (let i = 0; i < cascades.length; i++) {
    const edge = cascades[i]!;
    const margin = 0.25 * edge * edge;
    points.push(edge, edge - margin / 2, edge + margin / 2, edge - margin / 4, edge + margin / 4);
  }
  return points;
}

describe('csmShadowFactor = CSMShadowNode do three (SPEC-0690)', () => {
  it('com fade: igual ao _setupFade em todos os pontos da emenda, com 2 e 3 cascatas', () => {
    for (const ranges of [TWO, THREE]) {
      for (const x of seamPoints(ranges)) {
        expect(csmShadowFactor(x, ranges, ranges.length / 2, true, sample)).toBeCloseTo(threeSetupFade(x, ranges, SAMPLES), 12);
      }
    }
  });

  it('sem fade: igual ao _setupStandard (a última cascata em alcance vence, 1 fora de todas)', () => {
    for (const ranges of [TWO, THREE]) {
      for (const x of seamPoints(ranges)) {
        expect(csmShadowFactor(x, ranges, ranges.length / 2, false, sample)).toBe(threeSetupStandard(x, ranges, SAMPLES));
      }
    }
    expect(csmShadowFactor(0.3, TWO, 2, false, sample)).toBe(SAMPLES[1]);
    expect(csmShadowFactor(1.2, TWO, 2, false, sample)).toBe(1);
  });

  it('com fade a emenda é contínua (sem degrau na troca de cascata) e além da última cascata é luz', () => {
    let previous = csmShadowFactor(0, TWO, 2, true, sample);
    for (let x = STEP; x <= 1.1; x += STEP) {
      const value = csmShadowFactor(x, TWO, 2, true, sample);
      expect(Math.abs(value - previous)).toBeLessThan(MAX_JUMP);
      previous = value;
    }
    expect(csmShadowFactor(1.1, TWO, 2, true, sample)).toBe(1);
    // Perto da câmera a cascata 0 não esmaece.
    expect(csmShadowFactor(0.01, TWO, 2, true, sample)).toBeCloseTo(SAMPLES[0]!, 12);
  });

  it('cascata desligada (fator 1) não escurece a emenda nem o miolo dela', () => {
    const offOne = (i: number) => (i === 1 ? 1 : SAMPLES[i]!);
    expect(csmShadowFactor(0.7, TWO, 2, true, offOne)).toBe(1);
    expect(csmShadowFactor(0.1, TWO, 2, true, offOne)).toBeCloseTo(SAMPLES[0]!, 12);
  });

  it('só amostra as cascatas que pesam no ponto, como o ramo do WGSL', () => {
    const asked: number[] = [];
    csmShadowFactor(0.1, TWO, 2, true, (i) => {
      asked.push(i);
      return SAMPLES[i]!;
    });
    expect(asked).toEqual([0]);
  });

  it('viewZToOrthographicDepth é a do three: near = 0, far = 1 (z de visão negativo à frente)', () => {
    expect(viewZToOrthographicDepth(-0.5, 0.5, 100)).toBeCloseTo(0, 12);
    expect(viewZToOrthographicDepth(-100, 0.5, 100)).toBeCloseTo(1, 12);
    expect(viewZToOrthographicDepth(-50.25, 0.5, 100)).toBeCloseTo(0.5, 12);
  });

  it('o three ainda usa esta fórmula, e o WGSL nativo também', () => {
    const three = readFileSync(THREE_CSM, 'utf8');
    expect(three).toContain('margin.assign( float( 0.25 ).mul( closestEdge.pow( 2.0 ) ) )');
    expect(three).toContain('csmX.assign( cascade.x.sub( margin.div( 2.0 ) ) )');
    expect(three).toContain('csmY.assign( cascade.y.add( margin.div( 2.0 ) ) )');
    expect(three).toContain('ratio = linearDepth.greaterThan( cascadeCenter ).select( ratio, 1 )');
    expect(three).toContain('ret.subAssign( this._shadowNodes[ i ].oneMinus().mul( ratio ) )');
    expect(three).toContain('viewZToOrthographicDepth( positionView.z, cameraNear, shadowFar )');
    const CSM_WGSL = csmWgsl(2);
    expect(CSM_WGSL).toContain('let margin = 0.25 * (closestEdge * closestEdge);');
    expect(CSM_WGSL).toContain('let csmX = cascade.x - margin / 2.0;');
    expect(CSM_WGSL).toContain('var csmY = cascade.y + margin / 2.0;');
    expect(CSM_WGSL).toContain('ratio = select(1.0, ratio, linearDepth > cascadeCenter);');
    // SPEC-0732: uma chamada por cascata; o fade escolhe a fórmula (sem fade, a última em alcance vence).
    expect(CSM_WGSL).toContain('ret = select(factor, ret - (1.0 - factor) * ratio, fade);');
    expect(CSM_WGSL).toContain('let linearDepth = (positionView.z + g.x) / (g.x - g.y);');
  });
});
