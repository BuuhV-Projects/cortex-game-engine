// Binários do host mais velhos que os fontes (SPEC-0660): o export não pode empacotar um
// `rapier_native.dll` ou `cortex_host.exe` compilado antes da última mudança no código que
// eles carregam (a DLL de 24/10 sem o `sleep` da SPEC-0655 teleportava os carros parados).
// Mesma regra do `host_fresh` do setup-worktree.sh. Fonte ausente (Studio instalado) não conta.
import fs from 'node:fs';
import path from 'node:path';

/** Cada binário de `native/build*` e os fontes (pastas ou arquivos, relativos à raiz) que o produzem. */
export const HOST_BINARY_SOURCES = {
  'cortex_host.exe': ['native/src', 'native/CMakeLists.txt'],
  'rapier_native.dll': ['native/rapier-native/src', 'native/rapier-native/Cargo.toml'],
};

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
    const found = newestFile(path.join(p, entry));
    if (found && (!best || found.mtimeMs > best.mtimeMs)) best = found;
  }
  return best;
}

/**
 * Binários de `hostBuild` mais velhos que o fonte mais novo deles.
 * @returns {{ binary: string, builtMs: number, source: string, sourceMs: number }[]}
 */
export function staleHostBinaries(engineRoot, hostBuild) {
  const stale = [];
  for (const [binary, sources] of Object.entries(HOST_BINARY_SOURCES)) {
    let built;
    try {
      built = fs.statSync(path.join(hostBuild, binary)).mtimeMs;
    } catch {
      continue; // binário ausente: quem copia acusa
    }
    let newest = null;
    for (const s of sources) {
      const found = newestFile(path.join(engineRoot, s));
      if (found && (!newest || found.mtimeMs > newest.mtimeMs)) newest = found;
    }
    if (newest && newest.mtimeMs > built) {
      stale.push({ binary, builtMs: built, source: path.relative(engineRoot, newest.file), sourceMs: newest.mtimeMs });
    }
  }
  return stale;
}

/** Mensagem de erro do export para os binários velhos. */
export function staleHostMessage(stale, hostBuild) {
  const when = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  const lines = stale.map((s) => `  ${s.binary} (${when(s.builtMs)}) é mais velho que ${s.source} (${when(s.sourceMs)})`);
  return `[export] host desatualizado em ${hostBuild}:\n${lines.join('\n')}\n         Rode \`yarn build:host\` e exporte de novo (SPEC-0660).`;
}
