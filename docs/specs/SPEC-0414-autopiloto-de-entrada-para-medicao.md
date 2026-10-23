# SPEC-0414 - Autopiloto de entrada para medição (controle virtual do Xbox)

**Data:** 2026-10-23
**Status:** aceito
**Relacionados:** ADR-0415 (ponto de injeção), SPEC-0382 (kit de medição), SPEC-0198 (perf trace), PRD-0009

## Contexto

Rodada parada num ponto não mostra as quedas de fps de quem joga. O kit do PRD-0009 precisa medir o
jogo em movimento — andar, correr, pular, mirar e atirar, girar a câmera, entrar no carro e dirigir —
e os dois braços de um A/B têm que fazer a mesma coisa.

## Decisão

### Ligar

`?autopilot=<perfil>` na query do jogo (no export, `CORTEX_LAUNCH_QUERY`). Sem a query o `Game` não
cria nada. Perfil desconhecido lança erro no boot (rodada morta é melhor que rodada parada marcada
como "em movimento").

### Controle virtual

`InputAutopilot` (`src/input/InputAutopilot.ts`) troca `navigator.getGamepads` por uma função que
devolve um pad `standard` no slot 0 e `null` nos outros (ADR-0415). O estado é reescrito no lugar,
sem alocar por quadro. O `Game` avança o roteiro no `_update`, antes do `gamepad.poll()`, com o `dt`
do relógio do jogo.

### Perfil (dado)

Perfis embutidos em `src/input/autopilotProfiles.ts`. Um perfil é uma lista de passos tocados em
ciclo:

```json
{ "steps": [
  { "s": 3, "axes": { "leftY": -1 } },
  { "s": 0.2, "buttons": ["A"] },
  { "s": 0.6, "buttons": ["LT"] },
  { "s": 1.5, "buttons": ["LT", "RT"] }
] }
```

- `s`: duração em segundos, mínimo 0,1 s (um passo mais curto que um quadro poderia ser pulado e o
  aperto nunca chegaria ao jogo).
- `buttons`: nomes do layout do Xbox (`A B X Y LB RB LT RT BACK START L3 R3 UP DOWN LEFT RIGHT`),
  segurados durante o passo (valor 1).
- `axes`: `leftX leftY rightX rightY` em -1..1 (convenção W3C: `leftY` negativo = para frente).
- Passo sem botão nem eixo = pad solto. Dois apertos seguidos do mesmo botão precisam de um passo
  solto entre eles (senão viram um aperto só).

Perfil inválido (lista vazia, duração fora do limite, botão ou eixo desconhecido, eixo fora de
-1..1) é recusado com erro que diz o passo.

Perfis embutidos:

- **`walk`** (a pé, ~36 s por ciclo): anda e volta, gira a câmera, pula 3×, mira e atira uma rajada,
  corre e volta, ziguezague e volta, gira a câmera de volta subindo e descendo. Cada deslocamento (e a inclinação da câmera) tem o seu oposto,
  então o jogador fica num laço perto do spawn e o conteúdo da tela não muda de bairro entre os
  braços de um A/B.
- **`drive`** (use com o carro do jogo, no DDD 61 `&drive=1`): acelera, curvas para os dois lados,
  freia e dá ré, gira a câmera, sai do carro (Y) e entra de novo (Y).

### Determinismo

O roteiro não tem aleatoriedade: a mesma sequência de passos, cronometrada pelo relógio do jogo.
Não há semente porque não há sorteio. Os braços divergem só no que o próprio jogo faz com quadros de
duração diferente (física, colisão), o mesmo que já acontece numa rodada parada.

### Registro no trace

No boot (construtor) o `Game` grava no perf trace o evento
`{"t":…,"autopilot":{"profile":"walk","cycleS":35.8}}` (`PerfTrace.recordEvent` passa a aceitar texto
além de número).

### Kit (SPEC-0382)

- `round.sh --autopilot <perfil>` e `ab.sh --autopilot <perfil>` acrescentam `&autopilot=<perfil>`.
- `trace-stats.mjs`: rodada cuja query pede autopiloto é **inválida** se o trace não tiver o evento
  (engine sem esta spec) ou se a câmera não se afastou ao menos 8 m do ponto inicial depois do
  aquecimento ("autopiloto não andou"). O resumo ganha `>33ms` (porcentagem das amostras com quadro
  acima de 33 ms) e `andou` (afastamento máximo da câmera, m); o A/B ganha `frameMs p99` e `>33ms %`.

## Consequências

- Com o autopiloto o controle real fica escondido; é instrumento, não modo de jogo.
- O perfil é por botão, não por ação: um jogo que mapeia o tiro em outro botão precisa de outro
  perfil (é dado, basta acrescentar ao JSON).
- Validação (2026-10-23): a 1ª versão do `walk` andava 3 s/2 s por perna (só ~5 m no DDD 61, o
  kit reprovou) e terminava o giro com a câmera inclinada para cima, olhando o céu pelo resto da
  rodada (render barato = medição falsa). Corrigido: pernas de 5 s/4 s e inclinação líquida zero,
  travada por teste.
- O laço "volta ao spawn" é aproximado: colisões e aceleração fazem o jogador derivar alguns metros
  por ciclo.
