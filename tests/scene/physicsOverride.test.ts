/**
 * Física data-driven + override do Inspector (overlay `data.physics`):
 * - nó `character` vira CharacterBody + registra os sistemas;
 * - override `none` REMOVE um collider cravado no level.json (resolve "não tenho
 *   controle" — a física do código vira editável/removível pelo Inspector);
 * - override `character` converte um nó estático em personagem.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { Scene } from '../../src/core/Scene.js';
import { buildScene, overlayPhysics } from '../../src/scene/SceneBuilder.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

const hasCharacter = (world: World, name: string): boolean =>
  world.query(CharacterBodyComponent).some((e) => e.getComponent(Object3DComponent)?.object.name === name);
const hasCollider = (world: World, name: string): boolean =>
  world.query(Collider2DComponent).some((e) => e.getComponent(Object3DComponent)?.object.name === name);

describe('física data-driven + override do Inspector', () => {
  it('overlayPhysics lê tipo + params do Character; ignora tipo inválido', () => {
    const overlay = {
      version: 1,
      objects: {},
      data: {
        physics: {
          hero: { type: 'character', jumpForce: 12, maxJumps: 2 },
          wall: { type: 'none' },
          junk: { type: 'banana' },
        },
      },
    } as unknown as SceneFileV1;
    const p = overlayPhysics(overlay);
    expect(p['hero']?.type).toBe('character');
    expect(p['hero']?.character?.jumpForce).toBe(12);
    expect(p['wall']?.type).toBe('none');
    expect(p['junk']).toBeUndefined();
  });

  it('nó character vira CharacterBody + registra CharacterPhysicsSystem', async () => {
    const scene = new Scene();
    const world = new World();
    const defs: SceneDefinition[] = [
      { version: 1, nodes: [{ type: 'primitive', shape: 'box', id: 'hero', character: { jumpForce: 9 } }] },
    ];
    await buildScene(scene, defs, { world });
    expect(hasCharacter(world, 'hero')).toBe(true);
    expect(world.hasSystem(CharacterPhysicsSystem)).toBe(true);
  });

  it('override none REMOVE um collider declarado no nó (level.json)', async () => {
    const scene = new Scene();
    const world = new World();
    const defs: SceneDefinition[] = [
      { version: 1, nodes: [{ type: 'primitive', shape: 'box', id: 'wall', collider: { solid: true } }] },
    ];
    const overlay = { version: 1, objects: {}, data: { physics: { wall: { type: 'none' } } } } as unknown as SceneFileV1;
    await buildScene(scene, defs, { world, overlay });
    expect(hasCollider(world, 'wall')).toBe(false); // o override desligou o collider do código
  });

  it('override character converte um nó estático em personagem', async () => {
    const scene = new Scene();
    const world = new World();
    const defs: SceneDefinition[] = [
      { version: 1, nodes: [{ type: 'primitive', shape: 'box', id: 'guy', collider: { solid: true } }] },
    ];
    const overlay = {
      version: 1,
      objects: {},
      data: { physics: { guy: { type: 'character', jumpForce: 7 } } },
    } as unknown as SceneFileV1;
    await buildScene(scene, defs, { world, overlay });
    expect(hasCharacter(world, 'guy')).toBe(true);
    expect(hasCollider(world, 'guy')).toBe(false); // virou character, não é mais estático
  });
});
