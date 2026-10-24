# SPEC-0505 — R0 do renderer nativo: censo, WGSL de referência, galeria e linha de base

**Data:** 2026-10-24
**Status:** **implementado e medido** (2026-10-24) — critério de aceite atingido; ver "Resultado"

Marco R0 do PRD-0466 (ADR-0465). Só instrumentos: nada muda no render. O R0 diz, para o
DDD 61, quanto o renderer próprio precisa cobrir, de onde vem a fórmula de cada modelo e
qual é o controle de todos os marcos.

## Como o Godot faz

- **Código gerado de um material padrão é visível e reutilizável:** o editor converte um
  `StandardMaterial3D` em `ShaderMaterial` lendo o código que o servidor gerou
  (`editor/scene/material_editor_plugin.cpp:57-66` → `RS::shader_get_code`,
  `servers/rendering/storage/material_storage.h:65`). É a mesma ideia do nosso WGSL de
  referência: a fórmula do material "pronto" é a fonte do material próprio.
- **Contadores do servidor por quadro** (`RenderingServerDefault::get_rendering_info`,
  `servers/rendering/rendering_server_default.cpp:307` → `storage_rd/utilities.cpp:304`;
  preenchidos na lista em `render_forward_clustered.cpp:806`): objetos, draws e primitivas
  por tipo. O censo é o equivalente para "quantos objetos o renderer próprio levaria e por
  que recusa o resto".

## Como fazemos aqui

- `src/render/MaterialDesc.ts` classifica standard/unlit/toon/outline só para telemetria
  (`measureCoverage` no `PerfTrace`), com o tipo exato e sem Lambert, Physical, normalMap nem
  alphaTest. Não diz o motivo por objeto nem conta por classe.
- O WGSL de cada estado de shader existe no `three` 0.184:
  `renderer._nodes.nodeBuilderCache` (`three/src/renderers/common/nodes/NodeManager.js:62`)
  guarda um `NodeBuilderState` por chave, com `vertexShader`/`fragmentShader`
  (`NodeBuilderState.js:35-42`), criado em `getForRender` (`NodeManager.js:184`).
- Paridade: `render-parity.mjs` compara capturas; nunca foi validado numa cena de resposta
  conhecida fora do jogo.

## Validação de aplicabilidade

Tudo é JS de instrumento, desligado por padrão, mais um projeto de fixture. Nada de C++
novo, nada no Studio, nada no caminho quente sem a query. Hermes: varredura a cada
`CENSUS_PERIOD_MS`, não por quadro.

## Comportamento

### 1. Classificador (`src/render/native/RendererClassifier.ts`, puro)

`classifyDrawable(object, material)` → `{ model, features[] }` ou `{ refuse: motivo }`, pelas
regras do ADR-0465 §3:

- **tipo de objeto:** `Mesh` / `SkinnedMesh` / `InstancedMesh` aceitos; `Points`, `Line*`,
  `Sprite` → recusa `kind:<tipo>`; material em array → `materialArray`.
- **modelo pelo tipo do material** (família `*NodeMaterial` incluída): Basic → `unlit`, Lambert
  → `lambert`, Standard → `standard`, Physical → `standard` **só** sem clearcoat, sheen,
  transmission, iridescence, anisotropy e dispersion (senão recusa `physical:<campo>`), Toon →
  `toon`, casca de contorno da engine (`OUTLINE_THICKNESS_KEY`) → `outline`,
  `userData.nativeMaterial` → `wgsl:<nome>`. Outro tipo → `type:<tipo>`.
- **nós TSL** (`colorNode`, `positionNode`, …) sem `nativeMaterial` → recusa `node:<prop>`
  (a casca de contorno é a exceção conhecida).
- **mapas que nenhum modelo cobre:** `envMap` no material, `alphaMap`, `lightMap`, `aoMap`,
  `bumpMap`, `displacementMap`, `specularMap` → recusa `map:<nome>`. `wireframe` → recusa
  (entra no R3b). `onBeforeRender` próprio → recusa `onBeforeRender`. Morph → recusa `morph`.
