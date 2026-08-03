/**
 * **Catálogo de ações da engine** (ADR-0164) — o vocabulário MÍNIMO: só as
 * ações que os sistemas da própria engine consomem (mover, olhar, pular,
 * correr, interagir, pausar, navegar a UI, dirigir). Ação de gameplay
 * específica (plantar, hotbar, arma) é do JOGO — declare com
 * `actions.define(...)` (ADR-0066 continua valendo nessa parte).
 *
 * Os bindings default reproduzem **exatamente** as teclas cravadas hoje nos
 * sistemas, então ligar a camada de ações não muda o controle de nenhum jogo.
 */
import { parseBindingList, type InputBinding } from './bindings.js';

/** Grupos que a tela de Controles usa como seções. */
export type ActionGroup = 'move' | 'look' | 'action' | 'ui' | 'vehicle';

/** Definição de uma ação remapeável. */
export interface ActionDef {
  /** Id estável (chave no `config.ini`). Em inglês, camelCase. */
  readonly id: string;
  /** Seção na tela de Controles. Jogos podem usar grupos próprios. */
  readonly group: ActionGroup | string;
  /** Chave i18n do rótulo (`t(labelKey)`). */
  readonly labelKey: string;
  /** Rótulo pt-BR usado quando não há tradução carregada pra `labelKey`. */
  readonly label: string;
  /** Bindings de fábrica. */
  readonly defaults: readonly InputBinding[];
  /**
   * `true` esconde a ação da tela de Controles (o jogo ainda a lê normalmente).
   * Útil pra ações internas que não devem ser remapeadas.
   */
  readonly hidden?: boolean;
}

/** Atalho: monta a definição parseando os defaults do formato de texto. */
function def(
  id: string,
  group: ActionGroup,
  label: string,
  defaults: string,
): ActionDef {
  return { id, group, labelKey: `input.action.${id}`, label, defaults: parseBindingList(defaults) };
}

/**
 * Ações da engine com os bindings de fábrica. A ordem é a de exibição na tela
 * de Controles.
 *
 * @example
 * const actions = new InputActions(game.input, game.gamepad);
 * if (actions.pressed('jump')) body.jump();
 */
export const ENGINE_ACTIONS: readonly ActionDef[] = [
  // ── Movimento (stick esquerdo / WASD) ───────────────────────────────────────
  def('moveForward', 'move', 'Para frente', 'key:w,key:ArrowUp,axis:1-'),
  def('moveBack', 'move', 'Para trás', 'key:s,key:ArrowDown,axis:1+'),
  def('moveLeft', 'move', 'Para a esquerda', 'key:a,key:ArrowLeft,axis:0-'),
  def('moveRight', 'move', 'Para a direita', 'key:d,key:ArrowRight,axis:0+'),

  // ── Câmera (stick direito; o mouse é contínuo e não passa por binding) ──────
  def('lookLeft', 'look', 'Olhar à esquerda', 'axis:2-'),
  def('lookRight', 'look', 'Olhar à direita', 'axis:2+'),
  def('lookUp', 'look', 'Olhar para cima', 'axis:3-'),
  def('lookDown', 'look', 'Olhar para baixo', 'axis:3+'),

  // ── Ação ────────────────────────────────────────────────────────────────────
  def('jump', 'action', 'Pular', 'key:Space,pad:0'),
  def('sprint', 'action', 'Correr', 'key:Shift,pad:7'),
  def('interact', 'action', 'Interagir', 'key:e,pad:0'),
  def('pause', 'action', 'Pausar', 'key:Escape,pad:9'),

  // ── Interface (navegação de menus) ──────────────────────────────────────────
  def('uiUp', 'ui', 'Menu: cima', 'key:ArrowUp,pad:12'),
  def('uiDown', 'ui', 'Menu: baixo', 'key:ArrowDown,pad:13'),
  def('uiLeft', 'ui', 'Menu: esquerda', 'key:ArrowLeft,pad:14'),
  def('uiRight', 'ui', 'Menu: direita', 'key:ArrowRight,pad:15'),
  def('uiConfirm', 'ui', 'Confirmar', 'key:Enter,key:Space,pad:0'),
  def('uiBack', 'ui', 'Voltar', 'key:Escape,key:Backspace,pad:1'),
  // Q/E é o par de teclado equivalente aos ombros LB/RB — o mesmo gesto de
  // "folhear" abas/itens. Sem eles, uma tela navegável por LB/RB simplesmente
  // NÃO tinha como ser operada no teclado (foi assim que a warp room de um jogo
  // ficou só-controle sem ninguém notar).
  def('uiPrev', 'ui', 'Anterior', 'key:q,pad:4'),
  def('uiNext', 'ui', 'Próximo', 'key:e,pad:5'),

  // ── Veículo (VehicleControlSystem) ──────────────────────────────────────────
  def('accelerate', 'vehicle', 'Acelerar', 'key:w,key:ArrowUp,pad:7'),
  def('brake', 'vehicle', 'Frear / ré', 'key:s,key:ArrowDown,pad:6'),
  def('handbrake', 'vehicle', 'Freio de mão', 'key:Space,pad:0'),
];

/** Rótulo pt-BR de cada grupo (fallback quando não há tradução). */
export const GROUP_LABELS: Readonly<Record<string, string>> = {
  move: 'Movimento',
  look: 'Câmera',
  action: 'Ação',
  ui: 'Interface',
  vehicle: 'Veículo',
};

/** Grupos mostrados por default na tela de Controles (câmera e veículo entram sob demanda). */
export const DEFAULT_VISIBLE_GROUPS: readonly string[] = ['move', 'action', 'ui'];
