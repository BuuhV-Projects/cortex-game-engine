/**
 * Mouse/toque no UiLayer (SPEC-0133) — hit-test único que vale pros DOIS
 * backends (DOM no browser, RendererUiBackend no host nativo). Os testes rodam
 * em Node sem jsdom: instalamos um `window` fake (EventTarget) e disparamos
 * eventos de ponteiro com `clientX/clientY` — exatamente o formato que o host
 * nativo redistribui (`__cortexDispatchInput`) e que o browser também entrega.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UiButton } from '../../src/ui/runtime/widgets.js';
import { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import type { UiBackend } from '../../src/ui/runtime/UiBackend.js';

// 1080p → escala 1 → espaço de design == coordenadas de tela (matemática limpa).
const VIEWPORT = { width: 1920, height: 1080 };

function stubBackend(): UiBackend {
  return { sync: () => {}, render: () => {}, dispose: () => {} };
}

/** Dispara um evento de ponteiro no `window` fake (formato do host nativo). */
function firePointer(type: 'pointerdown' | 'pointerup' | 'pointermove', x: number, y: number): void {
  const ev = new Event(type);
  (ev as unknown as { clientX: number; clientY: number }).clientX = x;
  (ev as unknown as { clientX: number; clientY: number }).clientY = y;
  (globalThis as unknown as { window: EventTarget }).window.dispatchEvent(ev);
}

/** Clique completo (down + up) sobre o mesmo ponto. */
function click(x: number, y: number): void {
  firePointer('pointerdown', x, y);
  firePointer('pointerup', x, y);
}

describe('UiLayer — mouse/toque (SPEC-0133)', () => {
  beforeEach(() => {
    // `window` fake: o UiLayer anexa os listeners de ponteiro nele.
    (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: EventTarget }).window;
  });

  /** Botão centralizado 200×40 → rect [860..1060] × [520..560]; centro (960,540). */
  function menu() {
    const layer = new UiLayer(stubBackend(), () => VIEWPORT);
    const a = layer.add(new UiButton({ anchor: 'center', y: -60, width: 200, height: 40, text: 'A' }));
    const b = layer.add(new UiButton({ anchor: 'center', y: 0, width: 200, height: 40, text: 'B' }));
    const c = layer.add(new UiButton({ anchor: 'center', y: 60, width: 200, height: 40, text: 'C' }));
    return { layer, a, b, c };
  }

  it('clicar dentro do botão dispara o onPress', () => {
    const { b } = menu();
    let pressed = 0;
    b.onPress = () => { pressed++; };
    click(960, 540); // centro do B
    expect(pressed).toBe(1);
  });

  it('não dispara em dobro (o backend DOM não liga mais onclick)', () => {
    const { b } = menu();
    let pressed = 0;
    b.onPress = () => { pressed++; };
    click(960, 540);
    expect(pressed).toBe(1); // um único caminho de clique (UiLayer)
  });

  it('clique em área vazia não dispara nada', () => {
    const { b } = menu();
    let pressed = 0;
    b.onPress = () => { pressed++; };
    click(10, 10); // canto, longe dos botões
    expect(pressed).toBe(0);
  });

  it('soltar sobre outro botão não conta como clique (press+release no mesmo)', () => {
    const { a, b } = menu();
    let pa = 0, pb = 0;
    a.onPress = () => { pa++; };
    b.onPress = () => { pb++; };
    firePointer('pointerdown', 960, 480); // desce no A (y=-60 → rect 460..500)
    firePointer('pointerup', 960, 540);   // sobe no B
    expect(pa).toBe(0);
    expect(pb).toBe(0);
  });

  it('hover (pointermove) move o foco pro botão sob o cursor', () => {
    const { layer, a, c } = menu();
    expect(layer.focused).toBe(a); // foco inicial no primeiro
    firePointer('pointermove', 960, 600); // sobre o C (y=60 → rect 580..620)
    expect(layer.focused).toBe(c);
  });

  it('clicar acompanha o foco (feedback) em botão navegável', () => {
    const { layer, c } = menu();
    firePointer('pointerdown', 960, 600); // C
    expect(layer.focused).toBe(c);
  });

  it('botão focusable:false continua clicável (padrão "só-clique")', () => {
    const layer = new UiLayer(stubBackend(), () => VIEWPORT);
    let pressed = 0;
    const btn = layer.add(new UiButton({
      anchor: 'center', width: 200, height: 40, text: 'Fases',
      focusable: false, onPress: () => { pressed++; },
    }));
    click(960, 540); // centro (0,0 → rect 520..560)
    expect(pressed).toBe(1);
    // ...mas o hover NÃO foca um botão não-navegável.
    firePointer('pointermove', 960, 540);
    expect(layer.focused).not.toBe(btn);
  });

  it('botão invisível não recebe clique', () => {
    const { b } = menu();
    let pressed = 0;
    b.onPress = () => { pressed++; };
    b.set({ visible: false });
    click(960, 540);
    expect(pressed).toBe(0);
  });

  it('remove os listeners no dispose (sem clique fantasma depois)', () => {
    const { layer, b } = menu();
    let pressed = 0;
    b.onPress = () => { pressed++; };
    layer.dispose();
    click(960, 540);
    expect(pressed).toBe(0);
  });

  it('converte coordenadas de tela → design pela escala (SPEC-0129)', () => {
    // 4K (escala 2): design = client ÷ 2. Botão central 200×40 no design 1920×1080
    // → rect [860..1060]×[520..560]; em coordenadas de TELA isso é ×2.
    const layer = new UiLayer(stubBackend(), () => ({ width: 3840, height: 2160 }));
    let pressed = 0;
    layer.add(new UiButton({ anchor: 'center', width: 200, height: 40, text: 'A', onPress: () => { pressed++; } }));
    click(1920, 1080); // centro da tela real → centro do botão no design
    expect(pressed).toBe(1);
  });
});
