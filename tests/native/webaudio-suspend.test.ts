/**
 * SPEC-0701 — `suspend()`/`resume()` do `AudioContextLite`: o jogo cala os sons do mundo na pausa suspendendo o
 * contexto. O host não pausa voz, então o shim manda ganho 0 a toda voz viva e devolve o da cadeia no resume.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Audio, AudioContext as ThreeAudioContext, AudioListener } from 'three';
// @ts-expect-error — shim JS do host, sem d.ts
import { installWebAudioLite } from '../../native/js/src/shims/webaudio-lite.js';

let nextVoice = 1;
const cortexAudio = {
  decode: vi.fn(() => ({ id: 7, duration: 1.5, sampleRate: 44100, channels: 2 })),
  play: vi.fn(() => nextVoice++),
  setGain: vi.fn(),
  setRate: vi.fn(),
  stop: vi.fn(),
  free: vi.fn(),
};

let context: globalThis.AudioContext;

beforeEach(() => {
  vi.clearAllMocks();
  nextVoice = 1;
  vi.stubGlobal('__cortexAudio', cortexAudio);
  vi.stubGlobal('window', globalThis); // o three cria o contexto via window.AudioContext
  installWebAudioLite();
  context = new (globalThis as unknown as { AudioContext: new () => globalThis.AudioContext }).AudioContext();
  ThreeAudioContext.setContext(context);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loop(listener: AudioListener, volume: number): Promise<Audio> {
  const buffer = await listener.context.decodeAudioData(new ArrayBuffer(8));
  const s = new Audio(listener);
  s.setBuffer(buffer);
  s.setLoop(true);
  s.setVolume(volume);
  s.play();
  return s;
}

/** Último ganho que a voz `voice` recebeu (no play ou num setGain). */
function gainOf(voice: number): number {
  const sets = cortexAudio.setGain.mock.calls.filter((c) => c[0] === voice);
  if (sets.length > 0) return sets.at(-1)![1] as number;
  const born = cortexAudio.play.mock.results.findIndex((r) => r.value === voice);
  return cortexAudio.play.mock.calls[born]![2] as number;
}

describe('webaudio-lite: suspend/resume do contexto (SPEC-0701)', () => {
  it('suspend cala todo loop vivo e resume devolve o ganho de cada um', async () => {
    const listener = new AudioListener();
    await loop(listener, 0.5);
    await loop(listener, 0.2);
    await context.suspend();
    expect(context.state).toBe('suspended');
    expect(gainOf(1)).toBe(0);
    expect(gainOf(2)).toBe(0);
    await context.resume();
    expect(context.state).toBe('running');
    expect(gainOf(1)).toBeCloseTo(0.5);
    expect(gainOf(2)).toBeCloseTo(0.2);
  });

  it('setVolume durante a suspensão fica mudo e vale no resume', async () => {
    const listener = new AudioListener();
    const s = await loop(listener, 0.5);
    await context.suspend();
    s.setVolume(0.8);
    expect(gainOf(1)).toBe(0);
    await context.resume();
    expect(gainOf(1)).toBeCloseTo(0.8);
  });

  it('som que nasce com o contexto suspenso nasce mudo', async () => {
    const listener = new AudioListener();
    await context.suspend();
    await loop(listener, 0.6);
    expect(cortexAudio.play.mock.calls[0]![2]).toBe(0);
    await context.resume();
    expect(gainOf(1)).toBeCloseTo(0.6);
  });

  it('voz parada não recebe ganho no resume', async () => {
    const listener = new AudioListener();
    const s = await loop(listener, 0.5);
    s.stop();
    await context.suspend();
    await context.resume();
    expect(cortexAudio.setGain.mock.calls.filter((c) => c[0] === 1)).toHaveLength(0);
  });
});
