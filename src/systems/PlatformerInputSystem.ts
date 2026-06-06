import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { InputManager } from '../core/InputManager.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';

/**
 * Mapeia o teclado ({@link InputManager}) para a **intenção** dos corpos de
 * plataforma: ←/A e →/D definem `moveDir`; Espaço/↑/W enfileiram pulo (na borda
 * de pressão — não enquanto segura). Roda antes do {@link PlatformerPhysicsSystem}.
 *
 * Para input alternativo (gamepad, IA, touch), escreva direto em
 * `PlatformerBodyComponent.moveDir`/`jumpQueued` em vez deste sistema.
 */
export class PlatformerInputSystem extends System {
  static override requiredComponents = [PlatformerBodyComponent];
  override priority = 1;

  private prevJump = false;

  constructor(private readonly input: InputManager) {
    super();
  }

  override update(entities: Entity[]): void {
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

    for (const entity of entities) {
      const body = entity.getComponent(PlatformerBodyComponent)!;
      body.moveDir = dir;
      if (jumpEdge) body.jumpQueued = true;
    }
  }
}
