# Cortex Game Engine — Catálogo de recursos (API pública)

Tudo que o engine disponibiliza para projetos. **Importe sempre de
`'cortex-game-engine'`** — nunca de `'three'` direto (o three não está no
`node_modules` do projeto; vem embutido no engine e seus tipos são re-exportados
aqui). Fonte de verdade dos exports: `src/index-runtime.ts`. Assinaturas
completas: `vendor/cortex-game-engine/index.d.ts` (e os `.d.ts` por módulo ao
lado).

> Motor 3D WebGPU-only (ADR-0032) com arquitetura ECS (ADR-0002). Os exemplos
> abaixo são os padrões idiomáticos; siga-os ao criar features.

---

## Core

| Símbolo | O que é |
|---|---|
| `GameLoop` | Loop principal. `new GameLoop({ onUpdate(dt), onFixedUpdate? })`, `.start()`/`.stop()`. |
| `Renderer` | Wrapper do `WebGPURenderer`. `.render(threeScene, camera)`, `.renderViewport(...)` (split-screen), `.resize(w,h)`, `.threeRenderer` (instância crua, p/ pós-processamento), `.isReady`, `.dispose()`. |
| `Camera`, `PerspectiveCamera`, `OrthographicCamera` | Câmeras (re-exportadas via Renderer). Perspectiva p/ 3D; ortográfica p/ 2.5D/2D. |
| `Scene` | Wrapper de `THREE.Scene`. `.add(...objs)`, `.remove(...)`, `.clear()`, `.getThreeScene()`. |
| `AssetLoader` | Carrega e cacheia assets. `.loadGLTF(url)→GLTF`, `.loadFBX(url)→Group`, `.loadTexture(url)`, `.loadAudio(url)`. |
| `GLTF` (tipo) | Retorno de `loadGLTF` (`.scene`, `.animations`). |
| `AudioManager` | Áudio. `.setMasterVolume(v)`, sons via `SoundOptions`. |
| `InputManager` | Teclado/mouse. `.attach(document.body)`, `.isKeyDown('ArrowLeft')`, `.isButtonDown(0)`, `.getMousePosition()`, `.getMouseDelta()`. |
| `GamepadManager` | Gamepads. `.isButtonDown(i, btn)`, `.getAxis(i, axis)`. |
| `LoadingScreen` | Tela de carregamento. `.show()`/`.hide()`. |
| `Skybox` | Iluminação/fundo por HDRI. `Skybox.fromHDRI(scene, url, opts)`, `Skybox.clear(scene)`. |
| `PostFX` | Pós-processamento consolidado (ver seção própria). |

### Física (impulso)
`RigidBodyComponent`, `ColliderComponent` (+ tipo `ColliderShape`: box/sphere/cylinder/capsule), `PhysicsSystem`.

---

## ECS

| Símbolo | O que é |
|---|---|
| `World` | `.createEntity()`, `.addSystem(sys)`, `.removeSystem(Class)`, `.query(...ComponentClasses)`. |
| `Entity` | `.addComponent(c)`, `.getComponent(Class)`, `.hasComponent(Class)`, `.removeComponent(Class)`. |
| `Component` | Base — **só dados** (campos públicos), sem lógica. |
| `System` | Base abstrata — **só lógica**. `static requiredComponents = [...]` + `update(entities, dt)`. Sem estado interno. |

---

## Componentes de gameplay (genéricos)

| Componente | Uso |
|---|---|
| `TransformComponent` | Posição/rotação/escala lógicas. `new TransformComponent(x, y, z)`. |
| `Object3DComponent` | Liga a entity a um `Object3D`/mesh da cena. `new Object3DComponent(mesh)`. |
| `KinematicBodyComponent` | Corpo cinemático (gravidade/colisão por raycast). |
| `FollowCameraTargetComponent` | Marcador: a câmera de perseguição segue esta entity. |
| `EditableTargetComponent` | Marcador: editável no modo editor. |

## Sistemas (genéricos)

| Sistema | Uso |
|---|---|
| `Object3DSyncSystem` | Copia `TransformComponent` → `Object3D` da cena a cada frame. |
| `ThirdPersonCameraSystem` | Câmera de perseguição da entity com `FollowCameraTargetComponent`. |

## Física cinemática de veículo (raycast)

`VehiclePhysics` (agrupador), `VehicleGravitySystem` (gravidade + ground-snap),
`VehicleWallCollisionSystem` (colisão lateral com deslize).

## Modo editor embutido (autoria no jogo)

`EditorState`, `EditorHud`, `EditorCameraSystem` (câmera livre), `ObjectEditSystem` (gizmo).

**Use SEMPRE este editor pra autoria/posicionamento de cena — NÃO reimplemente
câmera de voo, seleção por clique ou gizmo à mão.** Ele já vem ligado no template
(`main.ts`, tecla **F2**). É baseado em ECS: registre os sistemas num `World` e
chame `world.tick(dt)` no loop; renderize pela câmera de voo livre quando o editor
estiver ativo.

