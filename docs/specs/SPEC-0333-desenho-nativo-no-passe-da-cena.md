# SPEC-0333 — Desenho nativo dentro do passe da cena (etapa (b) do ADR-0330)

**Data:** 2026-10-09
**Status:** rascunho de desenho — nenhum código ainda

## Contexto

Depois da etapa (a) (SPEC-0332) o passe principal do DDD 61 ainda gasta
**~55 µs por draw** em JS no Hermes: `_nodes` 2,6–3,3 ms, `backend.draw`
1,0–1,4, `_objects.get` 0,9–1,1, `_pipelines` 0,6–0,8 (R2b). A SPEC-0331 mediu
que, para os 89% de render objects que reaproveitam o quadro anterior, quase
tudo isso é **verificação** — o `three` não tem dirty flag de material, então
descobrir que "nada mudou" custa comparar uniforms, ~30 campos de estado de
pipeline e reavaliar nós de objeto.

## As duas formas de desenhar em C++, e a escolhida

| | **(b1) shaders próprios** a partir da `MaterialDesc` (plano original do M5) | **(b2) reproduzir a receita do `three`** |
| --- | --- | --- |
| o que o C++ desenha | pipeline/WGSL escritos à mão a partir da descrição | o MESMO `GPURenderPipeline`, bind groups, vertex/index buffers e parâmetros que o `three` usou no último quadro em que desenhou o objeto |
| paridade visual | tem de reproduzir luzes, CSM, névoa, tone mapping, color space, contorno — semanas, e o modo de falha é imagem sutilmente errada | **por construção**: é o mesmo shader e o mesmo dado |
| o que precisa saber | material inteiro | só **se o objeto está limpo** (nada que o `three` refaria mudou) |
| risco principal | paridade | detecção de sujo incompleta → uniform velho na tela |

**Escolha: (b2).** O custo por draw de uma receita em C++ é o do spike do
ADR-0232 (2,2 µs com setPipeline/setBindGroup/draw), e a paridade deixa de ser
um projeto. O que sobra é um problema de **sujeira**, e esse problema a SPEC-0322
já resolveu uma vez para transform: gancho na escrita.

## Desenho

1. **Gravação.** Quando o `three` desenha um render object pelo caminho normal
   (`backend.draw`), o JS registra no host a receita: pipeline, bind groups
   (por índice), index buffer + formato, vertex buffers, `drawParams`. Uma
   travessia de ponte por objeto **só no quadro em que ele foi refeito** — o
   caso raro (`rpRefresh` ~15/quadro).
2. **Sujeira de material (o que falta hoje).** Ganchos de escrita, no padrão
   dos de `position` (acessores compartilhados, sem closure por objeto), nas
   propriedades que o `NodeMaterialObserver` vigia (`refreshUniforms`) e nas de
   estado de pipeline (`transparent`, `side`, blend, depth, stencil…), mais
   `material.version` (o `needsUpdate`). Escrita = material sujo → todos os
   render objects dele voltam ao caminho do `three` naquele quadro (e são
   regravados). `Color`/`Vector2` vigiados recebem gancho nos componentes.
3. **Elegibilidade (recusa por objeto, nunca aproximação).** Fica no `three`:
   material com nó de update por quadro/render (`monitor.hasNode`/`hasAnimation`
   — UV scroll, emissivo animado, tempo), nó `onObjectUpdate` que não seja
   derivado só da matriz, `InstancedMesh` com `instanceMatrix` mudando, skinned,
   morph, `BatchedMesh`, transparentes (até a ordem ser validada por imagem),
   objeto que se moveu no quadro (o espelho sabe: `changedThisFrame`), e
   qualquer coisa que a gravação não reconheça.
4. **Uniformes de objeto.** Para objeto parado com câmera andando, os uniforms
   dependentes da câmera estão nos grupos COMPARTILHADOS (render/frame), que o
   `three` continua atualizando uma vez por render. A gravação confere isso: se
   o bind group de objeto contiver nó dependente de câmera, recusa.
   Conferido no `three` 0.184 (`ModelNode.js`): o `modelViewMatrix` padrão é
   `cameraViewMatrix` (grupo de render) × `modelWorldMatrix` (objeto),
   multiplicado **no shader**; `modelNormalMatrix` e `modelWorldMatrixInverse`
   derivam só da matriz de mundo. A lista branca de nós de objeto é, portanto,
   os escopos `WORLD_MATRIX`/`POSITION`/`SCALE`/`DIRECTION`/`RADIUS` do
   `ModelNode` mais esses dois uniforms; `VIEW_POSITION` e o
   `highpModelViewMatrix` (calculado em JS com a câmera) são recusa.
