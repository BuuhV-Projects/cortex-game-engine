# SPEC-0725 - Auto-rig: a profundidade da junta sai também das arestas que cruzam a altura

**Data:** 2026-11-10
**Status:** implementado
**Relacionado:** SPEC-0724, ADR-0723

## Contexto

O auto-rig por marcadores (SPEC-0724) acha a profundidade (y) de cada junta pelo centro da malha numa fatia de
altura: os vértices a até 3 cm da altura da junta (`SLICE`) e a até 6 cm dela na lateral (`LIMB_HALF`).

Em malha de poucos triângulos a fatia pode não ter vértice nenhum: o triângulo grande atravessa a altura inteira. No
Port Hollow, o npc-135 e o npc-136 (cerca de 5 mil triângulos) pararam na etapa skin com
`ValueError: fatia vazia da malha em x=0.107 z=0.9`: na altura da virilha, os únicos vértices na faixa eram os das
mãos. O npc-110 (14 mil triângulos) passava.

## Decisão

A fatia passa a juntar, além dos vértices, os **pontos onde as arestas da malha cruzam a altura** da junta, na mesma
janela lateral. Uma aresta que cruza a altura sempre dá ponto, então a superfície do corpo aparece na fatia com
qualquer densidade de malha.

- `autorig_markers.slice_depth(points, edges, z, x, half_width, slab)`: pura (sem Blender), devolve o centro em y ou
  `None` quando nada cai na fatia.
- `autorig_skeleton.mesh_center_y` usa a `slice_depth` com os vértices em coordenadas de mundo e as arestas da malha;
  o erro "fatia vazia" continua para uma fatia de fato fora do corpo (marcador fora da malha).

Em malha densa o resultado quase não muda: os cruzamentos ficam dentro da faixa que os vértices já cobriam. No npc-110
a maior diferença de junta para o rig já publicado foi 0,9 mm.

## Aceite

1. Autoteste (`python autorig_markers.py --selftest`, rodado pelo `autoRigScripts.test.ts`): um triângulo sem vértice
   na fatia dá a profundidade pelas arestas; fatia fora do triângulo dá `None`; só vértices dá o centro deles.
2. npc-135 e npc-136 do Port Hollow passam na etapa skin sem falhas.
3. npc-110 gerado de novo: juntas a menos de 1 mm das do rig publicado.
