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
  __cortexSetWindowBounds?: (x: number, y: number, w: number, h: number) => void;
  __cortexSetWindowVisible?: (visible: boolean) => void;
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
  delete g.__cortexSetWindowBounds;
  delete g.__cortexSetWindowVisible;
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
    // `embedded` diz se o host roda dentro de uma janela da IDE (SPEC-0201).
    expect(JSON.parse(bridge.sent[0]!)).toEqual({
      type: 'ack', protocol: HOST_CHANNEL_PROTOCOL, embedded: false,
    });
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

  describe('embed na janela da IDE (SPEC-0201)', () => {
    let bounds: number[][];

    beforeEach(() => {
      bounds = [];
      g.__cortexSetWindowBounds = (x, y, w, h) => bounds.push([x, y, w, h]);
    });

    it('a mensagem bounds reposiciona a janela do host', () => {
      const channel = new HostChannel();
      channel.listen();

      bridge.push(JSON.stringify({ type: 'bounds', x: 12, y: 40, width: 800, height: 600 }));

      expect(bounds).toEqual([[12, 40, 800, 600]]);
    });

    it('arredonda coordenadas fracionárias (layout do DOM dá float)', () => {
      const channel = new HostChannel();
      channel.setBounds(10.4, 40.6, 800.5, 600.2);
      expect(bounds).toEqual([[10, 41, 801, 600]]);
    });

    it('ignora painel colapsado (0x0) e valores inválidos', () => {
      const channel = new HostChannel();
      channel.setBounds(0, 0, 0, 0);
      channel.setBounds(0, 0, -10, 100);
      channel.setBounds(Number.NaN, 0, 100, 100);
      expect(bounds).toEqual([]);
    });

    it('previewVisible esconde e mostra a janela do host (airspace, SPEC-0206)', () => {
      const visibility: boolean[] = [];
      g.__cortexSetWindowVisible = (v) => visibility.push(v);
      const channel = new HostChannel();
      channel.listen();

      bridge.push(JSON.stringify({ type: 'previewVisible', visible: false }));
      bridge.push(JSON.stringify({ type: 'previewVisible', visible: true }));

      expect(visibility).toEqual([false, true]);
    });

    it('previewVisible sem o campo assume visível (nunca deixa o preview sumido)', () => {
      const visibility: boolean[] = [];
      g.__cortexSetWindowVisible = (v) => visibility.push(v);
      const channel = new HostChannel();
      channel.listen();

      bridge.push(JSON.stringify({ type: 'previewVisible' }));

      expect(visibility).toEqual([true]);
    });

    it('o ack informa que está embutido', () => {
      const channel = new HostChannel();
      channel.listen();
      bridge.push(JSON.stringify({ type: 'hello' }));
      expect(JSON.parse(bridge.sent[0]!).embedded).toBe(true);
    });
  });

  it('fora do embed, esconder a janela é no-op (jogo standalone não some)', () => {
    const channel = new HostChannel();
    channel.listen();
    expect(() => channel.setVisible(false)).not.toThrow();
  });

  it('fora do embed, bounds é no-op (jogo standalone não se move)', () => {
    const channel = new HostChannel();
    channel.listen();
    expect(() => bridge.push(JSON.stringify({ type: 'bounds', x: 0, y: 0, width: 800, height: 600 }))).not.toThrow();
    expect(channel.embedded).toBe(false);
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
