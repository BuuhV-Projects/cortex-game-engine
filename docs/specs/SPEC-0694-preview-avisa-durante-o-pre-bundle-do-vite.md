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

2. **O estado fica num módulo puro**, `electron/renderer/previewLoading.ts`
   (`createLoadingState`): fases `idle` → `preparing` → `stalled`, timer injetável,
   sem DOM. O `Preview` só desenha a fase. Assim o timeout é testável em
   `tests/electron/previewLoading.test.ts` sem Electron nem jsdom.

3. **Nada muda no vite nem no `vite.config` gerado.** Sem causa provada, mexer no
   otimizador (`optimizeDeps.include`, `noDiscovery`) seria chute; o botão de
   reiniciar entrega o que resolve de fato (processo novo).

## Consequências

- O usuário vê feedback nos 13–17 s do primeiro Play e tem saída quando o vite
  trava, em vez de um palco preto mudo.
- O `load` do iframe dispara também para uma página de erro do vite; o aviso some
  e o erro aparece no palco, como antes.
- Fica em aberto a causa do travamento do otimizador. Se voltar a acontecer, o
  próximo passo é rodar o vite do Play com `DEBUG=vite:*` e olhar qual pedido não
  conclui.
