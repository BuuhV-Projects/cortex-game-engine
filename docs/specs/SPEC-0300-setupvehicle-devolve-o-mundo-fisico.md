# SPEC-0300 - `setupVehicle` devolve o mundo físico

**Data:** 2026-10-04
**Status:** aceito

## Contexto

O `setupVehicle` cria um `RapierPhysics` próprio (`RapierPhysics.create()` monta um
mundo novo a cada chamada), põe nele o carro e os colisores do terreno/estrada, e
devolve só `{ vehicle, rig, speedo, options, engineSound }`. O mundo fica
inacessível.

Isso impede o jogo de pôr qualquer outro corpo **no mesmo mundo do carro**. O
caso concreto veio do jogo DDD 61: na perseguição, o carro do
suspeito (guiado pelo jogo, cinemático) precisa colidir com o carro do jogador.
Sem o mundo, a única saída era simular a batida mexendo na velocidade do chassi,
uma aproximação por círculo.

## Decisão

`VehicleHandle` ganha o campo **`physics: RapierPhysics`**: o mesmo mundo em que
o `setupVehicle` criou o carro e os colisores. Com ele, o jogo usa a API que já
existe (`physics.addBody({ type: 'kinematic' | 'fixed' | 'dynamic', … })`) e os
corpos novos colidem com o carro de verdade.

- Quem avança o mundo continua sendo o `VehicleControlSystem` (um `advance` por
  quadro). O jogo **não** deve chamar `physics.step()`/`advance()` de novo, ou o
  mundo andaria duas vezes.
- Corpo cinemático: o jogo chama `setNextKinematicTranslation` (e `setRotation`)
  a cada quadro, e o próximo passo empurra/bloqueia o carro.

## Consequências

- Mudança aditiva: nenhum chamador existente quebra.
- Sem teste automatizado próprio: montar o `setupVehicle` exige `Game` com canvas
  e o WASM do Rapier, que a suíte da engine não sobe. A mudança é um campo a mais
  no retorno, coberta pelo typecheck. O uso real foi validado no jogo, com o
  carro do suspeito batendo no do jogador.
- Doc da API regenerada (`yarn docs:engine`) e guia `engine-api.md` atualizado.
