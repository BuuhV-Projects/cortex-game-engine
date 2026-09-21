# 0240 - Paridade visual verificável (M7 do ADR-0237)

**Data:** 2026-09-21
**Status:** em execução — passo 0 respondido, passos 1+ a seguir

## Contexto

O ADR-0237 planeja tirar o `three` do caminho de render no export nativo. O M7
é o **oráculo** dessa migração, e o ADR o declara bloqueante:

> o modo de falha desta migração **não é crash, é imagem sutilmente errada**, e
> foi assim que as bandas de sombra passaram por uma captura antes de serem
> notadas.

O episódio é real (SPEC-0234): expor as matrizes de mundo como `Float32Array`
em vez de `double` produziu shadow acne na pista, passou por uma captura e só
foi pego pelo usuário olhando o jogo.

Este marco é construído **em paralelo ao M5**, por decisão do dono do projeto.
A consequência de desenho é dura e vale declarar: **o M7 não pode depender de o
caminho nativo existir**. Tudo aqui tem de valer sozinho, contra o caminho de
hoje.

## Decisão

### O que se grava e se repõe: o `syncBuffer`, não a matriz de mundo

A cena é reproduzida por **replay**, não por simulação determinística. Tornar a
simulação determinística exigiria dt fixo, seed de RNG e replay de input — e
ainda assim ponto flutuante acumulado diverge entre execuções por motivos
alheios ao render, contaminando justamente o experimento que se quer isolar.

Mas o replay grava **o transform local de cada nó** (o que entra no
`syncBuffer` do `NativeSceneMirror`, `SYNC_FLOATS_PER_NODE` floats por nó), e
não a matriz de mundo.

A razão é que o `NativeSceneMirror.update()` **não envia matrizes de mundo** ao
C++: envia transforms locais, e é o C++ que propaga pai→filho, corta o frustum
(`updateAndCull`) e escreve de volta as matrizes que o `three` lê por
`matrixWorld.elements`. Gravar a matriz de mundo e injetá-la funcionaria, mas
**pularia o `updateAndCull`** — exatamente a parte que o M5 vai assumir. Um
harness que injeta a saída do sistema que está testando valida menos do que
parece.

### Onde se captura: o composto primeiro, o offscreen depois e com custo

A captura decisória é a da textura **`swap` já composta**, imediatamente antes
do `wgpuSurfacePresent`. Ela custa zero código de produção: a textura já está
disponível em C++ puro dentro do `presentIfAcquired`, e o molde de readback já
existe (`override_probe.cpp`, que copia textura→buffer, mapeia bombeando
`wgpuDevicePoll`/`wgpuInstanceProcessEvents` e lê os bytes).

Capturar a textura **offscreen** (antes de SSAA, bloom e UI) isolaria melhor o
passe principal, mas **não é grátis**: `supersample.cpp` e `bloom.cpp` criam as
texturas com `RenderAttachment | TextureBinding`, **sem `COPY_SRC`**, e
`copyTextureToBuffer` sobre elas falha na validação. Habilitar isso é mexer em
código de produção, condicionalmente ao modo de captura. Fica como passo
posterior, declarado com custo — não como risco residual.

Vale registrar o argumento a favor do composto: foi nele que o bug real foi
percebido. O usuário não olha a textura intermediária.

### Como roda sem atrapalhar o dono da máquina

**Janela oculta (`SDL_HideWindow`).** Medido no passo 0 (abaixo): mantém
`width`/`height` positivos, o loop continua desenhando, e a janela não aparece
nem rouba foco.

**Minimizar de verdade NÃO serve**, e essa era a premissa errada do desenho
inicial: `webgpu/surface.cpp` aborta a aquisição da textura com
`if (gpu->width <= 0 || gpu->height <= 0) return nullptr;  // minimizada`, e no
Win32/SDL3 iconificar zera o pixel size.

### Métrica: diferença por canal com limiar medido, não arbitrado

Duas grandezas por quadro:

1. `maxChannelDiff` — maior `|a-b|` por canal (0–255), pixel a pixel;
2. `pctPixelsAboveNoiseFloor` — percentual de pixels cujo `maxChannelDiff`
   excede o piso de ruído.

**SSIM e MSE foram rejeitados.** SSIM exigiria justificar um limiar perceptual
("0,98 vem de onde?"), e MSE **dilui erro concentrado numa média sobre a tela
inteira** — que é precisamente o modo de falha que este marco existe para
pegar: o shadow acne era localizado, não um desvio global de brilho.

O limiar **não é escolhido, é medido** (regra do projeto: sem número mágico).
Ver "Constantes" abaixo.

### Baseline: gerada na rodada, nunca commitada

As duas execuções acontecem na mesma rodada, e a referência é a saída do lado
de comparação daquela própria rodada. Imagem binária no git incha o repositório
para sempre, e baseline congelada apodrece: qualquer mudança legítima do lado
JS reprovaria o teste pelo motivo errado. O que se quer provar é que **os dois
caminhos concordam agora**.

Formato: RGBA cru. PNG só no caminho de falha, para diagnóstico.

## Ordem de execução (o risco vem primeiro)

### Passo 0 — a janela pode sumir sem matar o render? **RESPONDIDO**

