import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { InputManager } from '../core/InputManager.js';
import type { InputActions } from '../input/InputActions.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';

/**
 * Mapeia o teclado ({@link InputManager}) para a **intenção** dos corpos de
 * plataforma: ←/A e →/D definem `moveDir`; Espaço/↑/W enfileiram pulo (na borda
 * de pressão — não enquanto segura). Roda antes do {@link PlatformerPhysicsSystem}.
 *
 * Passando um {@link InputActions} (tipicamente `game.actions`), lê por AÇÃO
 * (`moveLeft`/`moveRight`/`jump`) e respeita o que o jogador remapeou na tela
 * de Controles — inclusive gamepad (ADR-0164). Sem ele, valem as teclas fixas.
 *
 * Para input alternativo (IA, touch), escreva direto em
 * `PlatformerBodyComponent.moveDir`/`jumpQueued` em vez deste sistema.
 */
export class PlatformerInputSystem extends System {
  static override requiredComponents = [PlatformerBodyComponent];
  override priority = 1;

  private prevJump = false;

  constructor(
    private readonly input: InputManager,
    private readonly actions?: InputActions,
  ) {
    super();
  }

  override update(entities: Entity[]): void {
    const { dir, jumpEdge } = this.actions ? this.readActions(this.actions) : this.readKeys();

    for (const entity of entities) {
      const body = entity.getComponent(PlatformerBodyComponent)!;
      body.moveDir = dir;
      if (jumpEdge) body.jumpQueued = true;
    }
  }

  /** Leitura por ação remapeável — a borda de pulo vem do `pressed()` (polado pelo Game). */
  private readActions(actions: InputActions): { dir: number; jumpEdge: boolean } {
    return { dir: actions.axis('moveLeft', 'moveRight'), jumpEdge: actions.pressed('jump') };
  }

  /** Leitura legada: teclas fixas, borda calculada aqui. */
  private readKeys(): { dir: number; jumpEdge: boolean } {
    let dir = 0;
    if (this.input.isKeyDown('ArrowLeft') || this.input.isKeyDown('a') || this.input.isKeyDown('A')) dir -= 1;
    if (this.input.isKeyDown('ArrowRight') || this.input.isKeyDown('d') || this.input.isKeyDown('D')) dir += 1;
    const jumpDown =
      this.input.isKeyDown(' ') ||
      this.input.isKeyDown('ArrowUp') ||
      this.input.isKeyDown('w') ||
      this.input.isKeyDown('W');
    const jumpEdge = jumpDown && !this.prevJump;
    this.prevJump = jumpDown;
    return { dir, jumpEdge };
  }
}
