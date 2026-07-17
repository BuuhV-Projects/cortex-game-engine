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

### 2.1 Scripts anexáveis (MonoBehaviour — ADR-0085/0086)

Camada de **comportamento por objeto** em cima do ECS: `ScriptBehavior`
(`onStart/onUpdate(dt em s)/onDestroy` + `static fields` editáveis no Inspector) →
`ScriptComponent` (N slots por nó) → **`ScriptHostSystem`** instancia/roda (pausa no editor).
O jogo **auto-registra** a pasta `scripts/` no boot (ADR-0096):
`registerScripts(import.meta.glob('./scripts/*.ts', { eager: true }))` — o nome no
Inspector/cena é o **nome do arquivo** (estilo Unity; `static scriptName` sobrepõe,
`class.name` só em arquivo multi-script — minifica em prod!). `registerScript(nome,
classe)` manual continua valendo. Nó declara `scripts: [{ type, fields }]` no
`level.json`; overlay `data.scripts[id]` vence. ⚠️ O nome do script é DADO persistido —
renomear arquivo/scriptName exige atualizar as cenas que o usam.

**Quando usar System (ECS) vs Script** (regra de ouro — detalhe no ADR-0086):
- **System** = simulação/infra pra **muitas** entidades, reutilizável, sensível à ordem do
  frame/física, ou que roda no editor (física, câmera, render, character, **veículo**). É o
  "built-in" estilo Rigidbody/WheelCollider.
- **Script** = comportamento **de UM objeto**, específico do jogo, anexável/configurável no
  Inspector, roda só no Play (porta, NPC, invocar carro, soco). Era a cola do `main.ts`.
- **Híbrido** (carro): simulação = System (`setupVehicle`/`VehicleControlSystem`); orquestração
  = Script (`CarroController`). Não fragmentar em micro-scripts.

**Handoff script↔infra:** scripts não têm args de construtor → o boot expõe handles em
`object3d.userData` (ex.: `cortexCarRig`, `cortexControl`) e o script lê; infra→script via flag
no rig. Genéricos: `this.ctx` (world/input/gamepad/scene/camera), `this.object3d`, `world.query`.

⚠️ **Módulo público novo** (incl. um System/Component novo do engine): além de exportar no
`index-runtime.ts` + `docs:engine`, **registre em `VENDOR_TYPE_MODULES`** (`electron/main.ts`),
senão o **editor do Studio** não resolve o tipo (runtime funciona, IntelliSense não).

## 3. Cena data-driven (`src/scene/`)

- **`SceneDefinition`** (Zod) — o schema do `level.json`: nós `model`/`primitive`/
  `mesh`/`light`/`water`/`background`/`sprite`/`terrain`, cada um com campos
  (`transform`, `collider`, `player`, `character`, `rapierBody`, `material`,
  `matte`, …). O nó **`mesh`** é a malha de blockout editável (ProBuilder, ADR-0071):
  carrega uma **receita de forma** (`shape`) OU geometria explícita
  (`positions`/`faces`); ver §11.
- **`buildScene(scene, defs, opts)`** — **único ponto de instanciação**. Instancia
  os nós (via `instantiate`), aplica `place`, resolve os **`attach`** (encaixe por
  socket — ver abaixo) e — se há `world` — cria as **entidades ECS** (corpos de
  física, sprites animados, terreno). Marca cada nó com
  `obj.userData.cortexSceneNode = true` (o editor usa pra saber o que é
  autorável). Lê o **overlay** e aplica suas precedências.
- **Kit / sockets (`Kit.ts`, ADR-0053)** — `parseKit` valida o `kit.json`
  (role/tags/gameplayRole/size/collider/anchors por asset); com `opts.kit`, nós
  `model` podem declarar `attach { socket, to, toSocket }` e o `buildScene`
  resolve o transform **deterministicamente** (ordem de dependência; `connect`
  alinha as `dir` se encarando; `surface` pousa sem girar) via
  `resolveAttachTransform` (matemática pura, unit-testável). **Falha alto** em
  alvo/socket ausente ou ciclo. Precedências: override do editor
  (`objects[id]`) **vence o attach**; collider efetivo = overlay > nó > preset
  do `role` no kit.
