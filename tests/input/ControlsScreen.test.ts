/**
 * Testes da tela de Controles (src/input/ControlsScreen.ts) — SPEC-0165.
 * Cobre a montagem da lista, a captura de tecla numa célula, a persistência do
 * remapeamento, o "restaurar padrão", a suspensão da navegação durante a
 * captura e a limpeza dos widgets ao sair.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { showControlsScreen } from '../../src/input/ControlsScreen.js';
import { InputActions, type ActionConfigStore } from '../../src/input/InputActions.js';
import type { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import { UiButton, type UiWidget } from '../../src/ui/runtime/widgets.js';
import type { InputManager } from '../../src/core/InputManager.js';

// ─── Ambiente mínimo ──────────────────────────────────────────────────────────

function fakeWindow(): { dispatch(type: string, event: Record<string, unknown>): void } {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  vi.stubGlobal('window', {
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
  });
  return {
    dispatch(type, event) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
  };
}

/** UiLayer fake: o que a tela usa (add/remove/focus/setInputEnabled/update/render). */
function fakeUi(): UiLayer & { _widgets: UiWidget[]; _focused: UiButton | null; _inputEnabled: boolean } {
  const widgets: UiWidget[] = [];
  const ui = {
    _widgets: widgets,
    _focused: null as UiButton | null,
    _inputEnabled: true,
    add: <T extends UiWidget>(w: T): T => {
      widgets.push(w);
      return w;
    },
    remove: (w: UiWidget): void => {
      const i = widgets.indexOf(w);
      if (i >= 0) widgets.splice(i, 1);
    },
    focus(button: UiButton | null): void {
      this._focused = button;
    },
    get focused(): UiButton | null {
      return this._focused;
    },
    setInputEnabled(enabled: boolean): void {
      this._inputEnabled = enabled;
    },
    update: (): void => {},
    render: (): void => {},
  };
  return ui as unknown as UiLayer & { _widgets: UiWidget[]; _focused: UiButton | null; _inputEnabled: boolean };
}

class FakeInput {
  readonly keys = new Set<string>();
  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }
  isButtonDown(): boolean {
    return false;
  }
}

class FakeConfig implements ActionConfigStore {
  readonly values = new Map<string, string>();
  saves = 0;
  get(key: string, fallback = ''): string {
    return this.values.get(key) ?? fallback;
  }
  has(key: string): boolean {
    return this.values.has(key);
  }
  set(key: string, value: string | number | boolean): void {
    this.values.set(key, String(value));
  }
  delete(key: string): void {
    this.values.delete(key);
  }
  async save(): Promise<boolean> {
    this.saves++;
    return true;
  }
}

/** Botão cujo texto (rótulo do binding) contém `label`. */
function buttonWithText(ui: { _widgets: UiWidget[] }, label: string): UiButton | undefined {
  return ui._widgets.find(
    (w): w is UiButton => w instanceof UiButton && w.text === label,
  );
}

afterEach(() => vi.unstubAllGlobals());

function open(config?: FakeConfig) {
  const win = fakeWindow();
  // Sem rAF real: a tela não deve depender do loop pra montar/reagir.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  const ui = fakeUi();
  const input = new FakeInput();
  const actions = new InputActions(input as unknown as InputManager);
  const promise = showControlsScreen({ ui }, actions, {
    config,
    groups: ['action'],
    driveUi: false,
  });
  return { win, ui, actions, promise };
}

describe('montagem', () => {
  it('cria uma linha por ação do grupo com os bindings de fábrica', async () => {
    const { ui, promise, win } = open();
    // Pular = Espaço (teclado) e A (controle).
    expect(buttonWithText(ui, 'Espaço')).toBeDefined();
    expect(buttonWithText(ui, 'A')).toBeDefined();
    expect(buttonWithText(ui, 'Shift')).toBeDefined();
    expect(buttonWithText(ui, 'RT')).toBeDefined();
    win.dispatch('keydown', { key: 'Escape' });
    await promise;
  });

  it('Esc fecha a tela e remove todos os widgets', async () => {
    const { ui, win, promise } = open();
    expect(ui._widgets.length).toBeGreaterThan(0);
    win.dispatch('keydown', { key: 'Escape' });
    await promise;
    expect(ui._widgets.length).toBe(0);
  });
});

describe('captura e remapeamento', () => {
  it('ativar a célula do teclado e apertar uma tecla troca o binding e persiste', async () => {
    const config = new FakeConfig();
    const { ui, win, actions, promise } = open(config);

    const cell = buttonWithText(ui, 'Espaço')!;
    cell.onPress!(); // entra em captura
    await Promise.resolve();
    expect(cell.text).toBe('Pressione...');
    expect(ui._inputEnabled).toBe(false); // navegação suspensa

    win.dispatch('keydown', { key: 'j' });
    await Promise.resolve();
    await Promise.resolve();

    expect(ui._inputEnabled).toBe(true);
    expect(actions.bindingsOf('jump').some((b) => b.key === 'j')).toBe(true);
    // Coluna do controle preservada (A continua no pulo).
    expect(actions.bindingsOf('jump').some((b) => b.source === 'pad' && b.index === 0)).toBe(true);
    expect(config.get('input.jump')).toBe('key:j,pad:0');
    expect(config.saves).toBeGreaterThan(0);

    win.dispatch('keydown', { key: 'Escape' });
    await promise;
  });

  it('Esc durante a captura cancela sem mexer no binding (e não fecha a tela)', async () => {
    const { ui, win, actions, promise } = open();
    const cell = buttonWithText(ui, 'Espaço')!;
    cell.onPress!();
    await Promise.resolve();

    win.dispatch('keydown', { key: 'Escape' });
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.isDefault('jump')).toBe(true);
    expect(cell.text).toBe('Espaço');
    expect(ui._widgets.length).toBeGreaterThan(0); // continua aberta

    win.dispatch('keydown', { key: 'Escape' });
    await promise;
  });

  it('restaurar padrão volta tudo e limpa o arquivo', async () => {
    const config = new FakeConfig();
    const { ui, win, actions, promise } = open(config);
    actions.setBindings('jump', []);
    const reset = ui._widgets.find(
      (w): w is UiButton => w instanceof UiButton && w.text === 'Restaurar padrão',
    )!;
    reset.onPress!();
    expect(actions.isDefault('jump')).toBe(true);

    win.dispatch('keydown', { key: 'Escape' }); // fechar persiste
    await promise;
    expect(config.has('input.jump')).toBe(false);
  });
});
