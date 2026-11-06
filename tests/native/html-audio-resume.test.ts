/**
 * SPEC-0700 — `Audio` do host nativo: `pause()` guarda a posição tocada e o
 * `play()` seguinte retoma dali (o rádio do carro voltava do começo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error — host JS shim, no d.ts
import { installHtmlAudio } from '../../native/js/src/shims/html-audio.js';
// @ts-expect-error — host JS shim, no d.ts
import { installEventClasses } from '../../native/js/src/shims/event-target.js';

const VOICE = 9;
const BUFFER = 3;
const DURATION_S = 10;
const cortexAudio = {
  decode: vi.fn(() => ({ id: BUFFER, duration: DURATION_S, sampleRate: 44100, channels: 2 })),
  play: vi.fn((..._args: unknown[]) => VOICE),
  setGain: vi.fn((..._args: unknown[]) => undefined),
  stop: vi.fn(),
  free: vi.fn(),
};

let now = 0;
const make = (url: string): HTMLAudioElement =>
  new (globalThis as unknown as { Audio: new (url?: string) => HTMLAudioElement }).Audio(url);
/** Avança relógio e timers juntos. */
function passa(seconds: number): void {
  now += seconds * 1000;
  vi.advanceTimersByTime(seconds * 1000);
}
const offsetDoUltimoPlay = (): number => cortexAudio.play.mock.calls.at(-1)![4] as number;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('__cortexAudio', cortexAudio);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  installEventClasses();
  installHtmlAudio();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('html-audio: retomada da pausa (SPEC-0700)', () => {
  it('pause e play retomam de onde parou; ended dispara só com o restante', async () => {
    const audio = make('radio.ogg');
    const ended = vi.fn();
    audio.addEventListener('ended', ended);
    await audio.play();
    passa(4);
    audio.pause();
    expect(audio.currentTime).toBeCloseTo(4);
    passa(30); // menu aberto: o tempo pausado não conta
    await audio.play();
    expect(offsetDoUltimoPlay()).toBeCloseTo(4);
    passa(5.9);
    expect(ended).not.toHaveBeenCalled();
    expect(audio.currentTime).toBeCloseTo(9.9);
    passa(0.1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(0); // terminou: o próximo play recomeça
  });

  it('em loop a posição dá a volta na duração', async () => {
    const audio = make('radio.ogg');
    audio.loop = true;
    await audio.play();
    passa(DURATION_S + 3);
    audio.pause();
    await audio.play();
    expect(offsetDoUltimoPlay()).toBeCloseTo(3);
  });

  it('currentTime = t tocando reinicia a voz em t', async () => {
    const audio = make('radio.ogg');
    await audio.play();
    audio.currentTime = 7;
    expect(cortexAudio.stop).toHaveBeenCalledWith(VOICE);
    expect(offsetDoUltimoPlay()).toBe(7);
    expect(audio.duration).toBe(DURATION_S);
  });

  it('trocar o src zera a posição', async () => {
    const audio = make('radio.ogg');
    await audio.play();
    passa(4);
    audio.pause();
    audio.src = 'outra.ogg';
    await audio.play();
    expect(offsetDoUltimoPlay()).toBe(0);
  });
});
