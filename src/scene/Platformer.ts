import type { Game } from '../core/Game.js';
import { Object3DSyncSystem } from '../systems/Object3DSyncSystem.js';
import { PlatformerInputSystem } from '../systems/PlatformerInputSystem.js';
import { PlatformerPhysicsSystem } from '../systems/PlatformerPhysicsSystem.js';
import { FollowCamera2DSystem, type FollowCamera2DOptions } from '../systems/FollowCamera2DSystem.js';

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
  game.world.addSystem(new PlatformerInputSystem(game.input));
  game.world.addSystem(new PlatformerPhysicsSystem());
  const followCamera = new FollowCamera2DSystem(game.camera, options.camera);
  game.world.addSystem(followCamera);
  return { followCamera };
}
