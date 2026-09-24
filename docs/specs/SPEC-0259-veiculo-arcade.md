# SPEC-0259 — Veículo arcade: aderência ao chão e frota no mesmo mundo

**Data:** 2026-09-24
**Status:** aceito
**Decisão:** ADR-0256

## Contexto

Primeira fase do ADR-0256: o que o kart-racer precisou escrever contra a
engine para ter feel arcade vira API. Três peças, todas extraídas de código que
rodou em produção no Studio e no export nativo.

## Decisão

### 1. `Vehicle` — o que faltava expor

| membro | por quê |
| --- | --- |
| `body` (antes privado) | aderência e impulsos precisam do corpo; o kart-racer já o acessava por fora |
| `wheelFilterGroups?: number` | grupos de interação (`InteractionGroups`) do raycast das rodas |
| `suspensionRestLength`, `suspensionStiffness` | a aderência calcula o assentamento; mantidos por `applyTuning` |

**Grupos, não callback.** O kart-racer filtrava as rodas com um predicate
(monkey-patch em `controller.updateVehicle`) para os carros em respawn virarem
fantasma. O host nativo **ignora** o predicate (SPEC-0209 — só avisa no
console): o fantasma nunca funcionou no export. Grupos o host suporta. Expor o
predicate repetiria a armadilha.

Os getters de suspensão ficam no `Vehicle` e não no controller do Rapier
porque o shim do host não implementa `wheelSuspensionRestLength` nem
`wheelSuspensionStiffness`.

### 2. `GroundAdhesion` (`src/physics/GroundAdhesion.ts`)

Porta do `CarSystem.followGround` do kart-racer. Restringe **só altura, pitch e
roll** ao chão; o Rapier segue dono de esterço, tração, suspensão, freio e
colisão horizontal com paredes.

Por passo, antes do `vehicle.update`:

1. Raio no centro do chassi. Sem chão embaixo → `grounded = false` (solta o
   carro na borda de um penhasco).
2. Um raio por roda, na base do pneu assentado
   (`restLength − sag + raio`). Menos de 3 apoios → solto.
3. Plano do apoio:
   - todas as rodas apoiadas: `frente = Σ ponto·sinal(z local)`,
     `direita = Σ ponto·sinal(x local)`, `normal = frente × direita`. Com 4
     rodas é exatamente o `fl+fr−rl−rr` do kart-racer, mas não depende da ORDEM
     das rodas nem de serem 4;
   - apoio parcial: plano pelos 3 primeiros pontos apoiados (média de normais
     faria o chassi pular quando um raio cruza o meio-fio).
4. Normal mais inclinada que `minNormalY` → solto (parede não é chão).
5. Chassi alinhado ao plano, mantendo a direção de avanço projetada nele.
6. Altura média dos apoios; salto maior que `snapDistance` → solto (não gruda
   num viaduto que passa embaixo).
7. Velocidade girada junto com o chassi e projetada no plano, **sem devolver**
   velocidade perdida em batida.
8. Gravidade ao longo da pista cancelada (uma vez por passo): subida e descida
   respondem igual ao acelerador — é o que torna o feel "arcade".

Raios só enxergam corpo **fixo** e não-sensor, e excluem o próprio chassi —
filtro por flag, resolvido dentro do Rapier (sem callback JS por acerto).

| opção | padrão | significado |
| --- | ---: | --- |
| `snapDistance` | 0,65 m | quanto o chão pode "puxar" o carro por passo |
| `probeRise` | 0,45 m | quanto acima da base do pneu o raio nasce |
| `minNormalY` | 0,55 | inclinação máxima dirigível (~57°) |
| `airborneProbe` | 0,12 m | alcance do raio quando já está no ar |

Estado público: `grounded`, `groundNormal`.

### 3. `VehicleArcadeSystem` + `ArcadeVehicleComponent`

O `VehicleControlSystem` supõe **um** carro e avança o mundo sozinho. Com seis,
os carros da IA davam `vehicle.update` fora do passo do mundo — foi por isso
que o kart-racer escreveu o próprio laço de substeps.

`VehicleArcadeSystem(physics)` avança o mundo UMA vez por passo, para todos os
carros da cena:

```
por frame: semi-fixed timestep (≤ 1/60, igual ao ADR-0257)
  por passo:
    para cada carro: adhesion.apply(passo); vehicle.update(passo)
    physics.step()
  para cada carro: Object3D ← pose do chassi
```

- Prioridade **8** (o slot da física). Pilotos — o input do jogador (30) e
  scripts de IA (50, `ScriptHostSystem`) — escrevem motor/freio/esterço, que
  valem no passo do frame seguinte. Atraso igual para todo piloto; a câmera
  (30) sempre vê a pose recém-calculada.
- Um piloto é **qualquer código que chame** `setEngineForce`/`setBrake`/
  `setSteering`. A IA de corrida é um `ScriptBehavior` do jogo — o gancho de
  extensão que o ADR-0256 pede já existe.
- `ArcadeVehicleComponent({ vehicle, object, adhesion? })` — sem `adhesion`, o
  carro é simulação pura, mas ainda avança no passo compartilhado.

`VehicleControlSystem` ganha `stepPhysics?: boolean` (padrão `true`). Com
`false` ele só lê input, sincroniza e posiciona a câmera — o passo fica com o
`VehicleArcadeSystem`. Sem essa opção os dois avançariam o mesmo mundo.

### 4. Progresso em rota (`src/scene/Route.ts`)

Porta do `raceMath` + `routeIndex` do kart-racer, funções puras sobre uma rota
fechada (`RoutePoint[]`, sentido de percurso):

| função | pergunta que responde |
| --- | --- |
| `routeIndexOf` | perímetro e distância acumulada (calculado 1× por rota, `WeakMap`) |
| `nearestRoutePoint(pos, rota, semente?)` | ponto mais próximo; com semente, janela de ±12 pontos |
| `projectOnRoute` | posição contínua `{index, offset}` |
| `sampleRoute` | ponto a N metros (busca binária, dá a volta) |
| `routeSeparation` | distância com sinal entre duas posições, atravessando a chegada |
| `crossesGate` | passou pelo portal, para a frente, dentro da pista? |
| `sectorProgress` | fração percorrida de um setor |
| `routeCurvature`, `routeFrame` | curvatura e direção local — o que a IA de corrida usa |

Nada aqui sabe o que é volta ou corrida: o jogo define as regras e mede com
isto. `RaceGate` virou `RouteGate` (serve a checkpoint, patrulha, trilho).

Paridade com o original verificada com igualdade EXATA em 3.000 consultas
aleatórias sobre a rota real do kart-racer (384 pontos), antes do commit. Dois
desvios, ambos sem efeito em rota válida: `sampleRoute` numa rota degenerada
devolvia o próprio ponto da rota (quem mexesse no retorno corrompia a rota) e
agora copia; `projectOnRoute` não aloca mais um array por chamada.

## Consequências

- Não usar `VehicleArcadeSystem` e `RapierPhysicsSystem` no mesmo
  `RapierPhysics`: ambos avançam o mundo.
- O fantasma de respawn passa a ser possível no export (grupos), mas a regra
  de QUANDO um carro vira fantasma continua sendo do jogo.
- Testes com Rapier real em `tests/physics/GroundAdhesion.test.ts` e
  `tests/systems/VehicleArcadeSystem.test.ts`; rota em `tests/scene/Route.test.ts`.
