# Arquitetura do cortex-game-engine — como tudo se conecta

> **Fonte de verdade viva.** Este doc descreve como as peças do engine + IDE se
> encaixam (o "porquê" e o "como se conecta", não a API detalhada). **Leia antes de
> mexer numa área; ATUALIZE ao mudar a arquitetura** (novo subsistema, mudança de
> fluxo, nova armadilha). Detalhes finos de decisão ficam nos ADRs (`docs/adrs/`) e
> TDRs (`docs/tdrs/`); a API pública em `engine-api.md` (curada) e `api/` (gerada).

## 1. Visão geral

Dois artefatos: o **engine** (biblioteca, roda no jogo) e o **IDE/studio**
(Electron, edita o jogo). O engine é **vendorizado** dentro de cada projeto
(ADR-0009): o projeto importa `cortex-game-engine` de `vendor/cortex-game-engine/`,
sem `npm install`.

```
 IDE (Electron)                     PROJETO DO JOGO (vendoriza o engine)
 ┌─────────────────┐  postMessage   ┌──────────────────────────────────────┐
 │ Painéis nativos │◀──ADR-0056────▶│  Game ── GameLoop ── World (ECS)      │
 │ (Hierarquia/    │   (ponte)      │   │                     │             │
 │  Inspector/Chat)│                │   │   buildScene(defs, overlay)       │
 │ electron/main   │  cria/vendor   │   │     · level.json (DADO da cena)   │
 │  (fs, IPC)      │───────────────▶│   │     · scene-data.json (overlay)   │
 └─────────────────┘                │   └── attachEditor (F2, só em dev)    │
                                     └──────────────────────────────────────┘
```

**Princípio central:** a **cena é DADO** (`level.json`), não código. O `buildScene`
é o **único ponto de instanciação**. O editor escreve um **overlay** que **vence**
o código/JSON. Lógica de jogo vive em `Systems`/`Components` (ECS).

## 2. Núcleo ECS (`src/ecs/`)

- **`Entity`** — id + um `Map<string, Component>`. A chave é `component.type` =
  **`constructor.name`** (string). `getComponent(Classe)` busca por `Classe.name`.
- **`Component`** — só dados. ⚠️ **NÃO crie um campo chamado `type`** — sombreia o
  getter `type` da base (a chave do ECS) e a entidade some das queries.
- **`System`** — `requiredComponents` (vazio = todas), `priority` (ordem crescente),
  `update(entities, dt)`. `pauseWhen = () => game.editorActive` pausa no editor.
- **`World`** — guarda entidades/sistemas; `tick(dt)` roda cada sistema com as
  entidades que casam `requiredComponents`. `query(...classes)`, `hasSystem`.

## 3. Cena data-driven (`src/scene/`)

- **`SceneDefinition`** (Zod) — o schema do `level.json`: nós `model`/`primitive`/
  `light`/`water`/`background`/`sprite`/`terrain`, cada um com campos (`transform`,
  `collider`, `player`, `character`, `rapierBody`, `material`, `matte`, …).
- **`buildScene(scene, defs, opts)`** — **único ponto de instanciação**. Instancia
  os nós (via `instantiate`), aplica `place`/`attach`, e — se há `world` — cria as
  **entidades ECS** (corpos de física, sprites animados, terreno). Marca cada nó
  com `obj.userData.cortexSceneNode = true` (o editor usa pra saber o que é
  autorável). Lê o **overlay** e aplica suas precedências.
- **Overlay** (`assets/scene-data.json`, um `SceneFileV1`) — as edições do editor:
  `objects[id]` (transform exato) + `data.*` por concern:
  `deleted`, `added`, `colliders`, `physics`, `matte`, `material`, `terrain`
  (heightmap), `terrainPaint` (pintura de textura/splat, ADR-0063), `animation`,
  `playerAnimations`. **Precedência: overlay > nó/código** (ADR-0058) —
  o `buildScene` lê `editorX[id] ?? node.X`. Ex.: `data.physics[id].type` é
  autoritativo (dá pra desligar/trocar física cravada no JSON).

## 4. Editor embutido (`src/editor/`, F2 — só no bundle de dev)

- **`attachEditor(game)`** — o **compositor**: cria câmera livre, gizmo, outliner,
  HUD, o **overlay** (semeado do arquivo — ⚠️ **substitui `overlay.data`**, ver §8),
  o `persist` (salva o overlay) e instancia as **autorias**.
- **Autorias** (`src/editor/authoring/`, ADR-0060) — cada concern numa factory
  `createXApi(ctx)` que mexe **só no seu pedaço** do overlay e aplica ao vivo:
  `MatteAuthoring`, `MaterialAuthoring`, `PhysicsAuthoring`, `ColliderAuthoring`
  (+ heightfield injetado), `TerrainAuthoring` (pincel com **modo**: esculpir altura
  ou **texturizar/pintar** — escolhe/importa textura, ADR-0063), `AnimationAuthoring`.
  - **`EditorAuthoringContext`** (`AuthoringContext.ts`) — o **OverlayStore**
    compartilhado: `ctx.record<T>(key)` devolve `overlay.data[key]` (lido
    **dinamicamente**), `ctx.persist()`, `ctx.game`, `ctx.three`.
