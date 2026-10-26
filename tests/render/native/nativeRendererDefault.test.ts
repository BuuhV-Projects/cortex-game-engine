import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativePrecompileRequested,
  nativeRendererRequested,
  setNativeRendererDefault,
} from '../../../src/render/native/NativeRenderer.js';

const withQuery = (search: string) => vi.stubGlobal('location', { search });

describe('native renderer default from the game option (ADR-0605, SPEC-0606)', () => {
  afterEach(() => {
    setNativeRendererDefault(false);
    vi.unstubAllGlobals();
  });

  it('off without the query and without the option', () => {
    withQuery('');
    expect(nativeRendererRequested()).toBe(false);
    expect(nativePrecompileRequested()).toBe(false);
  });

  it('the option turns on the renderer and the precompile', () => {
    withQuery('');
    setNativeRendererDefault(true);
    expect(nativeRendererRequested()).toBe(true);
    expect(nativePrecompileRequested()).toBe(true);
  });

  it('the query wins over the option', () => {
    setNativeRendererDefault(true);
    withQuery('?nativeRenderer=0');
    expect(nativeRendererRequested()).toBe(false);
    withQuery('?nativePrecompile=0');
    expect(nativeRendererRequested()).toBe(true);
    expect(nativePrecompileRequested()).toBe(false);
    setNativeRendererDefault(false);
    withQuery('?nativeRenderer=1&nativePrecompile=1');
    expect(nativeRendererRequested()).toBe(true);
    expect(nativePrecompileRequested()).toBe(true);
  });
});
