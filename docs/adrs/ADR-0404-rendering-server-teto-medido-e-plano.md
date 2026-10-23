# ADR-0404 — RenderingServer no export: teto medido e plano de construção

**Data:** 2026-10-23
**Status:** aceito — **construir**, começando pelo marco RS1 (instâncias opacas
simples). Nenhum código ainda; cada marco tem SPEC própria antes do código.

Frente B2 do PRD-0009 ("modelo Godot"). Sucede, na pergunta "vale tirar o laço
por objeto do `three` do passe principal?", a b.3 (ADR-0363, arquivada) e a
SPEC-0362 (rejeitada). Mantém a premissa do ADR-0237/ADR-0330: **o Studio
continua 100% no `three`**; só o export usa o caminho nativo, com paridade
verificada por instrumento.

## Contexto

O export nativo do DDD 61 (main do jogo `e2be01c`) roda a ~34–38 fps, com
**render ~13–17 ms** de um quadro de ~24–32 ms. O C++ já tem a cena (espelho,
SPEC-0233/0234/0322), a projeção do passe principal (SPEC-0332), receitas de
desenho e lote (b.2, SPEC-0333) — mas o `three` continua dono, **por objeto e
por quadro**, de RenderList, `renderObject`, nós, bindings, pipelines e do
comando de desenho.

Os cortes parciais renderam pouco ou nada: M5 (ADR-0244), SPEC-0362, b.3
(ADR-0363). E duas vezes o teto saiu inflado: a sonda de fases infla o custo por
desenho (memória "sonda de fases"), e o teto da b.3 continuava pulando objetos
que voltavam a se mover. Antes de decidir construir um servidor de render de
verdade era preciso **um teto honesto**.

## O experimento de teto

### Desenho do braço

Braço temporário `?rsCeiling=N` (fora de commit; o patch ficou em
`D:/jogos/detetive-brasilia/.cortex/rs-ceiling/rs-ceiling-arm.patch`), dentro
da projeção nativa (`NativeMainProjection`), aplicado a todo `render()` cuja raiz
é a cena espelhada **e que não é passe de sombra** (`scene.overrideMaterial`
nulo):

- **o culling em C++ continua rodando** (`__cortexMainPass.project`) — custo que
  um servidor pagaria;
- luzes continuam indo à RenderList (`pushLight`);
- **nenhuma malha vai à RenderList do `three`**, exceto um **portador por nó de
  `updateBefore`** por render: o braço aprende, embrulhando
  `renderer._nodes.updateBefore`, quais nós cada objeto carrega, e empurra o
  primeiro candidato que cobre um nó ainda não coberto naquele render. Assim a
  sombra e os nós por render continuam acontecendo — trabalho por quadro que um
  servidor também faria;
- a sombra do jogo, o fundo, a UI, a apresentação e o resto do quadro ficam
  iguais nos dois braços.

Modos: `1` = corta tudo (teto do servidor completo); `2` = mesma contabilidade,
empurra tudo (A/A: o braço em si não pode custar nada); `3` = corta só o que um
**primeiro marco** levaria — opaco, material sem nó, não skinado — e empurra
transparentes, skinados e materiais com nó (`*Node` não nulo).

A imagem do braço fica errada de propósito.

### Validação do instrumento (antes de concluir)

| verificação | resultado |
| --- | --- |
| a projeção nativa assumiu todos os quadros? | `recusadas=0` em todas as rodadas |
| o braço corta o que diz? | modo 1, Setor O: ~103–151 malhas puladas/quadro, 3 empurradas (portadores); `draws` 172 → 34 |
| a sombra continua? | 1 nó de `updateBefore` distinto na cena inteira (o mapa de sombra do `SunShadow`); renders de sombra/quadro iguais nos braços (0,01) |
| há trabalho por objeto pulado que o servidor precisaria em JS? | `onBeforeRender` próprio em objeto pulado: **0** |
| renders aninhados da cena | 1 render da cena espelhada por quadro, 0 com outra câmera fora a sombra — o "render aninhado" do backlog é o mapa de sombra do `SunShadow` (sob demanda, ~1 em 22 quadros parado), presente nos dois braços |
| A/A (modo 2) | render 13,26 ms, `draws` 173 — no nível do controle; contadores idênticos aos do modo 1 |

