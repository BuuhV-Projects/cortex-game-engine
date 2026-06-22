# 0071 - ProBuilder: blockout com malha editável (nó `mesh`)

**Data:** 2026-06-22
**Status:** aceito — em implementação (`src/probuilder/`, nó `mesh` no `SceneDefinition`,
edição no `src/editor/`)

## Contexto

Blockout (rascunhar o layout/volumes de um nível antes da arte final) hoje só dá pra
fazer com as **primitivas fixas** (`primitive`: box/cylinder/plane/sphere com tamanho).
Não dá pra fazer escada, rampa, arco, parede com vão de porta — nem ajustar uma face/
vértice. Na Unity isso é o **ProBuilder**: cria formas paramétricas e edita a malha por
vértice/aresta/face dentro do editor. Falta o equivalente aqui.

**Encaixe na arquitetura (o teste do ADR-0044/0058):** uma malha de blockout é
**conteúdo autoral** — geometria é DADO da cena, como o heightmap do terreno (ADR-0059)
ou o diálogo (ADR-0070). Não compete com os Systems pela autoria do transform (ADR-0055):
o `mesh` é só um `Object3D` estático na cena, igual a `primitive`/`model`. Então adota o
mesmo modelo: **nó na cena + override no overlay (overlay vence)**, editado pelo editor F2
e pelo Inspector, persistido em JSON.

## Decisão

### 1. Novo nó de cena `mesh` (malha poligonal editável)
Um nó que carrega **uma receita de forma paramétrica** OU **geometria explícita**:

```ts
meshNode = {
  type: 'mesh',
  id: string,
  // (a) receita: gera a geometria no build, regenerável (params editáveis no Inspector)
  shape?: { kind: ShapeKind, params: Record<string, number> },
  // (b) geometria explícita (malha "freeform" após edição de elementos)
  positions?: Vec3[],          // vértices lógicos (topologia compartilhada)
  faces?: number[][],          // faces poligonais (quads/ngons), índices em `positions`
  color?, roughness?, metalness?,
  ...baseFields               // transform, place, collider, material, matte, rapierBody…
}
```

`baseFields` inteiro vem de graça → **collider/rapierBody/material/matte funcionam no
Inspector sem código novo** (blockout vira chão/parede sólida marcando física, como
qualquer nó). Um nó tem `shape` **ou** `positions`/`faces`; a receita é a fonte enquanto
não houver geometria explícita.

### 2. Biblioteca de formas (`src/probuilder/shapes.ts`, pura)
Funções puras `ShapeKind → { positions, faces }`, faces em **quads** quando possível (pra
edição/extrusão limpas):
- **Básicas:** `cube`, `plane`, `cylinder`, `sphere`, `cone`.
- **Arquitetura:** `stairs` (degraus), `ramp`, `arch` (vão em arco), `wallOpening`
  (parede com furo retangular — porta/janela).

São dados puros (sem Three) → testáveis em Vitest isolado (topologia válida: índices em
faixa, faces fechadas).

### 3. Render: `toBufferGeometry` (`src/probuilder/EditableMesh.ts`)
Converte `{ positions, faces }` numa `BufferGeometry` triangulada com **flat-shading**
(fan-triangula cada face; normais por face → facetado, o look certo de blockout). Guarda
no `userData` os **mapas de picking** (`tri → face`, `render-vert → vértice lógico`) pra
a edição de elementos resolver clique→face/vértice sem reparsear.

### 4. Geometria editada = override no overlay (overlay vence)
A edição de **elementos** (vértice/aresta/face) **não muta a receita**: grava a geometria
"baked" `{ positions, faces }` em **`overlay.data.geometry[id]`** (novo slot opaco do
`SceneFileV1.data` — não muda o schema). Precedência no `buildScene`:

```
overlay.data.geometry[id]  >  receita (shape)  >  geometria explícita do nó
```

"Resetar forma" = apagar o override (volta à receita). Edição de **params da forma**
(Fase 1) muta a receita no nó adicionado (`data.added`); para nós declarados no
`level.json`, edição de params fica fora de escopo na v1 (edita-se o JSON) — edição de
**elementos** funciona pros dois (sempre via override de geometria).

### 5. Autoria no editor F2 (duas fases)
- **Fase 1 — blockout paramétrico:** paleta de formas (`EditorShapePanel`, espelha
  `EditorAddPanel`) cria um nó `mesh` em `data.added`; transform pelo gizmo existente;
  Inspector ganha seção **"Forma"** (params → regenera; "Resetar forma").
- **Fase 2 — edição por elemento:** `EditorState.meshEditMode` (`object`/`vertex`/`edge`/
  `face`); overlay visual (Points/LineSegments como `editorInternal`); seleção por
  raycast; **gizmo num proxy** no centróide aplica delta aos vértices lógicos;
  **extrudar face** (op-chave de blockout). Persiste em `data.geometry[id]`.

### 6. Autoridade (sem repetir o erro do 0055)
O `mesh` é geometria estática: ninguém além do editor escreve seus vértices. Física
(collider/rapier) segue o modelo de dado existente (ADR-0047/0061) — declarada nos campos
do nó, autoritativa no overlay, dona do transform conforme o ADR-0058. Zero conflito.

## Consequências

- **Blockout de verdade no engine** — formas de arquitetura + edição por face/vértice,
  estilo ProBuilder, tudo data-driven e versionável (JSON), sem ferramenta externa.
- **`src/probuilder/` novo** (formas + EditableMesh) — puro, testável, reusável (a IA do
  Chat pode gerar nós `mesh` no futuro, como já gera cena).
- **Slot `data.geometry`** no overlay (opaco, sem migração de schema) — segue o padrão de
  `colliders`/`physics`/`terrain`.
- **Triangulação assume faces convexas** (fan) — ngons côncavos podem triangular errado;
  as formas geradas são convexas por face. Boolean/CSG, bevel/inset/bridge, material por
  face, UVs e export `.glb` ficam **fora de escopo** (abrir ADR quando for).
- **API pública nova** (nó `mesh`, tipos, `src/probuilder/`) → `yarn docs:engine`,
  atualizar `engine-api.md` e `architecture.md`, e **re-vendorizar** (ADR-0009) nos
  projetos de teste.
