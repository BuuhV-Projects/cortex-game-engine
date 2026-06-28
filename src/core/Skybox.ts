/**
 * Skybox — iluminação e fundo baseados em imagem (HDRI).
 *
 * Carrega um HDRI equiretangular (`.hdr`) e o aplica como `environment`
 * (iluminação/reflexos PBR) e, opcionalmente, como `background` visível da cena.
 *
 * Funciona com o backend **WebGPU** (ADR-0032) sem `PMREMGenerator`: o
 * `WebGPURenderer` aceita uma textura equiretangular diretamente em
 * `scene.environment`/`scene.background` (com `mapping =
 * EquirectangularReflectionMapping`), gerando a convolução internamente.
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001).
 */

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { Scene } from './Scene.js';

export interface HDRISkyboxOptions {
  /**
   * Usar o HDRI também como fundo VISÍVEL da cena, não só pra iluminação/reflexo.
   * @default true
   */
  asBackground?: boolean;
  /**
   * Desfoque do fundo, de `0` (nítido) a `1` (totalmente borrado). Útil pra um
   * céu suave sem distrair. Só tem efeito quando `asBackground` é `true`.
   * @default 0
   */
  backgroundBlurriness?: number;
  /**
   * Intensidade da iluminação que o environment lança na cena.
   * @default 1
   */
  environmentIntensity?: number;
}

/** Opções do {@link Skybox.fromGradient} (céu gradiente procedural). */
export interface GradientSkyOptions {
  /** Cor do zênite (topo). @default '#1f72d8' (azul forte) */
  top?: string | number;
  /** Cor do horizonte (meio). @default '#d6ecfb' (azul pálido) */
  middle?: string | number;
  /** Cor abaixo do horizonte (chão/IBL). @default '#8f8268' */
  bottom?: string | number;
  /** Resolução vertical do gradiente. @default 128 */
  resolution?: number;
  /** Intensidade da luz que o céu lança (environment). @default 1 */
  environmentIntensity?: number;
}

export class Skybox {
  /**
   * Carrega um HDRI equiretangular e o aplica como iluminação (e fundo) da cena.
   *
   * @param scene Cena do engine onde aplicar o environment.
   * @param url Caminho/URL do arquivo `.hdr` (equiretangular).
   * @param options Ajustes de fundo e intensidade.
   * @returns A `DataTexture` carregada (pra dispose manual, se necessário).
   *
   * @example
   * await Skybox.fromHDRI(scene, 'assets/sky.hdr', { backgroundBlurriness: 0.3 });
   */
  static async fromHDRI(
    scene: Scene,
    url: string,
    options: HDRISkyboxOptions = {},
  ): Promise<THREE.DataTexture> {
    const {
      asBackground = true,
      backgroundBlurriness = 0,
      environmentIntensity = 1,
    } = options;

    const texture = await new RGBELoader().loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const three = scene.getThreeScene();
    three.environment = texture;
    three.environmentIntensity = environmentIntensity;

    if (asBackground) {
      three.background = texture;
      three.backgroundBlurriness = backgroundBlurriness;
    }

    return texture;
  }

  /**
   * Céu **gradiente procedural** (sem arquivo) — zênite → horizonte → chão, aplicado
   * como `background` visível E `environment` (luz/reflexo suave). Ideal pra um céu
   * limpo e ensolarado (ex.: Brasília: azul forte). Funciona em WebGPU usando uma
   * `DataTexture` equiretangular 1×N (gradiente vertical), igual ao HDRI.
   *
   * @example
   * Skybox.fromGradient(scene, { top: '#1f72d8', middle: '#d6ecfb' }); // céu azul limpo
   */
  static fromGradient(scene: Scene, options: GradientSkyOptions = {}): THREE.DataTexture {
    const zenith = new THREE.Color(options.top ?? '#1f72d8');
    const horizon = new THREE.Color(options.middle ?? '#d6ecfb');
    const ground = new THREE.Color(options.bottom ?? '#8f8268');
    const h = Math.max(8, options.resolution ?? 128);

    // Equiret 1×h: row 0 = nadir (-Y), row h-1 = zênite (+Y). Lerp em espaço linear,
    // grava em sRGB (a textura é sRGB) pras cores baterem com o hex informado.
    const data = new Uint8Array(h * 4);
    const c = new THREE.Color();
    const out = { r: 0, g: 0, b: 0 };
    for (let i = 0; i < h; i++) {
      const t = i / (h - 1);
      if (t < 0.5) c.copy(ground).lerp(horizon, t / 0.5);
      else c.copy(horizon).lerp(zenith, (t - 0.5) / 0.5);
      c.getRGB(out, THREE.SRGBColorSpace);
      const o = i * 4;
      data[o] = Math.round(out.r * 255);
      data[o + 1] = Math.round(out.g * 255);
      data[o + 2] = Math.round(out.b * 255);
      data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, 1, h, THREE.RGBAFormat);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    const three = scene.getThreeScene();
    three.background = tex;
    three.backgroundBlurriness = 0;
    three.environment = tex;
    three.environmentIntensity = options.environmentIntensity ?? 1;
    return tex;
  }

  /**
   * Remove o environment/background da cena (volta ao fundo padrão).
   * Não dá `dispose()` na textura — guarde o retorno de `fromHDRI` se quiser.
   */
  static clear(scene: Scene): void {
    const three = scene.getThreeScene();
    three.environment = null;
    three.background = null;
  }
}
