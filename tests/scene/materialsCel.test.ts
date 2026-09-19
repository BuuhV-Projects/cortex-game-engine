import { describe, expect, it } from 'vitest';
import { BoxGeometry, DataTexture, LinearFilter, Mesh, MeshStandardMaterial, MeshToonMaterial, NearestFilter } from 'three';
import { applyMaterial, type MaterialConfig } from '../../src/scene/Materials.js';
import { parseSceneDefinition } from '../../src/scene/SceneDefinition.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { Scene } from '../../src/core/Scene.js';
import { createObjectRegistry, describeInspector } from '../../src/editor/EditorModel.js';
import { createMaterialApi } from '../../src/editor/authoring/MaterialAuthoring.js';
import type { EditorAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';

function ramp(config: MaterialConfig): DataTexture {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  applyMaterial(mesh, config);
  return (mesh.material as unknown as MeshToonMaterial).gradientMap as DataTexture;
}

describe('clean cel shading', () => {
  it('has two broad constant tones with a narrow, monotonic transition', () => {
    const texture = ramp({ type: 'toon', shading: 'cel', gradientSteps: 8 });
    const data = Array.from(texture.image.data as Uint8Array);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(data.length).toBeGreaterThanOrEqual(128);
    expect(data[0]).toBeGreaterThan(0);
    expect(new Set(data.slice(0, 120)).size).toBe(1);
    expect(new Set(data.slice(150)).size).toBe(1);
    expect(data.at(-1)).toBe(255);
    const transition = data.filter(v => v > data[0]! && v < 255);
    expect(transition.length).toBeGreaterThan(3);
    expect(transition.length / data.length).toBeLessThan(0.08);
    expect(data.every((v, i) => i === 0 || v >= data[i - 1]!)).toBe(true);
    texture.dispose();
  });

  it('keeps authored legacy bands unchanged when the new mode is absent', () => {
    for (const shading of [undefined, 'bands'] as const) {
      const texture = ramp({ type: 'toon', shading, gradientSteps: 4 });
      expect(Array.from(texture.image.data as Uint8Array)).toEqual([0, 85, 170, 255]);
      expect(texture.magFilter).toBe(NearestFilter);
      texture.dispose();
    }
  });

  it('retains the mode through scene parsing and honors the Studio override', async () => {
    const definition = parseSceneDefinition({ version: 1, nodes: [{
      type: 'primitive', id: 'car-p4j8w2', shape: 'box', size: 1,
      material: { type: 'toon', shading: 'cel' },
    }] });
    expect(definition).not.toBeNull();
    expect(definition!.nodes[0]!.material).toEqual({ type: 'toon', shading: 'cel' });
    const handle = await buildScene(new Scene(), definition!, { overlay: {
      version: 1, objects: {}, data: { material: {
        'car-p4j8w2': { type: 'toon', shading: 'bands', gradientSteps: 4 },
      } },
    } });
    const mesh = handle.byId.get('car-p4j8w2') as Mesh;
    expect((mesh.material as MeshToonMaterial).gradientMap!.image.width).toBe(4);
    expect(mesh.userData.cortexMaterialConfig.shading).toBe('bands');
  });

  it('edits cel/bands in the Inspector, persists it and preserves it on reselection', () => {
    const obj = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    obj.name = 'car-p4j8w2';
    obj.userData.cortexNodeDef = { material: { type: 'toon', shading: 'cel', outline: 0.012 } };
    const store: Record<string, MaterialConfig> = {};
    const api = createMaterialApi({ record: () => store, persist: () => {} } as unknown as EditorAuthoringContext);
    const registry = createObjectRegistry();
    const inspect = () => describeInspector(obj, { materialApi: api }, registry);
    const first = inspect();
    const fields = first.model.sections.flatMap(s => s.fields);
    expect(fields.some(f => f.id.endsWith(':matSteps'))).toBe(false);
    first.handlers.get(fields.find(f => f.id.endsWith(':shader'))!.id)!('toon');
    expect(api.get(obj)).toMatchObject({ shading: 'cel', outline: 0.012 });
    const next = inspect();
    const mode = next.model.sections.flatMap(s => s.fields).find(f => f.id.endsWith(':matShading'))!;
    expect(next.handlers.get(mode.id)!('bands')).toEqual({ rebuild: true });
    expect(store[obj.name]).toMatchObject({ type: 'toon', shading: 'bands', outline: 0.012 });
    expect(inspect().model.sections.flatMap(s => s.fields).some(f => f.id.endsWith(':matSteps'))).toBe(true);
  });
});
