[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InspectCamera

# Class: InspectCamera

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L37)

**Câmera de inspeção** (SPEC-0131): uma câmera de perspectiva livre, separada da
do jogo e da do editor, que pode ser posicionada/orbitada por código pra "ver"
a cena de QUALQUER ângulo sem depender da câmera de gameplay (que segue o
player) nem do modo editor (que traz HUD/gizmos/helpers).

Quando [active](#active), o [Game](Game.md) renderiza o frame por ela — a gameplay
segue rodando (`world.tick`), só a câmera do render muda. Render **cru** (sem
pós-processamento), como o do editor, pra uma leitura geométrica limpa da cena.

Usada pela tool de playtest do Chat IA (parâmetro `camera`) e exposta em
`window.__cortexInspect` no bundle de dev — assim a IA orbita livremente e tira
a foto do ângulo que quiser.

## Example

```ts
game.inspect.orbit({ yaw: 45, pitch: -30, dist: 20 }) // meia-altura, de lado
game.inspect.pose([10, 8, 10], [0, 1, 0])             // pose explícita
game.inspect.clear()                                   // volta pra câmera do jogo
```

## Constructors

### Constructor

> **new InspectCamera**(`fov?`): `InspectCamera`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L47)

#### Parameters

##### fov?

`number` = `60`

#### Returns

`InspectCamera`

## Properties

### active

> **active**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L41)

`true` = o [Game](Game.md) deve renderizar por esta câmera. Alternado por `orbit/pose/frame/clear`.

***

### camera

> `readonly` **camera**: `PerspectiveCamera`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L39)

A câmera de perspectiva controlada. Renderiza só a layer 0 (helpers do editor ficam de fora).

## Methods

### clear()

> **clear**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L100)

Desativa — o [Game](Game.md) volta a renderizar pela câmera do jogo/editor.

#### Returns

`void`

***

### frame()

> **frame**(`scene`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L95)

Enquadra a cena inteira do ângulo padrão (atalho de `orbit` sem parâmetros).

#### Parameters

##### scene

`Object3D`

#### Returns

`void`

***

### orbit()

> **orbit**(`scene`, `params?`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L80)

Orbita ao redor de um alvo pelos ângulos `yaw`/`pitch` a uma `dist` (auto se
omitida). `scene` é a raiz cujo bbox é usado quando `target === 'scene'` ou
pra calcular a distância automática. Ativa a câmera.

#### Parameters

##### scene

`Object3D`

##### params?

[`InspectOrbit`](../interfaces/InspectOrbit.md) = `{}`

#### Returns

`void`

***

### pose()

> **pose**(`pos`, `lookAt?`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L69)

Pose explícita: posiciona em `pos` olhando pra `lookAt` (default origem). Ativa a câmera.

#### Parameters

##### pos

readonly \[`number`, `number`, `number`\]

##### lookAt?

readonly \[`number`, `number`, `number`\] = `...`

#### Returns

`void`

***

### setAspect()

> **setAspect**(`width`, `height`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L53)

Ajusta o aspect ao tamanho lógico do render (chamado pelo Game por frame quando ativa).

#### Parameters

##### width

`number`

##### height

`number`

#### Returns

`void`

***

### setFov()

> **setFov**(`fov`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InspectCamera.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InspectCamera.ts#L62)

Troca o field of view (graus) e reativa.

#### Parameters

##### fov

`number`

#### Returns

`void`
