/**
 * **Captura de binding** (SPEC-0165) — o "Pressione uma tecla..." da tela de
 * Controles. Escuta o PRÓXIMO input do jogador e devolve o
 * {@link InputBinding} correspondente.
 *
 * Duas famílias, uma por coluna da tela:
 * - `keyboard` — teclado e botões do mouse (event-driven).
 * - `gamepad` — botões e **deflexão de eixo** do controle; é assim que o
 *   jogador conserta um stick que caiu nos eixos errados. Polado por
 *   {@link BindingCapture.tick} (a tela chama 1×/frame no loop dela) em vez de
 *   `requestAnimationFrame` interno — testável e sem loop escondido.
 *
 * Nada é capturado a partir do estado INICIAL: o botão que abriu a captura
 * (tipicamente o A) continua pressionado no primeiro tick e viraria o binding.
 * Só transições solto→pressionado depois do início contam.
 *
 * @example
 * const capture = createBindingCapture({ family: 'gamepad', gamepad: game.gamepad });
 * // no loop da tela: capture.tick();
 * const binding = await capture.promise; // null se cancelado
 */
import type { GamepadManager } from '../core/GamepadManager.js';
import { normalizeKey, type InputBinding } from './bindings.js';

/** Coluna da tela de Controles que está capturando. */
export type CaptureFamily = 'keyboard' | 'gamepad';

/**
 * Deflexão mínima pra um eixo ser CAPTURADO como binding. Alta de propósito:
 * stick em repouso costuma oscilar, e um limiar baixo gravaria o eixo errado.
 */
export const AXIS_CAPTURE_THRESHOLD = 0.6;

/** Botões varridos na captura de gamepad (cobre o layout standard inteiro). */
const MAX_PAD_BUTTONS = 20;
/** Eixos varridos na captura de gamepad. */
const MAX_PAD_AXES = 8;

export interface BindingCaptureOptions {
  /** Que tipo de origem capturar. */
  family: CaptureFamily;
  /** Necessário pra `family: 'gamepad'`. */
  gamepad?: GamepadManager;
  /** Slot do gamepad. Default: o primeiro conectado. */
  padIndex?: number;
  /**
   * Teclas que CANCELAM em vez de virar binding. Default `['Escape']`.
   * Só vale pra família `keyboard` — no controle, cancelar por B impediria
   * mapear o próprio B, então o cancelamento de lá é pelo botão da tela.
   */
  cancelKeys?: readonly string[];
}

export interface BindingCapture {
  /** Resolve com o binding capturado, ou `null` se cancelado. */
  readonly promise: Promise<InputBinding | null>;
  /** Chame 1×/frame enquanto a captura estiver aberta (só afeta gamepad). */
  tick(): void;
  /** Cancela (resolve `null`) e remove os listeners. */
  cancel(): void;
}

/** Estado inicial do pad — o que já estava pressionado não conta como captura. */
interface PadBaseline {
  buttons: boolean[];
  axes: boolean[];
}

export function createBindingCapture(options: BindingCaptureOptions): BindingCapture {
  const cancelKeys = options.cancelKeys ?? ['Escape'];
  let settle: ((binding: InputBinding | null) => void) | null = null;
  let baseline: PadBaseline | null = null;

  const promise = new Promise<InputBinding | null>((resolve) => {
    settle = resolve;
  });

  const finish = (binding: InputBinding | null): void => {
    if (!settle) return;
    detach();
    const resolve = settle;
    settle = null;
    resolve(binding);
  };

  // ── Família teclado/mouse: event-driven ────────────────────────────────────
  const onKeyDown = (e: Event): void => {
    const key = (e as KeyboardEvent).key;
    if (!key) return;
    // Auto-repeat não conta: quem confirmou a célula com Enter segurado
    // capturaria o próprio Enter no repeat seguinte.
    if ((e as KeyboardEvent).repeat) return;
    e.preventDefault?.();
    if (cancelKeys.includes(key)) finish(null);
    else finish({ source: 'key', key: normalizeKey(key) });
  };
  const onPointerDown = (e: Event): void => {
    const button = (e as MouseEvent).button ?? 0;
    finish({ source: 'mouse', index: button });
  };

  function attach(): void {
    if (options.family !== 'keyboard') return;
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
  }

  function detach(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointerdown', onPointerDown);
  }

  // ── Família gamepad: polling por tick ──────────────────────────────────────
  const padSlot = (): number => {
    const gp = options.gamepad;
    if (!gp) return options.padIndex ?? 0;
    if (options.padIndex !== undefined && gp.isConnected(options.padIndex)) return options.padIndex;
    const first = gp.firstConnectedIndex();
    return first >= 0 ? first : (options.padIndex ?? 0);
  };

  const readPad = (): PadBaseline | null => {
    const gp = options.gamepad;
    if (!gp) return null;
    const slot = padSlot();
    if (!gp.isConnected(slot)) return null;
    const buttons: boolean[] = [];
    for (let i = 0; i < MAX_PAD_BUTTONS; i++) buttons.push(gp.isButtonDown(slot, i));
    const axes: boolean[] = [];
    for (let i = 0; i < MAX_PAD_AXES; i++) {
      axes.push(Math.abs(gp.getAxis(slot, i)) >= AXIS_CAPTURE_THRESHOLD);
    }
    return { buttons, axes };
  };

  const tick = (): void => {
    if (!settle || options.family !== 'gamepad') return;
    const gp = options.gamepad;
    if (!gp) return;
    const now = readPad();
    if (!now) return;
    // 1º tick com o pad presente vira o baseline (não captura o que já estava
    // apertado — tipicamente o A que abriu esta captura).
    if (!baseline) {
      baseline = now;
      return;
    }
    const slot = padSlot();
    for (let i = 0; i < now.buttons.length; i++) {
      if (now.buttons[i] && !baseline.buttons[i]) {
        finish({ source: 'pad', index: i });
        return;
      }
      if (!now.buttons[i]) baseline.buttons[i] = false; // soltou: libera pra próxima
    }
    for (let i = 0; i < now.axes.length; i++) {
      if (now.axes[i] && !baseline.axes[i]) {
        const value = gp.getAxis(slot, i);
        finish({ source: 'axis', index: i, sign: value >= 0 ? 1 : -1 });
        return;
      }
      if (!now.axes[i]) baseline.axes[i] = false;
    }
  };

  attach();

  return { promise, tick, cancel: () => finish(null) };
}
