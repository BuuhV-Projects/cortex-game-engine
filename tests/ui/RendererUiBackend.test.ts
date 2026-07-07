/**
 * Testes do backend RENDERER da UI (export nativo CortexNative) focados em
 * REGRESSÃO DE COR: a UI de runtime renderiza pela mesma câmera/renderer do
 * jogo (ACESFilmic ligado). Sem cuidado, a cor de interface (sRGB autorada)
 * sai esfriada/lavada no export — foi o bug reportado. Estes testes travam os
 * dois pontos do fix:
 *   1. Os materiais da UI têm `toneMapped=false` — a UI fica FORA do ACES do
 *      jogo (por MATERIAL; sem alternar o tone mapping do renderer por frame,
 *      que causava recompile de shader → queda de FPS).
 *   2. Botão renderiza OPACO (fillOpacity = opacity do widget, sem o antigo
 *      `*0.96` que deixava o fundo claro vazar e LAVAVA a cor).
 *
 * Usa widgets SEM texto (o raster nativo `__cortexRasterText` só é chamado com
 * texto) e um alvo de render mockado — sem GPU.
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { RendererUiBackend, type UiRenderTarget } from '../../src/ui/runtime/RendererUiBackend.js';
import { UiPanel, UiButton } from '../../src/ui/runtime/widgets.js';

const mockTarget = (): UiRenderTarget => ({ renderViewport: () => {} });

/** Visuais internos (Map por id) — pra inspecionar material/uniform do widget. */
function visualOf(
  backend: RendererUiBackend,
  id: number,
): { background?: { material: { toneMapped: boolean } }; panelUniforms?: { fillOpacity: { value: number } } } | undefined {
  return (
    backend as unknown as {
      _visuals: Map<number, { background?: { material: { toneMapped: boolean } }; panelUniforms?: { fillOpacity: { value: number } } }>;
    }
  )._visuals.get(id);
}

describe('RendererUiBackend — regressão de cor (export nativo)', () => {
  it('material do painel tem toneMapped=false (UI fora do ACES do jogo)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const panel = new UiPanel({ background: '#ffb03a', width: 100, height: 40 });
    backend.sync([panel], { width: 800, height: 600 });
    expect(visualOf(backend, panel.id)?.background?.material.toneMapped).toBe(false);
  });

  it('botão renderiza OPACO — fillOpacity = opacity do widget (sem o *0.96 que lavava a cor)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const button = new UiButton({ background: '#5aa0c0', width: 120, height: 48, opacity: 1 });
    backend.sync([button], { width: 800, height: 600 });
    expect(visualOf(backend, button.id)?.panelUniforms?.fillOpacity.value).toBe(1);
  });

  it('painel respeita a opacity do widget (translúcido continua translúcido)', () => {
    const backend = new RendererUiBackend(mockTarget());
    const scrim = new UiPanel({ background: '#000000', width: 100, height: 100, opacity: 0.6 });
    backend.sync([scrim], { width: 800, height: 600 });
    expect(visualOf(backend, scrim.id)?.panelUniforms?.fillOpacity.value).toBeCloseTo(0.6);
  });

  it('imagem de fundo leva a calibração de brilho do native (tint < 1, não branco puro)', () => {
    // O host nativo apresenta a imagem sem o color management do monitor (que o
    // DOM/Studio ganha) → escurece um tico pra reencontrar o look do Studio.
    // Mocka o TextureLoader (Node não decodifica imagem) pra rodar o callback.
    const fakeTex = new THREE.Texture();
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
      ((_url: string, onLoad?: (t: THREE.Texture) => void) => {
        onLoad?.(fakeTex);
        return fakeTex;
      }) as unknown as THREE.TextureLoader['load'],
    );

    const backend = new RendererUiBackend(mockTarget());
    const panel = new UiPanel({ background: '#7ed6f7', backgroundImage: 'menu-bg.png', width: 100, height: 100 });
    backend.sync([panel], { width: 800, height: 600 });

    const image = (backend as unknown as { _visuals: Map<number, { image?: THREE.Mesh }> })._visuals.get(panel.id)?.image;
    const mat = image?.material as THREE.MeshBasicMaterial;
    expect(mat).toBeDefined();
    expect(mat.color.r).toBeLessThan(1); // escurecida (não branco)
    expect(mat.color.r).toBeGreaterThan(0.7); // mas SÓ um pouquinho
    expect(mat.color.g).toBeCloseTo(mat.color.r); // cinza neutro (não altera matiz)
    expect(mat.toneMapped).toBe(false);
    vi.restoreAllMocks();
  });
});
