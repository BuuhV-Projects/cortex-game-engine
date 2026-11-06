/**
 * SPEC-0700 — webaudio-lite: o PannerNode atenua pela distância ao ouvinte
 * (inverse/linear/exponential), o playbackRate muda ao vivo e o offset do
 * start() chega ao host.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Audio, AudioContext as ThreeAudioContext, AudioListener, PositionalAudio } from 'three';
// @ts-expect-error — shim JS do host, sem d.ts
import { installWebAudioLite } from '../../native/js/src/shims/webaudio-lite.js';

const VOICE = 42;
const cortexAudio = {
  decode: vi.fn(() => ({ id: 7, duration: 2, sampleRate: 44100, channels: 1 })),
  play: vi.fn((..._args: unknown[]) => VOICE),
  setGain: vi.fn((..._args: unknown[]) => undefined),
  setRate: vi.fn(),
  stop: vi.fn(),
  free: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__cortexAudio', cortexAudio);
  vi.stubGlobal('window', globalThis);
  installWebAudioLite();
  ThreeAudioContext.setContext(new (globalThis as unknown as { AudioContext: new () => globalThis.AudioContext }).AudioContext());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Último ganho efetivo da voz (no play ou num setGain). */
function ganhoAtual(): number {
  const sets = cortexAudio.setGain.mock.calls.filter((c) => c[0] === VOICE);
  return sets.length > 0 ? (sets.at(-1)![1] as number) : (cortexAudio.play.mock.calls.at(-1)![2] as number);
}

async function motorEm(x: number, model: DistanceModelType = 'inverse'): Promise<{ som: PositionalAudio; listener: AudioListener }> {
  const listener = new AudioListener();
  const buffer = await listener.context.decodeAudioData(new ArrayBuffer(8));
  const som = new PositionalAudio(listener);
  som.setBuffer(buffer);
  som.setLoop(true);
  som.setDistanceModel(model);
  som.setRefDistance(2);
  som.setRolloffFactor(1);
  som.setMaxDistance(42);
  som.play();
  som.position.set(x, 0, 0);
  som.updateMatrixWorld(true); // PositionalAudio → panner.setPosition
  listener.updateMatrixWorld(true); // ouvinte na origem → listener.setPosition
  return { som, listener };
}

describe('webaudio-lite: atenuação por distância (SPEC-0700)', () => {
  it('inverse: volume cheio dentro do refDistance e ref/(ref+rolloff*(d-ref)) fora', async () => {
    await motorEm(1);
    expect(ganhoAtual()).toBeCloseTo(1);
    const { som } = await motorEm(22);
    expect(ganhoAtual()).toBeCloseTo(2 / (2 + 20));
    som.position.set(102, 0, 0);
    som.updateMatrixWorld(true);
    expect(ganhoAtual()).toBeCloseTo(2 / 102);
  });

  it('linear chega a zero no maxDistance; exponential = (d/ref)^-rolloff', async () => {
    await motorEm(22, 'linear');
    expect(ganhoAtual()).toBeCloseTo(0.5); // 1 - (22-2)/(42-2)
    await motorEm(100, 'linear');
    expect(ganhoAtual()).toBeCloseTo(0);
    await motorEm(8, 'exponential');
    expect(ganhoAtual()).toBeCloseTo(0.25); // (8/2)^-1
  });

  it('mover o ouvinte recompõe o ganho, junto do volume do som e do mestre', async () => {
    const { som, listener } = await motorEm(22);
    som.setVolume(0.5);
    listener.position.set(20, 0, 0);
    listener.updateMatrixWorld(true);
    expect(ganhoAtual()).toBeCloseTo(0.5); // a 2 m: dentro do ref
    listener.setMasterVolume(0.5);
    expect(ganhoAtual()).toBeCloseTo(0.25);
  });

  it('som parado sai da lista do ouvinte', async () => {
    const { som, listener } = await motorEm(22);
    som.stop();
    cortexAudio.setGain.mockClear();
    listener.position.set(5, 0, 0);
    listener.updateMatrixWorld(true);
    expect(cortexAudio.setGain).not.toHaveBeenCalled();
  });
});

describe('webaudio-lite: tom ao vivo e offset (SPEC-0700)', () => {
  it('setPlaybackRate com a voz viva chama setRate', async () => {
    const { som } = await motorEm(1);
    som.setPlaybackRate(1.6);
    expect(cortexAudio.setRate).toHaveBeenLastCalledWith(VOICE, 1.6);
  });

  it('pause/play do THREE.Audio retoma com o offset do progresso', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const listener = new AudioListener();
    const buffer = await listener.context.decodeAudioData(new ArrayBuffer(8));
    const som = new Audio(listener);
    som.setBuffer(buffer);
    som.play();
    expect(cortexAudio.play.mock.calls.at(-1)![4]).toBe(0);
    now += 1500;
    som.pause();
    som.play();
    expect(cortexAudio.play.mock.calls.at(-1)![4]).toBeCloseTo(1.5);
  });
});
