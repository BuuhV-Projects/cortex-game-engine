[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / WorldBounds

# Interface: WorldBounds

Defined in: src/scene/Placement.ts:14

Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
limites já desempacotados em escalares pra facilitar posicionamento e
conexão de peças de cenário.

Os campos `minX`/`maxX`/`minZ`/`maxZ` são o que você usa pra **conectar**
assets pela borda real (ex.: encostar uma ponte no `maxX` de uma ilha e no
`minX` da próxima), em vez de chutar coordenadas. `maxY` é o "topo" (pra
empilhar algo em cima); `minY` é a base (pra assentar no chão).

## Properties

### center

> **center**: `Vector3`

Defined in: src/scene/Placement.ts:22

Centro geométrico da caixa.

***

### max

> **max**: `Vector3`

Defined in: src/scene/Placement.ts:18

Canto máximo (x,y,z) da caixa em world space.

***

### maxX

> **maxX**: `number`

Defined in: src/scene/Placement.ts:24

***

### maxY

> **maxY**: `number`

Defined in: src/scene/Placement.ts:26

***

### maxZ

> **maxZ**: `number`

Defined in: src/scene/Placement.ts:28

***

### min

> **min**: `Vector3`

Defined in: src/scene/Placement.ts:16

Canto mínimo (x,y,z) da caixa em world space.

***

### minX

> **minX**: `number`

Defined in: src/scene/Placement.ts:23

***

### minY

> **minY**: `number`

Defined in: src/scene/Placement.ts:25

***

### minZ

> **minZ**: `number`

Defined in: src/scene/Placement.ts:27

***

### size

> **size**: `Vector3`

Defined in: src/scene/Placement.ts:20

Dimensões (largura, altura, profundidade).
