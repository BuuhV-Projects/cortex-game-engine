/**
 * Lista de projetos recentes da tela inicial (SPEC-0178): ordem, saturação,
 * remoção e tolerância a storage corrompido.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_RECENTS,
  RECENTS_KEY,
  addRecent,
  getRecents,
  projectNameOf,
  removeRecent,
  type RecentsStorage,
} from '../../electron/renderer/recentProjects.js';

/** Storage falso — o módulo é puro, então o teste roda em ambiente node (sem DOM). */
function fakeStorage(initial: string | null = null): RecentsStorage & { raw(): string | null } {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, v: string) => {
      value = v;
    },
    raw: () => value,
  };
}

describe('projectNameOf', () => {
  it('usa o último segmento do path, com qualquer separador ou barra final', () => {
    expect(projectNameOf('D:/jogos/teste4')).toBe('teste4');
    expect(projectNameOf('D:\\jogos\\teste4')).toBe('teste4');
    expect(projectNameOf('D:/jogos/teste4/')).toBe('teste4');
    expect(projectNameOf('D:\\jogos\\projeto-aventura\\\\')).toBe('projeto-aventura');
  });
});

describe('getRecents', () => {
  it('storage vazio ou corrompido vira lista vazia (não estoura)', () => {
    expect(getRecents(fakeStorage())).toEqual([]);
    expect(getRecents(fakeStorage('nao é json'))).toEqual([]);
    expect(getRecents(fakeStorage('{"nao":"array"}'))).toEqual([]);
    expect(getRecents(null)).toEqual([]);
  });
});

describe('addRecent', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('põe o projeto no topo, com nome derivado do path', () => {
    addRecent('D:/jogos/teste4', 1000, storage);
    addRecent('D:/jogos/projeto-aventura', 2000, storage);
    expect(getRecents(storage)).toEqual([
      { path: 'D:/jogos/projeto-aventura', name: 'projeto-aventura', openedAt: 2000 },
      { path: 'D:/jogos/teste4', name: 'teste4', openedAt: 1000 },
    ]);
  });

  it('reabrir o mesmo projeto move pro topo sem duplicar', () => {
    addRecent('D:/jogos/teste4', 1000, storage);
    addRecent('D:/jogos/projeto-aventura', 2000, storage);
    addRecent('D:/jogos/teste4', 3000, storage);
    const list = getRecents(storage);
    expect(list.map((r) => r.path)).toEqual(['D:/jogos/teste4', 'D:/jogos/projeto-aventura']);
    expect(list[0]?.openedAt).toBe(3000);
  });

  it(`satura em ${MAX_RECENTS} projetos, descartando os mais antigos`, () => {
    for (let i = 0; i < MAX_RECENTS + 5; i++) addRecent(`D:/jogos/j${i}`, i, storage);
    const list = getRecents(storage);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]?.path).toBe(`D:/jogos/j${MAX_RECENTS + 4}`);
    expect(list.some((r) => r.path === 'D:/jogos/j0')).toBe(false);
  });

  it('persiste na chave `recentProjects` (não migrar: quebraria os recentes salvos)', () => {
    addRecent('D:/jogos/teste4', 1000, storage);
    expect(RECENTS_KEY).toBe('recentProjects');
    expect(JSON.parse(storage.raw() ?? '[]')).toHaveLength(1);
  });
});

describe('removeRecent', () => {
  it('tira só a entrada pedida e mantém a ordem das outras', () => {
    const storage = fakeStorage();
    addRecent('D:/jogos/a', 1, storage);
    addRecent('D:/jogos/b', 2, storage);
    addRecent('D:/jogos/c', 3, storage);
    const rest = removeRecent('D:/jogos/b', storage);
    expect(rest.map((r) => r.path)).toEqual(['D:/jogos/c', 'D:/jogos/a']);
    expect(getRecents(storage).map((r) => r.path)).toEqual(['D:/jogos/c', 'D:/jogos/a']);
  });

  it('remover path inexistente não muda nada', () => {
    const storage = fakeStorage();
    addRecent('D:/jogos/a', 1, storage);
    expect(removeRecent('D:/jogos/naoexiste', storage).map((r) => r.path)).toEqual(['D:/jogos/a']);
  });

  it('remover o último esvazia a lista (a tela cai no estado vazio)', () => {
    const storage = fakeStorage();
    addRecent('D:/jogos/a', 1, storage);
    expect(removeRecent('D:/jogos/a', storage)).toEqual([]);
    expect(getRecents(storage)).toEqual([]);
  });
});
