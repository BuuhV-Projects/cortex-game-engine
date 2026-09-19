/**
 * **Canal com a IDE no host nativo** (SPEC-0200 / M1 do PRD-0007) — o
 * transporte que substitui o `postMessage` quando o jogo roda no host em vez de
 * num iframe.
 *
 * O contrato das mensagens é o MESMO da ponte do editor no browser
 * (`hello`/`ack`/`state`/`select`/…), que sempre foi JSON serializável; o que
 * muda aqui é só o meio: linhas de texto por stdin/stdout em vez de eventos de
 * janela.
 *
 * Existe apenas quando o host registrou o canal (`CORTEX_IDE_CHANNEL=1`). Sem
 * ele, {@link HostChannel.available} é `false` e nada é enviado nem escutado —
 * o mesmo binário roda como jogo standalone sem pagar nada.
 */

/** Mensagem trafegada no canal. `type` é o discriminador, como na ponte DOM. */
export interface HostMessage {
  type: string;
  [key: string]: unknown;
}

/** Funções que o host injeta no global quando o canal está ligado. */
interface HostBridge {
  __cortexIdeChannel?: boolean;
  __cortexIdeSend?: (line: string) => void;
  __cortexIdeOnMessage?: (cb: (line: string) => void) => void;
}

/** Versão do protocolo — sobe quando o formato das mensagens mudar. */
export const HOST_CHANNEL_PROTOCOL = 1;

function bridge(): HostBridge {
  return globalThis as HostBridge;
}

/**
 * Canal de mensagens com a IDE. Uso típico:
 *
 * @example
 * const channel = new HostChannel()
 * if (channel.available) {
 *   channel.on('select', (msg) => selectById(msg['id'] as string))
 *   channel.send({ type: 'state', outliner })
 * }
 */
export class HostChannel {
  private readonly _handlers = new Map<string, (msg: HostMessage) => void>();
  private _listening = false;

  /** O host expôs o canal? (`CORTEX_IDE_CHANNEL=1` no export nativo). */
  get available(): boolean {
    return bridge().__cortexIdeChannel === true && typeof bridge().__cortexIdeSend === 'function';
  }

  /**
   * Registra o handler de um tipo de mensagem. O primeiro `on` liga a escuta
   * no host (uma vez só) e já responde ao handshake: um `hello` da IDE recebe
   * `ack` automático, com a versão do protocolo.
   */
  on(type: string, handler: (msg: HostMessage) => void): void {
    this._handlers.set(type, handler);
    this._listen();
  }

  /** Envia uma mensagem. No-op sem canal. */
  send(message: HostMessage): void {
    const send = bridge().__cortexIdeSend;
    if (typeof send !== 'function') return;
    send(JSON.stringify(message));
  }

  /** Começa a escutar (idempotente). Também chamado pelo primeiro `on`. */
  private _listen(): void {
    if (this._listening) return;
    const onMessage = bridge().__cortexIdeOnMessage;
    if (typeof onMessage !== 'function') return;
    this._listening = true;
    onMessage((line) => this._receive(line));
  }

  /** Trata uma linha crua do host. Linha inválida é ignorada, nunca derruba. */
  private _receive(line: string): void {
    let message: HostMessage;
    try {
      message = JSON.parse(line) as HostMessage;
    } catch {
      return; // ruído no stdin não pode quebrar o jogo
    }
    if (!message || typeof message.type !== 'string') return;
    // Handshake: a IDE diz `hello`, o host responde `ack`. É o que prova que o
    // canal está vivo nos dois sentidos antes de qualquer outra mensagem.
    if (message.type === 'hello') {
      this.send({ type: 'ack', protocol: HOST_CHANNEL_PROTOCOL });
      return;
    }
    this._handlers.get(message.type)?.(message);
  }

  /** Só pros testes: deixa o canal escutar sem nenhum handler registrado. */
  listen(): void {
    this._listen();
  }
}
