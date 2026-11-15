# SPEC 0741 - Export não falha por crash no encerramento do Node

**Data:** 2026-11-15
**Status:** implementado

## Contexto

O Studio instalado (1.0.0) roda `native/scripts/export-game.mjs` com o próprio
Electron como Node (`ELECTRON_RUN_AS_NODE`, Node 24) e decide o resultado só pelo
código de saída do filho (`electron/main/exportIpc.ts`).

No Windows, de forma intermitente, o filho termina o export inteiro — imprime
`[export:step] done` e `[export] OK → <pasta>`, com todos os arquivos gravados — e
depois aborta no desmonte natural do Node com:

```
PostQueuedCompletionStatus: (6) Identificador inválido.
```

(código de saída 3). É o libuv avisando a porta de conclusão (IOCP) do loop depois
dela fechada: uma thread de fundo da plataforma posta tarefa no loop durante o
encerramento. Reproduzido rodando o export do Port Hollow com o Electron do Studio
instalado (1 de 2 rodadas, tudo do cache, sem o encoder wasm). O Studio então mostra
"Export falhou" com um export que está pronto e roda.

## Decisão

Duas camadas:

### 1. O export sai explicitamente

No fim do `export-game.mjs`, depois da última linha, o script chama
`exitFlushed(0)` (`native/scripts/exit-flushed.mjs`): espera o stdout e o stderr
esvaziarem (callback de `write('')`) e chama `process.exit(code)`. O processo não
passa pelo encerramento natural (loop vazio → teardown do ambiente), que é onde a
corrida acontece. As saídas de erro (`process.exit(1)`) seguem como estão.

### 2. O Studio confia no marcador de conclusão

`electron/main/exportOutcome.ts` exporta `exportOutcome(code, output)`:

| código | saída tem `[export:step] done` **e** `[export] OK →` | resultado |
| ------ | ---------------------------------------------------- | --------- |
| 0      | qualquer                                             | `ok`      |
| ≠ 0    | sim                                                  | `ok`, com `crashedAfterDone: true` |
| ≠ 0    | não                                                  | falha     |

Os dois marcadores só saem depois da última etapa (cena, `cortex.json`, pastas
soltas), então um crash depois deles não deixou o export pela metade. Com
`crashedAfterDone`, o `exportIpc.ts` acrescenta à saída o aviso
`[export] aviso: o processo de export fechou com código N depois de concluir — o export está completo.`
e devolve `ok: true` com o `distDir`. Código `null` (morto por sinal) conta como ≠ 0.

## Consequências

- O Studio para de reportar "Export falhou" num export pronto.
- Um crash **antes** do `done` continua sendo falha (nenhum marcador falso).
- O aviso fica no terminal: se o crash do encerramento passar a ser frequente, dá
  para ver.
- Projetos precisam do Studio novo (release) para pegar a correção; o export já
  gerado pela versão 1.0.0 com esse erro está completo e pode ser usado.

## Testes

- `tests/electron/exportOutcome.test.ts`: as três linhas da tabela, código `null`, e
  só um dos marcadores presente (falha).
- `tests/native/exit-flushed.test.ts`: um processo filho que escreve e chama
  `exitFlushed(0)` sai com 0 e com a saída inteira; com código 2 sai com 2.
