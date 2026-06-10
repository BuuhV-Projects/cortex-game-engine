/**
 * Testes da TopDownCameraSystem (câmera vista de cima, jogos de fazenda/RPG):
 * segue o alvo no plano XZ, posiciona a câmera acima olhando pra baixo; `angle`
 * controla de reto top-down a 3/4 inclinado.
 */
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { FollowCameraTargetComponent } from '../../src/components/FollowCameraTargetComponent.js';
import { TopDownCameraSystem } from '../../src/systems/TopDownCameraSystem.js';

function world(opts: ConstructorParameters<typeof TopDownCameraSystem>[1], x: number, y: number, z: number) {
  const cam = new PerspectiveCamera();
  const w = new World();
  w.addSystem(new TopDownCameraSystem(cam, opts));
  const e = w.createEntity();
  e.addComponent(new TransformComponent(x, y, z));
  e.addComponent(new FollowCameraTargetComponent());
  return { cam, w };
}

describe('TopDownCameraSystem', () => {
  it('reto pra baixo (angle 0): câmera acima do alvo no plano XZ, up = -Z', () => {
    const { cam, w } = world({ height: 10, angle: 0, responsiveness: 0 }, 5, 0, 3);
    w.tick(16);
    expect(cam.position.x).toBeCloseTo(5);
    expect(cam.position.y).toBeCloseTo(10); // alvo.y + height
    expect(cam.position.z).toBeCloseTo(3);
    // olhando reto pra baixo, "up" é -Z (mundo +Z vira baixo na tela)
    expect(cam.up.z).toBeCloseTo(-1);
    expect(cam.up.y).toBeCloseTo(0);
  });

  it('inclinado (angle 45°): recua no +Z e sobe menos em Y; up = +Y', () => {
    const { cam, w } = world({ height: 10, angle: Math.PI / 4, responsiveness: 0 }, 0, 0, 0);
    w.tick(16);
    expect(cam.position.y).toBeCloseTo(10 * Math.cos(Math.PI / 4));
    expect(cam.position.z).toBeCloseTo(10 * Math.sin(Math.PI / 4));
    expect(cam.up.y).toBeCloseTo(1);
  });

  it('respeita o offset no plano XZ', () => {
    const { cam, w } = world({ height: 8, responsiveness: 0, offset: [2, -1] }, 1, 0, 1);
    w.tick(16);
    expect(cam.position.x).toBeCloseTo(3); // 1 + 2
    expect(cam.position.z).toBeCloseTo(0); // 1 + (-1), angle 0 → sem recuo extra
  });
});