- **Overlay** (um `SceneFileV1`; caminho em **`game.sceneDataUrl`**, default
  `assets/scene-data.json` — **um arquivo POR FASE** em jogos multi-fase, senão
  `added`/`deleted` vazam entre fases e o auto-save de uma sobrescreve a outra;
  o jogo define o caminho após escolher a fase e ANTES do `buildScene`,
  ADR-0094) — as edições do editor:
  `objects[id]` (transform exato) + `data.*` por concern:
  `deleted`, `added`, `colliders`, `physics`, `matte`, `material`, `terrain`
  (heightmap), `terrainPaint` (pintura de textura/splat, ADR-0063), `animation`,
  `playerAnimations`. **Precedência: overlay > nó/código** (ADR-0058) —
  o `buildScene` lê `editorX[id] ?? node.X`. Ex.: `data.physics[id].type` é
  autoritativo (dá pra desligar/trocar física cravada no JSON).

## 4. Editor embutido (`src/editor/`, F2 — só no bundle de dev)

- **`attachEditor(game)`** — o **compositor**: cria câmera livre, gizmo, outliner,
  HUD, o **overlay** (semeado de `game.sceneDataUrl` — ⚠️ **substitui
  `overlay.data`**, ver §8; re-semeia e retroca o writer quando o jogo muda o
  `sceneDataUrl`, ADR-0094), o `persist` (salva o overlay) e instancia as
  **autorias**.
- **Autorias** (`src/editor/authoring/`, ADR-0060) — cada concern numa factory
  `createXApi(ctx)` que mexe **só no seu pedaço** do overlay e aplica ao vivo:
  `MatteAuthoring`, `MaterialAuthoring`, `PhysicsAuthoring`, `ColliderAuthoring`
  (+ heightfield injetado), `TerrainAuthoring` (pincel com **modo**: esculpir altura
  ou **texturizar/pintar** — escolhe/importa textura, ADR-0063), `AnimationAuthoring`,
  `MeshAuthoring` (forma de blockout: params da receita + override de geometria; §11).
- **Blockout / ProBuilder** (ADR-0071) — paleta de formas (`EditorShapePanel`) cria
  nós `mesh`; o `MeshEditSystem` faz a **edição de elementos** (vértice/aresta/face +
  extrudar) com gizmo próprio. Ver §11.
  - **`EditorAuthoringContext`** (`AuthoringContext.ts`) — o **OverlayStore**
    compartilhado: `ctx.record<T>(key)` devolve `overlay.data[key]` (lido
    **dinamicamente**), `ctx.persist()`, `ctx.game`, `ctx.three`.
- **`EditorModel.describeInspector(obj, ctx)`** — descreve o Inspector como **dado
  declarativo** (seções + campos + handlers), sem DOM. Fonte ÚNICA pros dois
  renderizadores: o painel in-canvas (`EditorInspector`/`EditorModelDom`) e os
  painéis nativos da IDE.
- **Multi-seleção (ADR-0117)** — Ctrl/Cmd+click **alterna** o objeto no conjunto
  (viewport, outliner e hierarquia da IDE — a mensagem `select` da ponte leva
  `additive`). `EditorSelection.items` guarda o conjunto (último = **primário**,
  que continua em `current` — consumidores antigos seguem corretos). Gizmo no
  primário + `BoxHelper` nos demais; mover carrega o grupo (mesmo delta);
  `Delete` remove todos. No Inspector, **Sombra/Matte/Shader/Física (tipo)**
  aplicam a TODOS os selecionados válidos (loop pelas `*Api` por-nó — as
  autorias não mudaram); as demais seções editam só o primário. ⚠️ Ctrl+click no
  vazio NÃO desseleciona (proposital: errar o clique não descarta o conjunto).
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
- **Renomear objeto (ADR-0091, `RenameAuthoring`)** — seção "Objeto" do
  Inspector com campo de texto (kind `text`, novo nos dois renderizadores;
  commit no Enter/blur). **Só nós adicionados no editor** (id vive em
  `data.added` → sobrevive ao reload); nome validado (`[A-Za-z0-9_-]`, único) e
  o rename **migra todas as chaves do overlay** (`objects` + `NAME_KEYED_DATA`
  + `added`/`deleted`), com undo. Nó de código: nome vira nota. ⚠️ Nova chave
  de `data.*` por nome → atualizar `NAME_KEYED_DATA`.
- **Picker "Adicionar modelo (.glb)" (ADR-0093)** — modal com busca (reusa o
  `EditorTexturePicker`, que vive no frame do jogo → funciona no standalone e no
  Studio) listando todos os `.glb` do projeto; escolher adiciona pelo fluxo do
  painel Add (persiste/seleciona/CTRL+Z). Gatilhos: botão na paleta de Formas e
  menu Cena → "Adicionar modelo (.glb)…" (ponte `openModelPicker`).
