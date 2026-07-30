[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ParticleEmitter

# Class: ParticleEmitter

Defined in: src/scene/Particles.ts:142

## Constructors

### Constructor

> **new ParticleEmitter**(`options?`): `ParticleEmitter`

Defined in: src/scene/Particles.ts:174

#### Parameters

##### options?

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) = `{}`

#### Returns

`ParticleEmitter`

## Properties

### object

> `readonly` **object**: `Object3D`

Defined in: src/scene/Particles.ts:144

Nó a adicionar na cena (contém o `InstancedMesh`).

## Accessors

### active

#### Get Signature

> **get** **active**(): `boolean`

Defined in: src/scene/Particles.ts:231

O emissor ainda vai soltar partículas novas?

##### Returns

`boolean`

***

### alive

#### Get Signature

> **get** **alive**(): `number`

Defined in: src/scene/Particles.ts:226

Partículas vivas agora (diagnóstico e teste).

##### Returns

`number`

## Methods

### burst()

> **burst**(`n`): `void`

Defined in: src/scene/Particles.ts:236

Dispara `n` partículas de uma vez (o "evento": pouso, coleta, clarão).

#### Parameters

##### n

`number`

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: src/scene/Particles.ts:305

Libera geometria, material e a textura gerada (se for a default).

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: src/scene/Particles.ts:246

Volta a emitir (só faz efeito se `rate > 0`).

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: src/scene/Particles.ts:241

Para de EMITIR; as vivas terminam a vida normalmente.

#### Returns

`void`

***

### update()

> **update**(`deltaSeconds`, `camera?`): `void`

Defined in: src/scene/Particles.ts:254

Avança a simulação. `camera` orienta os quads (billboard); sem ela, os quads
mantêm a última orientação.

#### Parameters

##### deltaSeconds

`number`

##### camera?

`Camera`

#### Returns

`void`
