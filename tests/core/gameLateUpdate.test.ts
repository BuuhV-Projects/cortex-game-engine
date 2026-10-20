/**
 * SPEC-0351 — `game.onLateUpdate`: roda depois do `world.tick` (vê o que os Systems
 * moveram no frame), antes da UI e do editor, com o mesmo delta do `onUpdate`.
 * (Game exercitado via `Object.create(Game.prototype)`: construir um Game real exige
 * canvas/WebGPU, que não existem no ambiente node.)
 */

import { describe, it, expect } from 'vitest';
import { Game } from '../../src/core/Game.js';

type BareGame = Pick<Game, 'onUpdate' | 'onLateUpdate'> & { _update(deltaMs: number): void };

function bareGame(log: string[], pos: { x: number }): BareGame {
  const g = Object.create(Game.prototype) as Record<string, unknown>;
  const noop = (): void => {};
  g['profiler'] = { begin: noop, end: noop };
  g['gamepad'] = { poll: () => log.push('input') };
  g['actions'] = { poll: noop };
  g['world'] = { tick: (ms: number) => { log.push(`world:${ms}`); pos.x += 1; } };
  g['_ui'] = { update: () => log.push('ui') };
  g['_editor'] = { update: () => log.push('editor') };
  g['_onUpdate'] = null;
  g['_onLateUpdate'] = null;
  return g as unknown as BareGame;
}

describe('Game.onLateUpdate (SPEC-0351)', () => {
  it('ordem do frame: input → onUpdate → world.tick → onLateUpdate → UI → editor', () => {
    const log: string[] = [];
    const g = bareGame(log, { x: 0 });
    g.onUpdate((dt) => log.push(`update:${dt}`));
    g.onLateUpdate((dt) => log.push(`late:${dt}`));
    g._update(20);
    expect(log).toEqual(['input', 'update:0.02', 'world:20', 'late:0.02', 'ui', 'editor']);
  });

  it('o late vê o movimento do frame; o onUpdate, o do frame anterior', () => {
    const pos = { x: 0 };
    const g = bareGame([], pos);
    const seen = { update: [] as number[], late: [] as number[] };
    g.onUpdate(() => seen.update.push(pos.x));
    g.onLateUpdate(() => seen.late.push(pos.x));
    g._update(16);
    g._update(16);
    expect(seen.update).toEqual([0, 1]);
    expect(seen.late).toEqual([1, 2]);
  });

  it('sem callback registrado, o frame segue igual', () => {
    const log: string[] = [];
    bareGame(log, { x: 0 })._update(16);
    expect(log).toEqual(['input', 'world:16', 'ui', 'editor']);
  });
});
