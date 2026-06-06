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
 * O AABB de cada collider é centrado em `Transform + (offsetX, offsetY)` — o
 * offset permite collider acoplado ao mesh mas cobrindo uma sub-região (deck,
 * pivô descentralizado). Offset `0` = centrado no Transform.
 *
 * **Resolução X por menor penetração:** o X só bloqueia ("parede") quando a
 * penetração horizontal é a MENOR — senão é "pousar/teto" e fica pro passo Y.
 * Sem isso, um collider sólido em que o player está em pé dispara um falso
 * "encostou na parede" no frame da gravidade (player afunda ~0.01u no topo) e o
 * player é teleportado pra borda. Com a regra de menor penetração, **colliders
 * sólidos são andáveis** (não precisam ser `oneWay` só pra evitar o trap).
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
        const px = penetrationX(t, c, st, sc);
        const py = penetrationY(t, c, st, sc);
        if (px <= 0 || py <= 0) continue; // sem overlap
        // Só é "parede" se a penetração X for a menor; senão é pousar/teto (Y).
        if (px > py) continue;
        const scx = st.x + sc.offsetX;
        if (b.vx > 0) t.x = scx - sc.halfWidth - c.halfWidth - c.offsetX;
        else if (b.vx < 0) t.x = scx + sc.halfWidth + c.halfWidth - c.offsetX;
        b.vx = 0;
      }

      // ── Eixo Y ──────────────────────────────────────────────────────────────
      const prevBottom = t.y + c.offsetY - c.halfHeight;
      t.y += b.vy * dt;
      b.grounded = false;
      for (const s of solids) {
        if (s === actor) continue;
        const sc = s.getComponent(Collider2DComponent)!;
        const st = s.getComponent(TransformComponent)!;
        if (penetrationX(t, c, st, sc) <= 0 || penetrationY(t, c, st, sc) <= 0) continue;
        const scy = st.y + sc.offsetY;
        if (sc.oneWay) {
          // Só colide descendo e se a base estava acima do topo da plataforma.
          if (b.vy > 0) continue;
          if (prevBottom < scy + sc.halfHeight - 0.001) continue;
        }
        if (b.vy <= 0) {
          // Caindo → pousa no topo do sólido.
          t.y = scy + sc.halfHeight + c.halfHeight - c.offsetY;
          b.vy = 0;
          b.grounded = true;
        } else {
          // Subindo → bate a cabeça no teto.
          t.y = scy - sc.halfHeight - c.halfHeight - c.offsetY;
          b.vy = 0;
        }
      }
    }
  }
}

/**
 * Penetração da AABB do ator na do sólido no eixo X (centros = Transform+offset).
 * `> 0` = sobreposto; o valor é a profundidade. `<= 0` = sem overlap em X.
 */
function penetrationX(
  t: TransformComponent,
  c: Collider2DComponent,
  st: TransformComponent,
  sc: Collider2DComponent,
): number {
  const dx = t.x + c.offsetX - (st.x + sc.offsetX);
  return c.halfWidth + sc.halfWidth - Math.abs(dx);
}

/** Penetração no eixo Y (ver {@link penetrationX}). */
function penetrationY(
  t: TransformComponent,
  c: Collider2DComponent,
  st: TransformComponent,
  sc: Collider2DComponent,
): number {
  const dy = t.y + c.offsetY - (st.y + sc.offsetY);
  return c.halfHeight + sc.halfHeight - Math.abs(dy);
}
