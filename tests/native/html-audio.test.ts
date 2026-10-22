/**
 * SPEC-0382 — `Audio`/`HTMLAudioElement` over `__cortexAudio`: the subset the
 * DDD 61 car radio uses (src, play/pause, volume, muted, ended/error).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error — host JS shim, no d.ts
import { installHtmlAudio } from '../../native/js/src/shims/html-audio.js';
// @ts-expect-error — host JS shim, no d.ts
import { installEventClasses } from '../../native/js/src/shims/event-target.js';

const VOICE = 9;
const BUFFER = 3;
const DURATION_S = 2;
const cortexAudio = {
  decode: vi.fn(() => ({ id: BUFFER, duration: DURATION_S, sampleRate: 44100, channels: 2 })),
  play: vi.fn(() => VOICE),
  setGain: vi.fn(),
  stop: vi.fn(),
  free: vi.fn(),
};

type AudioLike = HTMLAudioElement;
const make = (url?: string): AudioLike =>
  new (globalThis as unknown as { Audio: new (url?: string) => AudioLike }).Audio(url);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('__cortexAudio', cortexAudio);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  installEventClasses();
  installHtmlAudio();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('html-audio (SPEC-0382)', () => {
  it('Audio e HTMLAudioElement são a mesma classe', () => {
    const g = globalThis as unknown as { Audio: unknown; HTMLAudioElement: unknown };
    expect(g.HTMLAudioElement).toBe(g.Audio);
    expect(make() instanceof (g.HTMLAudioElement as new () => object)).toBe(true);
  });

  it('play() busca, decodifica e toca com o volume; ended dispara no fim da faixa', async () => {
    const audio = make();
    audio.volume = 0.5;
    audio.src = 'assets/sounds/music/track-01.mp3';
    const ended = vi.fn();
    audio.addEventListener('ended', ended);

    await audio.play();
    expect(fetch).toHaveBeenCalledWith('assets/sounds/music/track-01.mp3');
    expect(cortexAudio.play).toHaveBeenCalledWith(BUFFER, 0, 0.5, 1);
    expect(audio.paused).toBe(false);

    vi.advanceTimersByTime(DURATION_S * 1000);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(true);
    expect(audio.ended).toBe(true);
  });

  it('muted e volume chegam à voz ao vivo', async () => {
    const audio = make('a.mp3');
    await audio.play();
    audio.muted = true;
    expect(cortexAudio.setGain).toHaveBeenLastCalledWith(VOICE, 0);
    audio.muted = false;
    audio.volume = 0.25;
    expect(cortexAudio.setGain).toHaveBeenLastCalledWith(VOICE, 0.25);
  });

  it('pause() para a voz e cancela o ended', async () => {
    const audio = make('a.mp3');
    const ended = vi.fn();
    audio.addEventListener('ended', ended);
    await audio.play();
    audio.pause();
    expect(cortexAudio.stop).toHaveBeenCalledWith(VOICE);
    expect(audio.paused).toBe(true);
    vi.advanceTimersByTime(DURATION_S * 1000);
    expect(ended).not.toHaveBeenCalled();
  });

  it('pause() antes do decode terminar rejeita o play() com AbortError e não toca', async () => {
    const audio = make('a.mp3');
    const pending = audio.play();
    audio.pause();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cortexAudio.play).not.toHaveBeenCalled();
    expect(cortexAudio.free).toHaveBeenCalledWith(BUFFER); // PCM órfão liberado
  });

  it('trocar ou remover o src libera o PCM; getAttribute reflete o src', async () => {
    const audio = make('a.mp3');
    await audio.play();
    expect(audio.getAttribute('src')).toBe('a.mp3');
    audio.removeAttribute('src');
    audio.load();
    expect(cortexAudio.stop).toHaveBeenCalledWith(VOICE);
    expect(cortexAudio.free).toHaveBeenCalledWith(BUFFER);
    expect(audio.getAttribute('src')).toBeNull();
    await expect(audio.play()).rejects.toMatchObject({ name: 'NotSupportedError' });
  });

  it('arquivo que não decodifica dispara error e rejeita', async () => {
    cortexAudio.decode.mockReturnValueOnce(null as never);
    const audio = make('quebrado.mp3');
    const error = vi.fn();
    audio.addEventListener('error', error);
    await expect(audio.play()).rejects.toMatchObject({ name: 'NotSupportedError' });
    expect(error).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(true);
  });

  it('loop toca em loop e não dispara ended', async () => {
    const audio = make('a.mp3');
    audio.loop = true;
    const ended = vi.fn();
    audio.addEventListener('ended', ended);
    await audio.play();
    expect(cortexAudio.play).toHaveBeenCalledWith(BUFFER, 1, 1, 1);
    vi.advanceTimersByTime(DURATION_S * 1000 * 3);
    expect(ended).not.toHaveBeenCalled();
  });
});
