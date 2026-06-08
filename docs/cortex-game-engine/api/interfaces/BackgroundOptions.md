[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BackgroundOptions

# Interface: BackgroundOptions

Defined in: src/scene/Background.ts:14

Opções de [Background](../classes/Background.md).

## Properties

### distance?

> `optional` **distance?**: `number`

Defined in: src/scene/Background.ts:23

Distância no Z **atrás** da câmera. Default `40`.

***

### height?

> `optional` **height?**: `number`

Defined in: src/scene/Background.ts:25

Altura do backdrop em unidades de mundo (cobre a vista vertical). Default `30`.

***

### parallax?

> `optional` **parallax?**: `number`

Defined in: src/scene/Background.ts:21

Fator de **parallax** (0–1): quão rápido o cenário acompanha a câmera.
`0` = travado na tela (infinitamente longe); `1` = anda junto com o mundo
(mesma profundidade do gameplay). Default `0.3` (fundo distante).

***

### url

> **url**: `string`

Defined in: src/scene/Background.ts:16

URL da imagem (jpg/png) — o backdrop. Tileável na horizontal pra scroll sem emenda.

***

### widthFactor?

> `optional` **widthFactor?**: `number`

Defined in: src/scene/Background.ts:27

Largura em múltiplos da altura (cobre a vista horizontal; tiles quadrados). Default `2.6`.
