/**
 * `<canvas>` na UI de runtime (ADR-0316 / SPEC-0317): o widget é dono de um
 * canvas 2D real; no nativo o backend renderer sobe os pixels pra uma textura
 * SÓ quando o canvas muda (`__cortexVersion` do canvas do host). Roda com o
 * canvas 2D do host (shim), que é o caminho do export.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { installDomLite } from '../../native/js/src/shims/dom-lite.js';
import { installCanvas2d } from '../../native/js/src/shims/canvas2d/index.js';
import { parseUiTemplate } from '../../src/ui/runtime/UiTemplate.js';
import { parseUiCss } from '../../src/ui/runtime/UiStylesheet.js';
import { parseUiColor } from '../../src/ui/runtime/uiColor.js';
import { RendererUiBackend, type UiRenderTarget } from '../../src/ui/runtime/RendererUiBackend.js';
import { UiCanvas } from '../../src/ui/runtime/widgets.js';
import { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import type { UiBackend } from '../../src/ui/runtime/UiBackend.js';

const VIEWPORT = { width: 1280, height: 720 };
const nullBackend = (): UiBackend => ({ sync: () => {}, render: () => {}, dispose: () => {} });
const mockTarget = (): UiRenderTarget => ({ renderViewport: () => {} });

type Visual = { canvas?: THREE.Mesh; canvasTexture?: THREE.CanvasTexture };
const visualOf = (backend: RendererUiBackend, id: number): Visual =>
  (backend as unknown as { _visuals: Map<number, Visual> })._visuals.get(id)!;

beforeAll(() => {
  installDomLite();
  installCanvas2d();
});

describe('UiCanvas — template e CSS', () => {
  it('<canvas width height> = tamanho do BITMAP (HTML5); exibido vem do CSS', () => {
    const ui = new UiLayer(nullBackend(), () => VIEWPORT);
    const tpl = parseUiTemplate(`
      <style>.radar { pointer-events: none; border: 3px solid #000000; } .big { width: 400px; }</style>
      <canvas id="radar" class="radar" width="180" height="120" anchor="bottom-left" x="20" y="-30"></canvas>
      <canvas id="map" class="big"></canvas>
    `).build(ui);
    const radar = tpl.get('radar') as UiCanvas;
    expect(radar).toBeInstanceOf(UiCanvas);
    expect([radar.canvas.width, radar.canvas.height]).toEqual([180, 120]);
    expect([radar.width, radar.height]).toEqual([0, 0]); // exibido = bitmap
    expect(radar.pointerEvents).toBe('none');
    expect(radar.borderWidth).toBe(3);
    expect(radar.background).toBe('transparent');
    expect(radar.anchor).toBe('bottom-left');
    const map = tpl.get('map') as UiCanvas;
    expect([map.canvas.width, map.canvas.height]).toEqual([300, 150]); // default HTML5
    expect(map.width).toBe(400);
    expect(typeof radar.canvas.getContext('2d')?.fillRect).toBe('function');
  });

  it('pointer-events fora de auto|none é erro claro', () => {
    expect(() => parseUiCss('.x { pointer-events: stroke; }')).toThrow(/pointer-events/);
  });

  it('transparent é cor válida (alpha 0) — não vira preto no renderer', () => {
    expect(parseUiColor('transparent')).toEqual({ rgb: '#000000', alpha: 0 });
  });
});

describe('UiCanvas — backend renderer (nativo)', () => {
  it('quad no rect de CONTEÚDO (rect − borda) acima do fundo', () => {
    const backend = new RendererUiBackend(mockTarget());
    const c = new UiCanvas({ width: 200, height: 100, borderWidth: 3 });
    c.canvas.width = 50;
    c.canvas.height = 25;
    backend.sync([c], VIEWPORT);
    const mesh = visualOf(backend, c.id).canvas!;
    expect([mesh.scale.x, mesh.scale.y]).toEqual([194, 94]);
    expect((mesh.material as THREE.MeshBasicMaterial).toneMapped).toBe(false);
    expect(mesh.visible).toBe(true);
  });

  it('re-sobe SÓ quando o canvas muda (__cortexVersion do host)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const c = new UiCanvas();
    c.canvas.width = 64;
    c.canvas.height = 64;
    const g = c.canvas.getContext('2d')!;
    backend.sync([c], VIEWPORT);
    const tex = visualOf(backend, c.id).canvasTexture!;
    const v0 = tex.version;
    backend.sync([c], VIEWPORT);
    backend.sync([c], VIEWPORT);
    expect(tex.version).toBe(v0); // parado: nenhum upload
    g.fillRect(0, 0, 8, 8);
    backend.sync([c], VIEWPORT);
    expect(tex.version).toBe(v0 + 1); // desenhou: um upload
    backend.sync([c], VIEWPORT);
    expect(tex.version).toBe(v0 + 1);
  });

  it('invisível não sobe nada', () => {
    const backend = new RendererUiBackend(mockTarget());
    const c = new UiCanvas();
    backend.sync([c], VIEWPORT);
    const tex = visualOf(backend, c.id).canvasTexture!;
    const v0 = tex.version;
    c.set({ visible: false });
    c.canvas.getContext('2d')!.fillRect(0, 0, 4, 4);
    backend.sync([c], VIEWPORT);
    expect(tex.version).toBe(v0);
  });

  it('bitmap redimensionado → textura nova do tamanho novo (e exibido acompanha)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const c = new UiCanvas();
    backend.sync([c], VIEWPORT);
    const first = visualOf(backend, c.id).canvasTexture!;
    c.canvas.width = 640;
    c.canvas.height = 320;
    backend.sync([c], VIEWPORT);
    const second = visualOf(backend, c.id).canvasTexture!;
    expect(second).not.toBe(first);
    expect(c.measuredWidth).toBe(640);
    expect(visualOf(backend, c.id).canvas!.scale.x).toBe(640);
  });

  it('canvas sem __cortexVersion (fora do host) re-sobe todo quadro visível', () => {
    const backend = new RendererUiBackend(mockTarget());
    const plain = { width: 10, height: 10 } as unknown as HTMLCanvasElement;
    const c = new UiCanvas({ canvas: plain });
    backend.sync([c], VIEWPORT);
    const tex = visualOf(backend, c.id).canvasTexture!;
    const v0 = tex.version;
    backend.sync([c], VIEWPORT);
    expect(tex.version).toBeGreaterThan(v0);
  });
});

describe('canvas 2D do host — __cortexVersion', () => {
  it('sobe em operação de pixel e em redimensionamento, não em estado', () => {
    const c = document.createElement('canvas') as HTMLCanvasElement & { __cortexVersion: number };
    const g = c.getContext('2d')!;
    const v0 = c.__cortexVersion;
    g.fillStyle = '#ff0000';
    g.translate(2, 2);
    expect(c.__cortexVersion).toBe(v0);
    g.fillRect(0, 0, 4, 4);
    expect(c.__cortexVersion).toBe(v0 + 1);
    c.width = 20;
    expect(c.__cortexVersion).toBe(v0 + 2);
  });
});
