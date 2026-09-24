# ADR-0256 — Carro por composição: o que sobe do kart-racer para a engine

**Data:** 2026-09-24
**Status:** aceito

## Contexto

O kart-racer vai ser encerrado e um jogo de corrida novo (estilo Asphalt
Xtreme / Mario Kart) começa em seguida. A pergunta é o que daquele código
merece virar engine.

Medição do que existe hoje no jogo:

| arquivo | linhas | métodos |
| --- | ---: | ---: |
| `systems/CarSystem.ts` | 820 | 53 |
| `systems/KartSystem.ts` | 532 | 28 |
| `systems/RaceSystem.ts` | 244 | 11 |
| `entities/createCar.ts` | 141 | 2 |
| `components/CarComponent.ts` | 146 | 0 |

São ~1.900 linhas em quatro arquivos que fazem, entre os dois maiores, cinco
trabalhos que não têm relação entre si: feel de direção, IA de rival, itens,
garagem e respawn. `CarSystem` com 53 métodos é o caso extremo — mudar a curva
de aderência exige abrir o mesmo arquivo que guarda o `localStorage` da
pintura do carro.

O achado que mais pesa nesta decisão não é o tamanho, é **contra o que** esse
código foi escrito. A engine entrega um veículo raycast completo
(`RapierPhysics.createVehicle`, classe `Vehicle`, `applyTuning`, `keepUpright`,
`VehicleControlSystem`, `setupVehicle`) — e o kart-racer **desativa quase tudo**
para conseguir feel arcade:

- `createCar.ts:107` — `setEnabledRotations(false, true, false, true)` desliga
  pitch e roll, e `uprightStrength: 0` desliga o anti-capotamento da engine.
- `CarSystem.ts:718` — `followGround`, ~100 linhas, reimplementa a aderência ao
  chão com 4 raycasts próprios, porque a suspensão do Rapier dá carro de
  simulação, não de kart.
- `CarSystem.ts:193` — monkey-patch em `controller.updateVehicle` do Rapier.
- `CarSystem.ts:395` — chama `controller.update` à mão, num laço de substep
  próprio, em vez de deixar o `GameLoop` conduzir.

Ou seja: não é que o jogo tenha preferido não usar a engine. É que **falta um
modo na engine**, e o jogo pagou ~1.900 linhas para contornar essa falta. O
próximo jogo de corrida pagaria de novo.

## Decisão

### O critério

Sobe para a engine o que **qualquer** jogo de corrida refaria igual. Fica no
jogo o que é **design** — a regra que distingue este jogo do próximo.

O teste prático: se dois jogos diferentes escreveriam o mesmo código, é engine.
Se escreveriam código diferente, é jogo — mesmo que a estrutura seja parecida.

### O que sobe

| peça | origem | por quê |
| --- | --- | --- |
| **Modo arcade do veículo** — aderência ao chão, grip por superfície, pitch/roll como gameplay | `CarSystem.followGround` (~100 l.) | todo kart refaz isto; hoje exige lutar contra a engine |
| **Passo fixo no veículo** | SPEC-0016 do jogo | o `VehicleControlSystem` amarra a velocidade da física ao fps — ver ADR-0257 |
| **Progresso em rota** — projeção, gates, volta, ordem | `raceMath.ts` + `routeIndex.ts` | genérico para qualquer percurso; o código já é limpo |
| **Extensão por script** | — | o gancho que substitui o monkey-patch |

### O que fica no jogo

IA de rival (`driveAI`, `projectCar`), itens e combate, garagem, HUD, cutscene,
grid de largada. Tudo isto é o design do jogo: outro jogo de corrida escreveria
diferente, e uma abstração que servisse aos dois seria pior que as duas cópias.

### O que morre

- O **monkey-patch** em `controller.updateVehicle` — vira ponto de extensão de
  verdade (abaixo).
- O **laço de substep próprio** do `CarSystem` — o passo fixo passa a ser do sistema de veículo da engine.
- O gatilho de skid do `setupVehicle` (`VehicleSetup.ts:122`), que dispara por
  `LT ou tecla S` em vez de por slip medido. É uma marca de rascunho, não uma
  decisão.

### A decomposição

`CarSystem` (820 l.) vira quatro peças com uma responsabilidade cada:

```
VehicleArcadeSystem   (engine)  aderência, grip, feel        ← followGround
  └─ pontos de extensão via ScriptBehavior
AIDriverSystem        (jogo)    driveAI, projectCar
GarageSystem          (jogo)    customize, appearance, persistência
RespawnSystem         (jogo)    reset, updateRespawn
```

`KartSystem` (532 l.) se separa em itens (jogo) e drift/boost (candidato a
engine numa segunda rodada — fica fora deste ADR porque ainda não sabemos se o
jogo novo quer miniturbo de Mario Kart ou boost de Asphalt, e são curvas
diferentes).

### Extensibilidade: script, não herança

O `VehicleArcadeSystem` expõe os pontos de decisão do feel — aderência, grip por
superfície, tração — como hooks que um script anexado sobrescreve. **A engine já
tem o mecanismo**: `ScriptBehavior` + `ScriptHostSystem` (ADR-0085), com
componente Script visível no Inspector.

Assim "kart", "off-road" e "carro de rua" viram três scripts, não três forks do
sistema — e o ajuste de feel acontece no Inspector, ao vivo, sem recompilar.

Não se cria herança nem interface de estratégia nova: o gancho que existe
resolve, e um segundo mecanismo de extensão para a mesma coisa seria dívida.

## Consequências

- O jogo novo começa com ~1.900 linhas a menos de código que não é dele.
- Tunar o feel do carro deixa de exigir editar um arquivo de 820 linhas e passa
  a ser um script no Inspector — que é onde a regra do projeto já manda o dado
  editável morar.
- Quem mantém o kart-racer não ganha nada: ele está encerrado e **não será
  migrado**. A migração seria trabalho puro sem usuário.
- `followGround` subir para a engine significa que a engine passa a ter **dois**
  modelos de veículo (simulação e arcade). É custo real de manutenção, aceito
  porque o modelo de simulação sozinho já se provou insuficiente — o único jogo
  de carro que existiu no motor o desativou inteiro.
- Drift/boost ficam fora por ora. Se o jogo novo os pedir, entram com medida do
  que o jogo realmente usou, não por antecipação.
