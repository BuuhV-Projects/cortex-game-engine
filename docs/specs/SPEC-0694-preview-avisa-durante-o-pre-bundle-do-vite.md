# 0694 - Preview avisa durante o pré-bundle do vite

**Data:** 2026-11-05
**Status:** aceito

## Contexto

No Play do Studio, o `Preview` (`electron/renderer/Preview.ts`) cria o iframe do
jogo assim que o vite imprime `Local: http://localhost:5174/`. Só que o vite
responde o `main.ts` apenas depois de terminar o pré-bundle de dependências
(esbuild → `node_modules/.vite/deps`). Num projeto grande isso leva de 13 a 17
segundos no primeiro Play, e o palco fica preto, sem nenhum sinal — parecia que
"o Play não faz nada".

Pior: numa ocasião o otimizador ficou preso por mais de 4 minutos (processo vivo
e ocioso, nenhum `deps_temp_*` criado) e só destravou quando outro vite escreveu
o `deps/`. A mecânica, lida no vite 7.3.5 (`setupOnCrawlEnd`): cada transform
registra um pedido "em processamento", e o otimizador só roda quando nenhum sobra
(`waitForRequestsIdle`, sem timeout). Um único pedido que nunca conclui — ou um
scan do esbuild que nunca resolve — segura todo o resto para sempre.

O que foi descartado como causa, por reprodução fora do Studio:

- **O spawn do Studio** (`shell: true`, stdio em pipe, PATH com o `node_modules/.bin`
  do projeto): reproduzido com cache limpo, serviu o `main.ts` em 16,7 s.
- **Node 26.13.0**: o mesmo binário, chamado direto, serviu em 12,9 s.
- **Os plugins do projeto** (`createSceneSavePlugin`, `createAssetListPlugin`): são
  middlewares HTTP, não hooks `load`/`transform`; não entram no crawl.
- **A config** (`templates/new-project/vite.config.ts`): sem `optimizeDeps`, nada
  que mude a espera do otimizador.

O gatilho não foi reproduzido de forma determinística. O que se sabe com certeza é
que um Stop + Play (processo novo) resolve na prática.

## Decisão

1. **O palco mostra o que está acontecendo.** Ao colocar uma URL no iframe (Play,
   reiniciar, trocar de fase), o `Preview` sobrepõe "Preparando o projeto…" ao palco
   e remove no `load` do iframe. Se o `load` não chegar em **60 s**, o texto vira
   uma orientação de que o vite pode estar preso no pré-bundle, com um botão de
   reiniciar que faz **Stop + Play** (`run:stop` e depois `run:start`): o otimizador
   preso mora no processo do vite, então recarregar o iframe contra o mesmo processo
   (o `request-canvas-reload`) não resolveria. Stop limpa o aviso.

2. **Barra de progresso com porcentagem estimada.** O vite não emite progresso do
   pré-bundle (nem no stdout, nem por HTTP), então a porcentagem é **estimada por
   tempo**, não medida: sobe linear até 90% no tempo esperado e depois rasteja até
   99%, sem nunca chegar a 100% antes do `load` real. O tempo esperado é a duração
   medida do último carregamento **daquele projeto** (guardada no `localStorage`,
   chave `preview_loadMs:<dir>`); sem medida, 15 s. Só grava quando o `load` chega
   ainda em `preparing` e com pelo menos 500 ms: uma página de erro do vite (carga
   instantânea) ou um `load` depois do travamento distorceriam o próximo Play. Assim, a partir do segundo Play
   a barra acompanha o projeto de verdade. Em `stalled` a porcentagem congela onde
   estava e a barra fica cinza.

3. **O estado fica num módulo puro**, `electron/renderer/previewLoading.ts`
   (`createLoadingState`, `estimateProgress`, `readExpectedLoadMs`/`saveLoadMs`):
   fases `idle` → `preparing` → `stalled` com a porcentagem, timers e relógio
   injetáveis, sem DOM. O overlay é desenhado por `previewLoadingView.ts`, e o
   `Preview` só liga os dois. Tudo é testável em
   `tests/electron/previewLoading.test.ts` sem Electron nem jsdom.

4. **Nada muda no vite nem no `vite.config` gerado.** Sem causa provada, mexer no
   otimizador (`optimizeDeps.include`, `noDiscovery`) seria chute; o botão de
   reiniciar entrega o que resolve de fato (processo novo).

## Consequências

- O usuário vê feedback nos 13–17 s do primeiro Play e tem saída quando o vite
  trava, em vez de um palco preto mudo.
- A porcentagem é estimativa, não medida. Depois de um Play com cache quente
  (~2 s), um Play com cache frio sobe rápido a 90% e rasteja o resto; a medida
  seguinte recalibra. Medir de verdade exigiria o vite expor o progresso do
  esbuild, o que ele não faz.
- O `load` do iframe dispara também para uma página de erro do vite; o aviso some
  e o erro aparece no palco, como antes.
- Fica em aberto a causa do travamento do otimizador. Se voltar a acontecer, o
  próximo passo é rodar o vite do Play com `DEBUG=vite:*` e olhar qual pedido não
  conclui.
