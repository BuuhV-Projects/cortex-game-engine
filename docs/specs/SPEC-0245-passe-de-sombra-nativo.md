# SPEC-0245 — Passe de sombra nativo (M6)

**Data:** 2026-09-22
**Status:** aceito — E1 a E5 executados; **medido em 2,8 ms contra o critério de 3,0** (ver o fim). E7/E8 em aberto.

## Contexto

O **M6** do ADR-0237 volta a ser o próximo marco. O ADR-0244 chegou a revogá-lo
por uma conta errada e essa revogação foi desfeita, com o alvo agora **medido e
isolado** (ADR-0244, correção de 2026-09-22):

| fato | valor | como foi medido |
| --- | --- | --- |
| custo do passe de sombra | **~5,5 ms** | `?semCasters=1` contra baseline, com `?renderPhases=1` |
| casters na cena | **449** | censo do grafo (`?dumpGrafo=1`) |
| custo por caster | **~12 µs** | 5,5 ms ÷ 449 |
| referência em C++ | **2,2 µs/draw** | spike do ADR-0232 |

Nenhuma alavanca barata funciona: as cascatas já estão em 1, desligar os 61
grupos estáticos dá 0,9 ms e quadruplicar o `casterMinRatio` dá 0,3 ms. O custo
está distribuído pelos 449 casters — é por caster, e é isso que o C++ barateia.

## Por que este marco é mais fácil que o M5

O M5 falhou em três frentes, e **nenhuma das três existe aqui**:

| dificuldade do M5 | no passe de sombra |
| --- | --- |
| oclusão contra a profundidade do `three` | **não existe** — o alvo é a `ShadowDepthTexture`, escrita só por este passe |
| quatro modelos de sombreamento | **não existe** — o passe é depth-only, o `three` já usa um `overrideMaterial` único |
| transparência e ordem | **não existe** — sem cor, sem blend, sem sort relevante |

E o alvo é exclusivo: nada mais escreve na `ShadowDepthTexture` no frame, então
não há o problema de convivência que travou o M5.

A infraestrutura do M5 é reaproveitável e já tem teste: `geometry_registry`
(132 checks), `uniform_pool`, `render_list` e o caminho de pipeline em
`native/src/render/`.

## Critério de aceite

- **Ganho:** `cpu.render` cai pelo menos **3,0 ms** contra o baseline, medido
  com `?bench&hold`, mesma build, medianas de ~150 amostras. (O teto é 5,5 ms;
  3,0 ms é o mínimo que justifica o marco.)
- **Imagem:** sem bandas na pista e sem sombra faltando, conferido pelo harness
  do M7 (SPEC-0240) **e** por inspeção da volta inteira — as bandas da
  SPEC-0234 passaram por uma captura antes de serem notadas.
- **Sem regressão:** `draws` do passe principal inalterado; suíte verde.

## Regras de medição (não negociáveis, custaram dois dias)

1. **Comparação fina exige `?bench&hold` e a mesma build.** Sem `hold` a IA
   pilota trechos diferentes e a variância domina.
2. **Validar o instrumento antes de concluir dele.** Todo contador novo tem de
   passar por um caso de resposta conhecida.
3. **Não usar os contadores de `draws` para concluir** enquanto a divergência
   registrada na SPEC-0243 não for resolvida. Usar tempo.
4. **Identificar recurso pelo rótulo** (`texture.name`), nunca por dimensão.

## Ordem de execução

### Passo 0 — resolver a divergência dos contadores de draws
O trace diz 66, a contagem por pass diz 234, o censo diz 449 casters. Sem isso
não há como afirmar que o passe nativo desenhou o que devia.
- **Pronto quando:** as três contagens se explicam mutuamente, por escrito.

### Passo 1 — enumerar os casters em C++
Reusar o espelho de cena (SPEC-0234) e o registro de geometria do M5.
- **Pronto quando:** o C++ lista os mesmos casters que o `three` desenharia,
  conferido contra o censo do grafo.

### Passo 2 — desenhar o shadow map em C++
Alvo: a `ShadowDepthTexture`. Depth-only, sem cor.
- **Pronto quando:** a imagem com o passe nativo é indistinguível da anterior
  pelo harness do M7.

### Passo 3 — medir
- **Pronto quando:** o critério de ganho acima é atingido, ou o marco é
  encerrado com o número medido registrado, como foi feito com o M5.

## O que este marco NÃO promete

- Não mexe no passe principal: o M5 está encerrado (ADR-0244, decisão 1).
- Não altera a política de casters nem o `casterMinRatio` — medidos, não valem.
- Não resolve o bug do `three` em `ShadowNode.js` (`_cameraFrameId` é um
  `WeakMap` acessado com colchete, então todas as câmeras compartilham o mesmo
  slot). Fica registrado porque qualquer amortização por frame esbarra nele.

## Risco ao critério de aceite, levantado em 2026-09-22 (antes de implementar)

A conta que sustentava este marco — 449 casters a ~12 µs — **não vale**. O
interruptor `?semCasters=1`, usado para isolar, desliga `castShadow` de
qualquer objeto que o tenha, **incluindo o `sun`**: o log diz "450 objetos"
contra 449 malhas do censo. Sem `light.castShadow` o `three` nem monta o shadow
node, e o passe some inteiro — que é o que o `rpCallsProject` caindo de 4 para
3 estava dizendo. Os 5,5 ms são do **passe inteiro**, não dos draws.

O passe de sombra emite **66 draws** por frame, não 449. Isso põe o custo por
draw em ~83 µs — mais que o dobro do passe principal em JS (33,5 µs/draw,
SPEC-0227), o que é implausível como submissão pura e indica que **a maior
parte dos 5,5 ms não é submissão**.

