[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CortexKtx2Loader

# Class: CortexKtx2Loader

Defined in: [.claude/worktrees/feat-input-rebind/src/core/loadKtx2.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L113)

Loader de KTX2 no formato que o `GLTFLoader` do three espera (`setKTX2Loader`)
— carrega as texturas **embutidas em GLB** (`KHR_texture_basisu`) no host. O
`GLTFLoader` passa uma URL `blob:` (bytes do bufferView), o mesmo mecanismo
que já carrega PNG embutido no host (M1). Só caminho nativo — ver escopo no
topo do módulo.

## Extends

- `Loader`

## Constructors

### Constructor

> **new CortexKtx2Loader**(`manager?`): `CortexKtx2Loader`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/loadKtx2.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L114)

#### Parameters

##### manager?

`LoadingManager`

#### Returns

`CortexKtx2Loader`

#### Overrides

`Loader.constructor`

## Methods

### load()

> **load**(`url`, `onLoad`, `_onProgress?`, `onError?`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/loadKtx2.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L119)

Chamado pelo GLTFLoader por textura KTX2. `url` é um `blob:` (bufferView).

#### Parameters

##### url

`string`

##### onLoad

(`texture`) => `void`

##### \_onProgress?

(`event`) => `void`

##### onError?

(`err`) => `void`

#### Returns

`void`

#### Overrides

`Loader.load`
