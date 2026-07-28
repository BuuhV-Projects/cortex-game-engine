/**
 * Testes do formato de binding (src/input/bindings.ts) — ADR-0164.
 * Cobre parse/serialize (roundtrip), tokens de tecla, entradas inválidas,
 * comparação e rótulos legíveis.
 */

import { describe, it, expect } from 'vitest';
import {
  bindingLabel,
  formatBinding,
  formatBindingList,
  isGamepadBinding,
  isKeyboardBinding,
  normalizeKey,
  parseBinding,
  parseBindingList,
  sameBinding,
} from '../../src/input/bindings.js';

describe('parseBinding / formatBinding', () => {
  it('faz roundtrip das quatro origens', () => {
    for (const text of ['key:w', 'key:Shift', 'pad:0', 'pad:15', 'axis:1-', 'axis:2+', 'mouse:2']) {
      const binding = parseBinding(text);
      expect(binding, text).not.toBeNull();
      expect(formatBinding(binding!)).toBe(text);
    }
  });

  it('tecla com caractere que colide com o formato usa token nomeado', () => {
    expect(parseBinding('key:Space')).toEqual({ source: 'key', key: ' ' });
    expect(formatBinding({ source: 'key', key: ' ' })).toBe('key:Space');
    expect(parseBinding('key:Comma')).toEqual({ source: 'key', key: ',' });
    expect(formatBinding({ source: 'key', key: ',' })).toBe('key:Comma');
  });

  it('normaliza letra maiúscula (Shift segurado não cria binding diferente)', () => {
    expect(parseBinding('key:W')).toEqual({ source: 'key', key: 'w' });
    expect(normalizeKey('W')).toBe('w');
    expect(normalizeKey('ArrowLeft')).toBe('ArrowLeft');
  });

  it('eixo carrega o sentido', () => {
    expect(parseBinding('axis:3-')).toEqual({ source: 'axis', index: 3, sign: -1 });
    expect(parseBinding('axis:0+')).toEqual({ source: 'axis', index: 0, sign: 1 });
  });

  it('entrada malformada vira null (config.ini é editável à mão)', () => {
    for (const text of ['', 'w', 'key', 'key:', 'pad:x', 'pad:-1', 'pad:999', 'axis:1', 'axis:x+', 'joy:0']) {
      expect(parseBinding(text), text).toBeNull();
    }
  });
});

describe('listas', () => {
  it('parseia lista separada por vírgula e descarta o que não vale', () => {
    expect(parseBindingList('key:Space,lixo,pad:0')).toEqual([
      { source: 'key', key: ' ' },
      { source: 'pad', index: 0 },
    ]);
  });

  it('lista vazia serializa vazio e volta vazia (ação sem comando)', () => {
    expect(formatBindingList([])).toBe('');
    expect(parseBindingList('')).toEqual([]);
  });

  it('roundtrip de lista', () => {
    const text = 'key:w,key:ArrowUp,axis:1-';
    expect(formatBindingList(parseBindingList(text))).toBe(text);
  });
});

describe('sameBinding / famílias', () => {
  it('compara pela origem física (tecla é case-insensitive)', () => {
    expect(sameBinding({ source: 'key', key: 'w' }, { source: 'key', key: 'W' })).toBe(true);
    expect(sameBinding({ source: 'pad', index: 0 }, { source: 'pad', index: 0 })).toBe(true);
    expect(sameBinding({ source: 'pad', index: 0 }, { source: 'mouse', index: 0 })).toBe(false);
    expect(
      sameBinding({ source: 'axis', index: 1, sign: -1 }, { source: 'axis', index: 1, sign: 1 }),
    ).toBe(false);
  });

  it('separa as colunas teclado/mouse e gamepad da tela de Controles', () => {
    expect(isKeyboardBinding({ source: 'key', key: 'w' })).toBe(true);
    expect(isKeyboardBinding({ source: 'mouse', index: 0 })).toBe(true);
    expect(isKeyboardBinding({ source: 'pad', index: 0 })).toBe(false);
    expect(isGamepadBinding({ source: 'axis', index: 1, sign: -1 })).toBe(true);
    expect(isGamepadBinding({ source: 'key', key: 'w' })).toBe(false);
  });
});

describe('bindingLabel', () => {
  it('usa nomes que a fonte do console rasteriza (sem emoji)', () => {
    expect(bindingLabel({ source: 'key', key: ' ' })).toBe('Espaço');
    expect(bindingLabel({ source: 'key', key: 'w' })).toBe('W');
    expect(bindingLabel({ source: 'key', key: 'ArrowUp' })).toBe('Seta cima');
    expect(bindingLabel({ source: 'pad', index: 0 })).toBe('A');
    expect(bindingLabel({ source: 'pad', index: 7 })).toBe('RT');
    expect(bindingLabel({ source: 'pad', index: 13 })).toBe('D-pad baixo');
    expect(bindingLabel({ source: 'axis', index: 1, sign: -1 })).toBe('Stick esq. cima');
    expect(bindingLabel({ source: 'axis', index: 2, sign: 1 })).toBe('Stick dir. dir.');
    expect(bindingLabel({ source: 'mouse', index: 2 })).toBe('Mouse dir.');
  });

  it('índice sem nome cai num rótulo genérico (controle genérico com botões extras)', () => {
    expect(bindingLabel({ source: 'pad', index: 42 })).toBe('Botão 42');
    expect(bindingLabel({ source: 'axis', index: 6, sign: 1 })).toBe('Eixo 6+');
  });
});
