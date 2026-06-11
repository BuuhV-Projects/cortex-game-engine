/**
 * TDD da autoria data-driven do Rapier (ADR-0061): um nó com `rapierBody` no
 * level.json vira RapierBodyComponent + registra o RapierPhysicsSystem (lazy WASM),
 * sem código no main.ts. É o caminho que a IA/JSON usam.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { RapierBodyComponent } from '../../src/components/RapierBodyComponent.js';
import { RapierPhysicsSystem } from '../../src/systems/RapierPhysicsSystem.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

describe('buildScene + rapierBody (data-driven)', () => {
  it('nó com rapierBody vira corpo Rapier + registra o sistema, e cai', async () => {
    const scene = new Scene();
    const world = new World();
    const defs: SceneDefinition[] = [
      {
        version: 1,
        nodes: [
          {
            type: 'primitive', shape: 'box', id: 'chao', size: [20, 1, 20],
            transform: { position: [0, -0.5, 0] },
            rapierBody: { bodyType: 'fixed', shape: { kind: 'auto' } },
          },
          {
            type: 'primitive', shape: 'box', id: 'caixa', size: 1,
            transform: { position: [0, 8, 0] },
            rapierBody: { bodyType: 'dynamic', shape: { kind: 'auto' } },
          },
        ],
      },
    ];

    await buildScene(scene, defs, { world });

    expect(world.hasSystem(RapierPhysicsSystem)).toBe(true);
    const bodies = world.query(RapierBodyComponent);
    expect(bodies.length).toBe(2);

    const caixa = bodies.find((e) => e.getComponent(Object3DComponent)!.object.name === 'caixa')!;
    const chao = bodies.find((e) => e.getComponent(Object3DComponent)!.object.name === 'chao')!;
    const caixaMesh = caixa.getComponent(Object3DComponent)!.object;

    for (let i = 0; i < 240; i++) world.tick(16);

    expect(caixaMesh.position.y).toBeLessThan(5); // caiu (nasceu em 8)
    expect(caixaMesh.position.y).toBeGreaterThan(-1); // pousou no chão, não atravessou
    expect(chao.getComponent(Object3DComponent)!.object.position.y).toBeCloseTo(-0.5, 1); // fixo
  });

  it('override "rigid" do Inspector (overlay) cria o corpo Rapier num nó sem rapierBody', async () => {
    const scene = new Scene();
    const world = new World();
    const defs: SceneDefinition[] = [
      { version: 1, nodes: [{ type: 'primitive', shape: 'box', id: 'caixa', size: 1, transform: { position: [0, 5, 0] } }] },
    ];
    const overlay = {
      version: 1, objects: {},
      data: { physics: { caixa: { type: 'rigid', rapier: { bodyType: 'fixed' } } } },
    } as unknown as SceneFileV1;
    await buildScene(scene, defs, { world, overlay });
    const bodies = world.query(RapierBodyComponent);
    expect(bodies.length).toBe(1);
    expect(bodies[0]!.getComponent(RapierBodyComponent)!.bodyType).toBe('fixed');
    expect(world.hasSystem(RapierPhysicsSystem)).toBe(true);
  });

  it('physicsPaused pausa a simulação (não cai no editor)', async () => {
    const scene = new Scene();
    const world = new World();
    const defs: SceneDefinition[] = [
      {
        version: 1,
        nodes: [
          {
            type: 'primitive', shape: 'box', id: 'caixa', size: 1,
            transform: { position: [0, 8, 0] },
            rapierBody: { bodyType: 'dynamic', shape: { kind: 'auto' } },
          },
        ],
      },
    ];
    await buildScene(scene, defs, { world, physicsPaused: () => true });
    const caixa = world.query(RapierBodyComponent)[0]!.getComponent(Object3DComponent)!.object;
    for (let i = 0; i < 120; i++) world.tick(16);
    expect(caixa.position.y).toBe(8); // pausado → não caiu
  });
});
