import type { Audio } from 'three';

/**
 * Uma camada do motor: o pico em `rpm` (0..1) com som **com acelerador** (`on`) e/ou
 * **sem** (`off`). Ambos em loop. Camadas faltando são ignoradas.
 */
export interface EngineLayer {
  /** RPM normalizado (0..1) onde esta camada é o pico. */
  rpm: number;
  /** Som com acelerador (loop). */
  on?: Audio;
  /** Som desacelerando / sem acelerador (loop). */
  off?: Audio;
}

/** Opções do {@link EngineSound}. */
export interface EngineSoundOptions {
  /** Pitch (playbackRate) em RPM 0 / RPM 1. Default 0.9 / 1.25 — variação sutil sobre as camadas. */
  idleRate?: number;
  maxRate?: number;
  /** Volume mestre. Default 0.9. */
  volume?: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * **Som de motor em CAMADAS** (ADR-0081): faz crossfade entre faixas de RPM (low→mid→
 * high→veryhigh) e entre **com/sem acelerador** (on/off), como um motor de verdade — em
 * vez de um único loop com pitch. Todas as camadas tocam em loop simultâneo; o volume de
 * cada uma é cruzado por RPM e acelerador. Use um `THREE.Audio` por camada
 * (`audioManager.createSound(buf, { loop: true })`).
 *
 * @example
 * const eng = new EngineSound([
 *   { rpm: 0.0, on: onLow,  off: offLow },
 *   { rpm: 0.5, on: onMid,  off: offMid },
 *   { rpm: 1.0, on: onHigh, off: offHigh },
 * ]);
 * eng.start(); // por frame: eng.update(speed/maxSpeed, throttle)
 */
export class EngineSound {
  private readonly layers: EngineLayer[];

  constructor(layers: EngineLayer[], private readonly options: EngineSoundOptions = {}) {
    // Ordena por RPM (o crossfade assume crescente).
    this.layers = [...layers].sort((a, b) => a.rpm - b.rpm);
  }

  private each(fn: (s: Audio) => void): void {
    for (const l of this.layers) {
      if (l.on) fn(l.on);
      if (l.off) fn(l.off);
    }
  }

  /** Toca todas as camadas em loop (volume 0; o {@link update} faz o crossfade). */
  start(): void {
    this.each((s) => {
      s.setVolume(0);
      if (!s.isPlaying) s.play();
    });
  }

  /** Pausa todas as camadas. */
  stop(): void {
    this.each((s) => {
      if (s.isPlaying) s.pause();
    });
  }

  /** Crossfade por `rpm` (0..1) + `throttle` (0..1). Chame por frame ao dirigir. */
  update(rpm: number, throttle: number): void {
    const o = this.options;
    rpm = clamp01(rpm);
    throttle = clamp01(throttle);
    const master = o.volume ?? 0.9;
    const rate = (o.idleRate ?? 0.9) + ((o.maxRate ?? 1.25) - (o.idleRate ?? 0.9)) * rpm;

    const ls = this.layers;
    for (let i = 0; i < ls.length; i++) {
      // Peso triangular: 1 no rpm da camada, cai a 0 no rpm das vizinhas.
      const p = ls[i]!.rpm;
      const prev = i > 0 ? ls[i - 1]!.rpm : p - 0.5;
      const next = i < ls.length - 1 ? ls[i + 1]!.rpm : p + 0.5;
      let w = 0;
      if (rpm <= p) w = prev === p ? 1 : clamp01((rpm - prev) / (p - prev));
      else w = next === p ? 1 : clamp01((next - rpm) / (next - p));
      const on = ls[i]!.on;
      const off = ls[i]!.off;
      if (on) {
        on.setVolume(w * throttle * master);
        on.setPlaybackRate(rate);
      }
      if (off) {
        off.setVolume(w * (1 - throttle) * master);
        off.setPlaybackRate(rate);
      }
    }
  }

  /** Para e libera. */
  dispose(): void {
    this.stop();
  }
}
