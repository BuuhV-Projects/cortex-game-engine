# ADR-0690 — Workers do Monaco pelo `?worker` do Vite, sem `vite-plugin-monaco-editor`

**Data:** 2026-11-05
**Status:** aceito

## Contexto

O editor de código do Studio (`electron/renderer/Editor.ts`) usa o `monaco-editor`, que roda
parser, diagnóstico e formatação em web workers: `editor.worker` (base), `ts.worker` (TS/JS),
`json.worker`, `css.worker` e `html.worker` — os cinco são usados, o `LANGUAGE_BY_EXT` mapeia
`ts/tsx/js/jsx/json/html/css/md`.

Esses workers eram empacotados pelo `vite-plugin-monaco-editor@1.1.0`, cuja única função é
rodar `esbuild` nos cinco entrypoints e publicá-los em `monacoeditorwork/<nome>.bundle.js` —
por middleware no dev server e por cópia de arquivo no build. O `MonacoEnvironment.getWorkerUrl`
devolvia essa URL montada à mão.

O pacote está sem release desde 2023 e acumulou três problemas no repo:

1. **Quebra no Node ≥ 22.** O `workerMiddleware` limpa o cache com
   `fs.rmdirSync(dir, { recursive: true })`, API removida do Node; o `yarn electron:dev` morria com
   `TypeError [ERR_INVALID_ARG_VALUE]: The property 'options.recursive' is no longer supported`
   assim que `node_modules/.monaco/` existisse — isto é, da segunda execução em diante. No Node
   26.13 (o nosso) é falha garantida.
2. **Workaround de path no Windows.** O plugin faz `path.join(root, outDir, …)`; com os dois
   absolutos o join concatena em vez de substituir, e o `electron.vite.config.ts` carregava um
   `customDistPath` só para contornar isso.
3. **Import ESM torto.** O `export default` do pacote é o módulo inteiro, não a factory, exigindo
   `monacoEditorPluginModule.default` com comentário explicando.

## Alternativas

1. **Patchar o pacote** (`patch-package` ou um `rmSync` no script `electron:dev` antes de subir):
   duas linhas, mas mantém a dependência morta, os outros dois workarounds, e deixa o próximo
   `rmdirSync`-equivalente para o próximo desenvolvedor.
2. **Trocar pelo fork `vite-plugin-monaco-editor-esm`:** sai de uma dependência abandonada para
   outra de mantenedor único — mesmo risco, nenhum ganho estrutural.
3. **Usar o suporte a workers do próprio Vite** (escolhida): `import … from '…/ts.worker?worker'`
   e `MonacoEnvironment.getWorker` devolvendo `new tsWorker()`. É a receita oficial do Monaco para
   bundlers com suporte nativo a worker; o plugin existe de quando o Vite ainda não tinha.

## Decisão

Opção 3. O `MonacoEnvironment` passa a usar `getWorker` (instância) em vez de `getWorkerUrl`
(string), com os cinco workers importados via `?worker`. O plugin, o `customDistPath` e a função
`workerUrl` saem; o Vite passa a emitir os chunks de worker e a resolver as URLs — em dev e no
empacotado.

O setup ficou em `electron/renderer/monacoWorkers.ts`, módulo próprio, fora do `Editor.ts`.

## Consequências

- `yarn electron:dev` volta a subir em Node 26, sem passo de limpeza de cache.
- Menos uma dependência (`vite-plugin-monaco-editor`) e três workarounds a menos.
- Os workers agora são chunks do Rollup, versionados com hash pelo Vite, em vez de arquivos de
  nome fixo em `monacoeditorwork/`. Nada no repo referenciava esses nomes fora do `workerUrl`.
- No `file://` do Electron quem resolve a URL do worker passa a ser o Vite, não a nossa função —
  era o ponto de risco da troca. No bundle a referência sai como
  `new URL("ts.worker-<hash>.js", import.meta.url)`, relativa ao módulo, e os workers ficam na mesma
  pasta `assets/` do chunk que os cria. Validado rodando o `out/` empacotado de verdade (não só
  inspecionando o bundle): o renderer `file:///…/out/renderer/index.html` sobe com targets
  `type: "worker"` ativos no CDP. No renderer servido como página, `editor.worker` (251.984 B) e,
  ao abrir um `.ts`, `ts.worker` (7.010.326 B) são criados, sem falha de rede nem erro de console.
- Nenhum `tsconfig` do repo cobre `electron/`, então os sufixos de import do Vite não tinham
  declaração: `electron/renderer/vite-env.d.ts` referencia `vite/client`, que declara `*?worker`.
  Sem ele o editor marca o import como TS2307 (o build não falha — ninguém typechecka o renderer).
