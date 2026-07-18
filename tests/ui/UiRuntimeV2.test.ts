/**
 * Testes das extensões "DOM-lite" da UI de runtime (menus cartoon do v4):
 * gradiente por string CSS (com eixo), cor com alpha nos uniforms do backend
 * renderer (console), sombra dura (`box-shadow: 0 Npx 0 cor`) como segunda
 * malha, `text-align` no botão e tags HTML5 (`div`/`span`/`img`) no template.
 * Tudo sem GPU (alvo de render mockado) — mesma técnica do
 * RendererUiBackend.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { Color, Mesh, Vector2 } from 'three';
import { RendererUiBackend, type UiRenderTarget } from '../../src/ui/runtime/RendererUiBackend.js';
import { UiButton, UiPanel } from '../../src/ui/runtime/widgets.js';
import { parseUiCss } from '../../src/ui/runtime/UiStylesheet.js';
import { parseUiTemplate } from '../../src/ui/runtime/UiTemplate.js';
import { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import type { UiBackend } from '../../src/ui/runtime/UiBackend.js';

const mockTarget = (): UiRenderTarget => ({ renderViewport: () => {} });
const VIEWPORT = { width: 800, height: 600 };

interface VisualPeek {
  panelUniforms?: {
    colorTop: { value: Color };
    colorBottom: { value: Color };
    alphaTop: { value: number };
    alphaBottom: { value: number };
    alphaBorder: { value: number };
    gradientAxis: { value: number };
  };
  shadow?: Mesh & { position: { y: number } };
  shadowUniforms?: { colorTop: { value: Color }; alphaTop: { value: number }; size: { value: Vector2 } };
  text?: Mesh;
}

function visualOf(backend: RendererUiBackend, id: number): VisualPeek | undefined {
  return (backend as unknown as { _visuals: Map<number, VisualPeek> })._visuals.get(id);
}

describe('RendererUiBackend — background CSS com gradiente e alpha (console)', () => {
  it('linear-gradient(90deg, ...) vira eixo horizontal nos uniforms', () => {
    const backend = new RendererUiBackend(mockTarget());
    const bar = new UiPanel({
      background: 'linear-gradient(90deg, #ffe367, #ffb828)',
      width: 200,
      height: 15,
    });
    backend.sync([bar], VIEWPORT);
    const u = visualOf(backend, bar.id)?.panelUniforms;
    expect(u?.gradientAxis.value).toBe(1);
    expect(u?.colorTop.value.getHexString()).toBe('ffe367');
    expect(u?.colorBottom.value.getHexString()).toBe('ffb828');
  });

  it('cor #rrggbbaa separa o alpha num uniform (THREE.Color não tem alpha)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const scrim = new UiPanel({ background: '#0d2a40dd', width: 100, height: 100 });
    backend.sync([scrim], VIEWPORT);
    const u = visualOf(backend, scrim.id)?.panelUniforms;
    expect(u?.colorTop.value.getHexString()).toBe('0d2a40');
    expect(u?.alphaTop.value).toBeCloseTo(0xdd / 255, 3);
  });

  it('backgroundTo legado continua funcionando (gradiente vertical)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const sky = new UiPanel({ background: '#7ed6f7', backgroundTo: '#1e8fc4', width: 50, height: 50 });
    backend.sync([sky], VIEWPORT);
    const u = visualOf(backend, sky.id)?.panelUniforms;
    expect(u?.gradientAxis.value).toBe(0);
    expect(u?.colorBottom.value.getHexString()).toBe('1e8fc4');
  });

  it('botão focado usa o focusBackground (que pode ser gradiente)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const button = new UiButton({
      background: 'linear-gradient(180deg, #59dbff, #22aaf1)',
      focusBackground: 'linear-gradient(180deg, #ffe976, #ffbd30)',
      width: 200,
      height: 60,
    });
    backend.sync([button], VIEWPORT);
    expect(visualOf(backend, button.id)?.panelUniforms?.colorTop.value.getHexString()).toBe('59dbff');
    button.set({ focused: true } as Partial<UiButton>);
    backend.sync([button], VIEWPORT);
    expect(visualOf(backend, button.id)?.panelUniforms?.colorTop.value.getHexString()).toBe('ffe976');
  });
});

describe('RendererUiBackend — box-shadow duro (segunda malha)', () => {
  it('cria a malha da sombra deslocada offsetY pra baixo', () => {
    const backend = new RendererUiBackend(mockTarget());
    const button = new UiButton({
      background: '#3cd1ff',
      boxShadow: '0 11px 0 #087ebc',
      width: 200,
      height: 60,
      anchor: 'top-left',
    });
    backend.sync([button], VIEWPORT);
    const visual = visualOf(backend, button.id);
    expect(visual?.shadow).toBeTruthy();
    expect(visual?.shadowUniforms?.colorTop.value.getHexString()).toBe('087ebc');
    // Caixa no topo (y=0, h=60): centro em -30; sombra 11px abaixo → -41.
    expect(visual?.shadow!.position.y).toBeCloseTo(-41);
  });

  it('boxShadow "none" não cria/esconde a sombra', () => {
    const backend = new RendererUiBackend(mockTarget());
    const panel = new UiPanel({ background: '#ffffff', boxShadow: 'none', width: 50, height: 50 });
    backend.sync([panel], VIEWPORT);
    expect(visualOf(backend, panel.id)?.shadow).toBeUndefined();
  });
});

describe('UiStylesheet — props CSS novas (box-shadow, text-align, border em botão)', () => {
  it('box-shadow e border constante compilam pro botão', () => {
    const sheet = parseUiCss(
      '.play { background: linear-gradient(180deg, #ffe976, #ffbd30); border: 4px solid #ffffff; box-shadow: 0 11px 0 #bd7800; text-align: left; }',
    );
    const button = sheet.apply(new UiButton(), 'play');
    expect(button.background).toBe('linear-gradient(180deg, #ffe976, #ffbd30)');
    expect(button.borderWidth).toBe(4);
    expect(button.borderColor).toBe('#ffffff');
    expect(button.boxShadow).toBe('0 11px 0 #bd7800');
    expect(button.textAlign).toBe('left');
  });

  it('box-shadow com blur = erro na COMPILAÇÃO (fora do subset duro)', () => {
    expect(() => parseUiCss('.x { box-shadow: 0 4px 12px #000; }')).toThrow(/box-shadow/);
  });

  it('gradiente com ângulo fora do subset = erro na COMPILAÇÃO', () => {
    expect(() => parseUiCss('.x { background: linear-gradient(45deg, #a, #b); }')).toThrow(
      /gradiente/,
    );
  });
});

describe('UiTemplate — tags HTML5 (div/span/img)', () => {
  const domBackend = (): UiBackend => ({ sync: () => {}, render: () => {}, dispose: () => {} });

  it('<div>/<span>/<img> viram Panel/Label/Panel-com-imagem', () => {
    const ui = new UiLayer(domBackend(), () => VIEWPORT);
    const inst = parseUiTemplate(`
      <style>.hero { background: #0d2a40; border-radius: 44px; }</style>
      <div class="hero" width="400" height="300"></div>
      <span anchor="center">Ilhas</span>
      <img src="assets/ui/worlds/{{id}}.png" width="100" height="80" />
    `).build(ui, { data: { id: 'ilhas' } });
    expect(inst.widgets.length).toBe(3);
    const [hero, , img] = inst.widgets;
    expect((hero as UiPanel).cornerRadius).toBe(44);
    expect((img as UiPanel).backgroundImage).toBe('assets/ui/worlds/ilhas.png');
  });
});
