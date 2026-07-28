[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GradientSkyOptions

# Interface: GradientSkyOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L51)

Opções do [Skybox.fromGradient](../classes/Skybox.md#fromgradient) (céu gradiente procedural).

## Properties

### bottom?

> `optional` **bottom?**: `string` \| `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L57)

Cor abaixo do horizonte (chão/IBL).

#### Default

```ts
'#8f8268'
```

***

### environmentIntensity?

> `optional` **environmentIntensity?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L61)

Intensidade da luz que o céu lança (environment).

#### Default

```ts
1
```

***

### middle?

> `optional` **middle?**: `string` \| `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L55)

Cor do horizonte (meio).

#### Default

```ts
'#d6ecfb' (azul pálido)
```

***

### resolution?

> `optional` **resolution?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L59)

Resolução vertical do gradiente.

#### Default

```ts
128
```

***

### top?

> `optional` **top?**: `string` \| `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L53)

Cor do zênite (topo).

#### Default

```ts
'#1f72d8' (azul forte)
```