- **features** (não recusam): `map`, `normalMap`, `metalRoughMap`, `emissiveMap`,
  `vertexColors`, `alphaTest`, `transparent`, `additive`, `doubleSide`, `fog`, `noToneMap`,
  `uvTransform`, `skinned`, `instanced`, `instanceColor`, `receiveShadow`, `polygonOffset`,
  `noDepthWrite`, `renderOrder`. `colorWrite` falso → classe `skip` (não desenha).

A classe é `modelo` + features ordenadas (`lambert+fog+map+receiveShadow+vertexColors`).

### 2. Censo (`?rendererCensus=1`, só no host)

A cada `CENSUS_PERIOD_MS` (5 s), varre a cena do jogo: objetos desenháveis com visibilidade
herdada e esfera no frustum da câmera. Grava no perf-trace (`recordEvent`):

- `rendererCensus`: `objects`, `covered`, `refused`, `skip`, e as classes e os motivos de
  recusa com contagem (texto `classe=n;…`, ordenado por contagem);
- `rendererCensusMaterial`, uma vez por material novo: classe, tipo, nome e motivo.

O relatório de um trace sai por `native/scripts/perf/census-report.mjs <trace>…`: cobertura
por ponto e as N maiores classes e recusas.

### 3. WGSL de referência (`?wgslDump=1`, só no host)

Embrulha `renderer._nodes.getForRender`: na primeira vez que um `NodeBuilderState` aparece,
grava `wgsl-NNNN.txt` na pasta do jogo (`__cortexWriteBaseFile`) com um cabeçalho (classe do
classificador, tipo e nome do material) e os shaders de vértice e de fragmento. Estados com
o mesmo texto exato são gravados uma vez. A comparação entre estados é por texto
**normalizado** no consumidor (R1.x), nunca por hash (o hash do WGSL do `three` não é
estável — lição da SPEC-0475).

### 4. Galeria de materiais (`native/fixtures/material-gallery/`)

Projeto mínimo exportável (`main.ts` + `cortex.json`): câmera fixa, sem animação, luz
direcional com sombra + hemisfério + uma spot, névoa linear, e uma esfera por classe que os
4 jogos usam nos modelos `unlit`, `lambert`, `standard`, `toon` e `outline` (texturas geradas
em `DataTexture`, sem asset). `?galleryPlant=1` muda a cor de **uma** esfera em
`GALLERY_PLANT_DELTA` (8/255 linear no vermelho; 2/255 saía como 1 depois do tone mapping e do sRGB e sumia abaixo do piso de ruído): é a diferença plantada que valida o comparador.

Captura: `native/scripts/perf/gallery-capture.sh <exportDir> <outDir> [query]`, sob o lock,
com `CORTEX_RENDER_PARITY_CAPTURE` (o host sai sozinho depois da captura).

### 5. Linha de base

Export release da main (engine desta branch, que só soma instrumentos desligados) e jogo
`e2be01c`. `ab.sh` A/A (o mesmo export nos dois braços), 1 réplica, autopiloto:

- `walk` em `setorO centro comercial ac`, em **1920×1080**, a única resolução de medição (decisão do usuário em 2026-10-24, SPEC-0515);
- `drive` em `helio`, em 1920×1080.

Mais uma rodada `walk` por ponto com `&rendererCensus=1&wgslDump=1` (censo e dump; não entra
na linha de base).

## Critério de aceite

- Censo do DDD 61 classifica **100%** dos objetos desenháveis visíveis nos 4 pontos (cada um
  numa classe ou numa recusa com motivo; `unclassified` = 0).
- Galeria: duas capturas sem plantio → `maxChannelDiff` no piso de ruído (N×N+2); com
  plantio → o comparador acusa a esfera plantada (pixels acima do ruído > 0, pior pixel dentro
  da esfera). Se não acusar, o instrumento está quebrado e o R0 não fecha.
