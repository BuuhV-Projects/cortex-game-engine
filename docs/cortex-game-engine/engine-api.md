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
| `FirstPersonCameraSystem` | Câmera/controle de **1ª pessoa** (FPS): mouse-look (pointer lock) + WASD + pulo sobre o player `CharacterBodyComponent`. Helper: `setupFirstPerson(game)`. |
| `FollowCamera2DSystem` | Câmera 2.5D de plataforma (segue no plano XY; roll/pitch/yaw e preset isométrico opcionais). |
| `TopDownCameraSystem` | Câmera **vista de cima** (jogos de fazenda/RPG 2D): segue o alvo no plano **XZ**, câmera acima olhando pra baixo; `angle` de reto top-down a 3/4. |
| `TopDownMovementSystem` | Movimento top-down (plano XZ + vira na direção). Recebe um `readMove: () => {x,y}` que o **jogo** fornece (input é do jogo, ADR-0066). Helper: `setupTopDown(game)`. |

### Câmera top-down (vista de cima) — jogos de fazenda/RPG 2D

`TopDownCameraSystem` segue a entity-alvo (`FollowCameraTargetComponent`) no **chão
(plano XZ)**, com a câmera acima. `angle: 0` = vista de cima pura (pixel art);
aumente pra um 3/4 estilo Stardew. Combine com `Game({ projection: 'orthographic' })`
pro look achatado. O alvo se move no plano XZ (X/Z) — top-down **não** usa a física
de plataforma (gravidade no Y); use input/movimento próprios no plano.

```ts
import { Game, TopDownCameraSystem, FollowCameraTargetComponent } from 'cortex-game-engine'
const game = new Game({ canvas, projection: 'orthographic' })
game.world.addSystem(new TopDownCameraSystem(game.camera, { height: 16, angle: 0 }))
// marque o player como alvo da câmera:
player.addComponent(new FollowCameraTargetComponent())
game.start()
```

### Câmera/controle de 1ª pessoa (FPS) — demo padrão de projeto novo

`setupFirstPerson(game)` liga a câmera/controle de primeira pessoa: **clique no
canvas** trava o cursor (mouse-look), **WASD** anda relativo ao olhar, **Espaço**
pula. O **player é um nó `character`** na cena (cápsula — física editável no
Inspector) e o terreno colidível um nó `terrain`; o `buildScene` registra sozinho
a física vertical do player (`CharacterPhysicsSystem` — gravidade/pulo/aterrar no
terreno por raycast). O movimento/look **não** é dado da cena — é wiring de gameplay
no `main.ts`. É o **demo do `templates/new-project/`** (terreno vazio + 1ª pessoa).

```ts
import { Game, buildScene, setupFirstPerson } from 'cortex-game-engine'
import level from './scenes/level.json'  // nó `terrain` + nó `player` com `character`
const game = new Game({ canvas })
setupFirstPerson(game, { camera: { moveSpeed: 6, eyeHeight: 1.6 } })
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
game.start()
```

O sistema mira o **único** player (entity com `TransformComponent` +
`CharacterBodyComponent`). Pausa no editor (F2) e no pause do play — não rouba o
mouse nem move o player enquanto você edita.

### Top-down (farm sim / RPG estilo Stardew)

`setupTopDown(game, { readMove })` liga o estilo **vista de cima 3/4**: movimento no
plano XZ (vira na direção do andar) + câmera 3/4 que segue o player. O **player é um nó
`character`** (cápsula — física editável no Inspector); o `buildScene` cuida do Y
(gravidade/aterrar). Use **perspectiva** (default do `Game`).

**Input é responsabilidade do JOGO** (ADR-0066): o engine só dá os recursos crus —
`InputManager` (teclado) e `GamepadManager` (gamepad, polled: `getAxis(slot,i)` /
`isButtonDown(slot,i)`). O **jogo** monta a camada de controle dele (ações, mapeamento,
até as constantes de botão do Xbox, factory teclado/joystick) e passa o **eixo de
movimento** ao `setupTopDown` via `readMove: () => ({ x, y })` (−1..1; analógico no stick).

