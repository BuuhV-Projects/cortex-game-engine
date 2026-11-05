/**
 * Native draws that sampled the CSM in a frame (SPEC-0690, item 6: `sunShadow.csmReceivers` in the perf-trace).
 *
 * The `NativeRenderer` counts each `receiveShadow` draw it hands out; the `ShadowBlock` flushes the previous frame's
 * count and arms the next one at its `update` (before the draws), with whether the CSM is sampled this frame. Outside
 * the trace the flush reaches `traceCsmReceivers`, which returns on its first line.
 */
import { traceCsmReceivers } from '../../../core/perfTrace/traceCounters.js';

let sampling = false;
let count = 0;

/** A `receiveShadow` draw was handed to the list; it counts only while the CSM is sampled. */
export function countCsmReceiver(): void {
  if (sampling) count++;
}

/** Reports the frame that ends and arms the next: `csmSampled` = the block wrote the CSM with a cascade on. */
export function flushCsmReceivers(csmSampled: boolean): void {
  if (count > 0) traceCsmReceivers(count);
  count = 0;
  sampling = csmSampled;
}
