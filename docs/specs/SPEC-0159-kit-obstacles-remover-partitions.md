# SPEC-0159 - Kit platformer-obstacles: remover water_platform_partition_001..003

**Data:** 2026-07-27
**Status:** aceito

## Contexto

As `water_platform_partition_001..003` ("saia/funil decorativo pra encaixar sob
a balsa", 5.1×1.2×5.1) foram julgadas INÚTEIS pelo usuário na curadoria do
Mundo 4 do teste4: em cena liam como um donut solto na água que confunde o
jogador (parece stepping-stone falso) e não somam nada ao vocabulário.

## Decisão

Remover as três peças do kit: `.glb` + thumbnail + entradas do `kit.json`.
No `gen-overrides.mjs` do stage (fonte durável, SPEC-0151) a família fica
ANOTADA como removida — um reprocesso futuro do pack não deve trazê-las de
volta ao kit.

## Consequências

- Kit passa de 181 → 178 peças; nenhum script/mecânica dependia delas.
- Jogos que as usavam (teste4: helper decorativo `floatSkirt`) removem o uso —
  feito em conjunto no teste4.
