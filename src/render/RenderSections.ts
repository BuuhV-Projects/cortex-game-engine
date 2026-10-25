/**
 * Sections of the render frame for the R1.6 phase 0 (SPEC-0585): timed blocks nested in the
 * profiler's `render` (`sceneRender`, `nativeProject`, `nativeCull`, `nativeEmit`), so the perf trace
 * splits the native render without the phase probe (which inflates what it wraps).
 *
 * Off unless the game's profiler is on (`export --debug` / `?perf=1`): `begin`/`end` are no-ops then.
 * `?renderSectionSpin=<name>` busy-waits SPIN_MS inside that section — the known-answer case that
 * proves each section measures its own block (its average must rise by ~SPIN_MS, the others not).
 */
interface SectionSink {
  begin(name: string): void;
  end(name: string): void;
}

const SPIN_QUERY = 'renderSectionSpin=';
/** Known-answer delay: large against the ±0,1 ms noise of `cpuAvg`, small against a frame. */
const SPIN_MS = 2;

let sink: SectionSink | null = null;
let spinName: string | null = null;

/** Plugs the game's frame profiler (call once). */
export function setRenderSections(profiler: SectionSink | null): void {
  sink = profiler;
  const search = typeof location !== 'undefined' ? location.search : '';
  const at = search.indexOf(SPIN_QUERY);
  spinName = at < 0 ? null : search.slice(at + SPIN_QUERY.length).split('&')[0]!;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function beginSection(name: string): void {
  if (sink === null) return;
  sink.begin(name);
  if (spinName === name) {
    const until = now() + SPIN_MS;
    while (now() < until) {
      // busy-wait: the known-answer delay of this section
    }
  }
}

export function endSection(name: string): void {
  if (sink !== null) sink.end(name);
}
