# SPEC-0245 — Passe de sombra nativo (M6)

**Data:** 2026-09-22
**Status:** aceito — a executar (teto de 5,60 ms medido em 2026-09-22; ver o fim)

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