Consequência: migrar só os draws para C++ (2,2 µs) rende **~2,1 ms**, abaixo do
mínimo de 3,0 ms exigido acima. Pela decomposição já medida (SPEC-0243), o
restante está em `rpProject` (1,64 ms) e no laço da RenderList da cascata
(dentro dos 3,96 ms de `rpObjects`), onde a maioria dos itens é percorrida,
enfileirada e descartada pelo filtro de `castShadow` — que o `three` só aplica
**depois** da RenderList.

**O marco só atinge 3,0 ms se o passe nativo substituir também a travessia e a
montagem da lista, não apenas a submissão.** Isso é escopo maior que o descrito
nos passos 1 a 3 e precisa ser decidido antes de qualquer implementação.

## Teto do M6 MEDIDO em 2026-09-22 — o marco é viável, com folga

A suspensão acima partia de uma conta da **Forma A** (migrar só os draws,
deixando o `three` resolver objeto) aplicada a um marco escrito na **Forma B**
(o C++ substitui o passe de sombra inteiro). São coisas diferentes e o número
de 2,1 ms não vale para o que esta spec descreve.

A conta de 2,1 ms também era **internamente contraditória**: se cada draw
custasse os 83 µs alegados e o C++ faz por 2,2 µs, migrar 66 draws valeria
~5,3 ms, não 2,1. As duas metades não podiam estar certas juntas.

### O isolamento correto

`?semPasseDeSombra=1` põe `autoUpdate = false` na `shadow` de **cada cascata**,
o que faz o gate de `ShadowNode` pular o `renderer.render(scene, shadow.camera)`
— **sem** tocar em `receiveShadow`, em `shadowMap.enabled` ou nos materiais. É o
que `?semSombras=1` e `?semCasters=1` não davam: os dois desligam a luz junto e
derrubam o subsistema inteiro, por isso batiam entre si (5,8 e 5,5 ms) sem
serem confirmações independentes.

> O interruptor precisou ser corrigido para aplicar **depois** do `_init` do
> CSM: `this.lights` só é populado no primeiro `setup`, e a versão anterior
> congelava zero cascatas **falhando em silêncio**. Agora ele loga quantas
> congelou, e o log diz `1`.

| fase | baseline | passe congelado | delta |
| --- | --- | --- | --- |
| `render` | 19,10 ms | 13,50 ms | **−5,60** |
| `rpProject` | 4,39 ms | 2,33 ms | −2,06 |
| `rpObjects` | 12,51 ms | 8,89 ms | −3,62 |
| `rpCallsProject` | 4 | 3 | −1 |

> Absolutos maiores que os 12,80 ms do baseline porque a sonda custa ~2,3 ms; o
> que vale são os deltas.

### Conclusão

**O teto do M6 é 5,60 ms**, contra um critério de aceite de 3,0 ms — **2,6 ms de
folga**. Para falhar, o passe nativo precisaria gastar mais de 2,6 ms, ou seja
~39 µs por draw, contra os 2,2 µs/draw que o spike do ADR-0232 mediu e os
0,023 ms de travessia + culling de 1.300 nós do espelho de cena (SPEC-0234).

**O marco sai de suspenso e volta a executar**, na Forma B descrita nos passos
1 a 3 — que é o que já estava escrito. A Forma A fica explicitamente fora: o
ADR-0235 já fixou que, com o `three` montando a RenderList, a ponte cobre só
~18% do `renderObject`.

### Trabalho real identificado para o passo 1

`native/src/scene/scene_mirror.h` guarda `parent`, `transform`, `radius` e
`visible` — **não guarda `castShadow` nem geometria por nó**. Enumerar os
casters em C++ exige estender o `NodeDesc` e ligá-lo ao `geometry_registry`. É
incremento sobre infraestrutura que já existe e tem teste, mas é o item que
dita o prazo.

## Passo 1 EXECUTADO em 2026-09-22 — a enumeração nativa bate com o `three`

### O que foi construído

- `native/src/scene/shadow_caster_enumerator.{h,cpp}` — unidade PURA (sem wgpu,
  sem NAPI) que, dado o espelho, a posição da câmera e os planos da ortho da
  cascata, devolve a lista de nós que projetariam sombra. Reproduz os filtros do
  `three` na ordem dele: visibilidade herdada → malha desenhável → `castShadow`
  autorado → culling angular (SPEC-0197) → frustum da cascata.
- `NodeDesc` ganhou `flags` (castShadow autorado, isento do culling angular,
  `frustumCulled`, desenhável), `geometryId` e a esfera LOCAL da geometria. O
  layout de construção foi de 14 para 20 floats por nó.
- `shadowCasters(...)` no `__cortexSceneMirror` e `countShadowCasters(...)` no
  `NativeSceneMirror`, com o relato por `debug('perf', …)` atrás de
  `?contarCasters=1`.
- **`visible` passou a viajar por frame** no buffer de sincronização (11 → 12
  floats por nó). Ver abaixo: era um erro real, não um detalhe.

### O instrumento foi validado antes de concluir dele (regra de medição 2)

O número de referência não foi lido desta spec: `?contarCasters=1` envolve o
`renderObject` e conta os draws que o `three` emite **enquanto `scene.name`
começa com `Shadow Map [`** — o único sinal que distingue o passe de sombra de
fora, sem identificar recurso por dimensão (regra 4).

