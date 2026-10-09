import { describe, it, expect } from 'vitest';
import { modelNormalMatrix, modelWorldMatrix, modelViewPosition, uniform } from 'three/tsl';
import { Vector3 } from 'three';
import { objectNodesFromMatrixOnly, installDrawRecipeProbe } from '../../src/render/DrawRecipeProbe.js';

/** Render object falso só com o estado de nós que a sonda lê. */
function ro(updateNodes: unknown[]) {
  return {
    getNodeBuilderState: () => ({ updateNodes, updateBeforeNodes: [], updateAfterNodes: [] }),
  } as unknown as Parameters<typeof objectNodesFromMatrixOnly>[0];
}

describe('DrawRecipeProbe', () => {
  it('aceita só nós de objeto derivados da matriz de mundo', () => {
    expect(objectNodesFromMatrixOnly(ro([modelWorldMatrix, modelNormalMatrix]))).toBe(true);
    // Posição de vista depende da câmera: o UBO do objeto muda com ela parado.
    expect(objectNodesFromMatrixOnly(ro([modelViewPosition]))).toBe(false);
    // Callback arbitrário por objeto: não dá para provar que não mudou.
    const custom = uniform(new Vector3()).onObjectUpdate(() => undefined);
    expect(objectNodesFromMatrixOnly(ro([custom]))).toBe(false);
  });

  it('desligada por padrão', () => {
    expect(installDrawRecipeProbe({})).toBeNull();
  });
});
