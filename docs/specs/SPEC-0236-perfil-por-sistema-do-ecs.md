# 0236 - Perfil por sistema do ECS

**Data:** 2026-09-20
**Status:** aceito

## Contexto

O ADR-0235 fechou a frente de render com o teto medido e apontou o próximo
alvo: o **`world`**, que custa **9,8 ms** (31% do frame de 31,6 ms) e **nunca
foi investigado**. O trace o reportava como um bloco só — dava para saber que
era caro, não o que dentro dele era caro.

O `FrameProfiler` (SPEC-0134) mede as seções do frame (`input`, `update`,
`world`, `ui`, `render`). Faltava o nível abaixo: **qual sistema do ECS**.

## Decisão

`World.tick` passa a cronometrar cada `system.update` separadamente, acumulando
por nome de classe num mapa. Desligado por default e ligado por
`?systemProfile=1` — cronometrar todo sistema todo frame é instrumento, não
comportamento de produção.

Os valores entram no trace com o prefixo `sys` (`cpu.sysCarSystem`), no mesmo
mapa `cpu` onde já moram o `napi` (SPEC-0225) e as fases do render
(SPEC-0227).

### Como ler (armadilha que custou uma leitura errada)

O acumulador é zerado **quando o trace grava a amostra**, e não a cada frame.
Ou seja: o valor de `sysX` é o tempo somado **na janela de 500 ms da amostra**,
não o tempo por frame. Na primeira leitura os sistemas somaram 147 ms, o que
parecia absurdo contra um `world` de 9,8 ms — até notar que 147 ms é
exatamente `9,8 ms × 15 frames`, os frames que cabem na janela.

Para ler por frame: `sysX ÷ (500 ÷ frameMs)`. A soma dos sistemas bater com
`world × frames` é, aliás, uma boa checagem de que a medição está sã.

## Resultado (20/09/2026, kart-racer, `?bench&systemProfile=1`)

Frame 31,6 ms, `world` 9,8 ms, 101 amostras. Por frame:

| sistema | ms | do `world` |
| --- | --- | --- |
| **`CarSystem`** | **8,56** | **87%** |
| `RaceSystem` | 0,53 | 5% |
| `KartSystem` | 0,16 | 2% |
| `SpeedEffectSystem` | 0,03 | ~0% |
| `GameUiSystem` | 0,03 | ~0% |

**Um sistema responde por 87% do `world` e 27% do frame inteiro.** É o alvo
mais concentrado encontrado no dia inteiro — mais até que qualquer fase do
render, onde o custo estava espalhado.

### Dentro do `CarSystem` (medido com sonda temporária, revertida)

Cronometrando as fases dele por frame, com a mesma corrida:

| fase | ms | do `CarSystem` |
| --- | --- | --- |
| **`driveAI`** (a IA que pilota) | **3,4** | 42% |
| `kart.step` (física, Rapier) | 2,4 | 30% |
| `syncVehicle` (pose das rodas) | 1,27 | 16% |
| rivais (`followGround` + `vehicle.update`) | 0,58 | 7% |

Uma ressalva que muda a leitura: no `?bench` a IA pilota **os 6 carros**,
inclusive o do jogador (SPEC-0007 do jogo). Numa partida de verdade são 5, então
o `driveAI` real fica por volta de **2,8 ms** — ainda o maior item.

A sonda foi instrumentação de diagnóstico e **não ficou no jogo**: o
`CarSystem.ts` voltou ao estado original depois da medição.

Ou seja, o próximo alvo concreto de performance é do **jogo, não da engine**: a
IA e o passo de física do `kart-racer` somam ~5,8 ms por frame, 18% do frame
inteiro. E o `driveAI` já foi otimizado uma vez (SPEC-0008 do jogo o tirou de
36 chamadas por frame para 6), o que sugere que a próxima rodada precisa mudar
o algoritmo, não a frequência.

## Consequências

- O instrumento é do **engine** e serve a qualquer jogo, não só ao kart-racer.
- O custo quando desligado é um `if` por sistema por tick.
- A frente de performance muda de lugar: sai do render (mapeado, com teto
  conhecido no ADR-0235) e vai para a lógica de jogo, que nunca foi olhada.