> O `GamepadManager` já ouve `gamepadconnected`/`gamepaddisconnected` no `window`
> pra **reconexão confiável** — religar o controle volta a funcionar sem reiniciar
> (ADR-0067). Continue só chamando `poll()` por frame; use `dispose()` no teardown.

```ts
import { Game, buildScene, setupTopDown, GamepadManager } from 'cortex-game-engine'
import level from './scenes/level.json'  // chão/terrain + player nó `character`

const game = new Game({ canvas })

// O JOGO define seu controle (aqui simples; o A do Xbox é o índice 0 no layout padrão):
const pad = new GamepadManager()
const moveAxis = () => {
  pad.poll()
  const kx = (game.input.isKeyDown('d') ? 1 : 0) - (game.input.isKeyDown('a') ? 1 : 0)
  const ky = (game.input.isKeyDown('s') ? 1 : 0) - (game.input.isKeyDown('w') ? 1 : 0)
  return { x: pad.getAxis(0, 0) || kx, y: pad.getAxis(0, 1) || ky }
}
const interact = () => game.input.isKeyDown('e') || pad.isButtonDown(0, 0 /* A */)

setupTopDown(game, { readMove: moveAxis, move: { moveSpeed: 5 }, camera: { angle: 0.9, height: 18 } })
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world,
  physicsPaused: () => game.editorActive || game.gameplayPaused })
game.start()
game.onUpdate(() => { if (interact()) usarFerramenta() })
```

> Camada de controle robusta (ações nomeadas, rebinding, edge-detection, factory por
> dispositivo, constantes de layout Xbox) é código **do jogo** — o engine não crava
> nada disso. Ver `utils/controls.ts` do hearthvale-game como exemplo.

### Personagem modular (criador de personagem) — ADR-0068

`composeModularCharacter(rig, parts)` / `loadModularCharacter(rigUrl, partUrls[])`
montam um personagem de **peças que compartilham o mesmo esqueleto** (corpo/pele,
rosto, cabelo, roupa), rebindando cada peça nos ossos do rig **por nome** — base de um
criador com **mistura livre** (sem pré-assar combinações). O `rig.glb` traz esqueleto +
animações (o mesh próprio dele é descartado); cada peça é um `.glb` skinado no mesmo
esqueleto, sem clips. Retorna `{ object, animator }` — adicione `object` à cena e dê
`animator.update(dt)` no loop (o personagem composto **não** passa pelo
`builtScene.update`). Pés/origem: o composto tem origem nos pés (como qualquer `.glb`).

```ts
import { loadModularCharacter } from 'cortex-game-engine'
const { object, animator } = await loadModularCharacter('assets/models/parts/rig.v1.glb',
  ['body_10.v1.glb', 'outfit_01.v1.glb', 'face_f_usual02.v1.glb', 'hair_f_03.v1.glb'])
object.scale.setScalar(1.3)
scene.add(object)          // ou: playerObject.add(object) pra herdar a física do nó character
animator.play('Idle_Relaxed')
game.onUpdate((dt) => animator.update(dt))
```

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
sombra (cast/receive), **material Fosco (matte) liga/desliga** e, em luzes, intensidade/cor. No modo editor os **colliders
2D aparecem com contorno** (frame AABB): **azul = sólido**, âmbar = one-way, ciano =
não-sólido (player/gatilho) — mostra a hitbox real da física (e seu formato/offset),
automático.

**Física é propriedade do objeto (autorável no editor).** No inspector, todo objeto
nomeado tem uma seção **Física** com um seletor **Tipo de corpo** (estilo UPBGE):
- **Nenhum** — sem colisão.
- **Estático (sólido)** — collider de plataforma (chão/parede). Edita **forma**
  (caixa / círculo / cápsula), tamanho, **offset** (X/Y — sub-região tipo "deck" ou
  compensar pivô), sólido / one-way, e heightfield (perfil de chão: "Auto-traçar"
  amostra o topo do mesh; "Desenhar/editar" = clique adiciona ponto, arraste pra
  mover, Backspace desfaz, Enter finaliza). Ideal pra ponte arqueada/morro.
- **Character** — corpo de personagem (cápsula + gravidade + pulo): edita Raio,
  Altura, Step Height, Jump Force, Fall Speed Max, Max Jumps. Fica **em cima de
  qualquer mesh** (terreno/tiles/plataformas) via raycast; pula no espaço (no Play).
