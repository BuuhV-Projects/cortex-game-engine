/**
 * TDD da autoria de física no Inspector — o tipo "Rígido (Rapier)" (ADR-0061):
 * marcar adiciona o RapierBodyComponent ao vivo + persiste no overlay (`data.physics`),
 * que o buildScene reaplica. Sem DOM: opera sobre o World + overlay.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshBasicMaterial, Object3D } from 'three';
import { World } from '../../src/ecs/World.js';
import { RapierBodyComponent } from '../../src/components/RapierBodyComponent.js';
import { RapierPhysicsSystem } from '../../src/systems/RapierPhysicsSystem.js';
import { createAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import { createColliderApi } from '../../src/editor/authoring/ColliderAuthoring.js';
import { createPhysicsApi } from '../../src/editor/authoring/PhysicsAuthoring.js';
import type { Game } from '../../src/core/Game.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

function setup() {
  const world = new World();
  const overlay = { version: 1, objects: {}, data: {} } as unknown as SceneFileV1;
  const ctx = createAuthoringContext(
    { world, editorActive: true } as unknown as Game,
    new Object3D(),
    overlay,
    () => {},
  );
  const colliderApi = createColliderApi(ctx, { startHeightfield: () => {}, autoHeightfield: () => {} });
  const physicsApi = createPhysicsApi(ctx, colliderApi);
  const physics = (): Record<string, { type: string; rapier?: { bodyType: string } }> =>
    (overlay.data['physics'] as Record<string, { type: string; rapier?: { bodyType: string } }>) ?? {};
  return { world, physics, physicsApi };
}

function named(name: string): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  m.name = name;
  return m;
}

describe('PhysicsAuthoring — tipo Rígido (Rapier)', () => {
  it('setType("rigid") adiciona RapierBodyComponent + persiste no overlay (e get reflete)', async () => {
    const { world, physics, physicsApi } = setup();
    const m = named('caixa');
    expect(physicsApi.get(m).type).toBe('none');

    physicsApi.setType(m, 'rigid');

    const ents = world.query(RapierBodyComponent);
    expect(ents.length).toBe(1);
    expect(ents[0]!.getComponent(RapierBodyComponent)!.bodyType).toBe('dynamic');
    expect(physics()['caixa']).toMatchObject({ type: 'rigid', rapier: { bodyType: 'dynamic' } });
    expect(physicsApi.get(m).type).toBe('rigid');

    // o RapierPhysicsSystem registra async (carrega o WASM)
    await new Promise((r) => setTimeout(r, 300));
    expect(world.hasSystem(RapierPhysicsSystem)).toBe(true);
  });

  it('setRapier troca o bodyType ao vivo + no overlay', () => {
    const { world, physics, physicsApi } = setup();
    const m = named('barril');
    physicsApi.setType(m, 'rigid');
    physicsApi.setRapier(m, { bodyType: 'fixed' });
    expect(world.query(RapierBodyComponent)[0]!.getComponent(RapierBodyComponent)!.bodyType).toBe('fixed');
    expect(physics()['barril']!.rapier!.bodyType).toBe('fixed');
    expect(physicsApi.get(m).rapier.bodyType).toBe('fixed');
  });

  it('trocar pra Nenhum remove o corpo Rapier', () => {
    const { world, physics, physicsApi } = setup();
    const m = named('x');
    physicsApi.setType(m, 'rigid');
    expect(world.query(RapierBodyComponent).length).toBe(1);
    physicsApi.setType(m, 'none');
    expect(world.query(RapierBodyComponent).length).toBe(0);
    expect(physicsApi.get(m).type).toBe('none');
    expect(physics()['x']).toMatchObject({ type: 'none' });
  });
});
