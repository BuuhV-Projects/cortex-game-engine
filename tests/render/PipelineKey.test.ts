import { describe, it, expect } from 'vitest';
import type { MaterialDesc } from '../../src/render/MaterialDesc.js';
import {
  countDistinctPipelines,
  pipelineKey,
  unpackPipelineKey,
  type PipelineContext,
} from '../../src/render/PipelineKey.js';

const CONTEXT: PipelineContext = { vertexLayoutId: 1, targetFormatId: 2 };

function material(overrides: Partial<MaterialDesc> = {}): MaterialDesc {
  return {
    shading: 'standard',
    color: [1, 1, 1],
    opacity: 1,
    blend: 'opaque',
    metalness: 0,
    roughness: 1,
    emissive: [0, 0, 0],
    doubleSided: false,
    toneMapped: true,
    baseTextureId: null,
    outlineThickness: null,
    ...overrides,
  };
}

describe('pipelineKey', () => {
  it('ignora o que é uniform — cor não multiplica pipeline', () => {
    // É o ponto do marco: pôr cor na chave criaria um pipeline por instância de
    // cor, que é exatamente o custo que este cache existe para evitar.
    const vermelho = material({ color: [1, 0, 0], metalness: 0.9, roughness: 0.1 });
    const azul = material({ color: [0, 0, 1], metalness: 0.2, roughness: 0.8 });

    expect(pipelineKey(vermelho, CONTEXT)).toBe(pipelineKey(azul, CONTEXT));
  });

  it('separa o que muda o pipeline', () => {
    const base = material();
    const chaves = new Set([
      pipelineKey(base, CONTEXT),
      pipelineKey(material({ shading: 'outline' }), CONTEXT),
      pipelineKey(material({ blend: 'blend' }), CONTEXT),
      pipelineKey(material({ doubleSided: true }), CONTEXT),
      pipelineKey(material({ toneMapped: false }), CONTEXT),
      pipelineKey(material({ baseTextureId: 'abc' }), CONTEXT),
      pipelineKey(base, { vertexLayoutId: 9, targetFormatId: 2 }),
      pipelineKey(base, { vertexLayoutId: 1, targetFormatId: 9 }),
    ]);

    // Oito variações, oito pipelines distintos: nenhuma colide com outra.
    expect(chaves.size).toBe(8);
  });

  it('desempacota o que empacotou', () => {
    const desc = material({ shading: 'toon', blend: 'blend', doubleSided: true, baseTextureId: 'x' });
    const chave = pipelineKey(desc, { vertexLayoutId: 7, targetFormatId: 3 });

    expect(unpackPipelineKey(chave)).toEqual({
      shading: 'toon',
      blend: true,
      doubleSided: true,
      toneMapped: true,
      hasBaseTexture: true,
      vertexLayoutId: 7,
      targetFormatId: 3,
    });
  });

  it('conta pipelines distintos de um conjunto', () => {
    const resultado = countDistinctPipelines(
      [
        material({ color: [1, 0, 0] }),
        material({ color: [0, 1, 0] }),
        material({ shading: 'outline' }),
        material({ shading: 'outline', color: [0, 0, 1] }),
      ],
      CONTEXT,
    );

    expect(resultado.total).toBe(4);
    expect(resultado.distinct).toBe(2);
    expect(resultado.byShading['outline']).toBe(2);
  });
});
