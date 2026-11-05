---
title: "Plugin de worker do Monaco saiu: o Vite já faz isso com ?worker"
author: Buuh
date: 2026-11-05
branch: build/monaco-workers-nativos
scope: repo
status: active
src: agent
touches:
  - "electron/renderer/monacoWorkers.ts#registerMonacoWorkers"
  - "electron/renderer/vite-env.d.ts"
  - "electron.vite.config.ts"
---

## Decided
Os web workers do Monaco no renderer do Studio vêm do sufixo `?worker` do Vite, registrados em `electron/renderer/monacoWorkers.ts`, e não de um plugin. O `vite-plugin-monaco-editor` foi removido (ADR-0690). A única função dele era rodar esbuild nos cinco entrypoints de worker e publicá-los em `monacoeditorwork/` — middleware no dev, cópia no build. O Vite faz isso nativamente; o plugin é de quando o Vite ainda não tinha suporte decente a worker. Saldo: −1 dependência e −3 workarounds (o `customDistPath` do bug de `path.join` no Windows, e o import `.default.default` do ESM).

## Tried and ruled out
- Patchar o pacote (patch-package, ou um `rmSync` no `electron:dev` antes de subir): duas linhas, resolve o sintoma, mas mantém a dependência morta (sem release desde 2023) e os outros dois workarounds.
- Trocar pelo fork `vite-plugin-monaco-editor-esm`: sai de uma dependência abandonada para outra de mantenedor único. Mesmo risco, nenhum ganho.

## Watch out
- O sintoma era `yarn electron:dev` morrer com `TypeError [ERR_INVALID_ARG_VALUE]: The property 'options.recursive' is no longer supported`. Causa: `fs.rmdirSync(dir, { recursive: true })` no `workerMiddleware` do plugin, API removida do Node. Ele só chamava isso **se** `node_modules/.monaco/` existisse — pasta que ele mesmo cria na primeira execução. Por isso funcionava uma vez e quebrava da segunda em diante; apagar o cache é paliativo e volta no próximo dev.
- **Nenhum `tsconfig` do repo cobre `electron/`** (o `tsconfig.json` inclui só `src/`, `tests/`, `examples/`) e o `electron-vite build` não typechecka. Erro de tipo no renderer não falha CI nem build — só aparece no editor de quem abre o arquivo. Ao mexer em `electron/`, rode um `tsc --ignoreConfig` pontual nos arquivos tocados: foi assim que apareceram cinco TS2307 nos imports `?worker` e um TS2339 no `MonacoEnvironment`.
- A declaração global de `MonacoEnvironment` do Monaco só chega a quem importa o barrel `monaco-editor`. Módulo que importa apenas os workers precisa de `import type { Environment }`.
- `PreviewOverlay` e `GlbPreview` empatam em `z-index: 6`. São mutuamente exclusivos por construção (abrir `.glb` chama `preview.hide()`; abrir imagem/markdown chama `glbPreview.close()`), então o empate nunca aparece — quem mexer nos overlays mantém a exclusão ou dá `z-index` distintos.
- Prova no empacotado (`file://`, que é como o `loadFile` do main carrega em produção): subir `node_modules/electron/dist/electron.exe . --remote-debugging-port=<p>` e ler `http://127.0.0.1:<p>/json/list` — o renderer `file://` deve ter targets `type: "worker"`.
- O `.design-proto/shoot.mjs` importa `playwright-core`, que não está no `package.json`: está quebrado hoje, sem relação com isso. Para validar UI do renderer, o caminho que funciona é buildar com `.design-proto/studio.vite.config.mjs`, servir com `.design-proto/serve.mjs` e dirigir um navegador.
