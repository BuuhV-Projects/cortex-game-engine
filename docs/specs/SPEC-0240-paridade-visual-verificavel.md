# 0240 - Paridade visual verificável (M7 do ADR-0237)

**Data:** 2026-09-21
**Status:** em execução — passos 0 e 1 concluídos e **verificados em execução
real** (22/09/2026, ver "Medições"); passos 2–5 a seguir

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
  **FEITO** em 22/09/2026 — ver "Medições".

#### Aquecimento obrigatório: os primeiros quadros NÃO são a cena

Medido em 22/09/2026, na validação do harness resgatado: capturar a partir do
quadro 0 grava a **tela de carregamento** do jogo ("Preparando os carros…"), não
a pista. Doze quadros de um texto branco sobre fundo azul quase preto comparam-se
entre si com diferença zero — e o harness pareceria calibrado com piso de ruído
nulo **sem nunca ter olhado para a cena**. É exatamente o modo de falha que este
marco existe para não repetir, e é a explicação mais provável da afirmação de
"piso de ruído zero" registrada numa sessão anterior e nunca reproduzida.

Por isso a captura tem um **aquecimento** (`CORTEX_RENDER_PARITY_CAPTURE_SKIP`):
N quadros apresentados são descartados antes de a gravação começar. O valor não
precisa acertar o fim do carregamento na mosca — ele varia por I/O de disco entre
execuções. Com `?bench&hold` a cena fica **estática** depois que assenta, então
qualquer N acima do carregamento serve, e as duas execuções comparam o mesmo
quadro lógico ainda que em contagens absolutas diferentes.

A prova de que a cena está de fato estática é feita **dentro de uma execução**:
comparar quadros consecutivos da mesma rodada. Se um quadro difere do seguinte,
não existe piso de ruído entre rodadas a medir — e o número medido seria sobre
outra coisa.

#### Saída automática ao terminar

Atingido o teto de quadros, a captura empurra um `SDL_EVENT_QUIT` e o processo
encerra pelo caminho normal (`pollEvents` → `core::handleEvent` → `running =
false`). Sem isso o jogo roda para sempre e a rodada depende de matar o processo
por tempo — o que deixa o último arquivo sob risco de truncar e torna a rodada
não roteirizável.

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

## Como rodar uma comparação

Exporte o jogo **sem `--debug`** (o HUD de métricas muda a imagem a cada
quadro) e rode duas vezes com diretórios de saída diferentes:

```
node native/scripts/export-game.mjs D:\jogos\kart-racer --out D:\jge-m7-dist
```

Por rodada, com estas variáveis de ambiente:

| variável | para quê |
| --- | --- |
| `CORTEX_WINDOW_HIDDEN=1` | janela oculta — não aparece nem rouba foco |
| `CORTEX_LAUNCH_QUERY=?bench&hold` | cena congelada na contagem regressiva |
| `CORTEX_RENDER_PARITY_CAPTURE=<dir>` | liga a captura e define a saída |
| `CORTEX_RENDER_PARITY_CAPTURE_FRAMES` | quadros por rodada (ver Constantes) |
| `CORTEX_RENDER_PARITY_CAPTURE_SKIP` | aquecimento (ver Constantes) |

O processo **encerra sozinho** ao gravar o último quadro. Depois:

```
node native/scripts/render-parity.mjs <dirA> <dirB> [--delta N]
```

Cada rodada leva ~26 s (aquecimento incluído) e ocupa ~8 MB por quadro.

> **Atenção ao nome da variável da janela.** Nesta branch é
> `CORTEX_WINDOW_HIDDEN` (`SDL_HideWindow`). A branch do M6
> (`feat/m5-submissao-nativa`) criou, em paralelo e para o mesmo fim, um
> `CORTEX_WINDOW_OFFSCREEN` que posiciona a janela em −32000 — as duas
> alternativas foram medidas no passo 0 e **ambas servem**. Usar o nome da
> outra branch é um no-op silencioso: a janela abre visível na cara de quem
> está usando a máquina. Ao juntar as duas branches os dois blocos coexistem
> sem se excluir; se um dia convergirem para um nome só, é uma decisão à parte.

## Medições (22/09/2026) — o harness foi validado

Máquina: Windows 11, clang-cl oficial, `native/build` Release da worktree
`jge-m7-paridade`. Jogo: kart-racer exportado **sem** `--debug` (o HUD de
métricas imprime FPS na tela e mudaria a imagem a cada quadro, contaminando
justamente o que se quer medir). Cena: `?bench&hold`, 1920×1080, janela oculta
(`CORTEX_WINDOW_HIDDEN=1`), aquecimento de 600 quadros.

