import type { Game } from '../core/Game.js';
import { Object3DSyncSystem } from '../systems/Object3DSyncSystem.js';
import {
  ThirdPersonControlSystem,
  type ThirdPersonControlOptions,
} from '../systems/ThirdPersonControlSystem.js';

/** Opções de {@link setupThirdPerson}. */
export interface SetupThirdPersonOptions {
  /** Opções do controle/câmera de 3ª pessoa (moveSpeed, sprintSpeed, cameraDistance…). */
  control?: ThirdPersonControlOptions;
}

/** Handle de {@link setupThirdPerson}. */
export interface ThirdPersonHandle {
  /** O controle/câmera de 3ª pessoa — ajuste velocidades/distância aqui. */
  control: ThirdPersonControlSystem;
}

/**
 * Registra num {@link Game} os sistemas de **terceira pessoa** (estilo Unity
 * StarterAssets ThirdPerson): sincronização mesh↔transform + o controle/câmera
 * (orbita por mouse, WASD relativo à câmera, corre com Shift, pula com Espaço; o
 * personagem vira pra direção do movimento) e a **animação** (idle/walk/run/jump/
 * fall) do `.glb`. O **player** é um nó `character` na cena (idealmente um `model`
 * `.glb` rigado com clipes); o `buildScene` liga a física vertical (gravidade/pulo/
 * aterrar no terreno) sozinho. Pausa no editor (F2). Reduz o bootstrap a uma linha.
 *
 * @example
 * const game = new Game({ canvas })
 * setupThirdPerson(game, { control: { moveSpeed: 2, sprintSpeed: 5.3 } })
 * await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
 * game.start()
 */
export function setupThirdPerson(game: Game, options: SetupThirdPersonOptions = {}): ThirdPersonHandle {
  game.world.addSystem(new Object3DSyncSystem());

  const control = new ThirdPersonControlSystem(
    game.camera as import('three').PerspectiveCamera,
    game.input,
    game.canvas,
    { ...options.control, pauseWhen: () => game.editorActive || game.gameplayPaused },
    game.gamepad,
  );
  game.world.addSystem(control);

  return { control };
}
