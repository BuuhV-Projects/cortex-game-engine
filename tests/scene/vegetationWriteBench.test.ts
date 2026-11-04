/**
 * Microbench da escrita da `Vegetation` (SPEC-0675 (b)): 1.900 impostores de 2 sub-malhas (uma célula de LOD cheia
 * do DDD 00). Compara com o caminho de antes (`Euler` → `compose` → `multiplyMatrices` → `setMatrixAt` +
 * `computeBoundingSphere`) no mesmo processo, com JIT; o número sem JIT (o proxy do Hermes) sai do mesmo arquivo com
 * `node --jitless` e está na SPEC. Bytes por chamada pelo `heapUsed` (menor rodada sem coleta).
 * Para ver os números: `PERF_REPORT=1 yarn vitest run tests/scene/vegetationWriteBench.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { FLOATS_PER_INSTANCE, Vegetation, makePlaceholderVegetation } from '../../src/scene/Vegetation.js';

const TREES = 1900;
const CELL = 64;
const WARMUP = 20;
const ROUNDS = 9;
const CALLS = 10;
/** O caminho novo tem de ser mais rápido que o antigo por pelo menos isto (medido ~3× com JIT). */
const MIN_SPEEDUP = 1.5;
/**
 * No runner do CI (máquina compartilhada, ruído de tempo) a mesma medida deu ~1,3× e reprovou um PR sem relação com a
 * `Vegetation`: lá só se exige que o caminho novo não seja mais lento. A asserção de bytes, determinística, não muda.
 */
const MIN_SPEEDUP_CI = 1;
const speedupFloor = (): number => (process.env['CI'] ? MIN_SPEEDUP_CI : MIN_SPEEDUP);
/**
 * Escrita de uma faixa de 64 em 2 sub-malhas: bytes por chamada. Sobra a caixa de double dos argumentos das chamadas
 * que o TurboFan não inlina (~40 B por instância e sub-malha, medido; o Hermes não tem isso). Um objeto ou array por
 * instância voltando passa dele.
 */
const RANGE_CEILING_BYTES = 64 * 2 * 64;

function forest(n: number): number[] {
  let s = 1931;
  const r = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(r() * 240, 0, r() * 240, r() * 6.28, 0.8 + r() * 0.4);
  return out;
}

/** Referência: o `sync` de antes, sobre as mesmas malhas. */
function oldSync(subs: { mesh: InstancedMesh; local: Matrix4 }[], flat: number[]): void {
  const t = new Matrix4();
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const sc3 = new Vector3();
  const n = flat.length / FLOATS_PER_INSTANCE;
  for (const { mesh, local } of subs) {
    mesh.count = n;
    for (let i = 0; i < n; i++) {
      const b = i * FLOATS_PER_INSTANCE;
      p.set(flat[b]!, flat[b + 1]!, flat[b + 2]!);
      e.set(0, flat[b + 3]!, 0);
      q.setFromEuler(e);
      sc3.setScalar(flat[b + 4]!);
      t.compose(p, q, sc3);
      m.multiplyMatrices(t, local);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

function msPerCall(fn: () => void): number {
  for (let i = 0; i < WARMUP; i++) fn();
  const rounds: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < CALLS; i++) fn();
    rounds.push((performance.now() - t0) / CALLS);
  }
  rounds.sort((a, b) => a - b);
  return rounds[ROUNDS >> 1]!;
}

function bytesPerCall(fn: () => void): number {
  for (let i = 0; i < WARMUP * 10; i++) fn();
  let best = Infinity;
  for (let r = 0; r < ROUNDS; r++) {
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < CALLS * 10; i++) fn();
    const after = process.memoryUsage().heapUsed;
    if (after >= before) best = Math.min(best, (after - before) / (CALLS * 10));
  }
  return best;
}

function report(line: string): void {
  if (process.env['PERF_REPORT']) process.stdout.write(`[veg] ${line}\n`);
}

describe('Vegetation — custo da escrita (SPEC-0675)', () => {
  it('setInstances de 1.900 é mais rápido que o caminho de antes', () => {
    const flat = forest(TREES);
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    const subs = (veg as unknown as { subs: { mesh: InstancedMesh; local: Matrix4 }[] }).subs;
    const before = msPerCall(() => oldSync(subs, flat));
    const after = msPerCall(() => veg.setInstances(flat));
    const data = new Float32Array(flat);
    const adopted = msPerCall(() => veg.adoptInstances(data));
    report(`1900 inteiras: ${after.toFixed(3)} ms (antes ${before.toFixed(3)} ms; adotado ${adopted.toFixed(3)} ms)`);
    expect(after * speedupFloor()).toBeLessThan(before);
  });

  it('a escrita de uma faixa de 64 não aloca por instância', () => {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), TREES);
    veg.adoptInstances(new Float32Array(forest(TREES)));
    const cell = new Float32Array(forest(CELL));
    let slot = 0;
    const slots = TREES / CELL;
    const write = (): void => {
      const mesh = veg.group.children[0] as InstancedMesh;
      mesh.instanceMatrix.clearUpdateRanges(); // o upload do `three` que consumiria as faixas
      (veg.group.children[1] as InstancedMesh).instanceMatrix.clearUpdateRanges();
      veg.writeInstances((slot++ % Math.floor(slots)) * CELL, cell);
    };
    const ms = msPerCall(write);
    const bytes = bytesPerCall(write);
    report(`faixa de 64: ${(ms * 1000).toFixed(1)} µs, ${bytes.toFixed(0)} B/chamada`);
    expect(bytes).toBeLessThan(RANGE_CEILING_BYTES);
  });
});
