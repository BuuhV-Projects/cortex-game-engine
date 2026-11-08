/**
 * Fonte de arquivo por widget de texto (ADR-0715 / SPEC-0716).
 *
 * Cobre o registro (`loadUiFont`) nos dois caminhos — host nativo
 * (`__cortexLoadFont`) e browser (`FontFace` + `document.fonts`) —, o `font`
 * que o backend DOM aplica, o subset de CSS (`font-family`, `@font-face`), o
 * `loadUiTemplate` esperando a fonte e o backend renderer passando a família
 * pro raster. O registro é global ao módulo: cada teste usa uma família própria.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { loadUiFont, uiFontShorthand, UI_FONT_FAMILY } from '../../src/ui/runtime/uiFont.js';
import { parseUiCss } from '../../src/ui/runtime/UiStylesheet.js';
import { loadUiTemplate } from '../../src/ui/runtime/UiTemplate.js';
import { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import { RendererUiBackend, type UiRenderTarget } from '../../src/ui/runtime/RendererUiBackend.js';
import type { UiBackend } from '../../src/ui/runtime/UiBackend.js';
import { UiButton, UiLabel } from '../../src/ui/runtime/widgets.js';

const g = globalThis as Record<string, unknown>;
const GLOBALS = ['__cortexLoadFont', '__cortexRasterText', 'FontFace', 'document', 'fetch'];
const saved = new Map(GLOBALS.map((name) => [name, g[name]]));

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete g[name];
    else g[name] = value;
  }
});

/** Host nativo falso: registra as chamadas e responde `ok`. */
function installNativeLoader(ok = true): string[][] {
  const calls: string[][] = [];
  g['__cortexLoadFont'] = (family: string, url: string) => {
    calls.push([family, url]);
    return ok;
  };
  return calls;
}

function stubBackend(): UiBackend {
  return { sync: () => {}, render: () => {}, dispose: () => {} };
}

describe('loadUiFont — host nativo', () => {
  it('registra pelo __cortexLoadFont e não recarrega a mesma família', async () => {
    const calls = installNativeLoader();
    await loadUiFont('NativaA', 'assets/ui/fonts/A.ttf');
    await loadUiFont('NativaA', 'assets/ui/fonts/A.ttf');
    expect(calls).toEqual([['NativaA', 'assets/ui/fonts/A.ttf']]);
    await expect(loadUiFont('NativaA', 'assets/ui/fonts/B.ttf')).rejects.toThrow(/já registrada/);
  });

  it('rejeita quando o host não carrega e deixa tentar de novo', async () => {
    installNativeLoader(false);
    await expect(loadUiFont('NativaB', 'assets/ui/fonts/falta.ttf')).rejects.toThrow(/não carregou/);
    const calls = installNativeLoader(true);
    await loadUiFont('NativaB', 'assets/ui/fonts/falta.ttf');
    expect(calls).toHaveLength(1);
  });
});

describe('loadUiFont — browser (FontFace)', () => {
  it('carrega a face pela URL antes de adicionar ao document.fonts', async () => {
    const events: string[] = [];
    class FakeFontFace {
      constructor(
        readonly family: string,
        readonly source: string,
        readonly descriptors: { weight?: string },
      ) {
        events.push(`new ${family} ${source} ${descriptors.weight}`);
      }
      async load(): Promise<this> {
        events.push('load');
        return this;
      }
    }
    g['FontFace'] = FakeFontFace;
    g['document'] = { fonts: { add: (face: FakeFontFace) => events.push(`add ${face.family}`) } };
    await loadUiFont('Dom', 'assets/ui/fonts/Dom.ttf');
    expect(events).toEqual(['new Dom url("assets/ui/fonts/Dom.ttf") 100 900', 'load', 'add Dom']);
  });

  it('o font do DOM põe a família antes da Roboto de reserva', () => {
    expect(uiFontShorthand(22, 'Barlow')).toBe(
      `500 22px 'Barlow', '${UI_FONT_FAMILY}', system-ui, 'Segoe UI', sans-serif`,
    );
    expect(uiFontShorthand(16)).toBe(`500 16px '${UI_FONT_FAMILY}', system-ui, 'Segoe UI', sans-serif`);
  });
});

describe('CSS do subset — font-family e @font-face', () => {
  it('font-family usa a primeira família, sem aspas, em label e botão', () => {
    const sheet = parseUiCss(`.t { font-family: 'Barlow Semi', sans-serif; font-size: 22px; }`);
    const label = sheet.apply(new UiLabel(), 't');
    const button = sheet.apply(new UiButton(), 't');
    expect(label.fontFamily).toBe('Barlow Semi');
    expect(button.fontFamily).toBe('Barlow Semi');
    expect(new UiLabel().fontFamily).toBeNull();
  });

  it('@font-face vira fontFaces; propriedade fora do subset é erro', () => {
    const sheet = parseUiCss(`
      @font-face { font-family: "Hud"; src: url('assets/ui/fonts/Hud.ttf'); }
      .t { color: #fff; }`);
    expect(sheet.fontFaces).toEqual([{ family: 'Hud', url: 'assets/ui/fonts/Hud.ttf' }]);
    expect(() => parseUiCss('@font-face { font-family: X; font-weight: 600; src: url(x.ttf); }')).toThrow(
      /só aceita font-family e src/,
    );
    expect(() => parseUiCss('@font-face { font-family: X; }')).toThrow(/precisa de font-family e src/);
  });
});

describe('loadUiTemplate — espera a @font-face', () => {
  it('registra a fonte antes de montar os widgets com a família', async () => {
    const calls = installNativeLoader();
    const html = `<style>
      @font-face { font-family: 'Tpl'; src: url(assets/ui/fonts/Tpl.ttf); }
      .obj { font-family: 'Tpl'; font-size: 20px; }
    </style>
    <span id="obj" class="obj">OBJETIVO</span>`;
    g['fetch'] = async () => ({ ok: true, status: 200, text: async () => html });
    const ui = new UiLayer(stubBackend(), () => ({ width: 1280, height: 720 }));
    const tpl = await loadUiTemplate(ui, 'assets/ui/hud.html');
    expect(calls).toEqual([['Tpl', 'assets/ui/fonts/Tpl.ttf']]);
    expect((tpl.get('obj') as UiLabel).fontFamily).toBe('Tpl');
  });
});

describe('RendererUiBackend — família no raster', () => {
  it('passa a família ao __cortexRasterText e re-rasteriza quando ela muda', () => {
    const calls: unknown[][] = [];
    g['__cortexRasterText'] = (...args: unknown[]) => {
      calls.push(args);
      return { width: 4, height: 2, rgba: new ArrayBuffer(4 * 2 * 4) };
    };
    const target: UiRenderTarget = { renderViewport: () => {} };
    const backend = new RendererUiBackend(target);
    const label = new UiLabel({ text: 'HUD', fontSize: 22, fontFamily: 'Hud' });
    backend.sync([label], { width: 800, height: 600 });
    backend.sync([label], { width: 800, height: 600 });
    label.set({ fontFamily: null });
    backend.sync([label], { width: 800, height: 600 });
    expect(calls).toEqual([
      ['HUD', 22, 'ui', 'Hud'],
      ['HUD', 22, 'ui', ''],
    ]);
  });
});
