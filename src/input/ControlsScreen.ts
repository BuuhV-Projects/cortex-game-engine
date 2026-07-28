/**
 * **Tela de Controles** (SPEC-0165) — remapeamento de teclado e gamepad,
 * pronta pra usar, na UI de runtime (funciona idêntica no Studio, no export PC
 * e no console). Uma linha por ação, duas colunas de binding (teclado/mouse e
 * controle); ativar uma célula entra em captura ("Pressione...") e o próximo
 * input do jogador vira o binding.
 *
 * Só faz sentido no export PC/Steam — gate com
 * {@link canRebindInput}/{@link gamePlatform}.
 *
 * @example
 * const config = await GameConfig.load();
 * game.actions.loadFrom(config);
 * if (canRebindInput(await gamePlatform())) {
 *   await showControlsScreen(game, game.actions, { config });
 * }
 */
import type { UiLayer } from '../ui/runtime/UiLayer.js';
import { UiButton, UiLabel, UiPanel, type UiWidget } from '../ui/runtime/widgets.js';
import type { GamepadManager } from '../core/GamepadManager.js';
import type { InputActions, ActionConfigStore } from './InputActions.js';
import {
  bindingLabel,
  isGamepadBinding,
  isKeyboardBinding,
  type InputBinding,
} from './bindings.js';
import { DEFAULT_VISIBLE_GROUPS, GROUP_LABELS, type ActionDef } from './defaultActions.js';
import { createBindingCapture, type CaptureFamily } from './captureBinding.js';

// ─── Layout (espaço de design, altura de referência 1080 — SPEC-0129) ─────────

const TITLE_Y = 70;
const HEADER_HEIGHT = 58;
/** Respiro antes de um título de grupo que não abre a página (separa as seções). */
const HEADER_GAP = 20;
const ROW_HEIGHT = 62;
const LIST_TOP = 190;
/**
 * Altura útil da lista (px de design): do {@link LIST_TOP} até logo acima do
 * pager. A paginação é por ALTURA, não por contagem de linhas — títulos de
 * grupo são mais baixos que as linhas, e contar itens fazia a última linha
 * invadir o pager.
 */
const LIST_HEIGHT = 690;
const LABEL_X = -520;
const LABEL_WIDTH = 420;
const KEY_CELL_X = 60;
const PAD_CELL_X = 400;
const CELL_WIDTH = 300;
const CELL_HEIGHT = 48;
const FOOTER_Y = -70;
const TOP_BUTTON_Y = 64;
const PAGER_Y = -150;
const PAGER_X = 330;
const PAGER_WIDTH = 190;

const TITLE_FONT = 44;
const HEADER_FONT = 22;
const ROW_FONT = 22;
const CELL_FONT = 20;
const FOOTER_FONT = 18;

/** Paleta neutra da engine — sobrescrevível por {@link ControlsScreenOptions.theme}. */
const DEFAULT_THEME = {
  scrim: '#050c17',
  scrimOpacity: 0.82,
  title: '#ffffff',
  header: '#8fd0ff',
  label: '#dbe7f2',
  cellBackground: '#12263c',
  cellFocus: '#2f7fd0',
  cellText: '#eaf4ff',
  cellBorder: '#ffffff2e',
  capture: '#ffd24a',
  footer: '#9fb4c8',
} as const;

export type ControlsTheme = typeof DEFAULT_THEME;

/** Textos da tela (pt-BR default; passe `translate` pra usar o i18n do jogo). */
const DEFAULT_TEXTS: Readonly<Record<string, string>> = {
  'input.title': 'CONTROLES',
  'input.press': 'Pressione...',
  'input.none': '—',
  'input.reset': 'Restaurar padrão',
  'input.close': 'Voltar',
  'input.prev': '‹ Anterior',
  'input.next': 'Próxima ›',
  'input.hint': 'Selecione um comando e pressione a nova tecla ou botão. Esc cancela.',
};

export interface ControlsScreenOptions {
  /** Grupos exibidos, na ordem. Default: movimento, ação e interface. */
  groups?: readonly string[];
  /** Onde persistir (tipicamente o `GameConfig`); sem ele, o remapeamento vale só na sessão. */
  config?: ActionConfigStore & { save(): Promise<boolean> };
  /** Necessário pra capturar botões/eixos do controle (tipicamente `game.gamepad`). */
  gamepad?: GamepadManager;
  /** Tradutor (ex.: o `t` do i18n). Chave sem tradução cai no texto pt-BR embutido. */
  translate?: (key: string) => string;
  /**
   * A tela roda o próprio loop de `ui.update`/`ui.render`? Deixe `true` quando
   * o `Game` está parado (menu de título) e `false` quando ele já está rodando
   * (menu de pausa) — senão a UI atualiza duas vezes por frame.
   * @default true
   */
  driveUi?: boolean;
  /** Cores (parcial — o resto vem do tema neutro da engine). */
  theme?: Partial<ControlsTheme>;
}

