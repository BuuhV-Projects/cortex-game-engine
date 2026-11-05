[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptHostGates

# Interface: ScriptHostGates

Defined in: [src/systems/ScriptHostSystem.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L59)

Os dois gates do [ScriptHostSystem](../classes/ScriptHostSystem.md) — **cuidado, eles não são
intercambiáveis** (ADR-0184).

Passar o predicado errado é um bug silencioso: nada falha, nada loga, e o
sintoma aparece longe da causa. Foi o que aconteceu num jogo real, onde o
congelamento de gameplay (que inclui a cutscene de abertura) chegou na posição
do `isEditing`: cada cutscene derrubava os scripts da fase e, ao terminar,
`onStart` rodava outra vez — reposicionando o jogador no meio da abertura.

## Properties

### isEditing?

> `optional` **isEditing?**: () => `boolean`

Defined in: [src/systems/ScriptHostSystem.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L67)

**Modo EDIÇÃO** (a borda Play↔Stop do editor). Quando vira `true`, as
instâncias são **DESTRUÍDAS** (`restoreRaycasts` + `onDestroy`) e `started`
é zerado, de forma que o Play seguinte recomece do zero — ADR-0143.

Só o editor deve acioná-lo. Pausa de jogo **não** entra aqui.

#### Returns

`boolean`

***

### isPaused?

> `optional` **isPaused?**: () => `boolean`

Defined in: [src/systems/ScriptHostSystem.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L73)

**Congelamento de gameplay** — cutscene, menu de pausa, tela de resultados.
Suspende `onStart`/`onUpdate` **preservando** instância e estado, para que o
jogo continue exatamente de onde parou quando descongelar.

#### Returns

`boolean`
