[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / HDRISkyboxOptions

# Interface: HDRISkyboxOptions

Defined in: [src/core/Skybox.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L32)

## Properties

### asBackground?

> `optional` **asBackground?**: `boolean`

Defined in: [src/core/Skybox.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L37)

Usar o HDRI também como fundo VISÍVEL da cena, não só pra iluminação/reflexo.

#### Default

```ts
true
```

***

### backgroundBlurriness?

> `optional` **backgroundBlurriness?**: `number`

Defined in: [src/core/Skybox.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L43)

Desfoque do fundo, de `0` (nítido) a `1` (totalmente borrado). Útil pra um
céu suave sem distrair. Só tem efeito quando `asBackground` é `true`.

#### Default

```ts
0
```

***

### environmentIntensity?

> `optional` **environmentIntensity?**: `number`

Defined in: [src/core/Skybox.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L48)

Intensidade da iluminação que o environment lança na cena.

#### Default

```ts
1
```
