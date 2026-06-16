[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / composeModularCharacter

# Function: composeModularCharacter()

> **composeModularCharacter**(`rig`, `parts`): [`ModularCharacter`](../interfaces/ModularCharacter.md)

Defined in: src/scene/ModularCharacter.ts:49

Compõe um personagem **modular** a partir de um **rig** (esqueleto + animações) e de
**peças** (corpo/pele, rosto, cabelo, roupa…) que foram exportadas do **mesmo
esqueleto**. Cada peça é rebindada nos ossos do rig **por nome**, então todas
deformam juntas quando o [SceneAnimator](../classes/SceneAnimator.md) toca um clipe — base de um criador de
personagem (mistura livre de peças, sem pré-assar combinações).

**Por que por nome (e não por índice):** o exportador glTF só inclui em cada peça os
ossos que ela usa (o cabelo não referencia ossos da perna), então `skin.joints` varia
de peça pra peça. Rebindar por índice quebraria; casar `mesh.skeleton.bones[i].name`
com o osso homônimo do rig preserva o mapeamento `skinIndex → osso` correto. Os
`boneInverses` da peça valem nos ossos do rig porque ambos compartilham a **pose de
descanso** (mesmo esqueleto de origem).

Requisito: todo osso de cada peça tem que existir no rig (mesmo esqueleto). Peças e
rig tipicamente saem do mesmo kit/pipeline.

## Parameters

### rig

`GLTF`

GLTF com o esqueleto (Bones) + as `animations`. Um mesh próprio do rig
  (ex.: um corpo base) é **descartado** — o corpo vem das peças.

### parts

`GLTF`[]

GLTFs das peças; cada um traz 1+ `SkinnedMesh` skinado no mesmo esqueleto.

## Returns

[`ModularCharacter`](../interfaces/ModularCharacter.md)

O [ModularCharacter](../interfaces/ModularCharacter.md) (object + animator).

## Example

```ts
const { object, animator } = await loadModularCharacter('rig.glb',
  ['body_10.glb', 'outfit_01.glb', 'face_f_usual02.glb', 'hair_f_03.glb'])
scene.add(object)
animator.play('Idle_Relaxed')
// no loop: animator.update(dt)
```