O braço é **conservador** em dois pontos (continua pagando o laço em JS sobre os
candidatos e o `three` inteiro nos portadores) e **otimista** em um (não paga a
detecção de mudança de material nem a submissão em C++) — este último é
descontado abaixo como residual.

### Resultado (kit SPEC-0382, export release, mesma build, intercalado)

Engine `f8ddbf38` + braço, jogo `e2be01c`, 135 s por rodada, todas VÁLIDAS,
100% dos quadros apresentados. Modo 1: 2 réplicas × 4 pontos (16 rodadas).
Modo 3: 1 réplica × 4 pontos (8 rodadas). `render` = `cpuAvg` (ms).

| ponto | render controle | **modo 1** | Δ | quadro med Δ | **modo 3** (controle do par) | Δ | draws ctrl / m1 / m3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Setor O | 12,88 | 4,52 | **−8,36** | −8,25 | 6,57 (13,79) | **−7,22** | 172 / 34 / 56 |
| Centro | 13,59 | 3,98 | **−9,61** | −12,00 | 6,86 (12,74) | **−5,88** | 164 / 34 / 63 |
| Comercial | 14,89 | 5,18 | **−9,70** | −10,30 | 9,47 (14,62) | **−5,15** | 157 / 34 / 66 |
| Águas Claras | 16,51 | 5,10 | **−11,41** | −12,05 | 7,95 (16,38) | **−8,43** | 187 / 32 / 62 |

O GC também cai (−256 a −454 KB/quadro no modo 1) e o `world` cai 0,2–0,6 ms.
No modo 3, ~21 objetos/quadro escapam (transparentes, skinado, material com nó)
e custam ~2–3 ms: **~100 µs cada** no caminho do `three`.

### Residual de um servidor em C++ (descontado do teto)

| item | estimativa | base |
| --- | --- | --- |
| submissão em C++ | 157–187 draws × 2,2 µs = **0,35–0,41 ms** | spike do ADR-0232 (laço completo com `setPipeline`/`setBindGroup`/`draw`) |
| UBO de quem se moveu + instâncias | ~20 objetos + ~7 `InstancedMesh` ≈ **0,1–0,2 ms** | b.3: ~20 objetos/quadro se movem |
| detecção de mudança de material | **0** com ganchos; até **~0,6 ms** com conferência por instantâneo (~3–5 µs/objeto, b.1) | SPEC-0333 |
| skinado no `three` (detetive) | já está no modo 3 | SPEC-0357 |

**Teto realista:** servidor completo **−7 a −10,8 ms** de render (de 13–17);
primeiro marco (modo 3) **−4,3 a −8 ms**. É ~2/3 do render e leva o quadro
mediano de ~24–32 ms para ~15–20 ms.

### Por que a b.3 não viu isso

A b.3 cortou só ~36 objetos limpos e parados e **manteve trabalho em JS por
objeto** para eles (oferta, conferência, chave, emissão por sequência) e para
todo o resto. O braço mostra que o custo está no laço por objeto **inteiro**:
~55–65 µs por draw que saem só quando nenhum JS por objeto roda no quadro. A
regra de desenho que sai daqui: **instância limpa custa zero JS por quadro**;
o JS só fala com o servidor quando algo muda.

## Levantamento, peça por peça

