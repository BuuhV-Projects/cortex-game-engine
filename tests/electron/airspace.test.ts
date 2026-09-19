/**
 * Testes do portão de airspace do preview nativo (electron/renderer/airspace.ts,
 * SPEC-0211): a janela do host é owned e fica acima de todo o DOM, então menus,
 * modais e o overlay de drop só aparecem com ela escondida.
 *
 * O que o portão precisa garantir: mensagem no canal só na TRANSIÇÃO, e o host
 * não reaparece enquanto qualquer fonte ainda estiver segurando o palco.
 */
import { describe, it, expect } from 'vitest';
import { AirspaceGate } from '../../electron/renderer/airspace.js';

describe('AirspaceGate', () => {
  it('esconde na primeira fonte e mostra quando a última solta', () => {
    const gate = new AirspaceGate();

    expect(gate.blocked).toBe(false);
    expect(gate.set('menu', true)).toBe(false);
    expect(gate.blocked).toBe(true);
    expect(gate.set('menu', false)).toBe(true);
    expect(gate.blocked).toBe(false);
  });

  it('não repete mensagem quando outra fonte entra com o palco já tomado', () => {
    const gate = new AirspaceGate();
    gate.set('menu', true);

    expect(gate.set('dialog', true)).toBeNull();
    expect(gate.set('asset-drag', true)).toBeNull();
  });

  it('segura o host escondido enquanto sobrar alguma fonte', () => {
    const gate = new AirspaceGate();
    gate.set('menu', true);
    gate.set('asset-drag', true);

    // O menu fecha primeiro, mas o arraste continua: o host NÃO pode voltar,
    // senão ele cobre o overlay de drop no meio do gesto.
    expect(gate.set('menu', false)).toBeNull();
    expect(gate.blocked).toBe(true);
    expect(gate.set('asset-drag', false)).toBe(true);
  });

  it('solta fora de ordem sem se perder', () => {
    const gate = new AirspaceGate();
    gate.set('a', true);
    gate.set('b', true);
    gate.set('c', true);

    expect(gate.set('b', false)).toBeNull();
    expect(gate.set('a', false)).toBeNull();
    expect(gate.set('c', false)).toBe(true);
  });

  it('registrar a mesma fonte duas vezes conta uma só', () => {
    const gate = new AirspaceGate();

    expect(gate.set('menu', true)).toBe(false);
    expect(gate.set('menu', true)).toBeNull();
    // Uma única soltura basta — não fica um registro fantasma segurando o palco.
    expect(gate.set('menu', false)).toBe(true);
  });

  it('soltar uma fonte que nunca entrou não muda nada', () => {
    const gate = new AirspaceGate();

    expect(gate.set('fantasma', false)).toBeNull();
    expect(gate.blocked).toBe(false);
  });

  it('clear solta tudo de uma vez (fim da sessão de preview)', () => {
    const gate = new AirspaceGate();
    gate.set('menu', true);
    gate.set('dialog', true);

    expect(gate.clear()).toBe(true);
    expect(gate.blocked).toBe(false);
    expect(gate.sources).toEqual([]);
    // Portão limpo: o clear seguinte não tem o que revelar.
    expect(gate.clear()).toBeNull();
  });

  it('lista as fontes em ordem de registro (diagnóstico)', () => {
    const gate = new AirspaceGate();
    gate.set('menu', true);
    gate.set('dialog', true);

    expect(gate.sources).toEqual(['menu', 'dialog']);
  });
});
