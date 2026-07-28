/**
 * **InputActions** — a camada de ações remapeáveis (ADR-0164). Traduz o estado
 * cru do {@link InputManager} (teclado/mouse) e do {@link GamepadManager}
 * (botões/eixos) em **ações nomeadas** (`jump`, `moveForward`, `uiConfirm`),
 * cada uma com N bindings que o jogador pode trocar na tela de Controles
 * (SPEC-0165) e que persistem no `config.ini`.
 *
 * Toda ação é um booleano com valor analógico: eixo é um **par** de ações lido
 * por {@link InputActions.axis} — o stick continua analógico porque uma ação
 * bindada a eixo responde `value()` pela magnitude da deflexão.
 *
 * @example
 * const actions = new InputActions(game.input, game.gamepad);
 * await actions.loadFrom(config);         // aplica o que o jogador salvou
 * // por frame (o Game já faz isso em game.actions):
 * actions.poll();
 * const x = actions.axis('moveLeft', 'moveRight');   // -1..1, analógico
 * if (actions.pressed('jump')) body.jump();          // borda de pressão
 */
import type { InputManager } from '../core/InputManager.js';
import type { GamepadManager } from '../core/GamepadManager.js';
import {
  formatBindingList,
  parseBindingList,
  sameBinding,
  type InputBinding,
} from './bindings.js';
import { ENGINE_ACTIONS, type ActionDef } from './defaultActions.js';

/**
 * Deflexão mínima de eixo pra a ação contar como **pressionada**. Acima da
 * deadzone do {@link GamepadManager} (0.15) de propósito: com um limiar baixo,
 * encostar no stick "apertaria" o botão mapeado nele.
 */
export const AXIS_PRESS_THRESHOLD = 0.5;

/** Seção do `config.ini` onde os bindings do jogador são gravados. */
export const INPUT_CONFIG_SECTION = 'input';

/** O mínimo do {@link GameConfig} que este módulo usa (facilita teste e evita acoplamento). */
export interface ActionConfigStore {
  get(key: string, fallback?: string): string;
  has(key: string): boolean;
  set(key: string, value: string | number | boolean): void;
  delete(key: string): void;
}

export interface InputActionsOptions {
  /** Catálogo inicial. Default: {@link ENGINE_ACTIONS}. */
  actions?: readonly ActionDef[];
  /** Slot preferido do gamepad (0..3). Default 0 — com fallback pro 1º conectado. */
  padIndex?: number;
}

export class InputActions {
  private readonly _defs = new Map<string, ActionDef>();
  /** Bindings efetivos por ação (default ou o que o jogador salvou). */
  private readonly _bindings = new Map<string, InputBinding[]>();
  /**
   * Config já carregado, consultado de novo a cada {@link define} — o jogo pode
   * registrar as ações DELE depois do `loadFrom`, e sem isto o remapeamento
   * dessas ações seria perdido (não dá pra listar as chaves do INI).
   */
  private _config: ActionConfigStore | null = null;
  private readonly _down = new Map<string, boolean>();
  private readonly _prevDown = new Map<string, boolean>();
  private readonly _padIndex: number;

  constructor(
    private readonly input: InputManager,
    private readonly gamepad?: GamepadManager,
    options: InputActionsOptions = {},
  ) {
    this._padIndex = options.padIndex ?? 0;
    for (const action of options.actions ?? ENGINE_ACTIONS) this.define(action);
  }

  // ─── Catálogo ───────────────────────────────────────────────────────────────

  /**
   * Registra (ou substitui) uma ação. É assim que o JOGO declara o vocabulário
   * dele — a engine só traz o mínimo que os sistemas dela usam.
   *
   * @example
   * actions.define({ id: 'plant', group: 'farm', labelKey: 'input.action.plant',
   *                  label: 'Plantar', defaults: parseBindingList('key:f,pad:2') });
   */
  define(action: ActionDef): void {
    this._defs.set(action.id, action);
    const saved = this._savedBindings(action.id);
    if (saved) this._bindings.set(action.id, saved);
    else if (!this._bindings.has(action.id)) this._bindings.set(action.id, [...action.defaults]);
  }

  /** Todas as ações registradas, na ordem de registro. */
  get actions(): ActionDef[] {
    return [...this._defs.values()];
  }

  /** Ações de um grupo (seção da tela de Controles), sem as escondidas. */
  actionsOf(group: string): ActionDef[] {
    return this.actions.filter((a) => a.group === group && !a.hidden);
  }

  /** Definição de uma ação, ou `undefined` se não registrada. */
  definitionOf(id: string): ActionDef | undefined {
    return this._defs.get(id);
  }

