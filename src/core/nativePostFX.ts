/**
 * Ponte com o pós-processamento do HOST NATIVO (`__cortexBloom` — ADR-0147).
 *
 * Fica num módulo PRÓPRIO, sem importar `three`, de propósito: o {@link Game}
 * precisa desligar o pós-FX do host ao trocar de fase, e importar o `PostFX.ts`
 * (que puxa `three/webgpu` + os nós TSL) só pra isso arrastaria o stack WebGPU
 * inteiro pra dentro de qualquer teste em Node — foi o que quebrou a suíte
 * quando a ponte morava lá.
 */

/**
 * Configuração aceita pelo host. É o contrato do C++ — no browser, o `PostFX`
 * é que se adapta a ele (e não o contrário).
 */
export interface NativePostFXConfig {
  strength: number;
  threshold: number;
  radius: number;
  exposure: number;
  vignette: boolean;
  vignetteIntensity: number;
  vignetteInner: number;
  vignetteOuter: number;
}

type NativePostFXHost = (config: NativePostFXConfig | null) => void;

/**
 * O host nativo expõe o pós-processamento? Devolve a função ou `null`
 * (no browser/Studio é sempre `null`).
 */
export function nativePostFXHost(): NativePostFXHost | null {
  const fn = (globalThis as { __cortexBloom?: NativePostFXHost }).__cortexBloom;
  return typeof fn === 'function' ? fn : null;
}

/** Recebe o handle da textura HDR da cena (RenderTarget do three). */
type NativeSceneHdrSink = (texture: unknown) => void;

/**
 * Canal pelo qual o JS entrega ao host a textura HDR da cena a cada frame
 * (ADR-0149) — o host faz bloom + ACES sobre ela. `null` no browser.
 */
export function nativeSceneHdrSink(): NativeSceneHdrSink | null {
  const fn = (globalThis as { __cortexSceneHdr?: NativeSceneHdrSink }).__cortexSceneHdr;
  return typeof fn === 'function' ? fn : null;
}

/**
 * Desliga o pós-FX do host. No browser é no-op.
 *
 * O {@link Game.setPostFX} chama isto ao receber `null`: o estado vive no C++ e
 * sobrevive à troca de fase, então sem desligar explicitamente a fase seguinte
 * herdaria um bloom que nunca pediu.
 */
export function resetNativePostFX(): void {
  nativePostFXHost()?.(null);
}
