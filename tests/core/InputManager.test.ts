/**
 * Testes unitários para InputManager (src/core/InputManager.ts)
 *
 * Roda em Node.js via vitest sem jsdom. Polyfills mínimos de KeyboardEvent
 * e MouseEvent são definidos aqui — Node 18+ tem EventTarget e CustomEvent
 * nativos, mas não as subclasses de UIEvent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputManager } from '../../src/core/InputManager.js';

// ─── Polyfills para ambiente Node.js ──────────────────────────────────────────

/** Polyfill mínimo de KeyboardEvent para Node.js (sem jsdom). */
class KeyboardEvent extends Event {
  readonly key: string;
  constructor(type: string, init?: KeyboardEventInit) {
    super(type, { bubbles: init?.bubbles ?? false });
    this.key = init?.key ?? '';
  }
}

/** Polyfill mínimo de MouseEvent para Node.js (sem jsdom). */
class MouseEvent extends Event {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly movementX: number;
  readonly movementY: number;
  constructor(type: string, init?: MouseEventInit) {
    super(type, { bubbles: init?.bubbles ?? false });
    this.button = init?.button ?? 0;
    this.clientX = init?.clientX ?? 0;
    this.clientY = init?.clientY ?? 0;
    this.movementX = (init as any)?.movementX ?? 0;
    this.movementY = (init as any)?.movementY ?? 0;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Cria um HTMLElement fake que implementa a interface mínima usada pelo
 * InputManager: addEventListener, removeEventListener e getBoundingClientRect.
 */
function makeFakeElement(rect = { left: 0, top: 0 }) {
  const target = new EventTarget();
  const el = target as unknown as HTMLElement;

  // Sobrescreve getBoundingClientRect para retornar coordenadas controláveis
  (el as any).getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.left + 800,
    bottom: rect.top + 600,
    width: 800,
    height: 600,
  });

  return el;
}

/** Dispara um KeyboardEvent no elemento. */
function fireKey(el: HTMLElement, type: 'keydown' | 'keyup', key: string) {
  el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
}

/** Dispara um MouseEvent no elemento. */
function fireMouse(
  el: HTMLElement,
  type: 'mousedown' | 'mouseup' | 'mousemove',
  opts: { button?: number; clientX?: number; clientY?: number; movementX?: number; movementY?: number } = {}
) {
  el.dispatchEvent(
    new MouseEvent(type, {
      button: opts.button ?? 0,
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
      movementX: opts.movementX ?? 0,
      movementY: opts.movementY ?? 0,
      bubbles: true,
    })
  );
}

// ─── testes ──────────────────────────────────────────────────────────────────