  // ─── Leitura de estado ──────────────────────────────────────────────────────

  /** `true` se qualquer binding da ação estiver ativo agora. */
  isDown(id: string): boolean {
    const bindings = this._bindings.get(id);
    if (!bindings) return false;
    for (const binding of bindings) if (this._bindingDown(binding)) return true;
    return false;
  }

  /**
   * Valor analógico da ação (0..1): 1 pra tecla/botão digital, a magnitude da
   * deflexão pra eixo de stick, o valor do gatilho pra LT/RT. Pega o MAIOR
   * entre os bindings — teclado e stick convivem sem um zerar o outro.
   */
  value(id: string): number {
    const bindings = this._bindings.get(id);
    if (!bindings) return 0;
    let max = 0;
    for (const binding of bindings) {
      const v = this._bindingValue(binding);
      if (v > max) max = v;
    }
    return max;
  }

  /**
   * Eixo -1..1 a partir de um par de ações (`axis('moveLeft','moveRight')`).
   * Analógico quando a origem é stick; ±1 no teclado.
   */
  axis(negativeId: string, positiveId: string): number {
    const v = this.value(positiveId) - this.value(negativeId);
    return v > 1 ? 1 : v < -1 ? -1 : v;
  }

  /**
   * `true` no frame em que a ação foi pressionada (borda). Exige {@link poll}
   * 1×/frame — o `Game` já faz isso pro `game.actions`.
   */
  pressed(id: string): boolean {
    return (this._down.get(id) ?? false) && !(this._prevDown.get(id) ?? false);
  }

  /** `true` no frame em que a ação foi solta (borda). */
  released(id: string): boolean {
    return !(this._down.get(id) ?? false) && (this._prevDown.get(id) ?? false);
  }

  /**
   * Atualiza as bordas ({@link pressed}/{@link released}). Chame 1×/frame,
   * DEPOIS do `gamepad.poll()` — senão a borda enxerga o estado do frame anterior.
   */
  poll(): void {
    for (const id of this._defs.keys()) {
      this._prevDown.set(id, this._down.get(id) ?? false);
      this._down.set(id, this.isDown(id));
    }
  }

  /**
   * Marca a ação como já-pressionada sem que o jogador tenha apertado nada —
   * evita a "borda fantasma" quando um menu fecha com o botão ainda segurado
   * (mesmo problema do SPEC-0156). Sem id, vale pra todas.
   */
  consume(id?: string): void {
    if (id !== undefined) {
      this._prevDown.set(id, true);
      this._down.set(id, true);
      return;
    }
    for (const key of this._defs.keys()) {
      this._prevDown.set(key, true);
      this._down.set(key, true);
    }
  }

  // ─── Remapeamento ───────────────────────────────────────────────────────────

  /** Bindings atuais da ação (cópia). */
  bindingsOf(id: string): InputBinding[] {
    return [...(this._bindings.get(id) ?? [])];
  }

  /** Substitui todos os bindings da ação. */
  setBindings(id: string, bindings: readonly InputBinding[]): void {
    if (!this._defs.has(id)) return;
    this._bindings.set(id, [...bindings]);
  }

  /**
   * Aplica um binding capturado na tela de Controles: **substitui** os bindings
   * da mesma família (teclado/mouse ou gamepad) da ação, preservando a outra
   * coluna, e **remove** o mesmo binding de qualquer outra ação (dois comandos
   * na mesma tecla deixariam o jogo ambíguo). Devolve os ids que perderam o
   * binding, pra tela avisar.
   */
  rebind(id: string, binding: InputBinding, family: (b: InputBinding) => boolean): string[] {
    if (!this._defs.has(id)) return [];
    const stolenFrom: string[] = [];
    for (const [otherId, bindings] of this._bindings) {
      if (otherId === id) continue;
      const kept = bindings.filter((b) => !sameBinding(b, binding));
      if (kept.length !== bindings.length) {
        this._bindings.set(otherId, kept);
        stolenFrom.push(otherId);
      }
    }
    // O novo binding entra NA POSIÇÃO do primeiro da mesma família (não no fim):
    // a ordem no `config.ini` fica estável e previsível entre remapeamentos.
    const current = this._bindings.get(id) ?? [];
    const slot = current.findIndex(family);
    const kept = current.filter((b) => !family(b));
    const at = slot < 0 ? kept.length : Math.min(slot, kept.length);
    kept.splice(at, 0, binding);
    this._bindings.set(id, kept);
    return stolenFrom;
  }

