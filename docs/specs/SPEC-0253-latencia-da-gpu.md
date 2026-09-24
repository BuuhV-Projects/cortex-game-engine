# SPEC-0253 — Latência da GPU

**Data:** 2026-09-23
**Status:** aceito

## Contexto

O kart-racer congela a tela por cerca de um segundo ao passar por um trecho da
pista. O jogador relata que isso acontece **sem os carros adversários e sem os
pickups**, e — o detalhe que define o problema — **o fps não cai**.

Todos os suspeitos do lado da CPU foram descartados, cada um por medição:

| suspeito | como foi descartado |
| --- | --- |
| laço do JS travando | **nenhum gap** entre amostras do trace (o normal é ~500 ms; nada acima de 800) |
| `present` | 2 a 3 ms de mediana, p95 de 10 ms (SPEC-0249) |
| compilação de pipeline | zero pipelines criados durante a queda (SPEC-0252) |
| criação de buffer ou textura | zero depois dos 15 s de corrida |
| draw call | correlação caiu de 0,936 para 0,116 |
| triângulos | decimar 68% deu 0,4 ms — dentro do ruído |
| fill-rate | `CORTEX_RENDER_SCALE` a ¼ e 1/16 não muda o fps |

O `frameMs` máximo medido na sessão inteira foi **22,2 ms**. Ou seja: **a CPU
produz frames normalmente enquanto a imagem não atualiza.** O tempo está depois
do que qualquer contador atual enxerga — na GPU, no driver, ou no compositor.

Sem medir isso, qualquer próximo passo é chute. E esta campanha já gastou três
hipóteses erradas em cima deste mesmo sintoma.

## Decisão

Medir a **latência de conclusão do trabalho de GPU**: quanto tempo passa entre
o `wgpuQueueSubmit` de um frame e o momento em que a GPU avisa que terminou,
via `wgpuQueueOnSubmittedWorkDone`.

`native/src/webgpu/gpu_latency.{h,cpp}`, ligado pela mesma variável do
cronômetro de fases (`CORTEX_FRAME_TIMING`), reportando mediana e p95 no
`perf-log.txt` ao lado das outras fases.

### Por que latência e não timestamp query

`wgpuCommandEncoderWriteTimestamp` existe no wgpu vendorizado e daria o tempo
**puro** de execução na GPU, com granularidade por pass. Mas exige a feature
`TimestampQuery` no device, um `QuerySet`, `resolveQuerySet`, um buffer de
leitura e mapeamento assíncrono — e, principalmente, mediria **só o que a GPU
executa**.

O que se está caçando é um frame que **não chega à tela**, e isso pode ser
espera de fila, de swapchain ou do compositor — nada disso aparece num
timestamp de pass. `OnSubmittedWorkDone` mede a coisa certa para esta pergunta:
ponta a ponta.

Se o resultado apontar para dentro da GPU, aí o timestamp query passa a valer,
com o alvo já estreitado.

### O que a medição distingue

| resultado | leitura |
| --- | --- |
| latência salta para ~1 s no congelamento | é a GPU/driver, e o número diz quanto |
| latência fica estável e baixa | o trabalho termina rápido e o problema é a **apresentação** — compositor ou swapchain, fora do processo |

As duas respostas são úteis. Hoje não temos nenhuma.

### Cuidado de implementação

O callback só dispara quando alguém processa eventos do wgpu. O host já chama
`wgpuInstanceProcessEvents` em pontos pontuais (`device.cpp:68`,
`buffers.cpp:346`), mas **não por frame** — então o laço passa a chamá-lo uma
vez por frame, sem bloquear. Sem isso a medida não chega, e chegaria a
conclusão errada de "latência zero".

## Consequências

- Custo quando desligado: uma leitura de booleano por frame. Ligado, um
  registro de callback e um `processEvents` por frame.
- Mede **latência**, não ocupação: uma GPU ociosa que demora a responder e uma
  GPU saturada dão o mesmo número. A distinção, se for preciso, vem depois com
  timestamp query.
- O callback pode chegar vários frames depois do submit. O tempo é sempre
  medido contra o instante do submit daquele frame, não do frame corrente.

## Resultado: o gargalo alterna, e nos picos é a GPU

Kart-racer, 4 minutos com a IA pilotando. Cada linha é uma janela de 300
frames:

| instante | `js` med/p95 | `present` med/p95 | **GPU** med/p95/**máx** |
| --- | --- | --- | --- |
| 20:30:47 | 12,70 / **113,38** | 0,64 / 8,02 | 1,93 / 4,20 / **358,98** |
| **20:31:12** | **18,22 / 23,00** | **0,30 / 0,42** | 15,99 / 17,78 / **176,54** |
| 20:31:18 | 19,47 / 25,16 | 0,31 / 0,47 | 15,13 / 19,85 / **83,63** |
| 20:33:49 | 19,06 / 24,95 | 0,33 / 0,73 | 8,18 / 12,03 / **69,15** |
| (típico) | ~17 / ~22 | 0,32 / 0,48 | ~7 / ~10 / ~13 |

A linha de **20:31:12** é a que responde a pergunta: a CPU está **normal**
(`js` p95 de 23 ms) e o `present` custa **0,30 ms**, enquanto a GPU leva
**176,54 ms** num frame. É exatamente o sintoma relatado — o jogo continua
produzindo frames, o fps não cai, e a tela não atualiza.

Nenhum contador anterior enxergava isso. O `present` mede 0,30 ms porque ele
só **enfileira**; quem espera é a GPU, depois.

### Duas leituras, as duas novas

1. **O gargalo alterna.** No regime típico o jogo é CPU-bound (`js` 17 ms
   contra GPU 7 ms). Em trechos específicos a GPU dispara. A campanha de perf
   inteira atacou CPU — o que explica por que as últimas correções não mexiam
   no congelamento.
2. **Não é só um frame ruim.** Nas janelas de pico a **mediana** da GPU dobra
   (15,99 e 15,13 contra ~7). É um trecho inteiro em que a GPU trabalha o
   dobro, com picos em cima.

### O que ainda não se sabe

**O que** a GPU faz nesses frames. `OnSubmittedWorkDone` mede o conjunto; para
separar por pass (sombra, cena, bloom, blit) é preciso timestamp query — que
agora vale a pena, com o alvo já estreitado para dentro da GPU.
