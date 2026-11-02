// Binários do host mais velhos que os fontes (SPEC-0660): o export não pode empacotar um
// `rapier_native.dll` ou `cortex_host.exe` compilado antes da última mudança no código que
// eles carregam (a DLL de 24/10 sem o `sleep` da SPEC-0655 teleportava os carros parados).
// Fonte ausente (Studio instalado, sem os fontes do host) não conta.
import fs from 'node:fs';
import path from 'node:path';

/** Fontes (pastas ou arquivos, relativos à raiz) de cada binário de `native/build*`. */
export const HOST_BINARY_SOURCES = {
  'cortex_host.exe': ['native/src', 'native/shaders', 'native/CMakeLists.txt'],
  // Do Rapier com patch só o que o cargo compila: doc ali dentro (README) não religa a DLL e travaria o export.
  'rapier_native.dll': [
    'native/rapier-native/src',
    'native/rapier-native/Cargo.toml',
    'native/rapier-native/patched/rapier3d/src',
    'native/rapier-native/patched/rapier3d/Cargo.toml',
  ],
};
/**
 * Selo que o alvo `host_runtime_files` do CMake grava em TODA compilação que termina: uma mudança que
 * não religa o exe (comentário no CMakeLists) não deixa o host "velho" para sempre.
 */
export const HOST_BUILD_STAMP = 'host-build.stamp';
/** Saída do cargo que o CMake copia para `native/build*` (`copy_if_different` mantém a data antiga). */
export const CARGO_RAPIER_DLL = 'native/rapier-native/target/release/rapier_native.dll';
/** Pastas que não são fonte (saída do cargo dentro de `patched/`). */
const SKIP_DIRS = new Set(['target', '.git']);

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/** O arquivo mais novo sob `p` (arquivo ou pasta, recursivo), ou `null` se `p` não existe. */
function newestFile(p) {
  let stat;
  try {
    stat = fs.statSync(p);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return { file: p, mtimeMs: stat.mtimeMs };
  let best = null;
  for (const entry of fs.readdirSync(p)) {
    if (SKIP_DIRS.has(entry)) continue;
    const found = newestFile(path.join(p, entry));
    if (found && (!best || found.mtimeMs > best.mtimeMs)) best = found;
  }
  return best;
}

function newestSource(engineRoot, sources) {
  let newest = null;
  for (const s of sources) {
    const found = newestFile(path.join(engineRoot, s));
    if (found && (!newest || found.mtimeMs > newest.mtimeMs)) newest = found;
  }
  return newest;
}

function sameBytes(a, b) {
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/**
 * Binários de `hostBuild` mais velhos que o fonte mais novo deles, ou (a DLL) diferentes da saída do cargo.
 * @returns {{ binary: string, builtMs: number, source: string, sourceMs: number, reason?: string }[]}
 */
export function staleHostBinaries(engineRoot, hostBuild) {
  const stale = [];

  const exe = mtimeOf(path.join(hostBuild, 'cortex_host.exe'));
  if (exe !== null) {
    const built = Math.max(exe, mtimeOf(path.join(hostBuild, HOST_BUILD_STAMP)) ?? 0);
    const newest = newestSource(engineRoot, HOST_BINARY_SOURCES['cortex_host.exe']);
    if (newest && newest.mtimeMs > built) {
      stale.push({ binary: 'cortex_host.exe', builtMs: built, source: path.relative(engineRoot, newest.file), sourceMs: newest.mtimeMs });
    }
  }

  const dll = path.join(hostBuild, 'rapier_native.dll');
  const shipped = mtimeOf(dll);
  if (shipped !== null) {
    const cargoDll = path.join(engineRoot, CARGO_RAPIER_DLL);
    const cargo = mtimeOf(cargoDll);
    const built = cargo ?? shipped;
    const newest = newestSource(engineRoot, HOST_BINARY_SOURCES['rapier_native.dll']);
    if (newest && newest.mtimeMs > built) {
      stale.push({ binary: 'rapier_native.dll', builtMs: built, source: path.relative(engineRoot, newest.file), sourceMs: newest.mtimeMs });
    } else if (cargo !== null && !sameBytes(dll, cargoDll)) {
      stale.push({ binary: 'rapier_native.dll', builtMs: shipped, source: CARGO_RAPIER_DLL, sourceMs: cargo, reason: 'differs' });
    }
  }
  return stale;
}

/** Comando que recompila a pasta `hostBuild` (o `yarn build:host` só compila `native/build`). */
export function rebuildCommand(hostBuild) {
  const dir = path.basename(hostBuild);
  if (dir === 'build') return '`yarn build:host`';
  return `\`cargo build --release --manifest-path native/rapier-native/Cargo.toml\` e \`cmake --build native/${dir}\``;
}

/** Mensagem de erro do export para os binários velhos. */
export function staleHostMessage(stale, hostBuild) {
  const when = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  const lines = stale.map((s) =>
    s.reason === 'differs'
      ? `  ${s.binary} difere da saída do cargo (${s.source})`
      : `  ${s.binary} (${when(s.builtMs)}) é mais velho que ${s.source} (${when(s.sourceMs)})`,
  );
  return `[export] host desatualizado em ${hostBuild}:\n${lines.join('\n')}\n         Rode ${rebuildCommand(hostBuild)} e exporte de novo (SPEC-0660).`;
}
