/**
 * Testes do transporte da ponte do editor (src/editor/bridgeTransport.ts,
 * SPEC-0203): a escolha do meio (host > iframe > nenhum) e o formato das
 * mensagens, que precisa ser o MESMO nos dois — é o que deixa os painéis da IDE
 * não saberem se o jogo está num iframe ou no host nativo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectBridgeTransport, IDE_MESSAGE_TYPES } from '../../src/editor/bridgeTransport.js';
import { HostChannel } from '../../src/core/HostChannel.js';

interface Bridge {
  __cortexIdeChannel?: boolean;
  __cortexIdeSend?: (line: string) => void;
  __cortexIdeOnMessage?: (cb: (line: string) => void) => void;
}
const g = globalThis as Bridge;

/** Canal do host falso. */
function installHost(): { sent: string[]; push: (line: string) => void } {
  const sent: string[] = [];
  let listener: ((line: string) => void) | null = null;
  g.__cortexIdeChannel = true;
  g.__cortexIdeSend = (line) => sent.push(line);
  g.__cortexIdeOnMessage = (cb) => { listener = cb; };
  return { sent, push: (line) => listener?.(line) };
}

afterEach(() => {
  delete g.__cortexIdeChannel;
  delete g.__cortexIdeSend;
  delete g.__cortexIdeOnMessage;
  vi.unstubAllGlobals();
});

describe('detectBridgeTransport', () => {
  it('sem host e fora de iframe, não há transporte (jogo standalone)', () => {
    vi.stubGlobal('window', { parent: undefined });
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

  it('com o canal do host, ele VENCE o iframe (preview nativo)', () => {
    const host = installHost();
    vi.stubGlobal('window', { parent: { postMessage: vi.fn() }, addEventListener: vi.fn() });

    const transport = detectBridgeTransport();

    expect(transport?.kind).toBe('host');
    transport!.send({ type: 'state', nodes: 2 });
    expect(JSON.parse(host.sent[0]!)).toEqual({ source: 'cortex-editor', type: 'state', nodes: 2 });
  });
});

describe('transporte do host', () => {
  let host: ReturnType<typeof installHost>;

  beforeEach(() => {
    host = installHost();
    vi.stubGlobal('window', { parent: undefined });
  });

  it('entrega as mensagens da IDE ao handler da ponte', () => {
    const transport = detectBridgeTransport(new HostChannel())!;
    const received: string[] = [];
    transport.onMessage((msg) => received.push(msg.type));

    host.push(JSON.stringify({ source: 'cortex-ide', type: 'select', id: 'x' }));
    host.push(JSON.stringify({ source: 'cortex-ide', type: 'field', value: 1 }));

    expect(received).toEqual(['select', 'field']);
  });

  it('cobre todos os tipos que a IDE manda (o canal roteia POR tipo)', () => {
    const transport = detectBridgeTransport(new HostChannel())!;
    const received: string[] = [];
    transport.onMessage((msg) => received.push(msg.type));

    for (const type of IDE_MESSAGE_TYPES) {
      host.push(JSON.stringify({ source: 'cortex-ide', type }));
    }

    expect(received).toEqual([...IDE_MESSAGE_TYPES]);
  });

  it('a marca de origem vai em toda mensagem enviada', () => {
    const transport = detectBridgeTransport(new HostChannel())!;
    transport.send({ type: 'hello' });
    expect(JSON.parse(host.sent[0]!).source).toBe('cortex-editor');
  });
});
