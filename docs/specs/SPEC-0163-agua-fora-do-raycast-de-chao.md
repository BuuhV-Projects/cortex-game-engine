# SPEC-0163 - Água fora do raycast de chão do Character

**Data:** 2026-07-28
**Status:** aceito

## Contexto

No teste4 (Mundo 4 — Aquapark), cair da pista na água não matava o player: ele
ficava **em pé na superfície da água**. Causa: o `collectScene` do
`CharacterPhysicsSystem` empilha em `groundMeshes` todo mesh da cena que não é
vegetação/gizmo — e o plano da `Water` (`src/scene/Water.ts`) é um `Mesh`
comum, então virava chão pisável. Com a água em `y=0` e o corte de morte
(`fallY`) em `−0.6`, o player pousava na superfície (0 > −0.6) e nunca cruzava
o corte. O mesmo vale para paredes: o plano d'água podia entrar no empurrão de
parede se marcado sólido por engano.

## Decisão

Água é **cenário líquido, nunca colisão**:

- `Water` marca seu mesh com `userData.cortexWater = true`.
- `collectScene` (CharacterPhysicsSystem) ignora meshes com `cortexWater` em
  TODAS as listas de física (`groundMeshes`, `solidMeshes`, `terrainMeshes`).
- O raycast do THREE fica **ligado** no mesh — o editor continua selecionando
  a água pelo clique (picking é raycast; ver ADR-0143 sobre a armadilha de
  desligar raycast).

## Consequências

- Cair na água afunda de verdade: o corte `fallY` logo abaixo da superfície
  volta a funcionar (splash + respawn nos jogos).
- Qualquer jogo que (incorretamente) dependesse de andar sobre a água precisa
  de um collider explícito próprio — comportamento antigo era bug, não
  contrato.
- Teste unitário em `tests/systems/CharacterPhysics.test.ts` cobre a exclusão.
