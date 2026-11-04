# SPEC-0685 — Receita do renderer nativo: alvo calculado uma vez por lista

**Data:** 2026-11-04
**Status:** implementado

## Contexto

Plano de 75 fps do DDD 00 no export nativo (Hermes sem JIT). Na pose centro o `nativeEmit` custa ~1,3 ms e o gc
~15 MB/s. O `RenderServer._prepare` chama `NativeRenderer.recipeFor(entry, renderContext, pass)` por entrada e por
passe a cada lista (~340-1.000 entradas). Cada chamada fazia:

- três leituras do `backend.utils` (`getCurrentColorFormat`, `getCurrentDepthStencilFormat`,
  `getSampleCountRenderContext`);
- o template `` `${color}|${depth}|${samples}|${pass}` `` (uma string nova por chamada);
- `inst.recipes.get(target)` com o hash dessa string nova.

Os três formatos e a chave são os mesmos para todas as entradas da lista: o `renderContext` (e o alvo dele —
canvas, render target, MSAA) não muda dentro de um `_prepare`. Era a pendência registrada na SPEC-0680 §4 (e na
SPEC-0675): ~1-1,5 µs e ~60-80 B por entrada.

## Decisão

### 1. Alvo memorizado (`src/render/native/NativeRecipeTarget.ts`)

`RecipeTarget` guarda o alvo corrente: o `renderContext` de onde veio, `color`, `depth`, `samples`, a chave base
`` `${color}|${depth}|${samples}` ``, um id inteiro interno dessa chave (o mesmo id para a mesma chave durante a vida
do renderer) e as chaves por passe `` `${base}|${pass}` `` (montadas uma vez, na primeira vez que o passe aparece).

- `use(utils, renderContext)` relê os três formatos e recalcula id e chaves (uma string base e um `Map.get` por
  lista, não por entrada).
- `reset()` esquece o contexto: a próxima chamada relê.

### 2. Quando o alvo é relido

- `NativeDrawer.beginList?(renderContext)` (opcional na interface): o `RenderServer._prepare` chama uma vez no topo
  de cada lista, antes do laço. É o ponto que cobre a troca de alvo dentro do mesmo `renderContext` (pós-processo
  ou render target recriado, `samples` do canvas mudado).
- `recipeFor` com um `renderContext` de identidade diferente do memorizado relê sozinho (chamadores sem
  `beginList`, testes, o `_sweep` do `precompile`, que também chama `beginList`).
- `beginFrame` faz `reset()`: no máximo um quadro de memória mesmo se algum chamador esquecer o `beginList`.

### 3. Atalho por instância

A `Inst` ganha, por passe, `passTarget` (id do alvo da última receita devolvida; `NO_TARGET` = nenhuma) e
`passRecipe` (o registro `{ id, generation, frame }` dessa receita, o mesmo objeto guardado em `inst.recipes`).
O caminho comum vira:

```
inst.passTarget[pass] === target.id && rec.generation === inst.mat.generation && rec.frame === _frameGeneration
```

e devolve `rec.id` sem `utils`, sem string e sem `Map.get`. Fora disso segue o caminho antigo, idêntico
(`inst.recipes.get(chave)`, `release` da velha, `pipeline`, `record`, `set`), e atualiza o atalho quando devolve uma
receita válida. Uma instância desenhada em dois alvos alternados (ex.: reflexo em RT e canvas) só perde o atalho e
cai no `Map.get`, como antes.

### 4. O que não muda

- As receitas escolhidas: a chave de `inst.recipes`, a chave passada ao `NativePipelineStore.pipeline` e as
  condições de invalidação (`mat.generation`, `_frameGeneration`) são as mesmas.
- O `_dropInstance` solta as receitas por `inst.recipes`, como antes (o atalho só aponta para registros dele).

## Testes

`tests/render/native/recipeTarget.test.ts`:

- equivalência: a mesma sequência de chamadas (canvas, render target, MSAA, dois passes, troca de alvo entre
  listas, `_frameGeneration` e `mat.generation` mudados) devolve os mesmos ids e grava as mesmas receitas que o
  caminho antigo (contexto novo a cada chamada, que sempre relê o alvo);
- contagem: com `beginList`, os três `utils` rodam uma vez por lista, não por entrada;
- invalidação: o mesmo `renderContext` com o alvo trocado entre listas pega a receita do alvo novo;
- `beginFrame` sem `beginList` relê o alvo.

## Consequências

- Esperado no host: −0,35 a −0,6 ms no `nativeEmit` e alguns MB/s a menos de gc (a medição é da sessão principal).
- Quem implementar outro `NativeDrawer` não precisa do `beginList` (é opcional); sem ele vale a releitura por
  identidade do contexto e por quadro.
- Fica a validar na bancada do host (motivo da pendência da SPEC-0680 §4).