- **Rígido (Rapier)** — física dinâmica 3D de verdade (cai/empilha/empurra): edita
  o corpo (Dinâmico/Fixo/Cinemático). Só simula no Play. Ver a seção do Rapier abaixo.

O corpo fica **acoplado ao mesh** (mesma entidade) — **movem juntos**. Persiste no
overlay (`assets/scene-data.json` → `data.physics[nome]` pro tipo + `data.colliders[nome]`
pras dims). **Precedência: a autoria do Inspector (overlay) VENCE o código/JSON** —
você pode **trocar pra Nenhum e REMOVER** um collider declarado em `node.collider`
(ou herdado do kit), trocar pra Character, etc. Tudo fica visível e editável no
Inspector (não há mais collider "preso no código" sem controle).

> **Regra pra física (importante pra IA e pra receitas):** declare a física de
> forma que ela **apareça e seja editável no Inspector** — use os campos do nó
> (`collider`, `player`, `character`) no `level.json`, que o Inspector lê e o
> usuário pode **editar/remover/trocar** (overlay vence). **NUNCA** crave colisão
> só no **código** (ex.: `entity.addComponent(new Collider2DComponent(...))` /
> `new CharacterBodyComponent(...)` espalhado no `main.ts`): isso fica **invisível
> ao Inspector** e o usuário "não sabe onde está e não tem controle". Física é dado
> da cena, não lógica imperativa — quem precisa de chão sólido marca **Estático**;
> quem é personagem marca **Character**.

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
`water`, `background` (backdrop 2D com parallax — ver abaixo), `sprite` (sprite/
spritesheet 2D — ver abaixo), `terrain` (heightmap horizontal esculpível — ver abaixo).
Campos comuns: `id` (único; vira `Object3D.name` e chave do editor),
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

## Animação de modelos (clipes do .glb)

`SceneAnimator` + campo `animation` no nó `model`.

Modelos `.glb` com clipes embutidos (ex.: personagens KayKit/Quaternius — idle/run/
jump/…) tocam animação **data-driven**: ponha `animation` no nó (qual clipe, loop,
velocidade) e o `buildScene` cria um `AnimationMixer` e toca. **O JSON vence o código.**

```jsonc
{ "type": "model", "id": "hero", "url": "assets/Knight.glb",
  "animation": { "clip": "Idle", "loop": true, "speed": 1 } }
```

`clip` (nome; default = 1º), `loop` (default true), `speed` (default 1), `autoplay`
(default true). O `buildScene` tica os mixers no `handle.update` (chame `scene.update(dt)`
no loop). Cada modelo animado ganha um `SceneAnimator` em `obj.userData.cortexAnim`
(`.clipNames()`, `.play(name, { loop, speed })`, `.stop()`) — é o que o **editor** usa
na seção "Animação" do inspector (escolher clipe + ▶/⏹ + loop/velocidade, persistido).

## Animação do PLAYER por ação (state machine)

`PlayerAnimatorComponent` + `PlatformerAnimationSystem` (registrado pelo `setupPlatformer`).

O player toca a animação certa **por estado**, sem código ad-hoc: o sistema deriva a
**ação** do `PlatformerBodyComponent` (idle/walk/run no chão, jump/fall no ar) e toca o
clipe mapeado no `SceneAnimator`. O mapa ação→clipe é **EXPLÍCITO** no nó `player`
(campo `animations`) — **nada de auto-map escondido em runtime**. Animação **não é
obrigatória**: sem `animations`, o player não anima.

```jsonc
{ "type": "model", "id": "player", "url": "assets/Knight.glb", "player": true,
  "animations": { "idle": "Idle_A", "run": "Running_A", "jump": "Jump_Idle", "fall": "Jump_Idle" } }
```

