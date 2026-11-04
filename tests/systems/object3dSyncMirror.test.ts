/**
 * O sync seletivo (SPEC-0673: só escreve no Object3D o que difere do transform) e os ganchos do espelho nativo
 * (SPEC-0678: rotação reescrita com o mesmo quaternion não suja) compõem: entidade parada não suja, e todo
 * movimento — vindo do transform ou escrito por fora no Object3D — suja o slot e termina igual ao transform.
 */
import { describe, expect, it } from 'vitest';
import { Euler, Object3D, Quaternion } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { Object3DSyncSystem } from '../../src/systems/Object3DSyncSystem.js';
import { engancharNo, type MirrorSink } from '../../src/core/sceneMirror/mirrorHooks.js';

/** Espelho falso: conta quantas vezes cada slot foi sujo. */
function espelhoFalso(): MirrorSink & { sujos: number } {
  return {
    sujos: 0,
    _marcarSujo() {
      this.sujos++;
    },
    _ancestralMudou() {},
    _reapareceu() {},
  };
}

function montar(x = 1, y = 2, z = 3, ry = 0.5) {
  const world = new World();
  world.addSystem(new Object3DSyncSystem());
  const obj = new Object3D();
  const transform = new TransformComponent(x, y, z, ry);
  world.createEntity().addComponent(transform).addComponent(new Object3DComponent(obj));
  world.tick(16); // primeiro quadro copia tudo
  const espelho = espelhoFalso();
  engancharNo(obj, espelho, 0); // como o espelho faz ao montar o nó
  return { world, obj, transform, espelho };
}

function quaternionYXZ(ry: number, rx = 0, rz = 0): Quaternion {
  return new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ'));
}

describe('Object3DSyncSystem × ganchos do espelho nativo', () => {
  it('entidade parada não suja o slot', () => {
    const { world, espelho } = montar();
    for (let i = 0; i < 5; i++) world.tick(16);
    expect(espelho.sujos).toBe(0);
  });

  it('posição mudada no transform suja e chega ao Object3D', () => {
    const { world, obj, transform, espelho } = montar();
    transform.x = 7;
    world.tick(16);
    expect(espelho.sujos).toBeGreaterThan(0);
    expect(obj.position.x).toBe(7);
    const depois = espelho.sujos;
    world.tick(16);
    expect(espelho.sujos).toBe(depois);
  });

  it('yaw mudado no transform suja e o quaternion fica coerente', () => {
    const { world, obj, transform, espelho } = montar();
    transform.rotationY = 1.25;
    world.tick(16);
    expect(espelho.sujos).toBe(1);
    expect(obj.quaternion.angleTo(quaternionYXZ(1.25))).toBeLessThan(1e-6);
  });

  it('rotação escrita por fora no Object3D suja e o sync devolve ao transform', () => {
    const { world, obj, espelho } = montar();
    obj.rotation.y = 2; // alguém mexeu direto no objeto
    expect(espelho.sujos).toBe(1);
    world.tick(16);
    expect(espelho.sujos).toBe(2); // o sync corrigiu: rotação voltou, suja de novo
    expect(obj.rotation.y).toBe(0.5);
    expect(obj.quaternion.angleTo(quaternionYXZ(0.5))).toBeLessThan(1e-6);
  });

  it('pitch do jogo direto no Object3D é preservado e só o yaw do transform é escrito', () => {
    const { world, obj, transform, espelho } = montar();
    obj.rotation.x = 0.2; // conformação ao terreno
    transform.rotationY = 0.9;
    world.tick(16);
    expect(espelho.sujos).toBe(2);
    expect(obj.quaternion.angleTo(quaternionYXZ(0.9, 0.2))).toBeLessThan(1e-6);
    world.tick(16);
    expect(espelho.sujos).toBe(2);
  });

  it("ordem trocada por fora volta a 'YXZ' e suja", () => {
    const { world, obj, espelho } = montar(0, 0, 0, 0.5);
    obj.rotation.x = 0.3;
    const antes = espelho.sujos;
    obj.rotation.order = 'XYZ';
    world.tick(16);
    expect(obj.rotation.order).toBe('YXZ');
    expect(espelho.sujos).toBeGreaterThan(antes);
  });
});
