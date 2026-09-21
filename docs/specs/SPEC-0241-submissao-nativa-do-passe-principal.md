# 0241 - Submissão nativa do passe principal (M5 do ADR-0237)

**Data:** 2026-09-21
**Status:** em execução — ganho confirmado (34 us/draw); falta a imagem correta

## Contexto

O ADR-0237 fixou o objetivo: o render do export nativo custar ≤ 8 ms com ~250
draws (hoje 18,5 ms). O M5 é onde o C++ passa a desenhar — critério da etapa:
**`cpu.render` ≤ 10 ms, ainda com sombras em JS, sem diferença de imagem**.

Os marcos anteriores entregaram a fundação e **nenhum deles mudou o fps**: M1
descreve o material (cobertura declarada de 89,3% — ver ressalva abaixo), M2
provou `override` no naga e cacheia pipeline (5 pipelines distintos para 242
materiais), M3 dá slot fixo de uniforme por objeto, M4 ordena a RenderList.

O levantamento feito para esta spec encontrou três lacunas que o plano original
não previa, e todas mudaram o desenho.

### Não existe camada C++ para gravar um render pass

Tudo que grava comando hoje vive **dentro de handlers N-API** em
`webgpu/commands.cpp`. O spike dos 2,2 µs/draw (`render_bench.cpp`) fala com a
wgpu direto, mas com **device e textura próprios**, isolado do host real.

### Quem abre a pass é o `three`, e ele não expõe isso

`beginRenderPass` só é chamado de dentro do `WebGPUBackend.js` vendorizado;
`Renderer.render()` é caixa-preta. O desenho inicial — "o C++ desenha primeiro e
o `three` continua a MESMA pass" — **não é alcançável** sem patchear arquivo de
terceiro, o que violaria "API fiel ao browser" e quebraria a cada bump do
`three`.

A saída veio do próprio `three`: ele já usa, em `copyFramebufferToTexture`, o
padrão **encerra a pass, faz outra coisa, reabre com `loadOp: load`**. Duas
passes sequenciais no mesmo color+depth preservam profundidade — é o próprio
`three` que confia nisso. E `autoClear = false` já é usado em produção pelo
split-screen.

### A casca de contorno é FILHA do mesh

`Materials.ts` faz `mesh.add(shell)`. Isso derruba o primeiro corte que parecia
óbvio (migrar o maior grupo, os 122 contornos): migrar só o contorno faz o C++
desenhar **o filho** enquanto o `three` desenha **o pai**, no mesmo alvo e no
mesmo frame. A convivência entre motores cairia no primeiro passo, não no
quarto. O contorno é ainda o caso mais especial-casado dos quatro modelos: é a
única exceção que deixa passar `positionNode` (TSL de verdade), e tem
`doubleSided: false` mesmo usando `side: BackSide`.

## Decisão

### A ordem de migração inverte: contorno por último

Primeiro corte: **opacos sem casca de contorno** (toon e standard puros). Separa
"aprender a infraestrutura nova" de "aprender o modelo mais excêntrico". O
contorno migra no fim, quando a convivência já estiver resolvida e medida.

### A geometria é a do `three`, não uma cópia

O registro passa **o `GPUBuffer` que o `three` já criou**
(`backend.get(attribute).buffer`), e o C++ faz `unwrapValue` para obter o
`WGPUBuffer`. Criar buffers novos a partir dos `ArrayBuffer` **duplicaria a VRAM
da cena inteira** e abriria espaço para dessincronizar se o `three` atualizasse
o atributo.

O padrão não é novo: `src/core/Renderer.ts` já usa `backend.get(...)` em
produção para obter handle nativo criado pelo `three`. Criar buffer próprio fica
como fallback explícito, se aparecer atributo que o `.get()` não resolva.

O id de geometria é estável e vive num `WeakMap`, análogo ao `textureId()` do
`MaterialDesc`. A destruição reusa o **destroy adiado** já existente em
`buffers.cpp` — destruir na hora já causou panic fatal do wgpu-native.

### Duas passes sequenciais, com o `three` PRIMEIRO

`renderer.render()` normal do `three` (limpa, desenha o céu e o que não migrou)
→ pass nativa por cima, com `loadOp: load` no mesmo color e no mesmo depth, e o
teste de profundidade decidindo a oclusão. **Sem tocar em arquivo vendorizado.**

