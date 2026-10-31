/**
 * Adaptação do `outdoorLighting` ao host nativo com o renderer próprio (ADR-0644, SPEC-0645).
 *
 * O renderer próprio (ADR-0605) recusa a cena inteira com `toneMapping` no three,
 * `AmbientLight` ou `scene.environment`. No host o preset troca os três por
 * equivalentes que ele desenha: ACES no composite do host e ambiente constante
 * somado ao hemisfério (como o Godot: tonemap é passe de pós e ambiente é um
 * uniform por cena, não uma luz). No navegador/Studio nada disso roda.
 */
import { Color, type ColorRepresentation, type HemisphereLight } from 'three';
import { nativePostFXHost } from '../core/nativePostFX.js';
import { nativeRendererRequested } from '../render/native/NativeRenderer.js';

/** Host com composite (`__cortexBloom`) e o jogo pediu o renderer próprio? */
export function adaptsOutdoorLightingToNativeHost(): boolean {
  return nativePostFXHost() !== null && nativeRendererRequested();
}

/**
 * Soma uma luz ambiente constante (`fill`, RGB linear já multiplicado pela
 * intensidade) ao hemisfério. Ele dá `mix(chão, céu, w)`: somar a mesma
 * constante às duas pontas soma a constante em todo `w` — o difuso fica igual
 * ao de um `AmbientLight` de `fill`. A intensidade vai para dentro das cores.
 *
 * O total somado fica em `hemisphere.userData[AMBIENT_FILL_KEY]` (Color, RGB
 * linear, acumulado a cada chamada). Quem reescreve o hemisfério em runtime
 * (ex.: ciclo dia/noite) deve reaplicar `cor·I + fill` / `chão·I + fill` e
 * `intensity = 1`, senão o ambiente some no host.
 */
export function foldIntoHemisphere(hemisphere: HemisphereLight, fill: Color): void {
  hemisphere.color.multiplyScalar(hemisphere.intensity).add(fill);
  hemisphere.groundColor.multiplyScalar(hemisphere.intensity).add(fill);
  hemisphere.intensity = 1;
  const total = hemisphere.userData[AMBIENT_FILL_KEY];
  hemisphere.userData[AMBIENT_FILL_KEY] = total instanceof Color ? total.add(fill) : fill.clone();
}

/** Chave do `userData` do hemisfério com o ambiente somado por `foldIntoHemisphere`. */
export const AMBIENT_FILL_KEY = 'cortexAmbientFill';

/**
 * Ambiente equivalente a um environment UNIFORME de cor `sky` e intensidade
 * `intensity`. O π vem do three: o `EnvironmentNode` multiplica a irradiância
 * por π e o modelo divide por π, enquanto ambient/hemisfério passam por
 * `BRDF_Lambert` (÷π) — aqui e nos modelos nativos (`lambert.ts`/`standard.ts`).
 */
export function uniformEnvironmentFill(sky: ColorRepresentation, intensity: number): Color {
  return new Color(sky).multiplyScalar(intensity * Math.PI);
}
