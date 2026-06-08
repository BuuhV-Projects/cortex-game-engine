import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { PlayerAnimatorComponent } from '../components/PlayerAnimatorComponent.js';
import type { SceneAnimator } from '../scene/SceneAnimator.js';

/** Deriva a ação de locomoção do estado do corpo: `idle`/`walk`/`run`/`jump`/`fall`. */
export function deriveLocomotion(
  body: { vx: number; vy: number; grounded: boolean },
  runThreshold: number,
): string {
  if (!body.grounded) return body.vy > 0 ? 'jump' : 'fall';
  const speed = Math.abs(body.vx);
  if (speed < 0.1) return 'idle';
  return speed >= runThreshold ? 'run' : 'walk';
}

/** Cadeias de fallback por ação (clipe ausente cai num parecido). */
const FALLBACKS: Record<string, string[]> = {
  idle: ['idle'],
  walk: ['walk', 'run'],
  run: ['run', 'walk'],
  jump: ['jump', 'fall'],
  fall: ['fall', 'jump'],
  land: ['land', 'idle'],
};

/**
 * Completa um mapa ação→clipe **auto-mapeando pelos nomes** dos clipes disponíveis
 * (idle→"Idle", run→"Running_A", jump→"Jump"…). O `explicit` (JSON/editor) tem
 * precedência; só preenche o que falta. Cobre os nomes KayKit/Quaternius.
 */
export function autoMapPlayerClips(
  available: readonly string[],
  explicit: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = { ...explicit };
  const find = (kw: string): string | undefined => available.find((n) => n.toLowerCase().includes(kw));
  const want: Record<string, string[]> = {
    idle: ['idle'],
    walk: ['walk'],
    run: ['run', 'running'],
    jump: ['jump'],
    fall: ['fall', 'jump_idle'],
    land: ['land'],
  };
  for (const [action, kws] of Object.entries(want)) {
    if (out[action]) continue;
    for (const kw of kws) {
      const c = find(kw);
      if (c) {
        out[action] = c;
        break;
      }
    }
  }
  return out;
}

/** Resolve o clipe real de uma ação (com fallback run↔walk, fall↔jump, land→idle), ou `null`. */
export function resolvePlayerClip(
  clipNames: readonly string[],
  map: Record<string, string>,
  action: string,
): string | null {
  for (const a of FALLBACKS[action] ?? [action]) {
    const name = map[a];
    if (name && clipNames.includes(name)) return name;
  }
  return null;
}

/**
 * Toca a animação do player conforme a **ação** derivada do
 * {@link PlatformerBodyComponent}: idle/walk/run no chão, jump/fall no ar, e
 * one-shots disparados ({@link PlayerAnimatorComponent.trigger}, ex.: attack).
 * Mapeia a ação pro clipe via {@link PlayerAnimatorComponent.clips} e toca no
 * `SceneAnimator` (em `userData.cortexAnim`). É o "controle de player" padronizado:
 * a IA/editor só preenchem o mapa ação→clipe; o resto é automático.
 */
export class PlatformerAnimationSystem extends System {
  static override requiredComponents = [PlatformerBodyComponent, Object3DComponent, PlayerAnimatorComponent];
  override priority = 35; // depois da física/sync

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    for (const e of entities) {
      const body = e.getComponent(PlatformerBodyComponent)!;
      const obj = e.getComponent(Object3DComponent)!.object;
      const anim = e.getComponent(PlayerAnimatorComponent)!;
      const animator = (obj.userData as Record<string, unknown>)['cortexAnim'] as SceneAnimator | undefined;
      if (!animator) continue;
      const names = animator.clipNames();

      // One-shot (ataque/hit/…) — toca uma vez e volta à locomoção.
      if (anim.oneShot) {
        if (anim.current !== anim.oneShot) {
          const clip = resolvePlayerClip(names, anim.clips, anim.oneShot);
          if (clip) {
            animator.play(clip, { loop: false });
            anim.current = anim.oneShot;
            const c = animator.clips.find((x) => x.name === clip);
            anim.oneShotTime = c ? c.duration : 0.3;
          } else {
            anim.oneShot = null;
          }
        } else {
          anim.oneShotTime -= dt;
          if (anim.oneShotTime <= 0) {
            anim.oneShot = null;
            anim.current = null;
          }
        }
        if (anim.oneShot) continue;
      }

      // Locomoção.
      const action = deriveLocomotion(body, anim.runThreshold);
      if (action !== anim.current) {
        const clip = resolvePlayerClip(names, anim.clips, action);
        if (clip) {
          animator.play(clip, { loop: true });
          anim.current = action;
        }
      }
    }
  }
}
