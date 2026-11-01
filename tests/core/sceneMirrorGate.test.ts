/** SPEC-0653 — o quadro de aquecimento instala o espelho mesmo sob `setLoading(true)`. */
import { describe, it, expect } from 'vitest';
import { canInstallSceneMirror, type SceneMirrorGateState } from '../../src/core/sceneMirrorGate.js';

const ready: SceneMirrorGateState = { tried: false, loading: false, warmup: false, building: false, available: true };

describe('canInstallSceneMirror (SPEC-0653)', () => {
  it('instala com a cena pronta e fora da carga', () => {
    expect(canInstallSceneMirror(ready)).toBe(true);
  });

  it('durante a carga só o quadro de aquecimento instala', () => {
    expect(canInstallSceneMirror({ ...ready, loading: true })).toBe(false);
    expect(canInstallSceneMirror({ ...ready, loading: true, warmup: true })).toBe(true);
  });

  it('nunca no meio da montagem, sem ponte ou depois de tentar', () => {
    expect(canInstallSceneMirror({ ...ready, warmup: true, building: true })).toBe(false);
    expect(canInstallSceneMirror({ ...ready, warmup: true, available: false })).toBe(false);
    expect(canInstallSceneMirror({ ...ready, warmup: true, tried: true })).toBe(false);
  });
});
