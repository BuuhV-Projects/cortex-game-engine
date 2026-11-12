/**
 * Efeito de tela embaixo d'água (SPEC-0726, ADR-0727): tipos, resolução do
 * estado e a matemática do shader espelhada em CPU.
 *
 * Fica num módulo PRÓPRIO, sem importar `three`, como o `nativePostFX.ts`: o
 * `Renderer` e os testes em Node usam a resolução e a ponte com o host sem
 * arrastar o stack WebGPU. O grafo TSL do navegador mora no `UnderwaterPass.ts`;
 * no nativo, o efeito é aplicado no blit final do host (`supersample.cpp`).
 */

/** Ondulação da imagem em faixas horizontais. */
export interface UnderwaterRipple {
  /** Deslocamento horizontal máximo, em fração da largura da tela. @default 0.006 */
  amplitude?: number;
  /** Fase por altura da tela, em radianos por altura de tela. @default 18 */
  frequency?: number;
  /** Fase por tempo, em radianos por segundo. @default 1.5 */
  speed?: number;
}

/** O que o jogo pede a cada quadro em que a câmera está (ou está entrando) na água. */
export interface UnderwaterState {
  /** Intensidade 0..1. Com 0 o efeito desliga e não custa nada. */
  amount: number;
  /** Cor da água em tela (sRGB), `0x5aaaaa` ou `'#5aaaaa'`. @default 0x5aaaaa */
  color?: number | string;
  /** Quanto a cor da água cobre a imagem, 0..1. @default 0.55 */
  tint?: number;
  /** Metros da câmera abaixo da lâmina. @default 0 */
  depth?: number;
  /** Profundidade em que a tela fica preta, em metros. @default 90 */
  blackDepth?: number;
  /** Ondulação; `false` desliga. @default os valores de {@link UNDERWATER_DEFAULTS} */
  ripple?: UnderwaterRipple | false;
}

/** Estado resolvido: os números que vão aos uniforms (iguais nos dois alvos). */
export interface ResolvedUnderwater {
  /** 0..1 */
  amount: number;
  /** Cor da água em sRGB, cada canal em 0..1. */
  color: readonly [number, number, number];
  /** 0..1 */
  tint: number;
  /** Multiplicador da cor pela profundidade, 1 (raso) a 0 (preto). */
  brightness: number;
  /** Fração da largura da tela (0 = sem ondulação). */
  amplitude: number;
  /** Radianos por altura de tela. */
  frequency: number;
  /** Radianos por segundo. */
  speed: number;
}

/** Padrões calibrados pela referência do GTA San Andreas (tela de 640×448). */
export const UNDERWATER_DEFAULTS = Object.freeze({
  /** rgb(90, 170, 170) do timecyc. */
  color: 0x5aaaaa,
  tint: 0.55,
  depth: 0,
  /** Preto total a 90 m. */
  blackDepth: 90,
  /** 4 px numa tela de 640 de largura. */
  amplitude: 4 / 640,
  /** 0,04 rad por linha × 448 linhas. */
  frequency: 0.04 * 448,
  /** 0,0015 rad por ms. */
  speed: 0.0015 * 1000,
});

const BYTE_MAX = 255;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;
const HEX_RADIX = 16;
const CSS_HEX = /^#?([0-9a-f]{6})$/i;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function finiteOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** `0xRRGGBB` ou `'#rrggbb'` → `[r, g, b]` em 0..1. Valor inválido usa o padrão. */
function parseColor(color: number | string | undefined): [number, number, number] {
  let hex: number = UNDERWATER_DEFAULTS.color;
  if (typeof color === 'number' && Number.isFinite(color)) hex = color;
  else if (typeof color === 'string') {
    const m = CSS_HEX.exec(color.trim());
    if (m) hex = parseInt(m[1], HEX_RADIX);
  }
  return [
    ((hex >> RED_SHIFT) & BYTE_MAX) / BYTE_MAX,
    ((hex >> GREEN_SHIFT) & BYTE_MAX) / BYTE_MAX,
    (hex & BYTE_MAX) / BYTE_MAX,
  ];
}

