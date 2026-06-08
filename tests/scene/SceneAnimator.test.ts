/**
 * Testes do SceneAnimator (src/scene/SceneAnimator.ts): escolher clipe, play/stop,
 * nomes dos clipes. Usa AnimationClips sintéticos (tracks vazias) — a math do mixer
 * roda em node sem WebGPU.
 */
import { describe, it, expect } from 'vitest';
import { Group, AnimationClip } from 'three';
import { SceneAnimator } from '../../src/scene/SceneAnimator.js';

function animator(): SceneAnimator {
  const root = new Group();
  const clips = [new AnimationClip('Idle', 1, []), new AnimationClip('Run', 1, []), new AnimationClip('Jump', 1, [])];
  return new SceneAnimator(root, clips);
}

describe('SceneAnimator', () => {
  it('lista os nomes dos clipes', () => {
    expect(animator().clipNames()).toEqual(['Idle', 'Run', 'Jump']);
  });

  it('play(name) define o clipe atual', () => {
    const a = animator();
    a.play('Run');
    expect(a.current).toBe('Run');
  });

  it('play com nome inexistente cai no primeiro clipe', () => {
    const a = animator();
    a.play('Nope');
    expect(a.current).toBe('Idle');
  });

  it('stop limpa o clipe atual', () => {
    const a = animator();
    a.play('Jump');
    a.stop();
    expect(a.current).toBeNull();
  });

  it('update não quebra', () => {
    const a = animator();
    a.play('Idle');
    expect(() => a.update(0.16)).not.toThrow();
  });
});
