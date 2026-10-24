# ADR-0465 — O Babel do export lê `super.x` com o receptor certo

**Data:** 2026-10-24
**Status:** aceito

## Contexto

O bundle do export nativo (`native/scripts/bundle.mjs`) passa pelo Babel com
`@babel/plugin-transform-classes` em modo **loose**: o Hermes da Microsoft não tem
`class`, e o modo spec gera `Reflect.construct` nos construtores, que quebra no
Hermes.

No modo loose, `super.x` vira `_Base.prototype.x` — **sem receptor**. Chamada de
método funciona (`_Base.prototype.m.call(this)`), mas **leitura de getter** roda
com o protótipo como `this`. Foi o que derrubou o `DynamicLightsNode` do `three`
(`super.hasLights` → `this._lights` indefinido): o nó de luzes não construía, os
materiais não compilavam e objetos sumiam da tela, medido como um ganho falso de
−6 ms (SPEC-0435). Bug silencioso para qualquer jogo: varredura do bundle do
DDD 61 em 2026-10-24 achou 1 ocorrência (essa), mas qualquer `super.getter` novo —
do engine, do jogo ou de dependência — quebra igual, sem erro no build.

## Decisão

Um plugin Babel próprio (`native/scripts/babel-super-receiver.mjs`) roda **antes**
do `transform-classes`, com as classes ainda intactas, e reescreve só as
**leituras** `super.x`/`super[k]` (não chamadas, não atribuições) para
`Reflect.get(Object.getPrototypeOf(Home), k, this)` — `Home` é `Classe.prototype`
num membro de instância e `Classe` num estático. É a semântica da especificação.
As chamadas `super.m()` continuam no loose. As opções do Babel do export vão para
`native/scripts/babel-hermes.mjs`, usado pelo `bundle.mjs` e pelo teste.

## Alternativas

- **Modo spec do `transform-classes`:** rejeitado — `Reflect.construct` quebra no
  Hermes (motivo original do loose).
- **Assumptions do Babel sem `constantSuper`:** troca TODO acesso a `super` pelo
  helper `_get` (`Reflect.get` + `getPrototypeOf` por chamada), inclusive as
  chamadas de método nos caminhos quentes do `three` — custo por quadro no Hermes
  sem JIT, para consertar um caso raro.
- **Contornar caso a caso** (como no `DynamicLightsNode`, `76f36c48`): não protege
  o próximo; removido em favor da raiz.

## Consequências

- Leitura via `super` custa um `Reflect.get` — só onde ela existe (hoje 1 lugar).
- `super.x = v` (atribuição) segue no loose (escreve no protótipo); nenhuma
  ocorrência no bundle; o plugin recusa compilar (erro claro) se aparecer.
- Teste `tests/native/babelHermes.test.ts` compila com a configuração real e
  EXECUTA getter de instância, getter estático, chamada de método e classe
  anônima; falha se a leitura voltar a perder o receptor.