5. **Onde desenha.** Dentro do passe da cena do `three`, na ordem da RenderList:
   o `_renderObjects` envia ao host, numa chamada, a sequência de receitas
   limpas intercalada com os objetos que o `three` desenha — o host emite no
   MESMO `GPURenderPassEncoder` (o `currentPass` do contexto), preservando a
   ordem e a oclusão (lição da SPEC-0241: fora da pass não funciona).
6. **Estado do encoder.** O `currentSets` do `three` (pipeline/bind groups/
   buffers correntes) fica inválido depois de uma sequência nativa; o host
   devolve o estado final ou o JS zera o cache antes do próximo draw do `three`.

## Critérios de aceite

- `cpu.render` cai pelo menos 3 ms no setorO e no comercial (A/B intercalado,
  export release), sem regressão no hélio dirigindo.
- Captura A/B (`?nativeMainPass=0|1`) sem diferença acima do limiar nos três
  pontos, incluindo um material com UV scroll e um objeto que troca de material
  em runtime.
- Studio inalterado (sem ponte, sem gancho).

## Riscos

| risco | mitigação |
| --- | --- |
| propriedade vigiada sem gancho → uniform velho | lista derivada do `refreshUniforms` do `three` + teste que falha se o `three` ganhar propriedade nova |
| gancho custa leitura em todo acesso de material | acessores compartilhados (medido barato na SPEC-0322); só em materiais de objetos elegíveis |
| `currentSets` dessincronizado → bind group errado | invalidar o cache do `three` após cada sequência nativa; teste com intercalação |
| bump do `three` muda a forma da receita | instalação recusa (como `TransformOnlyRefresh`) se os internos não baterem |

## Passo 0 medido (2026-10-09) — a lista branca de nós de objeto barra TUDO

Sonda `?drawRecipeProbe=1` (`src/render/DrawRecipeProbe.ts`), export release
sobre a main `8c8eeb11` + SPEC-0332, setorO e comercial, média por quadro em
janelas de 300 quadros (primeiro motivo que bate conta):

| motivo | draws/quadro |
| --- | --- |
| **elegível** | **0** |
| refeito pelo `three` no quadro | 17–18 |
| moveu | 17–28 |
| tipo (instanciado/skinned/morph/batched) | 18 |
| transparente | 21–23 |
| **nó de update por objeto fora da lista branca** | **62–67** |

Os critérios de transformação, tipo e transparência deixam ~65 draws/quadro
candidatos — e **todos** caem no último filtro: os materiais do DDD 61 têm
pelo menos um nó de update `OBJECT` que não é `ModelNode` de matriz nem
`modelNormalMatrix`/`modelWorldMatrixInverse`. Antes de qualquer C++, o
próximo passo é **identificar esses nós** (tipo e origem — engine, jogo ou
`three`) e decidir, nó a nó, se derivam só da matriz (entram na lista) ou se
são estado de verdade (o objeto fica no `three`). Sem isso o teto da etapa (b)
é zero; com eles na lista, o teto é ~65 draws/quadro × ~50 µs ≈ 3 ms.

Note também que `moveu` (17–28) é alto para cena parada: são NPCs, carros e o
próprio jogador; e `transparente` (~21) entra na fila da etapa (c).

## Quais são os nós de objeto (sonda v2, 2026-10-09) — e o plano revisto

`?drawRecipeProbe=1` agora lista, por render object distinto, os nós `OBJECT`
fora da lista branca (setorO, ~58 draws/quadro nesse filtro):

| render objects | material | nós |
| --- | --- | --- |
| 42 | `MeshStandardMaterial` | `MaterialReferenceNode` color/emissive/emissiveIntensity/map/metalness/opacity/roughness, `ReferenceNode` color/near/far, `TextureNode`, `UniformGroupNode:object` |
| 52 | `MeshLambertMaterial` (3 variantes) | idem, sem metalness/roughness, às vezes `emissiveMap` |
| 11 | `MeshBasicMaterial` (2 variantes) | color/opacity/(map) + névoa |

Nenhum é exótico, e nenhum depende da câmera:

- `MaterialReferenceNode:*` (three) — copia `material[propriedade]` para o
  uniform em todo refresh. Depende só do **material**.
