# SPEC-0668 - Sem pendência de refatoração; limite de testes por arquivo

**Data:** 2026-11-03
**Status:** aceito

## Contexto

A regra das 500 linhas (CLAUDE.md) tinha uma saída: quem mexia num arquivo que já passava do limite e não queria
refatorar registrava o caminho em `docs/pendencias-refatoracao.md`, e o gate do PR (`pr-rules.mjs`, SPEC-0654 e
SPEC-0656) aceitava o arquivo. Na prática a lista só crescia: o débito ficava registrado e ninguém refatorava.

Os arquivos de teste não tinham limite próprio além das 500 linhas, e alguns acumularam dezenas de casos
(`tests/core/NativeSceneMirror.test.ts` com 51, `tests/core/Physics.test.ts` com 40). Em 03/11/2026, dos 285 arquivos
`*.test.ts`: mediana de 6 testes, p90 de 16, p95 de 22.

## Decisão

- **Sem pendência.** Mexeu num arquivo de código acima de 500 linhas, refatora na mesma mudança: o problema é de quem
  encontrou o arquivo. `docs/pendencias-refatoracao.md` sai do repo e o gate não lê mais lista nenhuma.
- **No máximo 20 testes por arquivo de teste** (`*.test.*` / `*.spec.*` em ts, tsx, js, mjs, cjs). Conta cada
  chamada `it(` / `test(` no começo da linha, com modificador (`it.skip(`, `it.each(…)(`, `test.only(`): um `it.each`
  conta uma vez. Passou de 20, divide o arquivo por assunto.
- Os dois limites continuam valendo só para o que o PR toca (adicionado/modificado): débito herdado não reprova PR que
  não mexe no arquivo; quem mexe, paga.
- Engine (`.github/scripts/pr-rules.mjs`) e template de jogo (`templates/new-project/.github/scripts/pr-rules.mjs`)
  mudam juntos.

## Consequências

- Mexer em `src/core/Scene.ts`, `electron/main.ts` e nos outros arquivos grandes deixa de ser barato: a tarefa inclui
  a refatoração. Isso torna correções pequenas nesses arquivos mais caras de propósito.
- Os 18 arquivos de teste acima de 20 testes reprovam o PR que tocar neles até serem divididos.
- Testes nativos em C++ (`native/tests/`) não entram na contagem (o gate só conta `it`/`test` de JS/TS); continuam
  sob as 500 linhas.
- Substitui a parte da pendência na SPEC-0654, na SPEC-0656 e no TDR-0008.
