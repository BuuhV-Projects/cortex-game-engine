import { Color, DataTexture, Vector4, type Object3D } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  cameraPosition, float, mix, modelWorldMatrix, mx_noise_float, positionGeometry, positionWorld,
  smoothstep, texture, transformNormalToView, uniform, uniformArray, vec2, vec3, vec4,
} from 'three/tsl';
import type { WaterOptions } from './Water.js';
import { createShorelineMask } from './WaterShoreline.js';
import {
  WaterRipples, WATER_RIPPLE_CAPACITY, WATER_RIPPLE_LIFETIME, WATER_RIPPLE_SPEED,
} from './WaterRipples.js';

export const CARTOON_WATER_DEFAULTS = {
  color: 0x079dc2,
  waveHeight: .18,
  waveLength: 16,
  waveSpeed: 1,
  foamStrength: .7,
  foamWidth: .8,
  segments: 128,
} as const;

const FULL_TURN = Math.PI * 2;
const SKY_COLOR = 0x91e8ff;
const FOAM_COLOR = 0xe9ffff;
const SURFACE_ROUGHNESS = .24;
const DETAIL_SCALE = .18;
const DETAIL_SLOPE = .025;
const DETAIL_FLOW_X = .035;
const DETAIL_FLOW_Z = -.025;
const DETAIL_OFFSET_X = 31;
const DETAIL_OFFSET_Z = 17;
const DETAIL_FADE_START = 35;
const DETAIL_FADE_END = 160;
const COLOR_VARIATION = .035;
const SKY_BASE_BLEND = .12;
const RIPPLE_BAND_WIDTH = .65;
const RIPPLE_SLOPE = .22;
const FOAM_PATCH_SCALE = .65;
const FOAM_DETAIL_SCALE = 2.1;

/** Material de um passe: ondas na GPU, espuma e perturbações com alcance finito. */
export class CartoonWaterMaterial {
  readonly material = new MeshStandardNodeMaterial();
  readonly ripples = new WaterRipples();
  readonly clock = uniform(0);
  private readonly shoreline = texture(new DataTexture(new Uint8Array(4), 1, 1));
  private readonly shorelineBounds = uniform(new Vector4(0, 0, 1, 1));
  private readonly foamWidth: number;