- `ReferenceNode:color/near/far` (three, `FogNode`) — a **névoa** da cena
  (`scene.fog`); o jogo a muda por horário em degraus (SPEC-0120 do jogo).
- `TextureNode` (three) — o uniform da textura; depende de `id`, `version` e
  da matriz (`offset`/`repeat`/`rotation`/`center`, é o UV scroll).
- `UniformGroupNode:object` — o próprio grupo; versionado, nada a vigiar.

**Todos derivam de estado que dá para conferir barato.** O que o `three` gasta
nos ~55 µs por draw não é o tamanho desse estado, é a verificação GENÉRICA
(`ChainMap`, chave dinâmica com hash, `equals` sobre a lista inteira, ~30 campos
de pipeline, `updateNode` em todos os nós, `_bindings._update` por objeto). A
SPEC-0331 rejeitou *memoizar* essa verificação; o que esta revisão faz é
**substituí-la** por uma verificação especializada no render object.

### Passo b.1 — desenho direto em JS (sem C++), `?cleanDraw=0|1`

`src/render/CleanDrawFastPath.ts` embrulha o `_renderObjectDirect` (o `three`
o relê a cada `render()`). Quando o `three` desenha um render object pelo
caminho normal, ele é **gravado** se for elegível: sem nó animado, plano do
`RenderIdRefresh` disponível, sem morph/skin/batch, e todo nó `OBJECT` é da
lista branca de matriz OU uma referência vigiável (material, `ReferenceNode`
com objeto fixo, `TextureNode`). A gravação guarda um **instantâneo numérico**
de tudo que esses nós leem, mais:

- matriz de mundo (16), `receiveShadow`, versão de `instanceMatrix`/
  `instanceColor` e `count` (instanciado elegível);
- geometria: id, ids e versões dos atributos e do índice, `drawRange`;
- os campos de estado de pipeline que o `needsRenderUpdate` compara
  (`transparent`, blend, depth, stencil, `side`, `alphaToCoverage`,
  `version`…) e `material.visible`;
- as chaves do contexto: `renderContext`, `lightsNode`, chave de ambiente
  (`_nodes.getCacheKey`), versão do `contextNode`, `clippingContext`, `passId`.

No quadro seguinte, se tudo bate, o desenho é **direto**: câmera/`drawRange`/
grupo no render object, `updateBefore`, os nós de render/quadro e os grupos
COMPARTILHADOS (câmera, luzes) — os mesmos do `RenderIdRefresh`, deduplicados
pelo próprio `three` —, marca o `renderId` do monitor e `backend.draw`. Se
qualquer coisa diverge, o caminho do `three` roda (e regrava).

Transparentes entram (o desenho acontece na posição da RenderList, então a
ordem é a do `three`; `DoubleSide` transparente chega como duas chamadas com
`passId` diferente e vira duas gravações). `InstancedMesh` entra com a versão
das matrizes vigiada. Skinned/morph/batched ficam no `three`.

**Teto (setorO):** ~58 elegíveis + ~22 transparentes + instanciados parados,
contra ~50 µs economizados por draw → **~3–4 ms**, menos o custo da conferência
(~3–5 µs/draw).

### Passo b.2 — o `backend.draw` em C++

Depois de b.1, o que sobra por draw direto é o `backend.draw` (~9 µs, a ponte
de setPipeline/setBindGroup/draw). A receita gravada vira handles nativos e
uma sequência contígua de draws diretos vai ao host numa chamada — o padrão
desta SPEC acima. Só vale medir depois de b.1.

## b.1 implementado e medido (2026-10-09)

`src/render/CleanDrawFastPath.ts`, `?cleanDraw=0|1` (padrão ligado no host,
`?nativeMainPass=0` também desliga). Três iterações medidas com a sonda de
fases (setorO, mesma build on × off) até o desenho direto valer a pena:

| versão | `rpEach` (próprio do wrapper) | `rpNodes` | `rpObjGet` | `render` on × off |
| --- | --- | --- | --- | --- |
| b3: instantâneo genérico (`number[]`, `pushValue` por campo) | 4,48 ms | 1,64 | 0,49 | **pior** (+0,45) |
| b5: cursor + conferência literal (`quickMatch`) | 2,53 | 1,54 | 0,46 | −0,50 |
| b7: + dedupe por `NodeBuilderState`/chamada + objeto que só se moveu | 3,04* | **0,42** | 0,27 | **−1,38** |

\* inclui os ~40 objetos/quadro que se movem (NPCs, carros, jogador), que
agora também saem do caminho do `three`: só os nós de objeto e o UBO deles
(o plano do ADR-0290), um `writeBuffer` cada.

