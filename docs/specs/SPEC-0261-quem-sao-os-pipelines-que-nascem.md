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
