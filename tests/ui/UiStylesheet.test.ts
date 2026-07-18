import { describe, expect, it } from 'vitest';
import { parseUiCss } from '../../src/ui/runtime/UiStylesheet.js';
import { UiButton, UiPanel } from '../../src/ui/runtime/widgets.js';

describe('UiStylesheet — CSS que compila pro subset nativo (ADR-0102)', () => {
  it('gradiente + radius + tamanho num Panel (background fica CSS puro)', () => {
    const sheet = parseUiCss(
      '.ceu { background: linear-gradient(180deg, #7ed6f7, #1e8fc4); border-radius: 12px; width: 100px; height: 40px; }',
    );
    const panel = sheet.apply(new UiPanel(), 'ceu');
    // Filosofia DOM-lite: o widget guarda o CSS como está; o backend decompõe.
    expect(panel.background).toBe('linear-gradient(180deg, #7ed6f7, #1e8fc4)');
    expect(panel.backgroundTo).toBeNull();
    expect(panel.cornerRadius).toBe(12);
    expect(panel.borderRadius).toBe(12); // alias CSS de cornerRadius
    expect(panel.width).toBe(100);
  });

  it(':focus vira focusBackground/focusBorder no Button', () => {
    const sheet = parseUiCss(
      '.card { background: #ffffff; color: #14607f; font-size: 18px; } .card:focus { background: #ffd94d; border: 4px solid #ffb300; }',
    );
    const button = sheet.apply(new UiButton(), 'card');
    expect(button.background).toBe('#ffffff');
    expect(button.focusBackground).toBe('#ffd94d');
    expect(button.focusBorderWidth).toBe(4);
    expect(button.focusBorderColor).toBe('#ffb300');
  });

  it('propriedade/valor fora do subset = erro claro na COMPILAÇÃO', () => {
    // box-shadow COM BLUR está fora do subset (só sombra dura "0 Npx 0 cor").
    expect(() => parseUiCss('.x { box-shadow: 0 2px 4px #000; }')).toThrow(/box-shadow/);
    expect(() => parseUiCss('.x { backdrop-filter: blur(2px); }')).toThrow(/backdrop-filter/);
    expect(() => parseUiCss('div { color: red; }')).toThrow(/seletor/);
  });

  it('classe inexistente = erro no apply', () => {
    const sheet = parseUiCss('.a { color: #fff; }');
    expect(() => sheet.apply(new UiButton(), 'b')).toThrow(/não definida/);
  });
});
