# SPEC-0655 - Veículo parado dorme (o `VehicleArcadeSystem` não simula carro estacionado)

**Data:** 2026-11-01
**Status:** aceito

## Contexto

Com o export do Port Hollow rodando (SPEC-0652/0653), o jogo ficou em ~12 fps: quadro JS de 82 ms (world 35,6 +
render 38,3 + ui 8,2, mediana de rodada com o autopiloto andando). O orçamento por interruptor mostrou que nenhum
conteúdo explica o `world` — ele fica em ~35 ms sem mata, sem gente/trânsito e sem cidade. O perfil por sistema
(`?systemProfile=1`) deu `VehicleArcadeSystem` com 42% do `world` e `CharacterPhysicsSystem` com 28%.

O `VehicleArcadeSystem` avança o mundo do Rapier (`physics.advance`, passo fixo de 1/60 s: num quadro de 80 ms são
~5 subpassos) e, em CADA subpasso, roda aderência + `updateVehicle` de cada carro. A frota do Port Hollow tem 35
carros, quase todos estacionados (só freados): o controlador aplica a suspensão todo subpasso, o chassi nunca dorme e
custa como um carro andando — e o custo cresce com o próprio tempo de quadro.

Experimento (temporário, sem dormir): pular o controlador do carro quase parado levou o `world` de 35,6 para 27,1 ms
e o quadro JS de 82 para 68 ms. O resto do custo do sistema é o passo do mundo com os 35 chassis acordados.

## Decisão

- **Repouso** (`src/physics/VehicleRest.ts`, puro): um carro está em repouso no subpasso quando a força do motor é
  0, |v| < `REST_SPEED` (m/s), |ω| < `REST_SPIN` (rad/s) e todas as rodas tocam o chão. Depois de `REST_STEPS`
  subpassos seguidos (0,5 s a 60 Hz), o chassi **dorme** (`body.sleep()`). Qualquer subpasso fora do repouso zera a
  contagem. O contador mora no `ArcadeVehicleComponent`.
- **Chassi cinemático** (trânsito no trilho: o Port Hollow troca o corpo para `KINEMATIC` e o move por pose) também
  pula aderência e controlador — a pose vem do trilho, e o controlador de suspensão só gastava travessias de ponte
  a cada subpasso. A cópia da pose para o `Object3D` continua (é ela que leva o trilho até a malha). Cinemático não
  entra na contagem de repouso: no Rapier ele nunca dorme (os ~345 `sleep()` "acordados" medidos eram carros de
  trânsito parados no semáforo).
- **Corpo dormindo** no `VehicleArcadeSystem`: pula aderência, `updateVehicle` e a cópia da pose para o `Object3D`
  (a pose não muda). O Rapier tira a ilha dormindo do passo do mundo. A cópia só é pulada **depois** de feita uma vez
  com o carro já dormindo: num quadro de vários subpassos o chassi pode andar nos primeiros e dormir num seguinte, e
  a malha ficaria parada na pose do quadro anterior até ele acordar.
- **Acordar**: `Vehicle.setEngineForce` com força ≠ 0 e `setSteering` com ângulo ≠ 0 acordam o chassi; colisão de
  outro corpo (carro, personagem) o Rapier já acorda sozinho. Corpo dormindo não integra gravidade: o carro fica
  exatamente onde parou, sem afundar sem a suspensão.
- **O chassi pode dormir**: o `createVehicle` deixa de criar o corpo com `setCanSleep(false)`. Com ele, o Rapier
  deixa os limites de repouso negativos e ACORDA no passo seguinte o corpo posto para dormir (achado da revisão do
  PR #10: a primeira medição abaixo foi feita assim, com os carros piscando entre dormir e acordar). O motivo antigo
  ("o veículo do player nunca dorme") passa a ser coberto pelos setters, que acordam o chassi.
- **Host**: `RigidBody.prototype.sleep` no `rapier-compat.js` (mesma API do Rapier do navegador) →
  `rn_body_set(..., 16, ...)` no `rapier-native` (`rb.sleep()`).

## Consequências

- ⚠️ No `rn_body_set` o braço padrão é `set_translation`: um `rapier_native.dll` ANTERIOR a esta SPEC trata o `16`
  como teleporte para a origem. Host, shim e DLL saem juntos no mesmo export (o export copia os três do mesmo build).

- Carro estacionado deixa de custar por subpasso; o ganho cresce com o tamanho da frota.
- Um carro dormindo não reage a força aplicada sem acordar (ex.: um `applyImpulse(..., false)` do jogo) — use o
  `wakeUp` padrão (`true`), como já é o default.
- Testes: `tests/physics/VehicleRest.test.ts` (regra de repouso), `tests/physics/Vehicle.test.ts` (Rapier real: dormindo
  continua dormindo e parado por 30 passos sem o controlador; o motor acorda) e `tests/native/rapier-compat-*.test.ts`
  (`sleep` no shim). Prova no export do Port Hollow: antes × depois na seção de validação.

## Validação (export do Port Hollow, autopiloto andando, tela cheia, `--debug`)

Primeira medição — AINDA com `setCanSleep(false)` (o carro acordava no passo seguinte). Rodadas intercaladas no mesmo PC
(mediana dos 2/3 finais, `summary.mjs`):

| rodada | quadro JS (ms) | world | render | ui |
|---|---|---|---|---|
| antes | 75,5 | 33,0 | 35,0 | 7,5 |
| depois | 69,9 | 30,6 | 31,5 | 7,8 |
| depois (2ª) | 71,9 | 29,0 | 36,0 | 6,9 |

Sonda temporária no sistema: o passo do mundo custa ~1,5 ms/quadro; o resto do `VehicleArcadeSystem` é o laço dos
carros (4–22 ms/quadro, ~5 subpassos). Dormem 7–13 dos 35 carros (sobe ao longo da rodada); o trânsito andando (18)
não dorme — é o custo que sobra.

Depois da revisão (chassi pode dormir, cinemático fora do laço, limites de repouso folgados), sonda temporária no
sistema, Port Hollow com 45 carros (28 de trânsito cinemático no trilho, 17 dinâmicos):

| | laço dos carros (ms/quadro) | `advance` total (ms/quadro) |
|---|---|---|
| antes (só o sono) | 9,0 – 16,0 | 11,5 – 18,2 |
| depois (cinemático pulado) | 4,7 – 5,0 | 6,4 – 7,7 |

Pendência: os 17 carros dinâmicos estacionados quase não dormem no jogo (0–4 na rodada), embora durmam nos testes
com Rapier real (WASM e o crate do host). O que os mantém acordados no jogo ainda não foi isolado.
