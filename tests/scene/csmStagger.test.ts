/**
 * SPEC-0675 (c): CSM escalonado no caminho `three` — a cascata 0 redesenha todo quadro e as distantes se revezam a
 * cada `farCascadeInterval` quadros; troca de câmera redesenha todas.
 */
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene as ThreeScene } from 'three';
import { setupOutdoorLighting } from '../../src/scene/OutdoorLighting.js';
import type { Scene } from '../../src/core/Scene.js';
import type { Renderer } from '../../src/core/Renderer.js';

type Sombra = { autoUpdate: boolean; needsUpdate: boolean };
type CsmSondado = {
  updateBefore(frame: never): void;
  camera: unknown;
  lights: { shadow: Sombra }[];
  farCascadeInterval: number;
};

const CASCADES = 3;
const FRAMES = 6;

/** O nó CSM do preset com `CASCADES` cascatas falsas e o `super.updateBefore` neutralizado. */
function csmDoPreset(options: { shadowFarCascadeInterval?: number } = {}): { csm: CsmSondado; camera: PerspectiveCamera; frame: () => never } {
  const three = new ThreeScene();
  const scene = { add: (o: unknown) => three.add(o as never), getThreeScene: () => three } as unknown as Scene;
  const renderer = {
    threeRenderer: { toneMapping: 0, toneMappingExposure: 1, shadowMap: { enabled: false, type: 0 } },
  } as unknown as Renderer;
  const { sun } = setupOutdoorLighting(renderer, scene, { csm: true, shadowCascades: CASCADES, ...options });
  const csm = (sun.shadow as unknown as { shadowNode: CsmSondado }).shadowNode;
  // O `super` posiciona as cascatas e precisa de renderer de verdade; o escalonamento acontece fora dele.
  Object.getPrototypeOf(Object.getPrototypeOf(csm)).updateBefore = () => undefined;
  const camera = new PerspectiveCamera();
  csm.camera = camera; // já "viu" a câmera: sem `updateFrustums` (exige o `setup` do renderer)
  for (let i = 0; i < CASCADES; i++) csm.lights.push({ shadow: { autoUpdate: true, needsUpdate: false } });
  return { csm, camera, frame: () => ({ camera, scene: three }) as never };
}

/** Quais cascatas redesenham em cada um dos próximos `FRAMES` quadros (`'1'` = redesenha). */
function padrao(csm: CsmSondado, frame: () => never): string[] {
  const out: string[] = [];
  for (let f = 0; f < FRAMES; f++) {
    csm.updateBefore(frame());
    out.push(csm.lights.map((l) => (l.shadow.autoUpdate ? '1' : '0')).join(''));
  }
  return out;
}

describe('CSM escalonado no caminho three (SPEC-0675)', () => {
  it('default 2: a cascata 0 todo quadro, as distantes se revezam', () => {
    const { csm, frame } = csmDoPreset();
    expect(csm.farCascadeInterval).toBe(2);
    expect(padrao(csm, frame)).toEqual(['110', '101', '110', '101', '110', '101']);
  });

  it('intervalo 3: cada cascata distante a cada 3 quadros, em quadros diferentes', () => {
    const { csm, frame } = csmDoPreset({ shadowFarCascadeInterval: 3 });
    expect(padrao(csm, frame)).toEqual(['101', '110', '100', '101', '110', '100']);
  });

  it('intervalo 1: todas todo quadro (o comportamento de antes)', () => {
    const { csm, frame } = csmDoPreset({ shadowFarCascadeInterval: 1 });
    expect(padrao(csm, frame)).toEqual(['111', '111', '111', '111', '111', '111']);
  });

  it('troca de câmera redesenha todas no quadro', () => {
    const { csm, frame } = csmDoPreset();
    // `updateFrustums` exige o `setup` do renderer: o teste só observa o escalonamento.
    (csm as unknown as { updateFrustums: () => void }).updateFrustums = () => undefined;
    csm.updateBefore(frame());
    csm.camera = new PerspectiveCamera(); // outra câmera vista por último (editor ↔ play)
    csm.updateBefore(frame());
    expect(csm.lights.every((l) => l.shadow.autoUpdate)).toBe(true);
  });
});
