# SPEC-0351 - `game.onLateUpdate`: lógica do jogo depois do `world.tick`

**Data:** 2026-10-20
**Status:** aceito
**Relacionados:** SPEC-0350 (engasgos do Play no Studio, que expuseram o problema)

## Contexto

O quadro do `Game` é: input → `onUpdate` → `world.tick` → UI → editor → render. Quem anda o personagem é um
System dentro do `world.tick` (`ThirdPersonControlSystem`, `CharacterPhysicsSystem`). Lógica do jogo que
precisa do movimento **deste** quadro (animar o personagem pelo passo dado, câmera que segue algo movido por
System, efeitos presos a um corpo físico) não tinha onde ficar: no `onUpdate` ela lê o movimento do quadro
anterior. Com quadros regulares isso é invisível; num engasgo (SPEC-0350: 60–90 ms no Play do Studio) o corpo
pula e o que depende dele só alcança no quadro seguinte, e um `passo ÷ dt` mistura quadros diferentes.

Caso real (DDD 61): o animador do player lia o deslocamento da cápsula no `onUpdate`. Num engasgo de 69 ms o
passo medido era o do quadro anterior (0,077 m → ~1 m/s correndo a 6 m/s): o peso do correr caía para 0,5, e
no quadro seguinte a cápsula andava 0,44 m com o ciclo da perna parado. Os NPCs, movidos e animados no mesmo
`onUpdate`, não sofriam. O contorno no jogo seria um `System` de prioridade máxima só para rodar um callback,
mas essa é uma fase do quadro: é da engine.

## Decisão

- `Game.onLateUpdate(callback: (deltaSeconds) => void)`: chamado a cada quadro **depois do `world.tick`** e
  antes da UI, do editor e do render, com o mesmo delta (segundos) do `onUpdate`. Um callback, como o
  `onUpdate` (registrar de novo substitui).
- Ordem do quadro: input → `onUpdate` → `world.tick` → `onLateUpdate` → UI → editor → render.
- A sequência de atualização sai do `_tick` para um método privado (`_update`) testável sem renderer.
- `reset()` zera o `onLateUpdate` junto do `onUpdate`.
- Profiler: fase própria `late`.

## Consequências

- Lógica que lê o que os Systems moveram fica no `onLateUpdate`; o `onUpdate` segue para o que **comanda** o
  movimento (input, IA, regras) e roda antes dos Systems.
- Sem custo quando não registrado (uma checagem de `null`).
- O export nativo roda o mesmo bundle: vale lá sem mudança no host.
- API pública nova: doc gerada (`yarn docs:engine`) e `engine-api.md` atualizados.
