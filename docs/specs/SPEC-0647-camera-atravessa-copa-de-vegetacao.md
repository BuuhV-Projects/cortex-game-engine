# SPEC-0647 - Câmera da 3ª pessoa atravessa a copa da vegetação

**Data:** 2026-10-31
**Status:** aceito

## Contexto

Com a SPEC-0625 (braço que não atravessa objeto) de volta na main, o usuário relatou no Port Hollow que a câmera
"chegava tão perto que o player sumia", sobretudo perto de árvores — foi por isso que a SPEC-0625 tinha sido revertida.

Medido na sonda do jogo (detetive a 1,5 m do tronco de uma árvore de parque, em área aberta): o braço ficava em
0,35 m em todas as direções. O raio da câmera acertava a copa (`veg-…`, `InstancedMesh` da `Vegetation`) a 0,06–0,2 m
da origem. Causa: no `collectScene` do `CharacterPhysicsSystem`, a malha entrava em `visibleMeshes` — a lista que a
câmera reaproveita (SPEC-0328/0646) — **antes** do teste de `cortexVegetationSub`; a física já ignorava a vegetação
(colisão por cilindro do tronco), a câmera não. O `collect` do braço sem varredura compartilhada também não filtrava.

## Decisão

- A vegetação (`userData.cortexVegetationSub`, as `InstancedMesh` da `Vegetation`) **não é alvo da câmera**: fica fora
  de `visibleMeshes` no `collectScene` e fora dos alvos do `collect` do `ThirdPersonCameraArm` quando ele varre sozinho.
- A câmera passa por dentro da copa e do tronco, como em jogo de mundo aberto (folhagem não empurra a câmera). Parede,
  prédio, prop sólido e terreno continuam bloqueando como na SPEC-0625.
- O editor continua selecionando vegetação (o `raycast` da `InstancedMesh` segue ligado).

## Consequências

- Some o colapso do braço sob árvore e o custo dos raios da câmera contra a floresta instanciada (centenas de instâncias
  por nó).
- O tronco pode ficar entre a câmera e o jogador por um instante; ele é fino perto do braço de ~4 m e a copa é
  recortada (alfa), então o jogador continua visível.
- Teste: `tests/systems/ThirdPersonSharedScan.test.ts` — copa instanciada entre o alvo e a câmera não encolhe o braço,
  com e sem o `CharacterPhysicsSystem`.
