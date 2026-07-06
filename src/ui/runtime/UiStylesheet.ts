/**
 * **CSS → estilo nativo** (ADR-0102): o dev escreve um SUBSET de CSS familiar
 * e ele "compila" pros estilos de widget — os mesmos nos DOIS backends
 * (Studio/DOM e console/renderer). Propriedade fora do subset = **erro claro
 * na hora** (mesma filosofia do hermesc com JS: falhar no build, não no
 * console).
 *
 * Suportado por seletor `.classe` (e `.classe:focus` em botões):
 * - `background`: cor `#rrggbb` ou `linear-gradient(180deg, c1, c2)`
 * - `color`, `font-size: Npx`, `opacity`
 * - `border-radius: Npx`, `border: Npx solid <cor>`
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
  // valida TODAS as propriedades já na compilação
  for (const [selector, props] of rules) {
    for (const prop of Object.keys(props)) {
      if (!SUPPORTED.has(prop)) {
        throw new Error(
          `UiStylesheet: propriedade "${prop}" (em ".${selector}") não é suportada no ` +
            `runtime nativo. Suportadas: ${[...SUPPORTED].join(', ')}`,
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
        const gradient = value.match(/^linear-gradient\(\s*180deg\s*,\s*([^,]+)\s*,\s*([^)]+)\)$/);
        if (isFocusState) {
          if (!(widget instanceof UiButton))
            throw new Error('UiStylesheet: ":focus" só se aplica a UiButton');
          widget.focusBackground = gradient ? gradient[1]!.trim() : value;
        } else if (gradient) {
          if (widget instanceof UiPanel) {
            widget.background = gradient[1]!.trim();
            widget.backgroundTo = gradient[2]!.trim();
          } else if (widget instanceof UiButton) {
            widget.background = gradient[1]!.trim();
          } else {
            throw new Error('UiStylesheet: background em Label não é suportado');
          }
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
        } else if (widget instanceof UiPanel) {
          widget.borderWidth = width;
          widget.borderColor = color;
        } else {
          throw new Error('UiStylesheet: border fora de Panel/Button:focus não é suportado');
        }
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
