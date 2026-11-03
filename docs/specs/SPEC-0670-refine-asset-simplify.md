# SPEC-0670 — `refine-asset --simplify`: orçamento de triângulos nos kits

**Data:** 2026-11-02
**Status:** implementado

## Contexto

O DDD 61 roda bem no export porque o conteúdo nasceu low-poly (kit DF-Modular). O DDD 00 usa kits comprados com
densidade de escultura: no inventário por material de um quadro (meio-dia, sol), os acabamentos do `city_kit`
(`MI_Trim*`) somam ~724 k triângulos, os postes 117 k em 4 draws, um hidrante 27 k.

A medição de GPU que motivou esta SPEC ("~76 dos 93 ms") foi contaminada por outro processo usando a placa: o
mesmo export, medido de novo em 03/11, dá GPU 4,5 ms. O orçamento de triângulos segue valendo para GPUs mais fracas
e para a sombra, mas não muda o fps do DDD 00 na RX 6600, que hoje é limitado pela CPU.

O `refine-asset.mjs` (SPEC-0231) só junta materiais e malhas; não reduz triângulos.

## Decisão

`--simplify <erro>` é um modo próprio do `refine-asset`: `weld()` + `simplifyPrimitive()` do
`@gltf-transform/functions` em cada primitiva de triângulos, com o `MeshoptSimplifier` (`meshoptimizer` 0.22.0,
dependência de desenvolvimento), e `prune({ keepLeaves: true, keepAttributes: true })` (UV de material sem textura fica: o jogo pode trocar o material). Sem paleta e sem `join`: kit é procurado por nome
de nó (e às vezes de material) em runtime, então hierarquia, nomes e materiais ficam como estavam. Só a geometria muda.

- `ratio: 0` + `error`: simplifica até o erro pedido (fração do tamanho da malha), sem meta de contagem.
- **UV e normal entram no erro** (`simplifyWithAttributes`, peso 1 na `TEXCOORD_0` e 0,5 na `NORMAL`). O `simplify()`
  do gltf-transform 4.4.1 passa só a posição ao meshoptimizer. Numa peça plana o erro geométrico de qualquer colapso
  é zero, então ele junta os vértices internos à vontade; onde a UV não é linear na posição (asfalto, faixa e meio-fio
  das ruas do `city_kit` do DDD 00, 03/11), a textura esticava em listras ao longo da pista. Com a UV no erro, plano
  com UV linear ainda simplifica (o colapso não muda a interpolação); plano com UV torta fica como estava.
- **Vértice de costura travado** (`vertex_lock`): depois do `weld()`, vértices que dividem a posição são os de costura
  (UV ou normal muda de um lado para o outro). Só com a UV no erro o meshoptimizer 0.22 ainda colapsava ao longo da
  costura: no `city_kit`, 36 peças com a UV deslocada mais de 0,01 (até 1,1 no `Trim_FirstFloor_Wall`). Com a trava,
  o pior caso fica em ~0,03.
- `lockBorder: true`: borda aberta não anda, para não abrir costura entre peças que se encostam.

### Medido no `city_kit` do DDD 00 (03/11)

Erro de UV = centróide de cada triângulo original contra o triângulo novo coplanar que melhor reproduz a UV.

| Variante                        | Triângulos          | Peças com erro de UV > 0,01 |
|---------------------------------|---------------------|-----------------------------|
| só posição (primeira versão)    | 111.098 → 76.486    | 41 (`Street_2Lane`: 0,667)  |
| UV e normal no erro             | 111.098 → 77.656    | 36                          |
| UV e normal + costura travada   | 111.098 → 107.376   | 10, todas ≤ 0,03            |

Os −31% da primeira versão vinham quase todos de colapsar costura de UV: a economia era a deformação.

## Como o Godot faz

O importador do Godot 4 gera LODs automáticos com o meshoptimizer (`meshoptimizer::simplify` em
`scene/resources/importer_mesh.cpp`), com limite de erro e bordas travadas, e escolhe o LOD em runtime pela
distância (`mesh_lod_threshold`). Aqui o passo é o mesmo algoritmo, offline e num nível só: o kit sai do refino já
no orçamento. LOD por distância em runtime fica para quando um nível só não bastar.

## Consequências

- O passo vira regra para todo kit novo: regra 6 da seção de performance do `AGENTS.md` do template
  (`templates/new-project/AGENTS.md`), com o orçamento por papel da peça e o `native/scripts/kit-tris.mjs` para medir.

- Rodar no kit é decisão do jogo (o kit é dele): conferir a aparência antes de commitar, porque `error` alto
  arredonda cornija e dente de engrenagem.
- Kit low-poly com UV recortada (o `city_kit`) quase não reduz: o que sobra para simplificar é malha densa de UV
  contínua (escultura). Kit simplificado com a primeira versão tem de ser refeito a partir do original.
- O relatório do `refine-asset` mostra triângulos antes/depois, como já fazia para materiais e nós.
