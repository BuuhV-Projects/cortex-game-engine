/**
 * Autoria da estrada no F2 (SPEC-0631 §5–6): o Inspector grava no overlay `data.road[id]`,
 * refaz a pista, remolda o terreno; e o overlay salvo reproduz a edição no próximo build.
 */
import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { createRoadApi } from '../../src/editor/authoring/RoadAuthoring.js';
import { describeRoadSection } from '../../src/editor/RoadInspectorSection.js';
import type { EditorAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import type { HandlerMap } from '../../src/editor/EditorModel.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';
import type { Terrain } from '../../src/scene/Terrain.js';

const RES = 32;
const HILL = 10;
const def: SceneDefinition = {
  version: 1,
  nodes: [
    { type: 'terrain', id: 't', size: 64, resolution: RES, heights: new Array<number>((RES + 1) ** 2).fill(HILL) },
    { type: 'road', id: 'r', points: [[-25, 0, 0], [0, 0, 0], [25, 0, 0]], grade: 'points', maxSlope: 0 },
  ],
};

async function setup(): Promise<{ ctx: EditorAuthoringContext; overlay: SceneFileV1; terrain: Terrain; road: import('three').Object3D; persisted: () => number }> {
  const scene = new Scene();
  const h = await buildScene(scene, def);
  const overlay: SceneFileV1 = { version: 1, objects: {}, data: {} };
  let saves = 0;
  const ctx = {
    game: undefined as never,
    three: scene.getThreeScene(),
    overlay,
    persist: () => void saves++,
    record<T>(key: string): Record<string, T> {
      return ((overlay.data[key] ??= {}) as Record<string, T>);
    },
  } satisfies EditorAuthoringContext;
  const terrain = (h.byId.get('t')!.userData as Record<string, unknown>)['cortexTerrain'] as Terrain;
  return { ctx, overlay, terrain, road: h.byId.get('r')!, persisted: () => saves };
}

describe('RoadAuthoring', () => {
  it('set grava só o campo mudado no overlay, remolda e persiste; o overlay reproduz no build', async () => {
    const { ctx, overlay, terrain, road, persisted } = await setup();
    const { roadApi } = createRoadApi(ctx);
    expect(terrain.heightAt(0, 0)).toBeCloseTo(0, 4);
    roadApi.set(road, { points: [[-25, 4, 0], [0, 4, 0], [25, 4, 0]] });
    expect(overlay.data['road']).toEqual({ r: { points: [[-25, 4, 0], [0, 4, 0], [25, 4, 0]] } });
    expect(terrain.heightAt(0, 0)).toBeCloseTo(4, 4);
    expect(persisted()).toBe(1);
    // Rebuild com o overlay salvo → mesmo terreno.
    const h2 = await buildScene(new Scene(), def, { overlay: JSON.parse(JSON.stringify(overlay)) as SceneFileV1 });
    const t2 = (h2.byId.get('t')!.userData as Record<string, unknown>)['cortexTerrain'] as Terrain;
    expect(t2.heightAt(0, 0)).toBeCloseTo(4, 4);
  });

  it('removePoint respeita o mínimo de 2 pontos', async () => {
    const { ctx, road } = await setup();
    const { roadEditApi } = createRoadApi(ctx);
    expect(roadEditApi.removePoint(road, 1)).toBe(true);
    expect(roadEditApi.pointsOf(road)).toHaveLength(2);
    expect(roadEditApi.removePoint(road, 0)).toBe(false);
  });

  it('a seção "Estrada" mostra a inclinação em % e converte de volta pra razão', async () => {
    const { ctx, overlay, road } = await setup();
    const { roadApi } = createRoadApi(ctx);
    const handlers: HandlerMap = new Map();
    const section = describeRoadSection(road, roadApi, (s) => `x:${s}`, handlers);
    expect(section?.title).toBe('Estrada');
    const slope = section!.fields.find((f) => f.id === 'x:roadSlope') as { value: number };
    expect(slope.value).toBe(0);
    handlers.get('x:roadSlope')!(12);
    expect((overlay.data['road'] as Record<string, { maxSlope?: number }>)['r']!.maxSlope).toBeCloseTo(0.12, 6);
  });
});
