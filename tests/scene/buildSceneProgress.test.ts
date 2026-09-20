/**
 * Progresso e cessão de frame no build (SPEC-0219): a montagem avisa em que
 * etapa está e devolve o controle ao host durante a carga — sem isso, no export
 * nativo nada é apresentado até o fim (nem a splash da engine).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scene } from '../../src/core/Scene.js';
import { inLoadingScope, resetFrameBudget } from '../../src/core/frameYield.js';
import { buildScene, isSceneBuilding, type BuildProgress } from '../../src/scene/SceneBuilder.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

function sceneWith(n: number): SceneDefinition {
  return {
    version: 1,
    nodes: Array.from({ length: n }, (_, i) => ({
      type: 'primitive' as const,
      id: `n${i}`,
      shape: 'box' as const,
      size: 1,
      place: { x: i, y: 0 },
    })),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('buildScene — progresso', () => {
  it('reporta as etapas da montagem', async () => {
    const fases: BuildProgress['phase'][] = [];
    await buildScene(new Scene(), sceneWith(3), {
      onProgress: (p) => { fases.push(p.phase); },
    });
    // 'nós' só aparece se a montagem estourar o orçamento de tempo; as trocas
    // de etapa são reportadas sempre.
    expect(fases).toContain('cena');
    expect(fases).toContain('física');
    expect(fases).toContain('merge');
  });

  it('informa done/total/fraction coerentes', async () => {
    const vistos: BuildProgress[] = [];
    await buildScene(new Scene(), sceneWith(4), {
      onProgress: (p) => { vistos.push({ ...p }); },
    });
    const final = vistos[vistos.length - 1]!;
    expect(final.total).toBe(4);
    expect(final.done).toBe(4);
    expect(final.fraction).toBeGreaterThanOrEqual(0);
    expect(final.fraction).toBeLessThanOrEqual(1);
  });

  it('aguarda o callback assíncrono antes de seguir', async () => {
    const ordem: string[] = [];
    await buildScene(new Scene(), sceneWith(2), {
      onProgress: async (p) => {
        ordem.push(`inicio:${p.phase}`);
        await Promise.resolve();
        ordem.push(`fim:${p.phase}`);
      },
    });
    // nenhum "inicio" fica pendente quando o próximo começa
    for (let i = 0; i < ordem.length; i += 2) {
      expect(ordem[i]!.startsWith('inicio:')).toBe(true);
      expect(ordem[i + 1]!.startsWith('fim:')).toBe(true);
    }
  });

  it('monta a cena normalmente sem onProgress', async () => {
    const handle = await buildScene(new Scene(), sceneWith(3));
    expect(handle.byId.size).toBe(3);
  });

  it('deixa a exceção do callback derrubar o build (erro do jogo não é engolido)', async () => {
    await expect(
      buildScene(new Scene(), sceneWith(2), {
        onProgress: () => { throw new Error('a UI quebrou'); },
      }),
    ).rejects.toThrow('a UI quebrou');
  });

  it('cede o frame durante a montagem quando há rAF', async () => {
    let cessoes = 0;
    (globalThis as Record<string, unknown>)['requestAnimationFrame'] = (cb: () => void): number => {
      cessoes++;
      setTimeout(cb, 0);
      return cessoes;
    };
    // Date.now avançando 200ms por leitura força o orçamento a estourar sempre.
    let agora = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (agora += 200));
    resetFrameBudget(); // sincroniza o orçamento do módulo com o relógio de mentira
    try {
      await buildScene(new Scene(), sceneWith(3));
      expect(cessoes).toBeGreaterThan(0);
    } finally {
      delete (globalThis as Record<string, unknown>)['requestAnimationFrame'];
    }
  });

  it('marca a cena como em montagem durante o build (o Game não desenha cena pela metade)', async () => {
    const scene = new Scene();
    const outra = new Scene();
    let durante = false;
    let cargaDeclarada = false;
    expect(isSceneBuilding(scene)).toBe(false);
    await buildScene(scene, sceneWith(2), {
      onProgress: () => {
        durante = isSceneBuilding(scene);
        cargaDeclarada = inLoadingScope();
      },
    });
    expect(durante).toBe(true);
    expect(cargaDeclarada).toBe(true);
    // e larga a marca no fim — inclusive pra outra cena, que nunca foi montada
    expect(isSceneBuilding(scene)).toBe(false);
    expect(isSceneBuilding(outra)).toBe(false);
    expect(inLoadingScope()).toBe(false);
  });

  it('larga a marca mesmo quando o build falha', async () => {
    const scene = new Scene();
    await expect(
      buildScene(scene, sceneWith(2), {
        onProgress: () => { throw new Error('falhou no meio'); },
      }),
    ).rejects.toThrow('falhou no meio');
    expect(isSceneBuilding(scene)).toBe(false);
    expect(inLoadingScope()).toBe(false);
  });
});
