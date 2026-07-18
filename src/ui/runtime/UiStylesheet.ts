/**
 * **CSS → estilo nativo** (ADR-0102): o dev escreve um SUBSET de CSS familiar
 * e ele "compila" pros estilos de widget — os mesmos nos DOIS backends
 * (Studio/DOM e console/renderer). Propriedade fora do subset = **erro claro
 * na hora** (mesma filosofia do hermesc com JS: falhar no build, não no
 * console).
 *
 * Suportado por seletor `.classe` (e `.classe:focus` em botões):
 * - `background`: cor (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) ou
 *   `linear-gradient(180deg|90deg, c1, c2)` (`to bottom`/`to right` também)
 * - `color`, `font-size: Npx`, `opacity`
 * - `border-radius: Npx`, `border: Npx solid <cor>` (em botão = borda constante)
 * - `box-shadow: 0 Npx 0 <cor>` (sombra DURA, sem blur) ou `none`
 * - `text-align: left|center|right` (botão)
 * - `padding: Ypx Xpx`, `width: Npx`, `height: Npx`
 *
 * @example
 * const sheet = parseUiCss(`
 *   .card { background: linear-gradient(180deg, #ffffff, #eef3f8);
 *           border-radius: 16px; color: #14607f; font-size: 18px; }
 *   .card:focus { background: #ffd94d; border: 4px solid #ffb300; }
 * `);
 * sheet.apply(botao, 'card');
 */
import { parseUiBackground, parseUiBoxShadow } from './uiColor.js';
import { UiButton, UiLabel, UiPanel, type UiWidget } from './widgets.js';

type StyleProps = Record<string, string>;

export class UiStylesheet {
  constructor(private readonly rules: Map<string, StyleProps>) {}

  /** Aplica a classe (e `:focus`, se houver) ao widget. Erro se não existir. */
  apply<T extends UiWidget>(widget: T, className: string): T {
    const base = this.rules.get(className);
    if (!base) throw new Error(`UiStylesheet: classe ".${className}" não definida`);
    applyProps(widget, base, false);
    const focus = this.rules.get(`${className}:focus`);
    if (focus) applyProps(widget, focus, true);
    widget.dirty = true;
    return widget;
  }
}

/** Compila o CSS (subset) — lança erro descritivo pra qualquer coisa fora dele. */
export function parseUiCss(css: string): UiStylesheet {
  const rules = new Map<string, StyleProps>();
  const clean = css.replace(/\/\*[^]*?\*\//g, '');
  const ruleRegex = /([^{}]+)\{([^}]*)\}/g;
  for (const [, rawSelector, body] of clean.matchAll(ruleRegex)) {
    const selector = rawSelector!.trim();
    const match = selector.match(/^\.([\w-]+)(:focus)?$/);
    if (!match) {
      throw new Error(
        `UiStylesheet: seletor "${selector}" não suportado — use ".classe" ou ".classe:focus"`,
      );
    }
    const key = match[2] ? `${match[1]}:focus` : match[1]!;
    const props: StyleProps = rules.get(key) ?? {};
    for (const declaration of body!.split(';')) {
      const decl = declaration.trim();
      if (!decl) continue;
      const colon = decl.indexOf(':');
      if (colon < 0) throw new Error(`UiStylesheet: declaração inválida "${decl}"`);
      props[decl.slice(0, colon).trim().toLowerCase()] = decl.slice(colon + 1).trim();
    }
    rules.set(key, props);
  }
  // valida TODAS as propriedades (e valores fora do subset) já na compilação
  for (const [selector, props] of rules) {
    for (const [prop, value] of Object.entries(props)) {
      if (!SUPPORTED.has(prop)) {
        throw new Error(
          `UiStylesheet: propriedade "${prop}" (em ".${selector}") não é suportada no ` +
            `runtime nativo. Suportadas: ${[...SUPPORTED].join(', ')}`,
        );
      }
      if (
        prop === 'background' &&
        value.startsWith('linear-gradient(') &&
        parseUiBackground(value).to === null
      ) {
        throw new Error(
          `UiStylesheet: "background: ${value}" (em ".${selector}") — gradiente só com ` +
            '"linear-gradient(180deg|90deg, c1, c2)"',
        );
      }
      if (prop === 'box-shadow' && value !== 'none' && !parseUiBoxShadow(value)) {
        throw new Error(
          `UiStylesheet: "box-shadow: ${value}" (em ".${selector}") — o subset é ` +
            '"0 Npx 0 <cor>" (sombra dura, sem blur/spread) ou "none"',
        );
      }
      if (prop === 'text-align' && !['left', 'center', 'right'].includes(value)) {
        throw new Error(
          `UiStylesheet: "text-align: ${value}" (em ".${selector}") — use left, center ou right`,
        );
      }
    }
  }
  return new UiStylesheet(rules);
}