- WGSL: ao menos um arquivo por modelo coberto que o DDD 61 usa.
- Linha de base registrada no PRD-0466, todas as rodadas VÁLIDAS.
- Vitest verde (classificador e relatório).

## Testes

- `tests/render/native/RendererClassifier.test.ts`: cada modelo, cada recusa com motivo,
  features, a exceção da casca de contorno, `colorWrite` falso = `skip`.
- `tests/native/censusReport.test.ts`: agregação de eventos de um trace sintético.

## Resultado (2026-10-24)

Engine `ea10181e` (+ instrumentos), host compilado na worktree, DDD 61 `e2be01c`, 1920×1080,
15 rodadas, **todas VÁLIDAS** (`.cortex/renderer-r0/`).

**Achado que invalidou a 1ª tentativa:** o host do checkout principal
(`native/build`, 2026-10-09) não tem `worldContactPairsWith` (SPEC-0393, 22/10); o export do
DDD 61 com ele morre no 1º tick (`TypeError` em `hasContact`, 0 amostras). Toda frente que
exporta precisa do host da própria worktree — é o que o `setup-worktree.sh` (SPEC-0525) garante.

### Censo (walk nos 4 pontos, drive no Helio; média por amostra de 5 s)

| ponto | objetos | cobertos | cobertura | `node:colorNode` | `colorNode+normalNode+positionNode` | skip |
| --- | --- | --- | --- | --- | --- | --- |
| Setor O | 136,8 | 121,0 | 89,1% | 13,8 | 1,0 | 1,0 |
| Centro | 132,1 | 115,1 | 87,8% | 14,0 | 2,0 | 1,0 |
| Comercial | 127,1 | 110,0 | 87,3% | 13,5 | 2,5 | 1,0 |
| Águas Claras | 102,1 | 87,1 | 85,3% | 14,0 | 1,0 | 0 |
| Helio (drive) | 114,4 | 98,2 | 86,6% | 14,2 | 1,0 | 1,0 |

`unclassified` = 0 por construção. Maiores classes cobertas (Setor O): `lambert+emissiveMap+fog+map`
20,6; `standard+fog+map` 14,0; `standard+doubleSide+fog+map` 13,7; `lambert+fog+vertexColors` 9,9;
`lambert+fog+instanced+map+receiveShadow` 9,0. As únicas recusas são nós TSL do jogo: as tintas
(`playerSkin`, `parkedCars`, `shopping-gente`) e o `peopleGpu` — o escopo do R1.5.

### WGSL de referência

64 estados de shader por ponto, com classe no cabeçalho: `unlit` 24, `lambert` 17, `standard` 13
por ponto, mais `ShadowMaterial` do `three` (4, profundidade do mapa de sombra — vira o passe de
sombra C++ no R1.3), `outputColorTransform` (1, saída do `three`), tintas TSL (4) e um
`MeshBasicMaterial` com `CustomBlending` fora da cena do jogo (1, a confirmar: provável UI de
runtime, R2).

### Galeria (caso de resposta conhecida)

A × A′: `maxChannelDiff` 0 em 1920×1080. Com `?galleryPlant=1` (8/255): o comparador acusa 0,80%
dos pixels, pior pixel na esfera plantada. Com 2/255 o plantio virava 1 depois do tone mapping e
sumia abaixo do `--delta 2` — por isso 8/255.

### Linha de base

Tabela no PRD-0466 ("Linha de base — medida no R0"). Ruído do A/A com 1 réplica: render até
0,87 ms, `% > 33 ms` até 6,5 pp.

## Riscos

| risco | cobertura |
| --- | --- |
| varredura do censo pesa e contamina a rodada | só com a query; a linha de base roda sem ela |
| embrulho do `getForRender` quebra num bump do `three` | instala recusando se o método não existir; só com a query |
| captura pega tela de carregamento (já mentiu uma vez) | a galeria não tem carregamento longo; o `CORTEX_RENDER_PARITY_CAPTURE_SKIP` pula o aquecimento, e o plantio prova que a cena capturada é a da galeria |
