# SPEC-0728 - Terreno com dados binários

**Data:** 2026-11-13
**Status:** implementado

## Contexto

O Port Hollow assou as alturas e a pintura dos 203 nós de terreno num arquivo binário (SPEC-0285 do jogo). Com isso, o
boot do export nativo caiu de 123,9 s para 79,7 s. Duas limitações da engine fizeram o jogo contornar:

- **`Terrain.setPaint` só aceita a pintura em base64.** No host nativo, `atob` é um laço em JS
  (`native/js/src/shims/text.js`). As 203 pinturas do jogo (13,6 MB de bytes, 18 MB em base64) custam ~2 s de `atob`
  no `node --jitless`, o proxy do Hermes. Para não pagar ainda o `btoa`, o jogo grava o próprio base64 em ASCII no
  arquivo.
- **As alturas só entram como `number[]`** (`TerrainOptions.heights`, `Terrain.setHeights` e o nó `terrain` da cena).
  Quem tem as alturas num `Float32Array`/`Float64Array` (lidas de um binário) precisa copiá-las para um array comum
  antes, e por dentro o `Terrain` já guarda tudo num `Float32Array`.

## Decisão

### Pintura em bytes

```ts
terrain.setPaint({ layers, size, splat: Uint8Array })   // novo: os pesos RGBA crus (size*size*4)
terrain.setPaint({ layers, size, splat: 'base64…' })     // como antes
```

- `setPaint` recebe um `TerrainPaintInput`: o `TerrainPaintData` com `splat: string | Uint8Array`.
  - Com `Uint8Array`, os bytes vão direto para o splatmap, sem base64.
  - Com string, o caminho é o de antes.
- Os bytes são copiados, então quem chama pode reaproveitar o buffer.
- Se vier menos que `size*size*4` bytes, o resto fica como estava; se vier mais, o excesso é ignorado. É a regra que
  o base64 já seguia.
- `getPaint` continua devolvendo `TerrainPaintData` com `splat` em base64: é o formato que o editor salva no
  `scene-data.json`.

### Alturas como array tipado

- `TerrainOptions.heights`, `Terrain.setHeights` e o `heights` do nó `terrain` aceitam `ArrayLike<number>`
  (`number[]`, `Float32Array`, `Float64Array`).
- A cópia pega até `(res+1)²` valores, como antes, e não cria array intermediário.
- O schema do nó `terrain` aceita, além de `number[]`, um `Float32Array` ou `Float64Array`. Serve à cena montada em
  código; o arquivo JSON continua com `number[]`.
- `getHeights` continua devolvendo `number[]`, que é o formato serializável do editor.

### Fora do escopo

- `atob`, `btoa` e `TextDecoder` nativos (C++) no host.
- Um nó de cena que aponte para um arquivo binário (`heightsUrl`).
- Um passo de bake genérico no build ou no export.

## Consequências

- Um jogo com dados assados passa os bytes da pintura e as alturas tipadas direto, sem base64 e sem cópia para
  `number[]`.
- A API antiga continua igual: string base64 e `number[]`.
- O jogo que hoje grava base64 em ASCII (Port Hollow, SPEC-0285) pode, depois de revendorizar, gravar os bytes crus
  e tirar o `atob` do boot.
