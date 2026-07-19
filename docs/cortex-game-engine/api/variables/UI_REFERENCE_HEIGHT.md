[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UI\_REFERENCE\_HEIGHT

# Variable: UI\_REFERENCE\_HEIGHT

> `const` **UI\_REFERENCE\_HEIGHT**: `1080` = `1080`

Defined in: [src/ui/runtime/layout.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/layout.ts#L51)

**Altura de referência do design da UI** (px lógicos). Todas as telas (menus,
HUD, diálogos) são autoradas contra esta altura — a config default do engine é
1920×1080 (ver [uiScale](../functions/uiScale.md)). O layout roda SEMPRE neste espaço "de design"
e o backend estica pro viewport real, então a UI cresce junto com a tela (não
fica minúscula num 4K nem gigante num 720p). Ver ADR-0129.
