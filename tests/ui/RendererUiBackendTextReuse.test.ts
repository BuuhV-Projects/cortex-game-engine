/**
 * Reúso da textura de texto do HUD (SPEC-0248).
 *
 * O caminho antigo refazia textura E material a cada mudança de texto. Num HUD
 * de corrida isso é uma vez por frame por label — o cronômetro muda todo frame
 * por definição. Material novo é ainda chave de cache nova no `Pipelines` do
 * `three`.
 *
 * O reúso vale quando as dimensões batem, que é o caso dominante: dígitos
 * tabulares fazem `1:23.45` e `1:23.46` ocuparem exatamente os mesmos pixels.
 *
 * O modo de falha que estes testes existem para pegar é SILENCIOSO: um reúso
 * que não reescreva os pixels não quebra nada — só mostra o texto anterior para
 * sempre. Por isso não basta afirmar que a textura foi reaproveitada; é preciso
 * afirmar que o CONTEÚDO dela mudou, e na orientação certa.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { RendererUiBackend, type UiRenderTarget } from '../../src/ui/runtime/RendererUiBackend.js';
import { UiLabel } from '../../src/ui/runtime/widgets.js';

const mockTarget = (): UiRenderTarget => ({ renderViewport: () => {} });
const VIEWPORT = { width: 800, height: 600 };

/** Bitmap onde cada linha é preenchida com um byte próprio — a orientação da
 * cópia fica legível na saída, em vez de virar um blob indistinguível. */
function bitmapDegrade(width: number, height: number, base: number) {
  const rgba = new ArrayBuffer(width * height * 4);
  const bytes = new Uint8Array(rgba);
  for (let row = 0; row < height; row++) {
    bytes.fill(base + row, row * width * 4, (row + 1) * width * 4);
  }
  return { width, height, rgba };
}

interface VisualEspiado {
  texture?: { image: { width: number; height: number; data: Uint8Array }; version: number };
  text?: { material: unknown; visible: boolean };
}

function visualOf(backend: RendererUiBackend, id: number): VisualEspiado | undefined {
  return (backend as unknown as { _visuals: Map<number, VisualEspiado> })._visuals.get(id);
}

/** Instala o raster nativo mockado e devolve o contador de chamadas. */
function instalarRaster(planos: { width: number; height: number; base: number }[]) {
  const chamadas: string[] = [];
  let i = 0;
  (globalThis as Record<string, unknown>)['__cortexRasterText'] = (texto: string) => {
    chamadas.push(texto);
    const plano = planos[Math.min(i++, planos.length - 1)]!;
    return bitmapDegrade(plano.width, plano.height, plano.base);
  };
  return chamadas;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['__cortexRasterText'];
});

describe('RendererUiBackend — reúso da textura de texto', () => {
  it('mesmas dimensões: mantém a MESMA textura e o MESMO material', () => {
    instalarRaster([
      { width: 8, height: 4, base: 10 },
      { width: 8, height: 4, base: 100 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: '1:23.45', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    const primeira = visualOf(backend, label.id)!;
    const texturaAntes = primeira.texture;
    const materialAntes = primeira.text?.material;

    label.set({ text: '1:23.46' });
    backend.sync([label], VIEWPORT);
    const depois = visualOf(backend, label.id)!;

    expect(depois.texture).toBe(texturaAntes);
    expect(depois.text?.material).toBe(materialAntes);
  });

  it('reúso REESCREVE os pixels — texto novo, não o anterior', () => {
    instalarRaster([
      { width: 8, height: 4, base: 10 },
      { width: 8, height: 4, base: 100 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: '120 km/h', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    const textura = visualOf(backend, label.id)!.texture!;
    // Linha 0 do bitmap vai para a ÚLTIMA linha do destino (flip vertical).
    const ultimaLinhaAntes = textura.image.data[3 * 8 * 4];
    expect(ultimaLinhaAntes).toBe(10);
    const versaoAntes = textura.version;

    label.set({ text: '121 km/h' });
    backend.sync([label], VIEWPORT);

    expect(textura.image.data[3 * 8 * 4]).toBe(100);
    // `needsUpdate` no three é setter SEM getter — lê-lo devolve undefined.
    // Quem prova que o upload vai ser refeito é o `version`, que o setter
    // incrementa. Sem isto o reúso escreveria na RAM e a GPU nunca saberia.
    expect(textura.version).toBeGreaterThan(versaoAntes);
  });

  it('reúso preserva a inversão de linhas (senão o texto sai de cabeça para baixo)', () => {
    instalarRaster([
      { width: 8, height: 4, base: 10 },
      { width: 8, height: 4, base: 200 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: 'a', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    label.set({ text: 'b' });
    backend.sync([label], VIEWPORT);
    const dados = visualOf(backend, label.id)!.texture!.image.data;
    const linha = (n: number) => dados[n * 8 * 4];
    // origem 200,201,202,203 (topo->base) precisa chegar invertida.
    expect([linha(0), linha(1), linha(2), linha(3)]).toEqual([203, 202, 201, 200]);
  });

  it('dimensões diferentes: cai no caminho antigo e troca textura e material', () => {
    instalarRaster([
      { width: 8, height: 4, base: 10 },
      { width: 12, height: 4, base: 100 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: '9', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    const texturaAntes = visualOf(backend, label.id)!.texture;
    const materialAntes = visualOf(backend, label.id)!.text?.material;

    label.set({ text: '10' });
    backend.sync([label], VIEWPORT);
    const depois = visualOf(backend, label.id)!;

    expect(depois.texture).not.toBe(texturaAntes);
    expect(depois.text?.material).not.toBe(materialAntes);
    expect(depois.texture?.image.width).toBe(12);
  });

  it('texto inalterado não chama o raster de novo', () => {
    const chamadas = instalarRaster([{ width: 8, height: 4, base: 10 }]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: 'LAP 1/3', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    backend.sync([label], VIEWPORT);
    backend.sync([label], VIEWPORT);
    expect(chamadas).toEqual(['LAP 1/3']);
  });
});
