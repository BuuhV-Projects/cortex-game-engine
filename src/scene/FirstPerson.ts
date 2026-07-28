import type { Game } from '../core/Game.js';
import { Object3DSyncSystem } from '../systems/Object3DSyncSystem.js';
import {
  FirstPersonCameraSystem,
  type FirstPersonCameraOptions,
} from '../systems/FirstPersonCameraSystem.js';

/** Opções de {@link setupFirstPerson}. */
export interface SetupFirstPersonOptions {
  /** Opções da câmera/controle FPS (moveSpeed, eyeHeight, sensitivity…). */
  camera?: FirstPersonCameraOptions;
}

/** Handle de {@link setupFirstPerson}. */
export interface FirstPersonHandle {
  /** A câmera/controle de 1ª pessoa — ajuste `moveSpeed`/sensibilidade aqui. */
  camera: FirstPersonCameraSystem;
}

/**
 * Registra num {@link Game} os sistemas de **primeira pessoa** (FPS): sincronização
 * mesh↔transform e a câmera/controle FPS (mouse-look + WASD + pulo). O **player** é
 * um nó `character` na cena (cápsula); o `buildScene` registra sozinho a física
 * vertical dele (`CharacterPhysicsSystem` — gravidade/pulo/aterrar no terreno), e o
 * terreno colidível vem de um nó `terrain`. Reduz o bootstrap a uma linha.
 *
 * O controle FPS **pausa** no editor (F2) e no pause do play, então não rouba o
 * mouse nem move o player enquanto você edita.
 *
 * @example
 * const game = new Game({ canvas })
 * setupFirstPerson(game, { camera: { moveSpeed: 6 } })
 * await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
 * game.start()
 */
export function setupFirstPerson(game: Game, options: SetupFirstPersonOptions = {}): FirstPersonHandle {
  game.world.addSystem(new Object3DSyncSystem());

  // `pauseWhen` vai nas OPÇÕES (não no `System.pauseWhen` da base): assim o World
  // NÃO pula o update — o sistema precisa rodar mesmo pausado pra mostrar o corpo do
  // player e não travar o cursor no editor. A pausa é tratada internamente.
  const camera = new FirstPersonCameraSystem(
    game.camera as import('three').PerspectiveCamera,
    game.input,
    game.canvas,
    {
      ...options.camera,
      // Ações remapeáveis por default (ADR-0164); `camera.actions: null` volta às teclas fixas.
      actions: options.camera?.actions === null ? null : (options.camera?.actions ?? game.actions),
      pauseWhen: () => game.editorActive || game.gameplayPaused,
    },
  );
  game.world.addSystem(camera);

  return { camera };
}
