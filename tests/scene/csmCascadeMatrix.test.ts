/**
 * SPEC-0680 §2: o `CSMShadowNode.updateBefore` do three move a luz e o alvo de cada cascata no meio do render. Com
 * a travessia única por render, o `CameraFollowingCSM` atualiza a matriz de mundo deles ali mesmo — senão o
 * `shadow.updateMatrices` de cada cascata leria a pose do quadro anterior.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectionalLight, PerspectiveCamera, Scene as ThreeScene, Vector3 } from 'three';
import { setupOutdoorLighting } from '../../src/scene/OutdoorLighting.js';
import type { Scene } from '../../src/core/Scene.js';
import type { Renderer } from '../../src/core/Renderer.js';

const espelho = vi.hoisted(() => ({ atual: undefined as { installed: boolean } | undefined }));
vi.mock('../../src/core/NativeSceneMirror.js', () => ({ activeSceneMirror: () => espelho.atual }));

type CsmSondado = { updateBefore(frame: never): void; camera: unknown; lights: DirectionalLight[] };

const CASCADES = 2;

function csmComLuzesDeVerdade(): { csm: CsmSondado; three: ThreeScene; camera: PerspectiveCamera } {
  const three = new ThreeScene();
  const scene = { add: (o: unknown) => three.add(o as never), getThreeScene: () => three } as unknown as Scene;
  const renderer = {
    threeRenderer: { toneMapping: 0, toneMappingExposure: 1, shadowMap: { enabled: false, type: 0 } },
  } as unknown as Renderer;
  const { sun } = setupOutdoorLighting(renderer, scene, { csm: true, shadowCascades: CASCADES });
  const csm = (sun.shadow as unknown as { shadowNode: CsmSondado }).shadowNode;
  // O `super` do three (precisa de renderer de verdade) é trocado por um que só move as cascatas, como ele faz.
  Object.getPrototypeOf(Object.getPrototypeOf(csm)).updateBefore = function mover(this: CsmSondado): void {
    this.lights.forEach((luz, i) => {
      luz.position.set(10 * (i + 1), 0, 0);
      luz.target.position.set(10 * (i + 1), 0, -1);
    });
  };
  const camera = new PerspectiveCamera();
  csm.camera = camera;
  for (let i = 0; i < CASCADES; i++) {
    const luz = new DirectionalLight();
    three.add(luz, luz.target);
    csm.lights.push(luz);
  }
  three.updateMatrixWorld(); // a travessia única do render, ANTES do updateBefore
  return { csm, three, camera };
}

describe('CameraFollowingCSM atualiza a matriz das cascatas que move (SPEC-0680)', () => {
  afterEach(() => {
    espelho.atual = undefined;
  });

  it('luz e alvo de cada cascata saem do updateBefore com o matrixWorld da pose nova', () => {
    const { csm, three, camera } = csmComLuzesDeVerdade();
    csm.updateBefore({ camera, scene: three } as never);
    csm.lights.forEach((luz, i) => {
      expect(new Vector3().setFromMatrixPosition(luz.matrixWorld).x).toBe(10 * (i + 1));
      expect(new Vector3().setFromMatrixPosition(luz.target.matrixWorld).z).toBe(-1);
    });
  });

  it('cascata sem updateMatrixWorld (forma mínima) não quebra o quadro', () => {
    const { csm, three, camera } = csmComLuzesDeVerdade();
    (csm.lights as unknown[]).push({ shadow: { autoUpdate: true, needsUpdate: false } });
    Object.getPrototypeOf(Object.getPrototypeOf(csm)).updateBefore = () => undefined;
    expect(() => csm.updateBefore({ camera, scene: three } as never)).not.toThrow();
  });

  it('com o espelho nativo instalado a matriz das cascatas é do host e não é recalculada', () => {
    const { csm, three, camera } = csmComLuzesDeVerdade();
    espelho.atual = { installed: true };
    csm.updateBefore({ camera, scene: three } as never);
    csm.lights.forEach((luz) => {
      expect(new Vector3().setFromMatrixPosition(luz.matrixWorld).x).toBe(0);
    });
  });
});
