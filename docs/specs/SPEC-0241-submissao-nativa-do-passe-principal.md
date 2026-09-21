# 0241 - Submissão nativa do passe principal (M5 do ADR-0237)

**Data:** 2026-09-21
**Status:** em execução — o spike que decide o marco vem primeiro

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

### Duas passes sequenciais, não uma compartilhada

Pass nativa (limpa e desenha os opacos migrados) → `renderer.render()` normal do
`three` com `autoClear = false` e `loadOp: load`, no mesmo color e no mesmo
depth. **Sem tocar em arquivo vendorizado.**

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