- **Copiar/colar (ADR-0095, `clipboardNode.ts`)** — CTRL+C no modelo selecionado
  captura o def do nó (`userData.cortexNodeDef`, guardado pelo `makeNode`) + o
  transform ATUAL; CTRL+V cola pelo fluxo do drag-and-drop (`addSceneNode` +
  `data.added` + CTRL+Z), com offset 1m em X/Z e sem `player`/`character`
  (singletons). Autorias por nome do original são clonadas pro nome novo.
  Só `model` (.glb) na v1; scripts/física da cópia valem no próximo Play/reload.
- **Arrastar asset pra cena (ADR-0090, `assetDrop.ts`)** — o **posicionamento é
  sempre do engine**: raycast da câmera do editor pelo cursor → o modelo nasce
  **na geometria sob o mouse** (ignora chrome `editorInternal`; fallback plano
  y=0), persiste em `overlay.data.added`, seleciona, CTRL+Z. Duas rotas de
  captura: **standalone** = DnD nativo no canvas (MIME
  `application/x-cortex-asset`; `text/plain` absoluto só é aceito com segmento
  `assets/` — recorta a URL dali); **Studio** = ⚠️ o Electron NÃO entrega DnD
  através da fronteira do iframe (🚫 no cursor) — o `FileTree` anuncia o drag
  (`asset-drag`), o `Preview` arma um **overlay transparente sobre o palco** que
  captura o drop e a posição normalizada viaja pela ponte (`dropAsset`) até o
  mesmo fluxo de posicionamento.

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
  fallback, e **colisão de parede** (horizontal): depenetra a cápsula de geometria
  marcada `userData.cortexSolid` (posta pelo `buildScene` em nós **static**) por
  raycasts em ±X/±Z (`resolveWallPush`, puro/testável). É o que faz o **blockout
  estático virar parede de verdade** no FPS (ADR-0071). ⚠️ o `FirstPersonCameraSystem`
  posiciona a câmera a partir da posição **já depenetrada** (antes de aplicar o
  movimento do frame) — senão a câmera aparecia "dentro" da parede por 1 frame.
  ⚠️ Marcar **static** (Inspector → Física) cria um Collider2D (mundo 2.5D, que o
  Character ignora) **e** a flag `cortexSolid` (que o Character usa) — é a flag que
  bloqueia o player. Pro player/NPC simples até a migração pro CharacterController do Rapier.
  - ⚡ **Raycast acelerado por BVH** (`src/physics/raycastAccel.ts`, ADR-0108): os
    ~13 raycasts/frame testam a **geometria real** — O(triângulos). Num prop denso
    (ponte de corda ~2000 tris) isso derrubava o FPS **no export nativo (Hermes)**.
    `three-mesh-bvh` constrói uma árvore por geometria (>512 tris) no `collectScene` →
    O(log n). Patch global seguro (cai no raycast padrão sem árvore). **Não** use mesh
    detalhado como colisão achando que é de graça — agora é barato, mas frestas na
    malha (vãos entre tábuas) ainda deixam o raycast de chão passar (tunneling).
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
  - **Câmera/controle 3ª pessoa** (`ThirdPersonControlSystem` + `setupThirdPerson`,
    ADR-0074) — porta o Unity StarterAssets ThirdPerson: câmera orbital por mouse + WASD
    relativo à câmera + Shift corre + Espaço pula; o personagem vira pra direção do
    movimento e **anima** (idle/walk/run/jump/fall via `deriveLocomotion`/`SceneAnimator`).
    Player = nó `model` `.glb` rigado marcado `character`. ⚠️ a **arte** do StarterAssets é
    placeholder sob **Unity Companion License** (só vale junto com a Unity) — substituir
    por arte própria/CC0. GLB do personagem vai no template via Git LFS.

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
  é curado e alimenta o Chat IA como **ÍNDICE no system prompt** (título + faixa de
  linhas + símbolos por seção, gerado em runtime por `electron/agent/engineApiIndex.ts`);
  o agente lê a seção completa sob demanda via Read (ADR-0114). Mantenha o doc ao
  mudar a API — o índice deriva dele automaticamente, sem passo de build.

## 6b. Chat IA: validação geométrica + aprendizado por correções

- **`validateScene`** (`src/scene/validateScene.ts`, ADR-0112): validação estática
  (dados, sem GPU) — interpenetração, flutuação, tombado, vão impulável, attach.
  Tool `validate_scene` (electron): 0 erros é pré-requisito antes de playtest/critique.
