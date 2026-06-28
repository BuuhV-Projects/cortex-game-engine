/**
 * Testes do modelo declarativo do editor (src/editor/EditorModel.ts), a fonte
 * única que alimenta os painéis in-canvas e os nativos da IDE (ADR-0056).
 * São puros (sem DOM/three-render) — cobrem a descrição e os handlers.
 */

import { describe, it, expect } from 'vitest';
import { Mesh, Object3D, Group, BoxGeometry } from 'three';
import {
  createObjectRegistry,
  describeInspector,
  describeOutliner,
  type InspectorField,
} from '../../src/editor/EditorModel.js';
import type { MaterialApi, TerrainApi } from '../../src/editor/EditorInspector.js';
import type { MaterialConfig } from '../../src/scene/Materials.js';

function allFields(model: { sections: { fields: InspectorField[] }[] }): InspectorField[] {
  return model.sections.flatMap((s) => s.fields);
}
function field(model: { sections: { fields: InspectorField[] }[] }, idSuffix: string): InspectorField | undefined {
  return allFields(model).find((f) => f.id.endsWith(`:${idSuffix}`));
}

describe('ObjectRegistry', () => {
  it('dá ids estáveis por identidade e resolve de volta', () => {
    const reg = createObjectRegistry();
    const a = new Object3D();
    const b = new Object3D();
    const idA = reg.idOf(a);
    expect(reg.idOf(a)).toBe(idA); // estável
    expect(reg.idOf(b)).not.toBe(idA); // distinto
    expect(reg.get(idA)).toBe(a);
    expect(reg.get('inexistente')).toBeUndefined();
  });
});

describe('describeOutliner', () => {
  it('lista filhos diretos, marca o selecionado e pula internos do editor', () => {
    const reg = createObjectRegistry();
    const root = new Object3D();
    const a = new Object3D();
    a.name = 'Caixa';
    const b = new Group();
    const internal = new Object3D();
    internal.userData['editorInternal'] = true;
    root.add(a, b, internal);

    const model = describeOutliner([root], reg, b);
    expect(model.items).toHaveLength(2); // internal excluído
    const labels = model.items.map((i) => i.label);
    expect(labels).toContain('Caixa');
    expect(labels).toContain('(Group)'); // sem nome → tipo
    const selected = model.items.find((i) => i.selected);
    expect(selected?.id).toBe(reg.idOf(b));
  });
});

