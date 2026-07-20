import { Box3, Vector3, type Object3D } from 'three';
import { TransformComponent } from '../../components/TransformComponent.js';
import { Object3DComponent } from '../../components/Object3DComponent.js';
import { Collider2DComponent } from '../../components/Collider2DComponent.js';
import type { Entity } from '../../ecs/Entity.js';
import type { ColliderApi } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/** Entrada de collider no overlay (`data.colliders[nome]`). */
type ColliderEntry = Record<string, unknown>;

/**
 * Interações de **heightfield** (desenho do perfil de chão no viewport) — injetadas
 * pelo `attachEditor`, que detém câmera/canvas/eventos de ponteiro. Mantêm o CRUD
 * (este módulo) separado do que é interativo.
 */
export interface HeightfieldHooks {
  startHeightfield(obj: Object3D): void;
  autoHeightfield(obj: Object3D): void;
}

/**
 * Autoria do **collider 2D** como propriedade do objeto (SPEC-0058/0060). O collider
 * é uma entidade ECS **acoplada à mesh** (`Object3DComponent.object === obj`), então
 * movem juntos. CRUD (get/add/update/remove) persiste em `overlay.data.colliders[nome]`;
 * o `buildScene` recria no boot (overlay vence). Heightfield é injetado via
 * {@link HeightfieldHooks}.
 */
export function createColliderApi(ctx: EditorAuthoringContext, heightfield: HeightfieldHooks): ColliderApi {
  const { game } = ctx;
  const map = (): Record<string, ColliderEntry> => ctx.record<ColliderEntry>('colliders');
  const findColliderEntity = (obj: Object3D): Entity | null => {
    for (const e of game.world.query(Collider2DComponent)) {
      if (e.getComponent(Object3DComponent)?.object === obj) return e;
    }
    return null;
  };

  return {
    get(obj) {
      const e = findColliderEntity(obj);
      if (!e) return null;
      const c = e.getComponent(Collider2DComponent)!;
      // locked = veio do código (não está na overlay editável).
      const locked = !(obj.name && map()[obj.name]);
      return {
        shape: c.shape,
        width: c.halfWidth * 2,
        height: c.halfHeight * 2,
        offsetX: c.offsetX,
        offsetY: c.offsetY,
        solid: c.solid,
        oneWay: c.oneWay,
        pointCount: c.points?.length ?? 0,
        locked,
      };
    },
    add(obj) {
      if (!obj.name || findColliderEntity(obj)) return;
      const box = new Box3().setFromObject(obj);
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const width = Math.max(size.x, 0.1);
      const height = Math.max(size.y, 0.1);
      const offX = center.x - obj.position.x;
      const offY = center.y - obj.position.y;
      const e = game.world.createEntity();
      e.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z, obj.rotation.y));
      e.addComponent(new Object3DComponent(obj));
      e.addComponent(new Collider2DComponent(width / 2, height / 2, true, false, offX, offY, 'box'));
      map()[obj.name] = { shape: 'box', width, height, offsetX: offX, offsetY: offY, solid: true, oneWay: false };
      ctx.persist();
    },
    update(obj, patch) {
      const e = findColliderEntity(obj);
      if (!e || !obj.name) return;
      const c = e.getComponent(Collider2DComponent)!;
      if (patch.width !== undefined) c.halfWidth = patch.width / 2;
      if (patch.height !== undefined) c.halfHeight = patch.height / 2;
      if (patch.offsetX !== undefined) c.offsetX = patch.offsetX;
      if (patch.offsetY !== undefined) c.offsetY = patch.offsetY;
      if (patch.solid !== undefined) c.solid = patch.solid;
      if (patch.oneWay !== undefined) c.oneWay = patch.oneWay;
      if (patch.shape !== undefined) c.shape = patch.shape;
      map()[obj.name] = {
        shape: c.shape,
        width: c.halfWidth * 2,
        height: c.halfHeight * 2,
        offsetX: c.offsetX,
        offsetY: c.offsetY,
        solid: c.solid,
        oneWay: c.oneWay,
      };
      ctx.persist();
    },
    remove(obj) {
      const e = findColliderEntity(obj);
      if (e) game.world.destroyEntity(e);
      if (obj.name) delete map()[obj.name];
      ctx.persist();
    },
    startHeightfield(obj) {
      heightfield.startHeightfield(obj);
    },
    autoHeightfield(obj) {
      heightfield.autoHeightfield(obj);
    },
  };
}
