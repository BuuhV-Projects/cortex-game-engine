import { expect, it, vi } from 'vitest';
import { Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

const calls = vi.hoisted(() => ({
  path: vi.fn(), workers: vi.fn(), support: vi.fn(), load: vi.fn(),
}));
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({
  KTX2Loader: class {
    setTranscoderPath(path: string) { calls.path(path); return this; }
    setWorkerLimit(limit: number) { calls.workers(limit); return this; }
    detectSupport(renderer: unknown) { calls.support(renderer); return this; }
    loadAsync(url: string) { return calls.load(url); }
  },
}));
import { CortexKtx2Loader, loadKtx2, setKtx2Renderer } from '../../src/core/loadKtx2.js';

it('aguarda a GPU e carrega KTX2 externo e blob do GLB pelo mesmo transcoder local', async () => {
  let finishInit!: () => void;
  const ready = new Promise<void>(resolve => { finishInit = resolve; });
  const renderer = { init: () => ready } as unknown as WebGPURenderer;
  const texture = new Texture();
  calls.load.mockResolvedValue(texture);
  setKtx2Renderer(renderer);
  const pending = loadKtx2('assets/road.ktx2');
  expect(calls.load).not.toHaveBeenCalled();
  finishInit();
  expect(await pending).toBe(texture);
  expect(calls.support).toHaveBeenCalledWith(renderer);
  expect(calls.path.mock.calls[0][0]).toMatch(/\/basis\/$/);
  const embedded = new Promise<Texture>((resolve, reject) => {
    new CortexKtx2Loader().load('blob:embedded-road', resolve, undefined, reject);
  });
  expect(await embedded).toBe(texture);
  expect(calls.load).toHaveBeenLastCalledWith('blob:embedded-road');
  expect(calls.path).toHaveBeenCalledTimes(1);
  calls.load.mockRejectedValueOnce(new Error('Transcoder unavailable'));
  await expect(new Promise((resolve, reject) => {
    new CortexKtx2Loader().load('blob:broken', resolve, undefined, reject);
  })).rejects.toThrow('Transcoder unavailable');
});
