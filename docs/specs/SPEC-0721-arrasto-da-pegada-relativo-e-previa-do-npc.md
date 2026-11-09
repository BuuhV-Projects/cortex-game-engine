# SPEC-0721 - Arrasto da pegada relativo ao começo e prévia do NPC com a pegada do player

**Data:** 2026-11-09
**Status:** implementado
**Relacionado:** SPEC-0711, SPEC-0719, ADR-0710

## Contexto

No Port Hollow (engine com a SPEC-0719), ajustar o `pistolIdle` no LUC-01 e salvar com "Aplicar a: Selecionados"
(LUC-01 + cinco NPCs) gravou em `weaponGrips` a `ARM-01` e as `ARM-01#npc-NNN` com a rotação **exata** da pegada
padrão (`[0, 0.707107, 0.707107, 0]`) e um deslocamento perto da palma (`[-0.027, 0.076, 0.005]`). Nos NPCs sem
pegada própria, a prévia mostrava a pistola invertida.

Causas:

1. **O arrasto da pegada gravava a pose absoluta do proxy do gizmo** (`gripFor(mão, proxy)`). O proxy só acompanha a
   arma quando a prévia se redesenha com ela selecionada; vindo da prévia de um NPC (arma na pegada padrão, mão
   retargetada com a mesma rotação de mundo), um clique ou um arrasto mínimo na arma do player gravava a pegada
   padrão do NPC como a do player. Um clique sem mover também deixava uma edição de pegada pendente.
2. **A prévia do NPC sem pegada própria usava a padrão** (a cadeia do NPC nunca chega na do player, ADR-0710), que na
   mão desse esqueleto sai invertida. No jogo, os NPCs seguram certo (pegada procedural do próprio jogo).

## Decisão

1. **Arrasto relativo**: no começo do arrasto da arma guarda-se a pegada mostrada e o proxy; durante o arrasto, a
   pegada nova é a do começo mais o quanto o proxy andou e girou (`RigWeapon.dragGrip`). O valor absoluto do proxy não
   entra mais, então um proxy fora de lugar não injeta pegada nenhuma.
2. **Arrasto sem mudança não edita**: no fim, se a pegada é a mesma do começo (a 6 casas), a edição é desfeita (a
   mesma entrada de undo do começo). Salvar a pose sem ter movido a arma não grava pegada.
3. **Prévia do NPC**: sem pegada própria na cadeia dele (editada ou salva: `ARMA#npc-NNN`, `ARMA#GRUPO`), a prévia mostra
   a pegada do player (`ARMA`), que é o ponto de partida de um ajuste no NPC. É só a prévia: a herança gravada e o
   assado não mudam (o NPC continua sem herdar a do player na config, como no ADR-0710), e ajustar a arma no NPC
   grava `ARMA#npc-NNN` a partir do que se vê.

## Implementação

- `RigWeapon.ts`: `dragGrip(hand, start, from, to)`.
- `RigPoseEditor.ts`: `gripDrag` guarda chave, pegada e proxy do começo; `endDrag` desfaz o arrasto sem mudança; a
  arma da prévia usa `store.previewGrip`.
- `rigPoseStore.ts`: `previewGrip(key)`.

## Aceite

1. Testes do store: NPC sem pegada própria mostra a do player; com a dele, a dele; a cadeia gravada não muda.
2. Teste do `dragGrip`: proxy fora de lugar e sem mover → a pegada do começo; mover 1 cm → a pegada do começo + 1 cm.
3. Salvar a pose sem mover a arma não grava `weaponGrips` (teste da SPEC-0719).
