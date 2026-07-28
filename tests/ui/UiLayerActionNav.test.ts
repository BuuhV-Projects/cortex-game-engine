/**
 * Navegação dos menus pelo mapa de ações (ADR-0164) — regressão do controle
 * parando de funcionar no menu.
 *
 * A armadilha: nos MENUS o `Game` está parado (quem roda o loop é a tela, que
 * chama só `ui.update`/`ui.render`), então `actions.poll()` NÃO acontece e
 * `pressed()` nunca vira true. O `UiLayer` tem que derivar a borda do próprio
 * `isDown()`, sem depender de ninguém polar por ele.
 */

import { describe, it, expect } from 'vitest';
import { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import { UiButton } from '../../src/ui/runtime/widgets.js';
import type { UiBackend } from '../../src/ui/runtime/UiBackend.js';

function fakeBackend(): UiBackend {
  return { sync: () => {}, render: () => {}, dispose: () => {} } as unknown as UiBackend;
}

/** Mapa de ações mínimo: só `isDown`, como um menu sem `poll()` enxergaria. */
function fakeActions(down: Set<string>) {
  return {
    isDown: (id: string) => down.has(id),
    /** Sempre false de propósito: ninguém chamou `poll()` (Game parado). */
    pressed: () => false,
    pollDevices: () => {},
  };
}

/**
 * Mapa que só "vê" o controle DEPOIS de `pollDevices()` — é o comportamento
 * real: o `GamepadManager` guarda um snapshot que o `Game._tick` atualiza, e no
 * menu o Game está parado.
 */
function fakeActionsNeedingPoll(down: Set<string>) {
  let visible = new Set<string>();
  return {
    isDown: (id: string) => visible.has(id),
    pressed: () => false,
    pollDevices: () => {
      visible = new Set(down);
    },
  };
}

/** Três botões empilhados. A navegação NÃO dá a volta: do último, "baixo" não move. */
function layerWithButtons(): { ui: UiLayer; top: UiButton; middle: UiButton; bottom: UiButton } {
  const ui = new UiLayer(fakeBackend(), () => ({ width: 1920, height: 1080 }));
  const top = ui.add(new UiButton({ anchor: 'center', y: -150, width: 200, height: 60, text: 'topo' }));
  const middle = ui.add(new UiButton({ anchor: 'center', y: 0, width: 200, height: 60, text: 'meio' }));
  const bottom = ui.add(new UiButton({ anchor: 'center', y: 150, width: 200, height: 60, text: 'baixo' }));
  ui.focus(top);
  return { ui, top, middle, bottom };
}

const FRAME = 1 / 60;

describe('navegação por ações sem poll externo', () => {
  it('d-pad move o foco mesmo com o Game parado (pressed() sempre false)', () => {
    const { ui, top, middle } = layerWithButtons();
    const down = new Set<string>();
    ui.useActions(fakeActions(down));

    expect(ui.focused).toBe(top);
    down.add('uiDown');
    ui.update(FRAME);
    expect(ui.focused).toBe(middle);
  });

  it('segurar não repete a cada frame (borda), mas repete depois do delay', () => {
    const { ui, middle, bottom } = layerWithButtons();
    const down = new Set<string>(['uiDown']);
    ui.useActions(fakeActions(down));

    ui.update(FRAME); // borda: topo → meio
    expect(ui.focused).toBe(middle);
    ui.update(FRAME); // ainda segurando, antes do delay: não anda
    expect(ui.focused).toBe(middle);

    // Passado o delay, o auto-repeat volta a mover (lista longa rola segurando).
    for (let i = 0; i < 40; i++) ui.update(FRAME);
    expect(ui.focused).toBe(bottom);
  });

  it('soltar e apertar de novo navega outra vez', () => {
    const { ui, middle, bottom } = layerWithButtons();
    const down = new Set<string>();
    ui.useActions(fakeActions(down));

    down.add('uiDown');
    ui.update(FRAME);
    expect(ui.focused).toBe(middle);
    down.delete('uiDown');
    ui.update(FRAME);
    down.add('uiDown');
    ui.update(FRAME); // aperto NOVO, bem antes do delay de repeat
    expect(ui.focused).toBe(bottom);
  });

  it('confirmar dispara uma vez por aperto (não repete segurando)', () => {
    const { ui, top } = layerWithButtons();
    let presses = 0;
    top.set({ onPress: () => presses++ });
    const down = new Set<string>(['uiConfirm']);
    ui.useActions(fakeActions(down));

    ui.update(FRAME);
    expect(presses).toBe(1);
    for (let i = 0; i < 60; i++) ui.update(FRAME);
    expect(presses).toBe(1); // segurar A não re-ativa o botão
  });

  it('pola os DISPOSITIVOS antes de ler — senão o gamepad fica invisível no menu', () => {
    const { ui, middle } = layerWithButtons();
    // O GamepadManager só atualiza o snapshot quando alguém pola; no menu o
    // Game está parado, então quem tem que polar é o UiLayer.
    ui.useActions(fakeActionsNeedingPoll(new Set(['uiDown'])));

    ui.update(FRAME);
    expect(ui.focused).toBe(middle);
  });

  it('navegação suspensa (captura de binding) ignora as ações', () => {
    const { ui, top } = layerWithButtons();
    const down = new Set<string>(['uiDown']);
    ui.useActions(fakeActions(down));
    ui.setInputEnabled(false);

    ui.update(FRAME);
    expect(ui.focused).toBe(top);
  });

  it('sem mapa de ações, o teclado segue navegando pela fila de teclas', () => {
    const { ui, middle } = layerWithButtons();
    // Sem useActions: caminho legado (keydown + índices fixos do gamepad).
    (ui as unknown as { _pendingKeys: string[] })._pendingKeys.push('ArrowDown');
    ui.update(FRAME);
    expect(ui.focused).toBe(middle);
  });
});