Ações: `idle`/`walk`/`run`/`jump`/`fall`/`land` (locomoção, automáticas) + custom
one-shot (`attack`/`hurt`/…) via `entity.getComponent(PlayerAnimatorComponent).trigger('attack')`.
Fallback (run↔walk, fall↔jump, land→idle) cobre uma ação sem clipe. **Inferência por
nome existe mas é materializada**: a IA escreve o mapa no JSON, ou o editor o gera com
o botão "Auto-mapear pelos nomes" (que GRAVA em `data.playerAnimations[id]`). O editor
edita por ação (seção "Ações do player") e dá preview (▶). Precedência: overlay > nó.
A util `autoMapPlayerClips(clipNames, explicit)` gera o mapa (não roda sozinha).

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
- `setMatte(obj, opts?)` — deixa os materiais **foscos** (mata o brilho plástico/
  PBR dos `.glb` stylized → look **cartoon/desenho**): zera specular/reflexo
  (`roughness=1`, `metalness=0`, `envMapIntensity=0`), mantendo as texturas. Aplique
  num objeto ou na **raiz da cena** pra deixar tudo fosco. Na cena data-driven, use
  `matte: true` num nó ou `buildScene(..., { matte: true })` pra **todos** os modelos.
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

## Backdrop 2D / parallax (background)

`Background` + nó `background` na cena.

Fundo de cena pra 2.5D/2D: uma imagem (jpg/png, tileável na horizontal) num quad
**unlit atrás de tudo** que **segue a câmera** (sempre preenche a vista) e **rola em
parallax** conforme o player anda. Use uma por **tema/mood** (céu/cidade/floresta).

```jsonc
// nó na cena (precisa de camera no buildScene):
{ "type": "background", "id": "bg", "image": "assets/bg/adventure.jpg", "parallax": 0.3 }
```
```ts
// main.ts — passe a câmera pro buildScene animar o backdrop:
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world, camera: game.camera })
game.onUpdate((dt) => scene.update(dt)) // tica o parallax do background (e a água)
```

`parallax` 0–1: `0` = travado na tela (infinitamente longe), `1` = anda com o mundo;
`0.3` (default) = fundo distante. Imperativo: `new Background(scene, camera, { url, parallax })`
+ `bg.update()` no loop. No kit, backgrounds têm `role: background` + `tags` por tema.

## Sprite 2D / spritesheet (sprite)

Nó `sprite` na cena (data-driven, ADR-0057) — sprite estático ou **animado** por
spritesheet. Estático = só `url`. Animado = `url` + grade de frames (`frameWidth/
frameHeight` **ou** `columns/rows`) + `animations` (`{ nome: { frames, fps?, loop? } }`).
A grade indexa frames `0 = topo-esquerda`, esquerda→direita. `pixelsPerUnit` (default
100) dimensiona o quad; `width`/`height` sobrescrevem.

```jsonc
// sprite estático (placa, ícone, decoração):
{ "type": "sprite", "id": "placa", "url": "assets/sign.png", "place": { "x": 4, "y": 0 } }

// personagem animado (strip horizontal de 3 frames 128×256 → columns: 3):
{ "type": "sprite", "id": "hero", "url": "assets/hero_walk.png",
  "columns": 3, "pixelsPerUnit": 64,
  "animations": { "idle": { "frames": [0] }, "walk": { "frames": [0, 1, 2], "fps": 8 } },
  "initial": "walk", "transform": { "position": [0, 1.5, 0] } }
```

O sprite **animado** precisa de `world` no `buildScene` — ele cria a entidade ECS
(`Object3DComponent` + `SpriteAnimationComponent`) e liga o `SpriteAnimationSystem`
sob demanda. Troque de animação em runtime via o componente: `comp.play('idle')`.
No **kit**, o asset carrega a framedata (`sprite: { columns, animations, initial, … }`)
e o nó só referencia a `url` — o `buildScene` herda a grade/animações do kit (campos
do nó vencem), igual ao preset de `collider` por `role`.
Imperativo: `loadTexture(url)` → `new Spritesheet(tex, { frameWidth, frameHeight })` →
`createAnimatedSprite(sheet, anims, { initial })`. (Limites: `collider`/`player` no
sprite e packing de PNGs separados em uma folha ficam fora desta fase — ver ADR-0057.)

## Terreno heightmap (terrain) — top-down/3D