/**
 * Resolve o pedido do jogo nos números do shader. Devolve `null` quando o efeito
 * está desligado (`state` nulo ou `amount ≤ 0`).
 *
 * @example
 * resolveUnderwater({ amount: 1, depth: 45 })?.brightness // 0.5
 */
export function resolveUnderwater(state: UnderwaterState | null | undefined): ResolvedUnderwater | null {
  if (!state) return null;
  const amount = clamp01(state.amount);
  if (amount <= 0) return null;
  const blackDepth = finiteOr(state.blackDepth, UNDERWATER_DEFAULTS.blackDepth);
  const depth = Math.max(0, finiteOr(state.depth, UNDERWATER_DEFAULTS.depth));
  const black = blackDepth > 0 ? blackDepth : UNDERWATER_DEFAULTS.blackDepth;
  const ripple = state.ripple === false ? null : (state.ripple ?? {});
  return {
    amount,
    color: parseColor(state.color),
    tint: clamp01(finiteOr(state.tint, UNDERWATER_DEFAULTS.tint)),
    brightness: 1 - clamp01(depth / black),
    amplitude: ripple ? Math.max(0, finiteOr(ripple.amplitude, UNDERWATER_DEFAULTS.amplitude)) : 0,
    frequency: ripple ? finiteOr(ripple.frequency, UNDERWATER_DEFAULTS.frequency) : 0,
    speed: ripple ? finiteOr(ripple.speed, UNDERWATER_DEFAULTS.speed) : 0,
  };
}

/** Dois estados resolvidos dão o mesmo quadro? (`null` = desligado.) */
export function sameUnderwater(a: ResolvedUnderwater | null, b: ResolvedUnderwater | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.amount === b.amount &&
    a.tint === b.tint &&
    a.brightness === b.brightness &&
    a.amplitude === b.amplitude &&
    a.frequency === b.frequency &&
    a.speed === b.speed &&
    a.color[0] === b.color[0] &&
    a.color[1] === b.color[1] &&
    a.color[2] === b.color[2]
  );
}

/**
 * Deslocamento horizontal da amostra da cena (em fração da largura) na linha `y`
 * (0 = topo da tela, 1 = base) no instante `seconds`. Espelho do shader.
 */
export function underwaterRippleOffset(u: ResolvedUnderwater, y: number, seconds: number): number {
  const phase = seconds * u.speed + y * u.frequency;
  return Math.sin(phase) * u.amplitude * u.amount;
}

/**
 * Cor de tela (sRGB 0..1) depois da tinta e do escurecimento. Espelho do shader:
 * `mix(c, mix(c, cor, tint) · brightness, amount)`.
 */
export function applyUnderwaterColor(
  rgb: readonly [number, number, number],
  u: ResolvedUnderwater,
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < out.length; i++) {
    const tinted = (rgb[i] + (u.color[i] - rgb[i]) * u.tint) * u.brightness;
    out[i] = rgb[i] + (tinted - rgb[i]) * u.amount;
  }
  return out;
}

/** Campos planos que o host recebe em `__cortexUnderwater` (contrato do C++). */
export interface NativeUnderwaterParams {
  amount: number;
  tint: number;
  brightness: number;
  amplitude: number;
  frequency: number;
  speed: number;
  r: number;
  g: number;
  b: number;
}

type NativeUnderwaterHost = (params: NativeUnderwaterParams | null) => void;

/** O host nativo expõe o efeito? Devolve a função ou `null` (navegador/Studio). */
export function nativeUnderwaterHost(): NativeUnderwaterHost | null {
  const fn = (globalThis as { __cortexUnderwater?: NativeUnderwaterHost }).__cortexUnderwater;
  return typeof fn === 'function' ? fn : null;
}

/** Estado resolvido → os campos planos do host. */
export function toNativeUnderwater(u: ResolvedUnderwater): NativeUnderwaterParams {
  return {
    amount: u.amount,
    tint: u.tint,
    brightness: u.brightness,
    amplitude: u.amplitude,
    frequency: u.frequency,
    speed: u.speed,
    r: u.color[0],
    g: u.color[1],
    b: u.color[2],
  };
}
