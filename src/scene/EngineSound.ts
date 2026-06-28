import type { Audio } from 'three';

/** Opções do {@link EngineSound}. */
export interface EngineSoundOptions {
  /** Playback rate (pitch) com o carro parado. Default 0.7. */
  idleRate?: number;
  /** Playback rate na velocidade máx. Default 2.2. */
  maxRate?: number;
  /** Velocidade (m/s) que corresponde ao `maxRate`. Default 45. */
  maxSpeed?: number;
  /** Volume parado / no talo. Default 0.35 / 0.85. */
  minVolume?: number;
  maxVolume?: number;
}

/**
 * **Som de motor** do veículo (ADR-0081) — toca um loop e varia o pitch (e o volume)
 * conforme a velocidade, dando a sensação de RPM subindo. Áudio escolhível por carro
 * (`vehicle.engineSound` no dado da cena). Use um `THREE.Audio` em loop
 * (`audioManager.createSound(buffer, { loop: true })`).
 *
 * @example
 * const sound = audioManager.createSound(buffer, { loop: true });
 * const engine = new EngineSound(sound);
 * // ao entrar no carro: engine.start();  ao sair: engine.stop();
 * // por frame dirigindo: engine.update(vehicle.forwardSpeed());
 */
export class EngineSound {
  constructor(
    private readonly sound: Audio,
    private readonly options: EngineSoundOptions = {},
  ) {}

  /** Começa a tocar o loop (idempotente). */
  start(): void {
    if (!this.sound.isPlaying) this.sound.play();
  }

  /** Pausa o loop (idempotente). */
  stop(): void {
    if (this.sound.isPlaying) this.sound.pause();
  }

  /** Atualiza pitch + volume pela velocidade (m/s). Chame por frame ao dirigir. */
  update(speedMetersPerSecond: number): void {
    const o = this.options;
    const t = Math.min(1, Math.abs(speedMetersPerSecond) / (o.maxSpeed ?? 45));
    const rate = (o.idleRate ?? 0.7) + ((o.maxRate ?? 2.2) - (o.idleRate ?? 0.7)) * t;
    this.sound.setPlaybackRate(rate);
    const minV = o.minVolume ?? 0.35;
    this.sound.setVolume(minV + ((o.maxVolume ?? 0.85) - minV) * t);
  }

  /** Para e libera. */
  dispose(): void {
    this.stop();
  }
}
