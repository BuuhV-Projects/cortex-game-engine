# SPEC-0708 - Aplicar o ajuste de pose a todos, a um ou a personagens selecionados

**Data:** 2026-11-07
**Status:** em implementação
**Decisão:** ADR-0707

## Config (`skinned.characters`, opcional)

```json
"characters": {
  "group": "NPC",
  "glb": "assets/personagens/npc-variants.glb",
  "clips": "assets/personagens/npc-variants.json",
  "preview": "dev-assets/personagens/npcs-preview",
  "codes": ["npc-001", "npc-002"]
}
```

- `glb`/`clips`: o par do esqueleto dos NPCs (sem malha; as animações `clipe@ARMA#CÓDIGO` e `#GRUPO` que o assado grava).
- `preview`: pasta com `<código>.glb` (malha do NPC no mesmo esqueleto) só para a prévia; sem o arquivo, a prévia usa o
  primeiro que existir.
- O personagem da config (`code`) é o player.

## Comportamento

### Personagem

A aba Animações ganha "Personagem": o player e os `codes`. Num NPC, o modelo é o GLB de prévia dele e a animação de
cada clipe é a do player retargetada para o esqueleto do NPC, ou a variante dele no GLB dos NPCs, quando houver.

### Aplicar a

Junto do ajuste, "Aplicar a":
- editando o **player**: "Player e todos os NPCs" (a chave de hoje, `clipe@ARMA`), "Só o player" (`#<code>`),
  "Selecionados" (lista: o player e os NPCs);
- editando um **NPC**: "Só este" (`#CÓDIGO`), "NPCs selecionados", "Todos os NPCs" (`#GRUPO`).

Selecionados grava a mesma edição em cada chave escolhida. A config guarda em `skinned.clips[c].characters[ALVO]`
(e `.weapons[ARMA]` dentro), com `space: "player"` quando a edição veio do player para um NPC.

### Assado

Gravar no GLB do jogo assa as chaves de personagem também: as do player no GLB do player; as dos NPCs no GLB dos NPCs
(do espaço do NPC direto; do espaço do player, retargetando o clipe já corrigido). O JSON de cada par ganha as entradas.

## Aceite

1. Testes: chave com `#` (montar, separar, herança); a escolha do jogo do mais específico ao geral; o retarget do
   Studio igual ao do jogo (gabarito); a config grava o mesmo ajuste nas chaves selecionadas.
2. No Studio, no Port Hollow: escolher um NPC, ajustar, "Só este", gravar; o GLB dos NPCs ganha `clipe#npc-NNN`.
