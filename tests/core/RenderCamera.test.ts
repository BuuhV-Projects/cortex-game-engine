/** SPEC-0303: a câmera que está desenhando (editor ativo → a dele; senão a do jogo). */
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { pickRenderCamera } from '../../src/core/Game.js';

describe('pickRenderCamera (SPEC-0303)', () => {
  const game = new PerspectiveCamera();
  const free = new PerspectiveCamera();
  it('sem editor ou com ele fechado, é a câmera do jogo', () => {
    expect(pickRenderCamera(null, game)).toBe(game);
    expect(pickRenderCamera({ activeCamera: () => null }, game)).toBe(game);
  });
  it('com o editor ativo, é a câmera livre dele', () => {
    expect(pickRenderCamera({ activeCamera: () => free }, game)).toBe(free);
  });
});
