/**
 * Quem são os pipelines que nascem no meio do jogo (SPEC-0261).
 *
 * O `born.pipelines` do trace (SPEC-0252) conta QUANTOS nascem; isto diz
 * QUAIS — objeto, material, passada e custo. No kart-racer 26 pipelines
 * nasciam de uma vez nos primeiros poderes, depois do aquecimento: criar
 * pipeline é compilar shader, síncrono no host, dentro do frame.
 *
 * Envolve `backend.createRenderPipeline(renderObject)` do three, que só é
 * chamado quando um pipeline novo precisa nascer (cache por chave em
 * `Pipelines._getRenderPipeline`) — cada chamada é um nascimento.
 */
import type { Camera, Material, Object3D } from 'three';
import { debug } from './debug.js';

/** Um pipeline criado, com o que é preciso para aquecê-lo no carregamento. */
export interface PipelineBirth {
  /** Nome do objeto, ou do ancestral nomeado mais próximo, ou o `type`. */
  object: string;
  /** Nome do material, ou o `type`. */
  material: string;
  /** Variante translúcida — nasce quando um material muda de opaco para translúcido. */
  transparent: boolean;
  /** `main` para a câmera do jogo; senão o `type` da câmera (sombra usa a da luz). */
  camera: string;
  /** Duração da criação (ms), com a compilação síncrona do host. */
  ms: number;
  /**
   * Chave de cache do three: ids dos shaders de vértice e fragmento + estado
   * (blend, depth, face, formato/amostras do alvo, geometria). Duas chaves do
   * mesmo objeto dizem se o que variou foi o shader ou o estado.
   */
  key: string;
}

/** O pedaço do `renderObject` do three que interessa aqui. */
interface RenderObjectLike {
  object?: Object3D;
  material?: Material | Material[];
  camera?: Camera;
  /** Atribuído pelo three ANTES de chamar o backend (`Pipelines._getRenderPipeline`). */
  pipeline?: { cacheKey?: string };
}

interface BackendLike {
  createRenderPipeline?: (renderObject: RenderObjectLike, promises: unknown) => unknown;
  getRenderCacheKey?: (renderObject: RenderObjectLike) => string;
}

/** Casas decimais do custo — sub-milissegundo importa, mais que isso é ruído. */
const MS_DECIMALS = 2;
const DECIMAL_BASE = 10;

function objectLabel(object: Object3D | undefined): string {
  for (let o: Object3D | null | undefined = object; o; o = o.parent) {
    if (o.name) return o.name;
  }
  return object?.type ?? '?';
}

/** Cap of the native queue when no trace drains it (Studio, browser): births past it are dropped. */
const MAX_PENDING_NATIVE = 256;
const nativePending: PipelineBirth[] = [];

/**
 * Records a pipeline born in the engine's own renderer (SPEC-0585), which calls the device directly
 * and so never goes through `backend.createRenderPipeline`. The trace drains it as
 * `nativePipelinesBorn`.
 */
export function recordNativePipelineBirth(object: Object3D, material: Material, ms: number, key: string): void {
  if (nativePending.length >= MAX_PENDING_NATIVE) return;
  const factor = DECIMAL_BASE ** MS_DECIMALS;
  nativePending.push({
    object: objectLabel(object),
    material: material.name || material.type,
    transparent: material.transparent === true,
    camera: 'main',
    ms: Math.round(ms * factor) / factor,
    key,
  });
}

/** The native births since the last call. */
export function drainNativePipelineBirths(): PipelineBirth[] {
  return nativePending.splice(0, nativePending.length);
}

/**
 * Registro dos nascimentos, drenado a cada amostra do trace.
 *
 * @example
 * const log = new PipelineBirthLog();
 * log.install(renderer.threeRenderer.backend, () => game.camera);
 * // ... a cada amostra:
 * const born = log.drain();
 */
export class PipelineBirthLog {
  private readonly _pending: PipelineBirth[] = [];
  private _installed = false;
  private _lookups = 0;
  private _births = 0;

  /**
   * Consultas ao cache de pipeline desde a instalação, ACERTOS incluídos. O
   * three chama `backend.getRenderCacheKey` uma vez por consulta que precisa de
   * pipeline — então consultas sem nascimento = pipeline reaproveitado.
   */
  get lookups(): number {
    return this._lookups;
  }

  /** Nascimentos desde a instalação (não é zerado pelo {@link PipelineBirthLog.drain}). */
  get births(): number {
    return this._births;
  }

  /**
   * Envolve `backend.createRenderPipeline`. Idempotente. Devolve `false` (e
   * avisa por `debug('perf')`) se o backend não tiver o método — uma versão do
   * three que o renomeou não pode quebrar o jogo por causa de um instrumento.
   */
  install(backend: unknown, mainCamera: () => Camera | null, now: () => number = () => performance.now()): boolean {
    if (this._installed) return true;
    const target = backend as BackendLike | null;
    const original = target?.createRenderPipeline;
    if (typeof original !== 'function') {
      debug('perf', 'PipelineBirthLog: backend sem createRenderPipeline — lista de pipelines desligada');
      return false;
    }
    const pending = this._pending;
    const self = this;
    const originalKey = target!.getRenderCacheKey;
    if (typeof originalKey === 'function') {
      target!.getRenderCacheKey = function (renderObject: RenderObjectLike): string {
        self._lookups++;
        return originalKey.call(this, renderObject);
      };
    }
    target!.createRenderPipeline = function (renderObject: RenderObjectLike, promises: unknown): unknown {
      const start = now();
      const result = original.call(this, renderObject, promises);
      const elapsed = now() - start;
      const material = Array.isArray(renderObject.material) ? renderObject.material[0] : renderObject.material;
      const factor = DECIMAL_BASE ** MS_DECIMALS;
      pending.push({
        object: objectLabel(renderObject.object),
        material: material?.name || material?.type || '?',
        transparent: material?.transparent === true,
        camera: renderObject.camera && renderObject.camera === mainCamera() ? 'main' : (renderObject.camera?.type ?? '?'),
        ms: Math.round(elapsed * factor) / factor,
        key: renderObject.pipeline?.cacheKey ?? '?',
      });
      self._births++;
      return result;
    };
    this._installed = true;
    return true;
  }

  /** Os nascimentos desde a última chamada. */
  drain(): PipelineBirth[] {
    return this._pending.splice(0, this._pending.length);
  }
}
