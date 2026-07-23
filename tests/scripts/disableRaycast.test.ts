/**
 * **Raycast desligado por script não pode vazar pro editor** (ADR-0143).
 *
 * Bug de origem: scripts de hazard/coletável faziam `obj.raycast = () => {}` no
 * `onStart` pra o character não pousar na lâmina. Como o Stop não destruía as
 * instâncias, o override sobrevivia ao Play — e o **picking do editor também é
 * raycast**, então o objeto ficava impossível de clicar até dar reload na IDE.
 * (No sintoma relatado, só os `land_*` continuavam selecionáveis: são os únicos
 * sem script.)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Mesh, BoxGeometry, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { World } from '../../src/ecs/World.js';
import { ScriptComponent } from '../../src/components/ScriptComponent.js';
import { ScriptHostSystem } from '../../src/systems/ScriptHostSystem.js';
import { ScriptBehavior } from '../../src/scripts/ScriptBehavior.js';
import { registerScript, clearScripts } from '../../src/scripts/ScriptRegistry.js';

/** Hazard típico do kit: vira só gatilho visual enquanto o Play roda. */
class Blade extends ScriptBehavior {
  override onStart(): void {
    this.disableRaycast();
  }
}

const makeMesh = (): Mesh => {
  const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
};

/** Simula o clique do editor: raio de cima pra baixo, mirando o objeto. */
const isClickable = (mesh: Mesh): boolean => {
  const ray = new Raycaster(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
  return ray.intersectObject(mesh, true).length > 0;
};

describe('disableRaycast — reversível ao voltar pro editor', () => {
  beforeEach(() => clearScripts());

  it('silencia no Play e devolve o clique no Stop', () => {
    registerScript('Blade', Blade);
    const world = new World();
    let editing = false;
    world.addSystem(new ScriptHostSystem({ world }, () => editing));
    const mesh = makeMesh();
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(mesh, [{ type: 'Blade' }]));

    expect(isClickable(mesh)).toBe(true); // antes do Play

    world.tick(16);
    expect(isClickable(mesh)).toBe(false); // no Play: não é chão nem obstáculo de câmera

    editing = true;
    world.tick(16);
    expect(isClickable(mesh)).toBe(true); // REGRESSÃO: aqui ficava falso pra sempre
  });

  it('aguenta Play → Stop repetido sem acumular estado', () => {
    registerScript('Blade', Blade);
    const world = new World();
    let editing = false;
    world.addSystem(new ScriptHostSystem({ world }, () => editing));
    const mesh = makeMesh();
    const e = world.createEntity();
    e.addComponent(new ScriptComponent(mesh, [{ type: 'Blade' }]));

    for (let i = 0; i < 3; i++) {
      editing = false;
      world.tick(16);
      expect(isClickable(mesh)).toBe(false);
      editing = true;
      world.tick(16);
      expect(isClickable(mesh)).toBe(true);
    }
  });

  it('devolve o raycast do PROTÓTIPO, não um método próprio quebrado', () => {
    const mesh = makeMesh();
    const original = Mesh.prototype.raycast;
    expect(Object.prototype.hasOwnProperty.call(mesh, 'raycast')).toBe(false);

    class Probe extends ScriptBehavior {
      run(target: Mesh): void {
        this.object3d = target;
        this.disableRaycast();
      }
    }
    const probe = new Probe();
    probe.run(mesh);
    expect(Object.prototype.hasOwnProperty.call(mesh, 'raycast')).toBe(true);

    probe.restoreRaycasts();
    // Volta a herdar do protótipo (atribuir undefined deixaria o mesh quebrado).
    expect(Object.prototype.hasOwnProperty.call(mesh, 'raycast')).toBe(false);
    expect(mesh.raycast).toBe(original);
    expect(isClickable(mesh)).toBe(true);
  });

  it('silencia os FILHOS junto (hazards do kit são hierárquicos)', () => {
    const parent = makeMesh();
    const child = makeMesh();
    parent.add(child);
    parent.updateMatrixWorld(true);

    class Probe extends ScriptBehavior {
      run(target: Mesh): void {
        this.object3d = target;
        this.disableRaycast();
      }
    }
    const probe = new Probe();
    probe.run(parent);
    expect(isClickable(child)).toBe(false);
    probe.restoreRaycasts();
    expect(isClickable(child)).toBe(true);
  });
});
