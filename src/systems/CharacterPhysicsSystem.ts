import { Box3, Raycaster, Vector3, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { NearMeshIndex, firstHit, publishScan, touchingBox } from '../physics/nearMeshes.js';
import { firstHitAmong } from '../physics/nativeRaycast.js';
import { CharacterSceneCollector } from '../physics/characterCollect.js';
import { TrunkGrid } from '../physics/trunkGrid.js';

const DOWN = new Vector3(0, -1, 0);
/** Tolerância de contato (skin width) — folga p/ considerar "tocando o chão". */
const SKIN = 0.05;
/** Folga numérica (m) da caixa varrida pelos raios de parede (SPEC-0323). */
const WALL_BOX_EPSILON = 1e-3;

/** `obj` está sob `root` (é ele ou descendente)? Pra ignorar o próprio mesh. */
function isUnder(obj: Object3D, root: Object3D): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

/** Altura (acima dos pés) de onde sai o raycast SÓ-terreno do clamp anti-clip. */
const TERRAIN_PROBE = 1000;

/**
 * De quanto em quanto tempo (ms) a cena é varrida de novo pra remontar as listas
 * (SPEC-0302). Varrer todo quadro custava caro em mapa grande; mover o que já está
 * nas listas não precisa disso (os raios usam a `matrixWorld` atual).
 */
export const COLLECT_INTERVAL_MS = 250;

/** Floats por tronco na lista da varredura: `[x, z, raio]`. */
const TRUNK_STRIDE = 3;
/** Folga (m) da consulta de troncos pela grade: com a soma dos empurrões até ela, a grade cobre tudo (SPEC-0674). */
const TRUNK_SLACK = 1;

/** Passo do quadro (fração do raio, por eixo) a partir do qual ele é varrido contra as paredes (SPEC-0648). */
const SWEEP_MIN_STEP = 0.5;
/** Passo (m) acima do qual o movimento é teletransporte do jogo e não é varrido (SPEC-0648). */
const SWEEP_MAX_STEP = 8;
const HALF = 0.5;

/** As 3 alturas da cápsula (pé, meio, cabeça) onde saem os raios de parede, em `out`. */
function capsuleHeights(feetY: number, c: CharacterBodyComponent, out: number[]): number[] {
  out[0] = feetY + Math.min(c.radius, c.height * HALF);
  out[1] = feetY + c.height * HALF;
  out[2] = feetY + Math.max(c.height - c.radius, c.height * HALF);
  return out;
}

/** `visible` − `ground` em `out`; `ground` é subsequência de `visible` (mesma travessia), O(n). */
export function splitRest(visible: readonly Object3D[], ground: readonly Object3D[], out: Object3D[]): Object3D[] {
  out.length = 0;
  let j = 0;
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] === ground[j]) j++;
    else out.push(visible[i]!);
  }
  return out;
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
  override readonly profileLabel = 'CharacterPhysicsSystem';
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 5;

  private readonly roots: Object3D[];
  /** Só o acerto mais próximo de cada malha interessa: a árvore BVH para no 1º triângulo (SPEC-0328). */
  private readonly ray = Object.assign(new Raycaster(), { firstHitOnly: true });
  private readonly origin = new Vector3();
  private readonly wallDir = new Vector3();
  /** As listas da varredura (troncos, sólidos, terreno, chão, visíveis) — SPEC-0674. */
  private readonly scene = new CharacterSceneCollector();
  /** Troncos por célula: o empurrão só testa os perto (SPEC-0674). */
  private readonly trunkGrid = new TrunkGrid();
  /** Visíveis que não são chão (vegetação, água, marcação): com o `groundIndex`, cobrem a câmera (SPEC-0646). */
  private readonly restMeshes: Object3D[] = [];
  // paredes filtradas pro personagem da vez (só o que algum raio pode tocar, SPEC-0302)
  private readonly nearSolid: Object3D[] = [];
  /** As paredes cujos triângulos tocam a caixa dos raios de parede (SPEC-0323). */
  private readonly touchingSolid: Object3D[] = [];
  private readonly wallBox = new Box3();
  private readonly groundIndex = new NearMeshIndex();
  private readonly terrainIndex = new NearMeshIndex();
  private readonly solidIndex = new NearMeshIndex();
  /** ms desde a última varredura da cena (começa vencido: varre no 1º quadro). */
  private sinceCollect = Infinity;
  /** Posição XZ resolvida no fim do quadro anterior, por entidade (SPEC-0648). */
  private readonly lastXZ = new WeakMap<Entity, { x: number; z: number }>();
  private readonly ys: number[] = [0, 0, 0];
  /** O mesh do personagem da vez: o `skipSelf` descarta os acertos nele (sem closure por passo, SPEC-0674). */
  private self: Object3D | undefined;
  private readonly skipSelf = (o: Object3D): boolean => isUnder(o, this.self!);

  /** @param roots Raízes da cena pra colisão de chão (raycast). Vazio = só `groundY`. */
  constructor(roots: Object3D[] = []) {
    super();
    this.roots = roots;
  }

  /** Força varrer a cena de novo no próximo quadro (muita coisa trocada de uma vez). */
  refresh(): void {
    this.sinceCollect = Infinity;
    this.scene.reset();
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    // A cada COLLECT_INTERVAL_MS: separa troncos (cilindro) / sólidos (parede) / terreno (anti-clip).
    this.sinceCollect += deltaTime;
    if (this.sinceCollect >= COLLECT_INTERVAL_MS) this.collect();
    const scene = this.scene;
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
      // a queda do quadro inteiro entra no raio de chão: num quadro longo ela passa do stepHeight (SPEC-0648)
      const fell = Math.max(0, -c.velocityY * dt);
      t.y += c.velocityY * dt;
      const wasGrounded = c.grounded; // estado do tick anterior (pro snap de descida)
      c.grounded = false;
      // Os PÉS ficam `footOffset` abaixo da origem do transform (primitivas têm origem
      // no centro). Toda a checagem de chão é feita nos pés; o transform.y volta a ser
      // pés + footOffset ao aterrar — senão o mesh afunda metade da altura.
      const feet = t.y - c.footOffset;
      this.self = e.getComponent(Object3DComponent)?.object;
      const skip = this.self ? this.skipSelf : undefined;

      // Passo horizontal de quadro longo (SPEC-0648): maior que o raio, o centro passaria da face de
      // um sólido — e de dentro dele nem o empurrão de parede nem o raio de chão o veem. Antes do chão.
      // Posição posta de fora (SPEC-0720): vale inteira, sem varrer desde a do quadro anterior.
      const last = c.teleportQueued ? undefined : this.lastXZ.get(e);
      c.teleportQueued = false;
      if (last && scene.solidMeshes.length > 0) {
        const ys = capsuleHeights(feet, c, this.ys);
        t.x = last.x + this.sweptStep(last.x, last.z, t.x - last.x, 1, 0, c.radius, ys, skip);
        t.z = last.z + this.sweptStep(t.x, last.z, t.z - last.z, 0, 1, c.radius, ys, skip);
      }

      // Altura do chão sob os pés. A GEOMETRIA REAL (raycast) VENCE: acha a primeira
      // superfície abaixo (a qualquer distância — ele cai de qualquer altura e pousa
      // nela). O piso plano `groundY` é só FALLBACK, usado quando NÃO há nada embaixo
      // (rede de segurança) — nunca sobrepõe o chão real.
      let groundHeight = -Infinity;
      if (scene.groundMeshes.length > 0 && c.velocityY <= 0) {
        // Origem um pouco ACIMA dos pés (até `stepHeight`) pra subir degraus.
        this.origin.set(t.x, feet + fell + c.stepHeight + SKIN, t.z);
        this.ray.set(this.origin, DOWN);
        this.ray.far = Infinity;
        // só o que o raio cruza, mais perto primeiro; ignora o próprio mesh (SPEC-0328)
        const h = firstHit(this.ray, this.groundIndex, skip);
        if (h) groundHeight = h.point.y; // 1ª superfície válida (a mais próxima abaixo da origem)
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
      if (scene.terrainMeshes.length > 0 && c.velocityY <= 0) {
        const feetNow = t.y - c.footOffset;
        this.origin.set(t.x, feetNow + TERRAIN_PROBE, t.z);
        this.ray.set(this.origin, DOWN);
        this.ray.far = Infinity;
        const h = firstHit(this.ray, this.terrainIndex); // só terreno (SPEC-0328)
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
      // 3 alturas da cápsula em ±X/±Z e depenetra por eixo. Ver SPEC-0071 / TDR-0002.
      if (scene.solidMeshes.length > 0) {
        const r = c.radius;
        const ys = capsuleHeights(t.y - c.footOffset, c, this.ys);
        // só a parede com triângulo dentro da caixa que os 12 raios varrem (SPEC-0323)
        const reach = r + SKIN + WALL_BOX_EPSILON;
        this.wallBox.min.set(t.x - reach, ys[0]! - WALL_BOX_EPSILON, t.z - reach);
        this.wallBox.max.set(t.x + reach, ys[2]! + WALL_BOX_EPSILON, t.z + reach);
        const walls = touchingBox(this.solidIndex.nearXZ(t.x, t.z, r + SKIN, this.nearSolid, ys[0], ys[2]), this.wallBox, this.touchingSolid);
        const px = this.wallCast(1, 0, walls, t.x, t.z, r, ys, skip);
        const nx = this.wallCast(-1, 0, walls, t.x, t.z, r, ys, skip);
        const pz = this.wallCast(0, 1, walls, t.x, t.z, r, ys, skip);
        const nz = this.wallCast(0, -1, walls, t.x, t.z, r, ys, skip);
        // parede em +X empurra pra −X: a conta do resolveWallPush, sem os objetos
        t.x += penetration(nx, r) - penetration(px, r);
        t.z += penetration(nz, r) - penetration(pz, r);
      }

      // ── Colisão com VEGETAÇÃO (troncos = cilindros) ─────────────────────────────
      // A malha das árvores NÃO entra em raycast (perf na floresta densa). A colisão é
      // este empurrão barato: tira o personagem de dentro do raio do tronco de cada
      // instância sólida próxima.
      this.pushTrunks(t, c.radius);
      let resolved = this.lastXZ.get(e);
      if (!resolved) this.lastXZ.set(e, (resolved = { x: 0, z: 0 }));
      resolved.x = t.x;
      resolved.z = t.z;
    }
    this.self = undefined;
  }

  /** A varredura da cena e os índices (SPEC-0302/0328/0674). */
  private collect(): void {
    const scene = this.scene;
    scene.collect(this.roots);
    if (scene.trunksChanged) this.trunkGrid.rebuild(scene.trunks);
    this.groundIndex.rebuild(scene.groundMeshes);
    if (this.roots.length === 1) {
      splitRest(scene.visibleMeshes, scene.groundMeshes, this.restMeshes);
      publishScan(this.roots[0]!, scene.visibleMeshes, this.groundIndex, this.restMeshes);
    }
    this.terrainIndex.rebuild(scene.terrainMeshes);
    this.solidIndex.rebuild(scene.solidMeshes);
    this.sinceCollect = 0;
  }

  /** Distância do acerto de parede mais perto na direção (dx, dz) entre as 3 alturas, ou `Infinity` (livre). */
  private wallCast(
    dx: number,
    dz: number,
    walls: readonly Object3D[],
    x: number,
    z: number,
    r: number,
    ys: readonly number[],
    skip: ((o: Object3D) => boolean) | undefined,
  ): number {
    if (walls.length === 0) return Infinity; // nada encostado: sem raio
    this.wallDir.set(dx, 0, dz);
    let nearest = Infinity;
    for (let i = 0; i < ys.length; i++) {
      this.origin.set(x, ys[i]!, z);
      this.ray.set(this.origin, this.wallDir);
      this.ray.far = r + SKIN;
      // 1º acerto que não é o próprio personagem (no host, em C++ — SPEC-0347)
      const h = firstHitAmong(this.ray, walls, null, skip);
      if (h && h.distance < nearest) nearest = h.distance;
    }
    return nearest;
  }

  /**
   * Empurra (x, z) pra fora dos troncos, em ordem de índice, como o laço linear sobre todos (SPEC-0674): a grade
   * devolve os troncos a até `raio + 2 × folga` dos centros; se a soma dos empurrões passar da folga, volta à
   * posição de partida e faz o laço linear inteiro — o resultado é sempre o dele.
   */
  private pushTrunks(t: TransformComponent, radius: number): void {
    const trunks = this.scene.trunks;
    if (trunks.length === 0) return;
    const x0 = t.x;
    const z0 = t.z;
    const cand = this.trunkGrid.near(x0, z0, radius + 2 * TRUNK_SLACK);
    if (cand) {
      let moved = 0;
      for (let q = 0; q < cand.length && moved <= TRUNK_SLACK; q++) moved += pushOutOfTrunk(t, trunks, cand[q]! * TRUNK_STRIDE, radius);
      if (moved <= TRUNK_SLACK) return;
      t.x = x0;
      t.z = z0;
    }
    for (let i = 0; i < trunks.length; i += TRUNK_STRIDE) pushOutOfTrunk(t, trunks, i, radius);
  }

  /**
   * O passo `step` (m) no eixo (`ax`, `az`) a partir de (x, z) que não atravessa sólido (SPEC-0648):
   * raios nas alturas `ys` na direção do passo; com acerto, o passo para a `r + SKIN` da face.
   * Eixo por eixo, o outro eixo segue e o personagem desliza. Passo curto (o empurrão de parede
   * resolve) ou de teletransporte volta inteiro.
   */
  private sweptStep(
    x: number,
    z: number,
    step: number,
    ax: number,
    az: number,
    r: number,
    ys: readonly number[],
    skip: ((o: Object3D) => boolean) | undefined,
  ): number {
    const len = Math.abs(step);
    if (!(len > SWEEP_MIN_STEP * r) || len > SWEEP_MAX_STEP) return step;
    const mid = step * HALF;
    const cand = this.solidIndex.nearXZ(x + ax * mid, z + az * mid, len * HALF + r + SKIN, this.nearSolid, ys[0], ys[ys.length - 1]);
    if (cand.length === 0) return step;
    const sign = Math.sign(step);
    this.wallDir.set(ax * sign, 0, az * sign);
    let nearest = Infinity;
    for (let i = 0; i < ys.length; i++) {
      this.origin.set(x, ys[i]!, z);
      this.ray.set(this.origin, this.wallDir);
      this.ray.far = len + r + SKIN;
      const h = firstHitAmong(this.ray, cand, null, skip);
      if (h && h.distance < nearest) nearest = h.distance;
    }
    return nearest === Infinity ? step : sign * Math.min(len, Math.max(0, nearest - r - SKIN));
  }
}

/** Penetração (m) na parede acertada a `d` (`Infinity` = livre) — a mesma conta do {@link resolveWallPush}. */
function penetration(d: number, radius: number): number {
  return radius - d > 0 ? radius - d : 0;
}

/** Tira (t.x, t.z) de dentro do tronco em `trunks[i..i+2]` (`[x, z, raio]`); devolve quanto andou (m). */
function pushOutOfTrunk(t: TransformComponent, trunks: readonly number[], i: number, radius: number): number {
  const dx = t.x - trunks[i]!;
  const dz = t.z - trunks[i + 1]!;
  const minD = trunks[i + 2]! + radius;
  const d2 = dx * dx + dz * dz;
  if (!(d2 < minD * minD && d2 > 1e-8)) return 0;
  const d = Math.sqrt(d2);
  const k = (minD - d) / d; // fração radial pra empurrar pra fora
  t.x += dx * k;
  t.z += dz * k;
  return minD - d;
}
