/**
 * Throttle da ponte do editor (SPEC-0671): sem `force`, a descrição do estado +
 * o `JSON.stringify` rodam no máximo uma vez a cada MIN_INTERVAL_MS (80 ms),
 * mude o JSON ou não. Antes o instante só andava no ENVIO: com o estado parado,
 * o JSON nunca mudava, nada era enviado, e a serialização rodava todo quadro.
 *
 * `viewportInfo` é chamado uma vez por descrição — é o contador.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEditorBridge, type EditorBridge } from '../../src/editor/EditorBridge.js';
import { createEditorSelection } from '../../src/editor/EditorSelection.js';

let relogio = 0;
const QUADRO_MS = 1000 / 60;

function montar(viewportInfo: () => Record<string, unknown>): { posts: unknown[]; bridge: EditorBridge } {
  const posts: unknown[] = [];
  let onMessage: ((ev: { data: unknown }) => void) | null = null;
  vi.stubGlobal('window', {
    parent: { postMessage: (m: unknown) => posts.push(m) },
    addEventListener: (tipo: string, fn: (ev: { data: unknown }) => void) => {
      if (tipo === 'message') onMessage = fn;
    },
    removeEventListener: () => {},
  });
  vi.stubGlobal('performance', { now: () => relogio });
  const bridge = createEditorBridge({
    editRoots: [],
    selection: createEditorSelection(),
    ctx: {} as never,
    registry: { get: () => undefined } as never,
    editorState: { active: true, paused: false } as never,
    focusOn: () => {},
    viewportInfo,
    onBridged: () => {},
  });
  (onMessage as ((ev: { data: unknown }) => void) | null)?.({ data: { source: 'cortex-ide', type: 'ack' } });
  return { posts, bridge };
}

/** Um segundo de quadros a 60 fps, cada um chamando `publish()`. */
function umSegundo(bridge: EditorBridge): void {
  for (let i = 0; i < 60; i++) {
    relogio += QUADRO_MS;
    bridge.publish();
  }
}

describe('EditorBridge: throttle da descrição', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    relogio = 0;
  });

  it('com o estado parado, descreve no máximo a cada 80 ms (não todo quadro)', () => {
    const descrever = vi.fn(() => ({ fps: 60 }));
    const { bridge } = montar(descrever);
    descrever.mockClear(); // o handshake descreve uma vez (force)
    umSegundo(bridge);
    expect(descrever.mock.calls.length).toBeLessThanOrEqual(Math.ceil(1000 / 80));
    expect(descrever.mock.calls.length).toBeGreaterThan(0);
    bridge.dispose();
  });

  it('com o estado mudando, continua postando a ~12/s', () => {
    let n = 0;
    const { posts, bridge } = montar(() => ({ frame: n++ }));
    const antes = posts.length;
    umSegundo(bridge);
    const enviados = posts.length - antes;
    expect(enviados).toBeGreaterThanOrEqual(10);
    expect(enviados).toBeLessThanOrEqual(Math.ceil(1000 / 80));
    bridge.dispose();
  });
});
