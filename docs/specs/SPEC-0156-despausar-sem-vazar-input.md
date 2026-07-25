# SPEC-0156 - Despausar sem vazar input (pulo fantasma)

**Data:** 2026-07-25
**Status:** aceito

## Contexto

Ao navegar o menu de pausa com A (gamepad) ou Espaço e retomar/sair, o primeiro
frame livre do controle via a "borda" do botão ainda segurado (o `prevJump`
congelava durante a pausa em `false`) e enfileirava um **pulo fantasma** — no
teste4, o som de pulo tocava ao confirmar "Sair" na pausa.

## Decisão

Nos dois controles (`ThirdPersonControlSystem` e `FirstPersonCameraSystem`),
enquanto `pauseWhen` está ativo o botão de pulo conta como **já pressionado**
(`prevJump = true`): ao despausar, só soltar-e-apertar de novo gera borda.

## Consequências

- Confirmar item de menu com A/Espaço não dispara mais ação de gameplay no
  frame seguinte. Segurar o botão desde antes da pausa também não pula ao
  voltar (comportamento padrão de consoles).
