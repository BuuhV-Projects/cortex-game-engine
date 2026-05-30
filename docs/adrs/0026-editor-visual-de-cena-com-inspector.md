# 0026 - Editor visual de cena com inspector

**Data:** 2026-05-30
**Status:** aceito · Fase 1 implementada · Fases 2-3 priorização aberta

## Contexto

Hoje o IDE oferece **preview ao vivo** (botão Play) mas não tem
edição visual. Pra ajustar posição/escala de um objeto, cor de um
material ou um parâmetro de física, o dev precisa:

1. Editar o código TypeScript no Monaco.
2. Salvar.
3. Esperar o hot reload do Vite.
4. Clicar Play (ou recarregar o preview).
5. Inspecionar visualmente o resultado.
6. Voltar pro código e ajustar.

Esse ciclo é lento pra trabalho de "tuning" — posicionar inimigos
num mapa, calibrar massa de um RigidBody, encontrar a cor certa de
uma luz. Em engines maduras (Unity, Unreal, Godot) o dev clica num
objeto da cena, vê suas propriedades num inspector lateral e edita
in-place com feedback instantâneo. Foi isso que o usuário sentiu
falta.

Restrições:

- Cenas hoje são **código TypeScript**, não dados versionáveis.
  Cada `scenes/MainScene.ts` faz `world.createEntity().addComponent(...)`
  imperativamente. Não há `scene.json` que represente a cena fora do
  código.
- Components hoje são **classes puras** com campos públicos. Sem
  metadata declarando "este campo é editável, range 0..100".
- O preview roda o jogo dentro de um `<iframe>` apontando pro dev
  server do Vite do projeto. Editor visual precisaria operar **na
  mesma cena**, mas com câmera/controle de editor — não trivial.

## Decisão

Implementar editor visual em **3 fases incrementais**, cada uma
entregando valor isoladamente. Implementação fica deferida até
priorização explícita.

### Fase 1 — Inspector + Transform editor (Modo Editar/Play)

**Escopo:** botão **Editar / Play** no header do Preview. Em modo
Editar:

- **Câmera órbita** via `OrbitControls` do Three (já disponível em
  `three/examples/jsm/controls/`). Substitui a câmera do jogo
  enquanto edita.
- **Picking** via `Raycaster` no clique do canvas — resolve qual
  `Entity` do `World` foi clicada (consulta os `Mesh` em
  `TransformComponent` ou similar).
- **Gizmos de manipulação** via `TransformControls` do Three
  (translate, rotate, scale).
- **Sidebar do inspector** mostra:
  - Header com nome/UUID da entity.
  - Bloco "Transform" sempre presente — inputs numéricos pra
    `position`, `rotation`, `scale`.
  - Lista de Components anexados (read-only nessa fase — só nome
    da classe).
- **Botão "Copiar como código"** gera snippet TS com o estado
  atual de transform pra colar no `scenes/*.ts`:

  ```ts
  transform.position.set(3.5, 0.0, -2.1)
  transform.rotation.set(0, 1.5708, 0)
  transform.scale.setScalar(1.2)
  ```

**Não-objetivos:** persistir automaticamente, editar Components,
adicionar/remover entities.

**Estimativa:** 1-2 dias. Sem mudanças no engine — toda a lógica
vive no IDE (Electron renderer + injetar gizmos no preview via
postMessage ou IPC).

**Resolve:** ~60% da dor. Posicionar e dimensionar objetos sem
ciclo de Play.

#### Implementação final (Fase 1)

A escolha foi colocar o editor **dentro do bundle do jogo**
(classe `SceneEditor` em `src/core/`) em vez de injetar tudo do
lado do IDE. Razões:

- Editor acessa direto a `Scene`/`Camera` Three.js — sem
  serialização cross-iframe.
- `OrbitControls`, `TransformControls` e `Raycaster` são utilitários
  Three; faz sentido viverem perto do `Renderer`.
- IDE ↔ jogo: ponte por `postMessage` simples
  (`cortex:editor:enable` / `cortex:editor:disable` /
  `cortex:editor:toggle`). Sem schema acoplado.

Componentes entregues:

- `src/core/SceneEditor.ts` — classe principal. Hotkeys padrão
  W/E/R/Esc (Blender-like), inspector overlay top-right com
  Position/Rotation/Scale editáveis em tempo real, botão "Copy as
  code" que copia snippet TS pra clipboard.
- `src/core/Renderer.ts` — re-exporta `Camera` e `OrthographicCamera`
  além do `PerspectiveCamera` já existente, pra tipar variáveis
  que oscilam entre câmera do jogo e do editor.
- `src/index-runtime.ts` — re-exporta `SceneEditor`.
- `templates/new-project/main.ts` — instancia `SceneEditor` no
  bootstrap e amarra F8 pra toggle. Loop usa câmera ativa (jogo
  ou editor) via callback `onCameraChange`. Gameplay (rotação do
  cubo, etc) só roda quando `!editor.isEnabled()`.
- `electron/renderer/Preview.ts` — botão **✎ Edit** no header
  (habilitado quando jogo está rodando). Clique dispara
  `iframe.contentWindow.postMessage({type:'cortex:editor:enable|disable'})`.
  Estado visual indica modo ativo.

Limitações conhecidas (esperadas pra Fase 1):

- Inspector mostra só Transform + tipo de geometry/material. Lista
  de Components ECS depende do `World` ser passado pro SceneEditor;
  primeiro corte só cobre `Object3D.userData` se o usuário plugar.
