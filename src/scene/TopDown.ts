import type { Game } from '../core/Game.js';
import { Object3DSyncSystem } from '../systems/Object3DSyncSystem.js';
import {
  TopDownMovementSystem,
  type TopDownMovementOptions,
  type MoveAxisProvider,
} from '../systems/TopDownMovementSystem.js';
import { TopDownCameraSystem, type TopDownCameraOptions } from '../systems/TopDownCameraSystem.js';

/** Opções de {@link setupTopDown}. */
export interface SetupTopDownOptions {
  /**
   * **Eixo de movimento** (−1..1) lido do controle do JOGO (teclado/joystick) — o
   * engine não conhece o esquema de input (ADR-0066). Ex.:
   * `() => ({ x: meuControle.moveX(), y: meuControle.moveY() })`. Sem isso, o player
   * não anda.
   */
  readMove?: MoveAxisProvider;
  /** Opções do movimento (moveSpeed). */
  move?: TopDownMovementOptions;
  /** Opções da câmera 3/4 (height, angle, responsiveness, bounds…). */
  camera?: TopDownCameraOptions;
}

/** Handle de {@link setupTopDown}. */
export interface TopDownHandle {
  /** A câmera top-down — ajuste `setHeight`/`setAngle` em runtime. */
  camera: TopDownCameraSystem;
  /** O sistema de movimento (dirigido pelo `readMove` do jogo). */
  move: TopDownMovementSystem;
}

/**
 * Registra num {@link Game} os sistemas de **top-down** (farm sim / RPG estilo
 * Stardew): sincronização mesh↔transform, movimento no plano XZ (vira na direção do
 * andar) e a câmera 3/4 que segue o player. O **player** é um nó `character` na cena
 * (cápsula); o `buildScene` cuida do Y (gravidade/aterrar). O **input é do jogo**:
 * passe `readMove` lendo o controle dele (o engine só fornece `InputManager`/
 * `GamepadManager` crus — ADR-0066). Use **perspectiva** (default do `Game`).
 *
 * Pausa a gameplay no editor (F2) e no pause do play.
 *
 * @example
 * const game = new Game({ canvas })
 * const controle = criarControleDoJogo(game.input) // o JOGO implementa
 * setupTopDown(game, { readMove: () => controle.moveAxis(), move: { moveSpeed: 5 } })
 * await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world,
 *   physicsPaused: () => game.editorActive || game.gameplayPaused })
 * game.start()
 */
export function setupTopDown(game: Game, options: SetupTopDownOptions = {}): TopDownHandle {
  game.world.addSystem(new Object3DSyncSystem());

  const readMove: MoveAxisProvider = options.readMove ?? (() => ({ x: 0, y: 0 }));
  const move = new TopDownMovementSystem(readMove, options.move);
  move.pauseWhen = () => game.editorActive || game.gameplayPaused;
  game.world.addSystem(move);

  // Câmera 3/4 estilo Stardew (angle ~51°, altura 18) por default — ajustável.
  const camera = new TopDownCameraSystem(game.camera, { angle: 0.9, height: 18, ...options.camera });
  camera.pauseWhen = () => game.editorActive;
  game.world.addSystem(camera);

  return { camera, move };
}
