/**
 * Matemática de layout da UI de runtime (ADR-0102) — pura e compartilhada
 * pelos DOIS backends (DOM e renderer), garantindo posicionamento idêntico
 * no Studio, no export PC e no console.
 *
 * Modelo: cada widget tem uma âncora (canto/borda/centro da tela), um offset
 * em pixels a partir dela e um tamanho; o PIVÔ do widget acompanha a âncora
 * (ancorou em `bottom-right`, o canto inferior-direito do widget é que fica
 * no canto da tela).
 */

/** Âncora de tela da UI de runtime. */
export type UiAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/** Viewport lógico da UI (pixels do canvas). */
export interface UiViewport {
  width: number;
  height: number;
}

/** Fração [0..1] do pivô/âncora em cada eixo. */
export interface UiFraction {
  fx: number;
  fy: number;
}

/** Retângulo resolvido em pixels (origem = canto superior-esquerdo). */
export interface UiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * **Altura de referência do design da UI** (px lógicos). Todas as telas (menus,
 * HUD, diálogos) são autoradas contra esta altura — a config default do engine é
 * 1920×1080 (ver {@link uiScale}). O layout roda SEMPRE neste espaço "de design"
 * e o backend estica pro viewport real, então a UI cresce junto com a tela (não
 * fica minúscula num 4K nem gigante num 720p). Ver ADR-0129.
 */
export const UI_REFERENCE_HEIGHT = 1080;

/** Limites do fator de escala (evita UI absurda em telas extremas). */
const UI_SCALE_MIN = 0.5;
const UI_SCALE_MAX = 4;

/**
 * Fator de escala da UI pro viewport real: `altura / {@link UI_REFERENCE_HEIGHT}`,
 * limitado. Em 1080p → 1 (idêntico ao design, sem regressão); em 4K (2160) → 2;
 * em 720p → ~0.67. Escala pela ALTURA (menus são compostos na vertical) — em
 * telas mais largas o conteúdo ancorado no centro fica centrado e o ancorado nas
 * bordas alcança as bordas (o {@link designViewport} acompanha a proporção).
 */
export function uiScale(viewport: UiViewport): number {
  const s = viewport.height / UI_REFERENCE_HEIGHT;
  return Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, s));
}

/**
 * Viewport de DESIGN (espaço lógico onde o layout é resolvido): o viewport real
 * dividido pela {@link uiScale}. O backend depois estica esse espaço até o
 * viewport real, escalando posições, tamanhos e fontes de uma vez só.
 */
export function designViewport(viewport: UiViewport, scale: number): UiViewport {
  return { width: viewport.width / scale, height: viewport.height / scale };
}

/** Fração da âncora em cada eixo (`top-left` → 0,0 · `center` → .5,.5 ...). */
export function anchorFraction(anchor: UiAnchor): UiFraction {
  const [v, h = 'center'] = anchor.split('-') as [string, string?];
  const fy = v === 'top' ? 0 : v === 'bottom' ? 1 : 0.5;
  const fx = h === 'left' ? 0 : h === 'right' ? 1 : 0.5;
  return { fx, fy };
}

/**
 * Resolve a posição final (canto superior-esquerdo, px) de um widget:
 * ponto da âncora no viewport − pivô (mesma fração) no tamanho + offset.
 */
export function resolveRect(
  anchor: UiAnchor,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  viewport: UiViewport,
): UiRect {
  const { fx, fy } = anchorFraction(anchor);
  return {
    x: viewport.width * fx - width * fx + offsetX,
    y: viewport.height * fy - height * fy + offsetY,
    width,
    height,
  };
}
