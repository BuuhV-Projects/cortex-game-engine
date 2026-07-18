/**
 * Testes do subset CSS "DOM-lite" da UI (cores com alpha, background
 * gradiente e box-shadow duro) — os parsers que os backends usam pra manter
 * os NOMES do HTML5 sem reinventar props (pedido do usuário: quem sabe CSS
 * não deve aprender vocabulário novo).
 */
import { describe, expect, it } from 'vitest';
import {
  parseUiBackground,
  parseUiBoxShadow,
  parseUiColor,
} from '../../src/ui/runtime/uiColor.js';

describe('parseUiColor — cor CSS com alpha', () => {
  it('#rrggbb → alpha 1', () => {
    expect(parseUiColor('#ffd64a')).toEqual({ rgb: '#ffd64a', alpha: 1 });
  });

  it('#rrggbbaa → separa o alpha', () => {
    const parsed = parseUiColor('#0d2a40dd');
    expect(parsed.rgb).toBe('#0d2a40');
    expect(parsed.alpha).toBeCloseTo(0xdd / 255, 3);
  });

  it('#rgb e #rgba curtos expandem', () => {
    expect(parseUiColor('#fff')).toEqual({ rgb: '#ffffff', alpha: 1 });
    const parsed = parseUiColor('#f008');
    expect(parsed.rgb).toBe('#ff0000');
    expect(parsed.alpha).toBeCloseTo(0x88 / 255, 3);
  });

  it('rgba(r, g, b, a) do CSS', () => {
    const parsed = parseUiColor('rgba(13, 42, 64, 0.86)');
    expect(parsed.rgb).toBe('#0d2a40');
    expect(parsed.alpha).toBeCloseTo(0.86);
  });

  it('rgb(r, g, b) → alpha 1', () => {
    expect(parseUiColor('rgb(255, 255, 255)')).toEqual({ rgb: '#ffffff', alpha: 1 });
  });
});

describe('parseUiBackground — background CSS (cor ou gradiente)', () => {
  it('cor sólida', () => {
    expect(parseUiBackground('#123456')).toEqual({ from: '#123456', to: null, axis: 0 });
  });

  it('linear-gradient(180deg, ...) = vertical', () => {
    expect(parseUiBackground('linear-gradient(180deg, #ffe976, #ffbd30)')).toEqual({
      from: '#ffe976',
      to: '#ffbd30',
      axis: 0,
    });
  });

  it('linear-gradient(90deg, ...) = horizontal', () => {
    expect(parseUiBackground('linear-gradient(90deg, #ffe367, #ffb828)')).toEqual({
      from: '#ffe367',
      to: '#ffb828',
      axis: 1,
    });
  });

  it('"to right"/"to bottom" também valem', () => {
    expect(parseUiBackground('linear-gradient(to right, #a, #b)').axis).toBe(1);
    expect(parseUiBackground('linear-gradient(to bottom, #a, #b)').axis).toBe(0);
  });

  it('backgroundTo legado vira gradiente vertical', () => {
    expect(parseUiBackground('#7ed6f7', '#1e8fc4')).toEqual({
      from: '#7ed6f7',
      to: '#1e8fc4',
      axis: 0,
    });
  });
});

describe('parseUiBoxShadow — sombra dura "0 Npx 0 <cor>"', () => {
  it('decompõe deslocamento e cor', () => {
    expect(parseUiBoxShadow('0 11px 0 #bd7800')).toEqual({ offsetY: 11, color: '#bd7800' });
    expect(parseUiBoxShadow('0px 8px 0px rgba(6, 48, 123, 0.76)')).toEqual({
      offsetY: 8,
      color: 'rgba(6, 48, 123, 0.76)',
    });
  });

  it('"none" e fora do subset (blur) → null', () => {
    expect(parseUiBoxShadow('none')).toBeNull();
    expect(parseUiBoxShadow('')).toBeNull();
    expect(parseUiBoxShadow('0 2px 4px #000')).toBeNull(); // blur não é sombra dura
  });
});
