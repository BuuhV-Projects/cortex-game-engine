# ADR-0707 - Ajuste de pose por personagem: chave `#PERSONAGEM`, variantes dos NPCs num GLB do esqueleto deles

**Data:** 2026-11-07
**Status:** aceito
**Contexto da SPEC:** SPEC-0708

## Contexto

A F4 do ADR-0702 pôs os NPCs do jogo no esqueleto Mixamo do player, com o bind e a proporção deles, tocando os clipes
do player por retarget no carregamento (SPEC-0196 do Port Hollow). O usuário quer, no ajuste de pose da aba Animações,
escolher a quem o ajuste se aplica — todos, só o personagem que está editando ou os selecionados —, porque o mesmo giro
deforma diferente em corpos diferentes. O ajuste do player fica no espaço dos ossos dele; o do NPC, no do esqueleto do
NPC (um só para todos os NPCs).

## Alternativas

1. **Tudo no GLB do player, convertido para o espaço dele**: o ajuste feito num NPC volta ao player pelo retarget
   inverso. A conversão local muda a cada quadro (depende da rotação do pai); a conta no assado dá, mas o
   "desejado × gerado" do Studio deixa de comparar coisas no mesmo espaço.
2. **Uma chave por personagem e um GLB por esqueleto**: `clipe@ARMA#CÓDIGO` (um personagem), `#GRUPO` (todos os NPCs).
   As do player vão no GLB do player; as dos NPCs, num GLB versionado que só tem o esqueleto do NPC e as animações
   (as malhas de prévia de cada NPC são geradas pelo jogo e ficam fora do repositório). As opções de aplicar dependem
   de quem se edita: no player, "player e todos os NPCs" (a base de hoje), "só o player" ou selecionados; num NPC,
   "só este", NPCs selecionados ou "todos os NPCs".
3. **Um GLB por NPC com malha e animações**: cada um tem tudo, mas 130 malhas com textura no repositório (~60 MB) só
   para guardar animação.

## Decisão

Alternativa 2, com as opções por quem se edita (decidido com o usuário em 2026-11-07). Um ajuste feito no player e
aplicado a NPCs selecionados é guardado no espaço do player e, no assado, o clipe corrigido do player é retargetado para
o esqueleto do NPC (a mesma conta do jogo) e gravado no GLB dos NPCs. O jogo escolhe do mais específico ao geral:
`clipe@ARMA#CÓDIGO` → `clipe@ARMA#GRUPO` → `clipe@ARMA` → `clipe`.

## Consequências

- O painel ganha o seletor de personagem e o "aplicar a"; o assado grava em até dois pares GLB+JSON (cada par com o
  backup e a troca atômica do ADR-0705; os dois pares não são uma transação só).
- Projeto sem `skinned.characters` na config continua como hoje (um personagem).
- O retarget do Studio é o mesmo do jogo (rotação de mundo do NPC = a do player × repouso do player⁻¹ × repouso do NPC):
  os dois precisam ficar iguais; o teste compara com um gabarito.
