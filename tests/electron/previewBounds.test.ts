/**
 * Testes da geometria do preview nativo (electron/renderer/previewBounds.ts,
 * SPEC-0207): a janela do host não ocupa o palco inteiro — sobram faixas para
 * as pills do viewport, que são DOM e ficariam escondidas sob a janela nativa
 * (airspace).
 */
import { describe, it, expect } from 'vitest';
import { nativePreviewBounds } from '../../electron/renderer/previewBounds.js';

/** As faixas de produção (`Preview.NATIVE_BAR_*`). */
const BARS = { top: 38, bottom: 38 };

describe('nativePreviewBounds', () => {
  it('desce pela faixa de cima e encurta pelas duas', () => {
    const bounds = nativePreviewBounds({ x: 100, y: 50, width: 800, height: 600 }, BARS);

    expect(bounds).toEqual({ x: 100, y: 88, width: 800, height: 524 });
  });

  it('arredonda a geometria fracionária que o layout do DOM entrega', () => {
    const bounds = nativePreviewBounds({ x: 10.4, y: 20.6, width: 800.5, height: 600.4 }, BARS);

    expect(bounds).toEqual({ x: 10, y: 59, width: 801, height: 524 });
  });

  it('sem faixas, ocupa o palco inteiro (o caso do fullscreen do preview)', () => {
    const bounds = nativePreviewBounds({ x: 0, y: 0, width: 1280, height: 720 }, { top: 0, bottom: 0 });

    expect(bounds).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it('painel colapsado não gera geometria (janela 0×0 não é configurável no wgpu)', () => {
    expect(nativePreviewBounds({ x: 0, y: 0, width: 0, height: 0 }, BARS)).toBeNull();
    expect(nativePreviewBounds({ x: 0, y: 0, width: 800, height: 0 }, BARS)).toBeNull();
  });

  it('palco mais baixo que as faixas não gera geometria', () => {
    // 70px de palco com 76px de faixas: não sobra área útil.
    expect(nativePreviewBounds({ x: 0, y: 0, width: 800, height: 70 }, BARS)).toBeNull();
  });

  it('palco exatamente do tamanho das faixas também não gera', () => {
    expect(nativePreviewBounds({ x: 0, y: 0, width: 800, height: 76 }, BARS)).toBeNull();
  });
});
