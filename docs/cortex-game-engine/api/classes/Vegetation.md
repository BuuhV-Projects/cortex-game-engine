[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Vegetation

# Class: Vegetation

Defined in: [src/scene/Vegetation.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L54)

**Vegetação instanciada** (SPEC-0077): espalha muitas cópias de um modelo (árvore,
grama, arbusto…) numa única malha por geometria via InstancedMesh — aguenta
milhares de instâncias com um draw call por sub-malha. As instâncias são **dado**
(`[x,y,z,rotY,scale]`), espalhadas pelo pincel do editor e persistidas no overlay.

Recebe um `source` (o `Object3D` do `.glb` ou um placeholder de [makePlaceholderVegetation](../functions/makePlaceholderVegetation.md));
coleta cada sub-malha (geometria+material, com a transform relativa ao root) e cria
uma InstancedMesh por sub-malha. Cada instância aplica
`T(pos)·Ry(rot)·S(scale)` por cima da transform local da sub-malha (modelos com tronco
+ copa separados mantêm o layout).

## Example

```ts
const veg = new Vegetation(treeObject)
scene.add(veg.group)
veg.add(10, 0, 5, 0, 1.2) // uma árvore em (10,5), escala 1.2
```

## Constructors

### Constructor

> **new Vegetation**(`source`, `capacity?`): `Vegetation`

Defined in: [src/scene/Vegetation.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L71)

`capacity` = máximo de instâncias (buffer pré-alocado). Default 8192.

#### Parameters

##### source

`Object3D`

##### capacity?

`number` = `8192`

#### Returns

`Vegetation`

## Properties

### group

> `readonly` **group**: `Group`\<`Object3DEventMap`\>

Defined in: [src/scene/Vegetation.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L56)

Adicione à cena. Contém as InstancedMesh (uma por sub-malha do modelo).

## Accessors

### count

#### Get Signature

> **get** **count**(): `number`

Defined in: [src/scene/Vegetation.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L118)

Número de instâncias espalhadas.

##### Returns

`number`

## Methods

### add()

> **add**(`x`, `y`, `z`, `rotY`, `scale`): `boolean`

Defined in: [src/scene/Vegetation.ts:135](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L135)

Adiciona uma instância. Retorna `false` se a capacidade estourou.

#### Parameters

##### x

`number`

##### y

`number`

##### z

`number`

##### rotY

`number`

##### scale

`number`

#### Returns

`boolean`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/Vegetation.ts:223](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L223)

Libera as geometrias/materiais das instâncias.

#### Returns

`void`

***

### getInstances()

> **getInstances**(): `number`[]

Defined in: [src/scene/Vegetation.ts:130](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L130)

Instâncias atuais no formato plano serializável (`[x,y,z,rotY,scale]`).

#### Returns

`number`[]

***

### instanceAt()

> **instanceAt**(`i`): \{ `rotY`: `number`; `scale`: `number`; `x`: `number`; `y`: `number`; `z`: `number`; \} \| `null`

Defined in: [src/scene/Vegetation.ts:167](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L167)

Transform da instância `i` (`[x,y,z,rotY,scale]`), ou `null` se fora de faixa.

#### Parameters

##### i

`number`

#### Returns

\{ `rotY`: `number`; `scale`: `number`; `x`: `number`; `y`: `number`; `z`: `number`; \} \| `null`

***

### modelBounds()

> **modelBounds**(`out`): `Box3`

Defined in: [src/scene/Vegetation.ts:189](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L189)

Bounding box do MODELO em escala 1 (união das sub-malhas) — p/ gizmos de seleção.

#### Parameters

##### out

`Box3`

#### Returns

`Box3`

***

### removeAt()

> **removeAt**(`i`): `boolean`

Defined in: [src/scene/Vegetation.ts:180](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L180)

Remove a instância `i` (seleção individual no editor). Retorna `true` se removeu.

#### Parameters

##### i

`number`

#### Returns

`boolean`

***

### removeNear()

> **removeNear**(`x`, `z`, `radius`): `number`

Defined in: [src/scene/Vegetation.ts:146](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L146)

Remove instâncias cujo XZ está dentro de `radius` de `(x,z)` (borracha do pincel).
Retorna quantas removeu.

#### Parameters

##### x

`number`

##### z

`number`

##### radius

`number`

#### Returns

`number`

***

### setInstances()

> **setInstances**(`flat`): `void`

Defined in: [src/scene/Vegetation.ts:123](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L123)

Substitui todas as instâncias (ex.: restaurar do overlay) e atualiza as malhas.

#### Parameters

##### flat

`number`[]

#### Returns

`void`

***

### setSource()

> **setSource**(`source`): `void`

Defined in: [src/scene/Vegetation.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L107)

**Troca o modelo** mantendo o grupo (mesmo `Object3D` na cena) e as instâncias —
descarta as InstancedMesh atuais, reconstrói a partir do `source` novo e
reaplica o espalhamento. Usado pelo editor pra trocar placeholder → `.glb` real.

#### Parameters

##### source

`Object3D`

#### Returns

`void`
