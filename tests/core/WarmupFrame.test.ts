/**
 * Quadro de aquecimento (SPEC-0263): revela a árvore inteira para um render e
 * devolve cada objeto EXATAMENTE ao estado anterior — inclusive os que já
 * nasceram escondidos ou sem culling de propósito (efeitos, chama do escape).
 */
import { describe, it, expect } from 'vitest';
import { Group, Mesh, Scene } from 'three';
import { drawWithParallelPipelines, revealForWarmup } from '../../src/core/WarmupFrame.js';

function tree() {
  const scene = new Scene();
  const hiddenEffect = new Mesh();
  hiddenEffect.visible = false; // efeito que nasce escondido até o uso
  const flame = new Mesh();
  flame.frustumCulled = false; // desligado de propósito pelo jogo
  const parent = new Group();
  parent.visible = false; // pai escondido: o filho não desenharia
  const child = new Mesh();
  parent.add(child);
  scene.add(hiddenEffect, flame, parent);
  return { scene, hiddenEffect, flame, parent, child };
}

describe('revealForWarmup', () => {
  it('revela tudo e desliga o culling para o render', () => {
    const { scene } = tree();
    revealForWarmup(scene);
    scene.traverse((o) => {
      expect(o.visible).toBe(true);
      expect(o.frustumCulled).toBe(false);
    });
  });

  it('restaura o estado anterior de cada objeto', () => {
    const { scene, hiddenEffect, flame, parent, child } = tree();
    const restore = revealForWarmup(scene);
    restore();
    expect(hiddenEffect.visible).toBe(false);
    expect(hiddenEffect.frustumCulled).toBe(true);
    expect(flame.frustumCulled).toBe(false); // não vira true na volta
    expect(parent.visible).toBe(false);
    expect(child.visible).toBe(true);
  });
});

/** `Pipelines` falso do three: `getForRender` com lista empurra uma promessa (criação assíncrona). */
class FakePipelines {
  sync = 0;
  updateForRender(ro: unknown): void {
    this.getForRender(ro, null);
  }
  getForRender(_ro: unknown, promises: Promise<unknown>[] | null): void {
    if (promises) promises.push(Promise.resolve());
    else this.sync++;
  }
}

describe('drawWithParallelPipelines (ADR-0310)', () => {
  const OBJECTS = 3;

  it('no quadro, cada pipeline vira promessa (assíncrono, todos juntos)', async () => {
    const pipelines = new FakePipelines();
    const promises = drawWithParallelPipelines({ _pipelines: pipelines }, () => {
      for (let i = 0; i < OBJECTS; i++) pipelines.updateForRender({});
    });
    expect(promises).toHaveLength(OBJECTS);
    expect(pipelines.sync).toBe(0);
    await Promise.all(promises);
  });

  it('restaura o caminho síncrono depois — mesmo se o desenho lançar', () => {
    const pipelines = new FakePipelines();
    expect(() =>
      drawWithParallelPipelines({ _pipelines: pipelines }, () => {
        throw new Error('render falhou');
      }),
    ).toThrow('render falhou');
    expect(Object.prototype.hasOwnProperty.call(pipelines, 'updateForRender')).toBe(false);
    pipelines.updateForRender({});
    expect(pipelines.sync).toBe(1);
  });

  it('three sem o caminho esperado: desenha normal e não há o que esperar', () => {
    let drawn = 0;
    expect(drawWithParallelPipelines({}, () => drawn++)).toEqual([]);
    expect(drawWithParallelPipelines(null, () => drawn++)).toEqual([]);
    expect(drawn).toBe(2);
  });
});
