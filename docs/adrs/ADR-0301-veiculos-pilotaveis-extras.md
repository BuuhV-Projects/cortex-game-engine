# ADR-0301 - Veículos pilotáveis extras no mesmo mundo físico

**Data:** 2026-10-04
**Status:** pendente (proposto, ainda não implementado)

## Contexto

O jogo Detetive Brasília (`D:/jogos/detetive-brasilia`) ganhou dois trabalhos
que precisam de um **segundo veículo pilotável** além do carro do jogador: a
moto do delivery (SPEC-0027 do jogo) e o ônibus do motorista (SPEC-0028 do
jogo). Os dois precisam bater no mesmo mundo do carro: trânsito e ônibus da IA
(corpos cinemáticos), carros estacionados, paredes.

O `setupVehicle` (SPEC-0300 já devolve o `physics` do carro) monta **um**
veículo com o seu `VehicleControlSystem` e o passo do mundo. Os dois trabalhos
contornaram, no jogo, três lacunas da engine:

1. **Sem passo pra veículo extra.** O caminho foi `physics.createVehicle(...)`
   no mesmo mundo + um `VehicleControlSystem` próprio com `stepPhysics: false`
   (input, câmera, rodas). Só que, com `stepPhysics: false`, ninguém chama
   `vehicle.update()` nem `keepUpright()` do veículo extra a cada sub-passo. O
   jogo **embrulha `physics.advance`** na instância pra rodar os dois em cada
   sub-passo (`missions/delivery/motoRide.ts`, `missions/onibus/busVehicle.ts`).
   Chamar `setupVehicle` de novo foi descartado: cria **outro mundo físico**, e
   o veículo não bateria em nada do jogo.
2. **Força máxima da suspensão não configurável.** A suspensão do raycast
   vehicle do Rapier corta a força em ~6000 N por roda e a engine não expõe
   `maxSuspensionForce`. Um ônibus com massa real (12 t) afundava o chassi no
   chão e não andava. O jogo usa 1,8 t e simula o peso pelas forças de motor e
   freio.
3. **Sem "desligar corpo" seguro em todo host.** Fora do trabalho o veículo
   extra precisa sumir da física. O ônibus usa `body.setEnabled(false)`; a moto
   fica dormindo numa plataforma embaixo do mapa (y = −80), por não haver um
   desligar que seja confiável no host nativo.

## Decisão (proposta)

1. **Veículos extras no mesmo mundo:** o `setupVehicle` (ou o handle que ele
   devolve) ganha um jeito de **registrar veículos extras** no mesmo passo do
   mundo — ex.: `handle.addVehicle(config, model)` devolvendo o próprio
   `Vehicle` + controle, com `update`/`keepUpright` chamados pela engine em cada
   sub-passo, e troca de qual veículo recebe o input/câmera. Alternativa a
   avaliar: o `VehicleControlSystem` aceitar uma lista de veículos.
2. **`maxSuspensionForce`** (e talvez `frictionSlip` por roda) no config do
   veículo, repassado ao Rapier.
3. **Ligar/desligar veículo:** `vehicle.setActive(on)` que tira e devolve o
   corpo da simulação de forma suportada nos dois hosts (navegador e nativo).

Quando implementar, decidir entre as alternativas de cada item acima e mudar o
status deste ADR pra "aceito".

## Consequências

- Até lá, os jogos que precisarem de mais de um veículo pilotável repetem o
  contorno do Detetive Brasília (embrulhar `physics.advance`).
- Com a mudança, o jogo remove os contornos (o embrulho do `advance`, a massa
  reduzida do ônibus e a plataforma embaixo do mapa da moto).
- Ônibus e caminhões com massa real passam a ser viáveis.