**Armadilha medida:** no Hermes sem JIT a conferência genérica (laço por
campo com `obj[chave]` computada, `typeof`/despacho por valor, uma chamada
por número) custa mais do que a verificação do `three` que ela substitui. A
conferência tem de ser código LITERAL por campo (`quickMatch`), e o que é do
shader (`updateBefore`, nós de render) roda uma vez por `NodeBuilderState`
por chamada de `render()`, não uma por objeto.

### A/B (export release, mesma build, intercalado, 2 voltas × 3 pontos)

Main `518c9248` + SPEC-0332; 135 s por rodada (150 s no hélio dirigindo).

| ponto | quadro on | quadro off | render on | render off | µs/draw on | µs/draw off |
| --- | --- | --- | --- | --- | --- | --- |
| setorO | **17,5** | 20,3 | **9,1** | 10,2 | 60,8 | 69,3 |
| comercial | **20,6** | 21,0 | **9,7** | 10,4 | 78,9 | 86,1 |
| hélio (dirigindo) | **14,9** | 16,0 | **6,7** | 7,2 | 64,6 | 69,7 |

- **Ganho:** `render` −0,5 a −1,1 ms; quadro −0,4 a −2,8 ms (o resto do
  quadro também cai: menos GC de render objects e de chamadas). Sem
  regressão nas outras seções (`mirror`, `update`, `world` iguais).
- **Paridade:** `draws`/`tris` iguais entre os braços; capturas do setorO e do
  comercial idênticas (letreiros, névoa, árvores, NPCs andando, sombra,
  contorno, UI). Em regime: ~84% dos draws diretos (`diretos` × `three`),
  dos quais ~22% só se moveram; 28 render objects inelegíveis no total.
- **O que ainda custa por draw direto (~45 µs):** `backend.draw` (~9 µs, a
  ponte) e o próprio `three` montando a RenderList/`renderObject` em volta
  (`rpEach` ~3 ms/quadro). É o alvo do passo b.2 (receita + draw em C++).

### O que custaria cobrir o resto

- **Transparentes (~21/quadro):** já entram no b.1 (a ordem é a da
  RenderList; `DoubleSide` transparente = duas gravações por `passId`). No
  b.2 em C++ precisam de ordem por profundidade igual à do `three` (o sort
  já vem da etapa (a)) — custo pequeno, risco de imagem: validar por captura.
- **"tipo" (~18/quadro):** são `InstancedMesh` (entram no b.1 com a versão
  das matrizes vigiada, quando parados) e skinned (personagens). Skinned fica
  no `three`: o UBO de ossos muda todo quadro; cobrir exigiria levar o
  skinning para o C++ (meses — mesmo veredito do ADR-0237, "fora de escopo").
- **Refeitos (~17/quadro):** objetos com nó animado ou que mudaram de
  material no quadro — ficam no `three` por definição.

## b.2 implementado (2026-10-09) — aguardando A/B

- **C++:** `native/src/render/draw_batch.*` — a parte pura (`RecipeStore` e
  `replay`, com eliminação de estado redundante atrás de `DrawEmitter`, 4
  testes). Ponte em `native/src/shims/draw_batch_shim.*` (`__cortexDrawBatch`:
  `record`/`release`/`flush`, receita com `AddRef` dos handles).
- **JS:** `src/render/DrawBatch.ts`, ligado pelo `CleanDrawFastPath`
  (`?drawBatch=0|1`, padrão ligado no host).
  - A receita é (re)gravada a partir do que o `three` usou — só atravessa a
    ponte quando algum handle mudou.
  - O desenho direto acumula `[receita, count, instâncias, first]` e chama
    `info.update` (os contadores `draws` continuam iguais aos do `three`).
  - Despacho: antes de todo `backend.draw` do `three`, em `beginRender`,
    em `finishRender` e em troca de pass. Depois do despacho, o `currentSets`
    do `three` é zerado.
  - Grupo compartilhado recriado no quadro devolve o desenho ao `three`.
  - Indireto, stencil, oclusão, `ArrayCamera` e `BatchedMesh` não entram no lote.
- **Testes:** 6 do lote, mais a ordem com o `three` intercalado
  (`lote(a) → three(b) → lote(c) → fim`), mais 4 de C++.
- **A/B e captura:** pendentes — o `measure.lock` está ocupado desde 14:48
  pela rodada `soak-setorO` da R3b, sem processo vivo (lock órfão).
