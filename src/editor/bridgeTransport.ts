/**
 * **Transporte da ponte do editor** (SPEC-0203) — separa *como* as mensagens
 * viajam de *o que* elas dizem.
 *
 * O conteúdo da ponte (`hello`/`ack`/`state`/`select`/`field`/…) sempre foi JSON
 * serializável; só o meio depende do ambiente. Hoje há um meio:
 *
 * - **iframe** — `window.parent.postMessage`, o caminho do Studio (ADR-0056).
 *
 * Fora dele (jogo standalone, teste), não há transporte e a ponte fica inerte —
 * o mesmo comportamento de sempre.
 *
 * A abstração fica porque já houve um segundo transporte (linhas JSON pelo canal
 * do host, com o jogo embutido no Studio) e pode haver de novo: esse caminho
 * vive na branch `feature/preview-nativo-no-studio` (ADR-0212).
 */

/** Uma mensagem da ponte. `type` discrimina; o resto é carga. */
export interface BridgeMessage {
  type: string;
  [key: string]: unknown;
}

/** Como as mensagens da ponte vão e voltam. */
export interface BridgeTransport {
  /** Nome do meio — aparece em log/diagnóstico. */
  readonly kind: 'iframe';
  /** Envia uma mensagem para a IDE. */
  send(message: BridgeMessage): void;
  /** Registra o recebimento. Chamado uma vez pela ponte. */
  onMessage(handler: (message: BridgeMessage) => void): void;
  /** Solta listeners. */
  dispose(): void;
}

/** Marca de origem das mensagens do engine. */
const ENGINE_SOURCE = 'cortex-editor';

/** Transporte por `postMessage` — o jogo num iframe do Studio. */
function iframeTransport(): BridgeTransport {
  let listener: ((event: MessageEvent) => void) | null = null;
  return {
    kind: 'iframe',
    send(message) {
      window.parent.postMessage({ source: ENGINE_SOURCE, ...message }, '*');
    },
    onMessage(handler) {
      listener = (event: MessageEvent) => {
        const data = event.data as BridgeMessage | null;
        if (!data || typeof data.type !== 'string') return;
        handler(data);
      };
      window.addEventListener('message', listener);
    },
    dispose() {
      if (listener) window.removeEventListener('message', listener);
      listener = null;
    },
  };
}

/**
 * Escolhe o transporte disponível. `null` quando não há IDE do outro lado —
 * jogo aberto direto no browser ou rodando em teste.
 */
export function detectBridgeTransport(): BridgeTransport | null {
  const inIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;
  return inIframe ? iframeTransport() : null;
}
