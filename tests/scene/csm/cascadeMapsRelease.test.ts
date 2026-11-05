/**
 * Soltura dos mapas das cascatas (SPEC-0690): o `CsmNativePass` cria o mapa de cada cascata quando nenhum receptor do
 * three o criou; no teardown do nó CSM o mapa nosso é solto, e um mapa que o three trocou pelo dele não é tocado.
 */
import { describe, expect, it, vi } from 'vitest';
import { RenderTarget } from 'three';
import { ensureCascadeMap, releaseCascadeMap, type CascadeMapShadow } from '../../../src/scene/csm/cascadeMaps.js';

const MAP_SIDE = 4;

function sombra(): CascadeMapShadow {
  return { map: null, mapSize: { width: MAP_SIDE, height: MAP_SIDE } };
}

const renderer = { initRenderTarget: vi.fn() };

describe('releaseCascadeMap', () => {
  it('solta o mapa que o passe criou e limpa a shadow', () => {
    const s = sombra();
    ensureCascadeMap(s, renderer);
    const nosso = s.map as RenderTarget;
    const dispose = vi.spyOn(nosso, 'dispose');
    releaseCascadeMap(s);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(s.map).toBeNull();
  });

  it('não toca no mapa que o three pôs no lugar; só o nosso sai', () => {
    const s = sombra();
    ensureCascadeMap(s, renderer);
    const nosso = s.map as RenderTarget;
    const doThree = new RenderTarget(MAP_SIDE, MAP_SIDE);
    const disposeNosso = vi.spyOn(nosso, 'dispose');
    const disposeDoThree = vi.spyOn(doThree, 'dispose');
    s.map = doThree;
    releaseCascadeMap(s);
    expect(disposeNosso).toHaveBeenCalledTimes(1);
    expect(disposeDoThree).not.toHaveBeenCalled();
    expect(s.map).toBe(doThree);
  });

  it('shadow sem mapa nosso: não faz nada', () => {
    const s = sombra();
    releaseCascadeMap(s);
    expect(s.map).toBeNull();
  });
});
