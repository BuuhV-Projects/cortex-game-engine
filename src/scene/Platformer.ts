import type { Game } from '../core/Game.js';
import { Object3DSyncSystem } from '../systems/Object3DSyncSystem.js';
import { PlatformerInputSystem } from '../systems/PlatformerInputSystem.js';
import { PlatformerPhysicsSystem } from '../systems/PlatformerPhysicsSystem.js';
import { FollowCamera2DSystem, type FollowCamera2DOptions } from '../systems/FollowCamera2DSystem.js';
import { PlatformerAnimationSystem } from '../systems/PlatformerAnimationSystem.js';

/** Opções de {@link setupPlatformer}. */
export interface SetupPlatformerOptions {
  /** Opções da câmera 2D-follow (offset, distância, roll no Z, bounds…). */
  camera?: FollowCamera2DOptions;
}

/** Handle de {@link setupPlatformer}. */
export interface PlatformerHandle {
  /** A câmera 2D-follow — use `.setRoll(...)` pra o leve giro 2.5D. */
  followCamera: FollowCamera2DSystem;
}

/**
 * Registra num {@link Game} os sistemas de **plataforma 2.5D**: sincronização
 * mesh↔transform, input (teclado→intenção), física (gravidade+colisão AABB) e a
 * câmera 2D-follow. Os objetos vêm da cena data-driven (`buildScene` com `world`
 * — nós com `collider`/`player` viram entidades). Reduz o bootstrap a uma linha.
 *
 * @example
 * const game = new Game({ canvas })
 * const { followCamera } = setupPlatformer(game, { camera: { distance: 16 } })
 * await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
 * game.start()
 */
export function setupPlatformer(game: Game, options: SetupPlatformerOptions = {}): PlatformerHandle {
  game.world.addSystem(new Object3DSyncSystem());

  // Gameplay (física + input) PAUSA enquanto o editor (F2) está ativo — assim o
  // player não cai e os objetos não se mexem enquanto você edita.
  // Ações remapeáveis por default (ADR-0164) — os bindings de fábrica são as
  // mesmas teclas de sempre, então nada muda pra quem já usava.
  const input = new PlatformerInputSystem(game.input, game.actions);
  input.pauseWhen = () => game.editorActive || game.gameplayPaused;
  game.world.addSystem(input);

  const physics = new PlatformerPhysicsSystem();
  physics.pauseWhen = () => game.editorActive || game.gameplayPaused;
  game.world.addSystem(physics);

  const followCamera = new FollowCamera2DSystem(game.camera, options.camera);
  // Pausa no editor: enquanto edita, o follow NÃO mexe na câmera do jogo (a
  // navegação usa a câmera livre do editor), então dá pra posicionar/ver o frustum
  // sem ele brigar. No Play o follow assume e segue o player.
  followCamera.pauseWhen = () => game.editorActive;
  game.world.addSystem(followCamera);

  // Animação por ação do player (idle/walk/run/jump/fall): toca o clipe certo
  // conforme o estado do corpo. Pausa no editor (a preview de animação é manual).
  const playerAnim = new PlatformerAnimationSystem();
  playerAnim.pauseWhen = () => game.editorActive || game.gameplayPaused;
  game.world.addSystem(playerAnim);

  return { followCamera };
}
