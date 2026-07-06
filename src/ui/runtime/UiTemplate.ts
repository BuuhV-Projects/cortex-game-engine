/**
 * **Templates HTML → UI nativa** (ADR-0102): o dev autora telas em arquivos
 * `.html` (assets do jogo, carregados DINAMICAMENTE via fetch) com um
 * vocabulário limitado que compila pra árvore de widgets — idêntico no
 * Studio (DOM) e no console (renderer). Tag/atributo fora do vocabulário =
 * **erro claro na compilação** (nunca surpresa no console).
 *
 * Vocabulário:
 * - `<panel>`/`<label>`/`<button>` — viram {@link UiPanel}/{@link UiLabel}/
 *   {@link UiButton}. Texto interno vira `text` (com `{{chave}}` substituído
 *   pelos `data` do load).
 * - `<stack direction="column|row" gap="N">` — empilha os filhos (layout
 *   estático calculado na compilação; alturas de label ≈ fontSize).
 * - `<style>` — CSS do subset ({@link parseUiCss}) embutido no template.
 * - Atributos: `class`, `id`, `anchor`, `x`, `y`, `width`, `height`,
 *   `onpress="acao"` (button), `fill` (panel do tamanho do viewport).
 *
 * @example  assets/ui/menu.html
 * <style>
 *   .card { background: #ffffff; border-radius: 16px; }
 *   .card:focus { background: #ffd94d; border: 4px solid #ffb300; }
 * </style>
 * <panel class="ceu" fill></panel>
 * <label anchor="center" y="-160" class="titulo">{{titulo}}</label>
 * <stack anchor="center" gap="14">
 *   <button class="card" onpress="jogar">Jogar</button>
 *   <button class="card" onpress="sair">Sair</button>
 * </stack>
 *
 * @example  carregando
 * const menu = await loadUiTemplate(game.ui, 'assets/ui/menu.html', {
 *   data: { titulo: 'Meu Jogo' },
 *   onAction: (acao) => { if (acao === 'jogar') start(); },
 * });
 * menu.get('placar')?.set({ text: 'x10' }); // por id
 * menu.destroy();
 */
import { anchorFraction, type UiAnchor } from './layout.js';
import { parseUiCss, UiStylesheet } from './UiStylesheet.js';
import { UiButton, UiLabel, UiPanel, type UiWidget } from './widgets.js';
import type { UiLayer } from './UiLayer.js';

const TAGS = new Set(['panel', 'label', 'button', 'stack']);

interface TemplateNode {
  tag: string;
  attrs: Record<string, string>;
  children: TemplateNode[];
  text: string;
}

/** Template compilado (parse 1x; `build` quantas vezes quiser). */
export class UiTemplate {
  constructor(
    private readonly roots: TemplateNode[],
    private readonly sheet: UiStylesheet | null,
  ) {}

  /** Instancia os widgets na camada. */
  build(ui: UiLayer, options: UiTemplateBuildOptions = {}): UiTemplateInstance {
    const widgets: UiWidget[] = [];
    const byId = new Map<string, UiWidget>();
    const viewport = ui.viewport();
    const data = options.data ?? {};

    const emit = (node: TemplateNode, extraX: number, extraY: number): void => {
      if (node.tag === 'stack') {
        this.emitStack(node, extraX, extraY, emit);
        return;
      }
      const widget = this.makeWidget(node, data, options);
      widget.x += extraX;
      widget.y += extraY;
      if (node.attrs['fill'] !== undefined && widget instanceof UiPanel) {
        widget.anchor = 'top-left';
        widget.width = viewport.width;
        widget.height = viewport.height;
      }
      widgets.push(ui.add(widget));
      if (node.attrs['id']) byId.set(node.attrs['id'], widget);
    };
    for (const root of this.roots) emit(root, 0, 0);

    return {
      widgets,
      get: (id) => byId.get(id) ?? null,
      destroy: () => {
        for (const w of widgets) ui.remove(w);
        widgets.length = 0;
      },
    };
  }

  /** Empilha filhos (column/row) com layout ESTÁTICO relativo à âncora. */
  private emitStack(
    node: TemplateNode,
    extraX: number,
    extraY: number,
    emit: (n: TemplateNode, x: number, y: number) => void,
  ): void {
    const direction = node.attrs['direction'] ?? 'column';
    const gap = Number(node.attrs['gap'] ?? 10);
    const anchor = (node.attrs['anchor'] ?? 'center') as UiAnchor;
    const baseX = Number(node.attrs['x'] ?? 0) + extraX;
    const baseY = Number(node.attrs['y'] ?? 0) + extraY;
    const { fx, fy } = anchorFraction(anchor);

    const sizes = node.children.map((child) => this.estimateSize(child));
    const total =
      sizes.reduce((sum, s) => sum + (direction === 'column' ? s.height : s.width), 0) +
      gap * Math.max(0, node.children.length - 1);

    let cursor = 0;
    node.children.forEach((child, i) => {
      child.attrs['anchor'] = child.attrs['anchor'] ?? anchor;
      const size = direction === 'column' ? sizes[i]!.height : sizes[i]!.width;
      // pivô do filho acompanha a âncora: offset = cursor + tamanho·f − total·f
      const along = cursor + size * (direction === 'column' ? fy : fx) -
        total * (direction === 'column' ? fy : fx);
      if (direction === 'column') emit(child, baseX, baseY + along);
      else emit(child, baseX + along, baseY);
      cursor += size + gap;
    });
  }

