import { describe, expect, it } from 'vitest';
import { anchorFraction, resolveRect } from '../../src/ui/runtime/layout.js';
import { UiButton, UiLabel } from '../../src/ui/runtime/widgets.js';
import { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import type { UiBackend } from '../../src/ui/runtime/UiBackend.js';

const VIEWPORT = { width: 1280, height: 720 };

/** Backend nulo: os testes cobrem layout/navegação, não desenho. */
function stubBackend(): UiBackend {
  return { sync: () => {}, render: () => {}, dispose: () => {} };
}

describe('layout — âncoras (mesma matemática nos 2 backends, ADR-0102)', () => {
  it('frações por âncora', () => {
    expect(anchorFraction('top-left')).toEqual({ fx: 0, fy: 0 });
    expect(anchorFraction('center')).toEqual({ fx: 0.5, fy: 0.5 });
    expect(anchorFraction('bottom-right')).toEqual({ fx: 1, fy: 1 });
    expect(anchorFraction('top-center')).toEqual({ fx: 0.5, fy: 0 });
    expect(anchorFraction('center-left')).toEqual({ fx: 0, fy: 0.5 });
  });

  it('top-left: offset direto', () => {
    expect(resolveRect('top-left', 16, 12, 100, 20, VIEWPORT)).toEqual({
      x: 16, y: 12, width: 100, height: 20,
    });
  });

  it('bottom-right: pivô acompanha a âncora (offset negativo aproxima da borda)', () => {
    const r = resolveRect('bottom-right', -10, -10, 100, 20, VIEWPORT);
    expect(r.x).toBe(1280 - 100 - 10);
    expect(r.y).toBe(720 - 20 - 10);
  });

  it('center: widget centralizado', () => {
    const r = resolveRect('center', 0, 0, 200, 50, VIEWPORT);
    expect(r.x).toBe((1280 - 200) / 2);
    expect(r.y).toBe((720 - 50) / 2);
  });
});

describe('UiLayer — foco e navegação (100% controle)', () => {
  function menuWith3Buttons() {
    const layer = new UiLayer(stubBackend(), () => VIEWPORT);
    const a = layer.add(new UiButton({ anchor: 'center', y: -60, width: 200, height: 40, text: 'A' }));
    const b = layer.add(new UiButton({ anchor: 'center', y: 0, width: 200, height: 40, text: 'B' }));
    const c = layer.add(new UiButton({ anchor: 'center', y: 60, width: 200, height: 40, text: 'C' }));
    return { layer, a, b, c };
  }

  it('primeiro botão adicionado recebe o foco', () => {
    const { layer, a } = menuWith3Buttons();
    expect(layer.focused).toBe(a);
  });

  it('navegar pra baixo percorre a lista na vertical', () => {
    const { layer, b, c } = menuWith3Buttons();
    layer.navigate(0, 1);
    expect(layer.focused).toBe(b);
    layer.navigate(0, 1);
    expect(layer.focused).toBe(c);
    layer.navigate(0, 1); // sem vizinho abaixo — foco fica
    expect(layer.focused).toBe(c);
  });

  it('navegar pra cima volta', () => {
    const { layer, a, b } = menuWith3Buttons();
    layer.navigate(0, 1);
    expect(layer.focused).toBe(b);
    layer.navigate(0, -1);
    expect(layer.focused).toBe(a);
  });

  it('activate dispara o onPress do focado', () => {
    const { layer, b } = menuWith3Buttons();
    let pressed = '';
    b.onPress = () => { pressed = 'b'; };
    layer.navigate(0, 1);
    layer.activate();
    expect(pressed).toBe('b');
  });

  it('labels não entram na navegação', () => {
    const layer = new UiLayer(stubBackend(), () => VIEWPORT);
    layer.add(new UiLabel({ text: 'placar' }));
    const only = layer.add(new UiButton({ anchor: 'center', width: 100, height: 30, text: 'Ir' }));
    expect(layer.focused).toBe(only);
    layer.navigate(0, -1);
    expect(layer.focused).toBe(only);
  });
});
