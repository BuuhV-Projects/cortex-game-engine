/**
 * Testes da camada de ações (src/input/InputActions.ts) — ADR-0164.
 * Cobre leitura (digital/analógica/eixo), bordas, remapeamento, persistência
 * no config.ini e a EQUIVALÊNCIA dos bindings de fábrica com as teclas que os
 * sistemas cravavam antes (garantia de não-regressão prometida no ADR).
 */

import { describe, it, expect } from 'vitest';
import { InputActions, type ActionConfigStore } from '../../src/input/InputActions.js';
import { ENGINE_ACTIONS } from '../../src/input/defaultActions.js';
import { formatBindingList, parseBindingList } from '../../src/input/bindings.js';
import type { InputManager } from '../../src/core/InputManager.js';
import type { GamepadManager } from '../../src/core/GamepadManager.js';

// ─── Fakes ────────────────────────────────────────────────────────────────────

class FakeInput {
  readonly keys = new Set<string>();
  readonly mouse = new Set<number>();
  isKeyDown(key: string): boolean {
    return this.keys.has(key.length === 1 ? key.toLowerCase() : key);
  }
  isButtonDown(button: number): boolean {
    return this.mouse.has(button);
  }
}

class FakePad {
  readonly buttons = new Map<number, number>();
  readonly axes = new Map<number, number>();
  connectedSlot = 0;
  isConnected(index: number): boolean {
    return index === this.connectedSlot;
  }
  firstConnectedIndex(): number {
    return this.connectedSlot;
  }
  isButtonDown(slot: number, index: number): boolean {
    return slot === this.connectedSlot && (this.buttons.get(index) ?? 0) > 0.5;
  }
  getButtonValue(slot: number, index: number): number {
    return slot === this.connectedSlot ? (this.buttons.get(index) ?? 0) : 0;
  }
  getAxis(slot: number, index: number): number {
    return slot === this.connectedSlot ? (this.axes.get(index) ?? 0) : 0;
  }
}

/** Store em memória com a mesma superfície do GameConfig. */
class FakeConfig implements ActionConfigStore {
  readonly values = new Map<string, string>();
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
}

