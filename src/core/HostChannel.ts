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
  /** Só no modo embutido (`CORTEX_PARENT_HWND`) — ver SPEC-0201. */
  __cortexSetWindowBounds?: (x: number, y: number, w: number, h: number) => void;
  /** Idem — esconde a janela durante o drag de asset (SPEC-0206). */
  __cortexSetWindowVisible?: (visible: boolean) => void;
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
      this.send({ type: 'ack', protocol: HOST_CHANNEL_PROTOCOL, embedded: this.embedded });
      return;
    }
    // `bounds` é geometria da JANELA, não do jogo: o host se posiciona sozinho
    // (SPEC-0201) e a IDE não precisa de FFI pra chamar SetWindowPos.
    // `previewVisible` tambem e geometria de JANELA: a IDE esconde o preview
    // durante o arraste de asset pra o overlay de drop receber o evento
    // (airspace, SPEC-0206).
    if (message.type === 'previewVisible') {
      this.setVisible(message['visible'] !== false);
      return;
    }
    if (message.type === 'bounds') {
      this.setBounds(
        Number(message['x'] ?? 0), Number(message['y'] ?? 0),
        Number(message['width'] ?? 0), Number(message['height'] ?? 0),
      );
      return;
    }
    this._handlers.get(message.type)?.(message);
  }

  /** O host está EMBUTIDO numa janela da IDE? (`CORTEX_PARENT_HWND`). */
  get embedded(): boolean {
    return typeof bridge().__cortexSetWindowBounds === 'function';
  }

  /**
   * Move/redimensiona a janela do host — coordenadas relativas à janela PAI.
   * No-op fora do modo embutido.
   */
  setBounds(x: number, y: number, width: number, height: number): void {
    const apply = bridge().__cortexSetWindowBounds;
    if (typeof apply !== 'function') return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!(width > 0) || !(height > 0)) return; // painel colapsado: ignora
    apply(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  /**
   * Esconde/mostra a janela do host. No-op fora do modo embutido.
   *
   * Usado durante o drag-and-drop de asset: a janela nativa fica por cima de
   * todo DOM, então o overlay que captura o drop só funciona com ela escondida.
   */
  setVisible(visible: boolean): void {
    bridge().__cortexSetWindowVisible?.(visible);
  }

  /** Só pros testes: deixa o canal escutar sem nenhum handler registrado. */
  listen(): void {
    this._listen();
  }
}

/**
 * Instância COMPARTILHADA do canal (SPEC-0203).
 *
 * O shim do host guarda **um único** callback de recebimento
 * (`__cortexIdeOnMessage`), então duas instâncias de `HostChannel` significam
 * que a segunda a registrar rouba as mensagens da primeira — foi exatamente o
 * que aconteceu quando o `Game` e a ponte do editor criaram cada um a sua: o
 * `hello` do editor saía, o `ack` chegava no canal errado e o estado nunca era
 * publicado. Quem precisa do canal usa esta instância.
 */
let _shared: HostChannel | null = null;

/** O canal compartilhado do processo (criado na primeira chamada). */
export function getHostChannel(): HostChannel {
  if (!_shared) _shared = new HostChannel();
  return _shared;
}

/** Só pros testes: esquece a instância compartilhada. */
export function resetHostChannel(): void {
  _shared = null;
}
