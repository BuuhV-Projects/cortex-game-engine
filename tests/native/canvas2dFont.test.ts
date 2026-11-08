/**
 * Família de `ctx.font` no canvas 2D do host (ADR-0715 / SPEC-0716): a família
 * chega ao raster nativo, o cache separa famílias e a linha de base usa a
 * métrica da fonte registrada (`__cortexFontMetrics`), não a da Roboto.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createCanvasElement } from '../../native/js/src/shims/canvas2d/canvas-element.js';
import {
  FONT_ASCENDER,
  FONT_UNITS_PER_EM,
  fontMetrics,
  parseFontFamily,
} from '../../native/js/src/shims/canvas2d/text.js';

const g0 = globalThis as Record<string, unknown>;
const GLYPH_W = 5;

afterEach(() => {
  delete g0['__cortexRasterText'];
  delete g0['__cortexFontMetrics'];
});

/** Raster falso: largura depende da família (cada fonte mede diferente). */
function installRaster(): unknown[][] {
  const calls: unknown[][] = [];
  g0['__cortexRasterText'] = (text: string, size: number, origin: string, family: string) => {
    calls.push([text, size, origin, family]);
    const glyph = family === 'Condensada' ? GLYPH_W - 2 : GLYPH_W;
    const width = text.length * glyph + 2;
    const height = Math.ceil(size * 1.2) + 2;
    return { width, height, rgba: new ArrayBuffer(width * height * 4) };
  };
  return calls;
}

describe('canvas 2D do host: família de ctx.font', () => {
  it('parseFontFamily pega a primeira família depois do tamanho', () => {
    expect(parseFontFamily("600 22px 'Barlow Semi', sans-serif")).toBe('Barlow Semi');
    expect(parseFontFamily('bold 12px/1.4 "Hud", Arial')).toBe('Hud');
    expect(parseFontFamily('10px sans-serif')).toBe('sans-serif');
    expect(parseFontFamily('sem tamanho')).toBe('');
  });

  it('measureText passa a família ao raster e mede cada fonte separado', () => {
    const calls = installRaster();
    const g = createCanvasElement(1, 1).getContext('2d') as CanvasRenderingContext2D;
    g.font = "20px 'Condensada'";
    const condensed = g.measureText('abcd').width;
    g.font = '20px Outra';
    const other = g.measureText('abcd').width;
    expect(condensed).toBe(4 * (GLYPH_W - 2));
    expect(other).toBe(4 * GLYPH_W);
    expect(calls.map((c) => c[3])).toEqual(['Condensada', 'Outra']);
    expect(calls[0]![2]).toBe('canvas');
  });

  it('linha de base usa a métrica da fonte registrada; sem registro, a da Roboto', () => {
    installRaster();
    const roboto = FONT_ASCENDER / FONT_UNITS_PER_EM;
    let queries = 0;
    g0['__cortexFontMetrics'] = (family: string) => {
      queries++;
      return family === 'Alta' ? { ascent: 0.9, descent: 0.3 } : null;
    };
    expect(fontMetrics('NaoRegistrada').ascent).toBe(roboto);
    expect(fontMetrics('NaoRegistrada').ascent).toBe(roboto);
    expect(fontMetrics('Alta')).toEqual({ ascent: 0.9, descent: 0.3 });
    expect(queries).toBe(2); // uma por família, não uma por medida
    const g = createCanvasElement(1, 1).getContext('2d') as CanvasRenderingContext2D;
    g.font = '10px Alta';
    g.textBaseline = 'alphabetic';
    const metrics = g.measureText('x');
    expect(metrics.fontBoundingBoxAscent).toBeCloseTo(9);
    expect(metrics.fontBoundingBoxDescent).toBeCloseTo(3);
  });
});
