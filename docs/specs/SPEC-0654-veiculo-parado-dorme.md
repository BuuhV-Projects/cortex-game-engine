# SPEC-0654 - Veículo parado dorme (o `VehicleArcadeSystem` não simula carro estacionado)

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
- **Corpo dormindo** no `VehicleArcadeSystem`: pula aderência, `updateVehicle` e a cópia da pose para o `Object3D`
  (a pose não muda). O Rapier tira a ilha dormindo do passo do mundo.
- **Acordar**: `Vehicle.setEngineForce` com força ≠ 0 e `setSteering` com ângulo ≠ 0 acordam o chassi; colisão de
  outro corpo (carro, personagem) o Rapier já acorda sozinho. Corpo dormindo não integra gravidade: o carro fica
  exatamente onde parou, sem afundar sem a suspensão.
- **Host**: `RigidBody.prototype.sleep` no `rapier-compat.js` (mesma API do Rapier do navegador) →
  `rn_body_set(..., 16, ...)` no `rapier-native` (`rb.sleep()`).

## Consequências

- ⚠️ No `rn_body_set` o braço padrão é `set_translation`: um `rapier_native.dll` ANTERIOR a esta SPEC trata o `16`
  como teleporte para a origem. Host, shim e DLL saem juntos no mesmo export (o export copia os três do mesmo build).

- Carro estacionado deixa de custar por subpasso; o ganho cresce com o tamanho da frota.
- Um carro dormindo não reage a força aplicada sem acordar (ex.: um `applyImpulse(..., false)` do jogo) — use o
  `wakeUp` padrão (`true`), como já é o default.
- Testes: `tests/physics/VehicleRest.test.ts` (regra de repouso) e `tests/native/rapier-compat-*.test.ts`
  (`sleep` no shim). Prova no export do Port Hollow: antes × depois na seção de validação.

## Validação (export do Port Hollow, autopiloto andando, tela cheia, `--debug`)

Rodadas intercaladas no mesmo PC (mediana dos 2/3 finais, `summary.mjs`):

| rodada | quadro JS (ms) | world | render | ui |
|---|---|---|---|---|
| antes | 75,5 | 33,0 | 35,0 | 7,5 |
| depois | 69,9 | 30,6 | 31,5 | 7,8 |
| depois (2ª) | 71,9 | 29,0 | 36,0 | 6,9 |

Sonda temporária no sistema: o passo do mundo custa ~1,5 ms/quadro; o resto do `VehicleArcadeSystem` é o laço dos
carros (4–22 ms/quadro, ~5 subpassos). Dormem 7–13 dos 35 carros (sobe ao longo da rodada); o trânsito andando (18)
não dorme — é o custo que sobra.