| peça | o que existe | estado | esforço | risco de paridade | depende de |
| --- | --- | --- | --- | --- | --- |
| **API de instâncias** (criar/atualizar/destruir por delta) | espelho: nós, hierarquia, matriz de mundo em `double`, `visible` por gancho, flags/esfera por varredura, `appendNodes`/`removeNode` | parcial: o C++ conhece o **nó**, não a **instância desenhável** (geometria + material + receita + slot de UBO) | médio (1–2 sem) | baixo | — |
| **Materiais** | (i) **receita do `three`** (b.2, `draw_batch.*`: pipeline e bind groups que o `three` montou, com `AddRef`); (ii) `MaterialDesc` (M1) + cache de pipeline (M2, só header e teste) + override constants provadas no naga | (i) pronto para opaco; (ii) **sem nenhum WGSL de material iluminado**, sem Lambert, névoa nem alphaTest — e o DDD 61 é metade Lambert com névoa | (i) pequeno; (ii) meses | (i) **nulo por construção**; (ii) alto | — |
| **Objeto que se move** | matriz no espelho; `TransformOnlyRefresh` (ADR-0290) escreve o UBO de objeto em JS | falta: o C++ escrever o UBO de objeto (matriz, normal) a partir do espelho, com o layout do grupo de objeto capturado uma vez por estado de shader | médio | médio (layout é interno do `three`; travar por teste de forma) | instâncias |
| **Névoa** | `ReferenceNode` de update `OBJECT`: cor/near/far vivem no UBO de **cada** objeto | falta: espalhar o delta da névoa em C++ (O(instâncias), µs) — hoje a mudança derruba todo objeto para o caminho do `three` (SPEC-0333, ~17/quadro) | pequeno | baixo | layout do UBO |
| **Transparentes e ordem** | sort total do `three` conhecido; `painterSortStable` em C++ feito e arquivado (b.3) | parcial | pequeno | médio (validar por imagem; `DoubleSide` transparente = 2 passes) | instâncias |
| **`InstancedMesh`** | `instance_buffer_store` (sombra, SPEC-0289) | falta no passe principal (versão da `instanceMatrix` → upload no host) | pequeno–médio | baixo | instâncias |
| **Skinned** (detetive; a multidão é lote instanciado) | `three`; ~80–130 µs/personagem (SPEC-0357) | **fica no `three`** (recusa por objeto) | — | — | — |
| **Luzes** | grupo compartilhado do `three` (1×/render) | (i) receita: nada a fazer; (ii) uber-shader: reimplementar spot com penumbra/decay, hemisfério | (i) 0; (ii) alto | (ii) alto | — |
| **Sombra** | passe nativo só para o CSM da engine (SPEC-0245) | o DDD 61 usa `SunShadow` próprio (sombra direcional simples, `three`, refeita a cada ≥3 s; "~+16 ms no nativo" segundo o jogo) — candidata ao p99 | pequeno–médio (generalizar o passe nativo) | médio (bandas, lado da face) | — |
| **Contorno** (inverted hull) | `ShadingModel 'outline'` (M1) | o DDD 61 não usa; a receita cobre | — | — | — |
| **Pós/bloom** | nativo (ADR-0147/0149) | pronto (o DDD 61 não usa) | — | — | — |
| **UI** | composta nativa (ADR-0105) | pronto | — | — | — |
| **Render targets e renders aninhados** | contexto por alvo no `three` | o servidor precisa de N vistas (câmera + alvo) por quadro; hoje no DDD 61 a única outra vista é o mapa de sombra | médio | médio | instâncias |
| **SSAA** | passe principal em 2560 px (2× sobre 1280) | custo de GPU, não de CPU do render; fora deste ADR | — | — | — |

**O que o `three` faz e o servidor não faria:** a verificação genérica por
objeto e por quadro (`NodeMaterialObserver.equals`, ~30 campos de pipeline,
`updateNode` em todos os nós, `_bindings._update`, `ChainMap` do
`_objects.get`), o push e o sort da RenderList em JS e `onBeforeRender` por
objeto. O servidor troca isso por **deltas**: transformação (espelho, já
existe), visibilidade (gancho, já existe), troca de geometria/material
(re-gravação da receita) e **valor de material mudado** — a parte difícil, porque
o `three` não tem dirty flag de material (ganchos nas propriedades do
`refreshUniforms` + `material.version`, ou conferência por instantâneo).

## Decisão

**Construir o RenderingServer do export pelo caminho da RECEITA**, não do
uber-shader:

- o `three` continua **compilando** material e pipeline (uma vez por estado de
  shader) e desenhando o que o servidor recusa;
- o C++ passa a ser **dono das instâncias desenháveis**: receita (pipeline, bind
  groups, buffers), slot do UBO de objeto, chave de ordem, e o laço de desenho;