A ordem inversa (C++ primeiro) foi testada no passo 0 e **não funciona** — ver o
resultado registrado adiante. Esta ordem é, na verdade, mais simples: não exige
desligar o clear do `three` nem mexer no passe dele.

### A transparência entrelaçada só é construída se a medição pedir

O `three` expõe `setRenderObjectFunction()`, um gancho por objeto que roda
dentro da pass já aberta, na ordem que ele define (incluindo a ordenação de trás
para frente). É o candidato natural para intercalar objetos dos dois motores.
**Mas não está provado** que dá para obter o `WGPURenderPassEncoder` de dentro
dele — o callback não recebe a pass, e `currentPass` é estado interno do backend.

Decisão: **não construir especulativamente.** Depois de migrar os opacos,
mede-se `cpu.render`. Se já estiver perto dos 10 ms, a transparência entrelaçada
é **cancelada** e registrada como tal. Se não, aí o spike do gancho se paga.

### Quatro shaders WGSL, não um uber-shader

O ADR-0237 supunha um uber-shader com `override` para conter explosão
combinatória. O M2 mediu que **a explosão não existe: 5 pipelines para 242
materiais**. Sem esse problema, quatro arquivos (um por modelo de sombreamento)
são mais legíveis e mais seguros: o precedente do `COLOR_0` — que compilou sem
erro e renderizou branco — é o tipo de falha que cresce com condicional dentro
de um arquivo só. `override` continua, mas para variações **dentro** de um
modelo (dois lados, tem textura, tone mapping), sem cruzar a fronteira entre
modelos.

## A ressalva do `alphaTest` — a cobertura de 89,3% está inflada

`describeMaterial` **não rejeita** material com `alphaTest > 0`: apenas ignora o
campo. O comentário no código afirma que "o que a engine usa hoje é opaco ou
blend comum" — afirmação não verificada. E `Materials.ts` constrói a casca de
contorno justamente com `alphaTest: o.alphaTest ?? 0`, com `map` condicionado a
ele.

Consequência: material com recorte alfa (folhagem, grade, cerca) seria desenhado
**sólido** pelo caminho nativo, sem o corte — o "modo de falha mais caro" que o
ADR nomeia — e, por não ser uma rejeição, **não aparece na métrica de
cobertura**.

**Correção adotada: rejeitar, não descrever.** Descrever exigiria campo novo,
corte nos quatro shaders e prova de paridade pixel a pixel com o `three` — isso
é feature nova, não conserto. Rejeitar é a correção mínima e honesta, e é o que
o próprio módulo prega: **recusar em vez de aproximar**.

A cobertura real cai. **O número não é estimado: é medido** rodando
`measureCoverage()` de novo, e os dois valores ficam registrados lado a lado,
com o antigo marcado como não confiável.

## Linha de base medida em 21/09/2026 (com o `CarSystem` já corrigido)

`?bench&cortexHud=1` (a IA pilota), métricas ligadas, medianas de 289 amostras:

| seção | antes | agora |
| --- | --- | --- |
| `cpu.render` | 18,5 ms | **18,40 ms** |
| `cpu.world` | 9,8 ms | **3,00 ms** |
| `ui` | — | 2,50 ms |
| `draws` | ~258 | 262 |
| `frameMs` | 31,7 ms | 25,1 ms |

O `CarSystem` (trabalho do jogo, SPEC-0013 de lá) tirou 6,8 ms do frame, e com
isso **o render passou a ser 73% do quadro**.

**Isso muda o valor do M5.** Com `world` em 3,0 e `ui` em 2,5, um `cpu.render`
de 10 ms — que é exatamente o critério deste marco — dá um quadro de ~16,5 ms,
ou seja **60 fps**. Antes, com o `world` em 9,8 ms, o M5 sozinho não alcançava
isso e dependia da outra frente. Agora não depende mais.

## A cobertura NÃO estava inflada nesta cena

A correção do `alphaTest` fechou um furo real, mas a medição depois dela mostrou
que **ele não estava sendo exercido**: a cobertura continua **242/271 (89,3%)**,
e as recusas são só `roughnessMap` (24) e `MeshPhysicalMaterial` (5) — nenhuma
por `alphaTest`.

