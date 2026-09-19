import { getHostChannel, type HostChannel } from '../core/HostChannel.js';

/**
 * **Transporte da ponte do editor** (SPEC-0203 / M3b do PRD-0007) — separa
 * *como* as mensagens viajam de *o que* elas dizem.
 *
 * O conteúdo da ponte (`hello`/`ack`/`state`/`select`/`field`/…) sempre foi JSON
 * serializável; só o meio dependia do browser. Com o preview nativo
 * (PRD-0007) existem dois meios:
 *
 * - **iframe** — `window.parent.postMessage`, o caminho histórico (ADR-0056);
 * - **host** — linhas JSON por stdin/stdout ({@link HostChannel}, SPEC-0200),
 *   quando o jogo roda no host nativo embutido no Studio.
 *
 * Fora dos dois (jogo standalone, teste), não há transporte e a ponte fica
 * inerte — o mesmo comportamento de sempre.
 */

/** Uma mensagem da ponte. `type` discrimina; o resto é carga. */
export interface BridgeMessage {
  type: string;
  [key: string]: unknown;
}

/** Como as mensagens da ponte vão e voltam. */
export interface BridgeTransport {
  /** Nome do meio — aparece em log/diagnóstico. */
  readonly kind: 'iframe' | 'host';
  /** Envia uma mensagem para a IDE. */
  send(message: BridgeMessage): void;
  /** Registra o recebimento. Chamado uma vez pela ponte. */
  onMessage(handler: (message: BridgeMessage) => void): void;
  /** Solta listeners. */
  dispose(): void;
}

/** Marca de origem das mensagens do engine (mantida nos dois transportes). */
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

/** Transporte pelo canal do host nativo (preview embutido). */
function hostTransport(channel: HostChannel): BridgeTransport {
  return {
    kind: 'host',
    send(message) {
      channel.send({ source: ENGINE_SOURCE, ...message });
    },
    onMessage(handler) {
      // O canal roteia por tipo; a ponte quer TODOS os tipos que a IDE manda.
      for (const type of IDE_MESSAGE_TYPES) {
        channel.on(type, (msg) => handler(msg as BridgeMessage));
      }
    },
    dispose() {
      // O canal vive com o Game (não é da ponte destruí-lo).
    },
  };
}

/**
 * Tipos que a IDE envia para o editor. Precisa ser explícito porque o canal do
 * host roteia POR TIPO (diferente do `message` do browser, que é um fluxo só).
 * Mantenha em sincronia com os `case` do `onMessage` da ponte.
 */
export const IDE_MESSAGE_TYPES = [
  'ack', 'select', 'focus', 'field', 'button', 'editor', 'pause', 'tool',
  'gizmoSpace', 'debugHud', 'addTerrain', 'addShape', 'drawShape',
  'addVegetation', 'openModelPicker', 'dropAsset', 'level',
] as const;

/**
 * Escolhe o transporte disponível: host nativo primeiro (quando o jogo roda
 * embutido), depois iframe. `null` quando não há IDE do outro lado.
 */
export function detectBridgeTransport(channel?: HostChannel): BridgeTransport | null {
  const host = channel ?? getHostChannel();
  if (host.available) return hostTransport(host);
  const inIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;
  return inIframe ? iframeTransport() : null;
}