Nó `terrain` (ADR-0059): um plano horizontal (XZ) subdividido que você **esculpe**
— `Terrain.sculpt(x, z, raio, delta)` levanta/abaixa a altura (Y) com falloff suave
(`delta>0` sobe, `<0` abaixa). No editor o pincel tem dois **modos** (seção Terreno
do Inspector, ADR-0063): **Esculpir** (altura) e **Texturizar** (pinta textura —
escolha uma imagem do projeto ou importe com "Importar textura…"; SHIFT apaga). O
heightmap persiste em `overlay.data.terrain[id]` e a pintura em
`overlay.data.terrainPaint[id]`. Combine com a câmera top-down pra jogos de
fazenda/RPG.

```jsonc
{ "type": "terrain", "id": "chao", "size": 60, "resolution": 96, "color": "#6ab04c" }
```
```ts
import { Terrain } from 'cortex-game-engine'
const terrain = new Terrain({ size: 60, resolution: 96 })
scene.add(terrain.mesh)
terrain.sculpt(0, 0, 8, 3)        // morro de raio 8 no centro
const heights = terrain.getHeights() // serializável; terrain.setHeights(...) restaura

// Pintura de textura (splat, até 4 camadas — uma por canal RGBA do splatmap):
const grama = terrain.layerFor('assets/textures/grama.png') // aloca/reusa camada
terrain.paint(0, 0, 8, 1, grama)  // pinta raio 8 no centro (amount<0 apaga)
terrain.setLayerRepeat(grama, 16) // tiling (repetições ao longo do terreno)
const paint = terrain.getPaint()  // serializável; terrain.setPaint(...) restaura
```

`resolution` = segmentos por lado (grade `(res+1)²`). **Sólido por padrão**: com
`world` no `buildScene`, o terreno vira colidível — `TerrainCollisionSystem` mantém
os corpos (`PlatformerBodyComponent`/`KinematicBodyComponent`) EM CIMA da superfície
(`Terrain.heightAt(x,z)`), vale pra 3D/2.5D/top-down. Limites: sculpt só raise/lower
(smooth/flatten vêm depois); máx. 4 texturas por terreno; trocar o Shader (ADR-0058)
do objeto-terreno desfaz o blend de splat.

## Character controller (player/NPC com cápsula — estilo UPBGE)

`CharacterBodyComponent` (cápsula `radius`/`height`) + `CharacterPhysicsSystem` =
character controller com gravidade, **pulo** (`jumpForce`/`maxJumps`), queda
limitada (`fallSpeedMax`) e `stepHeight`. **Chão = colisão real (tipo Unity):**
passando as **raízes da cena**, o sistema faz **raycast pra baixo** e o personagem
**cai e pousa na geometria real** (terreno, tiles, plataformas) em qualquer altura
— sobe degraus até `stepHeight`, ignora o próprio mesh. Aterra e colide **no mesmo
tick** da gravidade → **não treme**. **Fallback:** o piso plano `groundY` é a rede
de segurança (não cai no vazio se não houver nada embaixo). Movimento horizontal
(X/Z ou X/Y) fica com o input do jogo; o sistema cuida do Y. Pivô nos **pés**
(`transform.y` = base).

```ts
import { CharacterBodyComponent, CharacterPhysicsSystem } from 'cortex-game-engine'
// COM colisão real (recomendado): passe as raízes da cena → pousa na geometria.
game.world.addSystem(new CharacterPhysicsSystem([game.scene.getThreeScene()]))
player.addComponent(new TransformComponent(x, y, z))
// groundY = piso de segurança (default -Infinity = sem rede; data-driven usa 0).
player.addComponent(new CharacterBodyComponent({ radius: 0.4, height: 1.8, jumpForce: 9, maxJumps: 1, groundY: 0 }))
// no input (ex.: espaço): player.getComponent(CharacterBodyComponent)!.jump()
// SEM raízes (new CharacterPhysicsSystem()) → sem colisão, só o piso groundY.
```

Props (UPBGE): `stepHeight` (degrau que sobe andando), `jumpForce` (vel. do pulo),
`fallSpeedMax` (queda máx.), `maxJumps` (nº de pulos antes de tocar o chão),
`groundY` (piso plano de fallback se não houver geometria embaixo).

