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

describe('webaudio-lite: ganho pela cadeia inteira (SPEC-0607)', () => {
  /** Último ganho que a voz `id` recebeu (no play ou num setGain). */
  function ganhoDa(id: number): number {
    const sets = cortexAudio.setGain.mock.calls.filter((c) => c[0] === id);
    if (sets.length > 0) return sets.at(-1)![1] as number;
    const index = cortexAudio.play.mock.results.findIndex((r) => r.value === id);
    return cortexAudio.play.mock.calls[index]![2] as number;
  }

  async function som(listener: AudioListener, volume: number, loop: boolean): Promise<{ audio: Audio; voz: number }> {
    const buffer = await listener.context.decodeAudioData(new ArrayBuffer(8));
    const s = new Audio(listener);
    s.setBuffer(buffer);
    s.setLoop(loop);
    s.setVolume(volume);
    s.play();
    return { audio: s, voz: cortexAudio.play.mock.results.at(-1)!.value as number };
  }

  beforeEach(() => {
    let next = 100;
    cortexAudio.play.mockImplementation(() => next++);
  });

  afterEach(() => {
    cortexAudio.play.mockImplementation(() => VOICE);
    vi.restoreAllMocks();
  });

  it('mutar e desmutar o mestre devolve o volume próprio de cada som (pneu em 0 fica em 0)', async () => {
    const listener = new AudioListener();
    const pneu = await som(listener, 0, true);
    const chuva = await som(listener, 0.5, true);
    listener.setMasterVolume(0);
    expect(ganhoDa(pneu.voz)).toBe(0);
    expect(ganhoDa(chuva.voz)).toBe(0);
    listener.setMasterVolume(1);
    expect(ganhoDa(pneu.voz)).toBe(0);
    expect(ganhoDa(chuva.voz)).toBeCloseTo(0.5);
    listener.setMasterVolume(0.5);
    expect(ganhoDa(chuva.voz)).toBeCloseTo(0.25);
  });

  it('um som que começa com o mestre mudo soa com o próprio volume ao desmutar', async () => {
    const listener = new AudioListener();
    listener.setMasterVolume(0);
    const tiro = await som(listener, 0.8, false);
    expect(ganhoDa(tiro.voz)).toBe(0);
    listener.setMasterVolume(1);
    expect(ganhoDa(tiro.voz)).toBeCloseTo(0.8);
  });

  it('voz parada sai das listas: mudar o mestre não a toca mais', async () => {
    const listener = new AudioListener();
    const s = await som(listener, 0.5, true);
    s.audio.stop();
    cortexAudio.setGain.mockClear();
    listener.setMasterVolume(0.3);
    expect(cortexAudio.setGain).not.toHaveBeenCalled();
  });

  it('som curto que já terminou (por tempo) sai das listas', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const listener = new AudioListener();
    const tiro = await som(listener, 0.8, false); // dura 1,5 s
    const pneu = await som(listener, 0.4, true);
    now += 2000;
    cortexAudio.setGain.mockClear();
    listener.setMasterVolume(0.5);
    expect(cortexAudio.setGain.mock.calls.map((c) => c[0])).toEqual([pneu.voz]);
    expect(ganhoDa(tiro.voz)).toBeCloseTo(0.8);
  });
});