describe('describeInspector', () => {
  it('marca vazio quando nada está selecionado', () => {
    const reg = createObjectRegistry();
    const { model } = describeInspector(null, {}, reg);
    expect(model.empty).toBe(true);
    expect(model.sections).toHaveLength(0);
  });

  it('descreve transform/sombra/material pra um objeto qualquer', () => {
    const reg = createObjectRegistry();
    const obj = new Object3D();
    obj.name = 'Player';
    const { model } = describeInspector(obj, {}, reg);

    expect(model.empty).toBe(false);
    expect(model.title).toBe('Player');
    // pos/rot/scale presentes como vec3.
    expect(field(model, 'pos')?.kind).toBe('vec3');
    expect(field(model, 'rot')?.kind).toBe('vec3');
    expect(field(model, 'scl')?.kind).toBe('vec3');
    // sombra + matte.
    expect(field(model, 'cast')?.kind).toBe('checkbox');
    expect(field(model, 'matte')?.kind).toBe('checkbox');
  });

  it('mostra o tamanho em metros (bbox) como vec3, refletindo a escala', () => {
    const reg = createObjectRegistry();
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    const { model } = describeInspector(mesh, {}, reg);
    const size = field(model, 'size');
    expect(size?.kind).toBe('vec3');
    expect((size as { value: number[] }).value.map((n) => +n.toFixed(2))).toEqual([2, 2, 2]);

    // Escala 3 (multiplicador) → tamanho real 6 m.
    mesh.scale.set(3, 3, 3);
    const { model: m2 } = describeInspector(mesh, {}, reg);
    expect((field(m2, 'size') as { value: number[] }).value.map((n) => +n.toFixed(2))).toEqual([6, 6, 6]);
  });

  it('editar "Tamanho (m)" converte metros → escala (alvo ÷ tamanho nativo)', () => {
    const reg = createObjectRegistry();
    const mesh = new Mesh(new BoxGeometry(2, 2, 2)); // nativo 2 m
    const { handlers } = describeInspector(mesh, {}, reg);
    // pede 6 m no X (e mantém 2 m em Y/Z) → escala X = 3, Y/Z = 1
    handlers.get(`${reg.idOf(mesh)}:size`)?.([6, 2, 2]);
    expect(mesh.scale.x).toBeCloseTo(3, 5);
    expect(mesh.scale.y).toBeCloseTo(1, 5);
    expect(mesh.scale.z).toBeCloseTo(1, 5);
  });

  it('handler de posição (vec3) escreve no objeto', () => {
    const reg = createObjectRegistry();
    const obj = new Object3D();
    const { handlers } = describeInspector(obj, {}, reg);
    handlers.get(`${reg.idOf(obj)}:pos`)?.([1, 2, 3]);
    expect([obj.position.x, obj.position.y, obj.position.z]).toEqual([1, 2, 3]);
  });

  it('handler de rotação converte graus → radianos', () => {
    const reg = createObjectRegistry();
    const obj = new Object3D();
    const { handlers } = describeInspector(obj, {}, reg);
    handlers.get(`${reg.idOf(obj)}:rot`)?.([90, 0, 0]);
    expect(obj.rotation.x).toBeCloseTo(Math.PI / 2, 5);
  });

  it('mostra seção de luz com intensidade/cor pra um objeto-luz', () => {
    const reg = createObjectRegistry();
    // Simula uma luz pelo contrato estrutural usado em describeInspector.
    const light = new Object3D() as unknown as Object3D & {
      isLight: boolean;
      intensity: number;
      color: { getHexString(): string; set(hex: number): void };
    };
    (light as { isLight: boolean }).isLight = true;
    (light as { intensity: number }).intensity = 2;
    let hex = 0xffffff;
    (light as { color: { getHexString(): string; set(h: number): void } }).color = {
      getHexString: () => hex.toString(16).padStart(6, '0'),
      set: (h: number) => {
        hex = h;
      },
    };
    const { model, handlers } = describeInspector(light, {}, reg);
    expect(field(model, 'lightInt')?.kind).toBe('number');
    expect(field(model, 'lightColor')?.kind).toBe('color');
    handlers.get(`${reg.idOf(light)}:lightInt`)?.(5);
    expect((light as { intensity: number }).intensity).toBe(5);
  });

  it('inclui seção de collider quando há colliderApi (sem collider → botões de criar)', () => {
    const reg = createObjectRegistry();
    const obj = new Mesh();
    obj.name = 'Plataforma';
    const { model } = describeInspector(
      obj,
      { colliderApi: { get: () => null, add: () => {}, update: () => {}, remove: () => {}, startHeightfield: () => {}, autoHeightfield: () => {} } },
      reg,
    );
    expect(field(model, 'cldAdd')?.kind).toBe('button');
  });
});

describe('describeInspector — Shader (material)', () => {
  function fakeMaterialApi(): { api: MaterialApi; saved: () => MaterialConfig | null } {
    let saved: MaterialConfig | null = null;
    return {
      api: { get: () => saved, set: (_o, c) => { saved = c; } },
      saved: () => saved,
    };
  }

  it('mostra a seção Shader (select) e o handler aplica via materialApi + pede rebuild', () => {
    const reg = createObjectRegistry();
    const mesh = new Mesh();
    mesh.name = 'Hero';
    const { api, saved } = fakeMaterialApi();

    const first = describeInspector(mesh, { materialApi: api }, reg);
    const sel = field(first.model, 'shader');
    expect(sel?.kind).toBe('select');
    expect((sel as { value: string }).value).toBe('standard'); // sem autoria

    const res = first.handlers.get(sel!.id)!('unlit');
    expect(saved()).toEqual({ type: 'unlit' }); // sem cor — preserva as cores do original
    expect(res).toEqual({ rebuild: true });

    // re-descreve: unlit expõe dois lados + transparente (sem campo de cor —
    // o material preserva as cores reais do original, sem achatar).
    const again = describeInspector(mesh, { materialApi: api }, reg);
    expect(field(again.model, 'matColor')).toBeUndefined();
    expect(field(again.model, 'matTwoSided')?.kind).toBe('checkbox');
    again.handlers.get(field(again.model, 'matTwoSided')!.id)!(true);
    expect((saved() as { cull?: string }).cull).toBe('none');
  });

  it('não mostra Shader sem malha (ex.: Object3D vazio)', () => {
    const reg = createObjectRegistry();
    const empty = new Object3D();
    empty.name = 'Empty';
    const { api } = fakeMaterialApi();
    const { model } = describeInspector(empty, { materialApi: api }, reg);
    expect(model.sections.find((s) => s.title === 'Shader')).toBeUndefined();
  });
});