  /** Tamanho estimado pro layout do stack (labels ≈ fonte; resto declarado). */
  private estimateSize(node: TemplateNode): { width: number; height: number } {
    const probe = this.makeWidget(node, {}, {});
    const height =
      probe.height ||
      (probe instanceof UiButton
        ? probe.fontSize + probe.paddingY * 2
        : probe instanceof UiLabel
          ? Math.ceil(probe.fontSize * 1.3)
          : 0);
    const width =
      probe.width ||
      (probe instanceof UiLabel ? Math.ceil(probe.text.length * probe.fontSize * 0.55) : 0);
    return { width, height };
  }

  private makeWidget(
    node: TemplateNode,
    data: Record<string, string | number>,
    options: UiTemplateBuildOptions,
  ): UiWidget {
    const widget =
      node.tag === 'panel' ? new UiPanel() : node.tag === 'button' ? new UiButton() : new UiLabel();

    const className = node.attrs['class'];
    if (className) {
      if (!this.sheet)
        throw new Error(`UiTemplate: class "${className}" sem <style> no template`);
      this.sheet.apply(widget, className);
    }
    if (widget instanceof UiLabel) {
      widget.text = node.text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
        String(data[key] ?? ''),
      );
    }
    if (node.attrs['anchor']) widget.anchor = node.attrs['anchor'] as UiAnchor;
    if (node.attrs['x']) widget.x = Number(node.attrs['x']);
    if (node.attrs['y']) widget.y = Number(node.attrs['y']);
    if (node.attrs['width']) widget.width = Number(node.attrs['width']);
    if (node.attrs['height']) widget.height = Number(node.attrs['height']);
    if (widget instanceof UiButton) {
      if (node.attrs['focusable'] === 'false') widget.focusable = false;
      const action = node.attrs['onpress'];
      if (action) widget.onPress = () => options.onAction?.(action, widget);
    }
    return widget;
  }
}

export interface UiTemplateBuildOptions {
  /** Valores pra `{{chave}}` nos textos. */
  data?: Record<string, string | number>;
  /** Recebe `onpress="acao"` dos botões. */
  onAction?: (action: string, button: UiButton) => void;
}

export interface UiTemplateInstance {
  readonly widgets: UiWidget[];
  /** Widget por `id=""` (ex.: atualizar um placar do HUD). */
  get(id: string): UiWidget | null;
  destroy(): void;
}

/** Compila o texto de um template (erros claros de tag/atributo). */
export function parseUiTemplate(source: string): UiTemplate {
  let html = source.replace(/<!--[^]*?-->/g, '');
  // Lixo de DEV SERVER: o vite injeta <script src="/@vite/client"> em todo
  // .html servido em dev (HMR). Scripts/doctype/meta/link são descartados —
  // template não executa código; tags DESCONHECIDAS continuam sendo erro.
  html = html
    .replace(/<script\b[^>]*>[^]*?<\/script>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/<(?:meta|link)\b[^>]*\/?>/gi, '');
  let sheet: UiStylesheet | null = null;
  html = html.replace(/<style>([^]*?)<\/style>/i, (_m, css: string) => {
    sheet = parseUiCss(css);
    return '';
  });

  const roots: TemplateNode[] = [];
  const stack: TemplateNode[] = [];
  const tokenRegex = /<(\/?)([a-zA-Z-]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (const [, close, rawTag, rawAttrs, selfClose, text] of html.matchAll(tokenRegex)) {
    if (text !== undefined) {
      const trimmed = text.trim();
      if (trimmed && stack.length > 0) stack[stack.length - 1]!.text += trimmed;
      else if (trimmed) throw new Error(`UiTemplate: texto solto fora de tag: "${trimmed}"`);
      continue;
    }
    const tag = rawTag!.toLowerCase();
    if (!TAGS.has(tag)) {
      throw new Error(
        `UiTemplate: tag <${tag}> não suportada — use ${[...TAGS].map((t) => `<${t}>`).join(', ')}`,
      );
    }
    if (close) {
      const open = stack.pop();
      if (!open || open.tag !== tag)
        throw new Error(`UiTemplate: </${tag}> sem <${tag}> correspondente`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, name, value] of rawAttrs!.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      if (name) attrs[name.toLowerCase()] = value ?? '';
    }
    const node: TemplateNode = { tag, attrs, children: [], text: '' };
    (stack.length > 0 ? stack[stack.length - 1]!.children : roots).push(node);
    if (!selfClose) stack.push(node);
  }
  if (stack.length > 0) throw new Error(`UiTemplate: <${stack[stack.length - 1]!.tag}> não fechada`);
  return new UiTemplate(roots, sheet);
}

/**
 * Carrega um template `.html` DINAMICAMENTE (fetch — funciona no browser e
 * no host, que lê do pacote do jogo) e o instancia na camada.
 */
export async function loadUiTemplate(
  ui: UiLayer,
  url: string,
  options: UiTemplateBuildOptions = {},
): Promise<UiTemplateInstance> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`loadUiTemplate: não achei "${url}" (${response.status})`);
  return parseUiTemplate(await response.text()).build(ui, options);
}
