// Same-run parity verdict (SPEC-0525): frames captured while ?parityFreeze alternates the two
// paths every frame. Pairs (i, i+2) are the same path (noise floor); pairs (i, i+1) are the two
// paths (difference). PASS when no difference pair has more than PARITY_MAX_PCT of its pixels
// above the noise floor.
// Usage: node parity-verdict.mjs <framesDir>     (prints one line; exit 0 PASS, 1 FAIL)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFrames, listRgbaFiles, loadFrame } from '../render-parity.mjs';

/** PRD-0466 acceptance: at most 0.01% of the pixels above the noise floor. */
export const PARITY_MAX_PCT = 0.01;
/** Two pairs of each kind need four consecutive frames. */
export const MIN_FRAMES = 4;
const PAIR_GAP_DIFF = 1;
const PAIR_GAP_CONTROL = 2;

/** Verdict over already loaded frames (in capture order). */
export function parityVerdict(frames) {
  if (frames.length < MIN_FRAMES) return { pass: false, reason: `captura curta (${frames.length} quadros)` };
  let noise = 0;
  for (let i = 0; i + PAIR_GAP_CONTROL < frames.length; i++) {
    noise = Math.max(noise, compareFrames(frames[i], frames[i + PAIR_GAP_CONTROL], 0).maxChannelDiff);
  }
  let worstPct = 0;
  let worstMax = 0;
  for (let i = 0; i + PAIR_GAP_DIFF < frames.length; i++) {
    const r = compareFrames(frames[i], frames[i + PAIR_GAP_DIFF], noise);
    worstPct = Math.max(worstPct, r.pctPixelsAboveNoiseFloor);
    worstMax = Math.max(worstMax, r.maxChannelDiff);
  }
  return { pass: worstPct <= PARITY_MAX_PCT, noise, diffMax: worstMax, diffPct: worstPct };
}

/** One-line text of a verdict: `PASS (alt 0/ctrl 0, 0.0000%)`. */
export function verdictText(v) {
  if (v.reason) return `FAIL (${v.reason})`;
  return `${v.pass ? 'PASS' : 'FAIL'} (alt ${v.diffMax}/ctrl ${v.noise}, ${v.diffPct.toFixed(4)}%)`;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('uso: parity-verdict.mjs <pastaDosQuadros>');
    process.exitCode = 2;
  } else {
    let v;
    try {
      v = parityVerdict(listRgbaFiles(dir).map(loadFrame));
    } catch (err) {
      v = { pass: false, reason: err.message };
    }
    console.log(verdictText(v));
    process.exitCode = v.pass ? 0 : 1;
  }
}
