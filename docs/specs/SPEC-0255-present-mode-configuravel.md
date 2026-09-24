# SPEC-0255 — Present mode configurável

**Data:** 2026-09-24
**Status:** aceito

## Contexto

A SPEC-0254 mostrou que, nos frames em que o kart-racer congela, **a GPU
executa 0,60 ms de trabalho e o frame leva 321 ms para ficar pronto**. O tempo
é espera, não render.

Restava um suspeito dentro do nosso alcance: a **swapchain**. Com
`WGPUPresentMode_Fifo` — fixo em `surface.cpp` desde sempre — se todos os
buffers estão em voo e o compositor não libera um, o submit seguinte espera. O
sintoma seria exatamente esse: latência alta sem trabalho.

Testar exigia trocar o modo, e trocar no código exigiria recompilar a cada
comparação.

## Decisão

`CORTEX_PRESENT_MODE=mailbox|immediate|fifo` escolhe o modo em tempo de
execução. **O padrão continua `Fifo`** — sem a variável, nada muda.

Um modo que o dispositivo não suporta faz o `configure` falhar, então a escolha
só vale se `wgpuSurfaceGetCapabilities` a declarar, e o que ficou valendo vai
para o `perf-log.txt`: medir com um modo diferente do pedido, sem saber, seria
pior que não medir.

## Resultado: não é a swapchain

Duas rodadas por modo, com as ordens invertidas entre elas:

| modo | janelas | latência média | p95 | máx | picos > 40 ms | picos > 100 ms |
| --- | --- | --- | --- | --- | --- | --- |
| `Fifo` | 52 | 6,24 ms | 10,27 | 891,5 | 7 | 2 |
| `Mailbox` | 54 | 6,49 ms | 9,24 | **903,0** | 6 | **3** |

Praticamente idênticos. O `Mailbox` teve o **maior pico** e **mais** eventos
acima de 100 ms.

**A primeira rodada enganou.** Com 19 janelas de cada, o placar era 4 picos
contra 2 e um máximo três vezes menor — parecia sinal. Dobrando a amostra, o
efeito desapareceu. É o terceiro resultado desta campanha que se dissolve ao
aumentar a amostra, e o motivo de o padrão **não** ter sido trocado.

## Consequências

- O padrão de produção é o mesmo de antes; a variável existe para diagnóstico.
- Fica registrado que **present mode não é a causa** do congelamento, para o
  próximo não repetir o teste.
- Com isto, todos os suspeitos dentro do processo foram descartados por
  medição. O que sobra — compositor, driver, contenção de máquina — não é
  alcançável pelo código do jogo nem da engine.
