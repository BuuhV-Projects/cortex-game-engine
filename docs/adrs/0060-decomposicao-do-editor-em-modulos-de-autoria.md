# 0060 - Decomposição do editor em módulos de autoria

**Data:** 2026-06-10
**Status:** aceito

## Contexto

`src/editor/attachEditor.ts` virou um **god-file de ~1222 linhas**. Ele concentra,
no mesmo escopo:

- bootstrap do editor (câmera, gizmo, outliner, HUD, helpers de luz, snapshot/restore);
- a **overlay de persistência** (`overlay.data.*` + `persist`);
- **8 concerns de autoria**, cada um com seu acessor `xMap()` ao overlay + sua `*Api`:
  collider (+ heightfield interativo), física (tipo de corpo/Character), fosco (matte),
  material/shader, terreno (pincel), animação, ações do player;
- a ponte postMessage (ADR-0056) e o painel "Add".

Isso dificulta achar/testar cada parte, e a autoria de física vai crescer muito
(Rapier — ver TDR-0002). Também queremos um **ponto único de autoria** que o
Inspector, o Chat IA e scripts compartilhem (física = dado da cena, visível e
sobrescrevível pela overlay — ver a regra em CLAUDE.md e ADR-0058).

## Decisão

Quebrar o editor em **módulos de autoria pequenos e focados**, cada um numa classe/
factory própria, ligados por um **contexto compartilhado**. O `attachEditor` deixa
de implementar as autorias e passa a ser só o **compositor** que instancia o
contexto e as autorias e as conecta ao Inspector/ponte.

### Contrato compartilhado

```ts
// src/editor/authoring/AuthoringContext.ts
interface EditorAuthoringContext {
  game: Game;            // world, scene, input
  three: Scene;          // raiz da cena (raycast/colisão)
  overlay: SceneFileV1;  // arquivo de overlay (data.*, objects)
  persist(immediate?: boolean): void;
  // OverlayStore: acessor tipado a um sub-objeto de `data` (cria se faltar)
  record<T>(key: string): Record<string, T>;
}
```

Cada autoria é uma factory `createXAuthoring(ctx): XApi` que:
1. lê/escreve **somente** seu `ctx.record('<chave>')` no overlay (precedência:
   overlay > código/JSON; ver ADR-0058);
2. aplica a edição **ao vivo** no `World`/cena;
3. expõe a `XApi` que o `EditorModel`/Inspector já consome.

### Módulos (slices incrementais, comportamento preservado, testes verdes)

`src/editor/authoring/`:
- `AuthoringContext.ts` — contexto + OverlayStore (fundação).
- `MatteAuthoring.ts`, `MaterialAuthoring.ts` — puros (slice 1, prova do padrão).
- `PhysicsAuthoring.ts` — tipo de corpo/Character (usa colliders + sistemas).
- `ColliderAuthoring.ts` — collider 2D + heightfield interativo.
- `TerrainAuthoring.ts` — pincel de esculpir.
- `AnimationAuthoring.ts`, `PlayerAnimAuthoring.ts`.

O bootstrap (câmera/gizmo/outliner/helpers/snapshot) pode sair depois pra um
`EditorBootstrap`; a ponte/painel "Add" já são módulos.

### Sequência

**Editor primeiro** (esta leva), **física com Rapier depois** (TDR-0002). A
decomposição é pré-requisito: deixa a autoria de física isolada num módulo onde o
Rapier encaixa sem reescrever o god-file.

## Consequências

- **+** Cada autoria fica testável/legível isolada; o `attachEditor` encolhe pra um
  compositor. O padrão (overlay-store + factory) serve Chat IA, Inspector e script.
- **+** A física (Rapier) entra num módulo dedicado, sem tocar no resto do editor.
- **−** Refactor amplo de um arquivo sensível — feito em **slices incrementais**,
  cada um preservando comportamento e mantendo a suíte verde (sem big-bang).
- Sem mudança de comportamento pro usuário nesta leva (é estrutural).
