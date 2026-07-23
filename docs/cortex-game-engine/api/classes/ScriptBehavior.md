[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptBehavior

# Abstract Class: ScriptBehavior

Defined in: [src/scripts/ScriptBehavior.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L59)

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

Defined in: [src/scripts/ScriptBehavior.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L74)

Handles do engine (world, input, gamepad, scene, camera). Injetado.

***

### entity

> **entity**: [`Entity`](Entity.md)

Defined in: [src/scripts/ScriptBehavior.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L70)

A entidade ECS que hospeda este script (injetada).

***

### object3d

> **object3d**: `Object3D`\<`Object3DEventMap`\> \| `null` = `null`

Defined in: [src/scripts/ScriptBehavior.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L72)

O `Object3D` do nó ao qual o script está anexado (ou `null`). Injetado.

***

### fields?

> `static` `optional` **fields?**: [`ScriptFieldSchema`](../type-aliases/ScriptFieldSchema.md)

Defined in: [src/scripts/ScriptBehavior.ts:134](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L134)

Schema dos campos editáveis no Inspector — declare como `static fields` na subclasse.

***

### scriptName?

> `static` `optional` **scriptName?**: `string`

Defined in: [src/scripts/ScriptBehavior.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L67)

Nome do script no registro/Inspector (opcional). Com o auto-registro
(`registerScripts` + glob), o default é o **nome do arquivo** (estilo
Unity) — declare `static scriptName = 'MeuNome'` só pra um nome amigável
diferente (ex.: em português). É o nome que a cena PERSISTE — mudá-lo
depois exige atualizar level.json/scene-data que o referenciam.

## Methods

### disableRaycast()

> `protected` **disableRaycast**(`target?`): `void`

Defined in: [src/scripts/ScriptBehavior.ts:103](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L103)

**Desliga o raycast de forma REVERSÍVEL** — o jeito certo de dizer "este mesh
não é chão/parede" (lâmina, moeda, poça, decoração), sem que o character
pouse nele nem que ele bloqueie o spring arm da câmera.

Por que existe: escrever `obj.raycast = () => {}` na mão vaza pro **modo
edição** — o picking do editor também é raycast, então o objeto fica
IMPOSSÍVEL de clicar depois do primeiro Play, e só um reload resolve. Aqui o
host restaura tudo ao parar o Play.

#### Parameters

##### target?

`Object3D`\<`Object3DEventMap`\> \| `null`

Nó a silenciar com seus filhos. Default: o `object3d` do script.

#### Returns

`void`

***

### onDestroy()?

> `optional` **onDestroy**(): `void`

Defined in: [src/scripts/ScriptBehavior.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L86)

Chamado ao **parar o Play** (voltar ao editor), ao remover o script pelo
Inspector ou ao destruir a entidade. Desfaça aqui o que o `onStart` mexeu
fora do próprio script — o [ScriptHostSystem](ScriptHostSystem.md) descarta a instância e
cria uma nova no próximo Play (ciclo estilo Unity).

#### Returns

`void`

***

### onStart()?

> `optional` **onStart**(): `void`

Defined in: [src/scripts/ScriptBehavior.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L77)

Chamado UMA vez, no primeiro frame de Play após o script existir.

#### Returns

`void`

***

### onUpdate()?

> `optional` **onUpdate**(`dt`): `void`

Defined in: [src/scripts/ScriptBehavior.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptBehavior.ts#L79)

Chamado todo frame de Play. `dt` em **segundos**.

#### Parameters

##### dt

`number`

#### Returns

`void`
