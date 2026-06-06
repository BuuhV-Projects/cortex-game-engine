import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';

/**
 * Física de plataforma 2.5D no plano **XY**: gravidade, movimento horizontal por
 * intenção (`PlatformerBodyComponent.moveDir`), pulo, e **colisão AABB por eixo**
 * contra os sólidos. Resolve X e depois Y (estilo platformer clássico): pousa no
 * topo (`grounded`), bate a cabeça no teto, e bloqueia nas paredes. Plataformas
 * `oneWay` só colidem vindo de cima.
 *
 * Recebe TODAS as entidades com `Transform` + `Collider` (atores E sólidos);
 * separa internamente quem tem `PlatformerBodyComponent` (ator). Roda antes do
 * `Object3DSyncSystem` (priority 10), pra a mesh refletir a posição resolvida.
 */
export class PlatformerPhysicsSystem extends System {
  static override requiredComponents = [TransformComponent, Collider2DComponent];
  override priority = 5;

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    if (dt <= 0) return;

    const solids: Entity[] = [];
    const actors: Entity[] = [];
    for (const e of entities) {
      if (e.getComponent(Collider2DComponent)!.solid) solids.push(e);
      if (e.getComponent(PlatformerBodyComponent)) actors.push(e);
    }

    for (const actor of actors) {
      const t = actor.getComponent(TransformComponent)!;
      const c = actor.getComponent(Collider2DComponent)!;
      const b = actor.getComponent(PlatformerBodyComponent)!;

      // Velocidade a partir da intenção + pulo + gravidade.
      b.vx = b.moveDir * b.moveSpeed;
      if (b.jumpQueued && b.grounded) {
        b.vy = b.jumpSpeed;
        b.grounded = false;
      }
      b.jumpQueued = false;
      b.vy -= b.gravity * dt;
      if (b.vy < -b.maxFall) b.vy = -b.maxFall;

      // ── Eixo X ──────────────────────────────────────────────────────────────
      t.x += b.vx * dt;
      for (const s of solids) {
        if (s === actor) continue;
        const sc = s.getComponent(Collider2DComponent)!;
        if (sc.oneWay) continue; // one-way nunca bloqueia na horizontal
        const st = s.getComponent(TransformComponent)!;
        if (!overlaps(t, c, st, sc)) continue;
        if (b.vx > 0) t.x = st.x - sc.halfWidth - c.halfWidth;
        else if (b.vx < 0) t.x = st.x + sc.halfWidth + c.halfWidth;
        b.vx = 0;
      }

      // ── Eixo Y ──────────────────────────────────────────────────────────────
      const prevBottom = t.y - c.halfHeight;
      t.y += b.vy * dt;
      b.grounded = false;
      for (const s of solids) {
        if (s === actor) continue;
        const sc = s.getComponent(Collider2DComponent)!;
        const st = s.getComponent(TransformComponent)!;
        if (!overlaps(t, c, st, sc)) continue;
        if (sc.oneWay) {
          // Só colide descendo e se a base estava acima do topo da plataforma.
          if (b.vy > 0) continue;
          if (prevBottom < st.y + sc.halfHeight - 0.001) continue;
        }
        if (b.vy <= 0) {
          // Caindo → pousa no topo do sólido.
          t.y = st.y + sc.halfHeight + c.halfHeight;
          b.vy = 0;
          b.grounded = true;
        } else {
          // Subindo → bate a cabeça no teto.
          t.y = st.y - sc.halfHeight - c.halfHeight;
          b.vy = 0;
        }
      }
    }
  }
}

/** Overlap de duas AABB no plano XY. */
function overlaps(
  t: TransformComponent,
  c: Collider2DComponent,
  st: TransformComponent,
  sc: Collider2DComponent,
): boolean {
  return (
    Math.abs(t.x - st.x) < c.halfWidth + sc.halfWidth &&
    Math.abs(t.y - st.y) < c.halfHeight + sc.halfHeight
  );
}
