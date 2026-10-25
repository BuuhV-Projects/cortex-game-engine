# ADR-0605 — Renderer próprio ligado por padrão por opção do jogo (`GameOptions.nativeRenderer`)

**Data:** 2026-10-25
**Status:** aceito (implementação na SPEC-0606, depois do conserto do `cull()` na main do DDD 61)

## Contexto

O usuário decidiu ligar o renderer próprio (PRD-0466, ADR-0465) por padrão **no export do DDD 61**, e só nele:
o Studio e os outros jogos continuam no `three`. Hoje o renderer próprio só liga pela query
(`?nativeRenderer=1&nativePrecompile=1`), lida em `nativeRendererRequested()`/`nativePrecompileRequested()`
(`src/render/native/NativeRenderer.ts`), com padrão `false`. O caminho só é instalado no host nativo (o b.1,
`CleanDrawFastPath`), então o Studio nunca o usa.

## Decisão

O jogo pede o renderer próprio no próprio código, pela opção do `Game`:

```ts
const game = new Game({ canvas, nativeRenderer: true })
```

O `Game` repassa a opção como **padrão** das duas flags (`setNativeRendererDefault`). A query continua mandando:
`?nativeRenderer=0` volta ao `three` e `?nativePrecompile=0` desliga a pré-compilação. Os modelos padrão continuam
"todos os registrados" (`unlit`, `lambert`, `standard` + os `wgsl` do jogo), com recusa por objeto ao `three`.

### Alternativas consideradas

| alternativa | por que não |
| --- | --- |
| campo em `cortex.json` (`"render": { "native": true }`) | o JS do export não lê o `cortex.json` hoje: exigiria plumbing novo no export e no host (gravar no `boot`, ler no `Game`) para um booleano |
| detecção do host + lista de jogos na engine (`id === 'ddd-61'`) | a engine passaria a conhecer jogos pelo nome; viola a direção de dependência (jogo → engine) |
| ligar para todo jogo no host nativo | outros jogos (kart-racer, teste4) não passaram pela paridade nem pelo censo; o usuário pediu só o DDD 61 |
| `CORTEX_LAUNCH_QUERY` no launcher do export | depende de ambiente na máquina do jogador; some num atalho novo |

## Consequências

- Um jogo liga o renderer próprio com uma linha no `main.ts`; o padrão da engine continua `three`.
- Mais um campo público em `GameOptions` (doc gerada e `engine-api.md` atualizados).
- O Studio continua no `three` sem regra nova: o caminho do renderer próprio só é instalado no host.
- O padrão é estado de módulo (como o resto das flags do renderer); o `Game` o define antes do `renderer.init()`,
  e o teste cobre a precedência query > opção > `false`.