- **Ciclo de aprendizado** (ADR-0113, `electron/agent/learning.ts` + tools
  `cortex-learn`): a IA entrega cena → `save_baseline` (snapshot do estado efetivo);
  dev corrige no editor (overlay por id) → `diff_corrections` mede só a intervenção
  humana (diff semântico por role × mudança); lição aprovada pelo dev grava no
  destino certo e o baseline avança SEMPRE (inclusive com veto).
- **Regras aprendidas viram DADO por projeto** (ADR-0115,
  `electron/agent/validationRules.ts`): lição geométrica → `save_rule` grava
  thresholds/severidade em `.cortex/validation-rules.json`, que o `validate_scene`
  carrega sozinho dali em diante (parâmetro explícito vence). A tool roda uma
  **checagem de regressão** antes de gravar: reconstrói o estado do baseline como
  overlay sintético (`baselineOverlay`) e só aceita regra que reprova o "antes" e
  melhora o "depois" — senão a lição é gosto pontual e vira texto no
  `.cortex/scene-learnings.md`. Ordem no ciclo: `save_rule` ANTES do
  `save_baseline` final (a checagem usa o baseline antigo como contraprova).
  Conhecimento aprendido (`validation-rules.json` + `scene-learnings.md`) é
  versionado; o resto de `.cortex/` é cache (gitignore do template).
- **Percepção rápida + playtest determinístico** (ADR-0116): `measure_glb`
  (server `cortex-assets`) mede bounding box de `.glb` específicos em **Node
  puro** (`electron/agent/assets/measureGlb.ts`, sem Blender; marca skinned =
  bbox de bind pose) — leitura pura, roda sem aprovação e no modo plan. O
  `playtest_game` aceita `wait_for` (expressão JS até truthy, com diagnóstico
  de recursos pendentes no timeout — em vez de inflar `waitMs` no chute) e
  `eval_js` (setup pós-boot: teleporte/câmera overview antes da foto).

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

- **`window.confirm`/`alert` quebram o foco do renderer no Electron** — os diálogos
  síncronos do Chromium fazem os inputs da página pararem de aceitar teclado até a
  janela perder e recuperar o foco (foi o "input do chat travado até CTRL+R" após
  limpar o histórico). No renderer da IDE use **sempre** a ponte IPC:
  `window.electronAPI.confirmDialog/infoDialog/errorDialog` (handlers `dialog:confirm`/
  `dialog:info`/`dialog:error` no `electron/main.ts`, via `dialog.showMessageBox`/
  `showErrorBox` nativos, que não têm o bug).
- **Electron não entrega drag-and-drop nativo pra DENTRO do iframe do Preview** —
  arrastar da IDE pro viewport mostra 🚫 e o `drop` nunca dispara no documento do
  jogo (em browser puro funciona). Qualquer feature de DnD IDE→viewport precisa
  capturar o drop **no documento da IDE** (overlay sobre o palco) e repassar pela
  ponte postMessage (ver ADR-0090).
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
- **Character visível afunda se o mesh tiver origem no centro.** O `CharacterBody`
  ancora os **pés** no chão. Modelos de personagem têm origem nos pés (ok), mas as
  **primitivas** (cilindro/box/esfera) têm origem no **centro** → sem compensar, o mesh
  afundava metade da altura. O `buildScene` calcula `footOffset` (origem→base) do bounds
  e o `CharacterPhysicsSystem` ancora `t.y − footOffset`. No FPS não aparecia (corpo
  escondido); apareceu no top-down (corpo visível). ⚠️ A **autoria ao vivo** (Inspector
  → Física → Character, `PhysicsAuthoring.addCharacterEntity`) calcula o **mesmo**
  `footOffset` — senão um Character criado pelo Inspector afundava no Play (`footOffset`
  0) enquanto o declarado no JSON não. **Nota de design:** Character é p/ quem **anda**
  (player/NPC com gravidade); NPC/prop **parado** deve ser `static`, não Character (o
  Character é dirigido pela física, então o gizmo "briga" com ele no editor).
