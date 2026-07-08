/**
 * Shim de localStorage do host nativo (native/js/src/shims/storage.js): espelha
 * o subset getItem/setItem/removeItem/clear/key/length por cima de um par de
 * funções nativas de leitura/escrita de arquivo do usuário. Aqui as funções
 * nativas são FAKES em memória (um "arquivo" só), como o host faz em disco.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installStorageShims } from '../../native/js/src/shims/storage.js';

// ── Fakes do backend nativo (equivalem ao user_storage.cpp: 1 arquivo JSON) ──
let files: Record<string, string>;
let writes: number;

function installFakeNatives(): void {
  files = {};
  writes = 0;
  (globalThis as Record<string, unknown>)['__cortexReadUserFile'] = (name: string): string | null =>
    Object.prototype.hasOwnProperty.call(files, name) ? files[name]! : null;
  (globalThis as Record<string, unknown>)['__cortexWriteUserFile'] = (name: string, text: string): boolean => {
    files[name] = text;
    writes++;
    return true;
  };
}

function clearGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  delete g['__cortexReadUserFile'];
  delete g['__cortexWriteUserFile'];
  delete g['localStorage'];
}

describe('storage shim (localStorage nativo)', () => {
  beforeEach(() => clearGlobals());
  afterEach(() => clearGlobals());

  it('NÃO instala quando o backend nativo está ausente (browser/Studio)', () => {
    const g = globalThis as Record<string, unknown>;
    const original = { marker: true };
    g['localStorage'] = original; // simula o localStorage real do ambiente
    installStorageShims();
    expect(g['localStorage']).toBe(original); // preservado, não sobrescreve
  });

  it('instala e persiste set/get pelo arquivo do usuário', () => {
    installFakeNatives();
    installStorageShims();
    const ls = (globalThis as Record<string, unknown>)['localStorage'] as Storage;

    expect(ls.getItem('cute-obstacle-rush:save')).toBeNull();
    ls.setItem('cute-obstacle-rush:save', JSON.stringify({ version: 1, completed: ['fase-1'] }));
    expect(ls.getItem('cute-obstacle-rush:save')).toBe('{"version":1,"completed":["fase-1"]}');
    // Escreveu no "disco" (um único arquivo JSON).
    expect(files['localStorage.json']).toContain('fase-1');
  });

  it('sobrevive a uma nova sessão (recarrega do arquivo)', () => {
    installFakeNatives();
    installStorageShims();
    ;((globalThis as Record<string, unknown>)['localStorage'] as Storage).setItem('k', 'v');
    const persisted = files['localStorage.json']!;

    // "Reinicia": novo mapa em memória, mas o arquivo persiste.
    delete (globalThis as Record<string, unknown>)['localStorage'];
    (globalThis as Record<string, unknown>)['__cortexReadUserFile'] = (): string => persisted;
    installStorageShims();
    expect(((globalThis as Record<string, unknown>)['localStorage'] as Storage).getItem('k')).toBe('v');
  });

  it('removeItem e clear apagam e regravam', () => {
    installFakeNatives();
    installStorageShims();
    const ls = (globalThis as Record<string, unknown>)['localStorage'] as Storage;
    ls.setItem('a', '1');
    ls.setItem('b', '2');
    expect(ls.length).toBe(2);
    ls.removeItem('a');
    expect(ls.getItem('a')).toBeNull();
    expect(ls.length).toBe(1);
    ls.clear();
    expect(ls.length).toBe(0);
    expect(files['localStorage.json']).toBe('{}');
  });

  it('arquivo corrompido → começa limpo (sem lançar)', () => {
    installFakeNatives();
    files['localStorage.json'] = '{ isso não é json';
    expect(() => installStorageShims()).not.toThrow();
    const ls = (globalThis as Record<string, unknown>)['localStorage'] as Storage;
    expect(ls.length).toBe(0);
  });
});
