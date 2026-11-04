/** Camada de UI do host: um passe só e seção de medida própria (SPEC-0679). */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { UiLayerRender, type UiLayerRendererLike } from '../../src/render/UiLayerRender.js';
import { setRenderSections } from '../../src/render/RenderSections.js';
import type { NativeUiRenderer } from '../../src/render/native/ui/NativeUiRenderer.js';

/** Renderer falso: registra o estado de clear no instante de cada `render`. */
function rendererFalso() {
  const cor = new THREE.Color(0.2, 0.3, 0.4);
  const estado = { alpha: 1, alvo: null as unknown, renders: [] as Record<string, unknown>[], clears: 0 };
  const r = {
    autoClear: false,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    getClearColor: (t: THREE.Color) => t.copy(cor),
    getClearAlpha: () => estado.alpha,
    setClearColor: (c: THREE.ColorRepresentation, a: number) => {
      cor.set(c);
      estado.alpha = a;
    },
    setRenderTarget: (t: unknown) => {
      estado.alvo = t;
    },
    render: () => {
      estado.renders.push({
        autoClear: r.autoClear,
        autoClearColor: r.autoClearColor,
        autoClearDepth: r.autoClearDepth,
        alvo: estado.alvo,
        alpha: estado.alpha,
        cor: cor.getHex(),
      });
    },
    clear: () => {
      estado.clears++;
    },
    backend: { get: (t: unknown) => ({ texture: { daRt: t } }) },
  };
  return { r, estado, cor };
}

const semNativo = (): NativeUiRenderer | null => null;

describe('UiLayerRender (SPEC-0679)', () => {
  afterEach(() => setRenderSections(null));

  it('limpa no passe do render, sem clear() avulso, e restaura o estado global', () => {
    const { r, estado, cor } = rendererFalso();
    const camada = new UiLayerRender(r as unknown as UiLayerRendererLike, semNativo);
    const tex = camada.render(new THREE.Scene(), new THREE.OrthographicCamera(), 320, 180);
    expect(estado.clears).toBe(0);
    expect(estado.renders).toHaveLength(1);
    const visto = estado.renders[0]!;
    expect(visto).toMatchObject({ autoClear: true, autoClearColor: true, autoClearDepth: false, alpha: 0, cor: 0 });
    expect(visto['alvo']).toBeInstanceOf(THREE.RenderTarget);
    expect(r.autoClear).toBe(false);
    expect(r.autoClearDepth).toBe(true);
    expect(estado.alvo).toBeNull();
    expect(estado.alpha).toBe(1);
    expect(cor.getHex()).toBe(new THREE.Color(0.2, 0.3, 0.4).getHex());
    expect((tex as { daRt: unknown }).daRt).toBe((visto['alvo'] as THREE.RenderTarget).texture);
  });

  it('reaproveita a RT no mesmo tamanho e recria quando muda', () => {
    const { r, estado } = rendererFalso();
    const camada = new UiLayerRender(r as unknown as UiLayerRendererLike, semNativo);
    const cena = new THREE.Scene();
    const cam = new THREE.OrthographicCamera();
    camada.render(cena, cam, 320, 180);
    camada.render(cena, cam, 320, 180);
    camada.render(cena, cam, 640, 360);
    const [a, b, c] = estado.renders.map((x) => x['alvo']);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('usa a UI nativa quando ela existe e mede tudo na seção uiLayer', () => {
    const { r, estado } = rendererFalso();
    const nativa = { render: () => 'texNativa', stats: { draws: 3 }, dispose: () => undefined };
    const camada = new UiLayerRender(r as unknown as UiLayerRendererLike, () => nativa as unknown as NativeUiRenderer);
    const secoes: string[] = [];
    setRenderSections({ begin: (n) => secoes.push(`+${n}`), end: (n) => secoes.push(`-${n}`) });
    expect(camada.render(new THREE.Scene(), new THREE.OrthographicCamera(), 320, 180)).toBe('texNativa');
    expect(estado.renders).toHaveLength(0);
    expect(secoes).toEqual(['+uiLayer', '-uiLayer']);
  });
});
