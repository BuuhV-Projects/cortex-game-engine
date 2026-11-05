/**
 * A escolha de cascata do receptor da CSM, em TS puro (SPEC-0690, item 5): a mesma conta do `CSMShadowNode` do
 * three (`_setupFade` e `_setupStandard`, three 0.184) e do WGSL `nativeShadowCsm` (`shadowCsm.ts`). Existe para o
 * teste de paridade comparar a emenda do receptor nativo com a do three sem GPU.
 */

/** A margem da emenda é `0,25 · borda²` (`_setupFade`: `float(0.25).mul(closestEdge.pow(2.0))`). */
export const CSM_FADE_MARGIN_SCALE = 0.25;
export const CSM_FADE_MARGIN_POWER = 2;
/** A margem se divide entre as duas cascatas vizinhas. */
const HALF = 2;
/** Floats por cascata em `ranges`: `near`, `far`. */
export const CSM_RANGE_FLOATS = 2;

/**
 * `viewZToOrthographicDepth` do three: a profundidade de visão (`positionView.z`, negativa à frente da câmera)
 * como fração linear entre `near` e `far`.
 */
export function viewZToOrthographicDepth(viewZ: number, near: number, far: number): number {
  return (viewZ + near) / (near - far);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Fator de sombra do CSM (1 = luz plena).
 *
 * @param linearDepth - {@link viewZToOrthographicDepth} do fragmento com `camera.near` e `shadowFar`.
 * @param ranges - `[near0, far0, near1, far1, ...]`: as `_cascades` do nó, frações de `shadowFar`.
 * @param count - Cascatas em `ranges`.
 * @param fade - O `fade` do nó: mistura as vizinhas na emenda (`_setupFade`); sem ele, `_setupStandard`.
 * @param sample - O fator da cascata `i` (já misturado pela intensidade). Só é chamado para quem pesa no ponto,
 *   como o ramo do WGSL.
 */
export function csmShadowFactor(
  linearDepth: number,
  ranges: ArrayLike<number>,
  count: number,
  fade: boolean,
  sample: (cascade: number) => number,
): number {
  let ret = 1;
  if (!fade) {
    for (let i = 0; i < count; i++) {
      const near = ranges[i * CSM_RANGE_FLOATS]!;
      const far = ranges[i * CSM_RANGE_FLOATS + 1]!;
      if (linearDepth >= near && linearDepth <= far) ret = sample(i);
    }
    return ret;
  }
  const last = count - 1;
  for (let i = 0; i < count; i++) {
    const near = ranges[i * CSM_RANGE_FLOATS]!;
    const far = ranges[i * CSM_RANGE_FLOATS + 1]!;
    const center = (near + far) / HALF;
    const closestEdge = linearDepth < center ? near : far;
    const margin = CSM_FADE_MARGIN_SCALE * closestEdge ** CSM_FADE_MARGIN_POWER;
    const csmX = near - margin / HALF;
    const csmY = i === last ? far : far + margin / HALF;
    if (linearDepth >= csmX && linearDepth <= csmY) {
      const dist = Math.min(linearDepth - csmX, csmY - linearDepth);
      let ratio = clamp01(dist / margin);
      // A primeira cascata não esmaece na borda de perto.
      if (i === 0 && !(linearDepth > center)) ratio = 1;
      ret -= (1 - sample(i)) * ratio;
    }
  }
  return ret;
}
