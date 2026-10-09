# SPEC-0337 — Passo do Rapier sem custo de corpo parado, `isSleeping` no shim e estabilizador só quando inclinado

**Data:** 2026-10-09
**Status:** aceito
**Decisão:** ADR-0336

## Contexto

R3-F3 do ciclo "75 fps no export nativo do DDD 61". Dados do R2b (engine main
0e3ea11c, jogo 9be7c6f): Rapier com 1.477 corpos (7 dinâmicos, 220 cinemáticos,
~1.250 fixos); passo de 1,1–1,4 ms/quadro a ~2,1 passos/quadro, contado dentro
do `VehicleControlSystem` (1,6–2,7 ms), que é quem chama `physics.advance`.

## Diagnóstico

1. **"Cinemáticos todos acordados" era o instrumento.** A sonda do R2b fazia
   `if (!b.isSleeping?.())`; o shim não tinha `isSleeping`, então `undefined`
   contava como acordado para todo corpo, dinâmico ou cinemático.
2. **Cinemático nunca dorme no Rapier** — nem no browser. Ele fica para sempre
   no `active_kinematic_set`, e a cada passo `advance_to_final_positions` marca
   os colliders dele como modificados, mesmo sem ter andado.
3. **Broad-phase O(fixos) por passo.** `SAPLayer::update_regions` marca todas
   as sub-regiões como sujas para toda região, tendo ela trabalho ou não. Com
   os contadores do Rapier (feature `profiler`) numa cidade sintética: broad-phase
   0,29–0,57 ms/passo, narrow-phase 0,01–0,03.

Bench `bench_idle_city` (1.250 fixos, 220 cinemáticos, 7 dinâmicos), µs/passo,
rodadas intercaladas na mesma sessão:

| caso | sem patch | com patch |
| --- | --- | --- |
| 220 cinemáticos parados | 580–1.100 | 58–62 |
| os mesmos como fixos | 500–860 | 45–69 |
| os mesmos desligados | 370–570 | 40–46 |
| só os 1.250 fixos | 330–1.230 | 37–85 |

## O que muda

### Rapier nativo (ADR-0336)

`native/rapier-native/patched/rapier3d` (0.22.0 + 2 correções, via
`[patch.crates-io]`):

- `update_regions`: sub-regiões só ficam sujas se a região tinha trabalho.
- `advance_to_final_positions`: pula o cinemático com `position == next_position`.

**Equivalência:** um rastro de 1.500 passos (bloco cinemático de 120 m cruzando
regiões, 1/7 dos cinemáticos andando, 40 dinâmicos caindo sobre prédios, chão
inteiro e chão em ladrilhos), com hash por passo dos pares em contato e das
poses, saiu **idêntico** com e sem patch. A suíte de testes do próprio crate
passa no crate patchado.

Mutação: pular TODO cinemático faz `idle_kinematic_moves_its_collider_when_commanded_again`
falhar (o teste vale). Já desligar de vez a marcação de sub-regiões **não** foi
pego por nenhum cenário que montei (inclusive o bloco grande varrendo caixas no
fundo de uma sub-região, `big_kinematic_still_pushes_small_bodies`): o
proxy grande que anda já suja a sub-região por outro caminho. A marcação
condicional é mantida por ser o que o comentário do Rapier descreve como
necessário; o argumento de segurança é a leitura do código + o rastro idêntico.

### Shim / nativo: `isSleeping`

`RigidBody.isSleeping()` no `rapier-compat.js` → `bodyGet` código **8**
(`rb.is_sleeping()`). Mesmo significado do browser: dinâmico parado dorme,
cinemático nunca. O `rapier.cpp` só repassa o código — sem mudança em C++.

### Engine: `Vehicle.keepUpright`

Se a correção do passo (`|delta|`) é menor que `UPRIGHT_MIN_CORRECTION`
(1e-5 rad/s), não escreve a velocidade angular (nem acorda o corpo). Inclinado
continua corrigindo igual.

### O que NÃO mudou (e por quê)

- **Desligar carros guardados no jogo:** com o patch, cinemático parado custa o
  mesmo que fixo e quase o mesmo que desligado. Desnecessário.
- **`VehicleControlSystem`:** o tempo dele é quase todo o passo da física; o
  resto (input, 4 rodas, câmera) é dezenas de µs.
- **Luzes dos veículos:** são do jogo (`entities/vehicleLights.ts`), registradas
  na SPEC-0124 do jogo.

## Testes

- `cargo test` (rapier-native): `is_sleeping_reports_rapier_state`,
  `idle_kinematic_moves_its_collider_when_commanded_again`,
  `big_kinematic_still_pushes_small_bodies`; `bench_idle_city` ignorado
  (instrumento: `cargo test --release bench_idle_city -- --ignored --nocapture`).
- Vitest: `rapier-compat-world.test.ts` (`isSleeping` lê o código 8),
  `Vehicle.test.ts` (nivelado não escreve; inclinado corrige).

## Medição no export

Ver "A/B no export" abaixo.
