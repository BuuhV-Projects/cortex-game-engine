[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ParticleEmitterOptions

# Interface: ParticleEmitterOptions

Defined in: src/scene/Particles.ts:50

## Properties

### blending?

> `optional` **blending?**: `"normal"` \| `"additive"`

Defined in: src/scene/Particles.ts:80

`additive` = fogo/fagulha/brilho; `normal` = fumaça/poeira. Default additive.

***

### burst?

> `optional` **burst?**: `number`

Defined in: src/scene/Particles.ts:56

Emissão instantânea ao criar o emissor. Default 0.

***

### color?

> `optional` **color?**: `string` \| `number`

Defined in: src/scene/Particles.ts:76

Cor do emissor (hex ou número). Default `#ffffff`.

***

### direction?

> `optional` **direction?**: \[`number`, `number`, `number`\]

Defined in: src/scene/Particles.ts:66

Direção base da emissão (normalizada internamente). Default `[0, 1, 0]`.

***

### drag?

> `optional` **drag?**: `number`

Defined in: src/scene/Particles.ts:72

Fração da velocidade perdida por segundo (0 = nenhuma). Default 0.

***

### gravity?

> `optional` **gravity?**: `number`

Defined in: src/scene/Particles.ts:70

Aceleração em Y (u/s²) — negativa cai, positiva sobe. Default 0.

***

### life?

> `optional` **life?**: [`ParticleRange`](../type-aliases/ParticleRange.md)

Defined in: src/scene/Particles.ts:60

Vida da partícula em segundos. Default `[0.6, 1.2]`.

***

### loop?

> `optional` **loop?**: `boolean`

Defined in: src/scene/Particles.ts:58

`false` = emite por `life` máximo e para sozinho (efeito de evento). Default true.

***

### max?

> `optional` **max?**: `number`

Defined in: src/scene/Particles.ts:52

Capacidade do pool — teto de partículas vivas ao mesmo tempo. Default 128.

***

### opacity?

> `optional` **opacity?**: `number`

Defined in: src/scene/Particles.ts:78

Opacidade do material. Default 1.

***

### rate?

> `optional` **rate?**: `number`

Defined in: src/scene/Particles.ts:54

Emissão contínua, partículas por segundo. `0` = só `burst`. Default 0.

***

### size?

> `optional` **size?**: [`ParticleRange`](../type-aliases/ParticleRange.md)

Defined in: src/scene/Particles.ts:62

Lado do quad, em unidades de mundo. Default `[0.12, 0.28]`.

***

### speed?

> `optional` **speed?**: [`ParticleRange`](../type-aliases/ParticleRange.md)

Defined in: src/scene/Particles.ts:64

Velocidade inicial. Default `[1, 2]`.

***

### spin?

> `optional` **spin?**: [`ParticleRange`](../type-aliases/ParticleRange.md)

Defined in: src/scene/Particles.ts:74

Rotação da partícula no plano da tela (rad/s). Default 0.

***

### spread?

> `optional` **spread?**: `number`

Defined in: src/scene/Particles.ts:68

Abertura do cone em torno de `direction`, em radianos. Default 0.4.

***

### texture?

> `optional` **texture?**: `Texture`\<`unknown`, `TextureEventMap`\>

Defined in: src/scene/Particles.ts:82

Textura do sprite. Ausente = disco suave gerado por código.
