# SPEC 0752 - O hook de contrato do export só checa pasta de jogo

**Data:** 2026-11-27
**Status:** implementado

## Contexto

O hook de contrato do export nativo do template (`templates/new-project/.claude/hooks/native-contract.mjs`, SPEC-0643)
roda no fim de cada turno do Claude Code (modo `--hook`, evento Stop) e checa a pasta do `cwd` da sessão. Ele não
conferia se essa pasta é um jogo. Numa sessão aberta no Port Hollow que passou a ter a engine como pasta principal (para
trabalhar num PR da engine), o hook passou a checar o código da própria engine com as regras dos jogos: acusou o
`AssetLoader`, o `loadKtx2` e as ferramentas do Studio por "loader fora do cache" a cada turno, e gravou um
`docs/debito-nativo.md` solto (não versionado) em cada worktree da engine que virou pasta principal.

## Decisão

No modo `--hook`, se a raiz não tem `cortex.json` (a marca de pasta de jogo, o mesmo arquivo que o export lê), o hook
sai com 0 sem checar nada e sem gravar o relatório. O modo de linha de comando (`node native-contract.mjs <pasta>`), em
que a pasta é escolhida de propósito, não muda.

A mesma mudança entra na cópia do hook em cada jogo (no Port Hollow, SPEC-0436 do jogo).

## Consequências

- Sessão com outra pasta principal (a engine, uma ferramenta) não é mais bloqueada pelo hook de jogo.
- Jogo sem `cortex.json` na raiz deixa de ser checado pelo hook Stop. Todo projeto do template nasce com o arquivo.
- Testes: `tests/native/native-contract-hook.test.ts` (sem `cortex.json` sai 0 e não grava o relatório; com ele, o
  loader fora do cache bloqueia com 2 como antes).
