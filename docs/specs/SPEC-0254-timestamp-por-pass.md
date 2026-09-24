# SPEC-0254 — Timestamp de GPU por render pass

**Data:** 2026-09-23
**Status:** aceito

## Contexto

A SPEC-0253 provou onde está o congelamento do kart-racer. Numa janela de 300
frames com a CPU completamente normal — `js` p95 de 23,00 ms, `present` de
0,30 ms — a GPU levou **176,54 ms num frame**. O maior pico capturado foi
**358,98 ms**.

Também mostrou que o gargalo **alterna**: no regime típico o jogo é CPU-bound
(`js` 17 ms contra GPU 7 ms), e em trechos específicos a GPU dispara — nas
janelas de pico a mediana dela dobra, de ~7 para ~16 ms.

O que aquele instrumento **não** diz é **o quê** a GPU está fazendo.
`OnSubmittedWorkDone` mede o conjunto do frame. Sem separar por pass, atacar
seria adivinhar de novo — e esta campanha já gastou quatro hipóteses erradas
em cima deste mesmo sintoma.

## Decisão

`native/src/webgpu/pass_timing.{h,cpp}`: timestamp de GPU por render pass, via
`WGPUPassTimestampWrites` no `beginRenderPass`.

Ligado pela mesma variável das outras medições (`CORTEX_FRAME_TIMING`), com
relatório no `perf-log.txt` no mesmo ritmo.

### Como cada pass é identificado

**O three não rotula os render passes.** Ele rotula o command encoder
(`renderContext_<id>`) e os attachments, mas o descriptor do pass vai sem
`label` — confirmado no fonte (`WebGPUBackend.js`).

Então cada pass é identificado por **ordem no frame** mais **quantos draws ele
emitiu**. É o bastante para reconhecer quem é quem: o passe de sombra tem
dezenas de draws, o da cena tem a maioria, o bloom tem poucos e o blit tem um.
Rotular de verdade exigiria mexer no three.

### A feature é opcional, e pedir errado quebra o boot

`WGPUFeatureName_TimestampQuery` precisa ser pedida na criação do device. Pedir
uma feature que o adapter não tem faz o `requestDevice` **falhar** — o jogo não
abre. Por isso ela só entra em `requiredFeatures` quando
`wgpuAdapterHasFeature` confirma, e só quando a medição está ligada: em
produção o device continua exatamente como era.

### Leitura sem bloquear

Escrever timestamp é barato; **ler** não é. O resultado mora numa `QuerySet` da
GPU e precisa de `resolveQuerySet` para um buffer, cópia para um buffer
mapeável e `mapAsync`. Bloquear esperando isso mediria o instrumento em vez do
jogo.

A leitura é assíncrona e chega alguns frames depois. Não importa: o que se quer
é a distribuição ao longo de centenas de frames, não o número de um frame
específico.

## Consequências

- Custo quando desligado: **zero** — sem a variável de ambiente, nem a feature
  é pedida e o `beginRenderPass` não muda.
- Ligado: dois timestamps por pass e uma cópia de buffer por frame. Mede-se
  um regime levemente mais caro que o real, e é o preço de enxergar.
- **Mede tempo de execução na GPU, não latência.** É complementar à SPEC-0253:
  aquela diz *quanto o frame demorou a ficar pronto*, esta diz *no quê*. Um
  frame com latência de 176 ms e passes somando 8 ms significaria espera de
  fila ou compositor, não trabalho.
- Passes acima do teto de slots do frame não são medidos. O teto é dimensionado
  para o kart-racer (dezenas de passes com CSM), e o relatório diz quantos
  ficaram de fora — número silencioso seria pior que número nenhum.

## Resultado: a GPU não está trabalhando nos frames que congelam

Kart-racer, IA pilotando, janelas de 300 frames. Cruzando a latência
(SPEC-0253) com o tempo de execução por pass:

| janela | **latência** máx | **soma dos 33 passes** | maior pass |
| --- | --- | --- | --- |
| 22:06:35 | **321,42 ms** | **0,60 ms** | 0,07 ms |
| 22:06:47 | 83,91 ms | 1,04 ms | 0,34 ms |
| 22:07:08 | 50,40 ms | 1,18 ms | 0,36 ms |

Um frame leva **321 ms para ficar pronto enquanto a GPU executa 0,60 ms de
trabalho**. Nenhum pass passa de **0,36 ms**, e os 33 somam ~1,1 ms.

Isso elimina a renderização como causa. Não é sombra, nem cena, nem bloom, nem
blit — nenhum deles é grande o bastante para importar. O tempo é **espera**.

### Consequência para a pergunta original

A SPEC-0253 tinha deixado duas leituras possíveis. Esta medição escolhe a
segunda: **o trabalho termina rápido e o problema é a apresentação**. Espera de
fila, de swapchain ou do compositor — nada disso é código do jogo ou da engine.

O teste de present mode (SPEC-0255) fechou a parte que ainda estava ao nosso
alcance.

### O que ficou fora

`notePassDraws` chegou a ser previsto, para identificar cada pass pela
contagem de draws. Foi **removido**: com nenhum pass passando de 0,36 ms, não
há "qual deles" a descobrir, e função que nunca é chamada promete um dado que
não existe.
