/**
 * Widgets da UI de runtime (ADR-0102): o catálogo mínimo que HUD/menu/diálogo
 * de jogo precisam — Panel (caixa), Label (texto) e Button (focável, navegável
 * por gamepad/teclado). Widgets são DADOS + flag de sujeira; quem desenha é o
 * backend ({@link UiBackend}).
 *
 * Mutação SEMPRE via `set(...)` (marca o widget sujo pro backend re-sincronizar
 * só o que mudou — no console, re-rasterizar texto tem custo real).
 */
import type { UiAnchor } from './layout.js';

let nextWidgetId = 1;

/** Props comuns a todo widget (posicionamento ancorado + visibilidade). */
export interface UiWidgetProps {
  anchor?: UiAnchor;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  opacity?: number;
}

/** Base dos widgets: identidade, âncora/offset/tamanho e flag de sujeira. */
export abstract class UiWidget {
  readonly id = nextWidgetId++;
  anchor: UiAnchor = 'top-left';
  x = 0;
  y = 0;
  /** Tamanho declarado (Panel/Button). Labels medem no backend. */
  width = 0;
  height = 0;
  visible = true;
  opacity = 1;
  /** Tamanho MEDIDO pelo backend (texto rasterizado) — leitura. */
  measuredWidth = 0;
  measuredHeight = 0;
  /** Sujo = backend precisa re-sincronizar este widget. */
  dirty = true;

  /** Aplica props e marca o widget pra re-sincronização. */
  set(props: Partial<this>): this {
    Object.assign(this, props);
    this.dirty = true;
    return this;
  }
}

/**
 * Caixa (fundo de HUD, card de menu, faixa de banner). O estilo é um SUBSET
 * que os DOIS backends desenham igual (ADR-0102): cor/gradiente vertical,
 * canto arredondado e borda — nada de CSS arbitrário.
 */
export class UiPanel extends UiWidget {
  /** Cor CSS (`#rrggbb`). */
  background = '#000000';
  /** Se definida, gradiente vertical `background` (topo) → `backgroundTo` (base). */
  backgroundTo: string | null = null;
  /** Raio dos cantos em px (0 = reto). */
  cornerRadius = 0;
  /** Largura da borda em px (0 = sem borda). */
  borderWidth = 0;
  /** Cor da borda. */
  borderColor = '#ffffff';
  /**
   * Painel de fundo do tamanho do viewport (atributo `fill` do template). Quando
   * `true`, o UiLayer redimensiona width/height pro viewport ATUAL a cada frame —
   * sem isso o painel ficaria travado no tamanho de quando foi criado e não
   * cobriria a tela após um resize (ex.: entrar em fullscreen).
   */
  fill = false;
  constructor(
    props: UiWidgetProps &
      Partial<Pick<UiPanel, 'background' | 'backgroundTo' | 'cornerRadius' | 'borderWidth' | 'borderColor'>> = {},
  ) {
    super();
    Object.assign(this, props);
  }
}

/** Texto de uma linha (contador, título, banner). */
export class UiLabel extends UiWidget {
  text = '';
  /** Altura da fonte em px. */
  fontSize = 18;
  /** Cor CSS do texto. */
  color = '#ffffff';
  constructor(props: UiWidgetProps & Partial<Pick<UiLabel, 'text' | 'fontSize' | 'color'>> = {}) {
    super();
    Object.assign(this, props);
  }
}

/** Botão focável: Label + fundo + `onPress` (Enter/A com foco). */
export class UiButton extends UiLabel {
  background = '#222233';
  /** Cor do fundo quando focado (navegação por d-pad/setas). */
  focusBackground = '#5546a8';
  /** Raio dos cantos em px. */
  cornerRadius = 10;
  /** Borda quando FOCADO (destaque de seleção). 0 = sem. */
  focusBorderWidth = 0;
  /** Cor da borda de foco. */
  focusBorderColor = '#ffd94d';
  paddingX = 14;
  paddingY = 8;
  focused = false;
  /**
   * Entra na navegação por d-pad/setas? `false` pra botões acionados só por
   * clique/atalho (ex.: "Fases" durante o gameplay — senão o A do pulo
   * ativaria o botão focado).
   */
  focusable = true;
  onPress: (() => void) | null = null;
  constructor(
    props: UiWidgetProps &
      Partial<
        Pick<
          UiButton,
          | 'text'
          | 'fontSize'
          | 'color'
          | 'background'
          | 'focusBackground'
          | 'cornerRadius'
          | 'focusBorderWidth'
          | 'focusBorderColor'
          | 'paddingX'
          | 'paddingY'
          | 'onPress'
          | 'focusable'
        >
      > = {},
  ) {
    super();
    Object.assign(this, props);
  }
}
