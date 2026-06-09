[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MaterialConfig

# Type Alias: MaterialConfig

> **MaterialConfig** = \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `ColorRepresentation`; `cull?`: [`CullMode`](CullMode.md); `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `ColorRepresentation`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `ColorRepresentation`; `type`: `"toon"`; \}

Defined in: [src/scene/Materials.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Materials.ts#L41)

Configuração de material por objeto (data-driven; vai no nó da cena/overlay).

## Union Members

### Type Literal

\{ `type`: `"standard"`; \}

***

### Type Literal

\{ `alphaTest?`: `number`; `color?`: `ColorRepresentation`; `cull?`: [`CullMode`](CullMode.md); `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \}

#### alphaTest?

> `optional` **alphaTest?**: `number`

Recorte por alpha (0 = sem corte).

#### color?

> `optional` **color?**: `ColorRepresentation`

Tint multiplicado na textura (`_Color`). Default branco.

#### cull?

> `optional` **cull?**: [`CullMode`](CullMode.md)

Cull mode: `back` (default), `front` ou `none` (dois lados).

#### depthTest?

> `optional` **depthTest?**: `boolean`

Testa o depth buffer (ZTest on/off). Default `true`.

#### depthWrite?

> `optional` **depthWrite?**: `boolean`

Escreve no depth buffer (ZWrite). Default `true`.

#### opacity?

> `optional` **opacity?**: `number`

Opacidade 0–1 (liga `transparent` se < 1).

#### transparent?

> `optional` **transparent?**: `boolean`

Força transparência (alpha blending).

#### type

> **type**: `"unlit"`

***

### Type Literal

\{ `color?`: `ColorRepresentation`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `ColorRepresentation`; `type`: `"toon"`; \}

#### color?

> `optional` **color?**: `ColorRepresentation`

Cor base. Default: mantém a do material original (ou branco).

#### gradientSteps?

> `optional` **gradientSteps?**: `number`

Nº de bandas de luz (2–8). Mais = degradê mais suave.

#### outline?

> `optional` **outline?**: `number`

Espessura do contorno (inverted-hull, em unidades de mundo). 0 = sem contorno.

#### outlineColor?

> `optional` **outlineColor?**: `ColorRepresentation`

Cor do contorno. Default preto.

#### type

> **type**: `"toon"`
