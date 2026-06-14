# 0066 - Controle é do jogo; engine só fornece os recursos de input

**Data:** 2026-06-14
**Status:** aceito

## Contexto

O jogo-alvo (Hearthvale, farm sim 3D) é **joystick-first** (Xbox), com teclado como
alternativa. Surgiu a necessidade de uma camada de **comandos** (ações semânticas
tipo "interagir", "abrir inventário") que funcione em qualquer dispositivo, montada
por **factory** (uma impl que conhece o Xbox, outra o teclado).

A primeira tentativa colocou isso **dentro do engine** (`InputControls` + `GameAction`
+ mapas default + `createControls` + `KeyboardControls`/`XboxGamepadControls`). Isso
está **errado de camada**: cada jogo tem ações e mapeamento próprios (plantar, usar
ferramenta, hotbar…) — o engine não deve cravar esse vocabulário nem a política de
mapeamento. O engine é genérico; o controle é específico do jogo.

## Decisão

**O controle (ações + mapeamento + factory) é responsabilidade do JOGO.** O engine
fornece **apenas os recursos** pra o jogo construir o controle dele:

1. **Acesso cru aos dispositivos** (já existia): `InputManager` (teclado/mouse,
   event-driven) e `GamepadManager` (gamepad, polled, com deadzone, acesso por
   `getAxis(slot, i)` / `isButtonDown(slot, i)`). É só isso de input que o engine
   expõe.
2. **Movimento top-down dirigido por eixo** — o `TopDownMovementSystem` e o
   `setupTopDown` recebem um **`readMove: () => { x, y }`** (provedor de eixo) que o
   **jogo** implementa lendo o controle dele. O engine move o player no XZ + vira na
   direção + marca o alvo da câmera; **não sabe** se o eixo veio de tecla ou stick.

> **Nota (correção):** até as **constantes de layout do Xbox** (quais índices são A/B/
> stick) são do **jogo** — o engine não as define. O `GamepadManager` já documenta os
> índices padrão no TSDoc; o jogo declara as constantes que usar.

O **jogo** (ex.: hearthvale-game) implementa a sua camada de controle (interface de
ações, classes por dispositivo, factory, tick por frame) usando esses recursos, e
passa o `readMove` ao `setupTopDown` + lê as ações dele na lógica de jogo.

## Consequências

- O engine fica **genérico**: zero vocabulário de ação ou mapa default embutido.
  Reescreve a 1ª tentativa (interface/factory no engine foi REMOVIDA: `InputControls`,
  `InputControlsSystem`, `createControls`, classes de mapeamento).
- O jogo tem **controle total** do esquema (rebinding, ações próprias, joystick-first)
  sem brigar com o engine. Curva: cada jogo escreve a sua camada (ou copia de um jogo
  pro outro) — aceitável, é específico mesmo.
- `setupTopDown` continua existindo como conveniência **input-agnóstica** (recebe o
  `readMove`). Relaciona-se com 0065 (top-down) e 0023 (gamepad).
- Se no futuro vários jogos repetirem a MESMA camada de controle, aí sim vale extrair
  pra um pacote/utilitário **opcional** (fora do core), nunca cravado no engine.
