/**
 * Testes unitários para DialogueRunner (src/dialogue/DialogueRunner.ts)
 * Cobre: percurso, escolhas, requires (filtro), set (flags), give (pista),
 * efeitos de entrada de nó, advance de linha simples, término. Referência: ADR-0070.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseDialogueGraph } from '../../src/dialogue/DialogueGraph.js';
import { DialogueRunner } from '../../src/dialogue/DialogueRunner.js';
import { StoryState } from '../../src/narrative/StoryState.js';

const graph = parseDialogueGraph({
  id: 'caso-001-marlene',
  start: 'intro',
  nodes: [
    {
      id: 'intro',
      speaker: 'Marlene',
      text: 'Você acredita em mim?',
      choices: [
        { text: 'Acredito. Me conta.', next: 'conta', set: { ouviu_marlene: true } },
        { text: 'Prove primeiro.', next: 'prova' },
        // Só aparece depois de ouvir a Marlene (requires).
        { text: 'Sobre a feira...', next: 'feira', requires: ['ouviu_marlene'] },
      ],
    },
    { id: 'prova', speaker: 'Marlene', text: 'Eu sou a mãe dele!', next: 'intro' },
    {
      id: 'conta',
      speaker: 'Marlene',
      text: 'Ele foi pra feira fazer perguntas.',
      give: 'pista_feira',
      next: null,
    },
    { id: 'feira', speaker: 'Marlene', text: 'A feira central.', next: null },
  ],
});

describe('DialogueRunner', () => {
  it('start entrega o nó inicial com as escolhas visíveis', () => {
    const r = new DialogueRunner(graph);
    const v = r.start();
    expect(v.nodeId).toBe('intro');
    expect(v.speaker).toBe('Marlene');
    expect(v.isLine).toBe(false);
    // A 3ª opção (requires ouviu_marlene) ainda não aparece.
    expect(v.choices.map((c) => c.text)).toEqual(['Acredito. Me conta.', 'Prove primeiro.']);
  });

  it('escolher aplica set no StoryState e concede give via onClue', () => {
    const story = new StoryState();
    const onClue = vi.fn();
    const r = new DialogueRunner(graph, { story, onClue });
    r.start();
    const v = r.choose(0); // "Acredito" → set ouviu_marlene, vai p/ conta (give pista_feira)
    expect(story.has('ouviu_marlene')).toBe(true);
    expect(onClue).toHaveBeenCalledWith('pista_feira');
    expect(v.nodeId).toBe('conta');
    expect(v.isLine).toBe(true);
  });

  it('requires revela a escolha só quando a flag está ligada', () => {
    const r = new DialogueRunner(graph);
    r.start();
    r.choose(1); // "Prove primeiro" → prova
    const back = r.advance(); // prova é linha simples → volta p/ intro
    expect(back.nodeId).toBe('intro');
    // Agora ouviu_marlene NÃO foi setada (escolha 0 não foi feita), então a 3ª segue oculta
    expect(back.choices).toHaveLength(2);
  });

  it('a escolha condicional aparece após setar a flag, com índice original preservado', () => {
    const r = new DialogueRunner(graph);
    r.start();
    r.choose(0); // seta ouviu_marlene, vai p/ conta
    r.advance(); // conta encerra... então recomeçamos pra ver a intro com a flag ligada
    const r2 = new DialogueRunner(graph, { story: r.story });
    const v = r2.start();
    expect(v.choices).toHaveLength(3);
    // índice original da 3ª opção é 2 (preservado mesmo após filtro)
    expect(v.choices[2]).toEqual({ text: 'Sobre a feira...', index: 2 });
  });

  it('advance percorre linha simples e encerra (done) no next nulo', () => {
    const r = new DialogueRunner(graph);
    r.start();
    r.choose(0); // → conta (linha simples, next null)
    const end = r.advance();
    expect(r.done).toBe(true);
    expect(end.text).toBe('');
  });

  it('efeito de entrada de nó (give) dispara uma vez ao entrar', () => {
    const onClue = vi.fn();
    const r = new DialogueRunner(graph, { onClue });
    r.start();
    r.choose(0); // entra em "conta" → give pista_feira (entrada)
    expect(onClue).toHaveBeenCalledTimes(1);
    expect(onClue).toHaveBeenCalledWith('pista_feira');
  });

  it('choose num índice inválido lança', () => {
    const r = new DialogueRunner(graph);
    r.start();
    expect(() => r.choose(9)).toThrow();
  });

  it('advance num nó com escolhas lança (deve usar choose)', () => {
    const r = new DialogueRunner(graph);
    r.start();
    expect(() => r.advance()).toThrow(/choose/);
  });

  it('current antes de start lança', () => {
    const r = new DialogueRunner(graph);
    expect(() => r.current()).toThrow();
  });
});
