import type { Object3D } from 'three';
import { TransformComponent } from '../../components/TransformComponent.js';
import { Object3DComponent } from '../../components/Object3DComponent.js';
import { CharacterBodyComponent } from '../../components/CharacterBodyComponent.js';
import { CharacterPhysicsSystem } from '../../systems/CharacterPhysicsSystem.js';
import type { Entity } from '../../ecs/Entity.js';
import type { BodyType } from '../../scene/SceneBuilder.js';
import type { PhysicsApi, ColliderApi, CharacterEditState } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

const CHAR_DEFAULTS: CharacterEditState = {
  radius: 0.4, height: 1.8, gravity: 30, stepHeight: 0.4, jumpForce: 9, fallSpeedMax: 25, maxJumps: 1, groundY: 0,
};

/**
 * Autoria do **tipo de corpo físico** (Nenhum/Estático/Character — seletor "Tipo"
 * estilo UPBGE; ADR-0058/0060). É a fonte AUTORITATIVA: aplica ao vivo (Collider2D
 * via {@link ColliderApi}, ou CharacterBody + registra o {@link CharacterPhysicsSystem})
 * e persiste em `overlay.data.physics[nome]`. O `buildScene` respeita o override no
 * boot — então dá pra REMOVER/trocar física cravada no código/level.json.
 *
 * Desacoplado do collider: usa só a `ColliderApi` (get/add/remove) pro lado estático.
 */
export function createPhysicsApi(ctx: EditorAuthoringContext, colliderApi: ColliderApi): PhysicsApi {
  const { game } = ctx;
  const physMap = (): Record<string, Record<string, unknown>> => ctx.record<Record<string, unknown>>('physics');

  const findCharacterEntity = (obj: Object3D): Entity | null => {
    for (const e of game.world.query(CharacterBodyComponent)) {
      if (e.getComponent(Object3DComponent)?.object === obj) return e;
    }
    return null;
  };
  const ensureCharacterSystems = (): void => {
    if (!game.world.hasSystem(CharacterPhysicsSystem)) {
      const s = new CharacterPhysicsSystem([ctx.three]);
      s.pauseWhen = () => game.editorActive;
      game.world.addSystem(s);
    }
  };
  // Params efetivos do Character: componente vivo > override no overlay > defaults.
  const effectiveChar = (obj: Object3D): CharacterEditState => {
    const cb = findCharacterEntity(obj)?.getComponent(CharacterBodyComponent);
    const ov = obj.name ? physMap()[obj.name] : undefined;
    const pick = (k: keyof CharacterEditState): number =>
      cb ? (cb[k] as number) : typeof ov?.[k] === 'number' ? (ov[k] as number) : CHAR_DEFAULTS[k];
    // groundY do componente vivo pode ser -Infinity (corpo de código) — mostra o default (0).
    const cbGround = cb && Number.isFinite(cb.groundY) ? cb.groundY : undefined;
    const groundY = cbGround ?? (typeof ov?.['groundY'] === 'number' ? (ov['groundY'] as number) : CHAR_DEFAULTS.groundY);
    return {
      radius: pick('radius'), height: pick('height'), gravity: pick('gravity'),
      stepHeight: pick('stepHeight'), jumpForce: pick('jumpForce'),
      fallSpeedMax: pick('fallSpeedMax'), maxJumps: pick('maxJumps'),
      groundY,
    };
  };
  const addCharacterEntity = (obj: Object3D, params: CharacterEditState): void => {
    const e = game.world.createEntity();
    e.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z, obj.rotation.y));
    e.addComponent(new Object3DComponent(obj));
    e.addComponent(new CharacterBodyComponent(params));
    ensureCharacterSystems();
  };

  return {
    get(obj) {
      const ov = obj.name ? physMap()[obj.name] : undefined;
      const ovType = ov?.['type'];
      let type: BodyType;
      if (ovType === 'none' || ovType === 'static' || ovType === 'character') {
        type = ovType;
      } else if (findCharacterEntity(obj)) {
        type = 'character';
      } else if (colliderApi.get(obj)) {
        type = 'static';
      } else {
        type = 'none';
      }
      return { type, character: effectiveChar(obj) };
    },
    setType(obj, type) {
      if (!obj.name) return;
      // Limpa qualquer corpo existente (character e/ou collider) antes de aplicar o novo.
      const ce = findCharacterEntity(obj);
      if (ce) game.world.destroyEntity(ce);
      if (type === 'character') {
        colliderApi.remove(obj); // tira o collider estático (+ limpa data.colliders)
        const params = effectiveChar(obj);
        addCharacterEntity(obj, params);
        physMap()[obj.name] = { type: 'character', ...params };
      } else if (type === 'static') {
        if (!colliderApi.get(obj)) colliderApi.add(obj); // cria box do bbox + grava em data.colliders
        physMap()[obj.name] = { type: 'static' };
      } else {
        colliderApi.remove(obj);
        physMap()[obj.name] = { type: 'none' };
      }
      ctx.persist();
    },
    setCharacter(obj, patch) {
      if (!obj.name) return;
      const next: CharacterEditState = { ...effectiveChar(obj), ...patch };
      const ce = findCharacterEntity(obj);
      if (ce) game.world.destroyEntity(ce);
      addCharacterEntity(obj, next);
      physMap()[obj.name] = { type: 'character', ...next };
      ctx.persist();
    },
  };
}
