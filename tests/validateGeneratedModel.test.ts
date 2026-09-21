import { describe, it, expect } from 'vitest';
import { describeValidation, validateGeneratedModel } from '../src/ai/validateGeneratedModel.js';

describe('validateGeneratedModel', () => {
  it('não lança quando os scripts não existem — só relata', async () => {
    // Modelo válido não deixa de ser entregue porque a validação falhou; o
    // Chat IA precisa do motivo, não de uma exceção.
    const resultado = await validateGeneratedModel('C:/nao/existe/modelo.glb', {
      scriptsDir: 'C:/nao/existe/scripts',
      blenderBin: 'blender-que-nao-existe',
    });

    expect(resultado.refino).toBeNull();
    expect(resultado.inspecao).toBeNull();
    expect(resultado.problemas.length).toBe(2);
    expect(resultado.problemas.join(' ')).toContain('refino');
  });
});

describe('describeValidation', () => {
  it('resume o ganho do refino em linguagem de gente', () => {
    const linhas = describeValidation({
      refino: {
        antes: { nodes: 1, meshes: 1, primitives: 6, materials: 6, textures: 0, triangles: 900 },
        depois: { nodes: 1, meshes: 1, primitives: 1, materials: 1, textures: 2, triangles: 900 },
        avisos: ['6 materiais (acima de 4)'],
        protegidos: [],
      },
      inspecao: {
        size: { largura: 0.29, altura: 1.02, profundidade: 1.02 },
        triangulos: 900,
        materiais: ['PaletteMaterial001'],
        malhas: 1,
      },
      previewPath: 'C:/tmp/roda.preview.png',
      problemas: [],
    });

    expect(linhas[0]).toContain('materiais 6 → 1');
    expect(linhas.join('\n')).toContain('aviso: 6 materiais');
    expect(linhas.join('\n')).toContain('0.29 × 1.02 × 1.02 m');
  });

  it('diz quando não havia o que fundir', () => {
    const stats = { nodes: 1, meshes: 1, primitives: 1, materials: 1, textures: 0, triangles: 10 };
    const linhas = describeValidation({
      refino: { antes: stats, depois: stats, avisos: [], protegidos: [] },
      inspecao: null,
      previewPath: null,
      problemas: [],
    });

    expect(linhas[0]).toContain('já estava enxuto');
  });
});
