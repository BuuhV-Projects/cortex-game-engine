# ADR-0672 - Teto de subpassos de física por quadro (o tempo desacelera)

**Data:** 2026-11-03
**Status:** aceito (complementa o ADR-0257: o passo semi-fixo continua; ganha teto de passos)

## Contexto

O `RapierPhysics.advance(dt)` (ADR-0257) anda `dt` em `ceil(dt / (1/60))` passos iguais. Não há teto além do
`MAX_DELTA_MS = 100` do `GameLoop`: um quadro de 50 ms vira 3 passos, um de 100 ms vira 6. No DDD 00 (Port Hollow,
export nativo) o `world` mede 31–58 ms e o passo do Rapier (`VehicleArcadeSystem`) come 37–62% dele. Quadro lento →
mais passos → quadro mais lento: espiral de subpassos.

## Decisão

`advance` dá no máximo `maxStepsPerFrame` passos (default `MAX_PHYSICS_STEPS = 3`, propriedade pública do
`RapierPhysics`, que o jogo pode trocar). Acima de `maxStepsPerFrame × 1/60` s, o excedente é **descartado**: a
simulação anda `3/60 s` naquele quadro e o tempo do jogo desacelera, como o `max_physics_steps_per_frame` do Godot.
Cada passo continua ≤ 1/60 s.

Alternativas consideradas:

1. **Sem teto (como estava).** Correto em tempo, mas é a espiral: o custo da física cresce com o atraso.
2. **Teto com passos maiores** (`dt / 3` mesmo acima de 1/60). Mantém o tempo real, mas passa do limite de
   estabilidade da suspensão raycast (o motivo do `MAX_PHYSICS_STEP_S` no ADR-0257).
3. **Acumulador com passo fixo + interpolação.** Resolveria também o jitter, mas troca o modelo do ADR-0257 (pose
   interpolada, um quadro de atraso visual) e todo consumidor de pose. Fora do escopo de um teto.
4. **Teto com descarte (escolhida).** Uma linha de cálculo, sem mudar o modelo. O Godot guarda no máximo um passo no
   acumulador; aqui não há acumulador (o passo é semi-fixo), então não sobra nada guardado — o excedente some.

## Consequências

- A partir de 20 fps (50 ms) a física anda mais devagar que o relógio: a 10 fps (o teto de 100 ms do `GameLoop`),
  metade. Antes andava em tempo real e custava o dobro de passos.
- Quem precisa do tempo real a qualquer custo (replay determinístico por relógio, teste) sobe o
  `physics.maxStepsPerFrame`.
- Ninguém consome o número de passos nem um `alpha` de interpolação (verificado: `VehicleArcadeSystem`,
  `VehicleControlSystem`; `CharacterPhysicsSystem` e `RapierPhysicsSystem` não usam `advance`), então nada mais muda.
