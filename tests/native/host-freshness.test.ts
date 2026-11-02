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
import { HOST_BUILD_STAMP, rebuildCommand, staleHostBinaries, staleHostMessage } from '../../native/scripts/host-freshness.mjs';

const OLD = new Date('2026-10-24T10:00:00Z');
const NEW = new Date('2026-11-01T10:00:00Z');
const NEWER = new Date('2026-11-02T10:00:00Z');
const CARGO_DLL = 'native/rapier-native/target/release/rapier_native.dll';

let root: string;
let build: string;

function write(rel: string, when: Date, content = 'x'): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.utimesSync(file, when, when);
}
const staleNames = () => staleHostBinaries(root, build).map((s: { binary: string }) => s.binary);

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
    expect(stale.map((s: { binary: string }) => s.binary)).toEqual(['rapier_native.dll']);
    expect(stale[0]!.source).toBe(path.join('native', 'rapier-native', 'src', 'lib.rs'));
    expect(staleHostMessage(stale, build)).toContain('yarn build:host');
  });

  it('acusa mudança só no Rapier com patch ou só no shader do bloom', () => {
    write('native/build/rapier_native.dll', OLD);
    write('native/build/cortex_host.exe', OLD);
    write('native/rapier-native/patched/rapier3d/src/pipeline.rs', NEW);
    write('native/rapier-native/patched/rapier3d/target/junk.rlib', NEWER); // saída, não fonte
    expect(staleNames()).toEqual(['rapier_native.dll']);
    fs.rmSync(path.join(root, 'native', 'rapier-native'), { recursive: true });
    write('native/shaders/bloom.wgsl', NEW);
    expect(staleNames()).toEqual(['cortex_host.exe']);
  });

  it('aceita o host que não foi religado quando o selo do build é mais novo que os fontes', () => {
    write('native/build/cortex_host.exe', OLD);
    write('native/CMakeLists.txt', NEW); // só comentário: o CMake reconfigura e não religa o exe
    expect(staleNames()).toEqual(['cortex_host.exe']);
    write(`native/build/${HOST_BUILD_STAMP}`, NEWER);
    expect(staleNames()).toEqual([]);
  });

  it('compara a DLL com a saída do cargo: nova e idêntica passa, diferente é acusada', () => {
    write('native/rapier-native/src/lib.rs', NEW);
    write(CARGO_DLL, NEWER, 'dll-nova');
    write('native/build/rapier_native.dll', OLD, 'dll-nova'); // copy_if_different manteve a data antiga
    expect(staleNames()).toEqual([]);
    write('native/build/rapier_native.dll', NEWER, 'dll-velha');
    const stale = staleHostBinaries(root, build);
    expect(stale.map((s: { reason?: string }) => s.reason)).toEqual(['differs']);
    expect(staleHostMessage(stale, build)).toContain('difere da saída do cargo');
  });

  it('não acusa nada com binários em dia ou sem os fontes (Studio instalado)', () => {
    write('native/build/rapier_native.dll', NEW);
    write('native/build/cortex_host.exe', NEW);
    write('native/rapier-native/src/lib.rs', OLD);
    expect(staleNames()).toEqual([]);
    fs.rmSync(path.join(root, 'native', 'rapier-native'), { recursive: true });
    write('native/build/rapier_native.dll', OLD);
    expect(staleNames()).toEqual([]);
  });

  it('manda recompilar a pasta que o export usa (Steam/GDK não são o yarn build:host)', () => {
    expect(rebuildCommand(path.join(root, 'native', 'build'))).toBe('`yarn build:host`');
    expect(rebuildCommand(path.join(root, 'native', 'build-steam'))).toContain('cmake --build native/build-steam');
    expect(rebuildCommand(path.join(root, 'native', 'build-gdk'))).toContain('cargo build --release');
  });
});