  constructor(options: WaterOptions) {
    const waveHeight = options.waveHeight ?? CARTOON_WATER_DEFAULTS.waveHeight;
    const waveLength = options.waveLength ?? CARTOON_WATER_DEFAULTS.waveLength;
    const waveSpeed = options.waveSpeed ?? CARTOON_WATER_DEFAULTS.waveSpeed;
    const foamStrength = options.foamStrength ?? CARTOON_WATER_DEFAULTS.foamStrength;
    this.foamWidth = options.foamWidth ?? CARTOON_WATER_DEFAULTS.foamWidth;
    const segments = options.segments ?? CARTOON_WATER_DEFAULTS.segments;
    if (!Number.isFinite(waveHeight) || waveHeight < 0 || waveHeight > 2
      || !Number.isFinite(waveLength) || waveLength <= 0
      || !Number.isFinite(waveSpeed) || waveSpeed < 0 || waveSpeed > 10
      || !Number.isFinite(foamStrength) || foamStrength < 0 || foamStrength > 1
      || !Number.isFinite(this.foamWidth) || this.foamWidth <= 0 || this.foamWidth > 5
      || !Number.isInteger(segments) || segments < 16 || segments > 256) {
      throw new RangeError('Invalid cartoon water parameters.');
    }
    const frequency = FULL_TURN / waveLength;
    const time = this.clock.mul(waveSpeed);
    const worldPosition = modelWorldMatrix.mul(vec4(positionGeometry, 1));
    const phaseA = worldPosition.x.mul(.82).add(worldPosition.z.mul(.57)).mul(frequency).add(time);
    const phaseB = worldPosition.x.mul(-.6).add(worldPosition.z.mul(.8)).mul(frequency * 1.7).sub(time.mul(1.3));
    const height = phaseA.sin().mul(waveHeight * .65).add(phaseB.sin().mul(waveHeight * .35));
    this.material.positionNode = positionGeometry.add(vec3(0, height, 0));

    // As normais usam coordenadas do mundo para não deslizarem quando a câmera move o plano.
    const surface = positionWorld.xz;
    const surfacePhaseA = surface.x.mul(.82).add(surface.y.mul(.57)).mul(frequency).add(time);
    const surfacePhaseB = surface.x.mul(-.6).add(surface.y.mul(.8)).mul(frequency * 1.7).sub(time.mul(1.3));
    let slopeX = surfacePhaseA.cos().mul(waveHeight * .65 * frequency * .82)
      .add(surfacePhaseB.cos().mul(waveHeight * .35 * frequency * 1.7 * -.6));
    let slopeZ = surfacePhaseA.cos().mul(waveHeight * .65 * frequency * .57)
      .add(surfacePhaseB.cos().mul(waveHeight * .35 * frequency * 1.7 * .8));
    // Ruído suave quebra as linhas de brilho; o detalhe desaparece gradualmente à distância.
    const detailCoordinates = surface.mul(DETAIL_SCALE).add(vec2(time.mul(DETAIL_FLOW_X), time.mul(DETAIL_FLOW_Z)));
    const detailX = mx_noise_float(detailCoordinates);
    const detailZ = mx_noise_float(detailCoordinates.add(vec2(DETAIL_OFFSET_X, DETAIL_OFFSET_Z)));
    const cameraDistance = cameraPosition.sub(positionWorld).length();
    const detailFade = float(1).sub(smoothstep(DETAIL_FADE_START, DETAIL_FADE_END, cameraDistance));
    slopeX = slopeX.add(detailX.mul(DETAIL_SLOPE).mul(detailFade));
    slopeZ = slopeZ.add(detailZ.mul(DETAIL_SLOPE).mul(detailFade));

    // O pool não cria geometria: cada impacto acrescenta apenas um anel local de normal/espuma.
    const rippleData = uniformArray<'vec4'>(this.ripples.values, 'vec4');
    let rippleFoam = float(0).add(0);
    for (let index = 0; index < WATER_RIPPLE_CAPACITY; index++) {
      const ripple = vec4(rippleData.element(index));
      const offset = surface.sub(ripple.xy);
      const distance = offset.length().max(.001);
      const radius = ripple.z.mul(WATER_RIPPLE_SPEED);
      const band = float(1).sub(distance.sub(radius).abs().div(RIPPLE_BAND_WIDTH)).max(0);
      const fade = float(1).sub(ripple.z.div(WATER_RIPPLE_LIFETIME)).max(0).mul(ripple.w);
      const pulse = distance.sub(radius).mul(FULL_TURN).cos().mul(band).mul(fade);
      slopeX = slopeX.add(offset.x.div(distance).mul(pulse).mul(RIPPLE_SLOPE));
      slopeZ = slopeZ.add(offset.y.div(distance).mul(pulse).mul(RIPPLE_SLOPE));
      rippleFoam = rippleFoam.add(band.mul(fade).mul(.6));
    }

    const surfaceNormal = vec3(slopeX.negate(), 1, slopeZ.negate()).normalize();
    this.material.normalNode = transformNormalToView(surfaceNormal);
    const viewDirection = cameraPosition.sub(positionWorld).normalize();
    const fresnel = float(1).sub(surfaceNormal.dot(viewDirection).max(0)).pow(3);
    const baseColor = uniform(new Color(options.color ?? CARTOON_WATER_DEFAULTS.color));
    const skyColor = uniform(new Color(SKY_COLOR));
    const foamColor = uniform(new Color(FOAM_COLOR));
    const colorVariation = detailX.mul(COLOR_VARIATION).mul(detailFade).add(SKY_BASE_BLEND);
    const waterColor = mix(baseColor, skyColor, colorVariation.add(fresnel.mul(.5)).clamp(0, 1));

    // O ruído anima somente o contato; a máscara zerada mantém o mar aberto limpo.
    const foamCoordinates = surface.mul(FOAM_PATCH_SCALE).add(vec2(time.mul(.1), time.mul(-.07)));
    const foamPatches = mx_noise_float(foamCoordinates);
    const foamDetail = mx_noise_float(foamCoordinates.mul(FOAM_DETAIL_SCALE).add(time.mul(.08)));
    const foamPattern = foamPatches.add(foamDetail.mul(.3));
    this.shoreline.value.needsUpdate = true;
    const shorelineUv = surface.sub(this.shorelineBounds.xy).div(this.shorelineBounds.zw);
    const contact = this.shoreline.sample(shorelineUv).r;
    const contactFoam = contact.mul(smoothstep(-.25, .45, foamPattern));
    const foam = contactFoam.add(rippleFoam).mul(foamStrength).clamp(0, 1);
    this.material.colorNode = mix(waterColor, foamColor, foam);
    this.material.emissiveNode = waterColor.mul(.2).add(foamColor.mul(foam).mul(.18));
    this.material.roughness = options.roughness ?? SURFACE_ROUGHNESS;
    this.material.metalness = 0;
    this.material.name = 'CartoonWater';
  }

  /** Reconstrói o contato após carregar ou editar o terreno, nunca a cada quadro. */
  refreshShoreline(root: Object3D, height: number): void {
    const mask = createShorelineMask(root, height, this.foamWidth);
    const previous = this.shoreline.value;
    this.shoreline.value = mask.texture;
    this.shorelineBounds.value.copy(mask.bounds);
    previous.dispose();
  }

  dispose(): void {
    this.shoreline.value.dispose();
    this.material.dispose();
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.clock.value += deltaSeconds;
    this.ripples.update(deltaSeconds);
  }
}
