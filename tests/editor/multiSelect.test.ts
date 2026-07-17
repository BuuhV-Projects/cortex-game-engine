/**
 * Testes da MULTI-SELEÇÃO no modelo declarativo do editor (ADR-0117):
 * - describeOutliner marca TODOS os itens do conjunto (não só o primário);
 * - describeInspector com 2+ selecionados aplica Sombra/Matte/Shader/Física (tipo)
 *   a todos, mostrando os valores do primário — cada alvo preserva os PRÓPRIOS
 *   parâmetros quando já tem o mesmo preset de shader;
 * - alvos sem malha ficam fora do Shader; alvos que não são nó de cena ficam fora
 *   do tipo de Física.
 */

import { describe, it, expect, vi } from 'vitest';
import { Mesh, Object3D } from 'three';
import { createObjectRegistry, describeInspector, describeOutliner, type InspectorField } from '../../src/editor/EditorModel.js';
import type { MaterialApi, PhysicsApi, MatteApi } from '../../src/editor/EditorInspector.js';
import type { ShadowApi } from '../../src/editor/authoring/ShadowAuthoring.js';
import type { MaterialConfig } from '../../src/scene/Materials.js';

function allFields(model: { sections: { fields: InspectorField[] }[] }): InspectorField[] {
  return model.sections.flatMap((s) => s.fields);
}
function field(model: { sections: { fields: InspectorField[] }[] }, idSuffix: string): InspectorField | undefined {
  return allFields(model).find((f) => f.id.endsWith(`:${idSuffix}`));
}

/** MaterialApi fake POR OBJETO (o do EditorModel.test é de slot único). */
function fakeMaterialApi(): { api: MaterialApi; saved: Map<Object3D, MaterialConfig> } {
  const saved = new Map<Object3D, MaterialConfig>();
  return {
    api: { get: (o) => saved.get(o) ?? null, set: (o, c) => saved.set(o, c) },
    saved,
  };
}

function namedMesh(name: string): Mesh {
  const m = new Mesh();
  m.name = name;
  return m;
}

describe('describeOutliner — multi-seleção', () => {
  it('marca TODOS os itens do conjunto, não só o primário', () => {
    const reg = createObjectRegistry();
    const root = new Object3D();
    const a = namedMesh('A');
    const b = namedMesh('B');
    const c = namedMesh('C');
    root.add(a, b, c);

    const model = describeOutliner([root], reg, c, [a, c]);
    const byLabel = Object.fromEntries(model.items.map((i) => [i.label, i.selected]));
    expect(byLabel).toEqual({ A: true, B: false, C: true });
  });

  it('sem conjunto (retrocompatível) marca só o current', () => {
    const reg = createObjectRegistry();
    const root = new Object3D();
    const a = namedMesh('A');
    const b = namedMesh('B');
    root.add(a, b);
    const model = describeOutliner([root], reg, b);
    expect(model.items.map((i) => i.selected)).toEqual([false, true]);
  });
});

