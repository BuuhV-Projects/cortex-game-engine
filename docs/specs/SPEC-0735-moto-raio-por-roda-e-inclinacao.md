# SPEC 0735 - Veículo: raio por roda e inclinação visual (motos)

**Data:** 2026-11-14
**Status:** implementado

## Contexto

Motos do Port Hollow (ADR-0301/SPEC-0302 do jogo) são `Vehicle` de 4 rodas. Elas precisam de duas
coisas que a engine não tinha: rodas de tamanhos diferentes girando certo e inclinação na curva.
A escolha do alvo da inclinação está no ADR-0734.

## Decisão

### 1. Raio por roda (`VehicleControlSystem`)

Antes, todas as rodas giravam com o ângulo acumulado de `wheels[0].radius`. Agora cada roda
acumula o seu: `roll[i] += forwardSpeed / wheels[i].radius × dt` (sem raio, cai em 0,4 m). Num
carro de 4 rodas iguais, o resultado é o mesmo de antes.

### 2. Inclinação visual (`VehicleLean`)

`new VehicleLean(object, { maxLean?, leanRate?, gravity? })`:

- `object`: nó **filho** da malha do chassi. A rotação de base dele é guardada na construção.
- `maxLean` (rad, default 0,6), `leanRate` (1/s, default 6), `gravity` (m/s², default 9,81).
- `update(vehicle, dt)`: alvo = `clamp(−atan(v·ω_up/g), ±maxLean)`, aproxima com
  `min(1, dt·leanRate)` e grava `object.quaternion = base × Rz(angle)`. `angle` fica público.
- Não escreve nada no corpo do Rapier.

Uso:

- **Jogador:** `VehicleControlOptions.lean = { object: Object3D | string, ...opções }`. Um nome
  é procurado com `car.getObjectByName`. Um nó que não existe, ou que é a própria raiz, desliga a
  inclinação (com aviso no `debug`).
- **Frota:** `arcadeVehicleComponent.lean = new VehicleLean(node)`. O `VehicleArcadeSystem` atualiza
  a inclinação de todo carro `'physics'` a cada quadro, inclusive dormindo (assim ela volta a 0),
  e nunca de carro `'external'`.
- Sem a opção, nada muda.

### 3. Estado do piloto (`VehicleControlSystem`)

Getters de leitura: `throttleLevel` (0..1, o acelerador suavizado), `braking` (freio de pedal ou de
mão neste quadro) e `reversing` (dando ré). Com o sistema inativo, ficam `false`, exceto o
`throttleLevel`, que mantém o último valor.

## Consequências

- Testes: `tests/systems/vehicleWheelsLean.test.ts`.
- Host nativo: só usa `forwardSpeed`, `body.angvel()` e `body.rotation()`, que já existem no shim.
