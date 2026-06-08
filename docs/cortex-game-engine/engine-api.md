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

## Modo editor embutido (automático em dev)

**Você NÃO liga o editor — o `Game` faz isso sozinho em desenvolvimento.** Ao usar
`new Game({ canvas })`, o engine (bundle de dev) injeta o modo editor completo:
câmera de voo livre, gizmo, **hierarquia** e **inspector**, com reatividade nos
dois sentidos (mexeu no editor → reflete na cena; mexeu na cena por código →
reflete na hierarquia/inspector). No build de produção o editor nem entra no
bundle (ADR-0042), então não pesa. **NÃO reimplemente câmera de voo, seleção ou
gizmo à mão, e não monte os sistemas de editor manualmente** — é tudo automático.

**Boot em modo EDIÇÃO (estilo Unity):** em dev o jogo abre **editável** (gameplay
pausada); um botão **▶ Play** (topo, ou **F2**) entra no modo jogo, e **⏹ Stop**
volta pra edição **revertendo** o que mudou no play (posições do mundo). A tool de
playtest da IA boota direto em modo jogo via `?play` na URL. Em produção não há
editor — o jogo sempre roda.

Controles: **▶ Play / F2** alterna edit↔play · **WASD/QE** voa (Shift corre) ·
**botão direito** olha · **clique** (ou item na hierarquia) seleciona · **1/2/3**
mover/rotacionar/escalar · **F** enquadra · **T** teleporta · **Esc** desseleciona.
A hierarquia lista os objetos nomeados da cena (dê `Object3D.name` aos seus
objetos pra eles aparecerem legíveis); o inspector edita posição/rotação/escala,
sombra (cast/receive) e, em luzes, intensidade/cor. No modo editor os **colliders
2D aparecem com contorno** (frame AABB): **azul = sólido**, âmbar = one-way, ciano =
não-sólido (player/gatilho) — mostra a hitbox real da física (e seu formato/offset),
automático.

**Collider é propriedade do objeto (autorável no editor).** No inspector, todo
objeto nomeado tem uma seção **Collider**: se não tem collider, botões "Adicionar"
e "Desenhar chão (heightfield)"; se tem, edita **forma** (caixa / círculo / cápsula),
tamanho, **offset** (X/Y — pra cobrir uma sub-região tipo "deck" ou compensar pivô),
e tipo (sólido / one-way) + Remover. **Heightfield (perfil de chão):** "Auto-traçar
chão" gera o perfil amostrando o topo do mesh; "Desenhar/editar" entra no modo de
traçado — **clique adiciona ponto, arraste um handle pra mover**, Backspace desfaz,
Enter finaliza (o clique pousa na superfície do mesh, independe da câmera). Ideal
pra ponte arqueada/morro. Tudo persiste no overlay.
O collider fica **acoplado ao mesh** (mesma entidade) — **movem juntos**. Persiste
no overlay (`assets/scene-data.json` → `data.colliders[nome]`). **Precedência:** um
`collider` definido no código/JSON (`node.collider`) **vence** e aparece read-only
("definido no código"). Offset também existe na física: collider sólido em que o
player anda **não trava mais** (a resolução X só vira "parede" na menor penetração).

**Gameplay pausa no editor + edição "gruda".** Enquanto o editor (F2) está ativo,
`Game.editorActive` fica `true` e os sistemas de gameplay são pausados — basta
marcar `system.pauseWhen = () => game.editorActive` (o `World` pula o `update`
desse sistema no tick). `setupPlatformer` já faz isso com física e input, então o
player não cai nem se move enquanto você edita. E mover/rotacionar um objeto que
tem entidade ECS (Object3D sincronizado) **escreve de volta no `TransformComponent`**,
então a edição persiste quando você dá play (não é sobrescrita pelo sync).

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

## Cena data-driven (JSON) — FORMA RECOMENDADA de autorar a cena

`SceneDefinition`, `SceneNode`, `buildScene`, `addSceneNode`, `parseSceneDefinition`,
`SceneHandle`, `BuildSceneOptions`.

