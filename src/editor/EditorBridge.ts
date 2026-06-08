import type { Object3D } from 'three';
import type { EditorSelection } from './EditorSelection.js';
import type { EditorState } from './EditorState.js';
import {
  describeInspector,
  describeOutliner,
  type HandlerMap,
  type InspectorContext,
  type ObjectRegistry,
} from './EditorModel.js';

/**
 * **Ponte editor↔IDE** (ADR-0056). Quando o jogo roda dentro do iframe do Preview
 * da IDE, publica o {@link describeOutliner | modelo} da hierarquia e do inspector
 * via `postMessage` e recebe comandos de volta — assim os painéis viram **chrome
 * da IDE** (estilo Blender), fora da tela do jogo. Fora da IDE (jogo standalone no
 * browser, ou `?play`) a ponte fica **inerte** e os painéis in-canvas seguem
 * valendo.
 *
 * Handshake: o engine emite `hello` ao parent e só entra em **modo bridged** ao
 * receber `ack` — evita ativar a ponte num iframe qualquer.
 */
export interface EditorBridge {
  /** `true` depois do handshake (rodando dentro da IDE). */
  readonly bridged: boolean;
  /** Publica o estado atual (chamado por frame; faz diff e só posta se mudou). */
  publish(): void;
  /** Encerra listeners/timers. */
  dispose(): void;
}

const ENGINE = 'cortex-editor';
const IDE = 'cortex-ide';

export interface EditorBridgeOptions {
  /** Raízes cujos filhos viram itens da hierarquia. */
  editRoots: Object3D[];
  /** Seleção compartilhada (mesma instância do ObjectEditSystem/painéis). */
  selection: EditorSelection;
  /** Apis de autoria usadas pra descrever o inspector. */
  ctx: InspectorContext;
  /** Registro de ids compartilhado (mesma instância dos painéis in-canvas). */
  registry: ObjectRegistry;
  /** Estado do editor (a ponte alterna `active` ao receber `editor`). */
  editorState: EditorState;
  /** Enquadra um objeto (ligado ao `EditorCameraSystem.focusOn`). */
  focusOn: (obj: Object3D) => void;
  /** Chamado quando o handshake conclui — o attachEditor esconde os painéis in-canvas. */
  onBridged: () => void;
}

/** Cria a ponte. Inerte (no-op) fora de um iframe. */
export function createEditorBridge(options: EditorBridgeOptions): EditorBridge {
  const { editRoots, selection, ctx, registry, editorState, focusOn, onBridged } = options;

  const inIframe = typeof window !== 'undefined' && window.parent && window.parent !== window;
  if (!inIframe) {
    return { bridged: false, publish: () => {}, dispose: () => {} };
  }

  let bridged = false;
  let lastJson = '';
  let lastSentAt = 0;
  let lastHandlers: HandlerMap = new Map();
  let helloTimer: ReturnType<typeof setInterval> | null = null;

  // Em play o transform muda todo frame — limita a ~12 posts/s pra não inundar a
  // borda do iframe. `force` ignora o throttle (handshake/edições do usuário).
  const MIN_INTERVAL_MS = 80;

  const post = (msg: unknown): void => window.parent.postMessage(msg, '*');

  const doPublish = (force: boolean): void => {
    if (!bridged) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now - lastSentAt < MIN_INTERVAL_MS) return;
    const outliner = describeOutliner(editRoots, registry, selection.current);
    const described = describeInspector(selection.current, ctx, registry);
    lastHandlers = described.handlers;
    const msg = {
      source: ENGINE,
      type: 'state',
      editorActive: editorState.active,
      outliner,
      inspector: described.model,
    };
    const json = JSON.stringify(msg);
    if (json === lastJson) return; // diff: nada mudou, não posta
    lastJson = json;
    lastSentAt = now;
    post(msg);
  };

  const publish = (): void => doPublish(false);

  const apply = (id: string, value: unknown): void => {
    const res = lastHandlers.get(id)?.(value as never);
    // Reflete a mudança (handlers estruturais re-descrevem na próxima publish).
    if (res?.rebuild) lastJson = ''; // força repost mesmo se o JSON parecer igual
    doPublish(true);
  };

  const onMessage = (ev: MessageEvent): void => {
    const data = ev.data as { source?: string; type?: string; id?: string; value?: unknown; active?: boolean } | null;
    if (!data || data.source !== IDE) return;
    switch (data.type) {
      case 'ack':
        if (!bridged) {
          bridged = true;
          if (helloTimer) {
            clearInterval(helloTimer);
            helloTimer = null;
          }
          onBridged();
          lastJson = '';
          doPublish(true);
        }
        break;
      case 'select': {
        const obj = data.id ? registry.get(data.id) : null;
        selection.requestSelect(obj ?? null);
        break;
      }
      case 'focus': {
        const obj = data.id ? registry.get(data.id) : undefined;
        if (obj) focusOn(obj);
        break;
      }
      case 'field':
        if (data.id) apply(data.id, data.value);
        break;
      case 'button':
        if (data.id) apply(data.id, 0);
        break;
      case 'editor':
        if (typeof data.active === 'boolean') editorState.active = data.active;
        break;
    }
  };

  window.addEventListener('message', onMessage);

  // Emite hello até receber ack (a IDE pode anexar o listener depois do load).
  post({ source: ENGINE, type: 'hello' });
  let tries = 0;
  helloTimer = setInterval(() => {
    if (bridged || tries++ > 20) {
      if (helloTimer) clearInterval(helloTimer);
      helloTimer = null;
      return;
    }
    post({ source: ENGINE, type: 'hello' });
  }, 300);

  return {
    get bridged() {
      return bridged;
    },
    publish,
    dispose() {
      window.removeEventListener('message', onMessage);
      if (helloTimer) clearInterval(helloTimer);
    },
  };
}
