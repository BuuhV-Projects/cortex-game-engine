import type { Object3D } from 'three';
import { Object3DComponent } from '../../components/Object3DComponent.js';
import { PlayerAnimatorComponent } from '../../components/PlayerAnimatorComponent.js';
import { autoMapPlayerClips } from '../../systems/PlatformerAnimationSystem.js';
import type { SceneAnimator } from '../../scene/SceneAnimator.js';
import type { AnimationApi, PlayerAnimationsApi } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/** Estado salvo de animação por objeto (`overlay.data.animation[id]`). */
interface AnimSave {
  clip?: string;
  loop?: boolean;
  speed?: number;
  autoplay?: boolean;
}

/** O {@link SceneAnimator} de um objeto (criado pelo `buildScene` em `userData.cortexAnim`). */
const getAnimator = (obj: Object3D): SceneAnimator | undefined =>
  (obj.userData as Record<string, unknown>)['cortexAnim'] as SceneAnimator | undefined;

/**
 * Autoria de **animação** de modelos `.glb` (escolher clipe, play/stop, loop/
 * velocidade; ADR-0060). Persiste em `overlay.data.animation[id]` — o `buildScene`
 * reaplica no boot (overlay > nó JSON).
 */
export function createAnimationApi(ctx: EditorAuthoringContext): AnimationApi {
  const map = (): Record<string, AnimSave> => ctx.record<AnimSave>('animation');
  return {
    get(obj) {
      const an = getAnimator(obj);
      if (!an) return null;
      const saved = obj.name ? map()[obj.name] : undefined;
      return { clips: an.clipNames(), current: an.current, loop: saved?.loop ?? true, speed: saved?.speed ?? 1 };
    },
    play(obj, clip) {
      const an = getAnimator(obj);
      if (!an) return;
      const saved = (obj.name && map()[obj.name]) || {};
      const loop = saved.loop ?? true;
      const speed = saved.speed ?? 1;
      an.play(clip, { loop, speed });
      if (obj.name) {
        map()[obj.name] = { clip, loop, speed, autoplay: true };
        ctx.persist();
      }
    },
    stop(obj) {
      const an = getAnimator(obj);
      if (!an) return;
      an.stop();
      if (obj.name) {
        map()[obj.name] = { ...(map()[obj.name] ?? {}), autoplay: false };
        ctx.persist();
      }
    },
    setLoop(obj, loop) {
      const an = getAnimator(obj);
      if (!an) return;
      const saved = (obj.name && map()[obj.name]) || {};
      const clip = an.current ?? saved.clip ?? an.clipNames()[0];
      const speed = saved.speed ?? 1;
      if (clip) an.play(clip, { loop, speed });
      if (obj.name) {
        map()[obj.name] = { clip, loop, speed, autoplay: an.current != null };
        ctx.persist();
      }
    },
    setSpeed(obj, speed) {
      const an = getAnimator(obj);
      if (!an) return;
      an.setSpeed(speed);
      if (obj.name) {
        map()[obj.name] = { ...(map()[obj.name] ?? {}), speed };
        ctx.persist();
      }
    },
  };
}

/** Ações de player que o Inspector mostra (mapeáveis a clipes). */
const PLAYER_ACTIONS = ['idle', 'walk', 'run', 'jump', 'fall', 'land'];

/**
 * Autoria do **mapa ação→clipe do player** (idle/walk/run/jump/fall/land; ADR-0060).
 * Lê/grava o {@link PlayerAnimatorComponent} da entidade + `overlay.data.playerAnimations[id]`;
 * o `buildScene` reaplica no boot (overlay > nó).
 */
export function createPlayerAnimationsApi(ctx: EditorAuthoringContext): PlayerAnimationsApi {
  const map = (): Record<string, Record<string, string>> => ctx.record<Record<string, string>>('playerAnimations');
  const findPlayerAnim = (obj: Object3D): PlayerAnimatorComponent | null => {
    for (const e of ctx.game.world.query(PlayerAnimatorComponent)) {
      if (e.getComponent(Object3DComponent)?.object === obj) return e.getComponent(PlayerAnimatorComponent) ?? null;
    }
    return null;
  };
  return {
    get(obj) {
      const comp = findPlayerAnim(obj);
      const animator = getAnimator(obj);
      if (!comp || !animator) return null;
      return { actions: PLAYER_ACTIONS, clips: animator.clipNames(), map: { ...comp.clips } };
    },
    set(obj, action, clip) {
      const comp = findPlayerAnim(obj);
      if (!comp) return;
      if (clip) comp.clips[action] = clip;
      else delete comp.clips[action];
      comp.current = null; // re-avalia a ação no próximo Play
      if (obj.name) {
        const cur = map()[obj.name] ?? {};
        if (clip) cur[action] = clip;
        else delete cur[action];
        map()[obj.name] = cur;
        ctx.persist();
      }
    },
    preview(obj, clip) {
      const an = getAnimator(obj);
      if (an && clip) an.play(clip, { loop: true });
    },
    stop(obj) {
      getAnimator(obj)?.stop();
    },
    autoMap(obj) {
      const comp = findPlayerAnim(obj);
      const an = getAnimator(obj);
      if (!comp || !an) return;
      // Infere pelos nomes (explícito vence) e GRAVA — materializa a inferência.
      comp.clips = autoMapPlayerClips(an.clipNames(), comp.clips);
      if (obj.name) {
        map()[obj.name] = { ...comp.clips };
        ctx.persist();
      }
    },
  };
}