### A captura funciona

Trinta e dois arquivos por rodada, `1920×1080×4 = 8 294 400` bytes cada,
conteúdo verificado como a pista (média por canal ≈ 137/145/121, milhares de
cores distintas) e não a tela de carregamento. O formato da swapchain aqui é
**BGRA8Unorm** — irrelevante para a comparação (os dois lados são o mesmo
formato), mas é preciso trocar R e B ao converter para PNG de diagnóstico.

### A cena está de fato congelada

Quadros consecutivos **da mesma execução**, sete pares: `maxChannelDiff = 0` em
todos. Sem isto, não haveria piso de ruído a medir.

### Piso de ruído entre execuções: zero

Duas execuções da mesma build, mesma cena, 32 pares comparados:

| grandeza | valor |
| --- | --- |
| pares comparados | 32 |
| `maxChannelDiff` (pior par) | **0** |
| `pctPixelsAboveNoiseFloor` (pior par) | **0,000000%** |

O render é **bit-determinístico** entre execuções nesta máquina. O harness tem,
portanto, sensibilidade máxima: qualquer diferença de um único valor de canal é
sinal, não ruído.

### O instrumento enxerga (o teste que faltava)

Piso zero, isolado, é indistinguível de um comparador quebrado que responde
"igual" a tudo. O caso de resposta conhecida foi a sonda `jitter` do kart-racer
(`?bench&hold&jitter`), que desloca a câmera em `±1e-4 m` alternando o sinal a
cada quadro — e nada mais.

| grandeza | valor |
| --- | --- |
| pares comparados | 32 |
| pares acusados | **16** (exatamente os de sinal oposto) |
| `maxChannelDiff` nos acusados | **109** |
| `pctPixelsAboveNoiseFloor` nos acusados | **0,443769%** (9 204 px) |
| `maxChannelDiff` nos demais 16 | 0 |

O resultado é limpo nos dois sentidos: o harness acusa o quadro perturbado e
**não** acusa o não-perturbado, com valores idênticos em todas as 16 ocorrências.

E confirma o risco que o passo 3 antecipava: um deslocamento de câmera de
`1e-4 m` — que o próprio comentário do jogo descreve como "pequeno o bastante
para não mudar um pixel" — acende 0,44% da tela com picos de 109 níveis. Bordas
de geometria de alto contraste são muito mais sensíveis do que a intuição diz.

A lógica pura do comparador tem teste em `tests/native/render-parity.test.ts`
(delta conhecido pixel a pixel, efeito do piso, separação entre erro
concentrado e ruído espalhado).

## Constantes

| nome | valor | de onde saiu |
| --- | --- | --- |
| `RENDER_PARITY_CHANNEL_DELTA` | **0** | maior `maxChannelDiff` em 32 pares de duas execuções da mesma build: zero. Comparar o **mesmo caminho** consigo mesmo exige igualdade bit a bit; não há ruído a tolerar |
| `RENDER_PARITY_MAX_OUTLIER_PCT` | **0%** (mesmo caminho) | consequência do delta acima: com piso zero, zero pixel pode exceder. A referência do outro lado da faixa é 0,443769%, o que um deslocamento sub-pixel legítimo produz |
| `RENDER_PARITY_FRAME_COUNT` | **32** | maior N rodado; o self-compare não piorou de 8 para 32 (seguiu em zero), então I/O de disco não reintroduz variação nessa escala |
| `CORTEX_RENDER_PARITY_CAPTURE_SKIP` | **600** | ≈10 s a 60 Hz, folga larga sobre os ~4 s de carregamento do kart-racer. Não precisa ser exato: a cena congelada torna qualquer N acima do carregamento equivalente |

**O que continua sem valor medido, e por quê.** Os limiares acima valem para
comparar **um caminho consigo mesmo** — que é tudo o que existe hoje. Um
`delta = 0` **não** vai servir ao passo 5 (nativo × `three`): dois caminhos de
render diferentes não produzem bits iguais, e o valor tolerável ali só pode ser
medido quando o segundo caminho existir. O mesmo vale para a curva de
sensibilidade de brilho do passo 3, que exige alterar uma luz-chave por deltas
conhecidos — código novo no jogo, fora do escopo desta validação.

Declarar um número de compromisso agora seria exatamente o número mágico que a
regra do projeto proíbe. Fica registrado o que foi medido e o que falta.

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
