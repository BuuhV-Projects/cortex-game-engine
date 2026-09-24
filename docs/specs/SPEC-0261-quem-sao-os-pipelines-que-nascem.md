# SPEC-0261 — Quem são os pipelines que nascem no meio do jogo

**Data:** 2026-09-24
**Status:** aceito
**Estende:** SPEC-0252

## Contexto

O `born.pipelines` da SPEC-0252 conta pipelines criados desde o boot. No
kart-racer ele mostrou a causa das travadas da primeira volta: aos 38 s, nos
primeiros poderes, nasceram **26 pipelines** de uma vez; na volta inteira, 37 —
todos depois do aquecimento do carregamento (SPEC-0015/0020). Depois do R, no
mesmo trecho, zero. Criar pipeline é compilar shader, síncrono no host, dentro
do frame.

O contador diz QUANTOS. Para aquecer os que faltam é preciso saber QUAIS: que
objeto, que material, em que passada (a principal ou a de sombra) — e quanto
cada um custou, para separar a compilação que trava da que não pesa.

## Decisão

`PipelineBirthLog` (`src/core/PipelineBirthLog.ts`) envolve
`backend.createRenderPipeline(renderObject)` do three. O three só chama esse
método quando um pipeline novo precisa nascer (cache por chave em
`Pipelines._getRenderPipeline`), então cada chamada é um nascimento.

Por nascimento:

| campo | origem |
| --- | --- |
| `object` | `object.name`, ou o do pai mais próximo com nome, ou `object.type` |
| `material` | `material.name` ou `material.type` |
| `transparent` | `material.transparent` — variante que nasce quando um material muda de opaco para translúcido |
| `camera` | `main` se é a câmera do jogo; senão o `type` da câmera (sombra usa a da luz) |
| `ms` | duração da chamada — inclui a compilação síncrona do host |

| `key` | a chave de cache do three (`renderObject.pipeline.cacheKey`): ids dos shaders de vértice e fragmento + estado (blend, depth, face, formato/amostras do alvo, geometria) |

### Segunda rodada: por que o mesmo efeito nasce várias vezes, e por que o aquecimento não os pegou

A primeira volta instrumentada mostrou duas coisas que o rótulo sozinho não
explica: as brasas da chama nasceram **25 vezes** (o óleo, 9), e o
`game.precompile()` do carregamento **não criou nenhum** pipeline de efeito,
embora o jogo os pusesse na cena antes. Daí os campos extras:

- `key` em cada nascimento — duas brasas com chaves diferentes dizem se o que
  difere é o shader (ids) ou o estado (alvo, face, blend).
- `pipelineLookups` na amostra — consultas ao cache de pipeline, acumuladas,
  contando os ACERTOS (medido envolvendo `backend.getRenderCacheKey`, chamado
  uma vez por consulta que precisa de pipeline).
- um registro `precompile` no trace, gravado pelo `Game.precompile`: duração,
  consultas e nascimentos DENTRO dele. Separa "não rodou" (0 ms), "não
  percorreu os efeitos" (poucas consultas) e "só achou chave existente"
  (consultas sem nascimento).

A amostra seguinte do `perf-trace.jsonl` leva a lista em `pipelinesBorn`
(ausente quando nada nasceu). Só é instalado quando o trace está ativo (ponte
do host presente): fora do export com métricas, nada muda.

## Consequências

- O próximo trace do kart-racer diz exatamente o que o aquecimento deixou de
  fora, e quanto cada um custa — o alvo da correção deixa de ser hipótese.
- Custo: um `performance.now()` duplo por pipeline criado. Nascimentos são
  dezenas por sessão.
- Depende de um método interno do three (`backend.createRenderPipeline`). Se
  uma versão futura o renomear, a instalação avisa por `debug('perf')` e o
  trace segue sem a lista — nunca quebra o jogo.