describe('describeInspector — multi-seleção', () => {
  it('com 2+ selecionados: título ganha (+N) e a nota multi aparece', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('Chao');
    const b = namedMesh('Parede');
    const { model } = describeInspector(b, {}, reg, [a, b]);
    expect(model.title).toBe('Parede (+1)');
    expect(field(model, 'multiNote')?.kind).toBe('note');
  });

  it('com um só selecionado não muda nada (sem nota, sem +N)', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('Chao');
    const { model } = describeInspector(a, {}, reg, [a]);
    expect(model.title).toBe('Chao');
    expect(field(model, 'multiNote')).toBeUndefined();
  });

  it('Shader: escolher unlit aplica a TODOS os selecionados com malha', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('A');
    const b = namedMesh('B');
    const semMalha = new Object3D();
    semMalha.name = 'Luz';
    const { api, saved } = fakeMaterialApi();

    const { model, handlers } = describeInspector(b, { materialApi: api }, reg, [a, semMalha, b]);
    handlers.get(field(model, 'shader')!.id)!('unlit');

    expect(saved.get(a)).toEqual({ type: 'unlit' });
    expect(saved.get(b)).toEqual({ type: 'unlit' });
    expect(saved.has(semMalha)).toBe(false); // sem malha = sem material
  });

  it('Shader: cada alvo preserva os PRÓPRIOS parâmetros ao trocar de preset', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('Moeda');
    const b = namedMesh('Caixa');
    const { api, saved } = fakeMaterialApi();
    saved.set(a, { type: 'unlit', color: '#ffd83a', outline: 0.02 });

    const { model, handlers } = describeInspector(b, { materialApi: api }, reg, [a, b]);
    handlers.get(field(model, 'shader')!.id)!('toon');

    // A moeda mantém a cor/contorno DELA; a caixa (sem autoria) ganha o default.
    expect(saved.get(a)).toMatchObject({ type: 'toon', color: '#ffd83a', outline: 0.02 });
    expect(saved.get(b)).toEqual({ type: 'toon', gradientSteps: 3, outline: 0 });
  });

  it('Shader unlit: editar a COR aplica a todos, sem apagar os demais params de cada um', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('A');
    const b = namedMesh('B');
    const { api, saved } = fakeMaterialApi();
    saved.set(a, { type: 'unlit', outline: 0.05 }); // A tem contorno próprio
    saved.set(b, { type: 'unlit', textured: false }); // primário

    const { model, handlers } = describeInspector(b, { materialApi: api }, reg, [a, b]);
    handlers.get(field(model, 'matColor')!.id)!('#00ff00');

    expect(saved.get(a)).toMatchObject({ type: 'unlit', color: '#00ff00', outline: 0.05 });
    expect(saved.get(b)).toMatchObject({ type: 'unlit', color: '#00ff00', textured: false });
  });

  it('Sombra: aplica a todos via shadowApi', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('A');
    const b = namedMesh('B');
    const set = vi.fn();
    const shadowApi: ShadowApi = { get: () => ({}), set };

    const { model, handlers } = describeInspector(b, { shadowApi }, reg, [a, b]);
    handlers.get(field(model, 'cast')!.id)!(false);

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith(a, { castShadow: false });
    expect(set).toHaveBeenCalledWith(b, { castShadow: false });
  });

  it('Matte: aplica a todos via matteApi', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('A');
    const b = namedMesh('B');
    const set = vi.fn();
    const matteApi: MatteApi = { get: () => false, set };

    const { model, handlers } = describeInspector(b, { matteApi }, reg, [a, b]);
    handlers.get(field(model, 'matte')!.id)!(true);

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith(a, true);
    expect(set).toHaveBeenCalledWith(b, true);
  });

  it('Física: o TIPO aplica a todos os nós de cena nomeados (e só a eles)', () => {
    const reg = createObjectRegistry();
    const node = (name: string): Mesh => {
      const m = namedMesh(name);
      m.userData['cortexSceneNode'] = true;
      return m;
    };
    const a = node('A');
    const b = node('B');
    const foraDaCena = namedMesh('Codigo'); // sem cortexSceneNode → fica de fora
    const setType = vi.fn();
    const physicsApi: PhysicsApi = {
      get: () => ({
        type: 'none',
        character: { radius: 0.3, height: 1.6, gravity: -20, stepHeight: 0.3, jumpForce: 8, fallSpeedMax: 30, maxJumps: 1, groundY: 0 },
        rapier: { bodyType: 'dynamic' },
      }),
      setType,
      setCharacter: () => {},
      setRapier: () => {},
    };

    const { model, handlers } = describeInspector(b, { physicsApi }, reg, [a, foraDaCena, b]);
    handlers.get(field(model, 'physType')!.id)!('static');

    expect(setType).toHaveBeenCalledTimes(2);
    expect(setType).toHaveBeenCalledWith(a, 'static');
    expect(setType).toHaveBeenCalledWith(b, 'static');
  });

  it('seções por-objeto (transform) seguem editando SÓ o primário', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('A');
    const b = namedMesh('B');
    const { handlers } = describeInspector(b, {}, reg, [a, b]);
    handlers.get(`${reg.idOf(b)}:pos`)?.([1, 2, 3]);
    expect([b.position.x, b.position.y, b.position.z]).toEqual([1, 2, 3]);
    expect([a.position.x, a.position.y, a.position.z]).toEqual([0, 0, 0]);
  });

  it('campos que NÃO aplicam ao conjunto aparecem DESATIVADOS (disabled); os de lote não', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('A');
    const b = namedMesh('B');
    const { api } = fakeMaterialApi();
    const { model } = describeInspector(b, { materialApi: api }, reg, [a, b]);

    // Por-objeto: transform desativado.
    expect(field(model, 'pos')?.disabled).toBe(true);
    expect(field(model, 'rot')?.disabled).toBe(true);
    expect(field(model, 'size')?.disabled).toBe(true);
    // Lote: sombra/matte/shader seguem ativos.
    expect(field(model, 'cast')?.disabled).toBeUndefined();
    expect(field(model, 'matte')?.disabled).toBeUndefined();
    expect(field(model, 'shader')?.disabled).toBeUndefined();
    // Notas seguem legíveis (não são editáveis — não precisam acinzentar).
    expect(field(model, 'multiNote')?.disabled).toBeUndefined();
  });

  it('com um só selecionado nenhum campo fica desativado', () => {
    const reg = createObjectRegistry();
    const a = namedMesh('A');
    const { api } = fakeMaterialApi();
    const { model } = describeInspector(a, { materialApi: api }, reg, [a]);
    expect(allFields(model).some((f) => f.disabled)).toBe(false);
  });
});
