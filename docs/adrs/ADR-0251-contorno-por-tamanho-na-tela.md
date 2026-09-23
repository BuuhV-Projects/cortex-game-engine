# ADR-0251 — Contorno cel cortado por tamanho na tela

**Data:** 2026-09-23
**Status:** aceito

## Contexto

A queixa não é fps baixo, é **oscilação**: o kart-racer vai a 70 e cai a 50 em
um segundo, e isso compromete a experiência mais do que uma taxa menor e
estável comprometeria.

A SPEC-0250 mediu a variância por seção (p99 contra média, sobre todos os
frames). A folga soma 7,00 ms num frame mediano de 15 ms, e o `render`
responde por **57%** dela (4,00 ms).

Comparando os 20 frames mais caros com os 20 mais baratos:

| | `cpu.render` | draws |
| --- | --- | --- |
| 20 baratos | 8,26 ms | 112 |
| 20 caros | 14,06 ms | 178 |

**66 draws de diferença, 5,8 ms** — 88 µs por draw. E o que entra:

| entra no frame caro | draws |
| --- | --- |
| **3 karts adversários** | **+33** |
| 3 `item-box` | +12 |
| cenário | +18 |

Metade do delta são os karts. Dentro de cada um, **8 dos 12 draws são as 4
rodas** — corpo mais casca de contorno, uma cada. E isso acontece justamente
quando eles estão **longe**, ocupando poucos pixels na tela.

## Decisão

Cortar a **casca de contorno** do cel-shading por **tamanho angular**
(`raio ÷ distância`), não por distância, seguindo o critério já estabelecido
pelo `ShadowCasterCulling` (SPEC-0197).

`src/scene/OutlineCulling.ts`, espelhando aquele módulo: função pura de
decisão, função de varredura, memória da autoria.

### Por que tamanho angular e não distância

Está escrito no `ShadowCasterCulling`, medido na mesma cena: *"Cortar por
DISTÂNCIA não adianta — o que paga é o tamanho na tela."* Vale igual aqui, e
com mais força: a casca de um prédio a 100 m ainda desenha silhueta; a de uma
roda a 30 m já é sub-pixel.

Usar distância cortaria o prédio junto com a roda, ou nenhum dos dois.

### Por que a casca e não as rodas inteiras

Esconder as rodas dos karts distantes renderia mais (8 draws contra 4 por
kart), mas some com geometria: se o limiar for mal calibrado, o jogador vê o
carro flutuando. A casca é **detalhe de estilo**, não silhueta — e a essa
distância ela já é sub-pixel, onde vira shimmer em vez de contorno. Cortá-la
tende a **melhorar** a imagem.

### Como a casca é identificada

Pelo **material**: `material.userData[OUTLINE_THICKNESS_KEY]`.

Isso importa porque a marca do objeto (`userData.cortexOutline`) **não
sobrevive ao merge** — o `mergeSubtree` cria uma malha nova. A do material
sobrevive, porque o merge reúsa o material do grupo (`StaticMerge.ts:294`) e
agrupa POR material, então casca e corpo nunca caem no mesmo grupo.

Verificado na cena do kart-racer: **674 malhas com `side === BackSide` e 674
com a marca no material** — os dois conjuntos coincidem exatamente.

Essa confusão já custou caro nesta campanha: o medidor de draws contava
contorno pela marca do objeto e concluiu que "o merge come o contorno", quando
ele apenas perdia o rótulo (ver SPEC-0014).

### A autoria vence

Como no `ShadowCasterCulling`, o `visible` autorado da casca é memorizado em
`userData.cortexOutlineAuthored`. O filtro só pode **esconder** casca que
estava visível, nunca mostrar a que o autor desligou — casca de vidro nasce
invisível de propósito (um casco preto atrás de uma janela a transformaria num
painel opaco).

## Consequências

- **É mudança de aparência**, e foi decidida como tal: o contorno some em
  objetos pequenos na tela. O limiar default é calibrado por medição e
  comparação visual, e `0` desliga o filtro devolvendo a autoria.
- Ganho esperado no pior caso: ~4 draws por kart distante e ~2 por pickup
  distante. Com 4 karts em quadro, ~20 draws — cerca de 1,8 ms pelo custo
  medido de 88 µs/draw. **Ataca o pior caso, não a média**, que é o objetivo.
- O custo do filtro é uma varredura com um `distanceTo` por malha. Roda
  periodicamente, não todo frame, pelo mesmo caminho do culling de sombra.
- Objetos cuja casca foi fundida com outras pelo merge são cortados **em
  grupo** — a malha fundida é uma só. É o comportamento esperado, e o motivo de
  o critério ser por tamanho: um grupo fundido tem raio grande e só some
  quando o conjunto inteiro está longe.
