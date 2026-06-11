import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';

/**
 * Física vertical do {@link CharacterBodyComponent} (character controller estilo
 * UPBGE): aplica **gravidade** (limitada por `fallSpeedMax`), processa o **pulo**
 * (`jumpForce` até `maxJumps`) e integra o Y. O movimento horizontal (X/Z) fica
 * com o input do jogo. O **ground** vem de duas fontes (estáveis, sem raycast):
 * - o **piso plano** `groundY` do próprio corpo (aterra ali — ideal pra top-down
 *   de chão plano; default `-Infinity` = sem piso);
 * - e/ou o {@link TerrainCollisionSystem} (terreno esculpido), que roda depois.
 * Aterrar zera `velocityY`, marca `grounded` e reseta os pulos.
 *
 * Roda na física (priority 5), **antes** do {@link TerrainCollisionSystem} (7) e do
 * `Object3DSyncSystem` (10).
 */
export class CharacterPhysicsSystem extends System {
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 5;

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    for (const e of entities) {
      const t = e.getComponent(TransformComponent)!;
      const c = e.getComponent(CharacterBodyComponent)!;

      if (c.jumpQueued && c.jumpsUsed < c.maxJumps) {
        c.velocityY = c.jumpForce;
        c.jumpsUsed++;
        c.grounded = false;
      }
      c.jumpQueued = false;

      c.velocityY -= c.gravity * dt;
      if (c.velocityY < -c.fallSpeedMax) c.velocityY = -c.fallSpeedMax;
      t.y += c.velocityY * dt;
      c.grounded = false; // o ground (piso/terreno) reseta pra true ao aterrar

      // Piso plano (sem raycast → não treme): aterra ao tocar/passar de groundY.
      if (c.velocityY <= 0 && t.y <= c.groundY) {
        t.y = c.groundY;
        c.velocityY = 0;
        c.grounded = true;
        c.jumpsUsed = 0;
      }
    }
  }
}
