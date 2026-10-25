/**
 * A frame block of the native renderer: per-view data in bind group 1 (SPEC-0475) that the
 * models read — lights (`lights.ts`) and the sun shadow (`shadow.ts`). Each block owns a fixed
 * range of group-1 bindings, so the light front (R1.2) and the shadow front (R1.3) never touch
 * the same file; the server only concatenates them (`frame/index.ts`).
 */
import type { NativeRendererHost } from '../NativeRenderer.js';

export interface FrameBlock {
  readonly name: string;
  /** Group-1 bind group layout entries, with this block's fixed binding numbers. */
  layoutEntries(): unknown[];
  /** Group-1 bind group entries for those bindings. */
  resources(): unknown[];
  /** Bumped whenever `resources()` would return other GPU objects (the group is rebuilt). */
  readonly version: number;
  /** Once per top-level frame, before the draws: writes this frame's data. */
  update(scene: unknown, camera: unknown): void;
  /** WGSL of the block: its group-1 declarations and the helper functions models call. */
  readonly wgsl: string;
}

/** `host` = the three renderer the server draws for (backend, textures); blocks that do not need it ignore it. */
export type FrameBlockFactory = (device: unknown, host: NativeRendererHost) => FrameBlock;

/** A block with nothing in it yet (the stub a front replaces). */
export function emptyFrameBlock(name: string): FrameBlock {
  return { name, version: 0, layoutEntries: () => [], resources: () => [], update: () => undefined, wgsl: '' };
}
