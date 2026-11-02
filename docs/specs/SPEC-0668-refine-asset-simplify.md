# SPEC-0668 — `refine-asset --simplify`: orçamento de triângulos nos kits

**Data:** 2026-11-02
**Status:** implementado

## Contexto

O DDD 61 roda bem no export porque o conteúdo nasceu low-poly (kit DF-Modular). O DDD 00 usa kits comprados com
densidade de escultura: no inventário por material de um quadro (meio-dia, sol), os acabamentos do `city_kit`
(`MI_Trim*`) somam ~724 k triângulos, os postes 117 k em 4 draws, um hidrante 27 k. Com hora e clima fixos, os draws
da cidade custam ~76 dos 93 ms de GPU do passe principal.

O `refine-asset.mjs` (SPEC-0231) só junta materiais e malhas; não reduz triângulos.

## Decisão

`--simplify <erro>` é um modo próprio do `refine-asset`: `weld()` + `simplify()` do `@gltf-transform/functions`
com o `MeshoptSimplifier` (`meshoptimizer` 0.22.0, dependência de desenvolvimento) e `prune({ keepLeaves: true })`.
Sem paleta e sem `join`: kit é procurado por nome de nó (e às vezes de material) em runtime, então hierarquia,
nomes e materiais ficam como estavam. Só a geometria muda.

- `ratio: 0` + `error`: simplifica até o erro geométrico pedido (fração do tamanho da malha), sem meta de contagem.
- `lockBorder: true`: borda aberta não anda, para não abrir costura entre peças que se encostam.

## Como o Godot faz

O importador do Godot 4 gera LODs automáticos com o meshoptimizer (`meshoptimizer::simplify` em
`scene/resources/importer_mesh.cpp`), com limite de erro e bordas travadas, e escolhe o LOD em runtime pela
distância (`mesh_lod_threshold`). Aqui o passo é o mesmo algoritmo, offline e num nível só: o kit sai do refino já
no orçamento. LOD por distância em runtime fica para quando um nível só não bastar.

## Consequências

- Rodar no kit é decisão do jogo (o kit é dele): conferir a aparência antes de commitar, porque `error` alto
  arredonda cornija e dente de engrenagem.
- O relatório do `refine-asset` mostra triângulos antes/depois, como já fazia para materiais e nós.
