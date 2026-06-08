/**
 * Testes do SceneBuilder data-driven (src/scene/SceneBuilder.ts).
 * Cobre: instanciação de nós, skip de deletados, override de transform e nós
 * adicionados pela overlay; e os helpers overlayDeleted/overlayAdded. Ver ADR.
 */
import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/core/Scene.js';
import { World } from '../../src/ecs/World.js';
import { buildScene, overlayDeleted, overlayAdded, overlayMatte, overlayAnimation } from '../../src/scene/SceneBuilder.js';
import { isMatte } from '../../src/scene/SceneAssets.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { PlatformerBodyComponent } from '../../src/components/PlatformerBodyComponent.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

const def: SceneDefinition = {
  version: 1,
  nodes: [
    { type: 'primitive', id: 'a', shape: 'box', size: 1, place: { x: 0, y: 0 } },
    { type: 'primitive', id: 'b', shape: 'box', size: 1, place: { x: 5, y: 0 } },
  ],
};

function overlay(partial: Partial<SceneFileV1>): SceneFileV1 {
  return { version: 1, objects: {}, data: {}, ...partial };
}

describe('buildScene', () => {
  it('instancia os nós nomeados por id', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def);
    expect(handle.byId.size).toBe(2);
    expect(handle.byId.get('a')?.name).toBe('a');
    expect(handle.byId.get('b')?.name).toBe('b');
    // place: base em y=0, box de altura 1 → centro em y≈0.5
    expect(handle.byId.get('a')!.position.y).toBeCloseTo(0.5);
  });

  it('pula nós deletados na overlay (nunca instancia)', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def, { overlay: overlay({ data: { deleted: ['b'] } }) });
    expect(handle.byId.has('a')).toBe(true);
    expect(handle.byId.has('b')).toBe(false);
  });

  it('aplica override de transform da overlay (precedência sobre place)', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def, {
      overlay: overlay({
        objects: { a: { position: [10, 20, 30], rotation: [0, 0, 0], scale: [2, 2, 2] } },
      }),
    });
    const a = handle.byId.get('a')!;
    expect(a.position.x).toBeCloseTo(10);
    expect(a.position.y).toBeCloseTo(20);
    expect(a.scale.x).toBeCloseTo(2);
  });

  it('instancia nós adicionados pela overlay', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def, {
      overlay: overlay({
        data: { added: [{ type: 'primitive', id: 'c', shape: 'box', size: 1, place: { x: 0, y: 0 } }] },
      }),
    });
    expect(handle.byId.has('c')).toBe(true);
  });
});

describe('buildScene (plataformer: entidades ECS)', () => {
  const lvl: SceneDefinition = {
    version: 1,
    nodes: [
      { type: 'primitive', id: 'chao', shape: 'box', size: [10, 1, 4], place: { y: -3 }, collider: { solid: true } },
      { type: 'primitive', id: 'player', shape: 'box', size: [0.8, 1.2, 0.8], place: { x: 0, y: 0 }, player: true },
    ],
  };

  it('cria entidades para nós com collider/player quando há world', async () => {
    const world = new World();
    await buildScene(new Scene(), lvl, { world });
    const colliders = world.query(Collider2DComponent);
    const bodies = world.query(PlatformerBodyComponent);
    expect(colliders.length).toBe(2); // chão + player
    expect(bodies.length).toBe(1); // só o player tem corpo
    // collider do player não é sólido; o do chão é
    expect(bodies[0]!.getComponent(Collider2DComponent)!.solid).toBe(false);
  });

  it('não cria entidades sem world (só meshes)', async () => {
    const world = new World();
    await buildScene(new Scene(), lvl); // sem world
    expect(world.query(Collider2DComponent).length).toBe(0);
  });
});

describe('overlay helpers', () => {
  it('overlayDeleted extrai os ids removidos', () => {
    expect(overlayDeleted(overlay({ data: { deleted: ['x', 'y'] } }))).toEqual(['x', 'y']);
    expect(overlayDeleted(null)).toEqual([]);
    expect(overlayDeleted(overlay({}))).toEqual([]);
  });

  it('overlayAdded valida e retorna os nós adicionados', () => {
    const ov = overlay({
      data: {
        added: [
          { type: 'primitive', id: 'c', shape: 'box' },
          { type: 'lixo', id: 'inválido' }, // descartado pela validação
        ],
      },
    });
    const added = overlayAdded(ov);
    expect(added).toHaveLength(1);
    expect(added[0]!.id).toBe('c');
  });

  it('overlayMatte lê só booleans', () => {
    expect(overlayMatte(overlay({ data: { matte: { a: true, b: false, c: 'x' } } }))).toEqual({ a: true, b: false });
    expect(overlayMatte(null)).toEqual({});
  });

  it('overlayAnimation lê clip/loop/speed por id', () => {
    const r = overlayAnimation(overlay({ data: { animation: { hero: { clip: 'Run', loop: false, speed: 1.5 } } } }));
    expect(r['hero']?.clip).toBe('Run');
    expect(r['hero']?.loop).toBe(false);
    expect(r['hero']?.speed).toBe(1.5);
    expect(overlayAnimation(null)).toEqual({});
  });
});

describe('matte (fosco) na cena', () => {
  it('nó com matte:true marca o objeto como fosco', async () => {
    const handle = await buildScene(new Scene(), {
      version: 1,
      nodes: [{ type: 'primitive', id: 'a', shape: 'box', matte: true }],
    });
    expect(isMatte(handle.byId.get('a')!)).toBe(true);
  });

  it('overlay matte:false sobrescreve o matte do nó (precedência)', async () => {
    const handle = await buildScene(
      new Scene(),
      { version: 1, nodes: [{ type: 'primitive', id: 'a', shape: 'box', matte: true }] },
      { overlay: overlay({ data: { matte: { a: false } } }) },
    );
    expect(isMatte(handle.byId.get('a')!)).toBe(false);
  });

  it('options.matte global deixa todos foscos', async () => {
    const handle = await buildScene(new Scene(), def, { matte: true });
    expect(isMatte(handle.byId.get('a')!)).toBe(true);
    expect(isMatte(handle.byId.get('b')!)).toBe(true);
  });
});

describe('background', () => {
  it('nó background sem options.camera lança erro claro', async () => {
    await expect(
      buildScene(new Scene(), { version: 1, nodes: [{ type: 'background', id: 'bg', image: 'sky.jpg' }] }),
    ).rejects.toThrow(/camera/);
  });
});
