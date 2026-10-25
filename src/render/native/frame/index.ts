/** Frame blocks of group 1, in binding order (see `FrameBlock.ts`). */
import type { FrameBlockFactory } from './FrameBlock.js';
import { createLightsBlock } from './lights.js';
import { createShadowBlock } from './shadow.js';

export const FRAME_BLOCKS: readonly FrameBlockFactory[] = [createLightsBlock, createShadowBlock];
