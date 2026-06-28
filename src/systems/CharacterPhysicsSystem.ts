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

/** Altura (acima dos pés) de onde sai o raycast SÓ-terreno do clamp anti-clip. */
const TERRAIN_PROBE = 1000;

/** Raio-base do tronco (×escala da instância) pra colisão barata com vegetação. */
const TRUNK_RADIUS = 0.4;

/**
 * Varre a cena UMA vez por frame e separa o que cada checagem precisa (em vez de cada
 * raycast testar a cena inteira — caro com road/terreno densos):
 * - `trunks` (`[x,z,raio]`): vegetação sólida → colisão por cilindro (sem raycast).
 * - `solidMeshes`: blockout `cortexSolid` → alvo do empurrão de PAREDE.
 * - `terrainMeshes`: `cortexTerrain` → alvo do clamp ANTI-CLIP.
 * Sub-malhas de vegetação (`cortexVegetationSub`) ficam de fora (raycast desligado nelas).
 */
function collectScene(roots: Object3D[], trunks: number[], solidMeshes: Object3D[], terrainMeshes: Object3D[]): void {
  trunks.length = 0;
  solidMeshes.length = 0;
  terrainMeshes.length = 0;
  for (const root of roots) {
    root.traverse((o) => {
      const ud = o.userData as Record<string, unknown>;
      if (ud['cortexVegetation'] && ud['cortexSolid'] === true) {
        const inst = (ud['cortexVegetation'] as { getInstances(): number[] }).getInstances();
        for (let i = 0; i < inst.length; i += 5) trunks.push(inst[i]!, inst[i + 2]!, TRUNK_RADIUS * inst[i + 4]!);
        return;
      }
      if (!(o as { isMesh?: boolean }).isMesh || ud['cortexVegetationSub']) return;
      if (ud['cortexTerrain']) terrainMeshes.push(o);
      else if (isSolid(o)) solidMeshes.push(o);
    });
  }
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
  private readonly trunks: number[] = []; // [x, z, raio] por instância de vegetação sólida
  private readonly solidMeshes: Object3D[] = []; // blockout sólido (alvo do empurrão de parede)
  private readonly terrainMeshes: Object3D[] = []; // terreno (alvo do anti-clip)

  /** @param roots Raízes da cena pra colisão de chão (raycast). Vazio = só `groundY`. */
  constructor(roots: Object3D[] = []) {
    super();
    this.roots = roots;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    // 1x por frame: separa troncos (cilindro) / sólidos (parede) / terreno (anti-clip).
    collectScene(this.roots, this.trunks, this.solidMeshes, this.terrainMeshes);
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

      // ── Anti-clip do TERRENO: nunca fica abaixo da superfície ───────────────────
      // O raycast de chão acima parte de pés+stepHeight; num morro ÍNGREME a superfície
      // do terreno fica ACIMA dessa origem e ele não a acha — o personagem **atravessa
      // o morro** (cai no `groundY` plano). Aqui um raycast de BEM ALTO, só contra o
      // terreno (`cortexTerrain`), sobe o personagem até a superfície quando ele está
      // abaixo dela: escala o morro em vez de atravessar. Específico do terreno (não
      // mexe no blockout sólido, que tem colisão de parede própria abaixo).
      if (this.terrainMeshes.length > 0 && c.velocityY <= 0) {
        const feetNow = t.y - c.footOffset;
        this.origin.set(t.x, feetNow + TERRAIN_PROBE, t.z);
        this.ray.set(this.origin, DOWN);
        this.ray.far = Infinity;
        const h = this.ray.intersectObjects(this.terrainMeshes, true)[0]; // só terreno
        if (h && feetNow < h.point.y - SKIN) {
          t.y = h.point.y + c.footOffset; // sobe pra superfície do terreno
          c.velocityY = 0;
          c.grounded = true;
        }
      }

      // ── Colisão de PAREDE (horizontal) ──────────────────────────────────────────
      // O chão é o raycast pra baixo (acima); aqui o personagem é EMPURRADO pra fora
      // de geometria marcada SÓLIDA (`cortexSolid` — estático/collider, posto pelo
      // buildScene). Faz o blockout virar parede de verdade no FPS/top-down. Amostra
      // 3 alturas da cápsula em ±X/±Z e depenetra por eixo. Ver ADR-0071 / TDR-0002.
      if (this.solidMeshes.length > 0) {
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
            for (const h of this.ray.intersectObjects(this.solidMeshes, true)) {
              if (self && isUnder(h.object, self)) continue;
              if (isEditorChrome(h.object)) continue;
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

      // ── Colisão com VEGETAÇÃO (troncos = cilindros) ─────────────────────────────
      // A malha das árvores NÃO entra em raycast (perf na floresta densa). A colisão é
      // este empurrão barato: tira o personagem de dentro do raio do tronco de cada
      // instância sólida próxima. O(nº de instâncias) por frame.
      for (let i = 0; i < this.trunks.length; i += 3) {
        const dx = t.x - this.trunks[i]!;
        const dz = t.z - this.trunks[i + 1]!;
        const minD = this.trunks[i + 2]! + c.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const k = (minD - d) / d; // fração radial pra empurrar pra fora
          t.x += dx * k;
          t.z += dz * k;
        }
      }
    }
  }
}
