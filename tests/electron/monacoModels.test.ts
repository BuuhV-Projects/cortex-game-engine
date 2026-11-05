/**
 * Alimentação de types no Monaco sem pré-criar models (SPEC-0692) — o preload
 * usa addExtraLib (zero listeners) e o model do engine nasce sob demanda.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock do monaco-editor (só o que o módulo usa) -------------------------
const liveModels = new Map<string, unknown>();
const createModel = vi.fn((content: string, language: string, uri?: { toString(): string }) => {
  const model = { content, language, uri };
  if (uri) liveModels.set(uri.toString(), model);
  return model;
});
vi.mock('monaco-editor', () => ({
  editor: {
    createModel: (...args: unknown[]) => createModel(...(args as [string, string, never])),
    getModel: (uri: { toString(): string }) => liveModels.get(uri.toString()) ?? null,
    getModels: () => [...liveModels.values()],
  },
  Uri: {
    parse: (value: string) => ({
      toString: () => value,
      path: value.replace(/^file:\/\//, ''),
    }),
  },
}));

// --- Mock do monacoWorkspace (addExtraLib é o que interessa) ----------------
const disposedLibs: string[] = [];
const addExtraLib = vi.fn((_content: string, path: string) => ({
  dispose: () => disposedLibs.push(path),
}));
vi.mock('../../electron/renderer/monacoWorkspace.js', () => ({
  monacoTs: {
    typescriptDefaults: {
      addExtraLib: (...args: unknown[]) => addExtraLib(...(args as [string, string])),
    },
  },
  pathToVirtualUri: (realPath: string) => {
    const posix = realPath
      .replace(/\\/g, '/')
      .replace(/^([a-z]):/i, (_m, letter: string) => `/_drive_${letter.toLowerCase()}`);
    const value = `file://${posix}`;
    return { toString: () => value, path: posix };
  },
}));

vi.mock('../../src/core/debug.js', () => ({ debug: vi.fn() }));

import * as monaco from 'monaco-editor';
import {
  preloadProjectFiles,
  loadEngineTypes,
  getOrCreateEngineTypeModel,
} from '../../electron/renderer/monacoModels.js';

/** Paths estáveis usados nos cenários. */
const PROJECT_DIR = 'D:/jogos/demo';
const SOURCE_FILE = 'D:/jogos/demo/main.ts';
const TEST_FILE = 'D:/jogos/demo/tests/rush.test.ts';
const ENGINE_DTS = 'file:///node_modules/cortex-game-engine/core/Engine.d.ts';
const THREE_DTS = 'file:///node_modules/three/index.d.ts';

function stubElectronAPI(overrides: Partial<Record<string, unknown>> = {}): void {
  (globalThis as Record<string, unknown>).window = {
    electronAPI: {
      listProjectFiles: vi.fn(async () => [SOURCE_FILE, TEST_FILE]),
      readFile: vi.fn(async () => 'export const x = 1'),
      readEngineTypes: vi.fn(async () => [
        { path: THREE_DTS, content: 'declare const three: 1', navigable: false },
        { path: ENGINE_DTS, content: 'declare class Engine {}', navigable: true },
      ]),
      ...overrides,
    },
  };
}

beforeEach(() => {
  liveModels.clear();
  createModel.mockClear();
  addExtraLib.mockClear();
  disposedLibs.length = 0;
  stubElectronAPI();
});

describe('preloadProjectFiles (SPEC-0692)', () => {
  it('alimenta o TS service via addExtraLib, sem criar model', async () => {
    await preloadProjectFiles(PROJECT_DIR);
    expect(addExtraLib).toHaveBeenCalledWith('export const x = 1', 'file:///_drive_d/jogos/demo/main.ts');
    expect(createModel).not.toHaveBeenCalled();
  });

  it('deixa arquivos de teste fora do preload (SPEC-0166)', async () => {
    await preloadProjectFiles(PROJECT_DIR);
    const registered = addExtraLib.mock.calls.map((call) => call[1]);
    expect(registered).not.toContain('file:///_drive_d/jogos/demo/tests/rush.test.ts');
  });

  it('descarta as extra libs do projeto anterior ao abrir outro projeto', async () => {
    await preloadProjectFiles(PROJECT_DIR);
    stubElectronAPI({ listProjectFiles: vi.fn(async () => ['D:/jogos/outro/game.ts']) });
    await preloadProjectFiles('D:/jogos/outro');
    expect(disposedLibs).toContain('file:///_drive_d/jogos/demo/main.ts');
    const registered = addExtraLib.mock.calls.map((call) => call[1]);
    expect(registered).toContain('file:///_drive_d/jogos/outro/game.ts');
  });
});

describe('loadEngineTypes + getOrCreateEngineTypeModel (SPEC-0692)', () => {
  it('registra todos os types via addExtraLib e não cria nenhum model', async () => {
    await loadEngineTypes();
    expect(addExtraLib).toHaveBeenCalledTimes(2);
    expect(createModel).not.toHaveBeenCalled();
  });

  it('cria o model do type navegável só na primeira navegação e reusa depois', async () => {
    await loadEngineTypes();
    const uri = monaco.Uri.parse(ENGINE_DTS);
    const first = getOrCreateEngineTypeModel(uri);
    const second = getOrCreateEngineTypeModel(uri);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(createModel).toHaveBeenCalledTimes(1);
  });

  it('retorna null para URI que não é type navegável do engine', async () => {
    await loadEngineTypes();
    expect(getOrCreateEngineTypeModel(monaco.Uri.parse(THREE_DTS))).toBeNull();
    expect(getOrCreateEngineTypeModel(monaco.Uri.parse('file:///outra/coisa.d.ts'))).toBeNull();
  });
});