| rodada | amostras | idênticas |
| --- | --- | --- |
| `?bench&hold`, `minRatio` 0,15 (padrão) | 478 | **478 (100%)** — 66 × 66 |
| `?bench&hold`, `?casterMinRatio=0` | 2.632 | **2.632 (100%)** |
| `?bench` (IA pilotando), `?casterMinRatio=0` | 3.281 | 2.829 (86%) |

**Com a cena parada a igualdade é exata**, inclusive com o filtro angular
desligado — que é o caso mais duro, porque sem ele nada mascara um erro de
visibilidade ou de frustum. O alvo de **66 draws** foi atingido: 66 enumerados
contra 66 desenhados, em todas as amostras.

### A divergência com a cena em movimento, explicada

Os 14% de diferença enquanto a IA pilota são **do instrumento e do espelho, não
do enumerador**, e têm duas causas medidas:

1. **A cena ganha nós depois do `install`** — medido: 977 na cena contra 975 no
   espelho. O espelho é montado uma vez e não cresce (SPEC-0234), então o
   `three` desenha até dois casters que o C++ não pode ver. Responde por 382 das
   449 amostras negativas (`delta −1` e `−2`).
2. **Defasagem de um frame na ortho da cascata** — o `three` só fixa a matriz da
   cascata dentro do `renderShadow`, e a conferência roda no `updateBefore`.
   Some quando a câmera está parada, que é exatamente o que as duas primeiras
   rodadas mostram.

Nenhuma das duas é do enumerador, e a primeira é trabalho identificado para o
passo 2.

### O erro que a medição pegou

`?casterMinRatio=0` acusou o C++ contando **até 42 casters a mais** que o
`three`. Causa: o espelho fixava `visible` no `build` e nunca mais o atualizava,
então tudo que o jogo escondia em runtime seguia projetando sombra do lado
nativo. O filtro angular ligado mascarava isso (já cortava os mesmos objetos) —
teria virado sombra de objeto escondido no passo 2. Corrigido mandando `visible`
junto do transform, por frame.

### Testes

- Harness C++ (`cortex_host_tests`): **169 checks, 0 falhas** — nó invisível
  (próprio e por herança do pai), sem `castShadow` autorado, não desenhável, o
  limiar angular nas bordas (`>=`, não `>`), escala do nó no raio, isenção de
  skinned/instanced, frustum da cascata (dentro, fora, encostando, e
  `frustumCulled = false`), centro da esfera ≠ origem do nó, `visible` chegando
  pelo frame e o vínculo com a geometria.
- Vitest: **1.522 passando, 7 pulados, 0 falhas**.

### O que fica para o passo 2

1. Nó criado depois do `install` não existe no espelho (os 2 nós medidos).
2. O enumerador conta NÓS; o `three` conta itens de RenderList. No kart-racer
   dá no mesmo (0 malhas com material em array), mas uma cena com material
   multi-grupo divergiria — o passo 2 precisa do `drawCount` por nó.
3. `material.visible` é fotografado no `build`, não sincronizado.
4. Os diagnósticos `?contarCasters=1` (sonda de `renderObject` e deriva de nós)
   são TEMPORÁRIOS e saem quando o passo 3 fechar a medição.

### Nota para o passo 2 — o passe de sombra ordena à toa

O engine nunca toca em `sortObjects` (zero ocorrências em `src/`), então o
shadow pass roda com o default `true` do `three`. Ele paga duas multiplicações
de `Matrix4` por malha (`Renderer.js`, no `_projectObject`) mais o `Array.sort`
da RenderList **para ordenar um passe depth-only**, onde a ordem não tem efeito
visual.

Quando o C++ assumir o passe (passo 2), esse custo desaparece por construção —
não há por que ordenar. Fica registrado como micro-ajuste disponível
(estimativa de 0,05 a 0,15 ms) caso o marco precise de margem para o critério.

## Investigação do passo 2 (2026-09-22) — achados que mudam o plano

### O critério de aceite apontava para código que não estava versionado

A frase "conferido pelo harness do M7 (SPEC-0240)" pressupunha um harness
pronto. Uma busca em **todas** as branches não achou nenhum
`render_parity_capture`: a branch `feat/m7-paridade-visual` tinha só o `.md`.

O código **existia**, não commitado, na árvore da worktree do M7 — a um
`git worktree remove` de ser perdido. Foi preservado em `b2443dcf` naquela
branch, com a ressalva de que **não foi reverificado**: não compilei nem rodei
o harness, e a afirmação de outra sessão de que ele mediu "piso de ruído zero"
não foi reproduzida.

**Consequência:** construir o passo 1 do M7 (captura + comparador calibrado) é
**pré-requisito** do passo 2 deste marco. Sem `pctPixelsAboveNoiseFloor`
calibrado, "imagem indistinguível" não é critério de aceite — é uma frase.

### O `three` desenha a sombra com o lado da face INVERTIDO

`Renderer.js`, no caminho de `isShadowPassMaterial`:
`overrideMaterial.side = material.shadowSide ?? _shadowSide[material.side]`,
ou seja `FrontSide → BackSide`. Um passe nativo com `cullMode = Back` — o
natural, e o que o `native_pass.cpp` do M5 usa — escreveria a profundidade da
**face errada**, produzindo acne e peter-panning. O passe nativo tem de usar
**`cullMode = Front`**.

O mesmo bloco copia `alphaTest`/`alphaMap` e o `positionNode` do material para
o passe de sombra. Caster com recorte alfa ou deslocamento de vértice **não é
reproduzível** hoje em C++ e tem de ser **recusado**, não aproximado.

### A defasagem de um frame é estrutural

