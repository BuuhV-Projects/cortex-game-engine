import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { FollowCameraTargetComponent } from '../components/FollowCameraTargetComponent.js';

/**
 * Provedor do **eixo de movimento** top-down (−1..1 em cada componente), implementado
 * pelo **jogo** lendo o controle dele (teclado/joystick). O engine não sabe de onde
 * vem (ADR-0066): `x` = esquerda/direita, `y` = cima(−1)/baixo(+1) na tela.
 */
export type MoveAxisProvider = () => { x: number; y: number };

/** Opções do {@link TopDownMovementSystem}. */
export interface TopDownMovementOptions {
  /** Velocidade de caminhada no plano (unidades/s). Default `5`. */
  moveSpeed?: number;
}

/**
 * Movimento **top-down** (farm sim / RPG estilo Stardew): lê o **eixo** de um
 * {@link MoveAxisProvider} fornecido pelo jogo e move o player no **plano XZ**
 * (`x` = ±X, `y` cima = −Z), respeitando o **analógico** (anda devagar com pouco
 * tilt), e faz o personagem **virar na direção do movimento** (`transform.rotationY`).
 * O **Y** (gravidade/aterrar) fica com o {@link CharacterBodyComponent} +
 * `CharacterPhysicsSystem`. O engine não conhece o esquema de input — o jogo passa o
 * eixo (ADR-0066).
 *
 * Mira o único player (entidade com {@link TransformComponent} +
 * {@link CharacterBodyComponent}, `entities[0]`) e o **marca como alvo da câmera**
 * ({@link FollowCameraTargetComponent}) no 1º update se faltar. Tipicamente montado
 * via `setupTopDown`.
 *
 * @example
 * // o jogo passa o eixo do controle dele:
 * const move = new TopDownMovementSystem(() => meuControle.moveAxis(), { moveSpeed: 5 })
 * move.pauseWhen = () => game.editorActive
 * game.world.addSystem(move)
 */
export class TopDownMovementSystem extends System {
  static override requiredComponents = [TransformComponent, CharacterBodyComponent];
  override priority = 2;

  private readonly moveSpeed: number;

  constructor(
    private readonly readMove: MoveAxisProvider,
    options: TopDownMovementOptions = {},
  ) {
    super();
    this.moveSpeed = options.moveSpeed ?? 5;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const player = entities[0];
    if (!player) return;

    // Garante que o player é alvo da câmera top-down (que exige o marcador) — sem
    // obrigar a cena a declará-lo. Só no 1º tick (idempotente).
    if (!player.getComponent(FollowCameraTargetComponent)) {
      player.addComponent(new FollowCameraTargetComponent());
    }

    const t = player.getComponent(TransformComponent)!;
    const dt = deltaTime / 1000;

    const { x: dx, y: dz } = this.readMove(); // y (cima na tela = −1) = −Z

    const len = Math.hypot(dx, dz);
    if (len > 0) {
      // Clampa a magnitude a 1 (diagonal de teclado não acelera), mas PRESERVA o
      // analógico do stick (len < 1 = andar mais devagar).
      const scale = (this.moveSpeed * dt * (len > 1 ? 1 : len)) / len;
      t.x += dx * scale;
      t.z += dz * scale;
      // Vira pra direção do movimento (modelo com frente no +Z). Ajustável por modelo.
      t.rotationY = Math.atan2(dx, dz);
    }
  }
}
