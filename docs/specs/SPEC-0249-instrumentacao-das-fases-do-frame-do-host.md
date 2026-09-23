# SPEC-0249 — Instrumentação das fases do frame do host

**Data:** 2026-09-23
**Status:** aceito

## Contexto

O kart-racer oscila de ~70 para ~50 fps em cerca de um segundo, e isso
compromete a experiência mais do que a média baixa comprometia.

A campanha de perf até aqui foi guiada por um modelo que **deixou de valer**:

| relação | antes das otimizações | hoje |
| --- | --- | --- |
| `cpu.render` × draws | **r = 0,936** | **r = 0,116** |
| `frameMs` × `cpu.render` | — | **r = 0,030** |

Decompondo os 25 piores contra os 25 melhores frames, a diferença é de
**14,3 ms**, e os contadores de CPU do JS explicam **5,2 ms**. Os outros
**9,15 ms não estão instrumentados em lugar nenhum**.

Quatro hipóteses foram testadas e **descartadas por medição**:

| hipótese | teste | resultado |
| --- | --- | --- |
| vsync quantizando (75 Hz → 13,3/26,7 ms) | histograma de `frameMs` em janela **e** fullscreen | distribuição **contínua** (14–21 ms), sem picos nos múltiplos |
| GPU / fill-rate | `CORTEX_RENDER_SCALE` 0.5 e 1.0 contra 2.0 | reduzir 4× e 16× o fragmento **não melhora** o fps |
| SSAA em fullscreen | escala 1.0 contra 2.0, em fullscreen | desligar o SSAA **piora** (55,0 → 51,1 fps) |
| draw call | correlação | caiu de 0,936 para 0,116 |

Sobrou o que ninguém mede: o tempo gasto **dentro do present** e o tempo do
laço do host fora do JS.

Dois fatos do host tornam isso plausível:

- `presentMode` é `WGPUPresentMode_Fifo`, fixo em `webgpu/surface.cpp:38` — não
  há env var nem campo de configuração.
- `presentIfAcquired` **não apresenta** quando nada novo foi renderizado
  (`surface.cpp:169` e `:201`), então o laço nem sempre bloqueia no v-blank. O
  `frameMs` que o `PerfTrace` grava é o delta entre `requestAnimationFrame`, que
  mistura frames que apresentaram com frames que não apresentaram.

Agravante de medição: **o host não expõe `performance`**, então o `GameLoop`
cai em `Date.now()` (`src/core/GameLoop.ts:199-204`) e todo `frameMs` do trace
tem resolução de **1 ms**.

## Decisão

`native/src/core/frame_timing.{h,cpp}`: um cronômetro de fases do frame do
host, desligado por padrão, ligado por `CORTEX_FRAME_TIMING=1`.

Fases medidas, em nanossegundos do `SDL_GetTicksNS`:

| fase | o que cobre |
| --- | --- |
| `poll` | `pollEvents` — entrada e eventos de janela |
| `js` | timers, microtasks e `requestAnimationFrame` (todo o trabalho do jogo) |
| `present` | `presentIfAcquired` — **inclui o bloqueio do v-blank** |
| `resto` | o que sobra do frame (destruições adiadas, contadores, áudio) |

A cada `kFramesPorRelatorio` frames, escreve uma linha no `perf-log.txt` com
**mediana e p95 de cada fase**, mais quantos frames de fato apresentaram.

### Por que percentis e não média

O que se está caçando é **variância**, não custo médio. Uma média esconde
exatamente o frame ruim que o jogador sente. O p95 de `present` contra o p95 de
`js` responde a pergunta direta: quando o frame estica, ele estica esperando a
tela ou trabalhando?

### Por que no host e não no JS

O tempo que falta está **fora** do JS por definição — é o que o `frameMs` do
`PerfTrace` já deveria ter capturado e não capturou. Medir de dentro do JS
mediria o mesmo lugar de novo. Além disso, `SDL_GetTicksNS` tem resolução de
nanossegundo contra o `Date.now()` de 1 ms.

### O contador de frames apresentados

`presentIfAcquired` tem três saídas antecipadas. Sem saber **quantos** frames
apresentaram, a mediana de `present` mistura frames que bloquearam no v-blank
com frames que retornaram em nanossegundos — e a leitura sai errada, do mesmo
jeito que o contador de contorno da SPEC-0014 saiu.

## Consequências

- Custo quando desligado: uma leitura de variável booleana por fase. Ligado,
  quatro `SDL_GetTicksNS` por frame.
- Não muda comportamento nenhum: só observa. Nenhuma decisão de render,
  present ou pacing depende dela.
- É **instrumento**, não correção. O que fazer com o resultado — mexer no
  present mode, expor vsync ao jogo, ou outra coisa — é decisão posterior, e
  depende do que a medição mostrar.
- Fica registrado que `CORTEX_RENDER_SCALE` tem **padrão 2.0** (`main.cpp:272`),
  ou seja, todo export nativo roda com SSAA 2× por padrão — 4× o fill-rate.
  Não é a causa da oscilação (medido), mas é informação que faltava.

## Resultado da medição

Kart-racer, **fullscreen** (a condição real de jogo), IA pilotando com
`?bench`, 12 relatórios de 300 frames cada:

| fase | mediana | p95 |
| --- | --- | --- |
| `poll` | 0,04 ms | 0,05 ms |
| **`js`** | **14 a 20 ms** | **18 a 31 ms** |
| **`present`** | **0,29 ms** | **0,40 ms** |
| `resto` | 0,00 ms | 0,01 ms |

**O present não é o gargalo, e não há espera de v-blank.** 0,29 ms de mediana,
com **300 de 300 frames apresentando** — ou seja, não é saída antecipada
escondendo o custo. Apesar de `presentMode` ser `Fifo`, o present retorna
imediatamente.

Isso encerra a hipótese que motivou esta spec, e de quebra explica o
histograma contínuo de `frameMs`: sem bloqueio no v-blank, não há por que os
tempos caírem em múltiplos do período do monitor.

### Os "9,15 ms não instrumentados" não existiam

Aquela conta veio de comparar a **média** dos 25 piores frames com a dos 25
melhores, por contador. Contadores que se sobrepõem (o `napi` está dentro do
`render`) e grupos diferentes não se subtraem assim. Com a medição direta,
`poll + js + present + resto` fecha o frame inteiro, e o `js` sozinho responde
por **97%** dele.

### O que isso quer dizer

O jogo é **CPU-bound no JS**, sem exceção. A oscilação de 70 para 50 fps é
variação do trabalho do próprio frame do jogo — não é a tela, não é a GPU, não
é o present.

Junto com os quatro descartes do Contexto, sobra um alvo só: **reduzir o que o
JS faz por frame, e principalmente a VARIAÇÃO disso**. Média menor com
amplitude maior piora a experiência, que foi exatamente o efeito colateral
medido nas otimizações anteriores (desvio do `frameMs` de 6,05 para 7,11 ms
enquanto a mediana melhorava).
