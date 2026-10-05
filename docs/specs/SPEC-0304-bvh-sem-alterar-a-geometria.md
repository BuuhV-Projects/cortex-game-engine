# SPEC-0304 - Árvore de raycast (BVH) sem alterar a geometria

**Data:** 2026-10-05
**Status:** aceito

## Contexto

No Studio (WebGPU), voar com WASD no editor sobre a cidade do Detetive Brasília
deixava a tela preta com `Calling Draw with an index count of 0 is unusual` e
`Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder': parameter 1 is not
of type 'GPUBuffer'`. Causa: `ensureBoundsTree` (raycastAccel) monta a árvore BVH
do `three-mesh-bvh` no modo padrão, que **reordena o índice da geometria e cria um
se ela não tiver**. O `EditorCameraSystem` monta a árvore das malhas visíveis ao
navegar (e o `CharacterPhysicsSystem` ao varrer a cena) — malhas fundidas sem
índice, já enviadas pra GPU, passavam a ter um índice que nunca subiu.
Reproduzido: malha de 15 mil triângulos sem índice ganhava índice depois do 1º
desenho.

## Decisão

`ensureBoundsTree` monta a árvore com `{ indirect: true }`: a ordem dos
triângulos fica num buffer da própria árvore e a geometria (índice e atributos)
não é tocada. O raycast acelerado funciona igual.

## Consequências

- Montar a árvore pode acontecer a qualquer momento (antes ou depois do 1º
  desenho) sem quebrar o render.
- Raycast no modo indireto tem uma indireção a mais por triângulo — custo
  desprezível perto do ganho da árvore.
