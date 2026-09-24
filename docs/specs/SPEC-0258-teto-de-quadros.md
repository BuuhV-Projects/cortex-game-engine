# SPEC-0258 — Teto de quadros e passo do veículo

**Data:** 2026-09-24
**Status:** aceito
**Decisão:** ADR-0257

## Contexto

Implementação do ADR-0257: o jogo escolhe um teto de fps, e o veículo deixa de
andar mais rápido ou mais devagar conforme o fps.

## Decisão

### API

```ts
game.maxFps = 60;      // 0 = sem teto (padrão)
game.refreshHz;        // refresh estimado do monitor, ou null nos primeiros frames
```

Também em `new GameLoop({ maxFps })` e `loop.maxFps` para quem usa o laço solto.

### Comportamento do teto (`FrameCap`, em `src/core/GameLoop.ts`)

- Cada callback de `requestAnimationFrame` passa por `admit(agora)`. Frame
  recusado só se reagenda; `_lastTime` não muda, então o `deltaTime` seguinte
  cobre o intervalo inteiro e o tempo do jogo não se perde.
- **Alvo acumulado**: `proximoAlvo += 1000 / maxFps`. Nunca "agora + orçamento"
  — essa forma entrega 37,5 fps quando se pede 60 num monitor de 75 Hz.
- **Folga de 1 ms** no alvo, para o jitter do vsync não derrubar a taxa pela
  metade quando o teto é igual ao refresh.
- **Ressincronização**: atrasado mais de um orçamento, o alvo vira
  `agora + orçamento`. Sem isso uma travada solta uma rajada de frames.
- Trocar `maxFps` em runtime ressincroniza no frame seguinte.
- O caminho `setInterval` (Node, sem display) não aplica o teto.

### Estimativa do refresh

Mediana dos primeiros 30 intervalos crus entre callbacks (inclusive os
recusados). Uma vez; depois não custa nada.

### Aviso de judder

Com `debug` no escopo `loop`, um teto que não divide o refresh (tolerância
de 5%) gera **uma** linha, listando os tetos lisos:

```
[loop] maxFps=60 não divide o refresh (~75.0 Hz): a média bate, mas haverá
judder periódico. Tetos lisos: 75.0, 37.5, 25.0
```

### Passo do veículo (`VehicleControlSystem`)

Semi-fixed timestep: `n = ceil(dt / (1/60))`, passo `dt / n`. Para cada passo:
`vehicle.update`, `keepUpright`, `physics.step`, com `world.timestep` igual ao
passo e restaurado ao fim. `dt = 0` não avança.

| fps | passos/frame | passo |
| ---: | ---: | ---: |
| 144 | 1 | 1/144 |
| 75 | 1 | 1/75 |
| 60 | 1 | 1/60 |
| 30 | 2 | 1/60 |
| 10 (teto de delta) | 6 | 1/60 |

## Consequências

- Testes: `tests/core/FrameCap.test.ts` e
  `tests/systems/vehicleTimestep.test.ts`. Os dois foram conferidos falhando
  contra a versão errada (teto por delta; passo único por frame) antes de
  serem aceitos.
- O teto não afeta o `RapierPhysicsSystem`, que já tinha acumulador próprio.