function make(): { actions: InputActions; input: FakeInput; pad: FakePad } {
  const input = new FakeInput();
  const pad = new FakePad();
  const actions = new InputActions(
    input as unknown as InputManager,
    pad as unknown as GamepadManager,
  );
  return { actions, input, pad };
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

describe('leitura de estado', () => {
  it('tecla e botão do pad ativam a mesma ação (bindings default)', () => {
    const { actions, input, pad } = make();
    expect(actions.isDown('jump')).toBe(false);
    input.keys.add(' ');
    expect(actions.isDown('jump')).toBe(true);
    input.keys.clear();
    pad.buttons.set(0, 1);
    expect(actions.isDown('jump')).toBe(true);
  });

  it('eixo do stick vale como pressionado só acima do limiar', () => {
    const { actions, pad } = make();
    pad.axes.set(1, -0.3); // stick pra frente, fraco
    expect(actions.isDown('moveForward')).toBe(false);
    expect(actions.value('moveForward')).toBeCloseTo(0.3);
    pad.axes.set(1, -0.9);
    expect(actions.isDown('moveForward')).toBe(true);
  });

  it('value é analógico no stick, 1 na tecla e o valor do gatilho no pad', () => {
    const { actions, input, pad } = make();
    pad.axes.set(0, 0.42);
    expect(actions.value('moveRight')).toBeCloseTo(0.42);
    input.keys.add('d');
    expect(actions.value('moveRight')).toBe(1); // tecla vence (max)
    pad.buttons.set(7, 0.6); // RT analógico
    expect(actions.value('sprint')).toBeCloseTo(0.6);
  });

  it('sentido oposto do eixo não ativa a ação', () => {
    const { actions, pad } = make();
    pad.axes.set(1, 0.9); // stick pra trás
    expect(actions.value('moveForward')).toBe(0);
    expect(actions.value('moveBack')).toBeCloseTo(0.9);
  });

  it('axis() combina o par e satura em ±1', () => {
    const { actions, input, pad } = make();
    pad.axes.set(0, 0.5);
    expect(actions.axis('moveLeft', 'moveRight')).toBeCloseTo(0.5);
    input.keys.add('a');
    expect(actions.axis('moveLeft', 'moveRight')).toBeCloseTo(-0.5);
    input.keys.add('d');
    expect(actions.axis('moveLeft', 'moveRight')).toBe(0);
  });

  it('lê o PRIMEIRO slot conectado quando o preferido está vazio (pad fantasma no 0)', () => {
    const input = new FakeInput();
    const pad = new FakePad();
    pad.connectedSlot = 1; // controle real no slot 1
    const actions = new InputActions(
      input as unknown as InputManager,
      pad as unknown as GamepadManager,
    );
    pad.buttons.set(0, 1);
    expect(actions.isDown('jump')).toBe(true);
  });

  it('sem gamepad, só o teclado responde (não lança)', () => {
    const input = new FakeInput();
    const actions = new InputActions(input as unknown as InputManager);
    expect(actions.isDown('jump')).toBe(false);
    input.keys.add(' ');
    expect(actions.isDown('jump')).toBe(true);
  });
});

// ─── Bordas ───────────────────────────────────────────────────────────────────

describe('bordas (pressed/released)', () => {
  it('pressed só no frame da transição', () => {
    const { actions, input } = make();
    actions.poll();
    input.keys.add(' ');
    actions.poll();
    expect(actions.pressed('jump')).toBe(true);
    actions.poll();
    expect(actions.pressed('jump')).toBe(false); // segurando não repete
    input.keys.clear();
    actions.poll();
    expect(actions.released('jump')).toBe(true);
  });

  it('consume() evita a borda fantasma do botão herdado do menu (SPEC-0156)', () => {
    const { actions, input } = make();
    input.keys.add(' '); // A/Espaço ainda segurado ao fechar o menu
    actions.consume('jump');
    actions.poll();
    expect(actions.pressed('jump')).toBe(false);
    input.keys.clear();
    actions.poll();
    input.keys.add(' '); // agora sim, aperto novo
    actions.poll();
    expect(actions.pressed('jump')).toBe(true);
  });
});

// ─── Remapeamento ─────────────────────────────────────────────────────────────

describe('remapeamento', () => {
  it('rebind troca só a família alvo e preserva a outra coluna', () => {
    const { actions } = make();
    actions.rebind('jump', { source: 'pad', index: 3 }, (b) => b.source === 'pad' || b.source === 'axis');
    expect(formatBindingList(actions.bindingsOf('jump'))).toBe('key:Space,pad:3');
  });

  it('binding roubado sai da ação anterior (dois comandos na mesma tecla seria ambíguo)', () => {
    const { actions } = make();
    const stolen = actions.rebind(
      'sprint',
      { source: 'key', key: ' ' },
      (b) => b.source === 'key' || b.source === 'mouse',
    );
    expect(stolen).toContain('jump');
    expect(formatBindingList(actions.bindingsOf('jump'))).toBe('pad:0');
    // O novo binding ocupa a POSIÇÃO do antigo da mesma família (ordem estável).
    expect(formatBindingList(actions.bindingsOf('sprint'))).toBe('key:Space,pad:7');
  });

  it('resetToDefaults volta tudo de fábrica', () => {
    const { actions } = make();
    actions.clearBindings('jump');
    expect(actions.isDefault('jump')).toBe(false);
    expect(actions.bindingsOf('jump')).toEqual([]);
    actions.resetToDefaults();
    expect(actions.isDefault('jump')).toBe(true);
  });

  it('ação inexistente é ignorada em silêncio', () => {
    const { actions } = make();
    expect(() => actions.setBindings('naoExiste', [])).not.toThrow();
    expect(actions.rebind('naoExiste', { source: 'pad', index: 1 }, () => true)).toEqual([]);
    expect(actions.bindingsOf('naoExiste')).toEqual([]);
  });
});

// ─── Persistência ─────────────────────────────────────────────────────────────

describe('persistência no config.ini', () => {
  it('grava só o diff contra os defaults', () => {
    const { actions } = make();
    const config = new FakeConfig();
    actions.saveTo(config);
    expect(config.values.size).toBe(0); // nada mudou → arquivo limpo

    actions.setBindings('jump', parseBindingList('key:Space,pad:1'));
    actions.saveTo(config);
    expect(config.get('input.jump')).toBe('key:Space,pad:1');
    expect(config.has('input.sprint')).toBe(false);
  });

  it('volta ao default apaga a chave do arquivo', () => {
    const { actions } = make();
    const config = new FakeConfig();
    actions.setBindings('jump', parseBindingList('pad:3'));
    actions.saveTo(config);
    expect(config.has('input.jump')).toBe(true);
    actions.resetToDefaults('jump');
    actions.saveTo(config);
    expect(config.has('input.jump')).toBe(false);
  });

  it('loadFrom aplica o salvo e ignora linha malformada', () => {
    const { actions, input } = make();
    const config = new FakeConfig();
    config.set('input.jump', 'key:j');
    config.set('input.sprint', 'nada disso');
    actions.loadFrom(config);
    input.keys.add('j');
    expect(actions.isDown('jump')).toBe(true);
    input.keys.delete('j');
    input.keys.add(' ');
    expect(actions.isDown('jump')).toBe(false); // Space deixou de ser binding do pulo
    expect(actions.bindingsOf('sprint')).toEqual([]); // linha inválida = sem bindings
  });

  it('ação sem binding nenhum sobrevive ao roundtrip (não volta pro default)', () => {
    const { actions } = make();
    const config = new FakeConfig();
    actions.clearBindings('jump');
    actions.saveTo(config);
    expect(config.get('input.jump')).toBe('');

    const fresh = make().actions;
    fresh.loadFrom(config);
    expect(fresh.bindingsOf('jump')).toEqual([]);
  });

  it('override de ação do JOGO definida DEPOIS do load é preservado', () => {
    const { actions, input } = make();
    const config = new FakeConfig();
    config.set('input.plant', 'key:p');
    actions.loadFrom(config);
    actions.define({
      id: 'plant', group: 'farm', labelKey: 'input.action.plant', label: 'Plantar',
      defaults: parseBindingList('key:f'),
    });
    input.keys.add('p');
    expect(actions.isDown('plant')).toBe(true);
  });
});

// ─── Catálogo ─────────────────────────────────────────────────────────────────

describe('catálogo', () => {
  it('agrupa pra tela de Controles e esconde as ocultas', () => {
    const { actions } = make();
    expect(actions.actionsOf('move').map((a) => a.id)).toEqual([
      'moveForward', 'moveBack', 'moveLeft', 'moveRight',
    ]);
    actions.define({
      id: 'secreta', group: 'action', labelKey: 'x', label: 'x',
      defaults: [], hidden: true,
    });
    expect(actions.actionsOf('action').some((a) => a.id === 'secreta')).toBe(false);
    expect(actions.definitionOf('secreta')).toBeDefined();
  });

  it('os bindings de fábrica reproduzem as teclas que os sistemas cravavam', () => {
    const byId = new Map(ENGINE_ACTIONS.map((a) => [a.id, formatBindingList(a.defaults)]));
    // ThirdPersonControlSystem / FirstPersonCameraSystem / PlatformerInputSystem
    expect(byId.get('moveForward')).toBe('key:w,key:ArrowUp,axis:1-');
    expect(byId.get('moveLeft')).toBe('key:a,key:ArrowLeft,axis:0-');
    expect(byId.get('jump')).toBe('key:Space,pad:0');
    expect(byId.get('sprint')).toBe('key:Shift,pad:7');
    // InteractionSystem (tecla `e`, botão A)
    expect(byId.get('interact')).toBe('key:e,pad:0');
    // UiLayer (d-pad 12..15, A=0, B=1) e menus do jogo (Start=9, LB/RB=4/5)
    expect(byId.get('uiUp')).toBe('key:ArrowUp,pad:12');
    expect(byId.get('uiConfirm')).toBe('key:Enter,key:Space,pad:0');
    expect(byId.get('uiBack')).toBe('key:Escape,key:Backspace,pad:1');
    expect(byId.get('pause')).toBe('key:Escape,pad:9');
    // Q/E além dos ombros: sem teclado nelas, uma tela navegada por LB/RB fica
    // inoperável fora do controle (SPEC-0185).
    expect(byId.get('uiPrev')).toBe('key:q,pad:4');
    expect(byId.get('uiNext')).toBe('key:e,pad:5');
    // VehicleControlSystem (RT/LT)
    expect(byId.get('accelerate')).toBe('key:w,key:ArrowUp,pad:7');
    expect(byId.get('brake')).toBe('key:s,key:ArrowDown,pad:6');
  });
});
