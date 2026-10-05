# SPEC-0306 - Pausa do veículo lida ao vivo das opções

**Data:** 2026-10-05
**Status:** aceito

## Contexto

No Detetive Brasília, com o menu de pausa aberto o carro do detetive seguia
andando/deslizando. O jogo faz o que o `VehicleHandle` sugere: recebe `options`
de `setupVehicle` e troca a função depois
(`options.pauseWhen = () => antiga() || menu.isOpen`).

Só que o `VehicleControlSystem` copiava `options.pauseWhen` para o campo
`System.pauseWhen` **no construtor** — e o `World.tick` consulta só esse campo.
A troca posterior nunca chegava ao sistema: o controle e o `physics.advance`
(que avança o mundo Rapier inteiro — carro, veículos que pegam carona no
subpasso, corpos cinemáticos) continuavam rodando com o menu aberto.

O mesmo vale para as marcas de pneu criadas pelo `setupVehicle`, que tinham uma
função de pausa própria (`editorActive || gameplayPaused`) em vez da do carro.

## Decisão

- `VehicleControlSystem` define `this.pauseWhen` como uma função que lê
  `this.options.pauseWhen` **a cada quadro**. Trocar `options.pauseWhen` depois
  de criado o sistema passa a valer no quadro seguinte.
- `setupVehicle` faz o `SkidMarkSystem` pausar pela mesma
  `options.pauseWhen` do carro (lida ao vivo), não por uma cópia.

Com a pausa ligada o sistema não roda: nenhum subpasso de física, velocidade e
posição do chassi intactas. Ao despausar, o próximo quadro avança só o `dt`
daquele quadro (o `advance` é semi-fixo, sem acumulador — ADR-0257), então não
há salto de tempo acumulado.

## Consequências

- `options.pauseWhen` do `VehicleHandle` é mutável de fato (documentado no
  TSDoc). Os demais campos já eram lidos ao vivo pelo `update`.
- Teste: `tests/systems/vehiclePauseLive.test.ts` — Rapier real, carro acelera,
  troca a pausa nas opções, N quadros parado com posição/velocidade idênticas,
  despausa e volta a andar.
