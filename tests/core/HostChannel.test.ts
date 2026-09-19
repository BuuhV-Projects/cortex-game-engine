/**
 * Testes do canal com a IDE (src/core/HostChannel.ts, SPEC-0200): handshake
 * automático, roteamento por `type`, tolerância a lixo no stdin e silêncio
 * total quando o host não expôs o canal.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HostChannel, HOST_CHANNEL_PROTOCOL } from '../../src/core/HostChannel.js';

interface Bridge {
  __cortexIdeChannel?: boolean;
  __cortexIdeSend?: (line: string) => void;
  __cortexIdeOnMessage?: (cb: (line: string) => void) => void;
}

const g = globalThis as Bridge;

/** Instala o canal falso do host e devolve o que foi enviado + o injetor. */
function installBridge(): { sent: string[]; push: (line: string) => void } {
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
});

describe('HostChannel sem host', () => {
  it('não está disponível e enviar é no-op (jogo standalone)', () => {
    const channel = new HostChannel();
    expect(channel.available).toBe(false);
    expect(() => channel.send({ type: 'state' })).not.toThrow();
  });

  it('não fica disponível só porque o flag existe — precisa da função de envio', () => {
    g.__cortexIdeChannel = true;
    expect(new HostChannel().available).toBe(false);
  });
});

describe('HostChannel com host', () => {
  let bridge: ReturnType<typeof installBridge>;

  beforeEach(() => {
    bridge = installBridge();
  });

  it('fica disponível e envia JSON de uma linha', () => {
    const channel = new HostChannel();
    expect(channel.available).toBe(true);

    channel.send({ type: 'state', nodes: 3 });

    expect(bridge.sent).toHaveLength(1);
    expect(bridge.sent[0]).not.toContain('\n');
    expect(JSON.parse(bridge.sent[0]!)).toEqual({ type: 'state', nodes: 3 });
  });

  it('responde ack ao hello da IDE (handshake)', () => {
    const channel = new HostChannel();
    channel.listen();

    bridge.push(JSON.stringify({ type: 'hello' }));

    expect(bridge.sent).toHaveLength(1);
    expect(JSON.parse(bridge.sent[0]!)).toEqual({ type: 'ack', protocol: HOST_CHANNEL_PROTOCOL });
  });

  it('roteia a mensagem para o handler do tipo', () => {
    const channel = new HostChannel();
    const received: string[] = [];
    channel.on('select', (msg) => received.push(String(msg['id'])));

    bridge.push(JSON.stringify({ type: 'select', id: 'arvore-1' }));

    expect(received).toEqual(['arvore-1']);
  });

  it('ignora tipo sem handler, JSON inválido e mensagem sem type', () => {
    const channel = new HostChannel();
    const received: string[] = [];
    channel.on('select', (msg) => received.push(String(msg['id'])));

    expect(() => {
      bridge.push('isto não é json');
      bridge.push(JSON.stringify({ semTipo: true }));
      bridge.push(JSON.stringify({ type: 'desconhecido' }));
    }).not.toThrow();

    expect(received).toEqual([]);
  });

  it('um handler que explode não derruba o canal', () => {
    const channel = new HostChannel();
    channel.on('boom', () => { throw new Error('falha do handler'); });
    channel.on('ok', () => { /* registrado depois do que explode */ });

    // O contrato é o do host: cada linha é entregue isoladamente, e o host já
    // limpa a exceção. Aqui garantimos que o canal segue roteando depois.
    expect(() => bridge.push(JSON.stringify({ type: 'boom' }))).toThrow();
    expect(() => bridge.push(JSON.stringify({ type: 'ok' }))).not.toThrow();
  });
});