Os `ShadowNode` internos (que desenham) rodam **antes** do `CSMShadowNode` (que
posiciona as cascatas), porque a ordem de `updateBefore` é a de registro, e os
filhos são registrados primeiro. O shadow map do frame N sai com as cascatas
colocadas no frame N−1. Não é acidente a corrigir: é a ordem do `three`.

### Desligar o passe do `three` quebra três coisas que temos de repor

Com `autoUpdate = false` e `needsUpdate = false` por cascata:

1. **`shadow.updateMatrices` deixa de ser chamado** → o uniforme
   `lightShadowMatrix` **congela**, e a sombra fica presa ao mundo de um frame
   antigo. Falha silenciosa e visual. Quem passa a chamar é o nosso preparo por
   frame — e é bom que seja o mesmo `updateMatrices`, porque garante que o mapa
   e o amostrador usam a mesma ortho.
2. **`shadowMap.setSize` deixa de rodar** → mudar `shadow.mapSize` em runtime
   não redimensiona mais nada.
3. **A RT de cor deixa de ser limpa** → irrelevante com PCF/PCFSoft, mas passa
   a importar com VSM. Vira guarda: recusar assumir se o tipo for `VSMShadowMap`.

### As pendências do passo 1, reclassificadas

| pendência | bloqueia? |
| --- | --- |
| nó criado depois do `install` não existe no espelho | **sim** — antes era erro de contagem, agora vira **sombra faltando**, porque ninguém mais desenha o que o C++ não vê |
| `material.visible` fotografado no `build` | **sim** — é o mesmo erro do `visible` corrigido no passo 1, e o `three` o reavalia todo frame |
| `drawCount` por nó | não nesta cena (zero materiais em array, medido), mas tem de virar **recusa** |

### Plano do passo 2

**E0** construir o comparador de imagem (M7 passo 1) — sem oráculo não há
aceite. **E1** `material.visible` por frame no sync. **E2** registrar a
geometria de todos os casters (hoje só o caminho `?nativePass=N` povoa o
registro). **E3** o **gate de recusa** antes de desenhar: skinned, instanced,
material em array, `alphaTest`/`alphaMap`, `positionNode`, geometria ausente,
VSM, ou divergência de nós entre cena e espelho — recusar devolve o passe ao
`three`. **E4** preparo por frame em JS (`updateBefore` do CSM →
`updateMatrices` por cascata → viewProj em `Float64Array`, nunca `Float32`).
**E5** o passe depth-only em C++, com `cullMode = Front`. **E6** desligar o
passe do `three`, só com E3–E5 verdes. **E7** remover o trabalho órfão
(`cullShadowCasters` em JS, sort do shadow pass). **E8** medir e limpar os
diagnósticos.

### O que ainda não se sabe, e precisa de caso de resposta conhecida

1. **Se o submit do passe nativo precede, na fila, a leitura pelo passe
   principal.** A SPEC-0242 provou *depth attachment* entre command buffers —
   **não** amostragem de textura. Extrapolar entre os dois é exatamente o que
   custou dois dias no M5. Exige teste próprio: escrever um valor conhecido no
   mapa e conferir a sombra correspondente.
2. **Quem cria os 2 nós que aparecem depois do `install`.** Medido, não
   identificado. Sem isso o gate é rede, não conserto.
3. **Se chamar `CSMShadowNode.updateBefore` por nós é idempotente.** A leitura
   diz que sim; `updateFrustums`/`_initCascades` têm estado e isso não foi
   provado.
4. **Se o `GPUTexture` da `ShadowDepthTexture` chega a existir** quando o
   `three` nunca renderiza nela.
5. **Quanto o C++ vai custar.** O teto de 5,60 ms é do `three`. Os 2,2 µs/draw
   vêm de um spike isolado, e os 34 µs/draw do M5 **não se reproduziram**. A
   folga de 2,6 ms é plausível, **não medida**.

## E1, E2 e E3 EXECUTADOS em 2026-09-22 — o gate recusa o kart-racer por 2 nós

### O que foi construído

- **E1 — `material.visible` por frame.** Era o mesmo erro do `visible` do
  objeto corrigido no passo 1: o valor era fotografado no `build` e nunca mais
  olhado, enquanto o `three` o reavalia em toda travessia. O slot 11 do buffer
  de sincronização virou um **campo de bits** (`SyncFlag`: `kSyncVisible`,
  `kSyncMaterialVisible`), então o estado novo entrou **sem alargar a linha**
  nem renumerar o layout. `kNodeDrawable` passou a significar só o que não
  muda — malha com geometria.
- **E2 — `src/render/CasterGeometryRegistry.ts`.** Registra a geometria de
  **todas** as malhas da cena, não só as do caminho `?nativePass=N`. Três
  cuidados: registro **preguiçoso** (os `GPUBuffer` são do `three` e só existem
  depois do upload, então quem falha é tentado de novo nos frames seguintes);
  **invalidação** no `dispose` da `BufferGeometry` — seguro com folga, porque o
  `destroy` de buffer do host é adiado em 10 frames (ADR-0153); e registro **por
  geometria**, não por malha (as quatro rodas de um carro compartilham uma
  `BufferGeometry`). A varredura é deliberadamente larga e **não olha
  `castShadow`**: o filtro angular liga e desliga esse campo a cada 10 frames, e
  restringir ali deixaria de fora justamente a malha que volta a projetar no
  frame seguinte.