describe('describeInspector — Terreno (sculpt)', () => {
  function fakeTerrainApi(isTerrain: boolean): { api: TerrainApi; sculpting: () => boolean; mode: () => string } {
    let sculpting = false;
    let radius = 6;
    let strength = 0.5;
    let mode: 'sculpt' | 'paint' = 'sculpt';
    let texture: string | null = null;
    return {
      api: {
        get: () =>
          isTerrain
            ? { sculpting, mode, radius, strength, textures: ['assets/textures/grama.png'], texture, repeat: 5 }
            : null,
        startSculpt: () => { sculpting = true; },
        stopSculpt: () => { sculpting = false; },
        setBrush: (r, s) => { radius = r; strength = s; },
        setMode: (m) => { mode = m; },
        setTexture: (_o, url) => { texture = url || null; },
        setRepeat: () => {},
        importTexture: () => {},
      },
      sculpting: () => sculpting,
      mode: () => mode,
    };
  }

  it('mostra a seção Terreno e o botão alterna esculpir', () => {
    const reg = createObjectRegistry();
    const obj = new Object3D();
    obj.name = 'Chao';
    const { api, sculpting } = fakeTerrainApi(true);

    const first = describeInspector(obj, { terrainApi: api }, reg);
    expect(first.model.sections.find((s) => s.title === 'Terreno')).toBeDefined();
    const btn = field(first.model, 'terSculpt');
    expect(btn?.kind).toBe('button');
    expect((btn as { label: string }).label).toContain('Esculpir');
    expect(field(first.model, 'terRadius')?.kind).toBe('number');

    const res = first.handlers.get(btn!.id)!(0);
    expect(sculpting()).toBe(true);
    expect(res).toEqual({ rebuild: true });
    // re-descreve: botão agora oferece parar
    const again = describeInspector(obj, { terrainApi: api }, reg);
    expect((field(again.model, 'terSculpt') as { label: string }).label).toContain('Parar');
  });

  it('modo Texturizar: expõe seletor de textura, importação (file) e repetição', () => {
    const reg = createObjectRegistry();
    const obj = new Object3D();
    obj.name = 'Chao';
    const { api, mode } = fakeTerrainApi(true);

    const first = describeInspector(obj, { terrainApi: api }, reg);
    const modeField = field(first.model, 'terMode');
    expect(modeField?.kind).toBe('select');
    // sculpt: sem campos de textura
    expect(field(first.model, 'terTexture')).toBeUndefined();

    const res = first.handlers.get(modeField!.id)!('paint');
    expect(mode()).toBe('paint');
    expect(res).toEqual({ rebuild: true });

    // re-descreve em paint: textura (select com as imagens do projeto) + import (file)
    const paint = describeInspector(obj, { terrainApi: api }, reg);
    const tex = field(paint.model, 'terTexture');
    expect(tex?.kind).toBe('select');
    expect((tex as { options: { value: string }[] }).options.map((o) => o.value)).toContain('assets/textures/grama.png');
    expect(field(paint.model, 'terImport')?.kind).toBe('file');
    // sem textura ativa ainda: sem campo Repetição
    expect(field(paint.model, 'terRepeat')).toBeUndefined();

    // escolhe a textura → re-descreve com Repetição
    paint.handlers.get(tex!.id)!('assets/textures/grama.png');
    const withTex = describeInspector(obj, { terrainApi: api }, reg);
    expect(field(withTex.model, 'terRepeat')?.kind).toBe('number');
  });

  it('não mostra Terreno quando o objeto não é terreno (api.get → null)', () => {
    const reg = createObjectRegistry();
    const obj = new Object3D();
    obj.name = 'Caixa';
    const { api } = fakeTerrainApi(false);
    const { model } = describeInspector(obj, { terrainApi: api }, reg);
    expect(model.sections.find((s) => s.title === 'Terreno')).toBeUndefined();
  });
});
