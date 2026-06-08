# 0055 - Logic Bricks: comportamento de objeto como dado (estilo UPBGE)

**Data:** 2026-06-08
**Status:** aceito (em construção — slice 1: engine)

## Contexto

Comportamento de objeto (mover ao apertar tecla, tocar animação numa colisão,
abrir uma porta) vinha como **código solto**, sem padrão — a IA inventava cada vez,
e o usuário não conseguia autorar/ver no editor. O usuário pediu o modelo de **Logic
Bricks** do UPBGE / antigo Blender Game Engine, que ele gosta: **sensores** (eventos)
→ **controllers** (lógica and/or) → **actuators** (ações), ligados visualmente, por
objeto. Um objeto pode ter **N ações, cada uma com N associações**.

Isso encaixa no engine data-driven (cada brick é DADO) + ECS (o runtime é um System).
A longo prazo pode unificar player/comandos/animação numa superfície só. Decisão de
escopo com o usuário: **começar básico e evoluir**; um brick **ponta-a-ponta**.

## Decisão

Modelar comportamento como **bricks-dado** no nó (`logic`) ou na overlay do editor,
mesma precedência de tudo (**overlay > nó**), em fatias:

**Slice 1 — engine (esta ADR):**
- **Schema** (`src/scene/LogicBricks.ts`, zod): `sensors` / `controllers` /
  `actuators`, cada um com `id`. Controllers ligam N sensores a N actuators por id.
  Set mínimo: sensores `always`/`key` (`key`, `edge?`); controller `and`/`or`;
  actuators `motion` (`loc`/`rot`, `perSecond`) e `animation` (`clip`, toca no
  `SceneAnimator`).
- **Runtime** (`LogicComponent` + `LogicBricksSystem`): a cada frame avalia sensores
  → controllers → actuators e executa (funções puras `evalSensors`/`fireActuators`,
  testáveis). `buildScene` cria a entidade (com `Object3DComponent` + `LogicComponent`;
  reusa a do platformer se houver); `setupPlatformer` registra o system (**pausa no
  editor**). **Coexiste** com o platformer — não substitui.

**Decisão de UI (slice 2, a fazer):** o editor de bricks (colunas Sensors/Controllers/
Actuators) fica numa **aba na IDE ao lado do Terminal** (escolha do usuário sobre o
overlay no canvas do F2). Isso exige uma **ponte iframe↔IDE**: a seleção e a cena
vivem no iframe do preview; a aba vive na IDE. Trade-off aceito (UX desejada vale o
plumbing). MVP: 1 brick ponta-a-ponta (key → and → motion), depois multiplica os tipos.

## Consequências

- Comportamento vira **dado autorável e versionável** (JSON + overlay), não código
  espalhado. A IA preenche `logic`; o editor (futuro) edita visualmente.
- O runtime é pequeno e extensível: novos sensores (collision/timer/property),
  controllers (expression) e actuators (sound/scene/property) entram sem refactor.
- **Coexistência, não substituição:** o platformer (input/física/animação) segue;
  bricks adicionam comportamento custom por objeto. Com o tempo podem absorver mais.
- A **ponte iframe↔IDE** é o maior custo da slice 2 — nada da UI funciona antes dela.
  Alternativa rejeitada: painel no overlay do F2 (mais simples, mas não é a UX pedida).
- Actuator `motion` mexe no `Object3D` direto; num objeto com `TransformComponent`
  (player) o sync sobrescreveria — por isso o MVP mira **props** (sem TransformComponent).
  Mover o player por brick pedirá escrever no `TransformComponent` (futuro).
- Relaciona-se com ADR-0044 (cena data-driven), 0054 (animação — actuator usa o
  `SceneAnimator`) e 0030/0042 (editor). Vendorizado (`LogicBricks`/`LogicComponent`/
  `LogicBricksSystem`).