const SUPPORTED = new Set([
  'background',
  'color',
  'font-size',
  'opacity',
  'border-radius',
  'border',
  'box-shadow',
  'text-align',
  'padding',
  'width',
  'height',
]);

function px(value: string, prop: string): number {
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (!match) throw new Error(`UiStylesheet: "${prop}: ${value}" — use px (ex.: 16px)`);
  return Number(match[1]);
}

function applyProps(widget: UiWidget, props: StyleProps, isFocusState: boolean): void {
  for (const [prop, value] of Object.entries(props)) {
    switch (prop) {
      case 'background': {
        if (isFocusState) {
          if (!(widget instanceof UiButton))
            throw new Error('UiStylesheet: ":focus" só se aplica a UiButton');
          widget.focusBackground = value; // cor ou gradiente — o backend decompõe
        } else if (widget instanceof UiPanel || widget instanceof UiButton) {
          widget.background = value;
          if (widget instanceof UiPanel) widget.backgroundTo = null;
        } else {
          throw new Error('UiStylesheet: background em Label não é suportado');
        }
        break;
      }
      case 'color':
        if (widget instanceof UiLabel) widget.color = value;
        break;
      case 'font-size':
        if (widget instanceof UiLabel) widget.fontSize = px(value, prop);
        break;
      case 'opacity':
        widget.opacity = Number(value);
        break;
      case 'border-radius':
        if (widget instanceof UiButton) widget.cornerRadius = px(value, prop);
        else if (widget instanceof UiPanel) widget.cornerRadius = px(value, prop);
        break;
      case 'border': {
        const match = value.match(/^(\d+(?:\.\d+)?)px\s+solid\s+(.+)$/);
        if (!match) throw new Error(`UiStylesheet: "border: ${value}" — use "Npx solid <cor>"`);
        const width = Number(match[1]);
        const color = match[2]!.trim();
        if (isFocusState && widget instanceof UiButton) {
          widget.focusBorderWidth = width;
          widget.focusBorderColor = color;
        } else if (widget instanceof UiPanel || widget instanceof UiButton) {
          // Em botão (fora do :focus) é a borda CONSTANTE (moldura cartoon).
          widget.borderWidth = width;
          widget.borderColor = color;
        } else {
          throw new Error('UiStylesheet: border em Label não é suportado');
        }
        break;
      }
      case 'box-shadow': {
        if (value !== 'none' && !parseUiBoxShadow(value)) {
          throw new Error(
            `UiStylesheet: "box-shadow: ${value}" — subset é "0 Npx 0 <cor>" (sombra dura) ou "none"`,
          );
        }
        if (widget instanceof UiPanel || widget instanceof UiButton) widget.boxShadow = value;
        else throw new Error('UiStylesheet: box-shadow em Label não é suportado');
        break;
      }
      case 'text-align': {
        if (value !== 'left' && value !== 'center' && value !== 'right') {
          throw new Error(`UiStylesheet: "text-align: ${value}" — use left, center ou right`);
        }
        if (widget instanceof UiButton) widget.textAlign = value;
        break;
      }
      case 'padding': {
        const parts = value.split(/\s+/);
        if (widget instanceof UiButton) {
          widget.paddingY = px(parts[0]!, prop);
          widget.paddingX = px(parts[1] ?? parts[0]!, prop);
        }
        break;
      }
      case 'width':
        widget.width = px(value, prop);
        break;
      case 'height':
        widget.height = px(value, prop);
        break;
    }
  }
}
