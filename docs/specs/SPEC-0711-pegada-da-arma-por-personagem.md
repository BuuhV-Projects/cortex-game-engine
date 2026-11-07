# SPEC-0711 - Pegada da arma por personagem

**Data:** 2026-11-07
**Status:** implementado
**Decisão:** ADR-0710

## Chave da pegada

A chave da pegada sai da chave da pose editada (`clipe@ARMA#ALVO`, SPEC-0708): `ARMA` sem alvo, `ARMA#ALVO` com
alvo. Todos os clipes da mesma arma e do mesmo alvo dividem a pegada.

Herança (a mesma cadeia por espaço da pose, `inheritChain`, só as chaves com arma):
- player: `ARMA#<código do player>` → `ARMA` → padrão;
- NPC: `ARMA#npc-NNN` → `ARMA#GRUPO` → padrão (nunca a do player).

## Config

`skinned.weaponGrips` guarda as chaves como estão: `"ARM-01"`, `"ARM-01#LUC-01"`, `"ARM-01#NPC"`,
`"ARM-01#npc-001"`. Voltar ao padrão apaga a entrada sem alvo; a com alvo fica (senão herdaria outra).

## Aplicar a

Na gravação, a pegada da chave mostrada vai para as chaves dos alvos escolhidos, como a pose (se a pegada foi
editada). Editada no player e levada a NPCs selecionados, a pegada vai como está.

## Gravar no GLB do jogo

- JSON do skin do player: `weaponGrips[ARMA]` = a pegada do player resolvida (`ARMA#player` → `ARMA`).
- JSON dos NPCs: `weaponGrips[ARMA]` = a do grupo (`ARMA#GRUPO`); `weaponGrips["ARMA#npc-NNN"]` = a de cada NPC com
  pegada própria. Leitor no jogo resolve `ARMA#CÓDIGO` → `ARMA`.
- Como na SPEC-0709: vai o que o JSON não tem igual; a arma de cada variante assada leva a pegada resolvida da chave.

## Aceite

1. Testes: ajustar a pegada com um NPC não muda a do player (e vice-versa); herança por espaço; "Só este" grava
   `ARMA#npc-NNN`; o Gravar escreve a do player no JSON do player e a dos NPCs no JSON dos NPCs.
2. No Studio (Port Hollow): pegada no LUC-01, trocar para o npc-001, reajustar com "Só este", gravar; o
   `LUC-01.json` mantém a do player e ganha `ARM-01#npc-001`.

## Implementação

- `characterRigCharacters.ts`: `gripKeyOf`, `gripChain`, `skinGripKey`.
- `rigPoseStore.ts`: pegadas por chave de pegada, `grip(key)`/`setGrip(key)` pela chave da pose, `applyEditTo` leva a
  pegada, `skinGrips(npc, player)`.
- `characterRigWeapon.ts` (`applyGrips`), `RigPoseEditor.ts`, `RigBakeRun.ts`.
