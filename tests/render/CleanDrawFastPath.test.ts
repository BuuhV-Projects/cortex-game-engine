import { describe, it, expect } from 'vitest';
import { Color, Matrix4, MeshBasicMaterial, Texture } from 'three';
import { modelWorldMatrix } from 'three/tsl';
import {
  installCleanDrawFastPath,
  pushValue,
  quickMatch,
  snapshot,
  watchersFor,
  type CleanDrawRendererLike,
  type CleanRoLike,
} from '../../src/render/CleanDrawFastPath.js';

const OBJECT = 'object';

/** Nó falso com o tipo de update pedido. */
function no(extra: Record<string, unknown>, tipo = OBJECT) {
  return { getUpdateType: () => tipo, ...extra };
}

function roFalso(updateNodes: unknown[], material: Record<string, unknown>, fog?: Record<string, unknown>) {
  const geometry = {
    id: 1,
    attributes: { position: { id: 10, version: 0 } },
    index: { id: 11, version: 0 },
    drawRange: { start: 0, count: Infinity },
  };
  const object = { matrixWorld: new Matrix4(), geometry, receiveShadow: true };
  const monitor = { hasNode: false, hasAnimation: false, renderId: 0, refreshUniforms: [] as string[] };
  const ro = {
    object,
    material,
    geometry,
    camera: null,
    drawRange: null,
    group: null,
    bundle: null,
    onDispose: () => undefined,
    getMonitor: () => monitor,
    getNodeBuilderState: () => ({ updateNodes, updateBeforeNodes: [], updateAfterNodes: [] }),
    getBindings: () => [],
  };
  return { ro: ro as unknown as CleanRoLike, object, material, fog, monitor };
}

function materialFalso(): Record<string, unknown> {
  // Material REAL: a conferência rápida lê os campos que todo `Material` tem.
  return new MeshBasicMaterial({ color: new Color(1, 0, 0), map: new Texture() }) as unknown as Record<string, unknown>;
}

describe('CleanDrawFastPath — instantâneo', () => {
  it('pushValue cobre número, cor, textura (com UV) e recusa o desconhecido', () => {
    const out: number[] = [];
    expect(pushValue(out, 2)).toBe(true);
    expect(pushValue(out, new Color(0.5, 0.25, 0))).toBe(true);
    const t = new Texture();
    expect(pushValue(out, t)).toBe(true);
    const antes = [...out];
    t.offset.x = 0.5; // UV scroll
    out.length = 0;
    pushValue(out, 2);
    pushValue(out, new Color(0.5, 0.25, 0));
    pushValue(out, t);
    expect(out).not.toEqual(antes);
    expect(pushValue(out, () => 1)).toBe(false);
    expect(pushValue(out, { qualquer: 1 })).toBe(false);
  });

  it('vigia material, névoa e textura solta; a textura saída de referência não', () => {
    const fog = { color: new Color(0.1, 0.2, 0.3), near: 10, far: 500 };
    const saidaDoMapa = no({ type: 'TextureNode', isTextureNode: true });
    const solta = no({ type: 'TextureNode', isTextureNode: true, value: new Texture() });
    const nodes = [
      modelWorldMatrix,
      no({ type: 'UniformGroupNode' }),
      no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['color'], material: null }),
      no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['map'], material: null, node: saidaDoMapa }),
      no({ type: 'ReferenceNode', properties: ['near'], object: fog }),
      saidaDoMapa,
      solta,
      no({ type: 'CameraNode' }, 'render'), // não é OBJECT: ignorado
    ];
    const { ro } = roFalso(nodes, materialFalso(), fog);
    const vigias = watchersFor(ro)!;
    expect(vigias).not.toBeNull();
    expect(vigias.map((v) => v.properties.join('.'))).toEqual(['color', 'map', 'near', 'value']);
  });

  it('nó de objeto desconhecido recusa a gravação', () => {
    const { ro } = roFalso([no({ type: 'UniformNode' })], materialFalso());
    expect(watchersFor(ro)).toBeNull();
  });

  it('o instantâneo muda com matriz, cor, névoa, campo de pipeline e atributo', () => {
    const fog = { color: new Color(0.1, 0.2, 0.3), near: 10, far: 500 };
    const nodes = [
      no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['color'], material: null }),
      no({ type: 'ReferenceNode', properties: ['near'], object: fog }),
    ];
    const { ro, object, material } = roFalso(nodes, materialFalso(), fog);
    const vigias = watchersFor(ro)!;
    const base: number[] = [];
    expect(snapshot(ro, vigias, base)).toBe(true);
    const mudancas: (() => void)[] = [
      () => object.matrixWorld.makeTranslation(1, 0, 0),
      () => (material['color'] as Color).setRGB(0, 1, 0),
      () => (fog.near = 20),
      () => (material['transparent'] = true),
      () => (material['version'] = 1),
      () => object.geometry.attributes.position!.version++,
    ];
    let anterior = [...base];
    for (const mudar of mudancas) {
      mudar();
      const agora: number[] = [];
      snapshot(ro, vigias, agora);
      expect(agora).not.toEqual(anterior);
      anterior = agora;
    }
  });
});

