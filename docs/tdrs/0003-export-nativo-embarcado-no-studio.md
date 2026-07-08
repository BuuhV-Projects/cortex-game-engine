# TDR 0003 - Export CortexNative embarcado no Studio empacotado (Windows)

**Data:** 2026-07-08
**Status:** aceito

## Contexto

O export CortexNative (ADR-0101) gera uma pasta `dist-native/` distribuível de
um jogo (exe + dlls + `boot.hbc` + `assets.pak`). O fluxo é orquestrado por
`native/scripts/export-game.mjs`, que:

1. roda `native/scripts/bundle.mjs` (esbuild + Babel) — que **re-bundla o jogo
   na máquina do usuário**, resolvendo `cortex-game-engine` pro **source** da
   engine (`src/index-runtime.ts`), puxando `three` (`three.webgpu.js`),
   `three-mesh-bvh`, `zod/v3` e os shims de `native/js/`;
2. compila o bundle pra bytecode com o `hermes.exe` (x86);
3. copia o host compilado de `native/build/` (`cortex_host.exe` + `SDL3.dll`,
   `wgpu_native.dll`, `hermes.dll`, `rapier_native.dll`, `Roboto-Medium.ttf`);
4. empacota `assets/` num `assets.pak` (ADR-0104) + cenas + `cortex.json`.

Até aqui isso **só funcionava com `electron:dev`**: o handler `export:native`
(`electron/main.ts`) e o `bundle.mjs` dependiam de rodar dentro do repositório
completo — `node_modules` com esbuild/babel/three, o `src/` da engine e o
`native/build/` compilado. No Studio empacotado nada disso existe:

- `files: ["out/**"]` no `electron-builder.json` — o `native/` e o `src/` não
  entram no build;
- o `node_modules` do app vai pro `app.asar` e sofre **pruning de devDeps**; o
  `esbuild` traz um **binário nativo** (`@esbuild/win32-x64`) que **não roda de
  dentro do `.asar`**;
- os binários do host (`native/build/`) são artefatos de compilação
  (CMake/Ninja + Rust + MSVC) que nunca eram produzidos no CI.

Resultado: no `.exe` instalado o handler caía no fallback
"Export nativo indisponível neste build do Studio". A intenção do projeto é o
contrário — **dev é só pra desenvolver a engine**; o Studio distribuído tem que
exportar nativo sozinho.

O host nativo hoje é **Windows-only** por design (D3D12 via wgpu-native,
`hermes.exe` x86, `vcvars64`). Portar pra Metal/Vulkan está fora do escopo M1/M2.

## Decisão

Embarcar o host e o **toolchain de export auto-contido** no Studio empacotado,
**apenas no target Windows**, reconstruindo em `resources/` o layout mínimo que
o `export-game.mjs`/`bundle.mjs` esperam (ambos derivam a raiz da engine do
próprio caminho do script → em produção isso é `resourceBase()` =
`process.resourcesPath`).

### 1. Toolchain de export isolado (`native/export-toolchain/`)

Um projeto Node à parte, com `package.json` + `yarn.lock` **pinados** nas mesmas
versões que a engine usa, contendo só o que o `bundle.mjs` precisa em runtime:
`esbuild`, `@babel/core`, `@babel/plugin-transform-classes`,
`@babel/plugin-transform-arrow-functions`, `three`, `three-mesh-bvh`, `zod`.

O CI roda `yarn install --frozen-lockfile` dentro dessa pasta (no runner
Windows, o que instala o opcional `@esbuild/win32-x64`) e o
`electron-builder.json` copia `native/export-toolchain/node_modules` →
`resources/node_modules`. Isso isola a árvore de deps do export da do próprio
Studio (que é pruned/asar) e dá resolução de módulo determinística: tanto o
`import 'esbuild'`/`'@babel/core'` de `native/scripts/` quanto os imports da
engine a partir de `resources/src/` sobem até `resources/node_modules`.

### 2. `win.extraResources` (só Windows)

No `electron-builder.json`, um bloco `win.extraResources` (mesclado com o
`extraResources` comum) copia, preservando os subpaths:

- `native/build` → `native/build` (filtro: `cortex_host.exe`, `*.dll`,
  `Roboto-Medium.ttf`) — o host compilado;
- `native/scripts` e `native/js` — os scripts de export e os shims;
- `native/third_party/hermes/tools/native/release/x86` (filtro `hermes.exe`) —
  o compilador de bytecode;
- `src` → `src` — o source da engine que o bundle resolve;
- `native/export-toolchain/node_modules` → `node_modules` — o toolchain.

Em macOS/Linux esses recursos **não** são empacotados; o handler continua
retornando "indisponível" (o `src/native/scripts/export-game.mjs` não existe em
`resources/`).

### 3. CI compila o host no runner Windows

Antes de `yarn electron:build`, um conjunto de steps `if: matrix.os ==
'windows-latest'` em `release.yml` e `build-ide.yml`:

1. Rust toolchain + MSVC dev env (`ilammy/msvc-dev-cmd` p/ `vcvars`) + Ninja;
2. `powershell -File native/scripts/fetch-deps.ps1` (deps prebuilt pinadas);
3. `cargo build --release` em `native/rapier-native/`;
4. `cmake -G Ninja -S native -B native/build -DCMAKE_BUILD_TYPE=Release` +
   `cmake --build native/build`;
5. `yarn install --frozen-lockfile` em `native/export-toolchain/`.

Optou-se por **compilar no CI** (e não commitar binários prebuilt via LFS) pra
manter o host sempre em sincronia com o código nativo e o git limpo — ao custo
de alguns minutos a mais no job Windows.

## Consequências

- **O Studio Windows instalado exporta nativo sem dev.** dev deixa de ser
  pré-requisito de export — passa a ser só ambiente de desenvolvimento da
  engine, como pretendido.
- **Instalador Windows cresce** (~50 MB: `three` ~38 MB + `@esbuild/win32-x64`
  ~11 MB + host/dlls). Aceitável pra uma feature de export; é o preço do
  re-bundling na máquina do usuário (o jogo do usuário só existe no export).
- **O job Windows do CI fica mais pesado e com mais pontos de falha** (Rust,
  MSVC, Ninja, download das deps). Se qualquer etapa nativa quebrar, o build
  Windows falha — mac/Linux seguem independentes (matrix `fail-fast: false`).
- **macOS/Linux ficam sem export nativo** (por design, host é D3D12/Windows). O
  handler informa isso; quando houver backend Metal/Vulkan, revisar este TDR.
- **Ponto de manutenção:** ao mudar as deps de runtime que o `bundle.mjs` puxa
  (novo import bare na engine que caia no bundle), atualizar
  `native/export-toolchain/package.json` — senão o export quebra **no
  usuário**, não no dev. Mesma disciplina do `VENDOR_TYPE_MODULES`.
- Relaciona-se com ADR-0101 (export nativo), ADR-0034 (recursos via
  `extraResources`) e o mapa `docs/cortex-native/architecture.md`.
