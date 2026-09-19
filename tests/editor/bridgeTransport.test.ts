/**
 * Testes do transporte da ponte do editor (src/editor/bridgeTransport.ts,
 * SPEC-0203): a escolha do meio (iframe ou nenhum) e o formato das mensagens.
 *
 * O transporte pelo canal do host nativo saiu com o preview nativo (ADR-0212) —
 * ele vive na branch `feature/preview-nativo-no-studio`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectBridgeTransport } from '../../src/editor/bridgeTransport.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectBridgeTransport', () => {
  it('fora de iframe, não há transporte (jogo standalone)', () => {
    vi.stubGlobal('window', { parent: undefined });
    expect(detectBridgeTransport()).toBeNull();
  });

  it('a janela de topo também não tem IDE do outro lado', () => {
    // `window.parent === window` é como o browser sinaliza "sou a janela raiz".
    const topo = { addEventListener: vi.fn() } as unknown as Window;
    (topo as unknown as { parent: unknown }).parent = topo;
    vi.stubGlobal('window', topo);

    expect(detectBridgeTransport()).toBeNull();
  });

  it('dentro de um iframe, usa postMessage', () => {
    const postMessage = vi.fn();
    const fakeWindow = { parent: { postMessage }, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('window', fakeWindow);

    const transport = detectBridgeTransport();

    expect(transport?.kind).toBe('iframe');
    transport!.send({ type: 'state' });
    expect(postMessage).toHaveBeenCalledWith({ source: 'cortex-editor', type: 'state' }, '*');
  });

  it('entrega ao handler as mensagens da IDE, ignorando ruído sem `type`', () => {
    let listener: ((event: MessageEvent) => void) | null = null;
    const fakeWindow = {
      parent: { postMessage: vi.fn() },
      addEventListener: (_: string, cb: (event: MessageEvent) => void) => { listener = cb; },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', fakeWindow);

    const transport = detectBridgeTransport()!;
    const received: string[] = [];
    transport.onMessage((msg) => received.push(msg.type));

    listener!({ data: { source: 'cortex-ide', type: 'select', id: 'x' } } as MessageEvent);
    listener!({ data: null } as MessageEvent);
    listener!({ data: { semTipo: true } } as MessageEvent);
    listener!({ data: { source: 'cortex-ide', type: 'field', value: 1 } } as MessageEvent);

    expect(received).toEqual(['select', 'field']);
  });

  it('dispose solta o listener (sem isso, a ponte vaza entre reloads)', () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', {
      parent: { postMessage: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener,
    });

    const transport = detectBridgeTransport()!;
    transport.onMessage(() => {});
    transport.dispose();

    expect(removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('a marca de origem vai em toda mensagem enviada', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { parent: { postMessage }, addEventListener: vi.fn(), removeEventListener: vi.fn() });

    detectBridgeTransport()!.send({ type: 'hello' });

    expect(postMessage.mock.calls[0]![0].source).toBe('cortex-editor');
  });
});
