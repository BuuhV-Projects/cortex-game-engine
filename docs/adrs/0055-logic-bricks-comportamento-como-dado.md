# 0055 - Logic Bricks: comportamento de objeto como dado (estilo UPBGE)

**Data:** 2026-06-08
**Status:** parado / revisitar — **revertido** (não está no código). Falta justificar
o ganho sobre código puro e resolver o conflito de autoridade com o gameplay.

## Contexto

Comportamento de objeto (mover ao apertar tecla, tocar animação numa colisão,
abrir uma porta) vinha como **código solto**, sem padrão. A ideia era o modelo de
**Logic Bricks** do UPBGE / antigo Blender Game Engine: **sensores** (eventos) →
**controllers** (lógica and/or) → **actuators** (ações), ligados por objeto, como
DADO — encaixando no engine data-driven (cada brick é dado) + ECS (runtime é um
System). Um objeto teria **N ações, cada uma com N associações**.

Chegamos a implementar uma fatia (schema zod, `LogicComponent`, `LogicBricksSystem`,
fiação no `buildScene`/`setupPlatformer`) e um editor de UI (aba "Logic" na IDE +
ponte postMessage iframe↔IDE). Ao revisar, **paramos e revertemos tudo** — a fundação
e o editor saíram do código (este ADR fica como registro do que foi explorado).

## Decisão

**Não adotar Logic Bricks agora.** Reverter a fundação e o editor. O motivo não é
técnico (funcionava) — é de **propósito e arquitetura**:

1. **Conflito de autoridade com o código/gameplay.** Quem move o player escreve no
   `TransformComponent` (input→física→`Object3DSyncSystem`→`Object3D`). O actuator
   `motion` escrevia direto no `Object3D.position` e era **sobrescrito** pelo sync
   todo frame. Resultado: dois donos do mesmo transform, conflito **silencioso**.
   Resolver isso exige escolher um modelo de autoridade — e isso é uma decisão de
   design grande (ver opções abaixo), não um detalhe.
2. **Falta a justificativa.** Não respondemos **o que Logic Bricks resolve que código
   puro (TS) num System/Component não resolve melhor**. Sem essa resposta, é um
   segundo jeito de fazer a mesma coisa — superfície a mais pra manter, que compete
   com o caminho que já existe (e que a IA já sabe escrever).

## Consequências

- O engine volta a ter **um caminho só** pra comportamento: código (Systems/
  Components) + a cena data-driven. Sem meio-sistema dormente na árvore.
- O que sair daqui pra frente precisa primeiro **fechar o propósito** e **o modelo
  de autoridade**. Opções levantadas (pra quando/se revisitar):
  - **Logic Bricks como dono único:** todo comportamento passa pelo grafo de bricks;
    o platformer vira um actuator built-in de alto nível (não dá pra decompor física
    em `motion += x`); TS roda via um actuator `script`. Uma superfície, sem conflito,
    mas é a maior reescrita.
  - **Dono explícito por objeto** (`controlledBy: 'code' | 'bricks'`): convivência,
    nunca os dois no mesmo objeto. Menos reescrita, dois mundos paralelos.
  - **Bricks compõem por cima** (prioridade por ordem; `motion` escreve no
    `TransformComponent`, system roda depois da física): determinístico, mas continua
    code + bricks no mesmo objeto.
- ADR-0054 (animação data-driven) é **independente** e **permanece** — não dependia
  de Logic Bricks.
- Se revisitar, abrir um ADR novo (que substitui este) com o propósito respondido e
  o modelo de autoridade decidido **antes** de escrever código.
