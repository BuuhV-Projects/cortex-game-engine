import { describe, it, expect } from 'vitest';
import { Color, DataTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three';
import { RendererUiBackend, type UiRenderTarget } from '../../../../src/ui/runtime/RendererUiBackend.js';
import { UiButton, UiPanel } from '../../../../src/ui/runtime/widgets.js';
import {
  QUAD_MATRIX_AT, QUAD_MISC_AT, QUAD_SHAPE_AT, QUAD_TOP_AT, QUAD_UV_AT, UI_QUAD_FLOATS, UiQuadKind, UiQuadList,
} from '../../../../src/render/native/ui/uiQuads.js';

const VIEWPORT = { width: 800, height: 600 };
const KIND_AT = QUAD_MISC_AT + 3;

function backendScene(widgets: ConstructorParameters<typeof UiPanel>[0][]): { scene: Scene; backend: RendererUiBackend } {
  const target: UiRenderTarget = { renderViewport: () => {} };
  const backend = new RendererUiBackend(target);
  backend.sync(widgets.map((w) => new UiPanel(w)), VIEWPORT);
  return { scene: (backend as unknown as { _scene: Scene })._scene, backend };
}

function tinted(texture: DataTexture, renderOrder: number, color = 0xffffff, opacity = 1): Mesh {
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: texture, color, opacity, transparent: true }));
  mesh.renderOrder = renderOrder;
  return mesh;
}

describe('UiQuadList (SPEC-0616)', () => {
  it('reads a box of the backend: size, radius, border, colors, opacity and world matrix', () => {
    const { scene } = backendScene([{ background: '#ff0000', width: 100, height: 40, cornerRadius: 8, borderWidth: 2, borderColor: '#00ff00', opacity: 0.5 }]);
    const list = new UiQuadList();
    list.build(scene);
    expect(list.count).toBe(1);
    const d = list.data;
    expect([d[QUAD_SHAPE_AT], d[QUAD_SHAPE_AT + 1], d[QUAD_SHAPE_AT + 2], d[QUAD_SHAPE_AT + 3]]).toEqual([100, 40, 8, 2]);
    expect(d[QUAD_TOP_AT]).toBeCloseTo(1);
    expect(d[QUAD_TOP_AT + 1]).toBeCloseTo(0);
    expect(d[KIND_AT]).toBe(UiQuadKind.Box);
    expect(d[QUAD_MISC_AT + 1]).toBeCloseTo(0.5); // fillOpacity = widget opacity
    expect(d[QUAD_MISC_AT + 2]).toBe(1); // material opacity
    const mesh = scene.children[0] as Mesh;
    expect(Array.from(d.subarray(QUAD_MATRIX_AT, QUAD_MATRIX_AT + 16))).toEqual(Array.from(new Float32Array(mesh.matrixWorld.elements)));
    expect(Array.from(d.subarray(QUAD_UV_AT, QUAD_UV_AT + 4))).toEqual([1, 1, 0, 0]);
  });

  it('orders as the three orders transparents (renderOrder, then id) and batches boxes together', () => {
    const { scene } = backendScene([
      { background: '#111111', width: 10, height: 10 },
      { background: '#222222', width: 10, height: 10 },
    ]);
    const text = new DataTexture(new Uint8Array(4), 1, 1);
    // Between the two boxes (renderOrder 1 and 5): breaks the box batch.
    scene.add(tinted(text, 3, 0x0000ff, 0.25));
    const list = new UiQuadList();
    list.build(scene);
    expect(list.count).toBe(3);
    expect([0, 1, 2].map((i) => list.data[i * UI_QUAD_FLOATS + KIND_AT])).toEqual([UiQuadKind.Box, UiQuadKind.Tinted, UiQuadKind.Box]);
    expect(list.batchCount).toBe(3);
    expect(list.batches.slice(0, 3).map((b) => [b.texture, b.first, b.count])).toEqual([[null, 0, 1], [text, 1, 1], [null, 2, 1]]);
    const at = UI_QUAD_FLOATS;
    const blue = new Color(0x0000ff);
    expect([list.data[at + QUAD_TOP_AT], list.data[at + QUAD_TOP_AT + 2]]).toEqual([blue.r, blue.b]);
    expect(list.data[at + QUAD_MISC_AT + 2]).toBe(0.25);
  });

  it('consecutive boxes share one batch; a hidden mesh is not drawn', () => {
    const { scene } = backendScene([
      { background: '#111111', width: 10, height: 10 },
      { background: '#222222', width: 10, height: 10 },
      { background: '#333333', width: 10, height: 10, visible: false },
    ]);
    const list = new UiQuadList();
    list.build(scene);
    expect(list.count).toBe(2);
    expect(list.batchCount).toBe(1);
    expect(list.batches[0]!.count).toBe(2);
  });

  it('counts a material it does not know (no marker, no map) and skips it', () => {
    const scene = new Scene();
    scene.add(new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial()));
    const list = new UiQuadList();
    list.build(scene);
    expect(list.count).toBe(0);
    expect(list.skipped).toBe(1);
  });

  it('a button box is marked like the panel box', () => {
    const backend = new RendererUiBackend({ renderViewport: () => {} });
    backend.sync([new UiButton({ background: '#5aa0c0', width: 120, height: 48 })], VIEWPORT);
    const list = new UiQuadList();
    list.build((backend as unknown as { _scene: Scene })._scene);
    expect(list.count).toBe(1);
    expect(list.data[KIND_AT]).toBe(UiQuadKind.Box);
  });
});
