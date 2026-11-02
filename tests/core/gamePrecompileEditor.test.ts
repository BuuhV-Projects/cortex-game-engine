/**
 * SPEC-0657 — `game.precompile()` não aquece com o editor (F2) ativo: o quadro com a
 * cena inteira custava ~40 s a cada reload no Studio. Fora do editor segue igual.
 * (Game exercitado via `Object.create(Game.prototype)`: construir um Game real exige
 * canvas/WebGPU, que não existem no ambiente node.)
 */

import { describe, it, expect, vi } from 'vitest';
import { Game } from '../../src/core/Game.js';

const WARMUP_STARTED = new Error('aquecimento começou');

function bareGame(editorActive: boolean | null): { game: Game; init: ReturnType<typeof vi.fn> } {
  const g = Object.create(Game.prototype) as Record<string, unknown>;
  const init = vi.fn(() => { throw WARMUP_STARTED; });
  g['_editor'] = editorActive === null ? null : { isActive: () => editorActive };
  g['renderer'] = { init, threeRenderer: {} };
  g['_perfTrace'] = { watchPipelines: () => {}, pipelineCounters: () => null };
  return { game: g as unknown as Game, init };
}

describe('Game.precompile com o editor (SPEC-0657)', () => {
  it('editor ativo: retorna sem iniciar o aquecimento', async () => {
    const { game, init } = bareGame(true);
    await game.precompile();
    expect(init).not.toHaveBeenCalled();
  });

  it('editor fechado: aquece', async () => {
    const { game, init } = bareGame(false);
    await expect(game.precompile()).rejects.toBe(WARMUP_STARTED);
    expect(init).toHaveBeenCalledOnce();
  });

  it('sem editor (produção): aquece', async () => {
    const { game, init } = bareGame(null);
    await expect(game.precompile()).rejects.toBe(WARMUP_STARTED);
    expect(init).toHaveBeenCalledOnce();
  });
});
