/**
 * Testes unitários para DialogueGraph (src/dialogue/DialogueGraph.ts)
 * Cobre: parse válido, integridade referencial (start/next), ids duplicados.
 * Referência: ADR-0070.
 */

import { describe, it, expect } from 'vitest';
import { parseDialogueGraph, indexDialogueNodes } from '../../src/dialogue/DialogueGraph.js';

const valid = {
  id: 'marlene-001',
  start: 'intro',
  nodes: [
    {
      id: 'intro',
      speaker: 'Marlene',
      text: 'Você veio por causa do Gabriel?',
      choices: [
        { text: 'Vim.', next: 'conta', set: { ouviu_marlene: true } },
        { text: 'Quem é você?', next: null },
      ],
    },
    { id: 'conta', speaker: 'Marlene', text: 'Ele foi pra feira...', give: 'pista_feira', next: null },
  ],
};

describe('parseDialogueGraph', () => {
  it('valida e devolve um grafo correto', () => {
    const g = parseDialogueGraph(valid);
    expect(g.id).toBe('marlene-001');
    expect(g.nodes).toHaveLength(2);
    expect(indexDialogueNodes(g).get('conta')?.give).toBe('pista_feira');
  });

  it('rejeita start inexistente', () => {
    expect(() => parseDialogueGraph({ ...valid, start: 'naoexiste' })).toThrow(/start/);
  });

  it('rejeita next apontando p/ nó inexistente', () => {
    const bad = {
      id: 'x',
      start: 'a',
      nodes: [{ id: 'a', text: 'oi', next: 'fantasma' }],
    };
    expect(() => parseDialogueGraph(bad)).toThrow(/inexistente/);
  });

  it('rejeita ids de nó duplicados', () => {
    const bad = {
      id: 'x',
      start: 'a',
      nodes: [
        { id: 'a', text: 'um', next: null },
        { id: 'a', text: 'dois', next: null },
      ],
    };
    expect(() => parseDialogueGraph(bad)).toThrow(/duplicados/);
  });

  it('rejeita dado estruturalmente inválido (sem nodes)', () => {
    expect(() => parseDialogueGraph({ id: 'x', start: 'a' })).toThrow();
  });
});