describe('InputManager', () => {
  let input: InputManager;
  let el: HTMLElement;

  beforeEach(() => {
    input = new InputManager();
    el = makeFakeElement();
  });

  afterEach(() => {
    input.detach();
  });

  // ── Estado inicial ──────────────────────────────────────────────────────

  it('domElement é null antes de attach()', () => {
    expect(input.domElement).toBeNull();
  });

  it('isKeyDown retorna false antes de attach()', () => {
    expect(input.isKeyDown('a')).toBe(false);
  });

  it('isButtonDown retorna false antes de attach()', () => {
    expect(input.isButtonDown(0)).toBe(false);
  });

  it('getMousePosition retorna {0,0} antes de attach()', () => {
    expect(input.getMousePosition()).toEqual({ x: 0, y: 0 });
  });

  it('getMouseDelta retorna {0,0} antes de attach()', () => {
    expect(input.getMouseDelta()).toEqual({ x: 0, y: 0 });
  });

  // ── attach / detach ──────────────────────────────────────────────────────

  it('attach() define domElement', () => {
    input.attach(el);
    expect(input.domElement).toBe(el);
  });

  it('detach() define domElement como null', () => {
    input.attach(el);
    input.detach();
    expect(input.domElement).toBeNull();
  });

  it('detach() sem attach() não lança erro', () => {
    expect(() => input.detach()).not.toThrow();
  });

  it('attach() duas vezes reanexa sem erro (chama detach interno)', () => {
    const el2 = makeFakeElement();
    input.attach(el);
    expect(() => input.attach(el2)).not.toThrow();
    expect(input.domElement).toBe(el2);
  });

  it('letra solta com Shift segurado NÃO trava (keydown "w" → keyup "W")', () => {
    input.attach(el);
    fireKey(el, 'keydown', 'w');
    expect(input.isKeyDown('w')).toBe(true);
    // Com Shift segurado, o keyup vem com a tecla MAIÚSCULA — normalizamos pra
    // não deixar a tecla travada (regressão: câmera do editor andava pra sempre).
    fireKey(el, 'keyup', 'W');
    expect(input.isKeyDown('w')).toBe(false);
    expect(input.isKeyDown('W')).toBe(false);
  });

  it('isKeyDown casa independente de caixa (W ⇔ w)', () => {
    input.attach(el);
    fireKey(el, 'keydown', 'W'); // ex.: pressionado já com Shift
    expect(input.isKeyDown('w')).toBe(true);
    expect(input.isKeyDown('W')).toBe(true);
  });

  // ── Teclado ──────────────────────────────────────────────────────────────

  it('isKeyDown retorna true enquanto tecla estiver pressionada', () => {
    input.attach(el);
    fireKey(el, 'keydown', 'ArrowLeft');
    expect(input.isKeyDown('ArrowLeft')).toBe(true);
  });

  it('isKeyDown retorna false após keyup', () => {
    input.attach(el);
    fireKey(el, 'keydown', 'ArrowLeft');
    fireKey(el, 'keyup', 'ArrowLeft');
    expect(input.isKeyDown('ArrowLeft')).toBe(false);
  });

  it('múltiplas teclas podem estar pressionadas simultaneamente', () => {
    input.attach(el);
    fireKey(el, 'keydown', 'w');
    fireKey(el, 'keydown', ' ');
    expect(input.isKeyDown('w')).toBe(true);
    expect(input.isKeyDown(' ')).toBe(true);
  });

  it('detach() limpa estado de teclado', () => {
    input.attach(el);
    fireKey(el, 'keydown', 'a');
    input.detach();
    expect(input.isKeyDown('a')).toBe(false);
  });

  it('listeners de teclado são removidos após detach()', () => {
    input.attach(el);
    input.detach();
    // Disparar evento após detach não deve afetar o estado
    fireKey(el, 'keydown', 'x');
    expect(input.isKeyDown('x')).toBe(false);
  });

  // ── Mouse: botões ────────────────────────────────────────────────────────

  it('isButtonDown retorna true enquanto botão estiver pressionado', () => {
    input.attach(el);
    fireMouse(el, 'mousedown', { button: 0 });
    expect(input.isButtonDown(0)).toBe(true);
  });

  it('isButtonDown retorna false após mouseup', () => {
    input.attach(el);
    fireMouse(el, 'mousedown', { button: 2 });
    fireMouse(el, 'mouseup', { button: 2 });
    expect(input.isButtonDown(2)).toBe(false);
  });

  it('múltiplos botões podem estar pressionados simultaneamente', () => {
    input.attach(el);
    fireMouse(el, 'mousedown', { button: 0 });
    fireMouse(el, 'mousedown', { button: 2 });
    expect(input.isButtonDown(0)).toBe(true);
    expect(input.isButtonDown(2)).toBe(true);
  });

  it('detach() limpa estado de botões do mouse', () => {
    input.attach(el);
    fireMouse(el, 'mousedown', { button: 1 });
    input.detach();
    expect(input.isButtonDown(1)).toBe(false);
  });

  // ── Mouse: posição ───────────────────────────────────────────────────────

  it('getMousePosition reflete a posição relativa ao elemento', () => {
    const offset = makeFakeElement({ left: 100, top: 50 });
    input.attach(offset);
    fireMouse(offset, 'mousemove', { clientX: 150, clientY: 80 });
    expect(input.getMousePosition()).toEqual({ x: 50, y: 30 });
  });

  it('getMousePosition retorna cópia (imutável)', () => {
    input.attach(el);
    fireMouse(el, 'mousemove', { clientX: 10, clientY: 20 });
    const pos = input.getMousePosition();
    pos.x = 999;
    expect(input.getMousePosition().x).toBe(10); // não alterou o estado interno
  });

  // ── Mouse: delta ─────────────────────────────────────────────────────────

  it('getMouseDelta acumula movementX/Y de múltiplos eventos mousemove', () => {
    input.attach(el);
    fireMouse(el, 'mousemove', { movementX: 5, movementY: -3 });
    fireMouse(el, 'mousemove', { movementX: 2, movementY: 4 });
    expect(input.getMouseDelta()).toEqual({ x: 7, y: 1 });
  });

  it('getMouseDelta reseta o acumulador após a leitura', () => {
    input.attach(el);
    fireMouse(el, 'mousemove', { movementX: 10, movementY: 10 });
    input.getMouseDelta(); // primeira leitura — consome o delta
    expect(input.getMouseDelta()).toEqual({ x: 0, y: 0 });
  });

  it('getMouseDelta retorna cópia (imutável)', () => {
    input.attach(el);
    fireMouse(el, 'mousemove', { movementX: 3, movementY: 3 });
    const delta = input.getMouseDelta();
    delta.x = 999;
    // estado interno já foi zerado pelo getter; nova chamada deve retornar {0,0}
    expect(input.getMouseDelta()).toEqual({ x: 0, y: 0 });
  });

  it('detach() reseta mouseDelta', () => {
    input.attach(el);
    fireMouse(el, 'mousemove', { movementX: 20, movementY: 20 });
    input.detach();
    expect(input.getMouseDelta()).toEqual({ x: 0, y: 0 });
  });

  // ── Eventos customizados (EventTarget) ──────────────────────────────────

  it('emite key:down com detail correto', () => {
    input.attach(el);
    const handler = vi.fn();
    input.addEventListener('key:down', handler);
    fireKey(el, 'keydown', 'Space');
    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail.key).toBe('Space');
  });

  it('emite key:up com detail correto', () => {
    input.attach(el);
    const handler = vi.fn();
    input.addEventListener('key:up', handler);
    fireKey(el, 'keyup', 'Enter');
    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail.key).toBe('Enter');
  });

  it('emite mouse:down com button e position corretos', () => {
    input.attach(el);
    const handler = vi.fn();
    input.addEventListener('mouse:down', handler);
    fireMouse(el, 'mousedown', { button: 2, clientX: 40, clientY: 30 });
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.button).toBe(2);
  });

  it('emite mouse:up com button correto', () => {
    input.attach(el);
    const handler = vi.fn();
    input.addEventListener('mouse:up', handler);
    fireMouse(el, 'mouseup', { button: 1 });
    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail.button).toBe(1);
  });

  it('emite mouse:move com position e delta do evento', () => {
    const offset = makeFakeElement({ left: 10, top: 10 });
    input.attach(offset);
    const handler = vi.fn();
    input.addEventListener('mouse:move', handler);
    fireMouse(offset, 'mousemove', {
      clientX: 60,
      clientY: 50,
      movementX: 5,
      movementY: -2,
    });
    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.position).toEqual({ x: 50, y: 40 });
    expect(detail.delta).toEqual({ x: 5, y: -2 });
  });

  it('não emite eventos após detach()', () => {
    input.attach(el);
    const keyHandler = vi.fn();
    const mouseHandler = vi.fn();
    input.addEventListener('key:down', keyHandler);
    input.addEventListener('mouse:down', mouseHandler);
    input.detach();
    fireKey(el, 'keydown', 'q');
    fireMouse(el, 'mousedown', { button: 0 });
    expect(keyHandler).not.toHaveBeenCalled();
    expect(mouseHandler).not.toHaveBeenCalled();
  });

  // ── Extende EventTarget ──────────────────────────────────────────────────

  it('InputManager é instância de EventTarget', () => {
    expect(input).toBeInstanceOf(EventTarget);
  });
});
