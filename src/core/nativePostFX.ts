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
  configureNativePostFX(null);
}

/** Alguém (um `PostFX`) configurou o composite do host? */
let ownedByPostFX = false;
/** O composite do host está fazendo só o tone mapping do `outdoorLighting` (SPEC-0645)? */
let toneOnly = false;

/**
 * Configura (ou desliga, com `null`) o composite do host em nome de um `PostFX`.
 * Tira o tone mapping do preset ({@link enableNativeToneMapping}): o `PostFX`
 * renderiza pelo próprio caminho HDR e o composite dele já aplica ACES.
 */
export function configureNativePostFX(config: NativePostFXConfig | null): void {
  ownedByPostFX = config !== null;
  toneOnly = false;
  nativePostFXHost()?.(config);
}

/** Composite sem bloom nem vinheta: só exposição + ACES do host. */
const TONE_ONLY_CONFIG: NativePostFXConfig = {
  strength: 0,
  threshold: 0,
  radius: 0,
  exposure: 1,
  vignette: false,
  vignetteIntensity: 0,
  vignetteInner: 0,
  vignetteOuter: 0,
};

/**
 * ACES do `outdoorLighting` no composite do host, em vez do `toneMapping` do
 * three (que o renderer próprio recusa — SPEC-0645). Devolve `false` fora do
 * host. Se um `PostFX` já é dono do composite, não mexe (ele já faz ACES).
 */
export function enableNativeToneMapping(exposure: number): boolean {
  const host = nativePostFXHost();
  if (!host) return false;
  if (ownedByPostFX) return true;
  host({ ...TONE_ONLY_CONFIG, exposure });
  toneOnly = true;
  return true;
}

/**
 * Com o tone mapping do preset ativo, desenha a cena na RT HDR e a entrega ao
 * host (o mesmo caminho do `PostFX` nativo). `false` = desenhe do jeito normal.
 */
export function renderNativeToneMapped(
  renderer: { renderSceneHDR(scene: never, camera: never): unknown },
  scene: unknown,
  camera: unknown,
): boolean {
  if (!toneOnly) return false;
  const sink = nativeSceneHdrSink();
  const texture = sink ? renderer.renderSceneHDR(scene as never, camera as never) : null;
  if (!sink || !texture) return false;
  sink(texture);
  return true;
}