describe('CleanDrawFastPath — conferência rápida', () => {
  it('codifica igual à gravação e detecta cada mudança', () => {
    const fog = { color: new Color(0.1, 0.2, 0.3), near: 10, far: 500 };
    const solta = no({ type: 'TextureNode', isTextureNode: true, value: new Texture() });
    const nodes = [
      no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['color'], material: null }),
      no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['opacity'], material: null }),
      no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['map'], material: null }),
      no({ type: 'ReferenceNode', properties: ['near'], object: fog }),
      solta,
    ];
    const { ro, object, material } = roFalso(nodes, materialFalso(), fog);
    const vigias = watchersFor(ro)!;
    const gravar = () => {
      const lista: number[] = [];
      expect(snapshot(ro, vigias, lista)).toBe(true);
      return Float64Array.from(lista);
    };
    let inst = gravar();
    expect(quickMatch(ro, vigias, inst)).toBe(true);
    const mudancas: (() => void)[] = [
      () => object.matrixWorld.makeTranslation(0, 1, 0),
      () => (object.receiveShadow = false),
      () => (material['color'] as Color).setRGB(0, 0, 1),
      () => (material['opacity'] = 0.5),
      () => ((material['map'] as Texture).offset.x = 0.25),
      () => ((material['map'] as Texture).version = 3),
      () => (material['map'] = null),
      () => (material['map'] = new Texture()),
      () => (fog.near = 99),
      () => (((solta as unknown as { value: Texture }).value).repeat.y = 2),
      () => (material['transparent'] = true),
      () => (material['side'] = 2),
      () => (material['blendSrcAlpha'] = 204),
      () => (material['version'] = 5),
      () => object.geometry.attributes.position!.version++,
      () => (object.geometry.drawRange.count = 3),
    ];
    for (const mudar of mudancas) {
      mudar();
      expect(quickMatch(ro, vigias, inst)).toBe(false);
      inst = gravar();
      expect(quickMatch(ro, vigias, inst)).toBe(true);
    }
  });
});

describe('installCleanDrawFastPath', () => {
  function rendererFalso() {
    const chamadas = { original: 0, draw: 0, updateBefore: 0 };
    const nodes = {
      updateBefore: () => void chamadas.updateBefore++,
      getNodeFrameForRender: () => ({ renderId: 7, updateNode: () => undefined }),
      getCacheKey: () => 'amb',
    };
    const renderer: CleanDrawRendererLike & { ro?: CleanRoLike } = {
      _nodes: nodes,
      _bindings: { _update: () => undefined },
      _pipelines: { isReady: () => true },
      backend: { draw: () => void chamadas.draw++ },
      _currentRenderContext: {},
      _currentRenderBundle: null,
      info: { calls: 1 },
      contextNode: { version: 0 },
      _renderObjectDirect(this: CleanDrawRendererLike) {
        chamadas.original++;
        this.backend!.draw!(renderer.ro, null);
      },
    };
    return { renderer, chamadas };
  }

  it('grava no caminho do three, desenha direto quando nada mudou e volta ao three na mudança', () => {
    const nodes = [no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['color'], material: null })];
    const { ro, object, material, monitor } = roFalso(nodes, materialFalso());
    const { renderer, chamadas } = rendererFalso();
    renderer.ro = ro;
    const handle = installCleanDrawFastPath(renderer)!;
    const chamar = () => renderer._renderObjectDirect!(object, material, 'cena', 'cam', 'luzes', null, null, null);

    chamar();
    expect(chamadas.original).toBe(1);
    expect(handle.stats.recorded).toBe(1);

    chamar();
    expect(chamadas.original).toBe(1); // direto
    expect(chamadas.draw).toBe(2);
    expect(chamadas.updateBefore).toBe(1);
    expect(monitor.renderId).toBe(7);
    expect(handle.stats.direct).toBe(1);

    (material['color'] as Color).setRGB(0, 0, 1);
    chamar();
    expect(chamadas.original).toBe(2); // mudou: three refaz e regrava
    chamar();
    expect(chamadas.original).toBe(2);

    // Outro material no mesmo objeto, ou outro contexto: three.
    renderer._renderObjectDirect!(object, materialFalso(), 'cena', 'cam', 'luzes', null, null, null);
    expect(chamadas.original).toBe(3);
    renderer._currentRenderContext = {};
    chamar();
    expect(chamadas.original).toBe(4);

    // Render object descartado não é desenhado direto.
    ro.onDispose();
    chamar();
    expect(chamadas.original).toBe(5);
    handle.uninstall();
  });

  it('objeto que só se moveu desenha direto com o plano de transformação', () => {
    const nodes = [no({ type: 'MaterialReferenceNode', isMaterialReferenceNode: true, properties: ['color'], material: null })];
    const { ro, object, material } = roFalso(nodes, materialFalso());
    const { renderer, chamadas } = rendererFalso();
    const escritas: unknown[] = [];
    renderer.backend!.updateBinding = (b) => void escritas.push(b);
    renderer.ro = ro;
    const handle = installCleanDrawFastPath(renderer)!;
    const chamar = () => renderer._renderObjectDirect!(object, material, 'cena', 'cam', 'luzes', null, null, null);
    chamar();
    object.matrixWorld.makeTranslation(5, 0, 0);
    chamar();
    expect(chamadas.original).toBe(1);
    expect(handle.stats.moved).toBe(1);
    chamar(); // parado de novo na posição nova: direto, sem plano
    expect(handle.stats.moved).toBe(1);
    expect(handle.stats.direct).toBe(2);
    // Mexeu a matriz E a cor: o three refaz.
    object.matrixWorld.makeTranslation(6, 0, 0);
    (material['color'] as Color).setRGB(0, 1, 0);
    chamar();
    expect(chamadas.original).toBe(2);
  });

  it('nó animado nunca é gravado', () => {
    const { ro, object, material, monitor } = roFalso([], materialFalso());
    monitor.hasAnimation = true;
    const { renderer, chamadas } = rendererFalso();
    renderer.ro = ro;
    const handle = installCleanDrawFastPath(renderer)!;
    renderer._renderObjectDirect!(object, material, 'c', 'k', 'l', null, null, null);
    renderer._renderObjectDirect!(object, material, 'c', 'k', 'l', null, null, null);
    expect(chamadas.original).toBe(2);
    expect(handle.stats.ineligible).toBe(1);
  });
});
