/**
 * Speedometer — velocímetro de ponteiro (HUD DOM), port do Unity-Speedometer.
 *
 * Mostrador (0..maxSpeed) + agulha que gira de `minAngle` a `maxAngle` conforme
 * `velocidade/maxSpeed` (igual ao `localEulerAngles.z = lerp(min,max,speed/max)` do
 * original). Imagens padrão embutidas (data-URL) — funciona sem arquivos; o projeto pode
 * trocar `dialUrl`/`needleUrl`. Alimente com {@link Speedometer.update} (m/s).
 *
 * @example
 * const speedo = new Speedometer({ maxSpeed: 220 });
 * // por frame: speedo.update(vehicle.forwardSpeed());
 */
import { SPEEDOMETER_DIAL_URL, SPEEDOMETER_NEEDLE_URL } from './speedometerAssets.js';

/** Opções do {@link Speedometer}. */
export interface SpeedometerOptions {
  /** Velocidade (na unidade exibida) no ângulo máximo da agulha. Default 260 (= o mostrador). */
  maxSpeed?: number;
  /** Unidade exibida e de conversão (m/s → kmh ×3.6 / mph ×2.237). Default 'kmh'. */
  units?: 'kmh' | 'mph';
  /** Ângulo da agulha (graus CSS, horário+) em velocidade 0. Default 150 (≈8h). */
  minAngle?: number;
  /** Ângulo da agulha em `maxSpeed`. Default 390 (≈4h, varrendo por cima). */
  maxAngle?: number;
  /** Largura do widget (px). Default 220. */
  size?: number;
  /** Posição CSS do container. Default canto inferior direito. */
  position?: Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>;
  /** Imagem do mostrador (override). Default a embutida. */
  dialUrl?: string;
  /** Imagem da agulha (override). Default a embutida. */
  needleUrl?: string;
  /** Onde anexar. Default `document.body`. */
  parent?: HTMLElement;
}

export class Speedometer {
  /** O container do widget (pra estilizar/posicionar por fora se quiser). */
  readonly el: HTMLDivElement;
  private readonly needlePivot: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly maxSpeed: number;
  private readonly units: 'kmh' | 'mph';
  private readonly minAngle: number;
  private readonly maxAngle: number;

  constructor(options: SpeedometerOptions = {}) {
    this.maxSpeed = options.maxSpeed ?? 260;
    this.units = options.units ?? 'kmh';
    this.minAngle = options.minAngle ?? 150;
    this.maxAngle = options.maxAngle ?? 390;
    const size = options.size ?? 220;
    const pos = options.position ?? { bottom: '18px', right: '18px' };

    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      width: `${size}px`,
      height: `${size * 0.75}px`, // mostrador 4:3
      backgroundImage: `url(${options.dialUrl ?? SPEEDOMETER_DIAL_URL})`,
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      pointerEvents: 'none',
      zIndex: '25',
      ...pos,
    } as CSSStyleDeclaration);

    // Pivô da agulha no centro do arco (≈50%, 76% do mostrador). A agulha sai dele pra
    // a direita (ângulo 0 = leste) e o pivô gira.
    this.needlePivot = document.createElement('div');
    Object.assign(this.needlePivot.style, {
      position: 'absolute',
      left: '50%',
      top: '76%',
      width: '0',
      height: '0',
      transformOrigin: '0 0',
    } as CSSStyleDeclaration);
    const needle = document.createElement('img');
    needle.src = options.needleUrl ?? SPEEDOMETER_NEEDLE_URL;
    Object.assign(needle.style, {
      position: 'absolute',
      left: '0',
      top: `${-(size * 0.05) / 2}px`, // centra a agulha verticalmente no pivô
      width: `${size * 0.34}px`, // comprimento ≈ raio do arco
      height: 'auto',
    } as CSSStyleDeclaration);
    this.needlePivot.appendChild(needle);
    this.el.appendChild(this.needlePivot);

    this.label = document.createElement('div');
    Object.assign(this.label.style, {
      position: 'absolute',
      bottom: '2%',
      left: '0',
      width: '100%',
      textAlign: 'center',
      color: '#fff',
      font: `700 ${Math.round(size * 0.09)}px sans-serif`,
      textShadow: '0 1px 3px rgba(0,0,0,.8)',
    } as CSSStyleDeclaration);
    this.el.appendChild(this.label);

    (options.parent ?? document.body).appendChild(this.el);
    this.update(0);
  }

  /** Atualiza a agulha + o texto a partir da velocidade em **m/s**. */
  update(speedMetersPerSecond: number): void {
    const factor = this.units === 'mph' ? 2.23694 : 3.6;
    const speed = Math.abs(speedMetersPerSecond) * factor;
    const t = this.maxSpeed > 0 ? Math.min(1, speed / this.maxSpeed) : 0;
    const angle = this.minAngle + (this.maxAngle - this.minAngle) * t;
    this.needlePivot.style.transform = `rotate(${angle}deg)`;
    this.label.textContent = `${Math.round(speed)} ${this.units === 'mph' ? 'mph' : 'km/h'}`;
  }

  /** Mostra/esconde o velocímetro (ex.: só ao dirigir). */
  setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'block' : 'none';
  }

  /** Remove o widget do DOM. */
  dispose(): void {
    this.el.remove();
  }
}
