/**
 * MaterialAuthoring — o Inspector mostra o material EFETIVO:
 * override do editor > `material` do nó (userData.cortexNodeDef) > null;
 * e "Padrão" sobre nó com material persiste `{type:'standard'}` explícito
 * (deletar deixaria o material do nó voltar no reload).
 */
import { describe, it, expect, vi } from 'vitest';
import { Object3D } from 'three';
import { createMaterialApi } from '../../src/editor/authoring/MaterialAuthoring.js';
import type { MaterialConfig } from '../../src/scene/Materials.js';
import type { EditorAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';

function fakeCtx(store: Record<string, MaterialConfig>): EditorAuthoringContext {
  return {
    record: () => store,
    persist: vi.fn(),
  } as unknown as EditorAuthoringContext;
}

function nodeObj(name: string, material?: MaterialConfig): Object3D {
  const o = new Object3D();
  o.name = name;
  (o.userData as Record<string, unknown>)['cortexNodeDef'] = { type: 'model', id: name, material };
  return o;
}

describe('MaterialAuthoring (material efetivo no Inspector)', () => {
  it('sem override: mostra o material declarado no NÓ', () => {
    const api = createMaterialApi(fakeCtx({}));
    const obj = nodeObj('moeda1', { type: 'unlit', outline: 0.02 });
    expect(api.get(obj)).toEqual({ type: 'unlit', outline: 0.02 });
  });

  it('override do editor vence o material do nó', () => {
    const api = createMaterialApi(fakeCtx({ moeda1: { type: 'toon' } }));
    const obj = nodeObj('moeda1', { type: 'unlit' });
    expect(api.get(obj)).toEqual({ type: 'toon' });
  });

  it('sem nada: null (Padrão)', () => {
    const api = createMaterialApi(fakeCtx({}));
    expect(api.get(nodeObj('plat1'))).toBeNull();
  });

  it("'standard' sobre nó COM material persiste override explícito", () => {
    const store: Record<string, MaterialConfig> = {};
    const api = createMaterialApi(fakeCtx(store));
    const obj = nodeObj('moeda1', { type: 'unlit' });
    api.set(obj, { type: 'standard' });
    expect(store['moeda1']).toEqual({ type: 'standard' }); // vence o nó no reload
  });

  it("'standard' sobre nó SEM material remove a autoria (comportamento antigo)", () => {
    const store: Record<string, MaterialConfig> = { plat1: { type: 'toon' } };
    const api = createMaterialApi(fakeCtx(store));
    api.set(nodeObj('plat1'), { type: 'standard' });
    expect(store['plat1']).toBeUndefined();
  });
});
