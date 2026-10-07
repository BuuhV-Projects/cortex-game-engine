/**
 * Canvas 2D do host nativo (SPEC-0313 / ADR-0312): rasterização em software
 * conferida pixel a pixel. Antes disto o canvas do dom-lite era inerte e o
 * DDD 61 morria no boot do export ("undefined is not a function" em makeTextures).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { createCanvasElement } from '../../native/js/src/shims/canvas2d/canvas-element.js';
import { installDomLite } from '../../native/js/src/shims/dom-lite.js';
import { installCanvas2d } from '../../native/js/src/shims/canvas2d/index.js';
import {
  FONT_ASCENDER,
  FONT_DESCENDER,
  FONT_UNITS_PER_EM,
  MASK_CACHE_MAX_BYTES,
  maskCacheSize,
  rasterText,
} from '../../native/js/src/shims/canvas2d/text.js';

type Ctx = CanvasRenderingContext2D;
type Canvas = HTMLCanvasElement & { rgba: ArrayBuffer };

function canvas(w: number, h: number): { c: Canvas; g: Ctx } {
  const c = createCanvasElement(w, h) as Canvas;
  return { c, g: c.getContext('2d') as Ctx };
}

function px(c: Canvas, x: number, y: number): number[] {
  const d = new Uint8Array(c.rgba);
  const i = (y * c.width + x) * 4;
  return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
}

/** Soma do alfa (em pixels inteiros cobertos). */
function coveredArea(c: Canvas): number {
  const d = new Uint8Array(c.rgba);
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i]! / 255;
  return sum;
}

