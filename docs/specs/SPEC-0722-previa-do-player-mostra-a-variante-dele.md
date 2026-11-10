# SPEC-0722 - A prévia do player mostra e edita a variante `#<player>` dele

**Data:** 2026-11-10
**Status:** implementado
**Relacionado:** SPEC-0708, SPEC-0711, SPEC-0719, ADR-0710

## Contexto

No Port Hollow, o usuário ajustou a mão esquerda do LUC-01 no apoio da arma (`rifleGunplay@ARM-04`), com "Aplicar a:
Só o player", e clicou em "Salvar pose": a prévia voltou para a pose antiga, como se o ajuste tivesse se perdido.

O ajuste foi gravado, mas num lugar que a prévia não lê:

- "Só o player" grava a chave `clipe@ARMA#<player>` (SPEC-0708: `skinned.clips[clipe].characters[player]`);
- a prévia do player mostra e edita a chave sem alvo (`clipe@ARMA`): a cadeia de herança dela
  (`clipe@ARMA` → `clipe`) não passa por `#<player>`;
- o salvar leva a edição para `#<player>` e descarta a da chave mostrada (ela não é alvo), então a prévia volta à salva.

E a prévia do player toca `clipe@ARMA` ou `clipe`, nunca a animação `clipe@ARMA#<player>` que o "Gravar no GLB do jogo"
assa no GLB do player, enquanto o jogo toca essa primeiro (`mostSpecific` do Port Hollow: com arma e personagem, só
personagem, só arma, base). A prévia mostrava outra coisa que o jogo.

## Decisão

Com personagens na config (`skinned.characters`), **a prévia do player é a do personagem `player`**, como a de um NPC
é a do código dele:

1. **Chave mostrada**: `clipe[@ARMA]#<player>`. A cadeia de herança (`inheritChain`) dela já é `clipe@ARMA#<player>` →
   `clipe#<player>` → `clipe@ARMA` → `clipe`: sem variante própria, a prévia mostra o mesmo de antes.
2. **Animação tocada**: a mais específica que o GLB tem, na ordem do jogo: `clipe@ARMA#<player>`, `clipe#<player>`,
   `clipe@ARMA`, `clipe`.
3. **Pegada**: a da chave `#<player>` continua sendo `ARMA` (SPEC-0719, ADR-0710), nunca `ARMA#<player>`. A store
   sabe o código do player e resolve a pegada das chaves dele para `ARMA` em todo lugar (editar, desfazer, aplicar,
   estado não salvo).
4. **"Aplicar a"** editando o player:
   - "Só o player": o alvo é a própria chave mostrada; a edição fica e é gravada nela (nada é descartado);
   - "Player e todos os NPCs": a edição vai para `clipe@ARMA` (como antes). Se o player já tem variante própria salva
     nessa chave (`#<player>`), ela também recebe a edição: senão a variante dele esconderia o ajuste, na prévia e no
     jogo. Sem variante própria, a chave `#<player>` não é criada (a edição dela é descartada e a prévia herda da
     chave sem alvo);
   - "Selecionados": a chave do player, quando ele está marcado, é a mostrada (fica); a pegada fica em `ARMA` com o
     player entre os alvos ou em "todos".
5. Sem `skinned.characters` (um personagem só), nada muda: a chave mostrada é a sem alvo.

O assado não muda: a chave `#<player>` já ia para o GLB do player (SPEC-0708), com a pegada `ARMA` (SPEC-0711).

## Implementação

- `rigPoseStore.ts`: `player` (código do player da config) e `gripKeyFor(key)` (a chave de pegada da chave da pose:
  a do player vira `ARMA`), usado no lugar de `gripKeyOf` dentro da store; `hasOwnVariant(key)`.
- `RigCharacterSource.ts`: `poseTarget` (no player com personagens, o código dele) e `storePlayer`, que o
  `RigAnimationPreview.ts` passa ao editor e à store; `anim` procura `#<player>` antes (`animOrder`).
- `RigApplyTo.ts`: "Player e todos os NPCs" inclui a chave do player quando ela tem variante salva; a pegada fica
  também em "todos".

## Aceite

1. Teste: editar `clipe@ARMA#player`, "Só o player", salvar → a variante do player gravada e `wanted` da chave mostrada
   é a editada depois de salvar (não volta).
2. Teste: a pegada editada na chave `#player` vai para `weaponGrips[ARMA]`, nunca `ARMA#player`.
3. Teste: "Player e todos" com variante do player salva → a chave sem alvo e a do player recebem a edição; sem variante
   do player, só a sem alvo, e nenhuma `characters[player]` é criada.
4. Teste: a animação do player é `clipe@ARMA#player` quando o GLB a tem, senão `clipe@ARMA`, senão `clipe`.
