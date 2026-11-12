/**
 * Efeito de tela embaixo d'água do `Renderer` (SPEC-0726, ADR-0727).
 *
 * Guarda o estado resolvido e o aplica no alvo certo:
 * - **host nativo**: manda o estado ao `__cortexUnderwater` só quando ele muda; o
 *   blit final do host desloca a cena, tinge e escurece (a UI fica de fora);
 * - **navegador**: enquanto `amount > 0`, desenha por um `RenderPipeline` próprio
 *   (cena numa RT → amostra deslocada → `renderOutput` → tinta). Com 0 o
 *   `Renderer.render` segue o render direto, sem pipeline.
 *
 * Usa o namespace `TSL` do `three/webgpu` só DENTRO das funções (criação
 * preguiçosa): o `three/tsl` lê o `TSL` na carga do módulo, e isso quebraria quem
 * mocka o `three/webgpu` em Node (o teste do `Renderer`).
 */

import * as THREE from 'three';
import { RenderPipeline, TSL, type WebGPURenderer } from 'three/webgpu';
import {
  nativeUnderwaterHost,
  resolveUnderwater,
  sameUnderwater,
  toNativeUnderwater,
  type ResolvedUnderwater,
  type UnderwaterState,
} from './underwater.js';

/** Nó TSL genérico: a cadeia muda de tipo a cada operação (mesmo motivo do `PostFX`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

/** Uniforms do efeito, compartilhados entre o pipeline próprio e um `PostFX` com `underwater: true`. */
export interface UnderwaterUniforms {
  amount: { value: number };
  tint: { value: number };
  brightness: { value: number };
  amplitude: { value: number };
  frequency: { value: number };
  speed: { value: number };
  color: { value: THREE.Vector3 };
}

/** Pass da cena com cena/câmera trocáveis (o `PassNode` do three expõe os dois). */
interface ScenePass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  getTextureNode(): Node;
  dispose(): void;
}

export class UnderwaterPass {
  private _state: ResolvedUnderwater | null = null;
  /** Último estado entregue ao host (o host só é chamado quando muda). */
  private _sentNative: ResolvedUnderwater | null = null;
  private _uniforms: UnderwaterUniforms | null = null;
  private _pipeline: RenderPipeline | null = null;
  private _scenePass: ScenePass | null = null;

  /** Estado aplicado, ou `null` com o efeito desligado. */
  get state(): Readonly<ResolvedUnderwater> | null {
    return this._state;
  }

  /** Liga, ajusta ou desliga (`null` / `amount ≤ 0`). Pode ser chamado todo quadro. */
  set(state: UnderwaterState | null): void {
    this._state = resolveUnderwater(state);
    const host = nativeUnderwaterHost();
    if (host) {
      if (!sameUnderwater(this._state, this._sentNative)) {
        host(this._state ? toNativeUnderwater(this._state) : null);
        this._sentNative = this._state;
      }
      return;
    }
    if (this._state && this._uniforms) this._writeUniforms(this._state);
  }

  /**
   * Desenha a cena pelo caminho embaixo d'água, se ele está ligado no navegador.
   * Devolve `false` quando o chamador deve desenhar do jeito normal (desligado,
   * ou no host nativo, onde o efeito é do blit do host).
   */
  render(renderer: WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera): boolean {
    if (!this._state || nativeUnderwaterHost()) return false;
    const pipeline = this._ensurePipeline(renderer, scene, camera);
    const scenePass = this._scenePass as ScenePass;
    scenePass.scene = scene;
    scenePass.camera = camera;
    pipeline.render();
    return true;
  }

  /**
   * Uniforms TSL do efeito (criados na primeira chamada), para montar o mesmo
   * efeito dentro de outro grafo, como o do `PostFX`.
   */
  uniforms(): UnderwaterUniforms {
    if (!this._uniforms) {
      const u = TSL.uniform;
      this._uniforms = {
        amount: u(0),
        tint: u(0),
        brightness: u(1),
        amplitude: u(0),
        frequency: u(0),
        speed: u(0),
        color: u(new THREE.Vector3()),
      } as unknown as UnderwaterUniforms;
      if (this._state) this._writeUniforms(this._state);
    }
    return this._uniforms;
  }

  /** Libera o pipeline e a RT da cena. O estado continua (volta a criar no próximo uso). */
  dispose(): void {
    this._scenePass?.dispose();
    this._pipeline?.dispose();
    this._scenePass = null;
    this._pipeline = null;
  }

  private _writeUniforms(s: ResolvedUnderwater): void {
    const u = this._uniforms as UnderwaterUniforms;
    u.amount.value = s.amount;
    u.tint.value = s.tint;
    u.brightness.value = s.brightness;
    u.amplitude.value = s.amplitude;
    u.frequency.value = s.frequency;
    u.speed.value = s.speed;
    u.color.value.set(s.color[0], s.color[1], s.color[2]);
  }

  private _ensurePipeline(renderer: WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera): RenderPipeline {
    if (this._pipeline) return this._pipeline;
    const u = this.uniforms();
    const scenePass = TSL.pass(scene, camera) as unknown as ScenePass;
    const pipeline = new RenderPipeline(renderer);
    // Tone mapping e espaço de cor pelo renderOutput, ANTES da tinta: a cor da
    // água é cor de tela (sRGB), igual ao composite do host.
    pipeline.outputColorTransform = false;
    const sampled = underwaterSample(scenePass.getTextureNode(), u);
    pipeline.outputNode = underwaterColorize(TSL.renderOutput(sampled), u);
    this._scenePass = scenePass;
    this._pipeline = pipeline;
    return pipeline;
  }
}

/**
 * Amostra `sceneTexture` com a UV da tela deslocada pela ondulação:
 * `uv.x + sin(tempo·speed + uv.y·frequency)·amplitude·amount`.
 */
export function underwaterSample(sceneTexture: Node, uniforms: UnderwaterUniforms): Node {
  const u = asNodes(uniforms);
  const uv: Node = TSL.screenUV;
  const phase: Node = (TSL.time as Node).mul(u.speed).add(uv.y.mul(u.frequency));
  const offset: Node = (TSL.sin(phase) as Node).mul(u.amplitude).mul(u.amount);
  return sceneTexture.sample(TSL.vec2(uv.x.add(offset), uv.y));
}

/** Tinta e escurecimento em espaço de tela: `mix(c, mix(c, cor, tint)·brightness, amount)`. */
export function underwaterColorize(color: Node, uniforms: UnderwaterUniforms): Node {
  const u = asNodes(uniforms);
  const rgb: Node = color.rgb;
  const tinted: Node = (TSL.mix(rgb, u.color, u.tint) as Node).mul(u.brightness);
  return TSL.vec4(TSL.mix(rgb, tinted, u.amount), color.a);
}

/** Os uniforms como nós TSL (a tipagem estrita do TSL não cobre a cadeia dinâmica). */
function asNodes(u: UnderwaterUniforms): Record<keyof UnderwaterUniforms, Node> {
  return u as unknown as Record<keyof UnderwaterUniforms, Node>;
}
