/**
 * A ponte publica se a carga do jogo está em curso (SPEC-0695) — é o que mantém o
 * aviso "Montando a cena…" do Studio até a cena ficar pronta.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEditorBridge, type EditorBridge } from '../../src/editor/EditorBridge.js';
import { createEditorSelection } from '../../src/editor/EditorSelection.js';
import { beginLoadingScope, endLoadingScope } from '../../src/core/frameYield.js';

/** Relógio da ponte, em ms — avançar libera o throttle de publish. */
let clock = 0;
const THROTTLE_GAP_MS = 200;

function mount(): { posts: Record<string, unknown>[]; bridge: EditorBridge; fromIde: (d: Record<string, unknown>) => void } {
  const posts: Record<string, unknown>[] = [];
  let onMessage: ((ev: { data: unknown }) => void) | null = null;
  vi.stubGlobal('window', {
    parent: { postMessage: (m: unknown) => posts.push(m as Record<string, unknown>) },
    addEventListener: (type: string, fn: (ev: { data: unknown }) => void) => {
      if (type === 'message') onMessage = fn;
    },
    removeEventListener: () => {},
  });
  vi.stubGlobal('performance', { now: () => clock });
  const bridge = createEditorBridge({
    editRoots: [],
    selection: createEditorSelection(),
    ctx: {} as never,
    registry: { get: () => undefined } as never,
    editorState: { active: true, paused: false } as never,
    focusOn: () => {},
    onBridged: () => {},
  });
  const fromIde = (data: Record<string, unknown>): void => onMessage?.({ data });
  fromIde({ source: 'cortex-ide', type: 'ack' }); // handshake
  return { posts, bridge, fromIde };
}

const lastState = (posts: Record<string, unknown>[]): Record<string, unknown> | undefined =>
  [...posts].reverse().find((p) => p['type'] === 'state');

describe('EditorBridge: carga do jogo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clock = 0;
  });

  it('sem carga declarada, publica loading=false', () => {
    const { posts, bridge } = mount();
    expect(lastState(posts)?.['loading']).toBe(false);
    bridge.dispose();
  });

  it('com escopo de carga aberto publica true, e false quando fecha', () => {
    beginLoadingScope();
    try {
      const { posts, bridge } = mount();
      expect(lastState(posts)?.['loading']).toBe(true);
      endLoadingScope();
      clock += THROTTLE_GAP_MS;
      bridge.publish();
      expect(lastState(posts)?.['loading']).toBe(false);
      bridge.dispose();
    } finally {
      endLoadingScope(); // no-op se já fechou; garante o contador zerado pros outros testes
    }
  });
});