- o JS só envia **deltas**; instância limpa custa **zero JS por quadro**.

Regras que valem para todos os marcos: recusar em vez de aproximar (por
objeto); precisão `double` no que espelha o `three`; Studio intocado; cada
marco com SPEC antes do código, interruptor próprio, A/B no kit SPEC-0382 e
paridade pelo `?parityFreeze` (SPEC-0362).

### Marcos (do que mais rende pelo teto medido)

| marco | o quê | critério numérico | interruptor |
| --- | --- | --- | --- |
| **RS1** | **instâncias opacas simples** (opaco, material sem nó, não skinado, sem `renderOrder`/`polygonOffset`/`depthWrite` falso), paradas **e** em movimento: receita gravada no 1º desenho do `three`; o C++ escreve o UBO de objeto do espelho; desenho em C++ no passe da cena, depois do fundo; deltas de material por `version`/ganchos + névoa espalhada em C++ | render **−4 ms ou mais** no Setor O e no Comercial (teto do modo 3: −7,2 / −5,2), sem regressão nos 4 pontos, `?parityFreeze` no nível do controle | `?renderServer=0` |
| RS2 | `InstancedMesh` e materiais com nó cujos nós são conferíveis (céu, carros estacionados) | **−1,5 ms** adicional (diferença modo 3 → modo 1: ~2–3 ms) | idem + `?rsNodes=0` |
| RS3 | transparentes ordenados em C++ | sem regressão, paridade exata; ganho pequeno (poucos por quadro) | `?rsTransparent=0` |
| RS4 | sombra direcional simples (`SunShadow`) no passe de sombra nativo | **p99 de render** cai no Setor O parado e dirigindo | `?rsShadow=0` |
| depois | B5 (threads) passa a ter o que paralelizar | — | — |

Opacos com teste de profundidade dão a mesma imagem em qualquer ordem, salvo
empate exato de profundidade — por isso o RS1 recusa `polygonOffset`,
`renderOrder` ≠ 0 e `depthWrite`/`depthTest` desligados, e desenha os nativos
**em bloco** (sem a intercalação da b.3). O escape é por objeto: o `three` segue
desenhando o resto na mesma pass.

**Parar bem:** depois do RS1 o export já fica ~5–7 ms mais rápido no render;
cada marco seguinte é independente e pode não ser feito.

## Alternativas consideradas

- **Não construir** (ficar no `three` com cortes parciais): rejeitada pelo
  número — o teto é ~2/3 do render, e os cortes parciais já mostraram que não
  o alcançam enquanto houver JS por objeto.
- **Uber-shader próprio a partir do `MaterialDesc`** (o M5 original): rejeitado
  como primeiro passo — não há WGSL de material iluminado, o `MaterialDesc` não
  cobre Lambert/névoa/alphaTest, e luzes/sombra/névoa/tone mapping teriam de ser
  reproduzidos (meses, paridade alta). Fica como evolução se o `three` precisar
  sair também da compilação.
- **Retomar a b.3** (fila intercalada de opacos parados): rejeitada — mantinha
  JS por objeto e deixava de fora os ~20 que se movem; mediu ruído.
- **Trocar o renderer** (threepp, engine própria): mesmos motivos do ADR-0228 e
  do ADR-0330.

## Consequências

- O export diverge mais do Studio; a volta é `?renderServer=0`, e a paridade
  passa a ser verificada pelo `?parityFreeze` em cada marco.
- O caminho depende de internos do `three` 0.184 (forma da receita, layout do
  UBO de objeto, `NodeMaterialObserver`): cada marco instala **recusando** se a
  forma não bater, e tem teste que falha num bump do `three`.
- O risco principal é **delta de material faltando** (uniforme velho na tela).
  Mitigação: lista derivada do `refreshUniforms` do `three` + `material.version`
  + teste de forma; na dúvida, recusa.
- Os interruptores e o caminho antigo (b.1/b.2) continuam até o RS1 ser o padrão.
- O braço de teto (`?rsCeiling`) não entra na engine; para remedir, aplicar o
  patch numa worktree descartável.