Controles: **F2** liga/desliga · **WASD/QE** voa (Shift corre) · **botão direito**
olha · **clique** seleciona · **1/2/3** mover/rotacionar/escalar · **F** enquadra ·
**T** teleporta o avatar · **P** salva (callback `onSaveEdits`).

Requisitos: um `InputManager` anexado; uma entidade com `TransformComponent` +
`EditableTargetComponent` (o "avatar" que o editor teleporta — sem ela a câmera
livre nem o toggle funcionam); objetos selecionáveis precisam de `Object3D.name`.

```ts
import {
  World, InputManager, PerspectiveCamera,
  TransformComponent, Object3DComponent, EditableTargetComponent, Object3DSyncSystem,
  createEditorState, createEditorHud, EditorCameraSystem, ObjectEditSystem,
} from 'cortex-game-engine'

const input = new InputManager(); input.attach(document.body)
const editorState = createEditorState()
const editorHud = createEditorHud()
// Câmera separada usada só no editor (voo livre); a do jogo fica intacta.
const editorCamera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000)

// Avatar editável (qualquer objeto que o editor possa teleportar). Sincronize
// a mesh ao TransformComponent com Object3DSyncSystem.
const avatar = world.createEntity()
avatar.addComponent(new TransformComponent(0, 0.5, 0))
avatar.addComponent(new Object3DComponent(avatarMesh))   // avatarMesh.name = 'Avatar'
avatar.addComponent(new EditableTargetComponent())
world.addSystem(new Object3DSyncSystem())

const editorCam = new EditorCameraSystem(editorState, editorCamera, gameCamera, input, ground, editorHud)
world.addSystem(editorCam)
world.addSystem(new ObjectEditSystem(
  editorState, editorCamera, canvas, scene,
  [scene.getThreeScene()],          // raiz(es) editável(is): objetos nomeados aqui dentro
  input, editorHud,
  (edits) => persistEdits(edits),   // onSaveEdits (P): salve em JSON com SceneFileWriter
  () => {},                         // onClearEdits
  undefined,                        // onTransformChange (sync de volta pro ECS)
  (obj) => editorCam.focusOn(obj),  // onFocusRequest (F)
))

// No loop:
world.tick(deltaTime)
renderer.render(scene.getThreeScene(), editorState.active ? editorCamera : gameCamera)
```

Pra persistir o que foi editado, ligue `onSaveEdits` ao IO de cena
(`SceneFileWriter`/`autoDetectSceneFileWriter`, abaixo).

## Posicionar e conectar assets (grounding por bounding box)

`getWorldBounds`, `placeOnGround`, `WorldBounds`.

**Ao montar cena com `.glb`, NUNCA defina `position.y` no chute.** O pivô de cada
modelo é arbitrário — um `y` adivinhado deixa peças flutuando ou afundadas (o bug
nº1 de cenário). Meça e assente:

- `placeOnGround(obj, groundY = 0)` — desloca `obj` até a **base** da geometria
  (ponto mais baixo do bounding box em world space) ficar em `groundY`,
  independente de onde está o pivô. Retorna o `WorldBounds` já reposicionado.
- `getWorldBounds(obj)` — mede a caixa em world space e devolve
  `min/max/size/center` + os escalares `minX/maxX/minY/maxY/minZ/maxZ`.

Use as **bordas medidas** pra conectar peças, em vez de chutar coordenadas:

```ts
import { getWorldBounds, placeOnGround } from 'cortex-game-engine'

// Ilhas afundadas 1.5u na água; medir as bordas reais de cada uma.
const a = placeOnGround(islandA, -1.5)
const b = placeOnGround(islandB, -1.5)

// Ponte exatamente no vão entre a borda direita de A e a esquerda de B:
const bridgeB = placeOnGround(bridge, -1.5)
bridge.position.x = (a.maxX + b.minX) / 2
bridge.position.z = a.center.z

// Empilhar um marco no topo de uma ilha (base no topo dela):
placeOnGround(flag, getWorldBounds(islandB).maxY)
flag.position.set(b.center.x, flag.position.y, b.center.z)
```

## Água (experimental)

`Water` — plano de água cartoon com cáusticas opcionais (tiled + animadas).
Aproximação visual barata (sem reflexão/refração/foam/ondas reais); pra um mar
realista seria preciso shader custom WebGPU.

```ts
import { Water } from 'cortex-game-engine'

const water = new Water(scene, {
  y: -1.5,
  color: 0x3b6e8f,
  causticsUrl: 'assets/textures/caustics.png', // opcional; omita pra água lisa
  repeat: 8,
})
// no GameLoop.onUpdate, pra deslizar as cáusticas:
water.update(deltaTime / 1000)
```

Texturas agora são re-exportadas pelo engine (não precisa importar de `three` nem
usar o literal `1000`): `Texture`, `TextureLoader`, `RepeatWrapping`,
`ClampToEdgeWrapping`, `MirroredRepeatWrapping` (+ `AssetLoader.loadTexture(url)`).

## Cena persistida em JSON + IO

`SceneFile`, `SceneLoader`, `SceneFileWriter`, `HttpSceneFileWriter`,
`TauriSceneFileWriter`, `autoDetectSceneFileWriter`.

