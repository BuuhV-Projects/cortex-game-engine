import { Raycaster, Vector3, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';

const DOWN = new Vector3(0, -1, 0);
/** Tolerância de contato (skin width) — folga p/ considerar "tocando o chão". */
const SKIN = 0.05;

/** `obj` está sob `root` (é ele ou descendente)? Pra ignorar o próprio mesh. */
function isUnder(obj: Object3D, root: Object3D): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

/** `obj` (ou ancestral) é marcado SÓLIDO (`cortexSolid`) — vira parede pro Character. */
function isSolid(obj: Object3D): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (p.userData?.['cortexSolid'] === true) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Empurrão horizontal pra **sair de paredes**: dado o hit mais próximo em cada
 * direção de eixo (`±X`/`±Z`, distância ou `null` se livre) e o raio da cápsula,
 * devolve o deslocamento (dx,dz) que tira o personagem de dentro da parede. Puro
 * (testável) — o {@link CharacterPhysicsSystem} faz os raycasts e aplica.
 */
export function resolveWallPush(
  near: { px: number | null; nx: number | null; pz: number | null; nz: number | null },
  radius: number,
): { dx: number; dz: number } {
  const pen = (d: number | null): number => (d !== null && radius - d > 0 ? radius - d : 0);
  return {
    dx: pen(near.nx) - pen(near.px), // parede em +X empurra pra −X
    dz: pen(near.nz) - pen(near.pz),
  };
}

/**
 * `obj` é chrome do editor (gizmo/helper)? Checa o objeto **e seus ancestrais** —
 * o `editorInternal` fica na RAIZ do helper (ex.: o `TransformControls`), mas o
 * raycast acerta as peças FILHAS (XYZ/X/Y/Z/AXIS…) que não têm o flag. Sem subir a
 * cadeia, o personagem "aterrava" no gizmo (a alça do gizmo lá em cima) e subia.
 */
function isEditorChrome(obj: Object3D): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (p.userData?.['editorInternal'] === true) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Física vertical do {@link CharacterBodyComponent} (character controller estilo
 * UPBGE/Unity): aplica **gravidade** (limitada por `fallSpeedMax`), processa o
 * **pulo** (`jumpForce` até `maxJumps`), integra o Y e **aterra por COLISÃO** —
 * tudo no **mesmo tick** (sem oscilar/tremer).
 *
 * **Chão (estável):**
 * - **Colisão real (tipo Unity):** se receber as raízes da cena, faz um **raycast
 *   pra baixo** sob os pés e pousa na **geometria real** (terreno, tiles,
 *   plataformas) em qualquer altura — sobe degraus até `stepHeight`, ignora o
 *   próprio mesh. Só aterra **caindo** (velocidade ≤ 0) e quando os pés alcançam a
 *   superfície (curta distância por frame), então não "gruda" no ar nem treme.
 * - **Piso plano `groundY` (fallback):** rede de segurança — se não houver
 *   geometria embaixo, aterra nessa altura (não cai no vazio). Default `-Infinity`.
 *
 * O movimento horizontal (X/Z ou X/Y) fica com o input do jogo; o sistema cuida do
 * Y. Pivô nos **pés** (`transform.y` = base). Roda na física (priority 5).
 *
 * @example
 * // com colisão real (recomendado): passe as raízes da cena
 * world.addSystem(new CharacterPhysicsSystem([game.scene.getThreeScene()]))
 * // sem colisão (só piso plano via CharacterBody.groundY):
 * world.addSystem(new CharacterPhysicsSystem())
 */
export class CharacterPhysicsSystem extends System {
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 5;

  private readonly roots: Object3D[];
  private readonly ray = new Raycaster();
  private readonly origin = new Vector3();
  private readonly wallDir = new Vector3();

  /** @param roots Raízes da cena pra colisão de chão (raycast). Vazio = só `groundY`. */
  constructor(roots: Object3D[] = []) {
    super();
    this.roots = roots;
  }

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
      const wasGrounded = c.grounded; // estado do tick anterior (pro snap de descida)
      c.grounded = false;
      // Os PÉS ficam `footOffset` abaixo da origem do transform (primitivas têm origem
      // no centro). Toda a checagem de chão é feita nos pés; o transform.y volta a ser
      // pés + footOffset ao aterrar — senão o mesh afunda metade da altura.
      const feet = t.y - c.footOffset;

      // Altura do chão sob os pés. A GEOMETRIA REAL (raycast) VENCE: acha a primeira
      // superfície abaixo (a qualquer distância — ele cai de qualquer altura e pousa
      // nela). O piso plano `groundY` é só FALLBACK, usado quando NÃO há nada embaixo
      // (rede de segurança) — nunca sobrepõe o chão real.
      let groundHeight = -Infinity;
      if (this.roots.length > 0 && c.velocityY <= 0) {
        // Origem um pouco ACIMA dos pés (até `stepHeight`) pra subir degraus.
        this.origin.set(t.x, feet + c.stepHeight + SKIN, t.z);
        this.ray.set(this.origin, DOWN);
        this.ray.far = Infinity;
        const self = e.getComponent(Object3DComponent)?.object;
        const hits = this.ray.intersectObjects(this.roots, true);
        for (const h of hits) {
          if (self && isUnder(h.object, self)) continue; // ignora o próprio mesh
          if (isEditorChrome(h.object)) continue; // ignora gizmo/helpers do editor
          groundHeight = h.point.y; // 1ª superfície válida (a mais próxima abaixo da origem)
          break;
        }
      }
      if (groundHeight === -Infinity) groundHeight = c.groundY; // sem geometria → piso de segurança

      // Aterra OU "gruda" no chão (mesmo tick → sem oscilar):
      // - **Pousa** quando os pés alcançam a superfície (`t.y <= chão`).
      // - **Snap pra baixo** quando JÁ estava no chão e ele desceu dentro de um
      //   degrau (`stepHeight`): andar em terreno ondulado sobe na hora (a lógica de
      //   degrau é instantânea) mas a descida era só pela gravidade — então o
      //   personagem ia **catracando pra cima** (subia rápido, descia devagar) e
      //   nunca recuperava a altura. Grudar na descida elimina esse acúmulo.
      //   Pulando (`velocityY > 0`) nem entra aqui, então não gruda no ar.
      if (
        c.velocityY <= 0 &&
        groundHeight > -Infinity &&
        (feet <= groundHeight + SKIN || (wasGrounded && feet - groundHeight <= c.stepHeight))
      ) {
        t.y = groundHeight + c.footOffset; // pés no chão → origem fica footOffset acima
        c.velocityY = 0;
        c.grounded = true;
        c.jumpsUsed = 0;
      }

      // ── Colisão de PAREDE (horizontal) ──────────────────────────────────────────
      // O chão é o raycast pra baixo (acima); aqui o personagem é EMPURRADO pra fora
      // de geometria marcada SÓLIDA (`cortexSolid` — estático/collider, posto pelo
      // buildScene). Faz o blockout virar parede de verdade no FPS/top-down. Amostra
      // 3 alturas da cápsula em ±X/±Z e depenetra por eixo. Ver ADR-0071 / TDR-0002.
      if (this.roots.length > 0) {
        const r = c.radius;
        const feetY = t.y - c.footOffset;
        const self = e.getComponent(Object3DComponent)?.object;
        const ys = [feetY + Math.min(r, c.height * 0.5), feetY + c.height * 0.5, feetY + Math.max(c.height - r, c.height * 0.5)];
        const cast = (dx: number, dz: number): number | null => {
          this.wallDir.set(dx, 0, dz);
          let nearest: number | null = null;
          for (const sy of ys) {
            this.origin.set(t.x, sy, t.z);
            this.ray.set(this.origin, this.wallDir);
            this.ray.far = r + SKIN;
            for (const h of this.ray.intersectObjects(this.roots, true)) {
              if (self && isUnder(h.object, self)) continue;
              if (isEditorChrome(h.object)) continue;
              if (!isSolid(h.object)) continue;
              if (nearest === null || h.distance < nearest) nearest = h.distance;
              break;
            }
          }
          return nearest;
        };
        const push = resolveWallPush(
          { px: cast(1, 0), nx: cast(-1, 0), pz: cast(0, 1), nz: cast(0, -1) },
          r,
        );
        t.x += push.dx;
        t.z += push.dz;
      }
    }
  }
}
