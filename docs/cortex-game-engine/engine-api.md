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
| `Game` | **Facade recomendado.** Cria e conecta Renderer+Scene+Câmera+World+Input+loop. `new Game({ canvas })`, `.scene`, `.world`, `.camera`, `.renderer`, `.input`, `.onUpdate(dt=>…)`, `.start()`/`.stop()`. **Em dev liga o modo editor automaticamente** (F2); em build de produção o editor não entra no bundle (ADR-0042). |
| `GameLoop` | Loop principal (baixo nível; o `Game` já usa). `new GameLoop({ onUpdate(dt), onFixedUpdate? })`, `.start()`/`.stop()`. |
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

## Modo editor embutido (automático em dev)

**Você NÃO liga o editor — o `Game` faz isso sozinho em desenvolvimento.** Ao usar
`new Game({ canvas })`, o engine (bundle de dev) injeta o modo editor completo:
câmera de voo livre, gizmo, **hierarquia** e **inspector**, com reatividade nos
dois sentidos (mexeu no editor → reflete na cena; mexeu na cena por código →
reflete na hierarquia/inspector). No build de produção o editor nem entra no
bundle (ADR-0042), então não pesa. **NÃO reimplemente câmera de voo, seleção ou
gizmo à mão, e não monte os sistemas de editor manualmente** — é tudo automático.

Controles: **F2** liga/desliga · **WASD/QE** voa (Shift corre) · **botão direito**
olha · **clique** (ou item na hierarquia) seleciona · **1/2/3**
mover/rotacionar/escalar · **F** enquadra · **T** teleporta · **Esc** desseleciona.
A hierarquia lista os objetos nomeados da cena (dê `Object3D.name` aos seus
objetos pra eles aparecerem legíveis); o inspector edita posição/rotação/escala,
sombra (cast/receive) e, em luzes, intensidade/cor.

```ts
import { Game } from 'cortex-game-engine'

const game = new Game({ canvas })
game.scene.add(mesh)   // nomeie: mesh.name = 'Player'
game.onUpdate((dt) => { /* lógica */ })
game.start()
// pronto — em dev, F2 abre o editor; em prod ele não existe.
```

> Internamente o editor é `EditorState`/`EditorSelection`/`EditorCameraSystem`/
> `ObjectEditSystem` + `EditorHud`/`EditorOutliner`/`EditorInspector`, ligados por
> `attachEditor(game)` (só no bundle `index.dev.js`). Isso é detalhe de
> implementação — o jogo não importa nem referencia esses símbolos.

## Montar cena com .glb: carregar, instanciar, assentar e conectar

`loadGLB`, `instance`, `setShadows`, `placeOnGround`, `getWorldBounds`, `scatter`,
`Bounds`, `ShadowOptions`, `PlaceOptions`.

**NUNCA defina `position.y` no chute.** O pivô de cada `.glb` é arbitrário — um
`y` adivinhado deixa peças flutuando ou afundadas (o bug nº1 de cenário). O fluxo
é carregar → instanciar → adicionar → **assentar por bounding box**:

- `loadGLB(url)` — carrega (com cache por URL).
- `instance(gltf, { castShadow?, receiveShadow? })` — clona (seguro pra
  `SkinnedMesh`) e configura sombras nos meshes (default: projeta e recebe).
  Pra um objeto **sem sombra**, passe `{ castShadow: false }`.
- `placeOnGround(obj, { x, y, z, rotY, scale })` — aplica rotação/escala,
  centra horizontalmente em `(x, z)` e encaixa a **base** da geometria em `y`.
  Retorna `Bounds` (`minX/maxX/minZ/maxZ`, `topY`, `bottomY`, `size`, `center`).
- `getWorldBounds(obj)` — mede a caixa em world space **sem mover** o objeto.
- `setShadows(obj, { castShadow?, receiveShadow? })` — liga/desliga sombras de
  um objeto já na cena (ex.: excluir a água do shadowMap).
- `scatter(scene, url, count, area, opts)` — espalha N cópias num retângulo, cada
  uma assentada com rotação/escala variadas (vegetação em cluster, não em grid).

Conecte peças pelas **bordas medidas**, não por coordenada chutada:

```ts
import { loadGLB, instance, placeOnGround, scatter } from 'cortex-game-engine'

async function place(url, opts) {
  const obj = instance(await loadGLB(url))
  scene.add(obj)
  return placeOnGround(obj, opts)
}

// Ilhas afundadas 1.5u na água; medir as bordas reais de cada uma.
const a = await place('assets/land_a.glb', { x: 0, y: -1.5 })
const b = await place('assets/land_b.glb', { x: 25, y: -1.5 })

// Ponte no meio do vão real, deck no topo das ilhas:
await place('assets/bridge.glb', { x: (a.maxX + b.minX) / 2, y: a.topY, z: a.center.z })

// Marco empilhado no topo da ilha b:
await place('assets/flag.glb', { x: b.center.x, y: b.topY, z: b.center.z })

// Vegetação em cluster:
await scatter(scene, 'assets/tree.glb', 5, { x: 0, z: -3, w: 10, d: 4, y: a.topY })
```

## Iluminação exterior (preset)

`setupOutdoorLighting`, `OutdoorLighting`, `OutdoorLightingOptions`.

Configura tone mapping cinematográfico (ACES Filmic) + soft shadows no renderer e
adiciona sol (com sombras) + hemisphere + ambient. Encapsula a config de
shadow-camera/tone-mapping (que crua exige mexer no `WebGPURenderer` e no
`DirectionalLight.shadow`). Retorna as luzes pra ajuste em runtime.

```ts
import { setupOutdoorLighting, setShadows } from 'cortex-game-engine'

const lights = setupOutdoorLighting(renderer, scene, { sky: 0x9fd6ee, exposure: 0.95 })
lights.sun.intensity = 2.8           // ajuste em runtime
setShadows(decalMesh, { castShadow: false }) // tira um objeto do shadowMap
```

Pros meshes entrarem nas sombras, marque `castShadow`/`receiveShadow` (o `instance`
acima já faz isso pros `.glb`). Constantes de shadow map também exportadas:
`PCFSoftShadowMap`, `PCFShadowMap`, `BasicShadowMap`, `VSMShadowMap`.

## Água (experimental)

`Water` — plano de água cartoon com cáusticas opcionais. A textura entra como
**emissiveMap** (áreas claras "acendem" a água puxando-a pro branco) e desliza em
dois eixos. Recebe sombras. Aproximação visual barata (sem reflexão/refração/foam/
ondas reais); pra um mar realista seria preciso shader custom WebGPU.

```ts
import { Water } from 'cortex-game-engine'

const water = new Water(scene, {
  y: -1.5,
  color: 0x3b6e8f,
  causticsUrl: 'assets/textures/caustics.png', // opcional; omita pra água lisa
  repeat: 5,
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
