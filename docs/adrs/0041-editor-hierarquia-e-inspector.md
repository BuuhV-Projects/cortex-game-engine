# 0041 - Editor: hierarquia (outliner) + inspector com seleção observável

**Data:** 2026-06-05
**Status:** aceito

## Contexto

O modo editor embutido (ADR-0030/0038) tinha câmera de voo livre + gizmo
(`ObjectEditSystem`), mas a seleção era **privada** (`this.selected`), só nascia
de clique no 3D e se comunicava por `showToast` + callbacks soltos. O usuário
pediu duas UIs: um **painel de hierarquia** (clicar num objeto → seleciona e
enquadra) e um **inspector** de propriedades (editar transform, ligar/desligar
sombra, intensidade de luz). Para isso, a seleção precisava ser **observável** e
**dirigível de fora** (a UI pede; o sistema continua dono do gizmo).

## Decisão

UI no engine (`src/editor`), opt-in como o `EditorHud`.

1. **`EditorSelection`** (`createEditorSelection`): ponte observável compartilhada
   (estilo `EditorState`). Painel → sistema via `requestSelect(obj)`; sistema →
   painéis via `setCurrent(obj)`/`onChange` e `emitTransform()`/`onTransform`.
   Único dono que escreve é o `ObjectEditSystem`, evitando loop de eventos.

2. **`ObjectEditSystem` refatorado**: extraído um `select(obj | null)` **público**
   (attach/detach do gizmo); recebe um `EditorSelection` **opcional** (aditivo —
   crazy-racing/zumbi-war seguem compilando). Espelha a seleção, atende
   `requestSelect` e emite `onTransform` no drag do gizmo. O helper do gizmo é
   marcado `userData.editorInternal` pra a hierarquia não listá-lo.

3. **`EditorOutliner`** (`createEditorOutliner`): painel DOM (esquerda) que lista
   os filhos diretos dos `editRoots` (exceto internos). Clique → `requestSelect`
   + `onFocus` (ligado ao `EditorCameraSystem.focusOn`). Destaca o selecionado via
   `onChange`. Tem `refresh()` (não há evento de scene-change — reconstrói on-demand).

4. **`EditorInspector`** (`createEditorInspector`): painel DOM (direita) que edita
   o selecionado — posição/rotação(°)/escala, sombra cast/receive (via
   `setShadows`) e, se for `Light`, intensidade/cor/intensidade da sombra. Reage a
   `onChange` (reconstrói) e `onTransform` (atualiza valores durante o gizmo).

5. **Template + doc**: `main.ts` cria o `EditorSelection`, passa ao
   `ObjectEditSystem` e instancia outliner/inspector, sincronizando a visibilidade
   na virada do `editorState.active` (e `refresh()` ao abrir). `engine-api.md` +
   doc da API regenerada (`yarn docs:engine`).

## Consequências

- O editor agora tem UI de autoria (hierarquia + inspector) sem dependência
  externa — DOM puro, opt-in. Mais superfície de UI pra manter.
- A seleção virou observável: outros recursos (gizmo de luz, atalhos, undo)
  podem se pendurar no `EditorSelection` depois.
- **Não reativo a scene-change**: a hierarquia reconstrói via `refresh()`
  (ao abrir o editor), não em tempo real. Reativo de verdade é passo futuro.
- Editar transform pelo inspector enquanto o gizmo está anexado: o helper do
  `TransformControls` acompanha o objeto no render seguinte (pode ter 1 frame de
  lag). Inputs em foco não são sobrescritos pelo `onTransform`.
- Fora do escopo (etapas futuras): drag-and-drop/reparent, multi-seleção,
  undo/redo, renomear, listar descendentes aninhados.
- Relaciona-se com ADR-0030/0038 (editor) e usa `setShadows` do ADR-0040.