- **E3 — `native/src/scene/shadow_pass_gate.{h,cpp}`.** Unidade PURA que
  responde se o passe nativo pode assumir o frame. A consulta ao
  `GeometryRegistry` entra por **ponteiro de função**, porque o registro arrasta
  `webgpu.h` e depender dele tiraria o gate do `cortex_host_tests`. O veredito
  traz o motivo, a contagem por motivo (todos, não só o primeiro) e os casters
  recusados; o log por `debug('perf', …)` sai só quando o veredito **muda**.
  Ligado por `?gateSombra=1`, separado do `?contarCasters=1` — a sonda de
  `renderObject` daquele é cara demais para ficar ligada junto.

`NodeFlag` passou de 8 para **16 bits**: os motivos de recusa levaram a lista a
nove bits, e estourar em silêncio faria o gate **aceitar** um caster que devia
recusar — a falha exatamente na direção errada.

### O veredito no kart-racer: RECUSA, por divergência de nós, em 2 objetos

`?bench&hold&gateSombra=1`, 90 s, host recompilado:

```
[casterGeometry] registradas=148 pendentes=44
[shadowGate] RECUSA motivo=divergencia-de-nos objetos=2 casters=66
             recusados=0 geometrias=148 pendentes=44 [divergencia-de-nos=2]
```

O número é **informação de projeto, não falha**. O que ele diz:

| fato | valor | leitura |
| --- | --- | --- |
| casters enumerados | **66** | o mesmo alvo do passo 1 |
| casters recusados por condição própria | **0** | nenhum skinado, instanced, material em array, recorte alfa ou `positionNode` entre os casters |
| geometria ausente entre os casters | **0** | o registro preguiçoso cobriu todos |
| divergência cena × espelho | **2** | os mesmos 2 nós medidos no passo 1 (977 × 975) |

**A única coisa entre o kart-racer e o passe nativo são os 2 nós que a cena
ganha depois do `install`.** Todo o resto do gate passa. Isso reordena o que
falta: identificar quem cria esses 2 nós deixa de ser "rede, não conserto" (o
que ainda não se sabe, item 2) e passa a ser **o bloqueio único** do E6.

As 44 geometrias que ficam pendentes são malhas que o `three` nunca desenhou, e
portanto nunca subiu — nenhuma delas pertence a um caster, senão
`geometria-ausente` não seria 0.

### A enumeração continua batendo com o `three` depois do E1

`?bench&hold&contarCasters=1`, mesma build: **2.994 amostras, 2.939 idênticas**.
As 55 restantes são todas `66 vs 0` — frames em que a sonda ainda não tinha
draws do frame anterior para reportar, não divergência do enumerador.
Descontadas essas, **2.939/2.939 (100%)**, 66 × 66.

### Testes

- Harness C++ (`cortex_host_tests`): **266 checks, 0 falhas** — cada condição do
  gate isolada (skinned, instanced, material em array, recorte alfa,
  `positionNode`, geometria ausente, registro inexistente, divergência nas duas
  direções e sem caster nenhum, VSM), mais prioridade entre motivos, contagem
  por motivo e `material.visible` chegando pelo frame e pelo `build`.
- Vitest: **1.541 passando, 7 pulados, 0 falhas**.

> Um erro pego pela própria medição: a primeira rodada relatou `casters=0
> recusados=66`, aritmeticamente impossível. Causa: `kShadowGateRefusalCount`
> estava em 8 para um enum de 9 valores, então a contagem do último motivo caía
> **fora** do array, em cima do campo seguinte — e o `cortex_host.exe` usado
> naquela rodada fora compilado antes da correção. Vale como caso de resposta
> conhecida: um relato internamente contraditório é o sinal barato de que o
> instrumento está errado.

### O que fica para o E4 e o E5

1. **E4** — preparo por frame em JS: `updateBefore` do CSM → `updateMatrices`
   por cascata → viewProj em `Float64Array`, nunca `Float32`.
2. **E5** — o passe depth-only em C++, com **`cullMode = Front`** (o `three`
   inverte o lado da face no passe de sombra).
3. O `sceneNodeCount` que alimenta o gate é medido no intervalo do culling (10
   frames), não por frame, porque percorrer ~1.300 nós é o custo que o marco
   quer eliminar. Um nó criado entre duas contagens só aparece para o gate até
   10 frames depois — aceitável enquanto o `three` ainda desenha a sombra, e
   coisa que o **E6** precisa resolver antes de desligá-lo.
4. `?gateSombra=1` e `?contarCasters=1` continuam TEMPORÁRIOS e saem no E8.

## E6 — o espelho e os nós que nascem depois (2026-09-22)

### Os 2 nós estáveis são do `three`, não do jogo

São os placeholders de cascata do CSM: `CSMShadowNode.updateBefore` faz
`parent.add(lwLight.target); parent.add(lwLight)` quando `lwLight.parent` é
nulo — 2 por cascata, e o kart-racer usa 1. `LwLight extends Object3D`, sem
geometria; um deles tem `castShadow = true`, que é marcação do `three`, não
intenção de desenhar.

### A janela de aceite existe, mas não pela causa que se supôs

Não há frame com a divergência "não conferida": o bloco do culling dispara no
primeiro frame de câmera perspectiva e grava a contagem **antes** do gate. O
problema é outro e é pior: os `lwLight` são adicionados **dentro** de
`super.updateBefore`, que roda **depois** da contagem. A primeira contagem vê
975 = 975 e o gate **aceita**; a divergência só aparece 10 frames depois.
**A conferência é feita antes da mutação que ela deveria pegar.**

### O crescimento da cena tem teto — e o míssil é caster por transitório

Os visuais de kart (escudo, faíscas, chama) são criados por
`shieldTime > 0 || drifting || boostTime > 0` e **nunca removidos** (a única
remoção está no `dispose`; o `reset` só faz `visible = false`). Mas o total é
**limitado**: `4 + escapamentos × (4|5)` por carro, uma vez só. O que nasce e
morre sem parar são os *hazards* (óleo, projétil), que cabem num pool.