- **Raycast de gameplay tem que ignorar o chrome do editor.** O gizmo
  (`TransformControls`) e helpers ficam **na mesma cena** (bundle de dev). O
  `editorInternal` fica na **raiz** do helper, mas o raycast acerta as **peças
  filhas** (XYZ/X/Y/Z/AXIS…) sem o flag — então o `CharacterPhysicsSystem` "aterrava
  no gizmo" e o player **subia** ao andar (com o gizmo seguindo o player selecionado).
  Quem faz raycast na cena (`[three]`) deve pular `editorInternal` subindo a cadeia de
  **ancestrais** (não só o objeto-folha) — ver `isEditorChrome` no
  `CharacterPhysicsSystem` e `isEditorInternal` no `ObjectEditSystem`.
- **O chrome do editor tem que SOBREVIVER à troca de fase.** Voltar ao menu e entrar
  noutra fase chama `game.reset()` → `World.clear()` + `Scene.disposeAll()`. Os
  **sistemas/entidades** do editor sobrevivem via `keepOnClear` (câmera livre, seleção,
  gizmos, o "alvo" invisível — marcados em `attachEditor`). Mas os **objetos visuais**
  deles vivem na **mesma cena** e seriam apagados pelo `disposeAll` — foi assim que o
  **gizmo de seleção (eixos) sumia** ao trocar de fase (o sistema vivia, mas seu
  `TransformControls` fora desanexado + disposto). Regra: `Scene.disposeAll` **preserva**
  (não remove nem dispõe) filhos marcados `userData.editorInternal` (gizmo de eixos,
  contornos de collider/character/vegetação, anel de pincel) **ou** `userData.cortexKeep`
  (helpers de luz/câmera e a câmera do jogo — que ficam na **hierarquia**, então NÃO são
  `editorInternal`). Ao adicionar um overlay visual novo do editor à cena, marque um dos
  dois — senão ele some na 2ª fase. Em produção não há editor (nada marcado) → dispõe tudo.
- **`onBeforeCompile` NÃO roda no `WebGPURenderer`** (o renderer do engine é
  node-based, mesmo no fallback `forceWebGL`) — falha **silenciosa**: sem erro, o
  efeito só não aparece. Efeito custom de shader tem que ser **TSL/NodeMaterial**
  (`colorNode` etc.; ex.: splat do terreno, ADR-0063). Valide rendering no harness
  (`.design-proto/`) com `WebGPURenderer`, não com `WebGLRenderer` clássico.

## 8b. Narrativa: diálogo + UI de runtime (`src/dialogue/`, `src/narrative/`) — ADR-0070

Primeiro pedaço de **UI de runtime** do engine e a base de jogos narrativos. Tudo
**desacoplado** do resto (sem ECS, sem Three): diálogo é **dado** (como animação,
ADR-0054), não comportamento — passa no teste do ADR-0055 (não há conflito de dono;
não escreve transform).

- **`DialogueGraph`** (Zod) — grafo de conversa: nós (`text`/`speaker`/`choices`/`next`)
  com efeitos `set` (flags) e `give` (pista). `parseDialogueGraph` valida + checa
  integridade referencial.
- **`DialogueRunner`** — percorre o grafo. **Lógica pura/testável**: `start`/`choose`/
  `advance`/`done`. Aplica `set` no `StoryState` e emite `give` via `onClue`.
- **`StoryState`** (`src/narrative/`) — store de flags, serializável. **Base do save
  narrativo.** O engine **não** tem sistema de investigação/caso — isso é do jogo
  (decisão registrada no ADR-009 do DDD-61); a ponte é só o callback `onClue` (id de
  pista, string). O engine não sabe o que é uma pista.
- **UI** (`DialogueUI` + `startDialogue`) — **DOM overlay** (espelha
  `createDomLoadingScreen`, §6/`LoadingScreen`), não quads no Three. `startDialogue`
  liga runner+UI+teclado e devolve um handle com `active` (use em `pauseWhen`). ⚠️ O
  gameplay (WASD/mouse-look) deve **pausar/ignorar** input enquanto `active`.

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
| Narrativa (diálogo/UI/flags) | `src/dialogue/` · `src/narrative/` (ADR-0070) |
| Blockout / ProBuilder | `src/probuilder/` (formas + `EditableMesh`) · editor: `MeshAuthoring`, `MeshEditSystem`, `EditorShapePanel` (ADR-0071) |
| Vegetação (instanciada) | `src/scene/Vegetation.ts` (InstancedMesh + placeholder) · editor: `VegetationAuthoring` (pincel de espalhar) · nó `vegetation` (ADR-0077) |
| Editor (F2) + autorias | `src/editor/` · `src/editor/authoring/` |
| Física Rapier | `src/physics/` |
| IDE (Electron) | `electron/` (`main.ts`, `renderer/`) |
| Bundles gerados | `dist-engine/` · vendorizados em `<projeto>/vendor/` |
| Decisões | `docs/adrs/` · `docs/tdrs/` · `engine-api.md` |

