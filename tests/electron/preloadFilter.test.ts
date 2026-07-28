/**
 * Filtro do preload de modelos do Monaco (SPEC-0166) — o que entra e o que
 * fica de fora da pré-criação que alimenta o Ctrl+click.
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_WARN_THRESHOLD,
  shouldPreloadProjectFile,
} from '../../electron/renderer/preloadFilter.js';

describe('shouldPreloadProjectFile', () => {
  it('pré-carrega código normal do projeto (com os dois separadores)', () => {
    for (const path of [
      'D:/jogos/teste4/main.ts',
      'D:/jogos/teste4/utils/MainMenu.ts',
      'D:\\jogos\\teste4\\scenes\\aqua1.ts',
      'D:/jogos/teste4/scripts/Ventilador.ts',
      'D:/jogos/teste4/vite.config.ts',
    ]) {
      expect(shouldPreloadProjectFile(path), path).toBe(true);
    }
  });

  it('deixa de fora arquivos e pastas de teste', () => {
    for (const path of [
      'D:/jogos/teste4/tests/rush.test.ts',
      'D:/jogos/teste4/tests/utils/save.ts',
      'D:\\jogos\\teste4\\__tests__\\algo.ts',
      'D:/jogos/teste4/spec/coisa.ts',
      'D:/jogos/teste4/utils/SaveGame.test.ts',
      'D:/jogos/teste4/utils/SaveGame.spec.tsx',
      'D:/jogos/teste4/Tests/Maiuscula.ts',
    ]) {
      expect(shouldPreloadProjectFile(path), path).toBe(false);
    }
  });

  it('o nome do arquivo não conta como pasta de teste', () => {
    // `spec.ts` solto na raiz é código, não pasta `spec/`.
    expect(shouldPreloadProjectFile('D:/jogos/teste4/spec.ts')).toBe(true);
    expect(shouldPreloadProjectFile('D:/jogos/teste4/utils/testing.ts')).toBe(true);
  });

  it('o limiar de aviso fica abaixo do limite do Monaco (200)', () => {
    expect(MODEL_WARN_THRESHOLD).toBeLessThan(200);
  });
});
