[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadUiFont

# Function: loadUiFont()

> **loadUiFont**(`family`, `url`): `Promise`\<`void`\>

Defined in: [src/ui/runtime/uiFont.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/uiFont.ts#L77)

Registra uma **fonte de arquivo** (TTF/OTF/woff2 em `assets/`) com o nome de
família que os widgets usam em `fontFamily`, o CSS em `font-family` e o
`<canvas>` em `ctx.font`. É o `new FontFace(...).load()` do HTML5, igual no
Studio (DOM) e no export nativo (lida do `assets.pak`). ADR-0715.

Espere a promessa antes de montar a UI: widget medido antes da carga sai com
a fonte padrão. Rejeita se o arquivo não carrega. Mesma família com a mesma
URL não recarrega; com outra URL é erro.

## Parameters

### family

`string`

### url

`string`

## Returns

`Promise`\<`void`\>

## Example

```ts
await loadUiFont('Barlow', 'assets/ui/fonts/BarlowSemiCondensed-SemiBold.ttf');
new UiLabel({ text: 'OBJETIVO', fontFamily: 'Barlow', fontSize: 22 });
```
