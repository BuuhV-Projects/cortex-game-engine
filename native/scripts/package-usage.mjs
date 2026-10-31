// Export leva só o que o jogo usa dos pacotes de textura (SPEC-0641 §6).
//
// Pacotes ficam em `assets/packages/<id>/` (centenas de MB). Um material entra
// no export se QUALQUER mapa dele é citado em algum arquivo de texto do jogo
// (cenas, overlay de autoria, código). Entra a pasta inteira do material — a
// normal/roughness acompanham a cor que a cena referencia. O resto fica fora.
import fs from 'node:fs';
import path from 'node:path';

/** Pastas do jogo que não são fonte de referência (deps, build, os próprios assets). */
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'assets', '.git', '.cortex-cache', 'dist', 'dist-native', 'native-build']);
const TEXT_EXT = new Set(['.json', '.ts', '.tsx', '.js', '.mjs', '.cjs']);
const REF_RE = /packages\/([a-z0-9][a-z0-9-]*)\/materials\/([a-z0-9][a-z0-9-]*)\//g;

function* textFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('dist')) yield* textFiles(path.join(dir, e.name));
    } else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
      yield path.join(dir, e.name);
    }
  }
}

/** Conjunto `"<id>/<material>"` citado pelo jogo em `gameDir`. */
export function usedPackageMaterials(gameDir) {
  const used = new Set();
  for (const file of textFiles(gameDir)) {
    const text = fs.readFileSync(file, 'utf-8');
    for (const m of text.matchAll(REF_RE)) used.add(`${m[1]}/${m[2]}`);
  }
  return used;
}

/**
 * Filtro pro cook: recebe o caminho relativo a `assets/` (com `/` ou `\`) e diz
 * se entra no export. Fora de `packages/` tudo entra (comportamento de sempre).
 */
export function packageAssetFilter(used) {
  return (rel) => {
    const parts = rel.split(/[\\/]/);
    if (parts[0] !== 'packages') return true;
    // packages/<id>/materials/<material>/<arquivo>
    return parts[2] === 'materials' && used.has(`${parts[1]}/${parts[3]}`);
  };
}
