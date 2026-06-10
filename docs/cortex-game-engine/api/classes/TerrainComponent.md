[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainComponent

# Class: TerrainComponent

Defined in: src/components/TerrainComponent.ts:12

Marca uma entidade como **terreno colidível** — guarda o [Terrain](Terrain.md) (pra
amostrar a altura) e o `Object3D` (pra converter mundo↔local respeitando
posição/rotação/escala). O [TerrainCollisionSystem](TerrainCollisionSystem.md) usa isto pra manter
os corpos em cima da superfície. O [buildScene](../functions/buildScene.md) cria essa entidade pra
cada nó `terrain` quando há `world` (terreno é **sólido por padrão**).

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new TerrainComponent**(`terrain`, `object`): `TerrainComponent`

Defined in: src/components/TerrainComponent.ts:13

#### Parameters

##### terrain

[`Terrain`](Terrain.md)

O terreno (heightmap) — fonte da altura por `heightAt`.

##### object

`Object3D`

O mesh do terreno na cena — pra conversão de coordenadas mundo↔local.

#### Returns

`TerrainComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### object

> `readonly` **object**: `Object3D`

Defined in: src/components/TerrainComponent.ts:17

O mesh do terreno na cena — pra conversão de coordenadas mundo↔local.

***

### terrain

> `readonly` **terrain**: [`Terrain`](Terrain.md)

Defined in: src/components/TerrainComponent.ts:15

O terreno (heightmap) — fonte da altura por `heightAt`.

## Accessors

### type

#### Get Signature

> **get** **type**(): `string`

Defined in: [src/ecs/Component.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L16)

Identificador do tipo do componente.
Retorna o nome da classe construtora (ex: "TransformComponent").
Usado por Entity para indexar componentes no Map<string, Component>.

##### Returns

`string`

#### Inherited from

[`Component`](Component.md).[`type`](Component.md#type)
