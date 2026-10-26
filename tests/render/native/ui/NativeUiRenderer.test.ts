import { describe, it, expect } from 'vitest';
import { DataTexture, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene } from 'three';
import { RendererUiBackend } from '../../../../src/ui/runtime/RendererUiBackend.js';
import { UiPanel } from '../../../../src/ui/runtime/widgets.js';
import { NativeUiRenderer } from '../../../../src/render/native/ui/NativeUiRenderer.js';
import { UI_QUAD_BYTES } from '../../../../src/render/native/ui/uiQuads.js';
import { UI_VIEW_TINT_AT } from '../../../../src/render/native/ui/uiWgsl.js';

/** A fake WebGPU device that records the pass commands, textures and writes. */
function fakeDevice() {
  const log: unknown[][] = [];
  const textures: Array<{ d: { size: number[] }; destroyed: boolean }> = [];
  const writes: Array<{ buffer: { label?: string }; data: ArrayLike<number> }> = [];
  let submits = 0;
  const device = {
    createBindGroupLayout: (d: unknown) => ({ kind: 'bgl', d }),
    createBindGroup: (d: unknown) => ({ kind: 'bg', d }),
    createPipelineLayout: (d: unknown) => ({ kind: 'pl', d }),
    createShaderModule: (d: unknown) => ({ kind: 'module', d }),
    createRenderPipeline: (d: unknown) => ({ kind: 'pipeline', d }),
    createSampler: () => ({ kind: 'sampler' }),
    createBuffer: (d: { label?: string; size: number }) => ({ kind: 'buffer', ...d, destroy: () => {} }),
    createTexture: (d: { size: number[] }) => {
      const t = { d, destroyed: false, createView: () => ({ kind: 'view', of: t }), destroy: () => (t.destroyed = true) };
      textures.push(t);
      return t;
    },
    createCommandEncoder: () => ({
      beginRenderPass: (d: unknown) => {
        log.push(['begin', d]);
        return {
          setPipeline: () => log.push(['pipeline']),
          setBindGroup: (i: number, g: unknown) => log.push(['group', i, g]),
          setVertexBuffer: (slot: number, b: unknown, offset: number) => log.push(['vb', slot, offset]),
          draw: (v: number, n: number) => log.push(['draw', v, n]),
          end: () => log.push(['end']),
        };
      },
      finish: () => ({ kind: 'cb' }),
    }),
    queue: {
      writeBuffer: (buffer: { label?: string }, _o: number, data: ArrayLike<number>) => writes.push({ buffer, data: Array.from(data) }),
      writeTexture: () => {},
      submit: () => submits++,
    },
  };
  return { device, log, textures, writes, submits: () => submits };
}

function uiScene(): Scene {
  const backend = new RendererUiBackend({ renderViewport: () => {} });
  backend.sync([new UiPanel({ background: '#ff0000', width: 10, height: 10 }), new UiPanel({ background: '#00ff00', width: 10, height: 10 })], { width: 800, height: 600 });
  return (backend as unknown as { _scene: Scene })._scene;
}

const camera = (): OrthographicCamera => new OrthographicCamera(0, 800, 0, -600, -10, 10);

describe('NativeUiRenderer (SPEC-0616)', () => {
  it('one pass, one submit, one instanced draw per batch at the batch offset', () => {
    const f = fakeDevice();
    const resolved = { texture: { createView: () => ({}) }, sampler: {} };
    const ui = new NativeUiRenderer(f.device, () => resolved, false);
    const scene = uiScene();
    const text = new DataTexture(new Uint8Array(4), 1, 1);
    const label = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: text }));
    label.renderOrder = 100;
    scene.add(label);
    const target = ui.render(scene, camera(), 1920, 1080);
    expect(target).toBe(f.textures[1]); // [0] = the white texture
    expect(f.submits()).toBe(1);
    const draws = f.log.filter((c) => c[0] === 'draw');
    expect(draws).toEqual([['draw', 6, 2], ['draw', 6, 1]]);
    expect(f.log.filter((c) => c[0] === 'vb').map((c) => c[2])).toEqual([0, 2 * UI_QUAD_BYTES]);
    expect(ui.stats).toMatchObject({ quads: 3, draws: 2, skipped: 0 });
  });

  it('uploads a texture only when its version changes', () => {
    const f = fakeDevice();
    let resolves = 0;
    const gpu = { createView: () => ({}) };
    const ui = new NativeUiRenderer(f.device, () => (resolves++, { texture: gpu, sampler: {} }), false);
    const scene = new Scene();
    const text = new DataTexture(new Uint8Array(4), 1, 1);
    scene.add(new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: text })));
    ui.render(scene, camera(), 100, 100);
    ui.render(scene, camera(), 100, 100);
    expect(resolves).toBe(1);
    text.needsUpdate = true;
    ui.render(scene, camera(), 100, 100);
    expect(resolves).toBe(2);
  });

  it('recreates the target on resize and destroys the old one two frames later', () => {
    const f = fakeDevice();
    const ui = new NativeUiRenderer(f.device, () => null, false);
    const scene = uiScene();
    const first = ui.render(scene, camera(), 100, 100) as { destroyed: boolean };
    const second = ui.render(scene, camera(), 200, 100);
    expect(second).not.toBe(first);
    expect(first.destroyed).toBe(false);
    ui.render(scene, camera(), 200, 100);
    expect(first.destroyed).toBe(false);
    ui.render(scene, camera(), 200, 100);
    expect(first.destroyed).toBe(true);
  });

  it('a texture not ready yet is not drawn (and is asked again next frame)', () => {
    const f = fakeDevice();
    let resolves = 0;
    const ui = new NativeUiRenderer(f.device, () => (resolves++, null), false);
    const scene = new Scene();
    scene.add(new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: new DataTexture(new Uint8Array(4), 1, 1) })));
    ui.render(scene, camera(), 100, 100);
    ui.render(scene, camera(), 100, 100);
    expect(f.log.filter((c) => c[0] === 'draw')).toEqual([]);
    expect(resolves).toBe(2);
  });

  it('?nativeUiTint=1 writes the tint into the view block', () => {
    const f = fakeDevice();
    const ui = new NativeUiRenderer(f.device, () => null, true);
    ui.render(uiScene(), camera(), 100, 100);
    const view = f.writes.find((w) => w.buffer.label === 'nativeUi.view')!;
    expect(view.data[UI_VIEW_TINT_AT]).toBeCloseTo(8 / 255);
  });
});