  /** Remove todos os bindings da ação (fica sem comando). */
  clearBindings(id: string): void {
    if (this._defs.has(id)) this._bindings.set(id, []);
  }

  /** Volta a ação (ou todas, sem id) para os bindings de fábrica. */
  resetToDefaults(id?: string): void {
    if (id !== undefined) {
      const def = this._defs.get(id);
      if (def) this._bindings.set(id, [...def.defaults]);
      return;
    }
    for (const [actionId, def] of this._defs) this._bindings.set(actionId, [...def.defaults]);
  }

  /** `true` se a ação está exatamente como saiu de fábrica. */
  isDefault(id: string): boolean {
    const def = this._defs.get(id);
    if (!def) return true;
    return formatBindingList(this._bindings.get(id) ?? []) === formatBindingList(def.defaults);
  }

  // ─── Persistência (config.ini, seção [input]) ───────────────────────────────

  /**
   * Aplica os bindings salvos pelo jogador. Linha malformada é ignorada (a ação
   * fica no default) — `config.ini` é editável à mão e não pode derrubar o jogo.
   */
  loadFrom(config: ActionConfigStore): void {
    this._config = config;
    for (const id of this._defs.keys()) {
      const saved = this._savedBindings(id);
      if (saved) this._bindings.set(id, saved);
    }
  }

  /** Bindings gravados pro id no config carregado, ou `null` se não há linha. */
  private _savedBindings(id: string): InputBinding[] | null {
    const config = this._config;
    if (!config) return null;
    const key = `${INPUT_CONFIG_SECTION}.${id}`;
    return config.has(key) ? parseBindingList(config.get(key)) : null;
  }

  /**
   * Grava **só o que difere** do default (o resto some do arquivo) — mantém o
   * `config.ini` legível e deixa os defaults evoluírem sem congelar os antigos.
   * Persiste de fato só quando o chamador der `config.save()`.
   */
  saveTo(config: ActionConfigStore): void {
    for (const id of this._defs.keys()) {
      const key = `${INPUT_CONFIG_SECTION}.${id}`;
      if (this.isDefault(id)) config.delete(key);
      else config.set(key, formatBindingList(this._bindings.get(id) ?? []));
    }
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  /**
   * Slot de gamepad a usar: o preferido se conectado, senão o PRIMEIRO
   * conectado — no Windows um dispositivo fantasma costuma ocupar o slot 0 e o
   * controle real cai no 1+ (mesma defesa do ThirdPersonControlSystem).
   */
  private _padSlot(): number {
    const gp = this.gamepad;
    if (!gp || typeof gp.isConnected !== 'function') return this._padIndex;
    if (gp.isConnected(this._padIndex)) return this._padIndex;
    const first = typeof gp.firstConnectedIndex === 'function' ? gp.firstConnectedIndex() : -1;
    return first >= 0 ? first : this._padIndex;
  }

  private _bindingDown(binding: InputBinding): boolean {
    switch (binding.source) {
      case 'key':
        return this.input.isKeyDown(binding.key ?? '');
      case 'mouse':
        return this.input.isButtonDown(binding.index ?? 0);
      case 'pad':
        return this.gamepad?.isButtonDown(this._padSlot(), binding.index ?? 0) ?? false;
      case 'axis':
        return this._axisMagnitude(binding) >= AXIS_PRESS_THRESHOLD;
      default:
        return false;
    }
  }

  private _bindingValue(binding: InputBinding): number {
    switch (binding.source) {
      case 'key':
        return this.input.isKeyDown(binding.key ?? '') ? 1 : 0;
      case 'mouse':
        return this.input.isButtonDown(binding.index ?? 0) ? 1 : 0;
      case 'pad': {
        const gp = this.gamepad;
        if (!gp) return 0;
        const slot = this._padSlot();
        const index = binding.index ?? 0;
        // Gatilhos (LT/RT) são analógicos; `getButtonValue` cobre os dois casos.
        if (typeof gp.getButtonValue === 'function') return gp.getButtonValue(slot, index);
        return gp.isButtonDown(slot, index) ? 1 : 0;
      }
      case 'axis':
        return this._axisMagnitude(binding);
      default:
        return 0;
    }
  }

  /** Magnitude (0..1) da deflexão do eixo NO SENTIDO do binding; 0 no sentido oposto. */
  private _axisMagnitude(binding: InputBinding): number {
    const gp = this.gamepad;
    if (!gp) return 0;
    const raw = gp.getAxis(this._padSlot(), binding.index ?? 0) * (binding.sign ?? 1);
    return raw > 0 ? Math.min(1, raw) : 0;
  }
}
