# SPEC-0692 - Monaco sem models pré-criados (cura da SPEC-0166)

**Data:** 2026-11-05
**Status:** aceito

## Contexto

O alerta `[001] potential listener LEAK detected, having 200 listeners already`
voltou na abertura do Studio — agora passando de **300** listeners e saindo
como `Uncaught Error` no console. A SPEC-0166 tinha apenas **contido** o
problema (filtrar testes do preload deixou o total em 194, com folga de 6
modelos); o projeto e o engine cresceram e estouraram o limite de novo,
exatamente como a própria spec previa ("isto é contenção, não cura").

Causa (inalterada desde a SPEC-0166): cada `monaco.editor.createModel()`
assina o emitter global de linguagem do Monaco, e o Studio pré-criava um model
por arquivo-fonte do projeto (`preloadProjectFiles`) e um por `.d.ts` navegável
do engine (`loadEngineTypes`) só para o Ctrl+click alcançar arquivo ainda não
aberto.

## Decisão

Aplicar a "cura definitiva" apontada na SPEC-0166: **nenhum model é pré-criado**.
O model nasce só quando o arquivo é de fato aberto (clique na árvore, aba, ou
Ctrl+click).

1. **Projeto via `addExtraLib`.** `preloadProjectFiles` alimenta o TS service
   com `typescriptDefaults.addExtraLib(content, uri)` — que não cria model nem
   listener — em vez de `createModel`. A resolução de `./foo` e o
   go-to-definition continuam funcionando porque o worker de TS enxerga extra
   libs; quando o usuário navega, o `registerEditorOpener` do `Editor` (que já
   existia como fallback) lê o arquivo do disco e cria o model naquele
   instante. Quando um model passa a existir para a mesma URI, o worker do
   Monaco o prefere sobre a extra lib, então edição ao vivo não fica stale
   (o Studio nunca dá dispose em model de aba — ver `closeTab` — então o
   model vence pela sessão inteira). A cada `project-open`, as extra libs do
   carregamento anterior são descartadas (via o disposable que o
   `addExtraLib` retorna) e tudo é relido do disco — troca de projeto não
   vaza arquivos do anterior pro TS service, e conteúdo salvo fora da sessão
   é atualizado.
2. **Types do engine sob demanda.** Os `.d.ts` navegáveis do engine deixam de
   virar model no carregamento; o conteúdo fica num mapa
   (`engineTypeContents`) e o `registerEditorOpener` cria o model na primeira
   navegação para `/node_modules/cortex-game-engine/...` (eles não têm
   filesystem real, então o fallback de disco não os cobria).
3. **Aviso mantido.** `warnIfManyModels` continua: se algum fluxo futuro voltar
   a acumular models, o log diz de onde vieram antes do alerta do Monaco.

## Consequências

- As duas fontes de models em massa zeram: o número de models vivos passa a
  ser ~o número de abas/arquivos abertos na sessão, independente do tamanho do
  projeto ou do engine. O limite de 200 deixa de ser função do crescimento.
- O filtro de testes do preload (`shouldPreloadProjectFile`, SPEC-0166)
  permanece — agora economiza memória do worker de TS, não listeners — e o
  Ctrl+click para dentro de um teste ainda não aberto volta a funcionar no
  fluxo normal (o opener lê do disco).
- `addExtraLib` guarda o conteúdo em memória como o model guardava; o custo de
  RAM é equivalente ao anterior, sem os listeners.
- Primeira navegação a um arquivo cria o model na hora (leitura de disco já
  era o caminho do fallback); não há diferença perceptível.
