/**
 * Binários do host mais velhos que os fontes (SPEC-0660).
 *
 * O que estes testes travam: o export não empacota `rapier_native.dll`/`cortex_host.exe`
 * compilados antes da última mudança nos fontes (a DLL de 24/10, sem o `sleep` da SPEC-0655,
 * levava os carros parados para a origem só no export). Sem os fontes (Studio instalado), nada é velho.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { staleHostBinaries, staleHostMessage } from '../../native/scripts/host-freshness.mjs';

const OLD = new Date('2026-10-24T10:00:00Z');
const NEW = new Date('2026-11-01T10:00:00Z');

let root: string;
let build: string;

function write(rel: string, when: Date): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  fs.utimesSync(file, when, when);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-fresh-'));
  build = path.join(root, 'native', 'build');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('staleHostBinaries (SPEC-0660)', () => {
  it('acusa a DLL do Rapier compilada antes da última mudança em rapier-native/src', () => {
    write('native/build/rapier_native.dll', OLD);
    write('native/build/cortex_host.exe', NEW);
    write('native/rapier-native/src/lib.rs', NEW);
    write('native/src/main.cpp', OLD);
    const stale = staleHostBinaries(root, build);
    expect(stale.map((s) => s.binary)).toEqual(['rapier_native.dll']);
    expect(stale[0]!.source).toBe(path.join('native', 'rapier-native', 'src', 'lib.rs'));
    expect(staleHostMessage(stale, build)).toContain('yarn build:host');
  });

  it('acusa o host quando um fonte aninhado ou o CMakeLists é mais novo', () => {
    write('native/build/cortex_host.exe', OLD);
    write('native/src/shims/deep/a.cpp', NEW);
    expect(staleHostBinaries(root, build).map((s) => s.binary)).toEqual(['cortex_host.exe']);
  });

  it('não acusa nada com binários em dia ou sem os fontes (Studio instalado)', () => {
    write('native/build/rapier_native.dll', NEW);
    write('native/build/cortex_host.exe', NEW);
    write('native/rapier-native/src/lib.rs', OLD);
    expect(staleHostBinaries(root, build)).toEqual([]);
    fs.rmSync(path.join(root, 'native', 'rapier-native'), { recursive: true });
    write('native/build/rapier_native.dll', OLD);
    expect(staleHostBinaries(root, build)).toEqual([]);
  });
});