---

## Pós-processamento (WebGPU)

O engine é WebGPU-only, então **não** existe `EffectComposer` (esse é WebGL). Use:

- **`PostFX`** — caminho recomendado. Consolida pipeline + efeitos:
  ```ts
  import { PostFX, ACESFilmicToneMapping } from 'cortex-game-engine'
  const postfx = new PostFX(renderer, scene, camera, {
    bloom: { strength: 0.9 }, vignette: true, fxaa: true,
    toneMapping: ACESFilmicToneMapping, exposure: 1.1,
  })
  // no loop, no lugar de renderer.render(...):
  postfx.render()
  // runtime: postfx.bloom?.strength.value = 1.2
  ```
- **Blocos crus** (pipeline à mão): `RenderPipeline` (e o alias deprecado
  `PostProcessing`), `pass`, `mrt`, `output`, `renderOutput`, `bloom`, `fxaa`.
- **Tone mapping** (constantes): `NoToneMapping`, `LinearToneMapping`,
  `ReinhardToneMapping`, `CineonToneMapping`, `ACESFilmicToneMapping`,
  `AgXToneMapping`, `NeutralToneMapping`.

## Skybox / HDRI

```ts
import { Skybox } from 'cortex-game-engine'
await Skybox.fromHDRI(scene, 'assets/sky.hdr', { backgroundBlurriness: 0.3, environmentIntensity: 1 })
```
Avançado: `RGBELoader`, `EquirectangularReflectionMapping`.

---

## Re-exports de three (use estes, não `import 'three'`)

- **Objetos**: `Mesh`, `InstancedMesh`, `Object3D`, `Group`, `SkinnedMesh`, `Bone`, `Skeleton`.
- **Geometrias**: `BoxGeometry`, `SphereGeometry`, `PlaneGeometry`, `CylinderGeometry`, `ConeGeometry`, `TorusGeometry`, `BufferGeometry`, `InstancedBufferGeometry`.
- **Materiais**: `MeshBasicMaterial`, `MeshStandardMaterial`, `MeshPhongMaterial`, `MeshLambertMaterial`, `LineBasicMaterial`; lados `DoubleSide`/`FrontSide`/`BackSide`.
- **Luzes**: `AmbientLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`.
- **Atmosfera**: `Fog`, `FogExp2` (névoa — set em `scene.getThreeScene().fog`; some objetos no horizonte → mundo "infinito").
- **Math**: `Color`, `Vector2`, `Vector3`, `Quaternion`, `Euler`, `Matrix3`, `Matrix4`, `MathUtils`, `Box3`, `Sphere`, `Frustum`, `Plane`, `Ray`, `Raycaster`.
- **Animação**: `AnimationMixer`, `AnimationClip`, `AnimationAction`, `Clock`.
- **Instancing**: `InstancedBufferAttribute`, `BufferAttribute`, `Float32BufferAttribute`, `DynamicDrawUsage`/`StaticDrawUsage`/`StreamDrawUsage`.
- **Áudio**: `Audio`, `PositionalAudio`, `AudioListener`.
- **Addons**: `TransformControls`, `OrbitControls`, `clone` (de SkeletonUtils — **use `clone(model)` em vez de `model.clone(true)` para SkinnedMesh**).

> Se faltar algo do three que não está aqui, avise o usuário e sugira adicionar
> o re-export em `src/index-runtime.ts` — não importe `'three'` direto no projeto.

## AI (só no IDE, não vai pro projeto)

`ScriptGenerator`, `BlenderModelGenerator` — ferramentas de autoria Node-only,
fora do bundle do projeto.

---

## Receitas

### Criar uma entity com mesh
```ts
import { World, Scene, Mesh, BoxGeometry, MeshStandardMaterial,
         TransformComponent, Object3DComponent } from 'cortex-game-engine'

const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xff0000 }))
scene.add(mesh)
const e = world.createEntity()
e.addComponent(new TransformComponent(0, 1, 0))
e.addComponent(new Object3DComponent(mesh))
```

### Carregar um modelo (GLTF, com skin)
```ts
import { AssetLoader, clone } from 'cortex-game-engine'
const gltf = await new AssetLoader().loadGLTF('assets/hero.glb')
const inst = clone(gltf.scene)   // clone seguro p/ SkinnedMesh
scene.add(inst)
```

### Sistema ECS
```ts
import { System, TransformComponent } from 'cortex-game-engine'
import { VelocityComponent } from '../components/VelocityComponent'

export class MoveSystem extends System {
  static override requiredComponents = [TransformComponent, VelocityComponent]
  override update(entities, dt) {
    for (const e of entities) {
      const t = e.getComponent(TransformComponent)!
      const v = e.getComponent(VelocityComponent)!
      t.x += v.x * dt
    }
  }
}
// world.addSystem(new MoveSystem())
```

### Input no loop
```ts
import { InputManager } from 'cortex-game-engine'
const input = new InputManager(); input.attach(document.body)
// no update: if (input.isKeyDown('ArrowRight')) t.x += speed * dt
```
