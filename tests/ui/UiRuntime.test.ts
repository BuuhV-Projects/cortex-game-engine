import { describe, expect, it } from 'vitest';
import {
  anchorFraction,
  designViewport,
  resolveRect,
  uiScale,
  type UiViewport,
} from '../../src/ui/runtime/layout.js';
import { UiButton, UiLabel, UiPanel, type UiWidget } from '../../src/ui/runtime/widgets.js';
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

describe('UiLayer — escala responsiva por resolução (ADR-0129)', () => {
  it('uiScale: 1080p → 1, 4K → 2, 720p → ~0.667 (com limites)', () => {
    expect(uiScale({ width: 1920, height: 1080 })).toBe(1);
    expect(uiScale({ width: 3840, height: 2160 })).toBe(2);
    expect(uiScale({ width: 1280, height: 720 })).toBeCloseTo(0.6667, 3);
    // Limites: não passa de 4 nem cai abaixo de 0.5 em telas extremas.
    expect(uiScale({ width: 15360, height: 8640 })).toBe(4);
    expect(uiScale({ width: 640, height: 360 })).toBe(0.5);
  });

  it('designViewport: layout SEMPRE em ~1080 de altura (real ÷ escala)', () => {
    // 1080p: escala 1, design == real.
    expect(designViewport({ width: 1920, height: 1080 }, 1)).toEqual({ width: 1920, height: 1080 });
    // 4K: escala 2, design volta pro espaço de 1080 (o backend estica ×2).
    expect(designViewport({ width: 3840, height: 2160 }, 2)).toEqual({ width: 1920, height: 1080 });
  });

  it('sync recebe o viewport de DESIGN + a escala (não o viewport real)', () => {
    let viewport: UiViewport = { width: 3840, height: 2160 }; // 4K
    let seen: { widgets: readonly UiWidget[]; viewport: UiViewport; scale: number } | null = null;
    const backend: UiBackend = {
      sync: (widgets, vp, scale = 1) => {
        seen = { widgets, viewport: vp, scale };
      },
      render: () => {},
      dispose: () => {},
    };
    const layer = new UiLayer(backend, () => viewport);
    layer.add(new UiButton({ anchor: 'center', width: 200, height: 40, text: 'A' }));
    layer.update(0);
    expect(seen!.scale).toBe(2);
    expect(seen!.viewport).toEqual({ width: 1920, height: 1080 }); // espaço de design, não 3840×2160

    // Muda pra 720p: escala < 1, design continua ~1080 de altura.
    viewport = { width: 1280, height: 720 };
    layer.update(0);
    expect(seen!.scale).toBeCloseTo(0.6667, 3);
    expect(seen!.viewport.height).toBeCloseTo(1080, 3);
  });

  it('viewport() público devolve o espaço de design (templates posicionam nele)', () => {
    const layer = new UiLayer(stubBackend(), () => ({ width: 3840, height: 2160 }));
    expect(layer.viewport()).toEqual({ width: 1920, height: 1080 });
  });
});

describe('UiLayer — painel `fill` acompanha o viewport (resize/fullscreen)', () => {
  it('redimensiona o painel fill pro viewport de DESIGN (ADR-0129)', () => {
    // 1080p → escala 1, o design é igual ao real.
    let viewport = { width: 1920, height: 1080 };
    const layer = new UiLayer(stubBackend(), () => viewport);
    const bg = layer.add(new UiPanel({ anchor: 'top-left' }));
    bg.fill = true;

    layer.update(0);
    expect(bg.width).toBe(1920);
    expect(bg.height).toBe(1080);

    // Janela mais larga (mesma altura): o design acompanha a largura; o painel
    // fill cobre o espaço de design todo (o backend estica pro real).
    viewport = { width: 2560, height: 1080 };
    layer.update(0);
    expect(bg.width).toBe(2560);
    expect(bg.height).toBe(1080);
  });

  it('não mexe em painéis sem fill', () => {
    let viewport = { width: 1280, height: 720 };
    const layer = new UiLayer(stubBackend(), () => viewport);
    const box = layer.add(new UiPanel({ anchor: 'center', width: 300, height: 100 }));

    viewport = { width: 1920, height: 1080 };
    layer.update(0);
    expect(box.width).toBe(300);
    expect(box.height).toBe(100);
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
