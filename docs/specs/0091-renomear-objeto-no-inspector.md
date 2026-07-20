# SPEC-0091 - Renomear objeto no Inspector (só nós adicionados no editor)

**Data:** 2026-07-03
**Status:** aceito

## Contexto

O nome do `Object3D` é o identificador estável de um nó (o `buildScene` nomeia
pelo `id`), e virou mais importante com `entityByObjectName` (scripts acham UM
objeto pelo nome) e com o drag-and-drop (SPEC-0090), que gera ids automáticos
(`add-mr3pobnk`) sem significado. O usuário precisa renomear ("boss-1") — mas o
Inspector não tinha campo de texto, e o overlay do editor é TODO chaveado por
nome (`objects`, `data.physics`, `data.colliders`, `data.scripts`,
`data.material`, …): trocar `obj.name` sem migrar as chaves órfãva as edições.

## Decisão

- **`RenameAuthoring`** (`src/editor/authoring/`, padrão ADR-0060):
  - **Validação**: nome alfanumérico, hífen e underline (`/^[A-Za-z0-9_-]+$/`),
    sem espaço.
  - **Unicidade**: rejeita se já existe objeto com o nome na cena.
  - **`migrateOverlayName`** (pura, testada): move `objects[nome]`, todos os
    records por nome de `data.*` (lista `NAME_KEYED_DATA` — manter em sincronia
    com os leitores `overlay*` do SceneBuilder), o `id` do nó em `data.added` e
    ocorrências em `data.deleted`.
  - **Undo**: o `attachEditor` registra o comando no CommandStack (SPEC-0084) via
    hook `onRenamed`; desfazer usa `applyRename` (sem validação/re-push).
- **Escopo: só objetos ADICIONADOS no editor** (`data.added`). O id deles vive no
  próprio overlay, então o rename sobrevive ao reload. Um nó declarado no código
  renasceria com o id antigo no próximo boot e as chaves migradas ficariam
  órfãs — pra esses o Inspector mostra o nome como nota ("declarado no código").
- **Campo `text` novo** no modelo do Inspector (`EditorModel`) e nos DOIS
  renderizadores (in-canvas `EditorModelDom` e IDE `EditorPanels`): commit no
  **Enter/blur** (não por tecla — renomear por keystroke migraria o overlay no
  meio da digitação), `stopPropagation` no keydown pra atalhos do editor não
  roubarem a digitação.

## Consequências

- Fluxo completo: dropar `.glb` → renomear pra `boss-1` no Inspector → script
  acha com `entityByObjectName(world, 'boss-1')`. Ids gerados já seguem a regra
  de nome.
- Renomear nó de código continua sendo mudança de código (o Inspector explica).
  Se um dia for necessário, exigiria um mapa `data.renamed` aplicado no
  `buildScene` (reconciliação) — fora do escopo.
- Nova chave em `data.*` chaveada por nome exige atualizar `NAME_KEYED_DATA`.
