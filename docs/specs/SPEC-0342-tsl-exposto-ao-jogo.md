# SPEC-0342 - TSL e `MeshLambertNodeMaterial` expostos ao jogo

**Data:** 2026-10-10
**Status:** aceito

## Contexto

O jogo importa só de `'cortex-game-engine'` (o `three` não está no
`node_modules` do projeto, e uma segunda cópia do three quebraria o TSL, que
guarda estado de módulo — a pilha do `Fn`). O runtime exporta do TSL só
`pass, mrt, output, renderOutput, uniform` (pós-processamento, ADR-0035 e
SPEC-0222).

O DDD 61 vai trocar os bonecos de caixa pelos personagens rigados do usuário
(31 NPCs + detetive). No export nativo cada draw genérico custa ~55 µs
(SPEC-0227, ADR-0330), então um `SkinnedMesh` por pessoa (500 bonecos) não
cabe, e o `BatchedMesh` do three r184 emite um `drawIndexed` por instância e
usa uma textura `r32uint` que o host não mapeia (`native/src/webgpu/enums.cpp`).
O caminho que cabe é um lote instanciado com shader próprio: o vértice busca
a geometria do tipo numa `DataTexture` (`textureLoad`), dobra os membros pelos
ângulos por instância e sai num draw só. Isso exige montar nós TSL no jogo.

## Decisão

`src/index-runtime.ts` passa a exportar:

- `TSL` — o namespace inteiro de `three/tsl` (`export * as TSL from 'three/tsl'`):
  `Fn`, `attribute`, `textureLoad`, `instanceIndex`, `varying`, `vec3`,
  `positionLocal`, `normalLocal` etc. Namespace, e não nomes soltos, para não
  colidir com nomes do engine (`uniform` e `output` continuam soltos como antes).
- `MeshLambertNodeMaterial` e `MeshBasicNodeMaterial` de `three/webgpu` — o
  material que recebe `positionNode`/`colorNode`.

É só re-exportação: o bundle já contém o three/tsl inteiro (o renderer o
usa), então o tamanho do `index.js` não muda de forma relevante.

## Consequências

- Jogos podem escrever shaders TSL (`material.positionNode = TSL.Fn(...)()`)
  sem importar `three`.
- Shader de jogo no nativo passa pelo naga: "compilou" não prova que
  funciona (vertex color branco, `override_probe.h`). Quem usar deve validar o
  pixel no export.
- `engine-api.md` ganha a receita; a doc gerada (`yarn docs:engine`) lista os
  exports novos.
