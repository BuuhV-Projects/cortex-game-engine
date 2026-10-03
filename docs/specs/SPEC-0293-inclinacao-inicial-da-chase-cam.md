# SPEC-0293 - Inclinação inicial da chase cam

**Data:** 2026-10-03
**Status:** aceito

## Contexto

A chase cam do `VehicleControlSystem` começava sempre com `camPitch = 0.32` rad,
fixo no código. A altura real fica `camHeight + camDistance·sin(pitch)`: com a
câmera larga da fase 2 do crash-bandicoot-racer (20 m), isso somava ~6 m e a
câmera subia de ~8 m (a câmera parada, aprovada pelo usuário) para ~12 m assim
que o jogador acelerava. O jogo não tinha como pedir outro ângulo.

## Decisão

`VehicleControlOptions.camPitch` (rad, opcional) define a inclinação inicial,
aplicada no primeiro posicionamento da câmera. Default `0.32`, o valor antigo.
Mouse e 2º stick continuam alterando a inclinação depois disso.

## Consequências

- Quem não passa `camPitch` não muda.
- Com `camPitch: 0`, `camDistance`/`camHeight` são literalmente a posição da
  câmera atrás e acima do carro.
