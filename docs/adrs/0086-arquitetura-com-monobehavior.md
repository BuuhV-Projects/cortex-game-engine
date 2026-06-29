# 0086 - Arquitetura do projeto com scripts (MonoBehaviour): System vs Script

**Data:** 2026-06-29
**Status:** aceito

## Contexto

Com os scripts anexáveis (ADR-0085), o `main.ts` do jogo — um monólito de cola hardcoded
(física do carro, spawn, interação, sun-follow, soco, gating no `onUpdate`) — precisa ser
repensado. Pergunta central: **o que vira script e o que continua sistema do engine?**

## Decisão

**Modelo híbrido (estilo Unity: built-ins + MonoBehaviour).** Quatro camadas:

1. **Engine = infra reutilizável** (NÃO vira script): ECS, render, física (Rapier), câmeras,
   character controller, **física do veículo**, `buildScene`, editor, **+ `ScriptHostSystem`/
   `ScriptBehavior`** (a camada que *roda* a lógica de jogo).
2. **Dado da cena** (`level.json` + overlay): nós + física + **`scripts` e seus campos** — o
   "o quê", autorado no editor.
3. **Scripts do projeto** (`scripts/*.ts`): comportamento específico do jogo, um
   `ScriptBehavior` cada, anexado por nó e configurado no Inspector.
4. **`main.ts` = só boot**: `Game` + registra scripts (`import.meta.glob`) + adiciona os
   Systems de infra (ou `setupX`) + `ScriptHostSystem` + `buildScene`. Sem cola de gameplay.

**Regra de ouro — System vs Script:**
- Opera sobre **muitas** entidades / é infra cross-cutting (física, câmera, render) → **System** (engine).
- Comportamento **de UM objeto** (spawn, interação, patrulha de NPC, porta que abre) → **Script**.

## Plano de migração (DDD-61-CORTEX) + status

| Cola hardcoded hoje | Vira | Status |
|---|---|---|
| Física do carro (`createVehicle`/`VehicleControlSystem`/skid/som) | **fica infra** (futuro helper `setupVehicle`) | mantém |
| sun-follow | Script `SeguirAlvo` no Sol | **bloqueado** — Sol é preset, não nó (ver abaixo); `SeguirAlvo` criado como padrão |
| spawn (P/Y) + entrar/sair do carro | Script no nó `carro` | pendente |
| soco | Script `Combate` no nó `player` | pendente |
| gating/live-edit no `onUpdate` | dissolve nos scripts/systems | pendente |

## Pontos em aberto (decisões ao migrar)

- **Acesso a outro sistema/entidade:** o script usa `this.ctx` (world/input/gamepad/scene/
  camera), `this.object3d`, `this.entity`, e `world.query(Componente)` pra achar outras
  entidades. Casos que precisam de um System (ex.: pegar o `Vehicle` do Rapier) → expor via um
  componente consultável ou estender o `ctx`. Comunicação script↔script: por ora via world/
  componentes; um event-bus pode vir depois se necessário.
- **Ordem de execução:** todos os scripts rodam na prioridade do `ScriptHostSystem` (50). Se
  surgir dependência de ordem, criar prioridade por script (campo) — adiar até precisar.
- **Sol é preset, não nó:** `outdoorLighting` cria as luzes programaticamente → não há nó pra
  hospedar `SeguirAlvo`. Pra migrar o sun-follow de verdade, falta um **tipo de nó `light`**
  (DirectionalLight como nó editável). Até lá, o sun-follow fica no boot. `SeguirAlvo` já existe
  como o padrão reutilizável (segue a câmera + offset) e roda em qualquer nó.
- **Campos `string`/`asset` no Inspector:** ainda sem widget (ADR-0085, fase 2) — scripts de
  migração devem preferir campos `number`/`boolean`/`select`/`vector3` por ora.

## Consequências

- `main.ts` encolhe à medida que a cola vira script; gameplay fica editável no Inspector + dado
  de cena (alinha com [[inspector-live-realtime]]).
- Nem tudo vira script: infra cross-cutting continua System — a regra acima evita migração
  forçada de coisas que são naturalmente sistemas.
- Próximos passos sugeridos: (1) tipo de nó `light` pra migrar o Sol; (2) migrar spawn/interação
  do carro e o soco; (3) fase 2 dos campos do Inspector (string/asset/upload).