O projétil tem `castShadow` autorado, e o `missile.glb` tem **4 primitives** —
4 malhas casters, não uma. Medidos os raios do glb, só a primitive 1
(raio 1,1665, razão 0,159 a 7,34 m) passa o `shadowCasterMinRatio: 0.15`, com
6% de margem, e sai da faixa em 7,78 m — cerca de um frame a 42 m/s.

**Mas o motivo de ele projetar sombra é outro:** entre o nascimento e a
primeira passada do `cullShadowCasters` (a cada 10 frames), `castShadow` fica
no valor **autorado**. O míssil projeta sombra por **até 10 frames, com filtro
ou sem ele**. O estado estável é desligado; o transitório é ligado — o inverso
do que se havia registrado.

Os demais efeitos nascem com `castShadow` default `false` e nunca projetam.

### Por que "espelho que cresce por rebuild" foi descartado

1. **A detecção proposta tinha o mesmo defeito da rival.** Marcar no `install`
   e contar não-marcados roda **na mesma travessia amortizada de 10 frames**.
   Nos ≤10 frames em que o míssil é caster novo, as duas aceitam igualmente. E
   promover essa travessia a por-frame é percorrer ~1.300 nós — exatamente o
   custo que o marco existe para eliminar.
2. **O rebuild não é só caro: é `use-after-free` silencioso.** `install()` não
   tem caminho de rebuild, `SceneMirror::build` faz `resize`/`assign` em onze
   vetores (o `worldData()` muda de endereço), e o external ArrayBuffer é
   criado **sem finalizer**, de propósito. O próprio header avisa: *"o vetor
   não pode realocar enquanto o JS segura o buffer"*. Qualquer `Object3D` não
   reapontado fica com `matrixWorld.elements` sobre memória liberada — e a
   SPEC-0234 registra que erro nessa fronteira aparece como artefato visual,
   não como exceção.
3. **Não há medição de rebuild no repo.** Os 0,023 ms da SPEC-0233/0234 são
   travessia+culling em C++, não rebuild.

### A saída

1. **Detecção por evento.** O `three` dispara `childadded`/`childremoved` no
   pai, e o dispatch é early-return quando não há listener — custo zero para
   quem não escuta. Instalando o listener nos nós espelhados durante o
   `install`, o gate sabe da mutação **no frame em que ela acontece**, O(1) por
   evento. É a **única** forma que fecha a janela dos 10 frames: nem contagem
   de nós nem contagem de casters fecham.
2. **Capacidade reservada, não rebuild.** `reserve()` com folga nos vetores do
   `SceneMirror` antes do `build` faz o append não realocar: os `subarray` já
   entregues seguem válidos e só o nó novo precisa ser apontado. Rebuild vira
   exceção (estouro de capacidade), com invalidação explícita.
3. **Duas passes no mesmo mapa (`loadOp: load`): sim, mas só na forma estreita.**
   Serve para uma lista explícita de poucos nós efêmeros. **Não** serve na
   forma "o `three` desenha a sombra do resto": se ele volta a percorrer a cena
   e montar a RenderList, os 2,06 ms de `rpProject` ficam de pé, o teto cai de
   5,60 para ~3,5 ms e provavelmente fura o aceite de 3,0 ms. É a Forma A que o
   ADR-0235 já descartou.

### O que exige medição antes de virar código

- Custo do dispatch de `childadded` com ~1.000 listeners, e se algum caminho do
  `three` escapa do evento (`attach`, `clear`, `copy`, remoção em massa).
- Custo real de append com capacidade reservada.
- Se o míssil chega mesmo ao shadow map: a razão 0,159 está 6% acima do limiar
  e foi calculada do glb, não do `boundingSphere` que o `three` computa em
  runtime com a escala do nó.
- Se o depth sobrevive entre a pass nativa e a pass dos efêmeros **na
  `ShadowDepthTexture` real** — a SPEC-0242 provou num alvo sintético, e
  extrapolar entre os dois é o erro que custou dois dias no M5.

## E4, E5 e E6-parcial EXECUTADOS em 2026-09-22 — o M6 entrega 2,8 ms, abaixo dos 3,0

### O que foi construído

- **E5 — `native/src/render/shadow_pass.{h,cpp}`.** Passe depth-only em C++.
  Derivado do `native_pass.cpp` do M5, com as três diferenças que a
  investigação do passo 2 tinha previsto: **sem attachment de cor**
  (`colorAttachmentCount = 0`, e sem estágio de fragmento no pipeline — um
  fragmento que não escreve nada custaria uma invocação por pixel coberto);
  **`cullMode = Front`**, porque o `three` inverte o lado da face no passe de
  sombra; e `depthClearValue = 1.0`, `depthCompare = Less`, `depthWrite = true`.
  A view da textura é criada e liberada **por chamada**, nunca cacheada: a
  textura é recriada quando o `mapSize` muda.
- **`native/src/render/shadow_math.h`.** `viewProj × model` em `double`, com a
  conversão para `float` **só no resultado**. Vive num header próprio, sem
  wgpu, para o harness conseguir exercitá-lo — uma matriz errada aqui não daria
  erro, daria sombra no lugar errado.
