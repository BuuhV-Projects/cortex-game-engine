# SPEC-0031 - Cena persistida em JSON + IO writers + tela de loading

**Data:** 2026-05-31
**Status:** aceito

## Contexto

Fase 5 (final) da migração do corrida-teste (ver ADR-0028..0030). O estado
editável da cena (spawn do carro, edições do gizmo) vivia em `localStorage` —
não vai no build, não é versionável no git, e é isolado por máquina/navegador.
A solução: um `scene-data.json` em `assets/` (versionável, vai no build).

Também havia um problema de boot: o loop começava antes dos assets (FBX) carregarem,
mostrando tela cinza.

## Decisão

Adicionados ao engine:

- **`src/scene/SceneFile.ts`** — `interface SceneFileV1 { version:1; objects:
  Record<name, {position,rotation,scale}>; data: Record<string, unknown> }` +
  `parseSceneFile` (valida o envelope com **zod**; `data` é **opaco** — o jogo
  guarda spawn/checkpoints/etc. e faz o cast tipado) + `emptySceneFile`.
- **`src/scene/SceneLoader.ts`** — `loadSceneFile(url)` (fetch+parse, `null` se
  404/ inválido → fallback pros defaults do código) e `applyToRoot(root, file)`
  (aplica transforms por `Object3D.name`).
- **`src/io/`** — `SceneFileWriter` (interface), `HttpSceneFileWriter` (POST pro
  dev server), `TauriSceneFileWriter` (import **dinâmico não-analisável** de
  `@tauri-apps/plugin-fs` → sem dep fixa no engine) e `autoDetectSceneFileWriter`
  (Tauri se `window.__TAURI__`, senão HTTP — detecção em **runtime**, sem
  `import.meta.env` que seria avaliado no build do engine).
- **`src/core/LoadingScreen.ts`** — `createDomLoadingScreen()` (show/setProgress/
  hide). `AssetLoader.preload` ganhou callback opcional `onProgress`.
- **`src/vite/sceneSavePlugin.ts`** — `createSceneSavePlugin` (Node-only):
  endpoint POST que grava o arquivo em disco no `vite dev`. **NÃO** entra no
  bundle do runtime — é compilado pelo tsc e distribuído como
  `vendor/.../vite/sceneSavePlugin.js`; o `vendorEngine` (electron/main.ts) o copia.

## Consequências

- zod entrou no bundle do runtime (~+100 kB) por causa do `parseSceneFile`.
- O `TauriSceneFileWriter` usa `import(['@tauri-apps','plugin-fs'].join('/'))`
  pra escapar da análise estática dos bundlers (vite do engine + rolldown do
  jogo) — senão o build do jogo web puro falha tentando resolver o pacote. Não é
  unit-testado (depende do runtime Tauri); o caminho/políticas de save em release
  ficam a cargo do projeto.
- O tipo `ObjectEdit` (SPEC-0030) e o `SceneFileV1.objects` coexistem: o jogo
  converte um no outro ao salvar. Reconciliá-los num só formato fica como dívida.
- corrida-teste migrado: `spawnStorage`/`objectEditsStorage` (localStorage)
  removidos; `RaceScene` carrega/salva via `SceneLoader`/writer (spawn em
  `data.spawn`, edições em `objects`); `main.ts` aguarda `ready` com
  `LoadingScreen`; `vite.config` usa `createSceneSavePlugin`. `vite build` verde.
- Testável: `parseSceneFile` (zod) e `SceneLoader.applyToRoot` têm testes; o resto
  (writers/plugin/loading) é IO/DOM, validado por build.