## 11. Blockout / ProBuilder — malha de nó editável (`src/probuilder/`, ADR-0071)

Ferramenta de **blockout** estilo ProBuilder da Unity: criar formas paramétricas e
editar a malha por vértice/aresta/face no editor F2. Encaixa no princípio central
(**cena = DADO**): a malha é conteúdo autoral, igual ao heightmap (ADR-0059).

- **Dado puro** (`src/probuilder/`, sem editor/ECS): `EditableMesh` =
  `{ positions: Vec3[], faces: number[][] }` (faces poligonais, quads). `shapes.ts`
  são funções puras `kind → EditableMesh` (cubo/plano/cilindro/esfera/cone +
  escada/rampa/arco/parede-com-vão), com **metadados de params** pro Inspector.
  `toBufferGeometry` triangula com **flat-shading** (look facetado) e guarda mapas de
  **picking** (`tri→face`, `render-vert→vértice lógico`) no `userData.cortexMesh`.
- **Nó `mesh`** (`SceneDefinition`): receita `shape` (regenerável) **ou** geometria
  explícita. O `buildScene` (`makeEditableMesh`) usa `DoubleSide` (sem fragilidade de
  winding). Tem `baseFields` → collider/rapierBody/material/matte de graça.
- **Precedência da geometria** (overlay vence): `overlay.data.geometry[id]`
  (edição de elementos) **>** receita `shape` **>** geometria explícita do nó. O
  `MeshAuthoring` edita params da receita (no nó em `data.added`) e grava o override.
- **Edição de elementos** (`MeshEditSystem`, prioridade 28): quando
  `editorState.meshEditMode !== 'object'`, assume o clique/gizmo (o `ObjectEditSystem`
  **cede**, igual ao pincel de terreno). Picking: face por raycast (mapa `tri→face`),
  vértice/aresta por **proximidade em NDC**. Move via **gizmo num proxy** no centróide
  (delta em espaço local → `translateVertices`), live sem persistir; persiste no
  `dragging-changed=false`. **Extrudar face** (`extrudeFace`) é a op-chave.
  Atalhos: `Tab` entra/sai, `1/2/3` vértice/aresta/face, `E` extruda.
- **Desenhar no chão** (`ShapeDrawSystem`, prioridade 26 — ProBuilder "New Shape"):
  arma via paleta/menu (toggle; `editorState.drawingShape`, os outros cedem o clique).
  **Modo persistente** — fica armado pra criar vários; **CTRL+arrasta** a base no
  terreno (snap em **grade de 0,25 m**), **solta**, **move o mouse** pra puxar a altura,
  **clica** pra confirmar → cria um nó `mesh` cubo **já `static`** (`collider.solid`,
  colide). Hover (anel no chão) mostra onde vai começar (verde = CTRL pronto). Dimensões
  em metros ao vivo no HUD. `boxFromDrag` (puro) calcula centro+dimensões. Esc/botão sai.
  - Nota: a paleta/menu/desenho criam o nó `mesh` e já chamam `physicsApi.setType(obj,
    'static')` (autoritativo: grava `data.physics`, o Inspector mostra **Estático**,
    aplica o collider ao vivo e marca `cortexSolid`). Pôr só `node.collider` **não**
    aparecia no Inspector (a seção Física lê `data.physics`).
  - **Delete** (`attachEditor` `deleteNode`): destrói as entidades de física vivas
    (collider/character/rapier — senão o gizmo do `ColliderGizmoSystem` fica **fantasma**
    na cena) + limpa as entradas de overlay por-objeto; nó **adicionado no editor** sai
    de `data.added` (some de vez), nó **base** (level.json) entra em `data.deleted`.
- **UI**: paleta `EditorShapePanel` (in-canvas) cria nós `mesh` + botão "Desenhar no
  chão"; barra flutuante `MeshEditToolbar` (Unity-like, **não** some no bridge) ao
  selecionar malha; pontes `addShape`/`drawShape` + menu "Cena" da IDE. No Inspector,
  seção **"Forma"**: params da receita, "Resetar forma" e botões de edição de elemento.
- ⚠️ A triangulação é **fan** (assume face **convexa**); as formas geradas são
  convexas por face. Boolean/bevel/inset/bridge, material por face, UV e export `.glb`
  ficam **fora de escopo** (abrir ADR quando for).