- **Ponte: `__cortexSceneMirror.drawShadowPass(...)`.** Uma travessia por
  cascata por frame faz tudo o que o `three` fazia por objeto: enumera os
  casters (passo 1), passa pelo gate (E3) e desenha. O `viewProj` atravessa em
  `Float64Array`. O alvo é o `GPUTexture` de `shadow.map.depthTexture`, obtido
  por **identidade do objeto** (`backend.get(...)`) e **reaquirido por frame**;
  o rótulo `'ShadowDepthTexture'` entra só como **asserção**. A heurística
  `cenaAlvo()` de `commands.cpp` não é usada.
- **E4 — preparo por frame**, em `CameraFollowingCSM.updateBefore`, depois do
  `super.updateBefore`: `shadow.updateMatrices(cascata)` **por cascata**
  (obrigatório — com o passe do `three` desligado, ninguém mais chama isso e o
  uniforme `lightShadowMatrix` congela, prendendo a sombra ao mundo de um frame
  antigo), `viewProj` em `Float64Array`, e a chamada do passe.
- **E6 (parcial) — `autoUpdate = false` por cascata**, aplicado **depois** do
  desenho e só quando ele deu certo. Um frame em que o nativo recusa devolve
  `autoUpdate = true` e o `three` redesenha: a falha é para o lado seguro.
- **`?passeDeSombraNativo=1`** liga o passe; **`?forcarPasseDeSombra=1`** é o
  ATALHO DE MEDIÇÃO que ignora a recusa por `divergencia-de-nos` — e **só**
  ela, garantido por `refusalIsOnlyNodeDivergence`, que devolve `false` se
  qualquer outro motivo tiver contagem. Não pode virar padrão.

> **Desvio do plano, deliberado.** O E4 estava escrito para o `Game.ts`, depois
> do `sceneMirror.update(camera)`. Ficou em `CameraFollowingCSM.updateBefore`,
> depois do `super`, porque ali as quatro condições já estão satisfeitas — as
> matrizes de mundo do frame já foram propagadas, as cascatas já foram
> posicionadas pelo `super`, a cena/renderer/câmera estão em mãos e o desenho
> acontece antes da pass principal do frame. Fazer no `Game.ts` exigiria
> **chamar `csm.updateBefore` à mão**, e a idempotência disso é o item 3 da
> lista "o que ainda não se sabe" desta spec — trocar um desvio conhecido por
> um risco não medido não valia.

### A imagem: 0,125% dos pixels, nenhum acima de 28 níveis

Harness da SPEC-0240, `?bench&hold`, 32 pares por comparação, janela oculta.

**O instrumento foi validado antes, e a primeira tentativa acusou ruído.** Com
o export `--debug`, duas rodadas do MESMO caminho divergiram em 0,058% dos
pixels, com pico de 194. A caixa dos pixels divergentes é `x 52..167`,
`y 942..1052` — o **HUD de métricas**, que o `--debug` liga e cujo texto de
FPS/ms muda a cada rodada. O piso de ruído zero da SPEC-0240 **só vale sem o
HUD**. Refeito com um export sem `--debug`, o controle voltou a **0,000000%,
`maxChannelDiff = 0`** em 32 pares.

| comparação | `maxChannelDiff` | `pct` acima do piso 0 |
| --- | --- | --- |
| `three` × `three` (controle, sem HUD) | **0** | **0,000000%** |
| `three` × nativo | **28** | **0,124662%** |
| referência: deslocamento de câmera de 1e-4 m (SPEC-0240) | 109 | 0,443769% |

Todos os 2.073.600 pixels caem na primeira faixa do histograma (`[0, 31]`):
**nenhum pixel difere mais de 28 níveis em canal nenhum**. A curva por piso:
0,034% acima de 4, 0,012% acima de 8, 0,0035% acima de 16, 0,00015% acima de 24.

Os pixels divergentes são **localizados**, não espalhados: a caixa é
`x 0..406`, `y 77..238` — a folhagem dos ipês distantes e o arco da ponte, na
borda da auto-sombra. Ampliado 8×, o diff da tela inteira é praticamente preto.
**Nenhuma sombra falta e nenhuma banda aparece** — uma sombra ausente produziria
diferenças de 100+ em área larga, como a referência do deslocamento de câmera
mostra.

**Limiar proposto para caminho-contra-caminho** (a SPEC-0240 registra que o
`delta = 0` não serve aqui, e não arbitra número):
`RENDER_PARITY_CROSSPATH_CHANNEL_DELTA = 32` com `MAX_OUTLIER_PCT = 0%` — ou
seja, "nenhum pixel pode diferir mais que 31 níveis". Sai do medido (o pior foi
28, e 32 é a borda da primeira faixa do histograma), é estrito o bastante para
pegar sombra faltando ou deslocada numa borda de contraste (a referência
legítima já bate 109) e **não** é um número de compromisso. Vale para esta cena
e esta máquina; recalibrar é trabalho manual, como a SPEC-0240 registra.

**A causa da diferença residual não foi isolada.** Dois candidatos, nenhum
medido: (1) precisão do MVP — o nosso é composto em `double`, o do `three` passa
por `modelViewMatrix` em `float32`, então parte da diferença pode ser o nativo
estar **mais** certo; (2) materiais `DoubleSide` entre os casters — o `three`
mapeia `DoubleSide → DoubleSide` no passe de sombra (sem culling) e o passe
nativo culla `Front` em todo mundo, o que muda a face que escreve profundidade
numa malha aberta. O espelho não guarda o `side` do material, então hoje isso
não é nem reproduzível nem recusável. **Fica como pendência do E7.**

### O ganho: 2,8 ms medidos, contra um critério de 3,0 ms

`?bench&hold`, mesma build, seis rodadas **intercaladas** (base, nativo, base,
nativo…) de 70 s cada, medianas de ~119 amostras por rodada, só amostras da
cena da pista.

