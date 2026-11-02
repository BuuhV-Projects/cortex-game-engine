[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PanoramaSkyOptions

# Interface: PanoramaSkyOptions

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/Skybox.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L66)

Opções do [Skybox.fromPanorama](../classes/Skybox.md#frompanorama) (céu desenhado PNG/JPG/KTX2).

## Properties

### environmentIntensity?

> `optional` **environmentIntensity?**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/Skybox.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L74)

Intensidade da luz do panorama, quando `lighting`.

#### Default

```ts
1
```

***

### lighting?

> `optional` **lighting?**: `boolean`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/Skybox.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L72)

Também iluminar a cena com o panorama (environment/IBL). Sem isto ele é só
o fundo visível e a luz continua vindo do céu já instalado (ADR-0295).

#### Default

```ts
false
```