- **`EditorModel.describeInspector(obj, ctx)`** — descreve o Inspector como **dado
  declarativo** (seções + campos + handlers), sem DOM. Fonte ÚNICA pros dois
  renderizadores: o painel in-canvas (`EditorInspector`/`EditorModelDom`) e os
  painéis nativos da IDE.
- **Ponte (ADR-0056, `EditorBridge`)** — quando roda dentro do iframe da IDE,
  publica o `describeInspector`/outliner por **postMessage**; os painéis nativos da
  IDE (`electron/renderer/EditorPanels.ts`) renderizam e mandam de volta `field`/
  `button`/`select` → a ponte chama o handler → re-descreve → republica.
  - Campo **`file`** (importar asset, ex. textura do terreno): o file picker abre
    **no frame do renderizador** (clique do usuário = user activation; abrir no
    iframe do engine via postMessage seria bloqueado) e o conteúdo viaja como JSON
    `{ name, dataUrl }`; o handler sobe pro projeto via `POST /__upload-asset`
    (plugin Vite, grava em `assets/textures/`).
  - Selects com **opções dinâmicas** (ex.: lista de texturas) entram na chave de
    estrutura dos renderizadores — senão a opção nova não aparece (o updater só
    troca o valor).

## 5. Física

Hoje **em transição** (TDR-0002): conviviam 4 "mundos" caseiros (core/Physics
RigidBody, 2.5D Collider2D+PlatformerBody, CharacterBody, Kinematic+Terrain). O
alvo é **Rapier** (WASM) como motor dinâmico único, estilo Unity.

- **Modelo em camadas (a regra):** física é **DADO da cena** — declarada nos campos
  do nó (`collider`/`player`/`character`/`rapierBody`), **visível e editável no
  Inspector** (que grava no overlay, autoritativo). **NUNCA** cravar
  `addComponent(new ...Body)` só no `main.ts` (some do Inspector). O editor **só
  deixa autorar NÓS** (`cortexSceneNode`) — objeto criado em código mostra aviso.
- **Rapier** (`src/physics/RapierPhysics.ts`) — wrapper headless do `@dimforge/
  rapier3d-compat`. `create()` é async (carrega o WASM **sob demanda**, ver §6).
  - **`RapierBodyComponent`** (dado: `bodyType` dynamic/fixed/kinematic + `shape`
    auto/box/ball/capsule + material). ⚠️ é `bodyType`, não `type` (ver §2).
  - **`RapierPhysicsSystem(physics)`** — passo fixo + **escreve o `Object3D`**
    (pos+quaternion). **O Rapier é DONO do transform** desses objetos: NÃO os ponha
    também no `Object3DSyncSystem`. Recebe o `RapierPhysics` já criado (síncrono no
    tick). `pauseWhen = () => game.editorActive`.
  - **buildScene** cria o corpo pra nós `rapierBody` (ou override `physics.type=rigid`)
    e registra o sistema sozinho (lazy). `physicsPaused` pausa no editor.
- **CharacterBody** (`CharacterBodyComponent`+`CharacterPhysicsSystem`) — controller
  cápsula (gravidade/pulo/step) com **chão por raycast** + piso `groundY` de
  fallback. Pro player/NPC simples até a migração pro CharacterController do Rapier.
  - ⚠️ **Autoridade única de chão pro Character = o raycast.** O `TerrainCollisionSystem`
    (que aterra pela altura **bilinear** `heightAt`) **não** trata Character — só
    `Platformer`/`Kinematic`. Os dois aterrando o mesmo corpo faziam ele **quicar** em
    rampas (raycast pousa no triângulo da malha, `heightAt` interpola → divergem). O
    raycast já mira o terreno (é filho da cena), então cobre o caso.
  - ⚠️ Pra **pausar no editor**, o `buildScene` precisa do `physicsPaused`
    (`() => game.editorActive || game.gameplayPaused`). **Sem ele a física do
    Character roda no F2** — o player cai/treme editando e o autosave do editor
    persiste em **loop**. O `setupFirstPerson`/template já passam isso.
  - **Câmera/controle FPS** (`FirstPersonCameraSystem` + helper `setupFirstPerson`,
    ADR-0064) — mouse-look (pointer lock) + WASD + pulo sobre o CharacterBody. É o
    **demo padrão de projeto novo** (`templates/new-project/`): terreno vazio + player
    cápsula em 1ª pessoa (alinha com o "engine 3D por padrão" do ADR-0062). O
    movimento/look é **wiring de gameplay no `main.ts`** (não dado da cena); só a
    física do player (nó `character`) e o terreno (nó `terrain`) são dado.

## 6. Build & vendoring

- **`yarn build:engine`** → 3 bundles em `dist-engine/`:
  - `index.js` (runtime) e `index.dev.js` (runtime + editor) — ESM, com `three`
    embutido. Entry: `src/index-runtime.ts` / `src/index-dev.ts`.
  - `rapier.js` — chunk **separado** do Rapier (WASM inline). O bundle base faz
    `import('./rapier.js')` **sob demanda** (rollup `external` + `output.paths`),
    então projetos **sem física pagam 0** (TDR-0002).