Era a premissa capaz de matar o desenho: se rodar sem janela visível impedisse
o render, o harness não poderia rodar com a máquina em uso.

Medido em 21/09/2026, três condições na mesma cena do kart-racer
(`?bench&hold`), contando aquisições da textura da surface:

| condição | frames | abortados | tamanho |
| --- | --- | --- | --- |
| janela normal (controle) | 180 | **0** | 1280×720 |
| posicionada em −32000 | 240 | **0** | 1280×720 |
| `SDL_HideWindow` | 240 | **0** | 1280×720 |

**Resultado: as duas alternativas servem, e a escolhida é `SDL_HideWindow`** —
a janela nem aparece. De quebra, isto explica por que medir com
`-WindowStyle Minimized` sempre funcionou: esse modo **posiciona a janela em
rect −32000**, não a iconifica.

### Passo 1 — captura do composto e comparador

Modo `CORTEX_RENDER_PARITY_CAPTURE` no host, capturando a `swap` antes do
present; arquivo pequeno próprio (`webgpu/render_parity_capture.*`), pela regra
de responsabilidade única do `native/`.

- **Pronto quando:** duas execuções da mesma cena produzem dois RGBA e o
  comparador imprime `maxChannelDiff` e `pctPixelsAboveNoiseFloor`.

### Passo 2 — replay do `syncBuffer`

Gravação e reprodução dos transforms locais por N quadros.

- **Pronto quando:** o mesmo replay, reproduzido duas vezes no mesmo caminho,
  fica dentro do piso de ruído medido no passo 1.

### Passo 3 — calibração dos limiares (os dois experimentos adversariais)

Este é o passo que decide se o harness presta, e ele responde à pergunta mais
perigosa do marco: **o harness enxerga o tipo de erro que o motivou?**

Reproduzir o shadow acne histórico **foi descartado como teste de aceite**: o
bug não é mais alcançável (o shim já é `Float64Array` puro), exigiria código
novo, e não há garantia de que uma conversão `Float64→Float32` feita hoje
atinja o mesmo regime numérico que o causou. Seria caro e daria só um
passa/falha.

No lugar, duas curvas de sensibilidade:

1. **Brilho:** alterar uma luz-chave por deltas conhecidos (1, 2, 4, 8 em
   0–255) e achar o menor que o harness acusa de forma estável.
2. **Sub-pixel:** deslocar câmera/objeto por frações conhecidas de texel (0,25;
   0,5; 1,0) e medir o `pctPixelsAboveNoiseFloor` resultante.

O segundo existe por um risco concreto: um deslocamento legítimo de sub-pixel
acende **toda borda de geometria de alto contraste**. Se o limiar não separar
"deslocou por motivo aceitável" de "está errado", o harness vira falso alarme
crônico — e o pior destino de um teste é a equipe aprender a ignorá-lo.

- **Pronto quando:** as duas constantes abaixo têm valor medido e justificativa
  escrita.

### Passo 4 — relatório de falha

Heatmap da diferença, coordenada e valor do pior pixel, número do quadro, ponto
de captura e histograma de `maxChannelDiff` — só nos quadros que falharam. O
histograma é o que distingue **erro concentrado** (banda de sombra) de **ruído
espalhado** (deriva numérica geral), direcionando a hipótese sem abrir a imagem.

### Passo 5 (depende do M5) — comparação entre os dois caminhos

Reusa tudo. Sem infra nova.

## Constantes

| nome | o que é | como o valor sai |
| --- | --- | --- |
| `RENDER_PARITY_CHANNEL_DELTA` | piso de ruído por canal entre execuções idênticas | maior `maxChannelDiff` observado em N execuções do mesmo caminho, com a distribuição registrada — não só o máximo |
| `RENDER_PARITY_MAX_OUTLIER_PCT` | fração de pixels tolerada acima do delta | cruzamento do self-compare (deve dar ~0) com o experimento de sub-pixel: **acima** do ruído e **abaixo** do que um deslocamento legítimo produz |
| `RENDER_PARITY_FRAME_COUNT` | quantos quadros por rodada | maior N em que o self-compare não piora — protege contra I/O de disco reintroduzir variação |

Nenhum é escolhido agora: todos nascem de execução real nos passos 1–3.

## O que este marco NÃO promete

- **Não verifica a simulação**, só o render dado um estado de cena. Paridade de
  física é outro escopo.
- **Não cobre efeitos dirigidos por tempo/RNG** (partículas, marcas de derrapagem).
  Não há evidência de que `?bench&hold` os congele — ele segura a contagem
  regressiva da corrida, o que é outra coisa. Em vez de construir um "freeze
  universal", a cena do replay é **curada** para não os conter, e isso é
  critério de aceite do conjunto de teste.
- **Não detecta deriva lenta.** Como a baseline é sempre da rodada, o harness
  pega quebra de paridade instantânea, não degradação gradual ao longo de meses.
  Mitigação parcial: histórico em `jsonl`, como o `bench-history.jsonl`.
- **Não vê ordem de submissão**, só pixel. Uma regressão estrutural que produza
  a mesma imagem passa.
- **Os limiares valem por máquina e driver.** Recalibrar em outra GPU é
  trabalho manual registrado, não mecanismo automático.
