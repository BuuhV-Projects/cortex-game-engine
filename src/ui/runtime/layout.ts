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