- "Copy as code" não sabe a variável real do código do usuário —
  usa `mesh.name` como placeholder. Suficiente pra "copio o
  snippet e ajusto a referência".
- Mudanças não persistem automaticamente. Tem que colar no código.
- Câmera de editor não preserva estado entre toggles (volta pra
  posição inicial `(5,5,5)` ao reativar).

### Fase 2 — Edição de Components custom

**Escopo:** evoluir o inspector pra renderizar **inputs editáveis
por Component**, descobertos via schema.

- **Sistema de schema** nos Components via decorator `@editable`:

  ```ts
  export class RigidBodyComponent extends Component {
    @editable({ label: 'Mass (kg)', min: 0, max: 1000, step: 0.1 })
    mass = 1.0

    @editable({ label: 'Friction', min: 0, max: 1, step: 0.01 })
    friction = 0.5

    @editable({ type: 'enum', options: ['dynamic', 'static', 'kinematic'] })
    bodyType: 'dynamic' | 'static' | 'kinematic' = 'dynamic'
  }
  ```

- **Inspector renderiza inputs por tipo** — number (slider+input),
  string (text), boolean (checkbox), enum (select), Vector3 (3
  inputs), Color (color picker).
- **Edição reflete em runtime** — set no campo do Component e o
  Sistema relevante (`PhysicsSystem`, `RenderSystem`) pega na
  próxima iteração.
- **"Copiar como código"** evolui pra gerar o construtor do
  Component com os valores atuais.

**Não-objetivos ainda:** adicionar/remover Components, persistir
em arquivo, hot reload bidirecional.

**Estimativa:** 3-5 dias. Pequena mudança no engine (decorator
opcional na classe `Component` + helper `getEditableFields`).

**Resolve:** mais ~30% da dor. Calibrar parâmetros de física,
cores, comportamento — tudo sem reload.

### Fase 3 — Cena como dado (`.scene.json`)

**Escopo:** desacoplar cena do código TS. Editor edita um arquivo
JSON; código TS só carrega/registra Sistemas.

- **`Scene.serialize() / Scene.deserialize()`** no engine. Cada
  Entity vira `{ id, components: [{ type, data }, ...] }`.
- **Loader** `await world.loadScene('scenes/main.scene.json')`.
- **Editor** salva direto no JSON ao editar, com diff visível no
  Monaco (também versionado no git, então merges são possíveis).
- **Hot reload bidirecional** — editar JSON no Monaco re-carrega
  a cena visual; editar no inspector salva no JSON.
- **Add/remove entities** pela UI do editor + drag-and-drop de
  prefabs.

**Não-objetivos:** match Unity feature-by-feature. Sem terrain
editor, sem nav mesh editor, sem timeline. Foco em "cena estática
3D com Components".

**Estimativa:** semanas. Mudança grande no engine: novo modelo de
cena como dado, sistema de registro de Components por nome, prefabs.

**Resolve:** os 10% finais — workflow Unity-like completo, sem
mais "copiar como código".

## Consequências

### Positivo

- Cada fase entrega valor sozinha — dá pra parar em qualquer ponto.
- Fase 1 não toca no engine — só no IDE. Risco baixo, valor alto.
- Fase 2 adiciona um decorator opcional — Components que não usam
  `@editable` continuam funcionando.
- Fase 3 abre caminho pra features futuras (prefabs, asset browser,
  cenas múltiplas, scene streaming).

### Negativo

- Cada fase aumenta a superfície do IDE pra manter (mais código,
  mais testes, mais regressões possíveis).
- Fase 2 introduz reflexão/metadata em runtime — caminho típico de
  engines AAA mas exige disciplina pra manter os decorators em
  sync com as classes.
- Fase 3 quebra retrocompatibilidade de cenas — projetos antigos
  que escrevem cena 100% em código vão precisar migrar ou
  conviver com os dois modelos.
- Aumenta a expectativa do usuário "agora a engine é tipo Unity" —
  e ela continua sendo motor pra jogos 3D indie/jam, não AAA.

### Riscos a monitorar

- **Performance** do picking 3D em cenas com 1000+ instâncias —
  Raycaster ingênuo é O(n). Mitigação: usar `BVH` ou octree.
- **Conflito de hot reload** Vite × editor (Fase 3) — editor salva
  JSON, Vite recarrega, editor perde estado. Mitigação: editor
  detecta mudança externa e reaplica seleção.
- **Schema decorator + tree-shaking** — decorators podem confundir
  bundlers em release builds. Mitigação: usar `Reflect.metadata`
  via `@types/reflect-metadata` ou implementação custom mais simples.

## Próximos passos

1. **Não implementar agora** — usuário priorizou outras tarefas.
2. Quando priorizado, começar pela **Fase 1**. Validar UX antes de
   investir em Fase 2.
3. Se Fase 1 resolver "bem o suficiente", talvez Fase 2 e 3 não
   sejam necessárias — economia de semanas de trabalho.

## Referências

- ADR-0002 — Arquitetura ECS (define o modelo de Entity/Component
  que o inspector vai navegar).
- ADR-0010 — Painel Preview (componente que vai ganhar o modo
  Editar/Play na Fase 1).
- ADR-0023 — Engine expõe split-screen e gamepad (caminho similar:
  capacidade no engine usada pelo IDE).
- Three.js `TransformControls` e `OrbitControls` — primitivas
  prontas pra Fase 1.
