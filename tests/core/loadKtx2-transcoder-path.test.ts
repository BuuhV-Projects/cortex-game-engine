import { expect, it } from 'vitest';
import { transcoderDirectory } from '../../src/core/loadKtx2.js';

// SPEC-0292: o Vite dev entrega a pasta sem a barra final.
it('garante a barra final no caminho do transcoder', () => {
  expect(transcoderDirectory('http://localhost:5174/vendor/cortex-game-engine/basis'))
    .toBe('http://localhost:5174/vendor/cortex-game-engine/basis/');
  expect(transcoderDirectory('file:///app/basis/')).toBe('file:///app/basis/');
});
