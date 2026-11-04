[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Vegetation

# Class: Vegetation

Defined in: [src/scene/Vegetation.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L89)

**Vegetação instanciada** (SPEC-0077): espalha muitas cópias de um modelo (árvore,
grama, arbusto…) numa única malha por geometria via InstancedMesh — aguenta
milhares de instâncias com um draw call por sub-malha. As instâncias são **dado**
(`[x,y,z,rotY,scale]`), espalhadas pelo pincel do editor e persistidas no overlay.

Recebe um `source` (o `Object3D` do `.glb` ou um placeholder de [makePlaceholderVegetation](../functions/makePlaceholderVegetation.md));
coleta cada sub-malha (geometria+material, com a transform relativa ao root) e cria
uma InstancedMesh por sub-malha. Cada instância aplica
`T(pos)·Ry(rot)·S(scale)` por cima da transform local da sub-malha (modelos com tronco
+ copa separados mantêm o layout).

## Examples

```ts
const veg = new Vegetation(treeObject)
scene.add(veg.group)
veg.add(10, 0, 5, 0, 1.2) // uma árvore em (10,5), escala 1.2
```

```ts
// Escrita sem cópia (SPEC-0675): o buffer do chamador vira o armazenamento.
const data = new Float32Array(1900 * FLOATS_PER_INSTANCE)
veg.adoptInstances(data, 0)
veg.writeInstances(0, cell) // só a faixa [0, cell.length/5) sobe
```

## Constructors

### Constructor

> **new Vegetation**(`source`, `capacity?`): `Vegetation`

Defined in: [src/scene/Vegetation.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L107)

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

Defined in: [src/scene/Vegetation.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L91)

Adicione à cena. Contém as InstancedMesh (uma por sub-malha do modelo).

## Accessors

### count

#### Get Signature

> **get** **count**(): `number`

Defined in: [src/scene/Vegetation.ts:156](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L156)

Número de instâncias espalhadas.

##### Returns

`number`

***

### instanceData

#### Get Signature

> **get** **instanceData**(): `Readonly`\<`ArrayLike`\<`number`\>\>

Defined in: [src/scene/Vegetation.ts:164](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L164)

O armazenamento atual (`[x,y,z,rotY,scale]` por instância), **só leitura** e válido para as primeiras
[count](#count) instâncias — sem a cópia de [getInstances](#getinstances) (SPEC-0675).

##### Returns

`Readonly`\<`ArrayLike`\<`number`\>\>

## Methods

### add()

> **add**(`x`, `y`, `z`, `rotY`, `scale`): `boolean`

Defined in: [src/scene/Vegetation.ts:255](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L255)

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

### adoptInstances()

> **adoptInstances**(`data`, `count?`): `void`

Defined in: [src/scene/Vegetation.ts:187](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L187)

Substitui todas as instâncias **sem copiar** (SPEC-0675): `data` vira o armazenamento. Quem chama não muta
`data` sem avisar por [syncInstances](#syncinstances) (ou escrever por [writeInstances](#writeinstances)). Zera a máscara da estrada.

#### Parameters

##### data

`number`[] \| `Float32Array`\<`ArrayBufferLike`\> \| `Float64Array`\<`ArrayBufferLike`\>

`[x,y,z,rotY,scale]` por instância.

##### count?

`number` = `...`

Instâncias válidas em `data` (default: todas que cabem); limitado à capacidade.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/Vegetation.ts:363](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L363)

Libera as geometrias/materiais das instâncias.

#### Returns

`void`

***

### getInstances()

> **getInstances**(): `number`[]

Defined in: [src/scene/Vegetation.ts:247](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L247)

Instâncias atuais no formato plano serializável (`[x,y,z,rotY,scale]`).

#### Returns

`number`[]

***

### instanceAt()

> **instanceAt**(`i`): \{ `rotY`: `number`; `scale`: `number`; `x`: `number`; `y`: `number`; `z`: `number`; \} \| `null`

Defined in: [src/scene/Vegetation.ts:292](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L292)

Transform da instância `i` (`[x,y,z,rotY,scale]`), ou `null` se fora de faixa.

#### Parameters

##### i

`number`

#### Returns

\{ `rotY`: `number`; `scale`: `number`; `x`: `number`; `y`: `number`; `z`: `number`; \} \| `null`

***

### modelBounds()

> **modelBounds**(`out`): `Box3`

Defined in: [src/scene/Vegetation.ts:311](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L311)

Bounding box do MODELO em escala 1 (união das sub-malhas) — p/ gizmos de seleção.

#### Parameters

##### out

`Box3`

#### Returns

`Box3`

***

### removeAt()

> **removeAt**(`i`): `boolean`

Defined in: [src/scene/Vegetation.ts:300](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L300)

Remove a instância `i` (seleção individual no editor). Retorna `true` se removeu.

#### Parameters

##### i

`number`

#### Returns

`boolean`

***

### removeNear()

> **removeNear**(`x`, `z`, `radius`): `number`

Defined in: [src/scene/Vegetation.ts:267](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L267)

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

### setHidden()

> **setHidden**(`hidden`): `void`

Defined in: [src/scene/Vegetation.ts:240](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L240)

**Esconde instâncias** sem apagá-las (SPEC-0631 §3b: árvore no corredor da estrada).
`hidden[i] = 1` desenha a instância `i` com escala 0 (some do desenho, da sombra e do
raycast); [getInstances](#getinstances) continua com todas. `null` mostra todas de novo.

#### Parameters

##### hidden

`Uint8Array`\<`ArrayBufferLike`\> \| `null`

#### Returns

`void`

***

### setInstances()

> **setInstances**(`flat`): `void`

Defined in: [src/scene/Vegetation.ts:169](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L169)

Substitui todas as instâncias (ex.: restaurar do overlay) e atualiza as malhas. Copia `flat`.

#### Parameters

##### flat

`ArrayLike`\<`number`\>

#### Returns

`void`

***

### setSource()

> **setSource**(`source`): `void`

Defined in: [src/scene/Vegetation.ts:145](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L145)

**Troca o modelo** mantendo o grupo (mesmo `Object3D` na cena) e as instâncias —
descarta as InstancedMesh atuais, reconstrói a partir do `source` novo e
reaplica o espalhamento. Usado pelo editor pra trocar placeholder → `.glb` real.

#### Parameters

##### source

`Object3D`

#### Returns

`void`

***

### syncInstances()

> **syncInstances**(`first`, `count`): `void`

Defined in: [src/scene/Vegetation.ts:229](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L229)

Atualiza a faixa `[first, first+count)` depois que o chamador mutou o buffer adotado no lugar (SPEC-0675).
Limitada ao total atual.

#### Parameters

##### first

`number`

##### count

`number`

#### Returns

`void`

***

### writeInstances()

> **writeInstances**(`first`, `flat`, `count?`): `void`

Defined in: [src/scene/Vegetation.ts:205](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Vegetation.ts#L205)

Escreve a faixa de instâncias `[first, first+count)` e atualiza **só ela** (SPEC-0675): matrizes, faixa de upload
do `instanceMatrix` e a esfera de culling, que só cresce (encolhe na próxima escrita inteira). A faixa passando do
total sobe o total; o vão entre o total antigo e `first` fica com escala 0 (invisível) no array próprio. Mantém a
máscara da estrada. Com buffer adotado, escreve nele.

#### Parameters

##### first

`number`

Índice da primeira instância.

##### flat

`ArrayLike`\<`number`\>

`[x,y,z,rotY,scale]` por instância.

##### count?

`number` = `...`

Instâncias a escrever (default: todas de `flat`).

#### Returns

`void`

#### Throws

RangeError se a faixa passa da capacidade (ou do tamanho do buffer adotado).
