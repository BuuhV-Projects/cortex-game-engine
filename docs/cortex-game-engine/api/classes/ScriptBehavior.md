[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptBehavior

# Abstract Class: ScriptBehavior

Defined in: [src/scripts/ScriptBehavior.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L53)

**Base de comportamento anexável a um objeto** (estilo MonoBehaviour da Unity) — ADR-0085.

Você escreve uma subclasse, declara campos editáveis em `static fields`, e a anexa a um
nó pelo Inspector ("Adicionar Componente → Script") ou pelo `level.json`
(`node.scripts`). O [ScriptHostSystem](ScriptHostSystem.md) instancia, injeta `entity`/`object3d`/`ctx`,
aplica os valores dos campos e chama os hooks. **Roda só no Play** (pausa no editor).

## Example

```ts
class Girar extends ScriptBehavior {
  static fields = { rpm: { type: 'number', default: 30, label: 'Rotação (rpm)' } } as const;
  rpm = 30;
  onUpdate(dt: number) { if (this.object3d) this.object3d.rotation.y += (this.rpm / 60) * Math.PI * 2 * dt; }
}
registerScript('Girar', Girar);
```

## Constructors

### Constructor

> **new ScriptBehavior**(): `ScriptBehavior`

#### Returns

`ScriptBehavior`

## Properties

### ctx

> **ctx**: [`ScriptContext`](../interfaces/ScriptContext.md)

Defined in: [src/scripts/ScriptBehavior.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L68)

Handles do engine (world, input, gamepad, scene, camera). Injetado.

***

### entity

> **entity**: [`Entity`](Entity.md)

Defined in: [src/scripts/ScriptBehavior.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L64)

A entidade ECS que hospeda este script (injetada).

***

### object3d

> **object3d**: `Object3D`\<`Object3DEventMap`\> \| `null` = `null`

Defined in: [src/scripts/ScriptBehavior.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L66)

O `Object3D` do nó ao qual o script está anexado (ou `null`). Injetado.

***

### fields?

> `static` `optional` **fields?**: [`ScriptFieldSchema`](../type-aliases/ScriptFieldSchema.md)

Defined in: [src/scripts/ScriptBehavior.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L78)

Schema dos campos editáveis no Inspector — declare como `static fields` na subclasse.

***

### scriptName?

> `static` `optional` **scriptName?**: `string`

Defined in: [src/scripts/ScriptBehavior.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L61)

Nome do script no registro/Inspector (opcional). Com o auto-registro
(`registerScripts` + glob), o default é o **nome do arquivo** (estilo
Unity) — declare `static scriptName = 'MeuNome'` só pra um nome amigável
diferente (ex.: em português). É o nome que a cena PERSISTE — mudá-lo
depois exige atualizar level.json/scene-data que o referenciam.

## Methods

### onDestroy()?

> `optional` **onDestroy**(): `void`

Defined in: [src/scripts/ScriptBehavior.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L75)

Chamado ao remover o script (Inspector) ou destruir a entidade.

#### Returns

`void`

***

### onStart()?

> `optional` **onStart**(): `void`

Defined in: [src/scripts/ScriptBehavior.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L71)

Chamado UMA vez, no primeiro frame de Play após o script existir.

#### Returns

`void`

***

### onUpdate()?

> `optional` **onUpdate**(`dt`): `void`

Defined in: [src/scripts/ScriptBehavior.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L73)

Chamado todo frame de Play. `dt` em **segundos**.

#### Parameters

##### dt

`number`

#### Returns

`void`
