/**
 * `?wbCensus=1`: who calls `queue.writeBuffer`, per frame and per buffer label (SPEC-0597).
 *
 * Off by default. Wraps the device's `createBuffer` (keeps each buffer's label) and
 * `queue.writeBuffer` (counts by label without the three's binding id, so `bindingBuffer12_object_1`
 * and `bindingBuffer98_object_1` add up as `bindingBuffer_object_1`). A frame with at least
 * {@link SPIKE_WRITES} writes is logged on `debug('perf')` with its top labels and the caller's extra
 * counter (the `RenderIdRefresh` full refreshes of that frame).
 */
import type { Object3D } from 'three';
import { debug } from '../core/debug.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';

const QUERY_KEY = 'wbCensus=';
/** Writes in one frame that make it a spike (normal: ~100 in the DDD 61). */
export const SPIKE_WRITES = 1000;
/** Labels listed per spike, most writes first. */
const TOP_LABELS = 5;
/** Frames between average reports. */
const REPORT_FRAMES = 600;
const UNLABELED = '?';
/** Writes of one label in a frame before its JS stack is sampled (once per label per frame). */
const STACK_AT = 200;
/** Stack lines kept per sample (after the census' own frame). */
const STACK_LINES = 8;
/** Known answer: the native renderer writes its view block once per frame (`beginFrame`). */
const WATCHED_LABEL = 'native.view';
/** Lines of `Error().stack` that are the census itself. */
const OWN_FRAMES = 4;

interface DeviceLike {
  createBuffer(descriptor: { label?: string; usage?: number }): object;
  queue: { writeBuffer(buffer: object, ...rest: unknown[]): unknown };
}

/** The three's binding id out of the label: `bindingBuffer12_object_1` → `bindingBuffer_object_1`. */
export function normalizeLabel(label: string | undefined, usage?: number): string {
  if (label) return label.replace(/\d+_/, '_');
  return usage === undefined ? UNLABELED : `${UNLABELED}u${usage}`;
}

/** Counts per frame; `flush` is called when the frame id changes. */
export class WriteBufferCensus {
  private readonly _counts = new Map<string, number>();
  private readonly _stacks = new Map<string, string>();
  private _total = 0;
  private _frame = -1;
  private _frames = 0;
  private _sum = 0;
  private _watched = 0;
  private _extraAt = 0;

  /**
   * @param frameId - Current frame (the three's `NodeFrame.frameId`).
   * @param extra - A counter logged per spike as its delta in the frame (e.g. full refreshes).
   * @param log - Where a line goes (default `debug('perf')`).
   */
  constructor(
    private readonly _frameId: () => number,
    private readonly _extra: () => number = () => 0,
    private readonly _log: (line: string) => void = (line) => debug('perf', line),
  ) {}

  /** Counts one write of a buffer with this label. */
  count(label: string): void {
    const frame = this._frameId();
    if (frame !== this._frame) this.flush(frame);
    const n = (this._counts.get(label) ?? 0) + 1;
    this._counts.set(label, n);
    if (n === STACK_AT) this._stacks.set(label, stackSample());
    this._total++;
  }

  /** Closes the current frame (logs it if it is a spike) and starts `next`. */
  flush(next: number): void {
    const extra = this._extra();
    if (this._frame >= 0) {
      this._frames++;
      this._sum += this._total;
      this._watched += this._counts.get(WATCHED_LABEL) ?? 0;
      if (this._total >= SPIKE_WRITES) {
        const ranked = [...this._counts.entries()].sort((a, b) => b[1] - a[1]);
        const top = ranked.slice(0, TOP_LABELS).map(([l, n]) => `${l}=${n}`).join(' ');
        this._log(`[wbCensus] spike frame=${this._frame} writes=${this._total} full=${extra - this._extraAt} | ${top}`);
        const first = ranked[0]![0];
        const stack = this._stacks.get(first);
        if (stack) this._log(`[wbCensus] stack ${first}: ${stack}`);
      }
      if (this._frames % REPORT_FRAMES === 0) {
        const avg = (n: number): string => (n / this._frames).toFixed(2);
        this._log(`[wbCensus] frames=${this._frames} avgWrites=${avg(this._sum)} ${WATCHED_LABEL}=${avg(this._watched)}`);
      }
    }
    this._extraAt = extra;
    this._counts.clear();
    this._stacks.clear();
    this._total = 0;
    this._frame = next;
  }
}

