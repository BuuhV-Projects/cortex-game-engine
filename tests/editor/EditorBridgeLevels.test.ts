/**
 * A ponte publica as fases que o JOGO declarou (ADR-0186) — é o que alimenta o
 * seletor de fase do viewport do Studio.
 *
 * O ponto sensível é a lista ser lida POR CHAMADA, não capturada na criação da
 * ponte: o jogo declara `game.editorLevels` no bootstrap, depois do `new Game`,
 * então capturar o valor no `createEditorBridge` pegaria `undefined` e o seletor
 * nunca apareceria.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEditorBridge, type EditorBridge } from '../../src/editor/EditorBridge.js';
import { createEditorSelection } from '../../src/editor/EditorSelection.js';
import type { EditorLevel } from '../../src/core/Game.js';

interface Ambiente {
  posts: Record<string, unknown>[];
  /** Entrega uma mensagem da IDE à ponte. */
  daIde: (data: Record<string, unknown>) => void;
  bridge: EditorBridge;
}

/**
 * Simula o jogo rodando dentro do iframe da IDE. `window` não existe no ambiente
 * node dos testes, então é stubado (mesmo padrão do GamepadManager.test).
 */
/** Relógio da ponte, em ms — `avancar()` libera o throttle de publish. */
let relogio = 0;
const avancar = (ms = 200): void => { relogio += ms; };

function montar(levels: () => readonly EditorLevel[] | undefined): Ambiente {
  const posts: Record<string, unknown>[] = [];
  let onMessage: ((ev: { data: unknown }) => void) | null = null;
  const parent = { postMessage: (m: unknown) => posts.push(m as Record<string, unknown>) };
  const win = {
    parent,
    addEventListener: (tipo: string, fn: (ev: { data: unknown }) => void) => {
      if (tipo === 'message') onMessage = fn;
    },
    removeEventListener: () => {},
  };
  vi.stubGlobal('window', win);
  // A ponte limita reposts a ~12/s (MIN_INTERVAL_MS). Com o relógio controlado,
  // o teste avança o tempo em vez de esperar de verdade.
  vi.stubGlobal('performance', { now: () => relogio });

  const bridge = createEditorBridge({
    editRoots: [],
    selection: createEditorSelection(),
    ctx: {} as never,
    registry: { get: () => undefined } as never,
    editorState: { active: true, paused: false } as never,
    focusOn: () => {},
    levels,
    onBridged: () => {},
  });
  const daIde = (data: Record<string, unknown>): void => onMessage?.({ data });
  daIde({ source: 'cortex-ide', type: 'ack' }); // handshake
  return { posts, daIde, bridge };
}

const ultimoState = (posts: Record<string, unknown>[]): Record<string, unknown> | undefined =>
  [...posts].reverse().find((p) => p['type'] === 'state');

describe('EditorBridge: fases declaradas pelo jogo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    relogio = 0;
  });

  it('publica a lista no `state`', () => {
    const levels: EditorLevel[] = [
      { id: 'fase-1', label: 'Travessia', group: 'Mundo 1' },
      { id: 'choco-1', label: 'Doce Começo', group: 'Mundo 2' },
    ];
    const { posts, bridge } = montar(() => levels);
    expect(ultimoState(posts)?.['levels']).toEqual(levels);
    bridge.dispose();
  });

  it('sem `editorLevels`, o campo vai indefinido (seletor some)', () => {
    const { posts, bridge } = montar(() => undefined);
    const state = ultimoState(posts);
    expect(state, 'a ponte precisa ter publicado ao menos um state').toBeDefined();
    expect(state?.['levels']).toBeUndefined();
    bridge.dispose();
  });

  it('lê a lista POR CHAMADA — declarar depois do boot ainda funciona', () => {
    // O jogo só preenche `game.editorLevels` no bootstrap. Se a ponte tivesse
    // capturado o valor na criação, o seletor ficaria vazio para sempre.
    let levels: EditorLevel[] | undefined;
    const { posts, daIde, bridge } = montar(() => levels);
    expect(ultimoState(posts)?.['levels']).toBeUndefined();

    levels = [{ id: 'space-1' }];
    avancar();
    daIde({ source: 'cortex-ide', type: 'editor', active: true }); // dispara repost
    expect(ultimoState(posts)?.['levels']).toEqual([{ id: 'space-1' }]);
    bridge.dispose();
  });
});