function near(actual: number[], expected: number[], tolerance = 2): void {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]!), `canal ${i}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance));
}

describe('canvas 2D do host: elemento e upload', () => {
  it('expõe o contrato do ImageBitmap do host (width/height/rgba) com os pixels atuais', () => {
    const { c, g } = canvas(4, 2);
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 4, 2);
    expect(c.rgba).toBeInstanceOf(ArrayBuffer);
    expect(c.rgba.byteLength).toBe(4 * 2 * 4);
    expect(px(c, 3, 1)).toEqual([255, 0, 0, 255]);
  });

  it('redimensionar limpa os pixels e o estado; getContext é sempre o mesmo', () => {
    const { c, g } = canvas(2, 2);
    g.fillStyle = 'blue';
    g.translate(5, 5);
    c.width = 3;
    expect(c.getContext('2d')).toBe(g);
    expect(px(c, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(g.fillStyle).toBe('#000000');
    expect(g.getTransform().e).toBe(0);
    expect(c.getContext('webgpu' as '2d')).toBeNull();
  });

  it('toDataURL falha alto (não suportado no host)', () => {
    expect(() => canvas(1, 1).c.toDataURL()).toThrow(/não suportado/);
  });
});

describe('canvas 2D do host: cores e retângulos', () => {
  it('aceita as sintaxes de cor CSS e ignora cor inválida', () => {
    const { g } = canvas(1, 1);
    g.fillStyle = '#0f08';
    expect(g.fillStyle).toBe('rgba(0, 255, 0, ' + 0x88 / 255 + ')');
    g.fillStyle = 'rgb(10 20 30 / 50%)';
    expect(g.fillStyle).toBe('rgba(10, 20, 30, 0.5)');
    g.fillStyle = 'hsl(120, 100%, 50%)';
    expect(g.fillStyle).toBe('#00ff00');
    g.fillStyle = 'cornflowerblue';
    expect(g.fillStyle).toBe('#6495ed');
    g.fillStyle = 'nem-cor';
    expect(g.fillStyle).toBe('#6495ed');
  });

  it('fillRect com borda fracionária tem antialias proporcional', () => {
    const { c, g } = canvas(4, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 2.5, 1);
    expect(px(c, 1, 0)[3]).toBe(255);
    expect(px(c, 2, 0)[3]).toBeGreaterThanOrEqual(126);
    expect(px(c, 2, 0)[3]).toBeLessThanOrEqual(129);
    expect(px(c, 3, 0)[3]).toBe(0);
  });

  it('globalAlpha e source-over compõem em alfa não pré-multiplicado', () => {
    const { c, g } = canvas(1, 1);
    g.fillStyle = '#0000ff';
    g.fillRect(0, 0, 1, 1);
    g.globalAlpha = 0.5;
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 1, 1);
    near(px(c, 0, 0), [128, 0, 128, 255]);
  });

  it('clearRect apaga e strokeRect contorna', () => {
    const { c, g } = canvas(10, 10);
    g.fillRect(0, 0, 10, 10);
    g.clearRect(2, 2, 6, 6);
    expect(px(c, 5, 5)[3]).toBe(0);
    expect(px(c, 1, 1)[3]).toBe(255);
    g.clearRect(0, 0, 10, 10);
    g.lineWidth = 2;
    g.strokeRect(2, 2, 6, 6);
    expect(px(c, 2, 5)[3]).toBe(255);
    expect(px(c, 5, 5)[3]).toBe(0);
  });
});

describe('canvas 2D do host: caminhos', () => {
  it('arc preenchido tem a área de πr²', () => {
    const { c, g } = canvas(40, 40);
    g.beginPath();
    g.arc(20, 20, 15, 0, Math.PI * 2);
    g.fill();
    expect(coveredArea(c)).toBeCloseTo(Math.PI * 15 * 15, 0);
    expect(px(c, 20, 20)[3]).toBe(255);
    expect(px(c, 1, 1)[3]).toBe(0);
  });

  it('evenodd abre o furo que nonzero preenche', () => {
    const draw = (rule: CanvasFillRule): number => {
      const { c, g } = canvas(10, 10);
      g.beginPath();
      g.rect(0, 0, 10, 10);
      g.rect(3, 3, 4, 4);
      g.fill(rule);
      return px(c, 5, 5)[3]!;
    };
    expect(draw('nonzero')).toBe(255);
    expect(draw('evenodd')).toBe(0);
  });

  it('stroke de linha horizontal cobre lineWidth px; lineCap square estende', () => {
    const { c, g } = canvas(20, 10);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(4, 5);
    g.lineTo(16, 5);
    g.stroke();
    expect(px(c, 10, 4)[3]).toBe(255);
    expect(px(c, 10, 5)[3]).toBe(255);
    expect(px(c, 10, 3)[3]).toBe(0);
    expect(px(c, 3, 5)[3]).toBe(0);
    g.clearRect(0, 0, 20, 10);
    g.lineCap = 'square';
    g.stroke();
    expect(px(c, 3, 5)[3]).toBe(255);
  });

  it('setLineDash alterna traço e vão', () => {
    const { c, g } = canvas(20, 4);
    g.lineWidth = 2;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(0, 2);
    g.lineTo(20, 2);
    g.stroke();
    expect(px(c, 2, 2)[3]).toBe(255);
    expect(px(c, 6, 2)[3]).toBe(0);
    expect(px(c, 10, 2)[3]).toBe(255);
  });

  it('transform: translate+scale e rotate posicionam o retângulo', () => {
    const { c, g } = canvas(20, 20);
    g.translate(10, 0);
    g.scale(2, 2);
    g.fillRect(0, 0, 2, 2); // → [10,14)×[0,4)
    expect(px(c, 13, 3)[3]).toBe(255);
    expect(px(c, 9, 1)[3]).toBe(0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(5, 10);
    g.rotate(Math.PI / 2); // x local → y de tela
    g.fillStyle = '#00ff00';
    g.fillRect(0, -1, 6, 2); // → [4,6)×[10,16)
    expect(px(c, 5, 14)).toEqual([0, 255, 0, 255]);
    expect(px(c, 8, 12)[3]).toBe(0);
  });

  it('clip recorta e restore devolve o clip anterior', () => {
    const { c, g } = canvas(20, 20);
    g.save();
    g.beginPath();
    g.arc(10, 10, 5, 0, Math.PI * 2);
    g.clip();
    g.fillRect(0, 0, 20, 20);
    expect(px(c, 10, 10)[3]).toBe(255);
    expect(px(c, 1, 1)[3]).toBe(0);
    g.restore();
    g.fillRect(0, 0, 2, 2);
    expect(px(c, 1, 1)[3]).toBe(255);
  });
});

describe('canvas 2D do host: gradientes', () => {
  it('linear interpola entre as paradas ao longo do eixo', () => {
    const { c, g } = canvas(101, 1);
    const grad = g.createLinearGradient(0, 0, 101, 0);
    grad.addColorStop(0, '#ff0000');
    grad.addColorStop(1, '#0000ff');
    g.fillStyle = grad;
    g.fillRect(0, 0, 101, 1);
    near(px(c, 0, 0), [254, 0, 1, 255]);
    near(px(c, 50, 0), [128, 0, 127, 255]);
    near(px(c, 100, 0), [1, 0, 254, 255]);
  });

  it('radial: centro na 1ª parada, borda na última, e pad fora', () => {
    const { c, g } = canvas(21, 21);
    const grad = g.createRadialGradient(10.5, 10.5, 0, 10.5, 10.5, 10);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, 21, 21);
    near(px(c, 10, 10), [255, 255, 255, 255], 4);
    near(px(c, 0, 0), [0, 0, 0, 255]);
    expect(() => grad.addColorStop(2, 'red')).toThrow();
  });
});

describe('canvas 2D do host: imagem, pixels e sombra', () => {
  it('drawImage escala canvas→canvas (vizinho mais próximo sem suavização)', () => {
    const src = canvas(2, 1);
    src.g.fillStyle = '#ff0000';
    src.g.fillRect(0, 0, 1, 1);
    src.g.fillStyle = '#0000ff';
    src.g.fillRect(1, 0, 1, 1);
    const { c, g } = canvas(8, 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(src.c, 0, 0, 8, 2);
    expect(px(c, 3, 1)).toEqual([255, 0, 0, 255]);
    expect(px(c, 4, 0)).toEqual([0, 0, 255, 255]);
  });

  it('drawImage do canvas nele mesmo lê o conteúdo de antes (borda do tiledCanvas)', () => {
    const { c, g } = canvas(4, 1);
    g.fillStyle = '#00ff00';
    g.fillRect(1, 0, 1, 1);
    g.imageSmoothingEnabled = false;
    g.drawImage(c, 1, 0, 1, 1, 0, 0, 1, 1);
    expect(px(c, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it('getImageData/putImageData copiam a região (fora = transparente)', () => {
    const { c, g } = canvas(3, 3);
    g.fillStyle = '#123456';
    g.fillRect(1, 1, 1, 1);
    const img = g.getImageData(0, 0, 4, 3);
    expect(img.width).toBe(4);
    expect(Array.from(img.data.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4))).toEqual([0x12, 0x34, 0x56, 255]);
    g.putImageData(img, 1, 0);
    expect(px(c, 2, 1)).toEqual([0x12, 0x34, 0x56, 255]);
  });

  it('shadowBlur espalha o brilho em volta do desenho e some longe dele', () => {
    const { c, g } = canvas(60, 20);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 60, 20);
    g.shadowColor = '#ffb000';
    g.shadowBlur = 8;
    g.fillStyle = '#ffb000';
    g.fillRect(10, 8, 4, 4);
    expect(px(c, 12, 10)).toEqual([255, 176, 0, 255]);
    expect(px(c, 16, 10)[0]).toBeGreaterThan(5); // halo ao lado (σ = 4 sobre 4 px: pico ~0,16)
    expect(px(c, 50, 10)).toEqual([0, 0, 0, 255]); // longe: intocado
  });

  it('shadowOffset desenha a sombra deslocada embaixo do desenho', () => {
    const { c, g } = canvas(10, 10);
    g.shadowColor = '#ff0000';
    g.shadowOffsetX = 3;
    g.shadowOffsetY = 3;
    g.fillStyle = '#0000ff';
    g.fillRect(1, 1, 3, 3);
    expect(px(c, 2, 2)).toEqual([0, 0, 255, 255]);
    expect(px(c, 6, 6)).toEqual([255, 0, 0, 255]);
    expect(px(c, 8, 8)[3]).toBe(0);
  });
});

describe('canvas 2D do host: rasterização adiada', () => {
  type Deferred = Ctx & { _queue: unknown[] };

  it('canvas que ninguém lê não rasteriza; limpar o canvas inteiro descarta a fila', () => {
    const { c, g } = canvas(50, 50);
    const d = g as Deferred;
    for (let frame = 0; frame < 100; frame++) {
      g.clearRect(0, 0, 50, 50);
      g.beginPath();
      g.arc(25, 25, 20, 0, Math.PI * 2);
      g.stroke();
    }
    expect(d._queue.length).toBe(2); // só o último quadro: clear + stroke
    expect(new Uint8Array(c.rgba)[3]).toBe(0); // ler rasteriza
    expect(d._queue.length).toBe(0);
    expect(px(c, 25, 5)[3]).toBeGreaterThan(0);
  });

  it('drawImage usa a fonte como estava na chamada, mesmo pintada depois', () => {
    const src = canvas(1, 1);
    src.g.fillStyle = '#ff0000';
    src.g.fillRect(0, 0, 1, 1);
    const { c, g } = canvas(1, 1);
    g.drawImage(src.c, 0, 0);
    src.g.fillStyle = '#0000ff';
    src.g.fillRect(0, 0, 1, 1);
    expect(px(src.c, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(px(c, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it('estado e caminho seguem vivos sem rasterizar (getTransform, fillStyle)', () => {
    const { g } = canvas(4, 4);
    g.translate(3, 0);
    g.fillRect(0, 0, 1, 1);
    g.fillStyle = 'red';
    expect(g.getTransform().e).toBe(3);
    expect(g.fillStyle).toBe('#ff0000');
    expect((g as Deferred)._queue.length).toBe(1);
  });

  it('fillRect enfileirado usa o fillStyle da hora da chamada', () => {
    const { c, g } = canvas(2, 1);
    g.fillStyle = '#00ff00';
    g.fillRect(0, 0, 1, 1);
    g.fillStyle = '#0000ff';
    g.fillRect(1, 0, 1, 1);
    expect(px(c, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(px(c, 1, 0)).toEqual([0, 0, 255, 255]);
  });
});

describe('canvas 2D do host: texto', () => {
  const g0 = globalThis as Record<string, unknown>;
  const GLYPH_W = 6;
  const ASCENT = Math.ceil((FONT_ASCENDER / FONT_UNITS_PER_EM) * 10);

  // Raster falso: cada caractere é um bloco cheio de GLYPH_W px, com as folgas do text_raster.cpp.
  beforeAll(() => {
    g0['__cortexRasterText'] = (text: string, size: number) => {
      const width = text.length * GLYPH_W + 2;
      const height = Math.ceil(((FONT_ASCENDER - FONT_DESCENDER) / FONT_UNITS_PER_EM) * size) + 2;
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 1; x < width - 1; x++) rgba.set([255, 255, 255, 255], (y * width + x) * 4);
      return { width, height, rgba: rgba.buffer };
    };
  });

  it('measureText usa a largura de avanço do raster do host', () => {
    const { g } = canvas(1, 1);
    g.font = 'bold 10px Arial';
    expect(g.measureText('abc').width).toBe(3 * GLYPH_W);
  });

  it('fillText respeita textAlign e textBaseline e pinta com o fillStyle', () => {
    const { c, g } = canvas(40, 30);
    g.font = '10px sans-serif';
    g.fillStyle = '#ff0000';
    g.textAlign = 'center';
    g.fillText('ab', 20, 20); // 12 px de largura centrados em 20 → [14, 26)
    expect(px(c, 15, 20 - ASCENT + 2)).toEqual([255, 0, 0, 255]);
    expect(px(c, 12, 18)[3]).toBe(0);
    expect(px(c, 27, 18)[3]).toBe(0);
    g.clearRect(0, 0, 40, 30);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('a', 2, 2);
    expect(px(c, 3, 3)[3]).toBe(255);
    expect(px(c, 3, 0)[3]).toBe(0); // linha de base em y + ascent: a máscara começa abaixo de y
  });

  it('maxWidth comprime o texto na horizontal', () => {
    const { c, g } = canvas(40, 20);
    g.font = '10px sans-serif';
    g.fillText('abcd', 0, 15, 12);
    expect(px(c, 10, 12)[3]).toBe(255);
    expect(px(c, 14, 12)[3]).toBe(0);
  });

  const fontPath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'native', 'third_party', 'fonts', 'Roboto-Medium.ttf');
  it.skipIf(!fs.existsSync(fontPath))('métricas do posicionamento batem com a Roboto-Medium.ttf do host', () => {
    const b = fs.readFileSync(fontPath);
    const tables: Record<string, number> = {};
    for (let i = 0; i < b.readUInt16BE(4); i++) tables[b.toString('latin1', 12 + 16 * i, 16 + 16 * i)] = b.readUInt32BE(12 + 16 * i + 8);
    expect(b.readUInt16BE(tables['head']! + 18)).toBe(FONT_UNITS_PER_EM);
    expect(b.readInt16BE(tables['hhea']! + 4)).toBe(FONT_ASCENDER);
    expect(b.readInt16BE(tables['hhea']! + 6)).toBe(FONT_DESCENDER);
  });
});

describe('canvas 2D do host: cache de máscaras de texto (SPEC-0321)', () => {
  const g0 = globalThis as Record<string, unknown>;
  let rasters = 0;
  let rasteredClock = 0;

  // Raster falso do tamanho de um relógio de painel a 92 px (~100 KB por string).
  beforeAll(() => {
    g0['__cortexRasterText'] = (text: string) => {
      rasters++;
      if (text === 'Próximo trem') rasteredClock++;
      const width = 200;
      const height = 125;
      return { width, height, rgba: new ArrayBuffer(width * height * 4) };
    };
  });

  it('10 mil strings distintas: bytes retidos ficam no teto e o texto usado sempre não é re-rasterizado', () => {
    const PX = 92;
    const DISTINCT = 10_000;
    for (let i = 0; i < DISTINCT; i++) {
      rasterText('Próximo trem', PX); // rótulo fixo redesenhado a cada quadro
      rasterText(`${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}#${i}`, PX);
    }
    // Sem o LRU: o `clear()` a cada 256 entradas re-rasterizava o rótulo fixo ~78×.
    expect(rasteredClock).toBe(1);
    expect(rasters).toBe(DISTINCT + 1);
    const { bytes, entries } = maskCacheSize();
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(MASK_CACHE_MAX_BYTES);
    expect(entries).toBeLessThan(DISTINCT);
  });
});

