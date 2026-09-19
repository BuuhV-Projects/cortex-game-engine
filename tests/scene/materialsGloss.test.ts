import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, MeshToonMaterial, Texture } from 'three';
import { applyMaterial, clearMaterial, type MaterialConfig } from '../../src/scene/Materials.js';
import { parseSceneDefinition } from '../../src/scene/SceneDefinition.js';
import { createObjectRegistry, describeInspector } from '../../src/editor/EditorModel.js';

describe('toon glossy surfaces', () => {
  it('keeps reflective paint/glass/metal and cel rubber in a multicolor model', () => {
    const sources = [
      new MeshStandardMaterial({ name: 'paint', metalness: 0.24, roughness: 0.36 }),
      new MeshStandardMaterial({ name: 'glass', roughness: 0.18, transparent: true, opacity: 0.62 }),
      new MeshStandardMaterial({ name: 'chrome', metalness: 0.94, roughness: 0.4 }),
      new MeshStandardMaterial({ name: 'rubber', metalness: 0, roughness: 0.8 }),
    ];
    const mesh = new Mesh(new BoxGeometry(), sources);
    applyMaterial(mesh, { type: 'toon', shading: 'cel', preserveGloss: true, outline: 0.012 });
    const materials = mesh.material;
    for (let i = 0; i < 3; i++) {
      expect(materials[i]).toBeInstanceOf(MeshStandardMaterial);
      expect(materials[i]).not.toBe(sources[i]);
      expect(materials[i]!.name).toBe(sources[i]!.name);
    }
    expect(materials[1]!.opacity).toBe(0.62);
    expect(materials[3]).toBeInstanceOf(MeshToonMaterial);
    expect(mesh.children.some(c => c.userData.cortexOutline)).toBe(true);
    clearMaterial(mesh);
    expect(mesh.material).toBe(sources);
  });

  it('clones paint independently, shares texture and honors the tint', () => {
    const map = new Texture();
    const source = new MeshStandardMaterial({ color: '#168ca4', map, roughness: 0.3 });
    const mesh = new Mesh(new BoxGeometry(), source);
    applyMaterial(mesh, { type: 'toon', shading: 'cel', preserveGloss: true, color: '#ff44aa' });
    expect(mesh.material.color.getHexString()).toBe('ff44aa');
    expect(source.color.getHexString()).toBe('168ca4');
    expect(mesh.material.map).toBe(map);
    clearMaterial(mesh);
    expect(mesh.material).toBe(source);
  });

  it('is opt-in and round-trips through the scene schema and Inspector', () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ metalness: 1 }));
    applyMaterial(mesh, { type: 'toon', shading: 'cel' });
    expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
    const def = parseSceneDefinition({ version: 1, nodes: [{ type: 'primitive', id: 'car-t6p4j2', shape: 'box', material: { type: 'toon', preserveGloss: true } }] });
    expect(def!.nodes[0]!.material).toEqual({ type: 'toon', preserveGloss: true });
    let saved: MaterialConfig = { type: 'toon', shading: 'cel' };
    const { model, handlers } = describeInspector(mesh, { materialApi: {
      get: () => saved, set: (_obj, value) => { saved = value; },
    } }, createObjectRegistry());
    const field = model.sections.flatMap(s => s.fields).find(f => f.id.endsWith(':matGloss'))!;
    expect(field.kind).toBe('checkbox');
    handlers.get(field.id)!(true);
    expect(saved).toEqual({ type: 'toon', shading: 'cel', preserveGloss: true });
  });
});
