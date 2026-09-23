/**
 * Reúso da textura de texto do HUD (SPEC-0248).
 *
 * O caminho antigo refazia textura E material a cada mudança de texto. Num HUD
 * de corrida isso é uma vez por frame por label — o cronômetro muda todo frame
 * por definição. E material novo é chave de cache nova no `Pipelines` do
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

/** Bitmap onde cada linha leva um byte próprio — assim a orientação da cópia
 * fica legível na saída, em vez de virar um blob indistinguível. */
function gradientBitmap(width: number, height: number, base: number) {
  const rgba = new ArrayBuffer(width * height * 4);
  const bytes = new Uint8Array(rgba);
  for (let row = 0; row < height; row++) {
    bytes.fill(base + row, row * width * 4, (row + 1) * width * 4);
  }
  return { width, height, rgba };
}

interface SpiedVisual {
  texture?: { image: { width: number; height: number; data: Uint8Array }; version: number };
  text?: { material: unknown; visible: boolean };
}

function visualOf(backend: RendererUiBackend, id: number): SpiedVisual | undefined {
  return (backend as unknown as { _visuals: Map<number, SpiedVisual> })._visuals.get(id);
}

/** Instala o raster nativo mockado e devolve o registro das chamadas. */
function installRaster(plans: { width: number; height: number; base: number }[]) {
  const calls: string[] = [];
  let index = 0;
  (globalThis as Record<string, unknown>)['__cortexRasterText'] = (value: string) => {
    calls.push(value);
    const plan = plans[Math.min(index++, plans.length - 1)]!;
    return gradientBitmap(plan.width, plan.height, plan.base);
  };
  return calls;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['__cortexRasterText'];
});

describe('RendererUiBackend — reúso da textura de texto', () => {
  it('mesmas dimensões: mantém a MESMA textura e o MESMO material', () => {
    installRaster([
      { width: 8, height: 4, base: 10 },
      { width: 8, height: 4, base: 100 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: '1:23.45', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    const before = visualOf(backend, label.id)!;
    const textureBefore = before.texture;
    const materialBefore = before.text?.material;

    // `set` e não atribuição direta: o `sync` só reprocessa widget sujo, e um
    // teste que mexesse no campo cru passaria sem exercitar nada.
    label.set({ text: '1:23.46' });
    backend.sync([label], VIEWPORT);
    const after = visualOf(backend, label.id)!;

    expect(after.texture).toBe(textureBefore);
    expect(after.text?.material).toBe(materialBefore);
  });

  it('reúso REESCREVE os pixels — texto novo, não o anterior', () => {
    installRaster([
      { width: 8, height: 4, base: 10 },
      { width: 8, height: 4, base: 100 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: '120 km/h', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    const texture = visualOf(backend, label.id)!.texture!;
    // A primeira linha do bitmap vai para a ÚLTIMA do destino (flip vertical).
    expect(texture.image.data[3 * 8 * 4]).toBe(10);
    const versionBefore = texture.version;

    label.set({ text: '121 km/h' });
    backend.sync([label], VIEWPORT);

    expect(texture.image.data[3 * 8 * 4]).toBe(100);
    // `needsUpdate` no three é setter SEM getter — lê-lo devolve undefined.
    // Quem prova que o upload vai ser refeito é o `version`, que o setter
    // incrementa. Sem isto o reúso escreveria na RAM e a GPU nunca saberia.
    expect(texture.version).toBeGreaterThan(versionBefore);
  });

  it('reúso preserva a inversão de linhas (senão o texto sai de cabeça para baixo)', () => {
    installRaster([
      { width: 8, height: 4, base: 10 },
      { width: 8, height: 4, base: 200 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: 'a', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    label.set({ text: 'b' });
    backend.sync([label], VIEWPORT);
    const pixels = visualOf(backend, label.id)!.texture!.image.data;
    const rowByte = (row: number) => pixels[row * 8 * 4];
    // Origem 200,201,202,203 (topo para a base) precisa chegar invertida.
    expect([rowByte(0), rowByte(1), rowByte(2), rowByte(3)]).toEqual([203, 202, 201, 200]);
  });

  it('dimensões diferentes: cai no caminho antigo e troca textura e material', () => {
    installRaster([
      { width: 8, height: 4, base: 10 },
      { width: 12, height: 4, base: 100 },
    ]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: '9', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    const textureBefore = visualOf(backend, label.id)!.texture;
    const materialBefore = visualOf(backend, label.id)!.text?.material;

    label.set({ text: '10' });
    backend.sync([label], VIEWPORT);
    const after = visualOf(backend, label.id)!;

    expect(after.texture).not.toBe(textureBefore);
    expect(after.text?.material).not.toBe(materialBefore);
    expect(after.texture?.image.width).toBe(12);
  });

  it('texto inalterado não chama o raster de novo', () => {
    const calls = installRaster([{ width: 8, height: 4, base: 10 }]);
    const backend = new RendererUiBackend(mockTarget());
    const label = new UiLabel({ text: 'LAP 1/3', fontSize: 18 });
    backend.sync([label], VIEWPORT);
    backend.sync([label], VIEWPORT);
    backend.sync([label], VIEWPORT);
    expect(calls).toEqual(['LAP 1/3']);
  });
});
