import type { Audio } from 'three';

/**
 * Uma camada do motor: o pico em `rpm` (0..1) com som **com acelerador** (`on`) e/ou
 * **sem** (`off`). Ambos em loop. Camadas faltando são ignoradas.
 */
export interface EngineLayer {
  /** RPM normalizado (0..1) — usado pra ordenar (low→high). */
  rpm: number;
  /** Som com acelerador (loop). */
  on?: Audio;
  /** Som desacelerando / sem acelerador (loop). */
  off?: Audio;
}

/** Opções do {@link EngineSound}. */
export interface EngineSoundOptions {
  /** Nº de "marchas" — o tom sobe dentro da marcha e CAI ao trocar (sensação de câmbio). Default 5. */
  gears?: number;
  /** Pitch no início / fim de cada marcha (rotação baixa → corte). Default 0.8 / 1.6. */
  idleRate?: number;
  maxRate?: number;
  /** Volume mestre. Default 0.9. */
  volume?: number;
  /** Suavização do volume entre camadas (0..1 por frame) — evita clique na troca. Default 0.25. */
  volumeSmooth?: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * **Som de motor com MARCHAS** (ADR-0081). Em vez de só cruzar volumes (que soa
 * artificial), o tom (playbackRate) **sobe com a rotação dentro da marcha e CAI ao trocar
 * de marcha** — a sensação de um carro acelerando e trocando o câmbio. As camadas (faixas
 * de RPM) dão variação de timbre: marchas baixas usam a amostra grave, altas a aguda. Faz
 * crossfade on/off (acelerador) e suaviza a troca de amostra (sem clique).
 *
 * @example
 * const eng = new EngineSound([
 *   { rpm: 0, on: onLow, off: offLow }, { rpm: 0.5, on: onMid, off: offMid }, { rpm: 1, on: onHigh, off: offHigh },
 * ]);
 * eng.start(); // por frame: eng.update(speed/maxSpeed, throttle)
 */
export class EngineSound {
  private readonly layers: EngineLayer[];
  private readonly vol = new Map<Audio, number>(); // volume atual (pra suavizar)

  constructor(layers: EngineLayer[], private readonly options: EngineSoundOptions = {}) {
    this.layers = [...layers].sort((a, b) => a.rpm - b.rpm);
  }

  private each(fn: (s: Audio) => void): void {
    for (const l of this.layers) {
      if (l.on) fn(l.on);
      if (l.off) fn(l.off);
    }
  }

  /** Toca todas as camadas em loop (volume 0; o {@link update} controla). */
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

  /** Atualiza por frame: `speedRatio` (0..1) define a marcha+rotação; `throttle` (0..1) o on/off. */
  update(speedRatio: number, throttle: number): void {
    const o = this.options;
    speedRatio = clamp01(speedRatio);
    throttle = clamp01(throttle);
    const gears = Math.max(1, o.gears ?? 5);
    const master = o.volume ?? 0.9;
    const smooth = o.volumeSmooth ?? 0.25;

    // Marcha + rotação dentro dela → tom sobe e CAI na troca (dente-de-serra).
    const pos = speedRatio * gears;
    const gear = Math.min(gears - 1, Math.floor(pos));
    const inGear = pos - gear; // 0..1
    const rate = (o.idleRate ?? 0.8) + ((o.maxRate ?? 1.6) - (o.idleRate ?? 0.8)) * inGear;

    // Amostra (timbre) pela marcha: baixas usam a grave, altas a aguda.
    const band = Math.min(this.layers.length - 1, Math.floor((gear / gears) * this.layers.length));

    for (let i = 0; i < this.layers.length; i++) {
      const active = i === band ? 1 : 0;
      const on = this.layers[i]!.on;
      const off = this.layers[i]!.off;
      this.apply(on, active * throttle * master, rate, smooth);
      this.apply(off, active * (1 - throttle) * master, rate, smooth);
    }
  }

  private apply(sound: Audio | undefined, target: number, rate: number, smooth: number): void {
    if (!sound) return;
    const cur = this.vol.get(sound) ?? 0;
    const next = cur + (target - cur) * smooth; // suaviza (sem clique na troca de amostra)
    this.vol.set(sound, next);
    sound.setVolume(next);
    sound.setPlaybackRate(rate);
  }

  /** Para e libera. */
  dispose(): void {
    this.stop();
  }
}
