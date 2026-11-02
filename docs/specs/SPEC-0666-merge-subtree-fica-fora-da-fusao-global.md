# SPEC-0666 — Malha do `mergeSubtree` fica fora da fusão estática global

**Data:** 2026-11-02
**Status:** implementado

## Contexto

O DDD 00 (Port Hollow) parte a cidade em células espaciais e funde cada célula com `mergeSubtree` (ADR-0005 do
jogo): uma malha por material **por célula**, para o frustum culling descartar o que está fora da vista.

No host nativo o `buildScene` roda depois a fusão estática global (`mergeStaticScene`, SPEC-0120), que agrupa por
material **a cena inteira**. As malhas do `mergeSubtree` não tinham a marca `cortexMergedStatic`, então a fusão
global juntava as células de novo: o mesmo material do mapa todo virava uma malha só (`static-merged-18` com
839 k triângulos e 1,3 M vértices). Com a bounding sphere cobrindo o mapa, o culling não descartava nada: os
~5 M triângulos do mapa iam à GPU todo quadro.

Medido no export (RX 6600, 1920×1080): passe principal 139 ms; sem a cidade, 19 ms. O custo não muda com a
resolução (126 ms a 960×540, 136 ms a 1080p com SSAA 2×) e cai só para 94 ms com fragment shader constante — é
volume de geometria, não de pixel.

## Decisão

`mergeSubtree` marca cada malha que cria com `userData.cortexMergedStatic = true`, a mesma marca que a fusão
global já usa para não refundir o próprio resultado. Quem chamou `mergeSubtree` escolheu a granularidade (um
modelo, uma célula); a fusão global respeita essa escolha.

A malha fundida continua sob a raiz do `mergeSubtree`, então as flags de física herdadas do ancestral
(`cortexRoad`, `cortexNoCollide`) continuam valendo sem cópia.

## Como o Godot faz

O Godot não funde a cena inteira por material. A unidade de culling é a instância: `RendererSceneCull` testa cada
instância contra o frustum num laço linear sobre arrays, e o agrupamento espacial é do autor (cenas/`MeshInstance3D`
por bloco, `visibility_range` para HLOD). Fusão de malhas (`MeshInstance3D` + `merge_meshes`/`StaticBody` baked)
é escolha local do autor, nunca um passe global que desfaz os blocos. Aqui: a fusão global segue útil para cena
autorada solta, mas não atravessa uma fusão que o jogo já fez por bloco.

## Consequências

- No DDD 00 as células voltam a ser ~145 malhas pequenas: o culling volta a descartar o que está fora da vista.
- Modelo dinâmico fundido com `mergeSubtree` (carro) já ficava fora da fusão global por ser dinâmico; a marca não
  muda nada para ele.
- Quem quiser que a fusão global junte peças de vários `mergeSubtree` não pode mais: funda num nível acima.