/** Uma linha da lista: rótulo da ação + as duas células de binding. */
interface ControlsRow {
  def: ActionDef;
  label: UiLabel;
  keyCell: UiButton;
  padCell: UiButton;
}

/** Item posicionável da lista (título de grupo ou linha de ação). */
type ListItem = { kind: 'header'; widget: UiLabel } | { kind: 'row'; row: ControlsRow };

/**
 * Abre a tela de Controles e resolve quando o jogador sai. Persiste os
 * bindings (se `config` foi passado) antes de resolver.
 */
export async function showControlsScreen(
  game: { ui: UiLayer; gamepad?: GamepadManager },
  actions: InputActions,
  options: ControlsScreenOptions = {},
): Promise<void> {
  const ui = game.ui;
  const gamepad = options.gamepad ?? game.gamepad;
  const theme: ControlsTheme = { ...DEFAULT_THEME, ...options.theme };
  const groups = options.groups ?? DEFAULT_VISIBLE_GROUPS;
  const driveUi = options.driveUi ?? true;
  const text = (key: string): string => {
    const translated = options.translate?.(key);
    // O `t()` do i18n devolve a própria chave quando não há tradução.
    if (translated && translated !== key) return translated;
    return DEFAULT_TEXTS[key] ?? key;
  };
  const actionLabel = (def: ActionDef): string => {
    const translated = options.translate?.(def.labelKey);
    return translated && translated !== def.labelKey ? translated : def.label;
  };

  const widgets: UiWidget[] = [];
  const track = <T extends UiWidget>(widget: T): T => {
    widgets.push(widget);
    return ui.add(widget);
  };

  // ── Moldura ────────────────────────────────────────────────────────────────
  const scrim = track(
    new UiPanel({ anchor: 'top-left', background: theme.scrim, opacity: theme.scrimOpacity }),
  );
  scrim.fill = true;
  track(
    new UiLabel({
      anchor: 'top-center', y: TITLE_Y, text: text('input.title'),
      fontSize: TITLE_FONT, color: theme.title,
    }),
  );
  const hint = track(
    new UiLabel({
      anchor: 'bottom-center', y: FOOTER_Y, text: text('input.hint'),
      fontSize: FOOTER_FONT, color: theme.footer,
    }),
  );

  // ── Lista (títulos de grupo + linhas) ──────────────────────────────────────
  const items: ListItem[] = [];
  const rows: ControlsRow[] = [];
  for (const group of groups) {
    const defs = actions.actionsOf(group);
    if (defs.length === 0) continue;
    items.push({
      kind: 'header',
      widget: track(
        new UiLabel({
          // Mesma largura do rótulo da ação: sem isso o título do grupo fica
          // centrado no próprio texto e desalinha da coluna da esquerda.
          anchor: 'top-center', x: LABEL_X, width: LABEL_WIDTH,
          text: groupLabel(group, options.translate),
          fontSize: HEADER_FONT, color: theme.header,
        }),
      ),
    });
    for (const def of defs) {
      const row: ControlsRow = {
        def,
        label: track(
          new UiLabel({
            anchor: 'top-center', x: LABEL_X, width: LABEL_WIDTH, text: actionLabel(def),
            fontSize: ROW_FONT, color: theme.label,
          }),
        ),
        keyCell: track(cell(KEY_CELL_X, theme)),
        padCell: track(cell(PAD_CELL_X, theme)),
      };
      row.keyCell.onPress = () => void startCapture(row, 'keyboard');
      row.padCell.onPress = () => void startCapture(row, 'gamepad');
      rows.push(row);
      items.push({ kind: 'row', row });
    }
  }

  const pages = paginate(items);
  const pageCount = pages.length;
  let page = 0;

  // ── Botões de topo/rodapé ──────────────────────────────────────────────────
  const resetButton = track(
    new UiButton({
      anchor: 'top-right', x: -60, y: TOP_BUTTON_Y, width: 300, height: CELL_HEIGHT,
      text: text('input.reset'), fontSize: CELL_FONT, color: theme.cellText,
      background: theme.cellBackground, focusBackground: theme.cellFocus,
      borderWidth: 2, borderColor: theme.cellBorder, cornerRadius: 10,
      onPress: () => {
        actions.resetToDefaults();
        refresh();
      },
    }),
  );
  const closeButton = track(
    new UiButton({
      anchor: 'top-left', x: 60, y: TOP_BUTTON_Y, width: 220, height: CELL_HEIGHT,
      text: text('input.close'), fontSize: CELL_FONT, color: theme.cellText,
      background: theme.cellBackground, focusBackground: theme.cellFocus,
      borderWidth: 2, borderColor: theme.cellBorder, cornerRadius: 10,
      onPress: () => finish(),
    }),
  );
  const prevButton = track(
    new UiButton({
      anchor: 'bottom-center', x: -PAGER_X, y: PAGER_Y, width: PAGER_WIDTH, height: CELL_HEIGHT,
      text: text('input.prev'), fontSize: CELL_FONT, color: theme.cellText,
      background: theme.cellBackground, focusBackground: theme.cellFocus,
      borderWidth: 2, borderColor: theme.cellBorder, cornerRadius: 10,
      visible: pageCount > 1,
      onPress: () => setPage(page - 1),
    }),
  );
  const nextButton = track(
    new UiButton({
      anchor: 'bottom-center', x: PAGER_X, y: PAGER_Y, width: PAGER_WIDTH, height: CELL_HEIGHT,
      text: text('input.next'), fontSize: CELL_FONT, color: theme.cellText,
      background: theme.cellBackground, focusBackground: theme.cellFocus,
      borderWidth: 2, borderColor: theme.cellBorder, cornerRadius: 10,
      visible: pageCount > 1,
      onPress: () => setPage(page + 1),
    }),
  );
  const pageLabel = track(
    new UiLabel({
      anchor: 'bottom-center', y: PAGER_Y, text: '', fontSize: CELL_FONT, color: theme.footer,
      visible: pageCount > 1,
    }),
  );

  // ── Estado ─────────────────────────────────────────────────────────────────
  let capture: ReturnType<typeof createBindingCapture> | null = null;
  let done = false;
  let resolveScreen!: () => void;

  /** Mostra só os itens da página e reposiciona as linhas visíveis. */
  function setPage(next: number): void {
    page = (next + pageCount) % pageCount;
    const current = new Set(pages[page]);
    let y = LIST_TOP;
    let first = true;
    for (const item of items) {
      const visible = current.has(item);
      if (item.kind === 'header') {
        if (visible && !first) y += HEADER_GAP;
        item.widget.set({ visible, y });
        if (visible) {
          y += HEADER_HEIGHT;
          first = false;
        }
        continue;
      }
      if (visible) first = false;
      const { label, keyCell, padCell } = item.row;
      label.set({ visible, y: y + (ROW_HEIGHT - CELL_HEIGHT) / 2 });
      keyCell.set({ visible, y });
      padCell.set({ visible, y });
      if (visible) y += ROW_HEIGHT;
    }
    pageLabel.set({ text: `${page + 1} / ${pageCount}` });
    // Foco sempre num botão visível (o anterior pode ter saído da página).
    const focused = ui.focused;
    if (!focused || !focused.visible) {
      const firstCell = pages[page]?.find(
        (item): item is { kind: 'row'; row: ControlsRow } => item.kind === 'row',
      );
      ui.focus(firstCell ? firstCell.row.keyCell : closeButton);
    }
  }

  /** Re-escreve os rótulos das células a partir dos bindings atuais. */
  function refresh(): void {
    for (const row of rows) {
      const bindings = actions.bindingsOf(row.def.id);
      row.keyCell.set({ text: cellText(bindings, isKeyboardBinding, text('input.none')) });
      row.padCell.set({ text: cellText(bindings, isGamepadBinding, text('input.none')) });
    }
  }

  /** Entra no modo captura pra uma célula. */
  async function startCapture(row: ControlsRow, family: CaptureFamily): Promise<void> {
    if (capture || done) return;
    const target = family === 'keyboard' ? row.keyCell : row.padCell;
    target.set({ text: text('input.press'), color: theme.capture });
    // Navegação suspensa: a tecla capturada não pode mover o foco/ativar botão.
    ui.setInputEnabled(false);
    capture = createBindingCapture({ family, gamepad });
    const binding = await capture.promise;
    capture = null;
    ui.setInputEnabled(true);
    target.set({ color: theme.cellText });
    if (binding) {
      const family_ = family === 'keyboard' ? isKeyboardBinding : isGamepadBinding;
      actions.rebind(row.def.id, binding, family_);
      persist();
    }
    refresh();
    ui.focus(target);
  }

  /** Grava no config.ini (só o diff contra os defaults). */
  function persist(): void {
    const config = options.config;
    if (!config) return;
    actions.saveTo(config);
    void config.save();
  }

  function finish(): void {
    if (done) return;
    done = true;
    capture?.cancel();
    ui.setInputEnabled(true);
    persist();
    for (const widget of widgets) ui.remove(widget);
    ui.focus(null);
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeyDown);
    resolveScreen();
  }

  /** Esc fecha a tela — mas não enquanto uma captura espera (lá o Esc cancela). */
  const onKeyDown = (e: Event): void => {
    if (capture) return;
    if ((e as KeyboardEvent).key === 'Escape') finish();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown);

  refresh();
  setPage(0);
  ui.focus(rows[0]?.keyCell ?? closeButton);
  // `hint`/`resetButton` já estão posicionados; nada a fazer por frame além do
  // tick da captura (gamepad) e, se pedido, dirigir a UI.
  void hint;
  void resetButton;
  void prevButton;
  void nextButton;

  return new Promise<void>((resolve) => {
    resolveScreen = resolve;
    if (!driveUi) {
      // O Game dirige a UI; ainda assim a captura de gamepad precisa do tick.
      const pump = (): void => {
        if (done) return;
        capture?.tick();
        requestFrame(pump);
      };
      requestFrame(pump);
      return;
    }
    let last = now();
    const frame = (): void => {
      if (done) return;
      const time = now();
      capture?.tick();
      actions.poll(); // bordas frescas pra navegação por ações do UiLayer
      ui.update((time - last) / 1000);
      ui.render();
      last = time;
      requestFrame(frame);
    };
    requestFrame(frame);
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fatia a lista em páginas que cabem em {@link LIST_HEIGHT}, **sem deixar
 * título de grupo órfão** no fim da página (um "INTERFACE" sozinho no rodapé,
 * com as ações dele só na página seguinte, parece bug).
 */
function paginate(items: readonly ListItem[]): ListItem[][] {
  // Mesma conta do `setPage`: header que não abre a página leva o respiro junto.
  const heightOf = (item: ListItem, firstOfPage: boolean): number =>
    item.kind === 'header' ? HEADER_HEIGHT + (firstOfPage ? 0 : HEADER_GAP) : ROW_HEIGHT;
  const pages: ListItem[][] = [];
  let current: ListItem[] = [];
  let used = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const height = heightOf(item, current.length === 0);
    // Um header só entra se a primeira ação dele couber junto.
    const needed = item.kind === 'header' && items[i + 1]
      ? height + heightOf(items[i + 1]!, false)
      : height;
    if (used + needed > LIST_HEIGHT && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
    }
    used += heightOf(item, current.length === 0);
    current.push(item);
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

/** Célula de binding (botão focável com o rótulo da tecla/botão atual). */
function cell(x: number, theme: ControlsTheme): UiButton {
  return new UiButton({
    anchor: 'top-center', x, width: CELL_WIDTH, height: CELL_HEIGHT,
    text: '', fontSize: CELL_FONT, color: theme.cellText,
    background: theme.cellBackground, focusBackground: theme.cellFocus,
    borderWidth: 2, borderColor: theme.cellBorder, cornerRadius: 10,
  });
}

/** Texto da célula: os bindings da família, separados por barra, ou "—". */
function cellText(
  bindings: readonly InputBinding[],
  belongs: (b: InputBinding) => boolean,
  empty: string,
): string {
  const labels = bindings.filter(belongs).map(bindingLabel);
  return labels.length > 0 ? labels.join(' / ') : empty;
}

/** Rótulo do grupo (traduzido quando houver chave `input.group.<id>`). */
function groupLabel(group: string, translate?: (key: string) => string): string {
  const key = `input.group.${group}`;
  const translated = translate?.(key);
  if (translated && translated !== key) return translated;
  return GROUP_LABELS[group] ?? group.toUpperCase();
}

/** `requestAnimationFrame` com fallback pra ambientes sem browser (testes). */
function requestFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback());
  else setTimeout(callback, 16);
}

/** Relógio monotônico com fallback. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