- **Vendoring** (`electron/main.ts` → `vendorEngine`): copia os 3 bundles + os
  `.d.ts` (lista `VENDOR_TYPE_MODULES`) + `index.d.ts` + o plugin de Vite pra
  `<projeto>/vendor/cortex-game-engine/`. Roda ao **criar** e ao **re-vendorizar**.
  No fluxo de dev deste repo, re-vendorizamos à mão pros projetos de teste
  (`D:/jogos/*`) após mudar o engine.
- **Doc da API** é **gerada** (`yarn docs:engine`, TypeDoc → `api/`). `engine-api.md`
  é curado e **injetado no system prompt do Chat IA** — mantenha-o ao mudar a API.

## 7. Fluxo de ponta a ponta (um nó vira jogo)

```
level.json (nó)  ──buildScene──▶  Object3D (mesh)  + Entidade ECS (componentes)
   + overlay (edições)                  │                    │
   (overlay vence)                      │            Systems (tick) movem/animam
                                        ▼                    │
                                  renderizado          quem escreve o transform?
                                                        · Rapier → escreve no Object3D
                                                        · resto → TransformComponent
                                                          + Object3DSyncSystem
```

## 8. Armadilhas conhecidas (já mordemos)

- **`overlay.data` é SUBSTITUÍDO no seed** do `attachEditor` (`overlay.data = f.data`,
  async). Por isso o `OverlayStore` lê `overlay.data` **dinamicamente** — capturar
  por referência fazia a autoria escrever num objeto órfão e o save perder tudo.
- **Campo `type` em Component** sombreia a chave do ECS (§2) — a entidade some das
  queries. Use outro nome (`bodyType`).
- **Autoria de física só em NÓS** — objeto criado em `main.ts` não persiste (o
  `buildScene` só reconcilia nós). O Inspector bloqueia com aviso.
- **Rapier é dono do transform** — não misturar com `Object3DSyncSystem` no mesmo
  objeto.
- **Persist tem debounce (500ms)**; trocas de física usam `persist(true)` (imediato)
  pra sobreviver a reload/Play logo em seguida.
- **Raycast de gameplay tem que ignorar o chrome do editor.** O gizmo
  (`TransformControls`) e helpers ficam **na mesma cena** (bundle de dev). O
  `editorInternal` fica na **raiz** do helper, mas o raycast acerta as **peças
  filhas** (XYZ/X/Y/Z/AXIS…) sem o flag — então o `CharacterPhysicsSystem` "aterrava
  no gizmo" e o player **subia** ao andar (com o gizmo seguindo o player selecionado).
  Quem faz raycast na cena (`[three]`) deve pular `editorInternal` subindo a cadeia de
  **ancestrais** (não só o objeto-folha) — ver `isEditorChrome` no
  `CharacterPhysicsSystem` e `isEditorInternal` no `ObjectEditSystem`.
- **`onBeforeCompile` NÃO roda no `WebGPURenderer`** (o renderer do engine é
  node-based, mesmo no fallback `forceWebGL`) — falha **silenciosa**: sem erro, o
  efeito só não aparece. Efeito custom de shader tem que ser **TSL/NodeMaterial**
  (`colorNode` etc.; ex.: splat do terreno, ADR-0063). Valide rendering no harness
  (`.design-proto/`) com `WebGPURenderer`, não com `WebGLRenderer` clássico.

## 9. Logging de debug (`src/core/debug.ts`)

**Sempre use `debug(escopo, ...)` no lugar de `console.log` cru.** Fica desligado por
padrão (silencioso em prod) e liga por **escopo** via flag de runtime:
`debug('physics', 'setType', name)` → `[cortex:physics] setType ...` só quando ligado.

- **Liga via `.env`** (só em `electron:dev`): `VITE_CORTEX_DEBUG=physics,persist` (ou
  `*`). A IDE (`Preview.ts`) injeta isso como `?cortexDebug=` no iframe do jogo; o
  engine lê o param. `.env.example` documenta. Também: `localStorage['cortex:debug']`
  no devtools, ou `setDebug('...')` no código.
- **Escopos atuais:** `physics` (autoria de física), `persist` (save do overlay),
  `scene` (buildScene). Crie novos à vontade — o escopo é só a 1ª string.

## 10. Mapa de arquivos

| Área | Onde |
|---|---|
| ECS | `src/ecs/` |
| Componentes / Sistemas | `src/components/` · `src/systems/` |
| Cena data-driven | `src/scene/` (`SceneDefinition`, `SceneBuilder`) |
| Editor (F2) + autorias | `src/editor/` · `src/editor/authoring/` |
| Física Rapier | `src/physics/` |
| IDE (Electron) | `electron/` (`main.ts`, `renderer/`) |
| Bundles gerados | `dist-engine/` · vendorizados em `<projeto>/vendor/` |
| Decisões | `docs/adrs/` · `docs/tdrs/` · `engine-api.md` |
