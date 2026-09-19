# 0197 - Shadow caster culling por tamanho angular

**Data:** 2026-09-19
**Status:** aceito

## Contexto

Medindo a cena do `kart-racer` com o harness `examples/perf-kart` (SPEC-0196),
o **shadow pass é metade do frame**:

| Cenário (câmera de gameplay, rasante) | Draw calls | Triângulos | fps |
|---|---|---|---|
| Como está hoje (CSM, 3 cascatas, 260 m) | 2807 | 7,79 M | 35,3 |
| Ninguém projeta sombra | — | — | **75,0** |

Ou seja: a cena inteira é desenhada ~3× por frame (uma vez na tela, uma por
cascata do CSM). O `castShadow` dos nós vem `true` por default e ninguém filtra.

Duas hipóteses foram testadas antes de escolher:

- **Filtro por distância** (`casterMaxDist`): **zero efeito** — removeu 0 draws.
  O CSM já limita os casters ao alcance das cascatas (`shadowDistance`), então
  cortar por distância só repete o que o three já faz.
- **Filtro por tamanho angular** (raio do bounding sphere ÷ distância da
  câmera): efetivo, e quanto mais rasante a câmera (a de jogo), melhor.

| Limiar (`minRatio`) | Draw calls | Triângulos | Significado prático |
|---|---|---|---|
| 0 (desligado) | 2807 | 7,79 M | — |
| 0,02 | 2526 (−10%) | 7,43 M | some além de 50× o próprio raio |
| **0,05 (default)** | **1966 (−30%)** | 6,06 M | além de 20× o raio |
| 0,1 | 1495 (−47%) | 4,48 M | além de 10× o raio |

> Uma primeira versão desta tabela superestimava o ganho (2183 draws em 0,02):
> o protótipo aplicava o filtro com a câmera ainda na origem, não na posição de
> jogo. Os números acima são do caminho real da engine.

**Validação visual** (screenshots do harness, câmera de largada, em `.cortex/`):
`0` e `0,05` são indistinguíveis — mesmas sombras de contato sob os carros e
mesmas sombras de árvore no gramado. Em `0,1` o carro distante à frente perde a
sombra de contato e passa a "flutuar". Por isso o default é **0,05**: o maior
corte que a comparação visual não acusa.

Para comparação, reduzir de 3 para 2 cascatas rende 2243 draws, mas degrada a
sombra perto da câmera — o filtro entrega mais sem mexer no que está próximo.

## Decisão

`OutdoorLighting` ganha **shadow caster culling por tamanho angular**: uma malha
deixa de projetar sombra quando `raio_do_bounding_sphere / distância_da_câmera`
fica abaixo de `shadowCasterMinRatio` — a sombra dela ocuparia poucos pixels no
shadow map e não vale um draw a mais.

- **Default `0.05`**, escolhido pela tabela acima somada à comparação visual.
  `0` desliga. Jogos de câmera parada com objetos pequenos em destaque podem
  querer `0.02` em `outdoorLighting.shadowCasterMinRatio`.
- **Onde roda:** dentro do `CameraFollowingCSM.updateBefore`, que já recebe a
  câmera **do frame** — é o único ponto que enxerga tanto a câmera de jogo
  quanto a do editor F2. Assim o Studio ganha o mesmo alívio que o jogo, que é
  onde a queixa de fps apareceu.
- **Cadência:** reavalia a cada `SHADOW_CULL_INTERVAL` frames (não todo frame) —
  o custo é um traverse com uma divisão por malha, e a sombra de um objeto que
  cruza o limiar aparece/some com no máximo esse atraso.
- **A autoria vence.** O valor autorado de `castShadow` (nó/JSON/Inspector) é
  memorizado em `userData.cortexShadowAuthored` na primeira passagem; o filtro
  só pode **tirar** sombra de quem tinha, nunca dar sombra a quem o autor
  desligou.

## Consequências

- Objetos pequenos param de projetar sombra quando ficam longe. Com `0.05` isso
  é uma placa (raio ~1 m) além de 20 m ou uma árvore (raio ~5 m) além de 100 m —
  confirmado invisível na comparação de screenshots.
- Cenas com câmera alta e objetos pequenos ganham menos: o filtro é proporcional
  à distância, e câmera de topo deixa tudo com tamanho angular parecido.
- O culling é **estado na cena** (`castShadow` muda em runtime). Quem ler
  `castShadow` esperando o valor autorado deve ler `cortexShadowAuthored`.
- Não substitui as outras frentes: os ~1700 draws do pass principal seguem
  intactos — instancing de nós repetidos continua em aberto.
