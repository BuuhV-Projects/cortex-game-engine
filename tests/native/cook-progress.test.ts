/**
 * Progresso do cook pro modal do export (SPEC-0699): avisa ANTES de cada GLB
 * (o lento) e no fim; cópia simples não avisa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
import { cookAssets } from '../../native/scripts/cook-assets.mjs';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cortex-cook-progress-'));
  writeFileSync(join(root, 'a.png'), 'x');
  // GLB inválido: o cook cai no "copiando original", mas o aviso sai antes.
  writeFileSync(join(root, 'b.glb'), 'not a glb');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('cookAssets — progresso', () => {
  it('avisa antes do GLB e no fim, sem avisar a cópia simples', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: unknown[] = [];
    await cookAssets(root, join(root, 'out'), join(root, 'cache'), (p: unknown) => calls.push(p));
    warn.mockRestore();

    expect(calls).toEqual([
      { done: 1, total: 2, file: 'b.glb', tex: undefined },
      { done: 2, total: 2, file: undefined, tex: undefined },
    ]);
  });
});
