[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ParticleEmitter

# Class: ParticleEmitter

Defined in: [src/scene/Particles.ts:142](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L142)

## Constructors

### Constructor

> **new ParticleEmitter**(`options?`): `ParticleEmitter`

Defined in: [src/scene/Particles.ts:174](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L174)

#### Parameters

##### options?

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) = `{}`

#### Returns

`ParticleEmitter`

## Properties

### object

> `readonly` **object**: `Object3D`

Defined in: [src/scene/Particles.ts:144](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L144)

Nó a adicionar na cena (contém o `InstancedMesh`).

## Accessors

### active

#### Get Signature

> **get** **active**(): `boolean`

Defined in: [src/scene/Particles.ts:231](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L231)

O emissor ainda vai soltar partículas novas?

##### Returns

`boolean`

***

### alive

#### Get Signature

> **get** **alive**(): `number`

Defined in: [src/scene/Particles.ts:226](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L226)

Partículas vivas agora (diagnóstico e teste).

##### Returns

`number`

## Methods

### burst()

> **burst**(`n`): `void`

Defined in: [src/scene/Particles.ts:236](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L236)

Dispara `n` partículas de uma vez (o "evento": pouso, coleta, clarão).

#### Parameters

##### n

`number`

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/Particles.ts:305](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L305)

Libera geometria, material e a textura gerada (se for a default).

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [src/scene/Particles.ts:246](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L246)

Volta a emitir (só faz efeito se `rate > 0`).

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/scene/Particles.ts:241](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L241)

Para de EMITIR; as vivas terminam a vida normalmente.

#### Returns

`void`

***

### update()

> **update**(`deltaSeconds`, `camera?`): `void`

Defined in: [src/scene/Particles.ts:254](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L254)

Avança a simulação. `camera` orienta os quads (billboard); sem ela, os quads
mantêm a última orientação.

#### Parameters

##### deltaSeconds

`number`

##### camera?

`Camera`

#### Returns

`void`
