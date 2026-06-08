/**
 * Testes do state machine de animação do player (src/systems/PlatformerAnimationSystem.ts):
 * derivar a ação do estado do corpo, auto-map por nome e resolução com fallback.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveLocomotion,
  autoMapPlayerClips,
  resolvePlayerClip,
} from '../../src/systems/PlatformerAnimationSystem.js';

describe('deriveLocomotion', () => {
  it('chão parado = idle', () => {
    expect(deriveLocomotion({ vx: 0, vy: 0, grounded: true }, 4)).toBe('idle');
  });
  it('chão rápido = run, lento = walk', () => {
    expect(deriveLocomotion({ vx: 8, vy: 0, grounded: true }, 4)).toBe('run');
    expect(deriveLocomotion({ vx: 2, vy: 0, grounded: true }, 4)).toBe('walk');
  });
  it('no ar: subindo = jump, descendo = fall', () => {
    expect(deriveLocomotion({ vx: 0, vy: 5, grounded: false }, 4)).toBe('jump');
    expect(deriveLocomotion({ vx: 0, vy: -5, grounded: false }, 4)).toBe('fall');
  });
});

describe('autoMapPlayerClips', () => {
  it('mapeia pelos nomes (estilo KayKit)', () => {
    const m = autoMapPlayerClips(['Idle_A', 'Walking_A', 'Running_A', 'Jump_Idle']);
    expect(m['idle']).toBe('Idle_A');
    expect(m['walk']).toBe('Walking_A');
    expect(m['run']).toBe('Running_A');
    expect(m['jump']).toBe('Jump_Idle');
  });
  it('o explícito (JSON/editor) vence o auto-map', () => {
    const m = autoMapPlayerClips(['Idle', 'Run', 'Jump'], { idle: 'Run' });
    expect(m['idle']).toBe('Run');
    expect(m['run']).toBe('Run');
  });
});

describe('resolvePlayerClip', () => {
  const names = ['Idle', 'Walk', 'Jump'];
  it('resolve exato', () => {
    expect(resolvePlayerClip(names, { idle: 'Idle' }, 'idle')).toBe('Idle');
  });
  it('cai no fallback run→walk e fall→jump', () => {
    expect(resolvePlayerClip(names, { walk: 'Walk' }, 'run')).toBe('Walk'); // run cai pra walk
    expect(resolvePlayerClip(names, { jump: 'Jump' }, 'fall')).toBe('Jump'); // fall cai pra jump
  });
  it('null quando nada casa', () => {
    expect(resolvePlayerClip(names, {}, 'attack')).toBeNull();
  });
});
