/**
 * Pointer Lock no host nativo (SPEC-0285): API fiel ao browser sobre o modo
 * relativo do SDL3 (__cortexInput.setPointerLock), mais os eventos de mouse de
 * compatibilidade (mousemove/mousedown/mouseup/click) que o InputManager escuta.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installEventClasses } from '../../native/js/src/shims/event-target.js';
import { installDomLite } from '../../native/js/src/shims/dom-lite.js';
import { createCanvas } from '../../native/js/src/shims/webgpu-extras.js';
import { installInputBridge } from '../../native/js/src/shims/input-bridge.js';
import { installPointerLock } from '../../native/js/src/shims/pointer-lock.js';

const MUTATED_GLOBALS = [
  'document', 'window', 'close', 'addEventListener', 'removeEventListener',
  'dispatchEvent', 'innerWidth', 'innerHeight', 'devicePixelRatio',
  '__cortexResize', '__cortexCanvas', '__cortexInput', '__cortexDispatchInput',
  'Event', 'CustomEvent', 'EventTarget', '__listeners',
];

type Listener = (event: Record<string, unknown>) => void;
interface Target { addEventListener(type: string, cb: Listener): void }
interface HostCanvas extends Target { requestPointerLock(): Promise<void> }
interface HostDocument extends Target {
  pointerLockElement: unknown;
  exitPointerLock(): void;
  body: Target;
}

const g = globalThis as Record<string, unknown>;
const original = new Map(MUTATED_GLOBALS.map((n) => [n, g[n]]));
let lockCalls: boolean[];
let canvas: HostCanvas;
let doc: HostDocument;
let dispatchInput: (raw: Record<string, unknown>) => void;

beforeEach(() => {
  lockCalls = [];
  installEventClasses();
  installDomLite();
  canvas = createCanvas(1280, 720) as HostCanvas;
  g['__cortexCanvas'] = canvas;
  installInputBridge();
  // Depois da bridge: sem host não há navigator.getGamepads a ligar (Node 20
  // nem tem navigator). O shim de lock lê __cortexInput na hora da chamada.
  g['__cortexInput'] = { setPointerLock: (on: boolean) => lockCalls.push(on) };
  installPointerLock(canvas);
  doc = g['document'] as HostDocument;
  dispatchInput = g['__cortexDispatchInput'] as typeof dispatchInput;
});

afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete g[name];
    else g[name] = value;
  }
});

function countChanges(): () => number {
  let changes = 0;
  doc.addEventListener('pointerlockchange', () => changes++);
  return () => changes;
}

describe('pointer lock no host nativo', () => {
  it('começa sem lock', () => {
    expect(doc.pointerLockElement).toBeNull();
  });

  it('requestPointerLock trava o canvas, liga o modo relativo, avisa e resolve', async () => {
    const changes = countChanges();
    await expect(canvas.requestPointerLock()).resolves.toBeUndefined();
    expect(doc.pointerLockElement).toBe(canvas);
    expect(lockCalls).toEqual([true]);
    expect(changes()).toBe(1);
  });

  it('pedir de novo com o lock ativo não repete o evento', async () => {
    const changes = countChanges();
    await canvas.requestPointerLock();
    await canvas.requestPointerLock();
    expect(changes()).toBe(1);
    expect(lockCalls).toEqual([true]);
  });

  it('exitPointerLock solta, desliga o modo relativo e avisa', async () => {
    await canvas.requestPointerLock();
    const changes = countChanges();
    expect(doc.exitPointerLock()).toBeUndefined();
    expect(doc.pointerLockElement).toBeNull();
    expect(lockCalls).toEqual([true, false]);
    expect(changes()).toBe(1);
  });

  it('blur da janela (foco perdido no SDL) solta o lock', async () => {
    await canvas.requestPointerLock();
    dispatchInput({ type: 'blur' });
    expect(doc.pointerLockElement).toBeNull();
  });

  it('ESC solta o lock e o keydown ainda chega ao jogo', async () => {
    await canvas.requestPointerLock();
    const keys: unknown[] = [];
    doc.body.addEventListener('keydown', (e) => keys.push(e['key']));
    dispatchInput({ type: 'keydown', key: 'Escape', code: 'Escape' });
    expect(doc.pointerLockElement).toBeNull();
    expect(keys).toEqual(['Escape']);
  });

  it('outra tecla não solta o lock', async () => {
    await canvas.requestPointerLock();
    dispatchInput({ type: 'keydown', key: 'w', code: 'KeyW' });
    expect(doc.pointerLockElement).toBe(canvas);
  });
});

describe('eventos de mouse de compatibilidade', () => {
  it('pointermove também entrega mousemove com movementX/Y', () => {
    const moves: Array<[unknown, unknown]> = [];
    doc.body.addEventListener('mousemove', (e) => moves.push([e['movementX'], e['movementY']]));
    dispatchInput({ type: 'pointermove', clientX: 5, clientY: 6, movementX: 3, movementY: -2, buttons: 0 });
    expect(moves).toEqual([[3, -2]]);
  });

  it('clique primário vira mousedown → mouseup → click no canvas', () => {
    const order: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      canvas.addEventListener(type, () => order.push(type));
    }
    dispatchInput({ type: 'pointerdown', clientX: 0, clientY: 0, button: 0 });
    dispatchInput({ type: 'pointerup', clientX: 0, clientY: 0, button: 0 });
    expect(order).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  });

  it('botão direito não gera click', () => {
    let clicks = 0;
    canvas.addEventListener('click', () => clicks++);
    dispatchInput({ type: 'pointerup', clientX: 0, clientY: 0, button: 2 });
    expect(clicks).toBe(0);
  });
});
