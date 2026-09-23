/**
 * Lógica pura do comparador de paridade visual (SPEC-0240, passo 1).
 *
 * O que estes testes existem para impedir é um modo de falha específico e já
 * ocorrido nesta série: um comparador que responde "igual" a tudo passa
 * despercebido, porque a saída esperada do caso feliz é exatamente "igual".
 * Por isso a maior parte daqui injeta diferenças de tamanho CONHECIDO e exige
 * que o número saia certo.
 *
 * A captura em si (GPU, readback) não é testável sem placa — ela é validada à
 * mão, com a rodada registrada na SPEC-0240.
 */
import { describe, it, expect } from 'vitest';
import { compareFrames } from '../../native/scripts/render-parity.mjs';

const CANAIS = 4; // RGBA
const LARGURA = 4;
const ALTURA = 4;
const PIXELS = LARGURA * ALTURA;
/** Cinza neutro de fundo: longe de 0 e de 255, para caber delta nos dois sentidos. */
const FUNDO = 128;

/** Quadro uniforme, no formato que `compareFrames` espera. */
function quadro(nome: string, valor = FUNDO) {
  const buffer = Buffer.alloc(PIXELS * CANAIS, valor);
  // Alfa opaco, como a swapchain entrega.
  for (let i = 0; i < PIXELS; i++) buffer[i * CANAIS + 3] = 255;
  return { path: nome, width: LARGURA, height: ALTURA, buffer };
}

/** Soma `delta` ao canal `canal` do pixel (x, y). */
function mexe(q: ReturnType<typeof quadro>, x: number, y: number, canal: number, delta: number) {
  const offset = (y * LARGURA + x) * CANAIS + canal;
  q.buffer[offset] += delta;
}

describe('compareFrames', () => {
  it('dá zero para quadros idênticos', () => {
    const r = compareFrames(quadro('a'), quadro('b'));
    expect(r.maxChannelDiff).toBe(0);
    expect(r.pctPixelsAboveNoiseFloor).toBe(0);
  });

  it('acusa um único pixel alterado, com o delta exato e a coordenada certa', () => {
    const b = quadro('b');
    mexe(b, 2, 1, 0, 7);
    const r = compareFrames(quadro('a'), b);
    expect(r.maxChannelDiff).toBe(7);
    expect(r.worstPixel).toMatchObject({ x: 2, y: 1 });
    // 1 pixel de 16 acima do piso 0.
    expect(r.pctPixelsAboveNoiseFloor).toBeCloseTo((1 / PIXELS) * 100, 6);
  });

  it('enxerga diferença de 1 no canal — o menor erro representável', () => {
    const b = quadro('b');
    mexe(b, 0, 0, 1, 1);
    const r = compareFrames(quadro('a'), b);
    expect(r.maxChannelDiff).toBe(1);
    expect(r.pctPixelsAboveNoiseFloor).toBeGreaterThan(0);
  });

  it('o piso de ruído silencia o que está abaixo dele, e só isso', () => {
    const b = quadro('b');
    mexe(b, 0, 0, 0, 2); // abaixo do piso 3
    mexe(b, 1, 0, 0, 3); // igual ao piso 3 — "excede" é estrito
    mexe(b, 2, 0, 0, 4); // acima do piso
    const r = compareFrames(quadro('a'), b, 3);
    expect(r.maxChannelDiff).toBe(4); // o máximo ignora o piso, por desenho
    expect(r.pctPixelsAboveNoiseFloor).toBeCloseTo((1 / PIXELS) * 100, 6);
  });

  it('erro concentrado e ruído espalhado se distinguem pelo histograma', () => {
    const concentrado = quadro('concentrado');
    mexe(concentrado, 0, 0, 0, 120);
    const espalhado = quadro('espalhado');
    for (let i = 0; i < PIXELS; i++) mexe(espalhado, i % LARGURA, Math.floor(i / LARGURA), 0, 5);

    const rc = compareFrames(quadro('base'), concentrado);
    const re = compareFrames(quadro('base'), espalhado);

    // Mesma tela, leituras opostas: um tem pico alto em pouquíssimos pixels,
    // o outro tem todos os pixels na primeira faixa. É essa separação que
    // dirige a hipótese de diagnóstico sem abrir a imagem.
    expect(rc.maxChannelDiff).toBe(120);
    expect(rc.histogram[3].count).toBe(1); // faixa [96, 127]
    expect(re.maxChannelDiff).toBe(5);
    expect(re.histogram[0].count).toBe(PIXELS);
    expect(re.histogram[3].count).toBe(0);
  });

  it('recusa quadros de dimensões diferentes em vez de comparar lixo', () => {
    const a = quadro('a');
    const b = { ...quadro('b'), width: LARGURA * 2, height: ALTURA / 2 };
    expect(() => compareFrames(a, b)).toThrow(/dimens/i);
  });
});
