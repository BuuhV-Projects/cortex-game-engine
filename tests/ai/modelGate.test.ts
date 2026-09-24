/**
 * Portão do modelo 3D (SPEC-0267). Os limites vêm da medida do kart-racer: o
 * custo é material, não triângulo — e escala fora do real é unidade errada.
 */
import { describe, it, expect, vi } from 'vitest';
import { judgeModel, MAX_MATERIALS_LARGE, MAX_MATERIALS_SMALL, MAX_MODEL_ATTEMPTS } from '../../src/ai/modelGate.js';
import type { ValidateResult } from '../../src/ai/validateGeneratedModel.js';

function validation(sizeM: number, materialsAfter: number, triangles = 1000): ValidateResult {
  const stats = { nodes: 1, meshes: 1, primitives: materialsAfter, materials: materialsAfter, textures: 0, triangles };
  return {
    refino: { antes: stats, depois: stats, avisos: [], protegidos: [] },
    inspecao: { size: { largura: sizeM, altura: sizeM / 2, profundidade: sizeM / 3 }, triangulos: triangles, materiais: [], malhas: 1 },
    previewPath: null,
    problemas: [],
  };
}

describe('judgeModel', () => {
  it('aprova peça pequena dentro do teto', () => {
    expect(judgeModel(validation(0.6, MAX_MATERIALS_SMALL))).toEqual({ approved: true, reasons: [], judged: true });
  });

  it('reprova peça pequena acima de 4 materiais, explicando como corrigir', () => {
    const verdict = judgeModel(validation(0.6, MAX_MATERIALS_SMALL + 1));
    expect(verdict.approved).toBe(false);
    expect(verdict.reasons[0]).toMatch(/5 materiais.*peça pequena.*é 4.*UM material/s);
  });

  it('objeto grande usa o teto de 8, com a borda em 2 m', () => {
    expect(judgeModel(validation(2, MAX_MATERIALS_LARGE)).approved).toBe(true);
    expect(judgeModel(validation(1.99, MAX_MATERIALS_LARGE)).approved).toBe(false);
    expect(judgeModel(validation(4.2, MAX_MATERIALS_LARGE + 1)).approved).toBe(false);
  });

  it('reprova escala em unidade errada, dos dois lados', () => {
    expect(judgeModel(validation(420, 2)).approved).toBe(true);
    expect(judgeModel(validation(4200, 2)).reasons[0]).toMatch(/escala fora do real/);
    expect(judgeModel(validation(0.004, 2)).reasons[0]).toMatch(/METROS/);
  });

  it('reprova modelo sem geometria', () => {
    expect(judgeModel(validation(1, 2, 0)).reasons[0]).toMatch(/0 triângulos/);
  });

  it('sem inspeção não julga — falta de ferramenta não é defeito do modelo', () => {
    expect(judgeModel(null)).toEqual({ approved: true, reasons: [], judged: false });
    expect(judgeModel({ ...validation(1, 20), inspecao: null })).toMatchObject({ approved: true, judged: false });
  });
});

// ─── Laço do gerador: Codex, Blender e validação falsos ─────────────────────
const codex = vi.hoisted(() => ({ calls: [] as string[], replies: [] as string[] }));
const validations = vi.hoisted(() => ({ queue: [] as unknown[] }));

vi.mock('../../src/ai/CodexClient.js', () => ({
  CODEX_MODEL: 'fake',
  queryCodex: async (_system: string, request: string) => {
    codex.calls.push(request);
    return '```python\n' + (codex.replies.shift() ?? 'print("ok")') + '\n```';
  },
}));
vi.mock('../../src/ai/validateGeneratedModel.js', () => ({
  validateGeneratedModel: async () => validations.queue.shift() ?? null,
}));

describe('BlenderModelGenerator com o portão', () => {
  async function generator() {
    const { BlenderModelGenerator } = await import('../../src/ai/BlenderModelGenerator.js');
    const { writeFileSync } = await import('node:fs');
    // Blender falso: só escreve o .glb que o script "exportaria".
    return new BlenderModelGenerator({
      runBlender: async (_bin, scriptPath) => {
        const { readFileSync } = await import('node:fs');
        const out = /OUTPUT_PATH = "(.*)"/.exec(readFileSync(scriptPath, 'utf-8'))![1]!;
        writeFileSync(JSON.parse(`"${out}"`), 'glb');
      },
    });
  }

  async function tmpGlb() {
    const { mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    return join(mkdtempSync(join(tmpdir(), 'gate-')), 'carro.glb');
  }

  it('reprovado volta ao Astra com os motivos e o script anterior, e aprova na correção', async () => {
    codex.calls.length = 0;
    codex.replies.push('script_ruim()', 'script_bom()');
    validations.queue.push(validation(4, 20), validation(4, 6));
    const result = await (await generator()).generate('um carro', await tmpGlb());
    expect(result.attempts).toBe(2);
    expect(result.verdict.approved).toBe(true);
    expect(codex.calls[1]).toMatch(/um carro[\s\S]*REPROVADO[\s\S]*20 materiais[\s\S]*script_ruim\(\)/);
  });

  it('esgota o limite e entrega com os motivos', async () => {
    codex.calls.length = 0;
    for (let i = 0; i < MAX_MODEL_ATTEMPTS; i++) validations.queue.push(validation(4, 20));
    const result = await (await generator()).generate('um carro', await tmpGlb());
    expect(result.attempts).toBe(MAX_MODEL_ATTEMPTS);
    expect(result.verdict.approved).toBe(false);
    expect(codex.calls).toHaveLength(MAX_MODEL_ATTEMPTS);
  });

  it('sem inspeção não repete (ferramenta ausente)', async () => {
    codex.calls.length = 0;
    validations.queue.push(null);
    const result = await (await generator()).generate('um carro', await tmpGlb());
    expect(result.attempts).toBe(1);
    expect(codex.calls).toHaveLength(1);
  });
});