**Autore a cena como DADO (arquivos JSON em `scenes/`), não como código imperativo.**
Assim o **editor (F2) edita/move/remove/adiciona e SALVA de volta** (a lógica de
jogo continua em TS — systems/components). A cena é uma lista de **nós**; o
`buildScene` é o ÚNICO ponto de instanciação (nó removido nunca é criado → sem
desperdício). Os JSON são **importados** (o Vite bundla no build; multi-arquivo
em dev, sem fetch).

Tipos de nó (`type`): `model` (`url` do `.glb`), `primitive` (`shape`:
box/cylinder/plane/sphere), `light` (`light`: directional/hemisphere/ambient),
`water`. Campos comuns: `id` (único; vira `Object3D.name` e chave do editor),
`place` (grounding: assenta a base em `y`, centra em `x,z` — **use no lugar de
`y` chutado**) ou `transform` (pose direta), `castShadow`/`receiveShadow`. Cores
aceitam hex string (`"#9fd6ee"`). Cena: `background`, `fog`, `outdoorLighting`.

```jsonc
// scenes/world.json  (importável: o Vite bundla)
{
  "version": 1,
  "background": "#9fd6ee",
  "fog": { "color": "#9fd6ee", "near": 60, "far": 220 },
  "outdoorLighting": { "sky": "#9fd6ee", "exposure": 0.95 },
  "nodes": [
    { "type": "water", "id": "water", "y": -1.5, "color": "#3b8fb5", "causticsUrl": "assets/textures/caustics.png" },
    { "type": "model", "id": "ilha_1", "url": "assets/land_001.glb", "place": { "x": 0, "y": -1.5 } },
    { "type": "model", "id": "ponte_1", "url": "assets/bridge_001.glb", "place": { "x": 12.5, "y": 0.2 } }
  ]
}
```

```ts
// main.ts
import { Game, buildScene, SceneLoader, type SceneDefinition } from 'cortex-game-engine'
import world from './scenes/world.json'
import props from './scenes/props.json'
const game = new Game({ canvas }); game.start()
const overlay = await new SceneLoader().loadSceneFile('assets/scene-data.json') // edições do editor
const scene = await buildScene(game.scene, [world, props] as unknown as SceneDefinition[], { renderer: game.renderer, overlay })
game.onUpdate((dt) => scene.update(dt)) // anima água
```

**Como autorar bem (a IA é a level designer):**
- **Conexões/posições:** compute `x`/`z` a partir das **dimensões do `inspect_assets`**
  (você não roda código na autoria, então BAKE o valor): ex. ponte em
  `x = (ilhaA_centroX + ilhaA_larguraX/2 + ilhaB_centroX − ilhaB_larguraX/2) / 2`.
  Use `place.y` pra o grounding (nunca chute `y`).
- **Multi-arquivo:** quebre por região/feature (`world.json`, `obstaculos.json`,
  `decoracao.json`) — diffs limpos, edição cirúrgica. `nodes` são concatenados.
- **Overlay do editor** (`assets/scene-data.json`): o editor grava ali transform
  overrides + `data.deleted` + `data.added`. O `buildScene` aplica por cima. Pra
  "achatar" as edições na base depois, leia a overlay e mova as entradas pros
  arquivos `scenes/*.json` (e limpe a overlay).
- **Atmosfera** (o que deixa BONITO): use `outdoorLighting`/`fog`/`background` no
  JSON e, pra bloom/vignette, `game.setPostFX(...)` no `main.ts` (ver Atmosfera).
- Valide com `playtest_game` (varredura close-up por região) e `critique_scene`.

> Pra cenas/efeitos que precisam de lógica (computar muitas posições, instanciar
> condicional), os helpers imperativos abaixo (`loadGLB`/`placeOnGround`/`scatter`)
> seguem disponíveis — são o que o loader usa por dentro. Mas a cena ESTÁTICA
> deve ser JSON, pra o editor poder editá-la.

## Kit de assets / vocabulário (design system — ADR-0053)

`KitDefinition`, `KitAsset`, `KitAnchor`, `parseKit`, `kitAssetFor`, `kitAnchor`,
`KIT_ROLES`, `AttachConfig`.

Um **kit** (`kit.json`) é o *vocabulário* de um pacote de assets: tagueia cada `.glb`
em três eixos — **`role`** (natureza física: `ground`/`connector`/`prop`/`collectible`/
`decoration`/…), **`tags`** (tema/bioma) e **`gameplayRole`** (função: `guidance`/
`reward`/`landmark`/`cover`/…) — com `size`, `collider` preset, `anchors` (sockets) e
`thumb`. Passe o(s) kit(s) ao `buildScene` via `options.kit` pra ganhar duas coisas:

