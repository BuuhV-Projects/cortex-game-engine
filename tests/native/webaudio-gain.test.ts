/**
 * SPEC-0341 — o `THREE.Audio.play()` chama `source.start()` ANTES do
 * `connect()`. O webaudio-lite tem de dar à voz nativa o ganho da cadeia real
 * (volume inicial) e registrá-la nos `GainNode` (setVolume ao vivo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Audio, AudioContext as ThreeAudioContext, AudioListener } from 'three';
// @ts-expect-error — shim JS do host, sem d.ts
import { installWebAudioLite } from '../../native/js/src/shims/webaudio-lite.js';

const VOICE = 42;
const cortexAudio = {
  decode: vi.fn(() => ({ id: 7, duration: 1.5, sampleRate: 44100, channels: 2 })),
  play: vi.fn(() => VOICE),
  setGain: vi.fn(),
  stop: vi.fn(),
  free: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__cortexAudio', cortexAudio);
  vi.stubGlobal('window', globalThis); // o three cria o contexto via window.AudioContext
  installWebAudioLite();
  ThreeAudioContext.setContext(new (globalThis as unknown as { AudioContext: new () => globalThis.AudioContext }).AudioContext());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loopNoVolume(volume: number): Promise<Audio> {
  const listener = new AudioListener();
  const buffer = await listener.context.decodeAudioData(new ArrayBuffer(8));
  const s = new Audio(listener);
  s.setBuffer(buffer);
  s.setLoop(true);
  s.setVolume(volume);
  s.play();
  return s;
}

/** Último ganho efetivo que a voz recebeu (no play ou num setGain). */
function ganhoAtual(): number {
  const sets = cortexAudio.setGain.mock.calls.filter((c) => c[0] === VOICE);
  return sets.length > 0 ? (sets.at(-1)![1] as number) : (cortexAudio.play.mock.calls.at(-1)![2] as number);
}

describe('webaudio-lite: ganho da voz (SPEC-0341)', () => {
  it('loop criado com volume 0 (pneu do DDD 61) nasce mudo', async () => {
    await loopNoVolume(0);
    expect(cortexAudio.play).toHaveBeenCalledTimes(1);
    expect(cortexAudio.play.mock.calls[0]![1]).toBe(1); // loop
    expect(ganhoAtual()).toBe(0);
  });

  it('setVolume depois do play chega à voz', async () => {
    const s = await loopNoVolume(0);
    s.setVolume(0.6);
    expect(ganhoAtual()).toBeCloseTo(0.6);
  });

  it('volume do ouvinte (mudo geral) também chega à voz', async () => {
    const s = await loopNoVolume(0.5);
    s.listener.setMasterVolume(0);
    expect(ganhoAtual()).toBe(0);
  });

  it('stop antes de ligar não toca nada', () => {
    const ctx = new AudioListener().context;
    const src = ctx.createBufferSource();
    src.buffer = { __id: 7 } as unknown as AudioBuffer;
    src.start();
    src.stop();
    src.connect(ctx.createGain());
    expect(cortexAudio.play).not.toHaveBeenCalled();
  });
});
