[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SHADOW\_AUTHORED\_KEY

# Variable: SHADOW\_AUTHORED\_KEY

> `const` **SHADOW\_AUTHORED\_KEY**: `"cortexShadowAuthored"` = `'cortexShadowAuthored'`

Defined in: [jge-present/src/scene/ShadowCasterCulling.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ShadowCasterCulling.ts#L39)

`userData` onde fica o `castShadow` como o autor deixou.

Exportado porque o espelho de cena nativo (SPEC-0245) precisa mandar ao C++
o valor AUTORADO, não o que este filtro deixou no frame: quem reaplica a
regra lá é o enumerador, então o que ele recebe tem de ser o teto.
