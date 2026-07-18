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
 * do CSS **com os MESMOS nomes do HTML5** (filosofia DOM-lite: não reinventar
 * — `background`, `borderRadius`, `boxShadow`...), que os DOIS backends
 * desenham igual (ADR-0102). Toda cor aceita alpha (`#rrggbbaa`/`rgba(...)`).
 */
export class UiPanel extends UiWidget {
  /**
   * `background` do CSS: cor (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) OU
   * gradiente `linear-gradient(180deg|90deg, c1, c2)` (180deg = topo→base,
   * 90deg = esquerda→direita — únicos ângulos do subset).
   */
  background = '#000000';
  /** @deprecated Use `background: 'linear-gradient(180deg, c1, c2)'` (CSS). */
  backgroundTo: string | null = null;
  /** Raio dos cantos em px (0 = reto). Nome legado de {@link borderRadius}. */
  cornerRadius = 0;
  /** `border-radius` do CSS (px). Alias primário de {@link cornerRadius}. */
  get borderRadius(): number {
    return this.cornerRadius;
  }
  set borderRadius(value: number) {
    this.cornerRadius = value;
  }
  /** `border-width` do CSS (px; 0 = sem borda). */
  borderWidth = 0;
  /** `border-color` do CSS. */
  borderColor = '#ffffff';
  /**
   * `box-shadow` do CSS, no subset SOMBRA DURA: `"0 Npx 0 <cor>"` (a sombra
   * chapada dos botões cartoon) ou `"none"`. Sem blur/spread — os dois
   * backends desenham uma cópia da caixa deslocada N px pra baixo.
   */
  boxShadow = 'none';
  /**
   * URL de uma **imagem de fundo** (ex.: arte do menu). Cobre o painel
   * ("cover" — preenche sem distorcer, corta o excedente) por cima da
   * cor/gradiente (que ficam de fallback enquanto a imagem carrega). `null` =
   * sem imagem. Funciona nos dois backends (DOM: `background-image`; console:
   * quad texturizado). Atributo `image` no template.
   */
  backgroundImage: string | null = null;
  /**
   * Painel de fundo do tamanho do viewport (atributo `fill` do template). Quando
   * `true`, o UiLayer redimensiona width/height pro viewport ATUAL a cada frame —
   * sem isso o painel ficaria travado no tamanho de quando foi criado e não
   * cobriria a tela após um resize (ex.: entrar em fullscreen).
   */
  fill = false;
  constructor(
    props: UiWidgetProps &
      Partial<
        Pick<
          UiPanel,
          | 'background'
          | 'backgroundTo'
          | 'cornerRadius'
          | 'borderRadius'
          | 'borderWidth'
          | 'borderColor'
          | 'backgroundImage'
          | 'boxShadow'
        >
      > = {},
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
  /** `background` do CSS: cor OU `linear-gradient(180deg, c1, c2)`. */
  background = '#222233';
  /** Fundo quando focado (o `:focus` do CSS): cor ou gradiente. */
  focusBackground = '#5546a8';
  /** Raio dos cantos em px. Nome legado de {@link borderRadius}. */
  cornerRadius = 10;
  /** `border-radius` do CSS (px). Alias primário de {@link cornerRadius}. */
  get borderRadius(): number {
    return this.cornerRadius;
  }
  set borderRadius(value: number) {
    this.cornerRadius = value;
  }
  /** `border-width` do CSS — borda CONSTANTE (moldura dos botões cartoon). 0 = sem. */
  borderWidth = 0;
  /** `border-color` do CSS (borda constante). */
  borderColor = '#ffffff';
  /** Borda quando FOCADO (destaque de seleção; vence a constante). 0 = sem. */
  focusBorderWidth = 0;
  /** Cor da borda de foco. */
  focusBorderColor = '#ffd94d';
  /** `box-shadow` do CSS (subset `"0 Npx 0 <cor>"` — sombra dura) ou `"none"`. */
  boxShadow = 'none';
  /** `text-align` do CSS dentro do botão (`left`/`right` respeitam `paddingX`). */
  textAlign: 'center' | 'left' | 'right' = 'center';
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
          | 'borderRadius'
          | 'borderWidth'
          | 'borderColor'
          | 'focusBorderWidth'
          | 'focusBorderColor'
          | 'boxShadow'
          | 'textAlign'
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
