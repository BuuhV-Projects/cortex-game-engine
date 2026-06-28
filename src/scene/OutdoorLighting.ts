import {
  DirectionalLight,
  HemisphereLight,
  AmbientLight,
  Color,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  type ColorRepresentation,
} from 'three';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import { Renderer } from '../core/Renderer.js';
import { Scene } from '../core/Scene.js';

/**
 * CSM que SEGUE a câmera que está renderizando (a do frame), não a cacheada no 1º render.
 * Sem isso, o CSM trava na primeira câmera vista (a do editor) — mexer no editor afetava a
 * sombra no play, e a sombra não acompanhava o jogador. Troca a câmera por frame +
 * recomputa as cascatas quando ela muda (editor ↔ play).
 */
class CameraFollowingCSM extends CSMShadowNode {
  override updateBefore(
    frame: Parameters<CSMShadowNode['updateBefore']>[0],
  ): ReturnType<CSMShadowNode['updateBefore']> {
    const cam = (frame as unknown as { camera?: unknown } | null)?.camera;
    const self = this as unknown as { camera: unknown; updateFrustums: () => void };
    if (cam && self.camera && cam !== self.camera) {
      self.camera = cam;
      self.updateFrustums();
    }
    return super.updateBefore(frame);
  }
}

/** Opções de {@link setupOutdoorLighting}. Todas opcionais — defaults "verão". */
export interface OutdoorLightingOptions {
  /** Cor do céu (topo do hemisphere). Default `0x9fd6ee`. */
  sky?: ColorRepresentation;
  /** Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`. */
  ground?: ColorRepresentation;
  /** Cor do sol. Default `0xfff2cc` (luz quente). */
  sunColor?: ColorRepresentation;
  /** Intensidade do sol. Default `3.2`. */
  sunIntensity?: number;
  /** Posição/direção do sol. Default `[35, 55, 25]`. */
  sunPosition?: [number, number, number];
  /** Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`. */
  hemisphereIntensity?: number;
  /** Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`. */
  ambientIntensity?: number;
  /** Exposição do tone mapping (ACES Filmic). Default `0.95`. */
  exposure?: number;
  /** Liga shadowMap + `sun.castShadow`. Default `true`. */
  shadows?: boolean;
  /** Resolução do shadow map (lado, em px). Default `2048`. */
  shadowMapSize?: number;
  /**
   * Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
   * origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.
   */
  shadowArea?: number;
  /** Bias da sombra (combate shadow acne). Default `-0.0005`. */
  shadowBias?: number;
  /** Normal bias da sombra (combate peter-panning). Default `0.05`. */
  shadowNormalBias?: number;
  /**
   * Liga **Cascaded Shadow Maps** (estilo Unity, WebGPU): cascatas de sombra que
   * SEGUEM a câmera ativa — nítidas perto, cobertura longe, no mapa inteiro. Ideal pra
   * mundo aberto (substitui o frustum único do `shadowArea`). Default `false`.
   */
  csm?: boolean;
  /** Nº de cascatas (CSM). Mais = transição mais suave, mais custo. Default `3`. */
  shadowCascades?: number;
  /** Distância máxima de sombra (CSM, m) — além disso não há sombra. Default `250`. */
  shadowDistance?: number;
  /** Margem da luz do CSM (quão atrás da câmera o sol "vê" pra projetar). Default `200`. */
  lightMargin?: number;
}

/** Luzes criadas por {@link setupOutdoorLighting} — ajuste-as em runtime. */
export interface OutdoorLighting {
  sun: DirectionalLight;
  hemisphere: HemisphereLight;
  ambient: AmbientLight;
}

/**
 * Preset de iluminação exterior "verão": configura o tone mapping cinematográfico
 * (ACES Filmic) e soft shadows (PCF) no renderer, e adiciona à cena um sol
 * direcional com sombras + um hemisphere (preenchimento céu/chão) + um ambient
 * discreto. Encapsula a configuração de shadow-camera/tone-mapping que, crua,
 * exige mexer no `WebGPURenderer` e no `DirectionalLight.shadow`.
 *
 * Retorna as luzes pra ajuste fino (ex.: desligar a sombra do sol, mudar
 * intensidade, reposicionar). Pra excluir um objeto específico do shadowMap,
 * use `setShadows(obj, { castShadow: false })`.
 *
 * @param renderer - O {@link Renderer} do jogo (tone mapping + shadowMap).
 * @param scene - A {@link Scene} onde adicionar as luzes.
 * @param options - Ver {@link OutdoorLightingOptions}.
 * @returns `{ sun, hemisphere, ambient }`.
 *
 * @example
 * const lights = setupOutdoorLighting(renderer, scene, { sky: 0x9fc6e0 })
 * lights.sun.intensity = 2.4 // ajuste em runtime
 */
export function setupOutdoorLighting(
  renderer: Renderer,
  scene: Scene,
  options: OutdoorLightingOptions = {},
): OutdoorLighting {
  const {
    sky = 0x9fd6ee,
    ground = 0xb6e2a8,
    sunColor = 0xfff2cc,
    sunIntensity = 3.2,
    sunPosition = [35, 55, 25],
    hemisphereIntensity = 0.55,
    ambientIntensity = 0.18,
    exposure = 0.95,
    shadows = true,
    shadowMapSize = 2048,
    shadowArea = 60,
    shadowBias = -0.0005,
    shadowNormalBias = 0.05,
    csm = false,
    shadowCascades = 3,
    shadowDistance = 250,
    lightMargin = 200,
  } = options;

  const three = renderer.threeRenderer;
  three.toneMapping = ACESFilmicToneMapping;
  three.toneMappingExposure = exposure;
  three.shadowMap.enabled = shadows;
  three.shadowMap.type = PCFSoftShadowMap;

  const hemisphere = new HemisphereLight(new Color(sky), new Color(ground), hemisphereIntensity);
  scene.add(hemisphere);

  const ambient = new AmbientLight(0xffffff, ambientIntensity);
  scene.add(ambient);

  const sun = new DirectionalLight(new Color(sunColor), sunIntensity);
  sun.position.set(sunPosition[0], sunPosition[1], sunPosition[2]);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.width = shadowMapSize;
    sun.shadow.mapSize.height = shadowMapSize;
    sun.shadow.bias = shadowBias;
    sun.shadow.normalBias = shadowNormalBias;
    const cam = sun.shadow.camera;
    cam.left = -shadowArea;
    cam.right = shadowArea;
    cam.top = shadowArea;
    cam.bottom = -shadowArea;
    cam.near = 1;
    cam.far = shadowArea * 4;
    cam.updateProjectionMatrix();

    // CSM (Cascaded Shadow Maps, WebGPU): cascatas que seguem a câmera ativa — cobre o
    // mundo todo com nitidez perto. Substitui o frustum único acima (que vira fallback).
    if (csm) {
      (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = new CameraFollowingCSM(sun, {
        cascades: shadowCascades,
        maxFar: shadowDistance,
        mode: 'practical',
        lightMargin,
      });
    }
  }
  scene.add(sun);

  return { sun, hemisphere, ambient };
}
