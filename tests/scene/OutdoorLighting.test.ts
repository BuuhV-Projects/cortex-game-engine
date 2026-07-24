/**
 * Iluminação externa — o **far plane da sombra** com CSM ligado.
 *
 * Regressão real: as cascatas CLONAM `light.shadow`, e a cada frame o three
 * planta a luz de cada cascata RECUADA de `lightMargin`. Com o `far` do caminho
 * sem CSM (`shadowArea * 4` = 240) e a margem padrão (200), sobravam ~40u de
 * profundidade útil — a sombra era **cortada por uma reta** no meio da cena, e
 * o corte APARECIA E SUMIA conforme a câmera se movia (a caixa da cascata
 * desliza no espaço da luz e cruza o far plane).
 *
 * O teste é sobre a CONTA, não sobre pixels: `far` tem de cobrir a margem mais
 * o alcance das cascatas.
 */
import { describe, it, expect } from 'vitest';
import { Scene as ThreeScene } from 'three';
import { setupOutdoorLighting } from '../../src/scene/OutdoorLighting.js';
import type { Scene } from '../../src/core/Scene.js';
import type { Renderer } from '../../src/core/Renderer.js';

/** Cena/renderer mínimos: só o que o `setupOutdoorLighting` toca. */
function harness(): { scene: Scene; renderer: Renderer } {
  const three = new ThreeScene();
  const scene = {
    add: (o: unknown) => three.add(o as never),
    getThreeScene: () => three,
  } as unknown as Scene;
  const renderer = {
    threeRenderer: {
      toneMapping: 0,
      toneMappingExposure: 1,
      shadowMap: { enabled: false, type: 0 },
    },
  } as unknown as Renderer;
  return { scene, renderer };
}

describe('setupOutdoorLighting — far plane da sombra', () => {
  it('com CSM, o far cobre lightMargin + shadowDistance', () => {
    const { scene, renderer } = harness();
    const lightMargin = 200;
    const shadowDistance = 190;
    const { sun } = setupOutdoorLighting(renderer, scene, {
      csm: true,
      lightMargin,
      shadowDistance,
    });
    // REGRESSÃO: aqui valia 240 (shadowArea*4) — menos que a própria margem.
    expect(sun.shadow.camera.far).toBeGreaterThanOrEqual(lightMargin + shadowDistance);
  });

  it('cascata mais distante cabe INTEIRA entre a luz e o far', () => {
    const { scene, renderer } = harness();
    const { sun } = setupOutdoorLighting(renderer, scene, {
      csm: true,
      lightMargin: 300,
      shadowDistance: 400,
    });
    // A luz recua `lightMargin` do fundo da caixa; a caixa tem no máximo
    // `shadowDistance` de profundidade. Sem folga, o vulto mais fundo é clipado.
    expect(sun.shadow.camera.far).toBeGreaterThan(300 + 400);
  });

  it('SEM csm, mantém o far histórico (shadowArea × 4)', () => {
    const { scene, renderer } = harness();
    const shadowArea = 60;
    const { sun } = setupOutdoorLighting(renderer, scene, { shadowArea });
    expect(sun.shadow.camera.far).toBe(shadowArea * 4);
  });

  it('sem sombras, não configura castShadow', () => {
    const { scene, renderer } = harness();
    const { sun } = setupOutdoorLighting(renderer, scene, { shadows: false });
    expect(sun.castShadow).toBe(false);
  });
});