**Data-driven (preferido — fica editável no Inspector):** marque o nó com
`character` no `level.json` (ou troque o **Tipo de corpo → Character** no Inspector).
O `buildScene` cria o `CharacterBodyComponent` e **registra sozinho** o
`CharacterPhysicsSystem` **com colisão real** (raízes da cena) — o personagem cai e
pousa na geometria. Passe `physicsPaused: () => game.editorActive` pro personagem
não cair durante a edição. O `groundY` (piso de fallback) é **`0` por padrão**:
```jsonc
{ "type": "model", "id": "hero", "url": "assets/Knight.glb",
  "character": { "radius": 0.4, "height": 1.8, "jumpForce": 9, "maxJumps": 1 } }
```
```ts
await buildScene(game.scene, defs, { world: game.world, physicsPaused: () => game.editorActive })
// pular no espaço: game.world.query(CharacterBodyComponent)[0]?.getComponent(CharacterBodyComponent)!.jump()
```
Assim o usuário vê/edita/remove o Character pelo Inspector. Evite cravar
`CharacterBodyComponent` só no código (some do Inspector — ver a regra de física acima).

## Física dinâmica de verdade (Rapier — corpos que caem/empurram/empilham)

Pra física **dinâmica estilo Unity** (gravidade real, colisão, empilhar, empurrar)
o engine integra o **Rapier** (motor WASM). É **carregado sob demanda** — só baixa
quando o jogo usa física (TDR-0002). Exports: `RapierPhysics`, `RapierPhysicsSystem`,
`RapierBodyComponent`.

- **`RapierPhysics.create(gravity?)`** — `async` (inicializa o WASM). Faça no boot.
- **`RapierPhysicsSystem(physics)`** — dá `step` (passo fixo) e **escreve o `Object3D`**
  (posição + rotação) a partir da simulação: **o Rapier é o dono do transform**
  desses objetos. **NÃO** ponha a mesma entidade no `Object3DSyncSystem` (briga).
- **`RapierBodyComponent`** — declara o corpo: `bodyType` (`'dynamic'` cai/é empurrado,
  `'fixed'` imóvel = chão/parede, `'kinematic'` você move), `shape`
  (`{ kind: 'auto' }` = caixa do bounds do mesh, ou `box`/`ball`/`capsule`),
  `restitution`/`friction`/`isSensor` (trigger). **Atenção: é `bodyType`, não `type`**
  (o ECS usa `type` como chave). O **handle** do corpo fica em `.body` (`PhysicsBody`,
  `null` até o 1º tick criar).
- **`PhysicsBody`** (o `.body` do componente) — controla o corpo dinâmico em gameplay
  **sem furar pro Rapier interno**: `applyImpulse({x,y,z})` (chutar/empurrar),
  `applyTorqueImpulse`, `setLinvel`/`linvel()`, `setAngvel`/`angvel()`,
  `setTranslation`/`setRotation` (teleporte), `wakeUp()`, e `reset(pos?, rot?)` (zera
  velocidades + opcionalmente teleporta — recolocar a bola no centro). `translation()`/
  `rotation()` leem a pose. Pegue via `entity.getComponent(RapierBodyComponent)!.body`.

```ts
// chutar a bola na direção dir (Vec3 normalizado) com força `power`:
const ball = ballEntity.getComponent(RapierBodyComponent)!.body
ball?.applyImpulse({ x: dir.x * power, y: 0, z: dir.z * power })
// recolocar no centro do campo (sem sair voando com a velocidade antiga):
ball?.reset({ x: 0, y: 0.5, z: 0 })
```

**Pause no editor (importante!):** marque `system.pauseWhen = () => game.editorActive`
— senão a física **simula em modo de edição (F2)** e os corpos caem enquanto o
usuário edita a cena. Só deve simular no Play (igual à Unity), como os outros
sistemas de gameplay.

