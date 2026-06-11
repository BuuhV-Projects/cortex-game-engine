import { Box3, Vector3, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { RapierBodyComponent } from '../components/RapierBodyComponent.js';
import type { RapierPhysics, BodySpec, PhysicsShape } from '../physics/RapierPhysics.js';

const _box = new Box3();
const _size = new Vector3();

/**
 * Liga o Rapier ao ECS (ADR-0061): cria um corpo por entidade com
 * {@link RapierBodyComponent} + {@link Object3DComponent}, avança a simulação (passo
 * fixo) e **escreve o transform do `Object3D`** (posição + quaternion) a partir do
 * corpo — o Rapier é o **dono do transform** desses objetos (não os ponha também no
 * `Object3DSyncSystem`).
 *
 * Recebe um {@link RapierPhysics} **já criado** (`await RapierPhysics.create()` no
 * boot), então roda **síncrono** dentro do `World.tick`.
 *
 * @example
 * const physics = await RapierPhysics.create({ x: 0, y: -9.81, z: 0 })
 * world.addSystem(new RapierPhysicsSystem(physics))
 */
export class RapierPhysicsSystem extends System {
  static override requiredComponents = [Object3DComponent, RapierBodyComponent];
  override priority = 8;

  /** Passo fixo da simulação (s). */
  private static readonly FIXED_DT = 1 / 60;
  /** Máx. de passos por frame (evita "spiral of death" em quedas de FPS). */
  private static readonly MAX_STEPS = 5;

  private accumulator = 0;

  constructor(private readonly physics: RapierPhysics) {
    super();
  }

  override update(entities: Entity[], deltaTime: number): void {
    // 1) Cria os corpos que ainda não existem (a partir da pose atual do Object3D).
    for (const e of entities) {
      const c = e.getComponent(RapierBodyComponent)!;
      if (c.body) continue;
      const obj = e.getComponent(Object3DComponent)!.object;
      c.body = this.physics.addBody(this.specFor(c, obj));
    }

    // 2) Avança a simulação com passo fixo (acumulador).
    this.accumulator += deltaTime / 1000;
    let steps = 0;
    while (this.accumulator >= RapierPhysicsSystem.FIXED_DT && steps < RapierPhysicsSystem.MAX_STEPS) {
      this.physics.step();
      this.accumulator -= RapierPhysicsSystem.FIXED_DT;
      steps++;
    }

    // 3) Object3D <- corpo (posição + rotação). O Rapier é dono do transform.
    for (const e of entities) {
      const c = e.getComponent(RapierBodyComponent)!;
      if (!c.body) continue;
      const obj = e.getComponent(Object3DComponent)!.object;
      const t = c.body.translation();
      obj.position.set(t.x, t.y, t.z);
      const r = c.body.rotation();
      obj.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  private specFor(c: RapierBodyComponent, obj: Object3D): BodySpec {
    return {
      type: c.bodyType,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      shape: this.shapeFor(c, obj),
      restitution: c.restitution,
      friction: c.friction,
      isSensor: c.isSensor,
    };
  }

  /** Forma do collider — `auto` deriva uma caixa do bounds (já com escala). */
  private shapeFor(c: RapierBodyComponent, obj: Object3D): PhysicsShape {
    if (c.shape.kind !== 'auto') return c.shape;
    _box.setFromObject(obj);
    _box.getSize(_size);
    return {
      kind: 'box',
      halfExtents: {
        x: Math.max(_size.x / 2, 0.05),
        y: Math.max(_size.y / 2, 0.05),
        z: Math.max(_size.z / 2, 0.05),
      },
    };
  }
}
