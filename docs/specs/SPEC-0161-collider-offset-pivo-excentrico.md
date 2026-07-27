# SPEC-0161 - Collider derivado do bbox segue o CENTRO real (pivô excêntrico)

**Data:** 2026-07-27
**Status:** aceito

## Contexto

No editor do Mundo 4 do teste4 (kit platformer-obstacles), os gizmos de
collider apareciam DESLOCADOS meia-peça — "uma plataforma dentro da outra",
nas palavras do usuário — mesmo com as malhas encostadas borda-a-borda.

Causa: as peças modulares do kit têm o **pivô na ARESTA de encaixe** (o bbox
fica todo de um lado do origin). O `createPlatformerEntity` derivava só o
TAMANHO do collider do `getWorldBounds` e deixava o offset em `0` — assumindo
pivô central. Para pivô excêntrico, o box ficava centrado no pivô e invadia a
peça vizinha (no gizmo do editor e no mundo 2.5D; a física 3D do Character usa
a malha e não era afetada).

## Decisão

Quando as dimensões do collider vêm do bbox (sem `width`/`height` explícitos),
o offset também vem dele: `offset += center(bbox) − position(pivô)`. O collider
abraça o CORPO real do modelo com qualquer pivô. `offsetX`/`offsetY` explícitos
do nó/overlay continuam somando por cima; pivô central segue idêntico
(centro − pivô = 0).

## Consequências

- Gizmos e colliders 2.5D corretos pra glbs de pivô excêntrico (kits de
  encaixe borda-a-borda em geral, não só o aquapark).
- Jogos vendorizados recebem via re-vendor (teste4 feito em conjunto).
