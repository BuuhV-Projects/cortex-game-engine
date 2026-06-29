import { describe, it, expect } from 'vitest';
import { CommandStack } from '../../src/editor/CommandStack.js';

/** Comando de teste que registra a ordem das chamadas num log compartilhado. */
function cmd(label: string, log: string[]) {
  return {
    label,
    undo: () => log.push(`undo:${label}`),
    redo: () => log.push(`redo:${label}`),
  };
}

describe('CommandStack', () => {
  it('undo/redo vazios retornam false e não quebram', () => {
    const s = new CommandStack();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    expect(s.undo()).toBe(false);
    expect(s.redo()).toBe(false);
  });

  it('push não executa; undo reverte na ordem LIFO; redo refaz', () => {
    const log: string[] = [];
    const s = new CommandStack();
    s.push(cmd('A', log));
    s.push(cmd('B', log));
    expect(log).toEqual([]); // push não chama undo/redo
    expect(s.canUndo).toBe(true);

    expect(s.undo()).toBe(true); // desfaz B (último)
    expect(s.undo()).toBe(true); // desfaz A
    expect(s.undo()).toBe(false);
    expect(log).toEqual(['undo:B', 'undo:A']);

    expect(s.redo()).toBe(true); // refaz A
    expect(s.redo()).toBe(true); // refaz B
    expect(log).toEqual(['undo:B', 'undo:A', 'redo:A', 'redo:B']);
    expect(s.canRedo).toBe(false);
  });

  it('nova ação após undo limpa o redo (estilo editor)', () => {
    const log: string[] = [];
    const s = new CommandStack();
    s.push(cmd('A', log));
    s.push(cmd('B', log));
    s.undo(); // desfaz B → redo tem [B]
    expect(s.canRedo).toBe(true);
    s.push(cmd('C', log)); // nova ação invalida o redo
    expect(s.canRedo).toBe(false);
    expect(s.redo()).toBe(false);
  });

  it('clear esvazia os dois lados', () => {
    const log: string[] = [];
    const s = new CommandStack();
    s.push(cmd('A', log));
    s.undo();
    s.clear();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
  });

  it('respeita o limite (ring): a ação mais antiga cai fora', () => {
    const log: string[] = [];
    const s = new CommandStack(2); // guarda só 2
    s.push(cmd('A', log));
    s.push(cmd('B', log));
    s.push(cmd('C', log)); // A cai fora
    expect(s.undo()).toBe(true); // C
    expect(s.undo()).toBe(true); // B
    expect(s.undo()).toBe(false); // A não está mais lá
    expect(log).toEqual(['undo:C', 'undo:B']);
  });
});
