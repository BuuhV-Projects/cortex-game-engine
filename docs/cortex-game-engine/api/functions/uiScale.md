[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / uiScale

# Function: uiScale()

> **uiScale**(`viewport`): `number`

Defined in: [src/ui/runtime/layout.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/layout.ts#L64)

Fator de escala da UI pro viewport real: `altura / {@link UI_REFERENCE_HEIGHT}`,
limitado. Em 1080p → 1 (idêntico ao design, sem regressão); em 4K (2160) → 2;
em 720p → ~0.67. Escala pela ALTURA (menus são compostos na vertical) — em
telas mais largas o conteúdo ancorado no centro fica centrado e o ancorado nas
bordas alcança as bordas (o [designViewport](designViewport.md) acompanha a proporção).

## Parameters

### viewport

[`UiViewport`](../interfaces/UiViewport.md)

## Returns

`number`
