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
   * Remove o environment/background da cena (volta ao fundo padrão).
   * Não dá `dispose()` na textura — guarde o retorno de `fromHDRI` se quiser.
   */
  static clear(scene: Scene): void {
    const three = scene.getThreeScene();
    three.environment = null;
    three.background = null;
  }
}
