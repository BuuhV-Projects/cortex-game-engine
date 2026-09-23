# SPEC-0252 — O que nasce no frame

**Data:** 2026-09-23
**Status:** aceito

## Contexto

Duas perguntas do kart-racer estão sem resposta, e as duas pelo mesmo motivo:
**o trace mostra quanto custou, nunca o que apareceu de novo.**

**Pergunta 1 — "trava na primeira vez, depois não".** O jogador relata queda de
75 para 53 fps perto da largada, que **some ao reiniciar a corrida**, mesmo com
os seis karts voltando à linha de partida e a cena sendo a mesma. Duas
explicações minhas caíram: carros espalhados (falsa — eles voltam agrupados) e
compilação de shader (não comprovável — `nodesTotal` fica cravado em 913 e
nenhum objeto é criado).

O que decidiria a questão é saber **se algum pipeline foi criado naquele
frame**. Hoje o trace tem `cpu.napiPipe`, que conta `setPipeline` — quantas
vezes um pipeline é **ligado**, não quantos **nascem**. São coisas diferentes,
e só a segunda responde.

**Pergunta 2 — o custo virou geometria.** Medido no mesmo trace, com os draws
controlados na faixa de 185 a 205:

| draws fixos | triângulos | `cpu.render` |
| --- | --- | --- |
| 185-205 | 2,76M | 10,6 ms |
| 185-205 | **3,80M** | **13,1 ms** |

Correlação de `render` com triângulos: **r = 0,969**, contra **0,929** com
draws. Com os draws controlados, ainda **r = 0,918**. São ~3,2 ms por milhão de
triângulos — e a diferença de 1M entre os dois casos é exatamente a queda que o
jogador vê.

A campanha inteira mirou contagem de draws. **O gargalo mudou**, e nenhum
instrumento atual acompanha recurso nascendo.

## Decisão

Três contadores de **criação** (acumulados desde o boot) no `perf-trace.jsonl`:

| campo | o que conta |
| --- | --- |
| `born.pipelines` | `wgpuDeviceCreateRenderPipeline` (`pipeline.cpp:295`) |
| `born.buffers` | buffers de GPU criados |
| `born.textures` | texturas de GPU criadas |

**Acumulados, não por frame**, de propósito: a amostra do trace é uma a cada
~0,5 s, então um contador "por frame" mediria um frame sorteado e perderia o
resto. Acumulado, a **diferença entre duas amostras** diz quantos nasceram
naquele intervalo — sem perder nada.

Os dois últimos já existem (`buffers.cpp:197` os imprime no `perf-log.txt` a
cada ~5 s); o que muda é irem para o trace, onde dá para cruzá-los com o frame
que engasgou.

### Por que isto responde a pergunta 1

Se a primeira largada criar pipelines e a segunda não, está provado que é
compilação — e o aquecimento é que não cobre aquele caso. Se **nenhuma das
duas** criar, a hipótese morre de vez e o alvo passa a ser outro.

É o tipo de pergunta que três tentativas de dedução não resolveram.

## Consequências

- O trace ganha três números por amostra. É irrisório perto da lista de
  objetos visíveis que ele já carrega.
- Custo em runtime: um incremento de inteiro na criação de pipeline. Buffers e
  texturas já eram contados.
- **Não mede tempo de GPU.** A pergunta 2 (custo por triângulo) continua sem
  instrumento próprio — estes contadores só descartam "é recurso nascendo"
  como causa dela.
