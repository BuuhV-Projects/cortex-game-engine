// Ícone + identidade no launcher.exe (SPEC-0127). Recebe o PNG-fonte do jogo
// (cortex.json `icon`), deriva um .ico multi-tamanho (png-to-ico redimensiona
// pros tamanhos padrão do Windows) e embute no exe junto do ProductName/
// FileDescription (= nome de exibição) via rcedit — o que aparece no Explorer
// (ícone) e nas Propriedades/Gerenciador de Tarefas (nome).
//
// As libs (png-to-ico, rcedit) vivem no TOOLCHAIN de export (TDR-0003), não no
// runtime do jogo. Resolução best-effort: se não achar as libs (layout
// inesperado) ou o PNG for inválido, NÃO derruba o export — retorna
// `{ ok: false, reason }` e o exe fica com o ícone/identidade padrão do host.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// node_modules do toolchain de export, nos dois layouts:
//   dev      → native/export-toolchain/node_modules
//   packaged → resources/node_modules (toolchain mapeado; ../../node_modules)
const NM_CANDIDATES = [
  path.join(HERE, '..', 'export-toolchain', 'node_modules'),
  path.join(HERE, '..', '..', 'node_modules'),
];

/** Um `require` ancorado no primeiro node_modules que tenha png-to-ico + rcedit. */
function toolchainRequire() {
  for (const nm of NM_CANDIDATES) {
    if (fs.existsSync(path.join(nm, 'png-to-ico')) && fs.existsSync(path.join(nm, 'rcedit'))) {
      return createRequire(path.join(nm, '_resolve_.cjs'));
    }
  }
  return null;
}

/**
 * Embute o ícone (do PNG) + nome de exibição no `exePath` (in-place).
 * @param {string} exePath  Caminho do launcher.exe já copiado no dist.
 * @param {string} pngPath  PNG-fonte quadrado (será redimensionado).
 * @param {{ productName: string }} opts
 * @returns {Promise<{ok:true} | {ok:false, reason:string}>}
 */
export async function embedIcon(exePath, pngPath, { productName }) {
  const req = toolchainRequire();
  if (!req) return { ok: false, reason: 'toolchain sem png-to-ico/rcedit' };
  if (!fs.existsSync(pngPath)) return { ok: false, reason: `ícone não encontrado: ${pngPath}` };

  let icoPath;
  try {
    // import() do caminho resolvido cobre CJS e ESM das libs.
    const { default: pngToIco } = await import(pathToFileURL(req.resolve('png-to-ico')));
    const { default: rcedit } = await import(pathToFileURL(req.resolve('rcedit')));

    const icoBuf = await pngToIco(pngPath);
    // .ico num temp (rcedit precisa de ARQUIVO, não buffer); único por processo.
    icoPath = path.join(os.tmpdir(), `cortex-icon-${process.pid}.ico`);
    fs.writeFileSync(icoPath, icoBuf);

    // `file-version`/`product-version` são obrigatórios: sem o VS_FIXEDFILEINFO
    // o rcedit não grava a string table de forma que o Windows leia (medido —
    // ProductName voltava vazio). 1.0.0.0 é um default sensato até o Studio expor
    // versionamento do jogo.
    await rcedit(exePath, {
      icon: icoPath,
      'file-version': '1.0.0.0',
      'product-version': '1.0.0.0',
      'version-string': { ProductName: productName, FileDescription: productName },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err) };
  } finally {
    if (icoPath) {
      try {
        fs.rmSync(icoPath, { force: true });
      } catch {
        // temp resídual — o SO limpa
      }
    }
  }
}
