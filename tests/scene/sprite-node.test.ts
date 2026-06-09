/**
 * Testes do nó `sprite` data-driven no SceneBuilder: instancia sprite estático
 * e animado (spritesheet), e — com `world` — acopla o SpriteAnimationComponent
 * a uma entidade ECS e liga o SpriteAnimationSystem sob demanda. Ver ADR-0057.
 *
 * `loadTexture` é mockado (sem fs/rede): devolve uma Texture com `image` de
 * dimensões fixas, o suficiente pra grade de frames e tamanho do quad.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/scene/SceneAssets.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/scene/SceneAssets.js')>();
  const { Texture } = await import('three');
  return {
    ...actual,
    loadTexture: vi.fn(async () => {
      const t = new Texture();
      (t as unknown as { image: { width: number; height: number } }).image = { width: 384, height: 256 };
      return t;
    }),
  };
});

import { Mesh } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { World } from '../../src/ecs/World.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { SpriteAnimationComponent } from '../../src/components/SpriteAnimationComponent.js';
import { SpriteAnimationSystem } from '../../src/systems/SpriteAnimationSystem.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

describe('buildScene — nó sprite', () => {
  it('instancia um sprite estático (sem animations) como Mesh', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'sprite', id: 'sign', url: 'assets/sign.png', transform: { position: [2, 3, 0] } }],
    };
    const scene = new Scene();
    const world = new World();
    const handle = await buildScene(scene, def, { world });

    const obj = handle.byId.get('sign');
    expect(obj).toBeInstanceOf(Mesh);
    expect(obj!.name).toBe('sign');
    expect(obj!.position.x).toBeCloseTo(2);
    expect(obj!.position.y).toBeCloseTo(3);
    // estático: nenhuma entidade de animação, sistema não ligado
    expect(world.query(SpriteAnimationComponent)).toHaveLength(0);
    expect(world.hasSystem(SpriteAnimationSystem)).toBe(false);
  });

  it('instancia um sprite animado e acopla o SpriteAnimationComponent ao ECS', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [
        {
          type: 'sprite',
          id: 'hero',
          url: 'assets/hero.png',
          columns: 3, // 384/3 = 128 de largura por frame
          animations: { idle: { frames: [0] }, walk: { frames: [0, 1, 2], fps: 8 } },
          initial: 'idle',
        },
      ],
    };
    const scene = new Scene();
    const world = new World();
    const handle = await buildScene(scene, def, { world });

    expect(handle.byId.get('hero')).toBeInstanceOf(Mesh);

    const ents = world.query(SpriteAnimationComponent);
    expect(ents).toHaveLength(1);
    const anim = ents[0]!.getComponent(SpriteAnimationComponent)!;
    expect(anim.current).toBe('idle');
    expect(Object.keys(anim.anims)).toEqual(['idle', 'walk']);
    expect(anim.sheet.frameWidth).toBe(128);

    // sistema ligado sob demanda — e só uma vez
    expect(world.hasSystem(SpriteAnimationSystem)).toBe(true);
  });

  it('herda framedata (grade + animações) do kit quando o nó só referencia a url', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'sprite', id: 'hero', url: 'assets/smallburg/hero.png' }],
    };
    const kit = {
      version: 1 as const,
      name: 'smallburg',
      assets: {
        'assets/smallburg/hero.png': {
          role: 'character' as const,
          sprite: { columns: 3, animations: { walk: { frames: [0, 1, 2], fps: 8 } }, initial: 'walk' },
        },
      },
    };
    const scene = new Scene();
    const world = new World();
    await buildScene(scene, def, { world, kit });

    const ents = world.query(SpriteAnimationComponent);
    expect(ents).toHaveLength(1);
    const anim = ents[0]!.getComponent(SpriteAnimationComponent)!;
    expect(anim.current).toBe('walk'); // initial do kit
    expect(anim.sheet.frameWidth).toBe(128); // 384/3 (columns do kit)
  });

  it('liga o SpriteAnimationSystem uma única vez mesmo com vários sprites', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [
        { type: 'sprite', id: 'a', url: 'a.png', columns: 3, animations: { run: { frames: [0, 1] } } },
        { type: 'sprite', id: 'b', url: 'b.png', columns: 3, animations: { run: { frames: [0, 1] } } },
      ],
    };
    const scene = new Scene();
    const world = new World();
    await buildScene(scene, def, { world });

    expect(world.query(SpriteAnimationComponent)).toHaveLength(2);
    const systemCount = (world as unknown as { _systems: unknown[] })._systems.filter(
      (s) => s instanceof SpriteAnimationSystem,
    ).length;
    expect(systemCount).toBe(1);
  });
});
