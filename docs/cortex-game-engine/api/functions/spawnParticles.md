[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / spawnParticles

# Function: spawnParticles()

> **spawnParticles**(`parent`, `options`): [`ParticleEmitter`](../classes/ParticleEmitter.md)

Defined in: [src/scene/Particles.ts:376](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Particles.ts#L376)

Efeito PONTUAL que se limpa sozinho: dispara `burst` partículas na posição dada
e devolve o emissor (já adicionado ao `parent`). Use pro que é evento — pouso,
coleta, clarão de chegada.

O chamador ainda precisa chamar `update(dt, camera)` no loop; quando
`emitter.alive === 0` e `!emitter.active`, pode `dispose()`.

## Parameters

### parent

`Object3D`

### options

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) & `object`

## Returns

[`ParticleEmitter`](../classes/ParticleEmitter.md)