/** The caller's JS stack, minus the census' own frames, on one line. */
function stackSample(): string {
  // Skips the Error line, this function, `count` and the `writeBuffer` wrapper.
  const lines = (new Error().stack ?? '').split('\n').slice(OWN_FRAMES).map((l) => l.trim());
  return lines.slice(0, STACK_LINES).join(' < ');
}

/** Wraps `device`, or `null` without `?wbCensus=1`. */
export function installWriteBufferCensus(device: unknown, frameId: () => number, extra?: () => number): WriteBufferCensus | null {
  if (!queryFlagRequested(QUERY_KEY, false)) return null;
  const d = device as DeviceLike | null;
  if (!d || typeof d.createBuffer !== 'function' || typeof d.queue?.writeBuffer !== 'function') return null;
  const census = new WriteBufferCensus(frameId, extra);
  const labels = new WeakMap<object, string>();
  const createBuffer = d.createBuffer.bind(d);
  d.createBuffer = (descriptor) => {
    const buffer = createBuffer(descriptor);
    labels.set(buffer, normalizeLabel(descriptor.label, descriptor.usage));
    return buffer;
  };
  const queue = d.queue;
  const writeBuffer = queue.writeBuffer.bind(queue);
  queue.writeBuffer = (buffer, ...rest) => {
    census.count(labels.get(buffer) ?? UNLABELED);
    return writeBuffer(buffer, ...rest);
  };
  debug('perf', '[wbCensus] instalado');
  return census;
}

const RANGE_QUERY = 'rangeCensus=';
/** Frames between two range censuses. */
export const RANGE_CENSUS_FRAMES = 120;
/** Attributes listed per census, most pending ranges first. */
const RANGE_TOP = 6;

interface AttributeLike {
  updateRanges?: readonly unknown[];
  isInstancedBufferAttribute?: boolean;
}

/** One instanced attribute with update ranges the three has not uploaded yet. */
export interface PendingRanges {
  mesh: string;
  attribute: string;
  ranges: number;
  count: number;
  visible: boolean;
}

/**
 * The instanced attributes under `root` with the most pending `updateRanges` (SPEC-0597). The three
 * clears them only when it uploads the attribute (it draws the mesh with a new version): a mesh it
 * does not draw keeps them, and its next upload is one `writeBuffer` per range.
 */
export function pendingInstanceRanges(root: Object3D, limit = RANGE_TOP): PendingRanges[] {
  const found: PendingRanges[] = [];
  root.traverse((object) => {
    const mesh = object as Object3D & { isInstancedMesh?: boolean; count?: number; instanceMatrix?: AttributeLike; instanceColor?: AttributeLike | null; geometry?: { attributes?: Record<string, AttributeLike> } };
    const add = (name: string, attribute: AttributeLike | null | undefined): void => {
      const ranges = attribute?.updateRanges?.length ?? 0;
      if (ranges > 0) found.push({ mesh: object.name || object.type, attribute: name, ranges, count: mesh.count ?? 0, visible: object.visible });
    };
    if (mesh.isInstancedMesh) {
      add('instanceMatrix', mesh.instanceMatrix);
      add('instanceColor', mesh.instanceColor);
    }
    const attributes = mesh.geometry?.attributes;
    if (attributes) for (const name in attributes) if (attributes[name]!.isInstancedBufferAttribute) add(name, attributes[name]);
  });
  return found.sort((a, b) => b.ranges - a.ranges).slice(0, limit);
}

/** `?rangeCensus=1`. */
export function rangeCensusRequested(): boolean {
  return queryFlagRequested(RANGE_QUERY, false);
}
