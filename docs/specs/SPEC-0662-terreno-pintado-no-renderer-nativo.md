# SPEC-0662 — Terreno pintado no renderer nativo (`terrainSplat`)

**Data:** 2026-11-02
**Status:** implementado

## Como ficou

- Galeria (`check-stage … --flag '&nativeRenderer=1'`): **PASS 0/0 (0,0000%)** com a esfera `terrain-splat`;
  pipeline `wgsl:cortexTerrainSplat|fog+receiveShadow+splat` nascido. Prova `&nativeTint=1`: FAIL 66,6%.
- DDD 00 no export: censo com **0 recusados** (eram 28 tiles de terreno). Os tempos dessa rodada não
  entram na comparação: a cópia de sonda rodou com o GC no limite (562 coletas completas em 6,5 s de trace).

## Contexto

Depois da SPEC-0659, as únicas recusas do renderer nativo no DDD 00 são os 28 tiles de terreno
(`refused:node:colorNode`): o `Terrain` pintado troca a cor do `MeshStandardNodeMaterial` por um nó TSL
de splat (até 4 camadas misturadas pelos pesos de um splatmap). Esses tiles caem no three em JS, e o
`sceneRender` ainda custa 20–40 ms por quadro só por causa deles, num quadro cuja meta é 33 ms.

### Como o Godot faz

No Godot não existe caminho lento por material: todo material vira shader. O `StandardMaterial3D` gera o
código a partir de uma chave de features e guarda num cache (`scene/resources/material.cpp:656`, `:661`,
`:668-681`). Shader customizado passa pelo mesmo compilador e vira uma "version"
(`scene_shader_forward_clustered.cpp:177`, `:234`), e os pipelines ficam num cache por chave
(`pipeline_hash_map_rd.h:110`). Aqui o equivalente direto é o mecanismo de material do jogo da R1.5
(SPEC-0565): um modelo nativo com WGSL próprio, ligado por `userData.nativeMaterial`. O cache de pipeline
por variante já existe no core. O ubershader do Godot (`render_forward_clustered.cpp:488-531`) não é
necessário: o terreno tem uma variante só por combinação de features.

## Decisão

1. **`buildTerrainSplatMaterial(splat)`** (`src/scene/terrainSplatMaterial.ts`): monta o material TSL que o
   `Terrain` usava (mesmo grafo de nós) e o marca com `userData.nativeMaterial = 'cortexTerrainSplat'`. As
   referências ao splat, às camadas e ao tiling (nós, com `.value` ao vivo) ficam num `WeakMap` do modelo,
   e não no `userData`, para não irem ao JSON do material. O `Terrain.ensurePaint` passa a usar o
   construtor, e a galeria de paridade também.
2. **Modelo `terrainSplat`** (`src/render/native/models/terrainSplat.ts`), registrado como material do
   jogo: a cor difusa segue a ordem do WGSL que o three 0.184 gera (dump do DDD 00): camadas em
   `uv * repeat`, splat em `uv`, `mix(cor, Σ camada·peso / max(Σpeso, 1e-4), clamp(Σpeso, 0, 1))` e alfa 1.
   Iluminação, sombra e névoa são as do `standard`.
3. **`standard.ts`**: o WGSL vira `standardWgsl(variant, extras)`, e `extras` acrescenta campos ao `Params`,
   texturas antes do DFG e o bloco da cor difusa. Os parâmetros viram `writeStandardParams`. O
   `litSurfaceWgsl` aceita trocar o bloco da cor base. A feature `splat` pede o atributo uv.
4. Troca de splatmap por tamanho (`setPaint` com outro tamanho) marca `needsUpdate` no material, porque o
   renderer nativo relê as texturas pela versão do material. As camadas não precisam disso: o
   `terrainLayerTexture` devolve o `Texture` na hora, e a imagem que chega depois sobe o `texture.version`.

## Aceite

- `tests/render/native/terrainSplat.test.ts`: classificação para o modelo do jogo, variante com uv, ordem
  das texturas lidas dos nós, `layerRepeat` e o blend no WGSL.
- Paridade da galeria com a esfera `terrain-splat` (`check-stage --flag '&nativeRenderer=1'`) e a prova
  `&nativeTint=1`.
- Censo do DDD 00 sem `refused:node:colorNode` dos tiles de terreno e o `sceneRender` medido de novo.

## Consequências

- O terreno pintado deixa de passar pelo three em JS no export. Sem recusas, o `sceneRender` fica só com o
  custo fixo do three (UI e passes que ele ainda faz).
- Material de splat feito fora do `buildTerrainSplatMaterial` continua recusado (`node:colorNode`).
