# ADR-0710 - Pegada da arma por personagem: chave `ARMA#ALVO`, herança por espaço como a pose

**Data:** 2026-11-07
**Status:** aceito
**Contexto da SPEC:** SPEC-0711

## Contexto

A pegada da arma no Studio (`Grip_R` no espaço do osso `RightHand`, ADR-0702) é uma só por arma
(`skinned.weaponGrips[ARMA]`), e o Gravar (SPEC-0709) leva a mesma pegada para o JSON do skin do player e para o dos
NPCs. A pose já é por personagem (ADR-0707: `clipe@ARMA#ALVO`, o NPC herda só das chaves de NPC), mas a pegada não:
ajustar a pegada com um NPC mostrado sobrescreve a do player, mesmo com "Aplicar a: Só este". O esqueleto dos NPCs
tem outra escala e outra mão, então a pegada de um fica longe da mão do outro.

No jogo (Port Hollow), só o detetive lê a pegada do Studio (`weaponGrip()` em `entities/people/weaponVariants.ts`, do
JSON do skin do player); os NPCs armados seguram a arma pela pegada procedural da SPEC-0190 do jogo, e o `weaponGrips`
do `npc-variants.json` ainda não tem leitor.

## Alternativas

1. **Por espaço (player × NPCs)**: duas pegadas por arma, uma no esqueleto do player e uma no dos NPCs. Resolve o
   conflito com o mínimo, mas "Só este" e "Selecionados" num NPC continuariam gravando para todos os NPCs — o painel
   mentiria sobre o alcance.
2. **Por personagem, com as chaves da pose**: a pegada ganha o mesmo alvo da chave da pose (`ARMA`, `ARMA#CÓDIGO`,
   `ARMA#GRUPO`) e a mesma herança por espaço (`inheritChain`): o player herda de `ARMA#player` → `ARMA`; o NPC de
   `ARMA#npc-NNN` → `ARMA#GRUPO` → padrão, nunca do player. O "Aplicar a" leva a pegada junto com a pose. No JSON dos
   NPCs, `weaponGrips[ARMA]` é a do grupo e `weaponGrips["ARMA#npc-NNN"]` a de um NPC.
3. **Pegada por clipe** (`clipe@ARMA#ALVO`): mais fina, mas multiplica o ajuste pelos clipes sem pedido (a pegada é
   da mão, não do movimento) e o jogo teria de trocar a pegada a cada clipe.

## Decisão

Alternativa 2: o "Aplicar a" do painel vale igual para pose e pegada, e o formato do JSON do player não muda (o jogo
segue lendo `weaponGrips[ARMA]`). A pegada de um NPC individual vai para o JSON dos NPCs com a chave `ARMA#CÓDIGO`;
quem ler a pegada dos NPCs no jogo resolve `ARMA#CÓDIGO` → `ARMA` (contrato documentado na SPEC-0711; nenhum leitor
existe hoje, então nada muda no jogo agora).

## Consequências

- Ajustar num NPC não toca a pegada do player, e vice-versa: o NPC não herda a pegada do player ("Player e todos os
  NPCs" leva a pose aos NPCs pelo retarget, mas a pegada não — ela é da mão de cada esqueleto). Para copiar a pegada
  do player para NPCs, "Selecionados" com os NPCs marcados; a cópia vai como está (sem converter de esqueleto).
- Config antiga continua valendo: `weaponGrips[ARMA]` é a do player. A pegada que um ajuste num NPC já tenha gravado
  nessa chave (o bug) não é separada sozinha: reajuste a do player.
- O leitor da pegada dos NPCs no jogo, quando vier, precisa da resolução `ARMA#CÓDIGO` → `ARMA`.