Ou seja, a afirmação do comentário antigo ("a engine usa hoje opaco ou blend
comum") era verdadeira para esta cena; o problema era não estar verificada. Agora
está, e a guarda existe para quando um asset com recorte alfa aparecer.

## Ordem de execução (o risco vem primeiro)

### Passo 0 — SPIKE: o C++ desenha no alvo do `three` sem corromper o frame?

**Esta é a pergunta que decide se o M5 existe.** Não é a transparência (aquela
só bloqueia um passo isolado, que pode nem ser construído).

O spike abre uma pass própria em C++ **no device, na queue e na textura reais do
host** (não isolado como o `render_bench.cpp`), limpa, desenha um triângulo com
profundidade conhecida, devolve o controle, e deixa o `three` terminar o frame
na mesma textura com `loadOp: load`.

Mede três pixels: um só do triângulo nativo; um de objeto do `three` **atrás**
dele (tem de ficar oculto pelo teste de profundidade); e um de objeto do `three`
sem sobreposição (tem de ficar intacto). Repete por 10 frames e compara o
primeiro com o último.

**O que mata o desenho:** se o teste de profundidade entre as duas passes não
for respeitado, ou se o pixel degradar entre o frame 1 e o 10 (vazamento de
estado entre frames), "duas passes sequenciais" está morto — e a única saída
seria manter um fork do backend do `three`. Nesse caso o relatório é que **a
migração não paga no formato atual**, e o marco é replanejado ou abandonado, em
vez de seguido.

> **RESPONDIDO em 21/09/2026 — o C++ desenha no alvo do `three`, e a oclusão
> entre os dois motores funciona.** Medido no kart-racer com `?bench&hold`, com
> o marcador (triângulo magenta) desenhado numa pass própria em C++, no device,
> na queue e na textura REAIS do host, e julgado por captura da janela:
>
> | caso | o que se esperava | pixel central medido | veredito |
> | --- | --- | --- | --- |
> | sem spike | cor da cena | `(52, 102, 121)` | linha de base |
> | C++ **depois** do `three`, à frente | marcador visível | `(255, 0, 255)` | **desenhou** |
> | C++ **depois** do `three`, ao fundo | cena tapa o marcador | `(52, 102, 121)` | **ocluiu certo** |
>
> Os dois últimos casos juntos são a prova: o marcador não está sendo "pintado
> por cima", ele participa do teste de profundidade que o `three` escreveu. A
> cena fica intacta ao redor (`loadOp: load` preserva), e a UI do host compõe
> por cima normalmente.
>
> **Restrição descoberta, e ela muda a ordem do desenho:** desenhar ANTES do
> `three` NÃO funciona. Duas causas somadas:
>
> 1. **`autoClear = false` não basta.** Quem decide o `loadOp` é
>    `autoClearColor`/`autoClearDepth`, propriedades SEPARADAS que continuam
>    ligadas (`Background.js`: `renderContext.clearColor = renderer.autoClearColor === true`).
>    Enquanto estiverem ligadas, o `three` limpa e apaga o que o C++ desenhou.
> 2. **O background/céu do `three` cobre a tela** no início do passe dele, então
>    mesmo sem limpar o alvo o conteúdo anterior some.
>
> **Consequência para o marco:** a ordem passa a ser **`three` primeiro, C++
> depois** — o `three` limpa, desenha o céu e o que não migrou; o C++ desenha os
> objetos migrados por cima, com o depth test cuidando da oclusão. Isso é mais
> simples do que o planejado (não exige desligar o clear do `three` nem mexer na
> ordem dele) e **não** exige tocar em arquivo vendorizado.

### Armadilhas que o passo 0 encontrou (custaram medição, ficam registradas)

- **O alvo de cor do `three` depende do antialias.** Com amostras > 0 ele
  desenha num alvo multiamostra e só resolve para a textura da canvas no fim da
  pass; sem amostras, desenha direto nela. Escolher errado manda o desenho para
  uma textura que ninguém lê — e o sintoma é "nada acontece", sem erro. No
  kart-racer hoje: **amostras = 0**.
- **A profundidade de um `RenderTarget` não está no mapa do backend.** Quem a
  aloca é o `Textures`, que tem DataMap próprio: é
  `renderer._textures.get(alvo).depthTexture`. Procurar em `backend.get(alvo)`
  devolve `undefined` em silêncio.
- **Readback síncrono NÃO pode ser chamado de dentro do frame.** A leitura
  bombeia a fila até o mapeamento completar; no meio do frame do `three` ela
  trava o laço e o jogo não sai da tela de carregamento. Quem julga imagem é
  captura por fora (`PrintWindow` com `PW_RENDERFULLCONTENT`).
- **A tela de carregamento engana o experimento.** Durante a montagem da cena o
  render é de uma cena VAZIA com a UI por cima; medir ali não diz nada sobre o
  marcador. O harness precisa esperar o jogo entrar no ramo de jogo.
- **O jogo pode injetar o próprio pós-processamento.** O kart-racer passa um
  objeto com `render()` próprio (`setPostFX`), que abaixo do limiar de
  velocidade cai no render direto da canvas. Não dá para presumir qual caminho
  de render está ativo — tem de ser medido.

### Passo 1 — correção do `alphaTest` e medição da cobertura real

Vem **antes** de migrar qualquer material, porque muda o que pode ser migrado.

- **Pronto quando:** `describeMaterial` recusa `alphaTest > 0` com motivo
  próprio, há teste cobrindo isso, e a cobertura nova está medida e registrada.

### Passo 2 — registro de geometria

Id estável no JS, registro do `GPUBuffer` do `three`, `unwrapValue` no C++.

- **Pronto quando:** dois `Mesh` com a mesma geometria dão o mesmo id (teste), e
  a contagem de buffers alocados **não dobra**.

### Passo 3 — opacos sem contorno pelo caminho nativo

RenderList povoada do `SceneMirror`, fábrica real de pipeline no cache,
uniformes por escrita direta.

- **Pronto quando:** `PipelineCache::misses()` estabiliza; `draws` idêntico ao
  baseline; imagem sem diferença (pelo harness do M7, SPEC-0240).

> **EM ABERTO em 21/09/2026 — o passe desenha, mas a oclusão contra o `three`
> ainda não funciona.**
>
> O que já funciona: 40 malhas REAIS da cena (geometria do `three`, matriz de
> mundo do objeto, projeção da câmera do `three`) desenhadas por uma pass em C++
> no alvo do `three`, com uniformes por offset dinâmico e um bind group só.
> Com o teste de profundidade desligado elas aparecem **no lugar certo**
> (~28 mil pixels da cor do passe), o que confirma geometria, matriz e projeção.
>
> O que não funciona: com `LessEqual` contra o depth do `three`, **nenhum pixel
> passa**; com `Greater`, passam ~45 mil. Ou seja, a profundidade que este passe
> gera é sistematicamente MAIOR que a que o `three` escreveu no mesmo pixel.
>
> Já descartado, com medição:
>
> | hipótese | como foi descartada |
> | --- | --- |
> | orientação de face (cull) | desligar o cull sozinho não muda nada |
> | textura de profundidade recriada por frame | o endereço é o MESMO em todos os frames, 2560x1440 |
> | `three` descartando o depth no fim da pass | o backend usa `Store` em todos os caminhos |
> | convenção de profundidade WebGL vs WebGPU | a câmera reporta WebGPU, e converter à força não muda o resultado |
> | depth invertido | nem a engine nem o jogo ligam `reversedDepth`, e o `three` desta versão não tem `reverseDepthBuffer` |
> | z ou estado de profundidade errados no passe | **limpar** o depth na própria pass (`Clear` 1.0) faz os 45 mil pixels aparecerem: o z passa contra 1.0, então ele é menor que 1 e o estado está correto |
> | view de profundidade diferente da do `three` | passar a view exata do descriptor dele (`backend.get(canvasTarget).descriptor.depthStencilAttachment.view`) **não muda nada** |
> | ordem de submissão | o `three` submete dentro do próprio `render()` (`finishRender`), antes de o controle voltar |
> | o objeto estar escondido e o depth ali ser de outra coisa | desenhar **sem esconder**, por cima do próprio objeto (onde o depth seria idêntico e `LessEqual` passaria por igualdade), também dá zero |
>
> **O que isso estabelece:** o passe desenha, o z está correto, e o conteúdo que
> a pass carrega **não é o depth que o `three` escreveu** — ele se comporta como
> um buffer de zeros. Falta descobrir onde o `three` de fato escreve essa
> profundidade, já que nem a textura de `getDepthBuffer` nem a view do
> descriptor da canvas contêm o resultado dele.
>
> **Correção de uma conclusão anterior desta mesma spec:** o resultado do passo 0
> foi lido como "a oclusão entre os dois motores funciona". Isso **não estava
> provado**. Lá o marcador era posto no fundo pelo viewport (`minDepth = maxDepth
> = 1`) e não aparecia; eu li isso como "a cena o ocluiu", mas o mesmo resultado
> sai de um buffer de profundidade que rejeita qualquer z > 0 — que é
> exatamente o sintoma medido agora. O passo 0 provou que **o C++ desenha no
> alvo do `three` e o desenho chega à tela**; não provou oclusão.
> **CORREÇÃO em 21/09/2026 — a sonda de profundidade não é um instrumento
> válido nesta plataforma, e o que ela "confirmou" não vale.**
>
> A sonda (`CORTEX_DEPTH_PEEK`) pinta na cor o que está no buffer de
> profundidade, via `texture_depth_2d` + `textureLoad`. Ela foi usada para
> "confirmar por leitura" que a profundidade do `three` está zerada. **Esse
> passo era inválido.**
>
> Validação do instrumento, que faltava: apontar a sonda para a profundidade
> **própria do passe** (modo `CORTEX_DEPTH_PEEK=2`), que é limpa com `1.0` todo
> frame e portanto **não pode** ler zero. Resultado medido:
>
> | teste | esperado | medido |
> | --- | --- | --- |
> | sonda devolve cor constante | tela coberta | tela coberta — o pipeline roda e o alvo é o certo |
> | sonda devolve `textureDimensions` | 2560x1440 | R=159, G=90 → 2554x1446 (quantização de 8 bits) — a textura **chega** ao shader |
> | sonda devolve `z` do buffer limpo com 1.0 | branco | **preto (z = 0)** |
>
> Ou seja: o pipeline roda, o alvo é o certo, o binding está correto e a textura
> chega ao shader com as dimensões certas — e ainda assim `textureLoad` devolve
> zero. **A leitura de profundidade por `texture_depth_2d` não funciona neste
> caminho wgpu/D3D12.** Aspecto `DepthOnly` explícito na view não muda.
>
> **O que muda e o que não muda:**
>
> - **Não muda:** a conclusão de que a profundidade do `three` *se comporta*
>   como um buffer de zeros continua de pé — ela vem dos testes
>   **comportamentais** da tabela acima (`LessEqual` não passa nada, `Greater`
>   passa, `Clear` na própria pass destrava), que não dependem da sonda.
> - **Muda:** a frase "a view que o host captura também **lê** zeros" não tem
>   valor probatório. A sonda leria zero de qualquer buffer.
> - **Some uma hipótese:** o diagnóstico mostrou `viewJS == viewHost` (mesmo
>   ponteiro), então a suspeita de que o JS entregava uma view diferente da que
>   o host captura das passes do `three` está **descartada por medição**.
> - Também medido do alvo real: profundidade `Depth24Plus`, 2560x1440, **1
>   amostra**, `usage = 23` (inclui `TextureBinding` e `CopySrc`); cor
>   `BGRA8Unorm`, 1 amostra. Isso descarta multiamostra e falta de usage como
>   causa.
>
> **Consequência para quem continuar:** não usar a sonda como evidência. O
> próximo teste da oclusão tem de ser comportamental e sem ambiguidade —
> desenhar o mesmo lote duas vezes contra a profundidade do `three`, uma com
> `depthCompare = Always` e outra com `Greater`, e comparar as imagens: num
> buffer de zeros as duas são idênticas; num buffer com a cena, `Greater` mostra
> o objeto só onde ele está atrás dela.


> **MEDIDO em 21/09/2026 — o caminho nativo é 34 µs/draw mais barato, e isso
> confirma a hipótese que sustenta o plano inteiro.**
>
> Com o passe usando profundidade própria (ver ressalva abaixo), `?bench` com a
> IA pilotando, métricas ligadas, medianas de ~305 amostras:
>
> | cenário | `cpu.render` | draws ainda no `three` |
> | --- | --- | --- |
> | sem o passe | 17,20 ms | 261 |
> | 200 objetos migrados | 13,00 ms | 158 |
> | todos os elegíveis | **11,10 ms** | 82 |
>
> **179 draws migrados derrubaram 6,1 ms — 34 µs por draw.** A SPEC-0227 tinha
> medido 33,5 µs/draw no JS por outro caminho; os dois números baterem é a
> validação mais forte que este plano recebeu até agora.
>
> Extrapolando os 82 draws que sobraram (material fora do subconjunto,
> transparentes), o alvo de 10 ms do marco está ao alcance e o de 8 ms do
> ADR-0237 é plausível.
>
> **Ressalvas, porque o número não é a imagem:**
>
> - O passe desenha com **cor sólida provisória**, sem sombreamento. Um toon com
>   textura custa mais — parte desse ganho será devolvida quando o shader ficar
>   completo. O que está medido é o custo de **submissão**, que é o que o marco
>   ataca.
> - A **oclusão contra o `three` continua quebrada** (o passe usa profundidade
>   própria), então a imagem ainda não é a correta.
> - O contador `draws` do trace só conta o que passa pela ponte; os draws
>   nativos não entram. Por isso a coluna diz "ainda no `three`" — a queda ali é
>   a migração, não trabalho a menos.

### Passo 4 — pool de uniformes ligado ao que se moveu

- **Pronto quando:** objeto parado gera **zero** escrita no frame seguinte.

### Passo 5 — a medição que decide o resto

`cpu.render` mediano com `?bench&hold`. Se já estiver perto de 10 ms, **o passo
6 é cancelado** e registrado como desnecessário.

### Passo 6 (condicional) — transparência entrelaçada

Só se o passo 5 disser que falta. Ganha ADR próprio.

### Passo 7 — contorno, toon e standard restantes

## Constantes

| nome | o que é | como o valor sai |
| --- | --- | --- |
| `kOpaqueOnlyRenderMs` | `cpu.render` após os opacos migrados | mediana de N rodadas com `?bench&hold` — é o número que decide o passo 6 |
| `kDualPassPixelTolerance` | diferença de pixel aceita entre o dual-pass e o caminho 100% `three` | começa em **0** (exige idêntico) e só relaxa com justificativa registrada |
| `kPipelineCacheMissBudget` | misses aceitáveis em regime | `PipelineCache::misses()` após aquecimento |
| `kNativeDrawNanosMeaning` | o que `nanos` significa num draw que não cruza a ponte | decidido e registrado **antes** de comparar os lados (ver abaixo) |

## Armadilhas de medição que este marco cria

- **`nanos` fica incomparável.** O cronômetro do `napi_stats` mede o tempo
  **dentro do callback N-API**, isto é, o custo de atravessar a ponte. Draw
  nativo não atravessa ponte nenhuma. Comparar `nanos` entre os dois lados é
  comparar coisas diferentes, a menos que se defina explicitamente o que ele
  significa no nativo.
- **Os contadores são manuais.** Os oito `bump*()` (pipeline, bind group,
  vertex, index, draw, writeBuffer, submit) precisam ser chamados à mão no laço
  nativo. Esquecer **um** faz `draws` bater e os outros divergirem em silêncio —
  e o método do projeto, que confere só `draws`, **não pega esse erro**.
- **A sonda de fases fica cega para o que migrou.** O `RenderPhaseProbe`
  (SPEC-0227) instrumenta por wrapper de métodos do `three`; o que sair do
  `three` some da granularidade fina. O total de `cpu.render` continua válido
  **desde que** a submissão nativa seja síncrona dentro da mesma chamada de
  render — o que precisa ser verificado, não presumido.

## O que este marco NÃO promete

- Skinning, animação por osso, partículas, sprites 2D, UI de runtime e materiais
  TSL customizados continuam no `three` (já decidido no ADR-0237).
- **Recorte alfa (`alphaTest > 0`) fica de fora** e passa a ser recusado.
- Transparência entrelaçada entre motores é **condicional à medição**.
- Patch em arquivo vendorizado do `three` está descartado.
- Profiling fino dentro do caminho nativo é instrumentação nova, fora deste
  marco.
