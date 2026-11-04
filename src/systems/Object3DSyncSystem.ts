import type { Object3D } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { bumpStructureVersion } from '../ecs/structureVersion.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { isStaticEntity } from '../components/staticEntity.js';

/**
 * Sincroniza `TransformComponent` → `Object3D.position` / `rotation.y`.
 *
 * Roda depois da movimentação/física (priority 10) pra garantir que o frame
 * renderizado reflita o estado lógico atualizado.
 *
 * Garante `rotation.order = 'YXZ'`: assim o yaw (`rotation.y`) é aplicado
 * primeiro e pitch/roll (`rotation.x`/`.z`) — que outros sistemas (ex.:
 * conformação ao terreno do jogo) aplicam direto no `Object3D` — ficam "locais"
 * à entidade já virada. Corrige a ordem se algo a trocou.
 *
 * Só escreve o que difere do transform (SPEC-0673): cada setter de `Euler`
 * recalcula o quaternion (`sin`/`cos`), e a maioria das entidades (colisores
 * estáticos, carros dormindo) não se move. O resultado é o mesmo de escrever
 * sempre — inclusive para quem escreve direto em `transform.x` ou no `Object3D`.
 *
 * Entidade **congelada** (SPEC-0684) fica fora do laço: o `mergeStaticScene`
 * congela as estáticas cuja arte fundiu (no host nativo; no browser/Studio nada
 * congela). Para mover uma delas, {@link Object3DSyncSystem.unfreeze}.
 */
export class Object3DSyncSystem extends System {
  override readonly profileLabel = 'Object3DSyncSystem';
  static override requiredComponents = [TransformComponent, Object3DComponent];
  override priority = 10;

  /** Array de entidades do último quadro; os pares abaixo valem para ele. */
  private _source: Entity[] | null = null;
  /** Tamanho de `_source` no `_rebuild` (os pares não contam as congeladas). */
  private _sourceLength = 0;
  private readonly _transforms: TransformComponent[] = [];
  private readonly _objects: Object3DComponent[] = [];

  /**
   * Congela a entidade (SPEC-0684): copia o transform para o `Object3D` uma vez
   * (posição, ordem `YXZ` e yaw — o que um quadro do sync faria) e a tira do laço
   * a partir do próximo quadro. Ganhar depois um componente fora do conjunto
   * estático a descongela sozinha.
   *
   * @returns `false` se faltar `TransformComponent` ou `Object3DComponent`.
   * @example
   * Object3DSyncSystem.freeze(placa); // não se move mais; o sync deixa de visitá-la
   */
  static freeze(entity: Entity): boolean {
    const transform = entity.getComponent(TransformComponent);
    const object3D = entity.getComponent(Object3DComponent);
    if (!transform || !object3D) return false;
    syncOne(transform, object3D.object);
    object3D.frozenComponentsVersion = entity.componentsVersion;
    if (!object3D.frozen) {
      object3D.frozen = true;
      bumpStructureVersion(); // o sync refaz os pares (ADR-0676)
    }
    return true;
  }

  /**
   * Devolve a entidade ao laço (SPEC-0684): no próximo quadro o transform volta a
   * ser copiado para o `Object3D`. Para mover uma estática que o merge congelou —
   * a arte fundida dela continua na malha fundida; só o que ficou fora acompanha.
   *
   * @example
   * Object3DSyncSystem.unfreeze(porta);
   * porta.getComponent(TransformComponent)!.rotationY = Math.PI / 2;
   */
  static unfreeze(entity: Entity): void {
    const object3D = entity.getComponent(Object3DComponent);
    if (!object3D?.frozen) return;
    object3D.frozen = false;
    bumpStructureVersion();
  }

  /** A entidade está congelada (fora do laço do sync, SPEC-0684)? */
  static isFrozen(entity: Entity): boolean {
    return entity.getComponent(Object3DComponent)?.frozen === true;
  }

  /**
   * Pares visitados por quadro (as entidades não congeladas do último `_rebuild`).
   * @internal
   */
  get syncedCount(): number {
    return this._transforms.length;
  }

  override update(entities: Entity[]): void {
    // O World reusa o mesmo array enquanto a estrutura do ECS não muda: refaz os
    // pares (sem os dois Map.get por entidade) só quando ele troca.
    if (entities !== this._source || entities.length !== this._sourceLength) this._rebuild(entities);
    const transforms = this._transforms;
    const objects = this._objects;
    for (let i = 0; i < transforms.length; i++) {
      syncOne(transforms[i]!, objects[i]!.object);
    }
  }

  private _rebuild(entities: Entity[]): void {
    this._source = entities;
    this._sourceLength = entities.length;
    let count = 0;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]!;
      const object3D = entity.getComponent(Object3DComponent)!;
      if (object3D.frozen && stillFrozen(entity, object3D)) continue;
      this._transforms[count] = entity.getComponent(TransformComponent)!;
      this._objects[count] = object3D;
      count++;
    }
    this._transforms.length = count;
    this._objects.length = count;
  }
}

/**
 * A congelada continua congelada? Só confere os tipos dos componentes quando a
 * estrutura DELA mudou desde o congelamento; virou dinâmica, descongela.
 */
function stillFrozen(entity: Entity, object3D: Object3DComponent): boolean {
  if (entity.componentsVersion === object3D.frozenComponentsVersion) return true;
  if (isStaticEntity(entity)) {
    object3D.frozenComponentsVersion = entity.componentsVersion;
    return true;
  }
  object3D.frozen = false;
  return false;
}

/** Copia o transform para o objeto, escrevendo só o que mudou. */
function syncOne(t: TransformComponent, obj: Object3D): void {
  const p = obj.position;
  if (p.x !== t.x || p.y !== t.y || p.z !== t.z) p.set(t.x, t.y, t.z);
  const r = obj.rotation;
  if (r.order !== 'YXZ') r.order = 'YXZ';
  if (r.y !== t.rotationY) r.y = t.rotationY;
}