describe('dom-lite: innerHTML monta elementos (canvases de template)', () => {
  it('<canvas> de innerHTML vira canvas 2D achado por getElementById', () => {
    installDomLite();
    installCanvas2d();
    const host = document.createElement('div');
    host.innerHTML = '<style>#radar { width: 180px; } </style><canvas id="radar" width="180" height="90"></canvas><div class="x"><canvas id="map"></canvas></div>';
    document.body.append(...Array.from(host.childNodes));
    const radar = document.getElementById('radar') as HTMLCanvasElement;
    expect(radar).toBeInstanceOf(HTMLCanvasElement);
    expect([radar.width, radar.height]).toEqual([180, 90]);
    expect(radar.getContext('2d')).not.toBeNull();
    expect((document.getElementById('map') as HTMLCanvasElement).width).toBe(300);
    expect(host.childNodes.length).toBe(3);
  });
});

describe('clip repetido reaproveita a máscara (ADR-0315)', () => {
  it('mesmo caminho em quadros seguidos → mesma máscara; caminho diferente → máscara nova, resultado certo', () => {
    const { c, g } = canvas(20, 20);
    const draw = (r: number): void => {
      g.clearRect(0, 0, 20, 20);
      g.save();
      g.beginPath();
      g.rect(0, 0, r, 20);
      g.clip();
      g.fillStyle = '#ff0000';
      g.fillRect(0, 0, 20, 20);
      g.restore();
    };
    draw(10);
    expect(px(c, 5, 5)[3]).toBe(255);
    expect(px(c, 15, 5)[3]).toBe(0);
    draw(10);
    expect(px(c, 15, 5)[3]).toBe(0);
    draw(18); // caminho mudou: a máscara antiga não serve
    expect(px(c, 15, 5)[3]).toBe(255);
  });
});
