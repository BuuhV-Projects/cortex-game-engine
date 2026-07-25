/**
 * TDR-0004 — `AudioBuffer.free()` do webaudio-lite (ADR-0153): libera o PCM
 * decodificado no lado C++ (`__cortexAudio.free`). Sem isto o `g_buffers` do
 * host só crescia (RAM por fase). Idempotente: dois `free()` = um free nativo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error — shim JS do host, sem d.ts
import { installWebAudioLite } from '../../native/js/src/shims/webaudio-lite.js';

const cortexAudio = {
  decode: vi.fn(() => ({ id: 7, duration: 1.5, sampleRate: 44100, channels: 2 })),
  play: vi.fn(() => 1),
  setGain: vi.fn(),
  stop: vi.fn(),
  free: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__cortexAudio', cortexAudio);
  installWebAudioLite();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('webaudio-lite free (ADR-0153/TDR-0004)', () => {
  it('decodeAudioData produz buffer com free() que libera no nativo UMA vez', async () => {
    const Ctx = (globalThis as Record<string, unknown>)['AudioContext'] as new () => {
      decodeAudioData(data: ArrayBuffer): Promise<{ free(): void; duration: number }>;
    };
    const ctx = new Ctx();
    const buffer = await ctx.decodeAudioData(new ArrayBuffer(8));
    expect(buffer.duration).toBe(1.5);

    buffer.free();
    buffer.free(); // idempotente
    expect(cortexAudio.free).toHaveBeenCalledTimes(1);
    expect(cortexAudio.free).toHaveBeenCalledWith(7);
  });
});