```ts
import { RapierPhysics, RapierPhysicsSystem, RapierBodyComponent, Object3DComponent } from 'cortex-game-engine'

const physics = await RapierPhysics.create({ x: 0, y: -9.81, z: 0 }) // lazy-load do rapier.js
const physicsSystem = new RapierPhysicsSystem(physics)
physicsSystem.pauseWhen = () => game.editorActive // NÃO simular no editor
game.world.addSystem(physicsSystem)

// chão fixo
const floor = game.world.createEntity()
floor.addComponent(new Object3DComponent(floorMesh))
floor.addComponent(new RapierBodyComponent({ bodyType: 'fixed', shape: { kind: 'auto' } }))

// caixa que cai e empilha
const box = game.world.createEntity()
box.addComponent(new Object3DComponent(boxMesh)) // boxMesh.position define onde nasce
box.addComponent(new RapierBodyComponent({ bodyType: 'dynamic', shape: { kind: 'auto' } }))
```

**Data-driven (preferido — sem código no main.ts):** marque o nó com `rapierBody`
no `level.json`. O `buildScene` cria o corpo, **registra o sistema sozinho** (lazy
WASM) e respeita `physicsPaused` (pause no editor). Não precisa criar a malha/corpo
à mão:
```jsonc
// chão fixo + caixa que cai
{ "type": "primitive", "shape": "box", "id": "chao", "size": [20,1,20],
  "transform": { "position": [0,-0.5,0] }, "rapierBody": { "bodyType": "fixed", "shape": { "kind": "auto" } } },
{ "type": "primitive", "shape": "box", "id": "caixa", "size": 1,
  "transform": { "position": [0,8,0] }, "rapierBody": { "bodyType": "dynamic", "shape": { "kind": "auto" } } }
```
```ts
await buildScene(game.scene, defs, { world: game.world, physicsPaused: () => game.editorActive })
```
Prefira isso a montar o Rapier em código — assim a física é DADO da cena e fica
**editável no Inspector**: seção **Física** → **Tipo de corpo → "Rígido (Rapier)"**,
com um sub-seletor Dinâmico/Fixo/Cinemático. Marcar/editar persiste no overlay
(`data.physics[id] = { type: 'rigid', rapier: { bodyType } }`) e o `buildScene`
reaplica. **Objetos criados em código (não-nós) não persistem** essa autoria — pra
ser editável no F2, o corpo precisa ser um **nó** (`rapierBody` no JSON acima).

Quando usar **Rapier** vs o resto: Rapier = corpos dinâmicos 3D (caixas, barris,
ragdoll, empilhar/empurrar). Pro **player/NPC** que anda no chão, o
`CharacterBodyComponent` (cápsula + pulo + chão por raycast, acima) ainda é o caminho
simples; a migração do player pro CharacterController do Rapier vem depois (TDR-0002).
Autoria data-driven do Rapier (nó na cena + Inspector) ainda **não** existe — por ora
o Rapier é montado em código (`main.ts`).

## Material / shader por objeto (material)

Atribui um "shader" (material do Three) a um objeto pela propriedade `material` do nó
(ADR-0058) — como na Unity. Presets: `standard` (PBR original do `.glb`), `unlit`
(textura × cor **sem luz**, look fullbright/vívido — porta o `Supyrb/Unlit/Texture`;
knobs: `cull`/`depthWrite`/`depthTest`/`opacity`/`alphaTest`), `toon` (cel-shading em
bandas + `outline` opcional).

```jsonc
// personagem com look unlit/fullbright (cores chapadas, sem sombra/AO no corpo):
{ "type": "model", "id": "hero", "url": "assets/Knight.glb",
  "material": { "type": "unlit", "color": "#ffffff" } }

// look toon/cel (3 bandas de luz + contorno preto fino):
{ "type": "model", "id": "boss", "url": "assets/Boss.glb",
  "material": { "type": "toon", "gradientSteps": 3, "outline": 0.03 } }
```
```ts
// imperativo (troca não-destrutiva; standard/clearMaterial restaura o original):
import { applyMaterial, clearMaterial, getMaterialType } from 'cortex-game-engine'
applyMaterial(obj, { type: 'unlit', color: 0xffffff })
clearMaterial(obj) // volta ao material original
```

`unlit` preserva o `map` (textura de cor) do material original e desliga a luz/tonemap.
`castShadow` segue valendo (a sombra projetada não depende do material). Limites (S1):
contorno toon não acompanha skinning; GLSL custom e o dropdown no inspector vêm depois.

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
