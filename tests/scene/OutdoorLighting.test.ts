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
import {
  Scene as ThreeScene,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { setupOutdoorLighting } from '../../src/scene/OutdoorLighting.js';
import type { Scene } from '../../src/core/Scene.js';
import type { Renderer } from '../../src/core/Renderer.js';

/** O nó CSM interno, com os campos privados que o teste do E7 precisa ver. */
type CsmSondado = {
  updateBefore(frame: never): void;
  _nativoAssumiu: boolean;
  camera: unknown;
};

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

/**
 * E7 da SPEC-0245 — o `cullShadowCasters` não roda quando o C++ desenha.
 *
 * Com o passe de sombra nativo assumindo o frame, a travessia do filtro
 * angular vira trabalho ÓRFÃO: ela percorre ~1.300 nós para mutar um
 * `castShadow` que ninguém mais lê, porque o enumerador em C++ reaplica o
 * mesmo filtro a partir do valor AUTORADO. O que estes testes protegem é a
 * volta: no frame em que o nativo recusa, o `three` volta a desenhar a sombra
 * e precisa do `castShadow` deste frame — não do que sobrou de 10 frames atrás.
 */
describe('setupOutdoorLighting — E7: culling em JS só quando o three desenha', () => {
  /** O nó CSM que o preset instala, já com o `super.updateBefore` neutralizado. */
  function csmDoPreset(camera: PerspectiveCamera): { csm: CsmSondado; longe: Mesh } {
    const { scene, renderer } = harness();
    const { sun } = setupOutdoorLighting(renderer, scene, { csm: true });
    const csm = (sun.shadow as unknown as { shadowNode: CsmSondado }).shadowNode;
    // O `super` posiciona cascatas e precisa de renderer de verdade; o que
    // este teste observa acontece FORA dele.
    Object.getPrototypeOf(Object.getPrototypeOf(csm)).updateBefore = () => undefined;
    // Já "viu" esta câmera: `updateFrustums` recompõe as cascatas e exige o
    // estado que só o primeiro `setup` do renderer cria.
    csm.camera = camera;
    // Malha minúscula e distante: o filtro angular tira a sombra dela, então
    // `castShadow` vira o sinal observável de que a travessia rodou.
    const longe = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial());
    longe.position.set(0, 0, 500);
    longe.castShadow = true;
    longe.updateMatrixWorld(true);
    return { csm, longe };
  }

  /**
   * Um frame do `three` com o mínimo que o `updateBefore` lê. A câmera é uma
   * `PerspectiveCamera` de verdade porque o CSM recompõe as cascatas na
   * primeira vez que vê uma câmera nova.
   */
  function frameFalso(cena: ThreeScene, camera: PerspectiveCamera): unknown {
    return { camera, scene: cena };
  }

  it('roda o culling quando o passe nativo não assume', () => {
    const camera = new PerspectiveCamera();
    const { csm, longe } = csmDoPreset(camera);
    const cena = new ThreeScene();
    cena.add(longe);

    csm.updateBefore(frameFalso(cena, camera) as never);

    // Sem host, `_desenharPasseDeSombraNativo` sai cedo e o `three` continua
    // dono do passe — a travessia precisa ter rodado.
    expect(longe.castShadow).toBe(false);
  });

  it('não roda o culling enquanto o passe nativo assume, e volta a rodar na recusa', () => {
    const camera = new PerspectiveCamera();
    const { csm, longe } = csmDoPreset(camera);
    const cena = new ThreeScene();
    cena.add(longe);
    // Assumiu no frame anterior: a travessia é trabalho órfão.
    csm['_nativoAssumiu'] = true;

    csm.updateBefore(frameFalso(cena, camera) as never);
    expect(longe.castShadow).toBe(true); // intocado: ninguém percorreu a cena

    // O nativo recusa (não há host): a sombra volta a ser do `three`, e o
    // culling tem de rodar NO MESMO frame — esperar o intervalo de 10 frames
    // deixaria o `three` desenhar com `castShadow` de dez frames atrás.
    csm.updateBefore(frameFalso(cena, camera) as never);
    expect(longe.castShadow).toBe(false);
  });
});
