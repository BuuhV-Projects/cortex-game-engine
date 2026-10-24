/**
 * Instruments of the native renderer's R0 (SPEC-0505): the census and the reference WGSL.
 *
 * - `?rendererCensus=1`: every `CENSUS_PERIOD_MS`, classifies every visible drawable in the
 *   camera frustum (`RendererClassifier`) and records counts per class and per refusal in the
 *   perf trace — what the native renderer would take and why it refuses the rest.
 * - `?wgslDump=1`: wraps the three's `getForRender` and writes the WGSL of every new shader
 *   state next to the game (`wgsl-NNNN.txt`), with the class of the material that created it:
 *   the source of each fixed model's math.
 *
 * Host only and off by default; neither touches the render path without its query.
 */
import { Frustum, Matrix4, type Camera, type Material, type Object3D } from 'three';
import { isNativeHost } from '../../scene/StaticMerge.js';
import { queryFlagRequested } from '../TransformOnlyRefresh.js';
import { classifyDrawable, classLabel } from './RendererClassifier.js';

/** Census sampling period: often enough for a walking round, cheap enough to ignore. */
export const CENSUS_PERIOD_MS = 5000;

const CENSUS_QUERY = 'rendererCensus=';
const WGSL_QUERY = 'wgslDump=';
const WGSL_FILE_DIGITS = 4;

type Record_ = (name: string, data: Record<string, number | string>) => void;

/** `label=n;label=n…`, largest count first (ties by label, so the text is stable). */
export function formatCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([label, n]) => `${label}=${n}`)
    .join(';');
}

/** Periodic census of what the native renderer would draw. */
export class RendererCensus {
  private _sinceMs = 0;
  private readonly _seenMaterials = new Set<string>();
  private readonly _frustum = new Frustum();
  private readonly _viewProj = new Matrix4();

  constructor(private readonly _record: Record_) {}

  /** Advances the clock; on the period, takes one sample of the scene seen by `camera`. */
  tick(deltaMs: number, scene: Object3D, camera: Camera): void {
    this._sinceMs += deltaMs;
    if (this._sinceMs < CENSUS_PERIOD_MS) return;
    this._sinceMs = 0;
    this.sample(scene, camera);
  }

  /** One census sample (public for tests). */
  sample(scene: Object3D, camera: Camera): void {
    camera.updateMatrixWorld();
    this._viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProj);
    const counts = new Map<string, number>();
    let objects = 0;
    let covered = 0;
    let refused = 0;
    let skip = 0;
    scene.traverseVisible((object) => {
      const drawable = object as Object3D & { material?: Material | Material[]; frustumCulled: boolean };
      if (!drawable.material || !camera.layers.test(object.layers)) return;
      if (drawable.frustumCulled && !this._frustum.intersectsObject(object)) return;
      const result = classifyDrawable(object, drawable.material);
      const label = classLabel(result);
      counts.set(label, (counts.get(label) ?? 0) + 1);
      objects++;
      if (result.kind === 'covered') covered++;
      else if (result.kind === 'skip') skip++;
      else refused++;
      const material = Array.isArray(drawable.material) ? drawable.material[0] : drawable.material;
      if (material && !this._seenMaterials.has(material.uuid)) {
        this._seenMaterials.add(material.uuid);
        this._record('rendererCensusMaterial', { label, type: material.type, name: material.name || object.name });
      }
    });
    this._record('rendererCensus', { objects, covered, refused, skip, classes: formatCounts(counts) });
  }
}

interface RenderObjectLike {
  object: Object3D;
  material: Material;
}
interface ShaderStateLike {
  vertexShader?: string | null;
  fragmentShader?: string | null;
}
interface NodesLike {
  getForRender(renderObject: RenderObjectLike, useAsync?: boolean): ShaderStateLike | Promise<ShaderStateLike>;
}

/**
 * Wraps `renderer._nodes.getForRender` so each new shader state is written once, with the
 * class of the material that created it. Returns how many files were written so far.
 */
export function installWgslDump(
  renderer: { _nodes?: NodesLike },
  write: (name: string, text: string) => boolean,
): (() => number) | null {
  const nodes = renderer._nodes;
  if (!nodes || typeof nodes.getForRender !== 'function') return null;
  const original = nodes.getForRender.bind(nodes);
  const seen = new WeakSet<object>();
  const texts = new Set<string>();
  let written = 0;
  const dump = (state: ShaderStateLike, renderObject: RenderObjectLike): void => {
    if (!state || seen.has(state)) return;
    seen.add(state);
    const body = `${state.vertexShader ?? ''}\n// ---- fragment ----\n${state.fragmentShader ?? ''}`;
    if (texts.has(body)) return;
    texts.add(body);
    const label = classLabel(classifyDrawable(renderObject.object, renderObject.material));
    const header =
      `// class: ${label}\n// material: ${renderObject.material.type} "${renderObject.material.name}"\n` +
      `// object: ${renderObject.object.type} "${renderObject.object.name}"\n`;
    written++;
    write(`wgsl-${String(written).padStart(WGSL_FILE_DIGITS, '0')}.txt`, header + body);
  };
  nodes.getForRender = (renderObject, useAsync) => {
    const result = original(renderObject, useAsync);
    if (result && typeof (result as Promise<ShaderStateLike>).then === 'function') {
      void (result as Promise<ShaderStateLike>).then((state) => dump(state, renderObject));
    } else {
      dump(result as ShaderStateLike, renderObject);
    }
    return result;
  };
  return () => written;
}

/**
 * Installs the R0 instruments the query asks for (host only). Returns the census to tick, or
 * `null` when the census is off (the WGSL dump, if asked, is installed either way).
 */
export function installRendererInstruments(renderer: unknown, record: Record_): RendererCensus | null {
  if (!isNativeHost()) return null;
  if (queryFlagRequested(WGSL_QUERY, false)) {
    const write = (globalThis as { __cortexWriteBaseFile?: (name: string, text: string) => boolean }).__cortexWriteBaseFile;
    const installed = write ? installWgslDump(renderer as { _nodes?: NodesLike }, write) : null;
    record('wgslDump', { installed: installed ? 1 : 0 });
  }
  return queryFlagRequested(CENSUS_QUERY, false) ? new RendererCensus(record) : null;
}
