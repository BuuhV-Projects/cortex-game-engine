// Garante que as pastas de host que o `electron-builder.json` lista em
// `win.extraResources` EXISTAM antes de empacotar (ADR-0176).
//
// O motivo é o `native/build-steam`: ele só existe em quem tem o Steamworks SDK
// (dev com o SDK baixado, ou o CI com a deploy key). Sem a pasta, o
// electron-builder aborta com "source doesn't exist" — e aí um fork, ou um dev
// que nunca buildou o host Steam, não conseguiria nem gerar o Studio. Uma pasta
// vazia empacota nada e faz o export `--steam` cair na mensagem clara de "host
// não buildado", que é o comportamento certo.
//
// Roda no `electron:build`, antes do electron-builder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Só as pastas OPCIONAIS: `native/build` (host desktop) é pré-requisito real do
// export e deve falhar alto se faltar, não ser mascarado por uma pasta vazia.
const OPTIONAL_HOST_DIRS = ['native/build-steam'];

for (const rel of OPTIONAL_HOST_DIRS) {
  const dir = path.join(engineRoot, rel);
  if (fs.existsSync(dir)) {
    console.log(`[hosts] ${rel}: presente`);
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  console.log(`[hosts] ${rel}: ausente — criada vazia (Studio sai sem esse host)`);
}
