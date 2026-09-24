# ADR-0257 — Teto de quadros escolhido pelo jogo

**Data:** 2026-09-24
**Status:** aceito

## Contexto

A queixa que abriu a campanha de performance nunca foi taxa baixa, foi
**oscilação**: "a engine fica oscilando de 70 pra 50 em 1s, isso compromete a
experiência do jogador". Depois de todas as otimizações medidas, o kart-racer
ainda varia entre 60 e 70 — e a intuição do dev é travar em 60 para ganhar
fluidez.

A intuição está certa no princípio: **consistência de frame time importa mais
que média de fps**. Um jogo a 60 fps travados é mais agradável que um jogo que
oscila entre 60 e 70, porque o olho lê a variação como engasgo, e não lê os 10
fps a mais como nada.

Mas a engine não pode simplesmente decidir isso. Qual taxa é a certa depende do
jogo (um kart quer 60, um jogo de tabuleiro vive bem com 30), da máquina e do
monitor. É escolha do dev.

### A parte não óbvia

Capar fps num ambiente com vsync **não dá o que se espera**, e ignorar isso
produziria uma feature que piora o problema que veio resolver.

Com vsync (o padrão do host é Fifo), um frame só chega à tela em múltiplo do
refresh. Num monitor de 75 Hz, os instantes possíveis são 13,3 / 26,7 / 40 / …
Pedir 60 fps (16,67 ms de orçamento) dá, com o acumulador correto:

```
13,3 pula | 26,7 ✓ | 40 ✓ | 53,3 ✓ | 66,7 ✓ | 80 pula | 93,3 ✓ …
```

São 4 frames a cada 5 vsyncs = **60 fps exatos**, mas com intervalos de
13,3 / 13,3 / 13,3 / 26,7 ms. Um frame em cada cinco dura o dobro: judder
periódico.

Isso ainda é **melhor** que a oscilação de hoje — trocar variação aleatória por
um padrão fixo é ganho real, porque a percepção se adapta a periodicidade e não
se adapta a ruído. Mas não é "liso".

Liso de verdade, num monitor de 75 Hz, só em **divisores do refresh**: 75, 37,5
ou 25. Aí todo frame dura exatamente o mesmo.

Uma implementação ingênua (`if (agora - ultimoFrame < orcamento) return`, sem
acumulador) seria pior que não ter nada: a 75 Hz com cap de 60, todo frame
candidato a 13,3 ms cai abaixo do orçamento e é pulado, e o resultado é
**37,5 fps** — metade do pedido, sem aviso.

## Decisão

`GameLoopOptions.maxFps` — o jogo declara o teto, a engine respeita. `0` ou
ausente = sem teto, que segue sendo o padrão.

Três pontos de desenho:

**1. Acumulador com alvo, não delta desde o último frame.** O orçamento avança
por soma (`proximoAlvo += orcamento`), o que evita o erro acima e faz a média
bater exatamente com o pedido. O alvo é ressincronizado quando o atraso passa de
um orçamento inteiro, para que uma travada não gere rajada de frames tentando
"recuperar" o tempo perdido.

**2. O refresh é medido, não assumido.** A engine estima a taxa do monitor pela
mediana dos primeiros intervalos de frame. Serve para o item 3 e para o
diagnóstico.

**3. Cap que não é divisor do refresh emite aviso por `debug()`.** Não corrige
sozinho — o dev pediu 60 e recebe 60. Mas recebe também a informação de que
37,5 seria liso e 60 terá judder de 1 frame em 5, porque essa é exatamente a
decisão que ele não tem como tomar sem o número.

Fica **fora**: escolher a taxa automaticamente, adaptar o cap em runtime, e
mexer no present mode junto. São três decisões separadas, e a terceira já tem
seu próprio controle (`CORTEX_PRESENT_MODE`, SPEC-0255).

### Defeito que o teto exporia, corrigido junto

O `VehicleControlSystem` avança o mundo com **um `physics.step()` por frame**, e
a engine nunca ajusta o `timestep` do Rapier — que fica no padrão de 1/60 s por
passo. Resultado: a velocidade da simulação depende do fps.

| fps | física anda por segundo real |
| ---: | ---: |
| 75 | 1,25 s |
| 60 | 1,00 s |
| 50 | 0,83 s |

Hoje isso passa despercebido porque o fps varia pouco em torno de 60. Com o
teto, deixaria de passar: travar um jogo em 37,5 fps faria o carro andar **na
metade da velocidade**. Uma feature de fluidez que muda a jogabilidade.

A correção óbvia seria copiar o `RapierPhysicsSystem` (acumulador de passo
fixo). Não serve aqui: passo fixo de 1/60 **sem interpolação** num monitor de
75 Hz deixa 1 frame em cada 5 sem nenhum passo — o carro fica parado nesse
frame. Seria trocar o bug pelo judder que o teto veio tirar.

O `VehicleControlSystem` passa a usar **semi-fixed timestep**: o dt do frame
vira N passos iguais de no máximo 1/60 (`timestep` ajustado para o passo e
restaurado depois, porque o mundo pode ser compartilhado). Velocidade correta a
qualquer fps, todo frame anda, e o passo nunca passa do limite de estabilidade
da suspensão. Perde-se determinismo bit a bit, que o sistema já não tinha.

Interpolação de pose seria a alternativa com determinismo, e fica para quando
algo precisar dele (replay, rede) — custa estado anterior por corpo e um frame
de atraso visual.

O kart-racer não sofria disto porque tinha o próprio laço de substeps
(SPEC-0016) — que é um dos contornos que o ADR-0256 elimina.

O acumulador `onFixedUpdate` do `GameLoop` não entra: o `Game` não o usa (só
passa `onUpdate`), e nenhum código da engine ou dos exemplos o usa.

## Consequências

- O dev ganha o controle que pediu, com o número que precisa para escolher bem.
- Capar **abaixo** do que a máquina entrega é o uso correto; capar acima não faz
  nada, e a engine não finge que faz.
- O aviso de não-divisor aparece só com `debug()` ligado. Quem não liga não é
  incomodado, e quem investiga fluidez acha na primeira linha.
- O veículo passa a andar na mesma velocidade a qualquer fps. Jogos que
  tunaram o carro rodando acima de 60 vão senti-lo um pouco mais lento —
  porque antes estava rápido demais.
- A estimativa do refresh custa um punhado de amostras no boot e nada depois.
