import { Matrix4, Vector3 } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { structureVersion } from '../ecs/structureVersion.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { TerrainComponent } from '../components/TerrainComponent.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';
import { KinematicBodyComponent } from '../components/KinematicBodyComponent.js';

const _v = new Vector3();

/**
 * **Colisão com o terreno** (heightmap) — mantém os corpos EM CIMA da superfície:
 * se um corpo cai abaixo da altura do terreno no seu `(x, z)`, é subido até a
 * superfície e **aterrado** (zera a velocidade pra baixo, marca `grounded`). Vale
 * pra `PlatformerBodyComponent` (2.5D) e `KinematicBodyComponent` (genérico) —
 * então serve pra jogos 3D, 2.5D ou top-down (a altura vem de {@link Terrain.heightAt}).
 * Terreno é **sólido por padrão**: o {@link buildScene} liga este sistema quando a
 * cena tem terreno.
 *
 * ⚠️ **NÃO** trata `CharacterBodyComponent`: o personagem (cápsula) já aterra no
 * terreno pelo **raycast** do `CharacterPhysicsSystem` (que mira a malha real da
 * cena, terreno incluso). Ter os dois aterrando o mesmo corpo fazia ele **quicar**
 * em rampas — o raycast pousa no triângulo da malha e o `heightAt` é bilinear, então
 * as alturas divergem e brigavam a cada frame. Uma autoridade só (o raycast).
 *
 * Roda **depois da física** (priority 5) e **antes do** `Object3DSyncSystem`
 * (priority 10), pra a mesh refletir a posição já corrigida.
 *
 * Recebe todas as entidades, mas só as reclassifica (terrenos e corpos) quando a estrutura do ECS muda ou a lista
 * recebida não é a mesma: o passo comum não busca componente nenhum (SPEC-0674).
 */
export class TerrainCollisionSystem extends System {
  override readonly profileLabel = 'TerrainCollisionSystem';
  static override requiredComponents = []; // todas as entidades — filtra dentro
  override priority = 7;

  /** Lista e versão do ECS da última classificação (SPEC-0674). */
  private readonly seen: Entity[] = [];
  private seenVersion = -1;
  private readonly terrains: TerrainComponent[] = [];
  /** Inversa da `matrixWorld` de cada terreno, recalculada a cada passo (antes saía uma por corpo). */
  private readonly inverses: Matrix4[] = [];
  // corpos em arrays paralelos (só quem tem Transform e Platformer ou Kinematic)
  private readonly bodyT: TransformComponent[] = [];
  private readonly bodyPb: (PlatformerBodyComponent | undefined)[] = [];
  private readonly bodyKb: (KinematicBodyComponent | undefined)[] = [];

  override update(entities: Entity[]): void {
    if (!this.sameAsSeen(entities)) this.classify(entities);
    const terrains = this.terrains;
    // Atualiza a matriz de mundo de cada terreno uma vez.
    for (let i = 0; i < terrains.length; i++) terrains[i]!.object.updateWorldMatrix(true, false);
    if (terrains.length === 0 || this.bodyT.length === 0) return;
    for (let i = 0; i < terrains.length; i++) this.inverses[i]!.copy(terrains[i]!.object.matrixWorld).invert();

    for (let b = 0; b < this.bodyT.length; b++) {
      const t = this.bodyT[b]!;
      const pb = this.bodyPb[b];
      const kb = this.bodyKb[b];
      for (let i = 0; i < terrains.length; i++) {
        const surfaceY = surfaceWorldY(terrains[i]!, this.inverses[i]!, t.x, t.z);
        if (surfaceY === null) continue; // fora da área do terreno
        if (t.y < surfaceY) {
          t.y = surfaceY; // sobe até a superfície (pés no terreno)
          if (pb) {
            if (pb.vy < 0) pb.vy = 0;
            pb.grounded = true;
          }
          if (kb) {
            if (kb.velocityY < 0) kb.velocityY = 0;
            kb.grounded = true;
          }
        }
      }
    }
  }

  /** Mesma versão do ECS e as mesmas entidades, na mesma ordem, da última classificação? */
  private sameAsSeen(entities: readonly Entity[]): boolean {
    if (this.seenVersion !== structureVersion() || entities.length !== this.seen.length) return false;
    for (let i = 0; i < entities.length; i++) if (entities[i] !== this.seen[i]) return false;
    return true;
  }

  /** Separa terrenos e corpos, na ordem das entidades (a do laço de antes). */
  private classify(entities: readonly Entity[]): void {
    this.seenVersion = structureVersion();
    this.seen.length = this.terrains.length = 0;
    this.bodyT.length = this.bodyPb.length = this.bodyKb.length = 0;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      this.seen.push(e);
      const tc = e.getComponent(TerrainComponent);
      if (tc) this.terrains.push(tc);
      const t = e.getComponent(TransformComponent);
      if (!t) continue;
      const pb = e.getComponent(PlatformerBodyComponent);
      const kb = e.getComponent(KinematicBodyComponent);
      if (!pb && !kb) continue; // só corpos (o que cai/anda); Character aterra por raycast
      this.bodyT.push(t);
      this.bodyPb.push(pb);
      this.bodyKb.push(kb);
    }
    while (this.inverses.length < this.terrains.length) this.inverses.push(new Matrix4());
  }
}

/**
 * Altura do terreno (Y em mundo) sob `(worldX, worldZ)`, ou `null` se fora dele. `inverse` é a inversa da
 * `matrixWorld` do terreno, já atualizada no passo: a mesma conta do `worldToLocal`/`localToWorld`, sem
 * refazer a matriz por corpo.
 */
function surfaceWorldY(tc: TerrainComponent, inverse: Matrix4, worldX: number, worldZ: number): number | null {
  _v.set(worldX, 0, worldZ).applyMatrix4(inverse); // → coords locais do terreno (respeita pos/rot/escala)
  const h = tc.terrain.heightAt(_v.x, _v.z);
  if (h === null) return null;
  _v.y = h; // ponto da superfície em local (lx, h, lz)
  _v.applyMatrix4(tc.object.matrixWorld); // → mundo
  return _v.y;
}
