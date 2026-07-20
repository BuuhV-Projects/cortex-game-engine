import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { InteractionComponent } from '../components/InteractionComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import type { GamepadManager } from '../core/GamepadManager.js';
import type { InputManager } from '../core/InputManager.js';

/** Opções do {@link InteractionSystem}. */
export interface InteractionSystemOptions {
  /**
   * Posição (XZ) do **interator ativo** — quem interage: player a pé OU carro, o que
   * estiver no controle no momento. O jogo fornece (devolve `null` = ninguém interage).
   */
  interactor: () => { x: number; z: number } | null;
  /** Mostra/esconde o prompt na HUD; `null` = nada em alcance. O jogo renderiza. */
  onPrompt?: (interaction: InteractionComponent | null) => void;
  /** Botão do gamepad pra interagir. Default `0` (A). */
  button?: number;
  /** Tecla pra interagir. Default `e`. */
  key?: string;
  /** Pausa (ex.: `() => game.editorActive`). */
  pauseWhen?: () => boolean;
}

/**
 * **Sistema de interação** (SPEC-0080): a cada frame acha o {@link InteractionComponent}
 * **mais próximo** do interator ativo dentro do seu `range`, avisa a HUD via `onPrompt`
 * e dispara `onInteract` na borda do botão/tecla. Genérico e reusável (carro, NPC,
 * porta, item) — a posição do interator e o render do prompt são injetados pelo jogo,
 * então funciona com o player a pé ou o carro (o "player do momento"). `priority = 25`
 * (depois do controle de 3ª pessoa).
 */
export class InteractionSystem extends System {
  static override requiredComponents = [InteractionComponent, TransformComponent];
  override priority = 25;

  private prevPressed = false;
  private current: InteractionComponent | null = null;

  constructor(
    private readonly options: InteractionSystemOptions,
    private readonly gamepad?: GamepadManager,
    private readonly input?: InputManager,
  ) {
    super();
    this.pauseWhen = options.pauseWhen;
  }

  /** Interação atualmente em alcance (ou `null`) — útil pra HUD externa. */
  get active(): InteractionComponent | null {
    return this.current;
  }

  override update(entities: Entity[]): void {
    const pos = this.options.interactor();
    let nearest: InteractionComponent | null = null;
    let bestD2 = Infinity;
    if (pos) {
      for (const e of entities) {
        const it = e.getComponent(InteractionComponent)!;
        if (!it.enabled) continue;
        const t = e.getComponent(TransformComponent)!;
        const dx = t.x - pos.x;
        const dz = t.z - pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= it.range * it.range && d2 < bestD2) {
          bestD2 = d2;
          nearest = it;
        }
      }
    }
    if (nearest !== this.current) {
      this.current = nearest;
      this.options.onPrompt?.(nearest);
    }

    const pressed =
      (this.gamepad?.isButtonDown(0, this.options.button ?? 0) ?? false) ||
      (this.input?.isKeyDown(this.options.key ?? 'e') ?? false);
    if (pressed && !this.prevPressed && this.current) this.current.onInteract();
    this.prevPressed = pressed;
  }
}
