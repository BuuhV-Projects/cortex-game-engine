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

O `CarSystem` do jogo faz, por frame: a IA que pilota os 6 carros, a física de
veículo com raycast por roda (24 raycasts por passo, via BVH) e o `syncVehicle`
que escreve a pose das rodas. Qual dos três domina **ainda não foi medido** — e
essa é a próxima pergunta, não uma conclusão desta spec.

## Consequências

- O instrumento é do **engine** e serve a qualquer jogo, não só ao kart-racer.
- O custo quando desligado é um `if` por sistema por tick.
- A frente de performance muda de lugar: sai do render (mapeado, com teto
  conhecido no ADR-0235) e vai para a lógica de jogo, que nunca foi olhada.