- **Collider por `role`** — um nó `model` cujo `.glb` está no kit **herda** o collider
  preset do kit se não definir `collider` próprio. Precedência: `node.collider` (explícito)
  > collider do editor > preset do kit.
- **`attach` (placement por socket)** — em vez de chutar `x`/`z`, um nó declara que seu
  socket encaixa numa âncora de outro nó; o `buildScene` resolve a pose (translação) em
  ordem topológica. É o análogo do `place` (grounding em Y) para o plano X/Z.

```jsonc
// nó na cena: encaixa o socket "a" da ponte na âncora "edge_right" da ilha_1
{ "type": "model", "id": "ponte_1", "url": "assets/bridge.glb",
  "attach": { "socket": "a", "to": "ilha_1", "toSocket": "edge_right" } }
```

```ts
import { Game, buildScene, parseKit, setupPlatformer } from 'cortex-game-engine'
import kitJson from '../assets/kit.json'
import level from './scenes/level.json'

const kit = parseKit(kitJson)            // valida; null se inválido
const game = new Game({ canvas }); setupPlatformer(game); game.start()
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world, kit: kit! })
```

`attach` **falha alto** (lança) em socket/âncora ausente ou ciclo — nunca cai numa pose
chutada. Sockets/`role` vêm do `kit.json`, gerado pela skill `process-asset-kit`.

## Plataforma 2.5D (gameplay)

`setupPlatformer`, `PlatformerBodyComponent`, `Collider2DComponent`,
`PlatformerPhysicsSystem`, `PlatformerInputSystem`, `FollowCamera2DSystem`.

O engine é focado em **plataforma 2.5D** (gameplay no plano XY; sobe/desce/lados).
No JSON data-driven, dois campos extras nos nós `model`/`primitive`:

- **`collider`** — vira plataforma/chão sólido, **acoplado ao mesh** (movem juntos):
  `{ shape?, width?, height?, offsetX?, offsetY?, solid?, oneWay?, points? }`.
  `shape`: `box` (default), `circle` (raio = `width/2`), `capsule` (vertical;
  `width` = diâmetro, `height` = altura total — boa pro player escorregar em quinas)
  ou **`heightfield`** (perfil de chão: `points: [[x,y],…]` LOCAL ordenado por X — o
  player **segue a curva**; ideal pra pontes arqueadas/morros/rampas; floor one-way).
  Dims omitidas → do bounding box; `solid` default true; `oneWay` = atravessável por
  baixo; `offsetX/offsetY` deslocam pra cobrir uma sub-região (ex.: só o "deck",
  não os pilares) sem desacoplar.
- **`player: true`** (ou `{ moveSpeed?, jumpSpeed?, gravity?, maxFall? }`) — vira o
  personagem (corpo de física + alvo da câmera).

`buildScene(..., { world })` cria as entidades ECS desses nós. `setupPlatformer`
liga os 4 sistemas (sync, input ←/→ + Espaço/↑, física, câmera 2D-follow):

```ts
import { Game, buildScene, setupPlatformer } from 'cortex-game-engine'
import level from './scenes/level.json'

const game = new Game({ canvas })
const { followCamera } = setupPlatformer(game, { camera: { distance: 16 } })
// followCamera.setRoll(0.05)  // leve giro 2.5D no eixo Z (travado em 0 por padrão)
// followCamera.setPitch(0.12) // tilt no eixo X p/ profundidade/parallax (travado em 0)
// followCamera.setYaw(0.4)    // giro no Y vertical (profundidade pela lateral)
// followCamera.setIsometric() // preset 3/4 isométrico (yaw 45° + pitch ≈35°)
game.start()
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
```

Tunables do pulo/alcance ficam no `player`/`PlatformerBodyComponent`
(`jumpSpeed`/`gravity`/`moveSpeed`) — use-os pra dimensionar gaps PULÁVEIS no level.

## Montar cena com .glb (imperativo — internals / casos com lógica)

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

## Atmosfera / mood (o que mais deixa a cena BONITA)

