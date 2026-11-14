# ADR 0734 - Inclinação visual de veículo pela guinada do corpo

**Data:** 2026-11-14
**Status:** aceito

## Contexto

O Port Hollow vai ter motos, scooters e ATVs como `Vehicle` de raycast da frota, com 4 rodas
(ADR-0301 do jogo): na moto, FL e RL são as rodas reais e FR/RR ficam com bitola mínima. O corpo
do Rapier fica de pé (o `GroundAdhesion` e o `keepUpright` seguram pitch e roll), mas a moto
precisa **parecer** que inclina na curva.

O jogador dirige pelo `VehicleControlSystem`, que conhece o esterço. Na frota do
`VehicleArcadeSystem`, quem dirige (IA, roteiro) escreve direto em `vehicle.setSteering`, e o
`Vehicle` não guarda o ângulo.

## Decisão

A inclinação é **só visual** e o alvo vem da **guinada do próprio corpo**:

```
lean = clamp(−atan(v · ω_y / g), ±maxLean)    // v = forwardSpeed, ω_y = guinada no eixo up do chassi
```

suavizado por `leanRate` e aplicado como rotação em torno do eixo +Z local de um **nó filho** da
malha (`base × Rz(lean)`). O corpo do Rapier nunca é tocado. A classe `VehicleLean`
(`src/physics/VehicleLean.ts`) serve aos dois sistemas.

### Alternativas consideradas

- **Alvo pelo esterço × velocidade.** Era o pedido original. Rejeitada porque a frota não sabe o
  esterço: seria preciso guardar o ângulo no `Vehicle` (o `RapierPhysics.ts` já está no limite de
  500 linhas) ou exigir que cada IA informe o esterço. Pela guinada, o mesmo código serve jogador,
  IA e replay, e o resultado é o mesmo em curva normal (ω ≈ v·tan(esterço)/entre-eixos).
- **Inclinar o corpo do Rapier.** Rejeitada: brigaria com o `GroundAdhesion`, o `keepUpright` e a
  suspensão das 4 rodas.

## Consequências

- Derrapagem e rodopio também inclinam (há guinada). O `maxLean` e a suavização limitam o efeito.
- O nó da inclinação tem que ser **filho** da malha do chassi: a raiz recebe a pose do corpo a
  cada quadro e perderia a rotação.
- Só usa `forwardSpeed`, `body.angvel()` e `body.rotation()`, que o shim do Rapier do host nativo
  já oferece.
- Detalhes: SPEC-0735.