| rodada | base | nativo | delta |
| --- | --- | --- | --- |
| 1 | 14,3 | 10,6 | 3,7 |
| 2 | 13,1 | 10,4 | 2,7 |
| 3 | 13,8 | 10,3 | 3,5 |
| 4 | 13,5 | 10,6 | 2,9 |
| 5 | 13,2 | 10,8 | 2,4 |
| 6 | 13,0 | 10,4 | 2,6 |
| **mediana** | **13,35** | **10,50** | **2,8** |

Teto (`?semPasseDeSombra=1`, duas rodadas): **9,7 ms** nas duas — o passe do
`three` custa **3,65 ms** nesta metodologia, e o passe nativo custa **0,8 ms**.

`fps` mediano: **63 → 75** (+19%).

Com `?renderPhases=1` ligado, a decomposição:

| fase | base | nativo | teto |
| --- | --- | --- | --- |
| `render` | 13,4 | 10,8 | 9,9 |
| `rpProject` | 2,627 | 1,574 | 1,566 |
| `rpObjects` | 8,988 | 7,325 | 6,472 |
| `rpCallsProject` | **4** | **3** | **3** |
| `draws` | **261** | **195** | **195** |

Duas confirmações independentes de que o `three` realmente parou de desenhar a
sombra: `rpCallsProject` cai de 4 para 3, e `draws` cai de 261 para 195 — **66
exatos**, o mesmo número que o passo 1 enumerou. E `rpProject` do nativo é
igual ao do teto (1,574 × 1,566), enquanto `rpObjects` fica 0,85 ms acima: é ali
que o custo do passe nativo aparece.

### A mediana precisou de um filtro, e a falta dele deu um relato contraditório

A primeira rodada sem a sonda relatou o passe nativo **mais caro** que o
baseline (15,1 contra 12,6 ms) enquanto a rodada com a sonda relatava o
contrário (10,8 contra 13,4). Relato internamente contraditório é o sinal
barato de instrumento errado — e era.

O `perf-trace.jsonl` amostra desde o boot, então a mediana estava misturando
**duas cenas**: a de carregamento (`draws = 0`, `nodesTotal = 906`, câmera em
outro lugar) e a da pista (`draws = 261`, `nodesTotal = 977`). Quanto mais
tempo uma rodada passa carregando, mais a mediana escorrega para a população
errada. Descartar um número fixo de amostras iniciais **não** resolve: o tempo
de carga varia entre rodadas. O filtro que resolve é por **estado de cena**
(`draws >= 100`), e foi ele que fez as seis rodadas intercaladas concordarem.

### O teto de 5,60 ms desta spec NÃO se reproduz sem a sonda

O teto registrado acima era 5,60 ms, medido **com `?renderPhases=1`**. Sem a
sonda o mesmo isolamento dá **3,65 ms**. A spec já avisava que os absolutos com
a sonda não valem; o que não estava previsto é que o **delta** também não vale:
a sonda embrulha `_projectObject` e `renderObjects`, que o passe de sombra
chama dezenas de vezes por frame, então ela **amplifica justamente a fatia que
o isolamento remove**. Um delta medido com a sonda superestima o que a remoção
vale de verdade.

Consequência direta: **o marco nunca teve 2,6 ms de folga.** O teto real é 3,65
ms contra um critério de 3,0 — 0,65 ms de folga —, e o passe nativo consome 0,8
ms dela.

### Veredito do M6: 2,8 ms — não atinge os 3,0 ms

O passe nativo funciona, a imagem é indistinguível pelo limiar proposto, o
`three` comprovadamente parou de desenhar a sombra e o ganho é real (+19% de
fps). Mas o número é **2,8 ms**, abaixo do mínimo de 3,0 que este marco fixou, e
o que ainda dá para ganhar **dentro** do passe de sombra é 0,8 ms.

Para cruzar os 3,0 ms o ganho teria de vir de **fora** do passe: o **E7**
(trabalho órfão) é o único candidato com custo identificado — com o nativo
enumerando e filtrando por conta, o `cullShadowCasters` em JS percorre ~1.300
nós a cada 10 frames para mutar um `castShadow` que ninguém mais lê. Pela
travessia medida na SPEC-0234 (~1,4 ms para 1.300 nós em JS), isso vale ~0,14
ms/frame amortizado — **não basta sozinho**.

### Testes

- Harness C++ (`cortex_host_tests`): **301 checks, 0 falhas** (eram 266) — o
  atalho de medição nas quatro combinações (divergência sozinha, divergência
  com outro motivo junto, frame aceito, outro motivo sozinho) e a matriz do
  passe (identidade, não-comutatividade, ponto de resposta conhecida, precisão
  a 800 m da origem).
- Vitest: **1.541 passando, 7 pulados, 0 falhas**.

### O que fica em aberto

1. **O atalho `?forcarPasseDeSombra=1` é temporário** e não pode virar padrão.
   Sem ele o gate segue recusando o kart-racer por 2 nós, que é o comportamento
   correto enquanto a divergência não for resolvida por evento (E6).
2. **`side` do material não é espelhado**, então caster `DoubleSide` não é nem
   reproduzido nem recusado — candidato à diferença residual da imagem.
3. **E7** — trabalho órfão (`cullShadowCasters`, sort do shadow pass) — e
   **E8** — remover `?contarCasters=1`, `?gateSombra=1` e os diagnósticos.
4. O `shadowMap.setSize` deixa de rodar com o passe do `three` desligado: mudar
   `shadow.mapSize` em runtime não redimensiona mais nada.