Posicionar bem tira a cena de "quebrada"; **atmosfera** tira de "ok" pra "bonita".
Combine, e calibre pra casar com a referência:

- **Luz** — `setupOutdoorLighting(game.renderer, game.scene, { sky, sunColor, sunIntensity, exposure })`
  (sol+sombras+tone mapping). Mood quente (golden hour) = `sunColor` alaranjado +
  exposição menor; meio-dia = sol branco forte.
- **Névoa** — `game.scene.getThreeScene().fog = new Fog(cor, near, far)` (a cor da
  névoa = cor do céu dá profundidade; afasta o horizonte).
- **Céu/ambiente realista** — `Skybox.fromHDRI(game.scene, 'assets/sky.hdr', { environmentIntensity })`
  (ilumina a cena com o HDRI — muda tudo numa cena realista).
- **Pós-processamento** — `PostFX` ligado via `game.setPostFX(...)` (bloom dá o
  "glow" cartoon, vignette foca o olhar, tone mapping/exposição fecham o look):

```ts
import { Game, Fog, Color, setupOutdoorLighting, PostFX, ACESFilmicToneMapping } from 'cortex-game-engine'

const game = new Game({ canvas })
const three = game.scene.getThreeScene()
const SKY = 0x9fd6ee
three.background = new Color(SKY)
three.fog = new Fog(SKY, 60, 220)
setupOutdoorLighting(game.renderer, game.scene, { sky: SKY, exposure: 0.95 })

// Atmosfera: bloom suave + vignette + ACES. Com o Game, ligue via setPostFX —
// o Game passa a renderizar o JOGO pelo PostFX (no editor volta pro render cru).
const fx = new PostFX(game.renderer, game.scene, game.camera, {
  bloom: { strength: 0.6 }, vignette: true, fxaa: true,
  toneMapping: ACESFilmicToneMapping, exposure: 1.05,
})
game.setPostFX(fx)
// runtime: fx.bloom?.strength.value = 0.9
game.start()
```

Cartoon (suas referências de ilhas): saturação alta, bloom suave, sombras macias,
céu/água saturados. Realista: HDRI + exposição calibrada + bloom discreto.

## 2D / Pixel art (sprite, spritesheet, tilemap)

Pra jogo **pixel 2D**: câmera **ortográfica** + sprites com **nearest filter**. A
física 2D (`setupPlatformer`, `Collider2DComponent`, etc.) e o editor funcionam
igual. Símbolos: `createSprite`, `pixelate`, `Spritesheet`, `createAnimatedSprite`,
`SpriteAnimationComponent`/`System`, `buildTilemap`, `NearestFilter`.

- **Câmera ortográfica:** `new Game({ canvas, projection: 'orthographic',
  pixelsPerUnit: 16 })` — `pixelsPerUnit` = px de tela por unidade de mundo (zoom).
- **Sprite:** `createSprite(tex, { pixelsPerUnit })` → quad unlit, transparente,
  nearest. Textura: `loadTexture(url, { pixelated: true })`.
- **Animação:** `new Spritesheet(tex, { frameWidth, frameHeight })` +
  `createAnimatedSprite(sheet, { idle:{frames:[0,1],fps:4}, run:{frames:[2,3,4,5],
  fps:12} }, { pixelsPerUnit, initial:'idle' })` → `{ sprite, animation }`. Bote
  `Object3DComponent(sprite)` + `animation` numa entidade; registre
  `SpriteAnimationSystem`. Troque com `animation.play('run')`.
- **Tilemap:** `buildTilemap({ tileset, tileWidth, tileHeight, tileSize, data })` →
  `{ mesh, addColliders }`. `data[linha][coluna]` = índice do tile (`<0` = vazio).
  `map.addColliders(world)` cria o chão sólido (mescla runs horizontais).

```ts
const game = new Game({ canvas, projection: 'orthographic', pixelsPerUnit: 16 })
setupPlatformer(game, { camera: { distance: 8 } })
const tiles = await new AssetLoader().loadTexture('tiles.png', { pixelated: true })
const map = buildTilemap({ tileset: tiles, tileWidth: 16, tileHeight: 16, data: level })
game.scene.add(map.mesh); map.addColliders(game.world)
game.start()
```

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
