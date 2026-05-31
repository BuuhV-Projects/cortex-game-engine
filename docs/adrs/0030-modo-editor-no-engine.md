# 0030 - Modo editor embutido no engine (câmera livre + gizmo + HUD)

**Data:** 2026-05-31
**Status:** aceito

## Contexto

Fase 4 da migração do corrida-teste (ver ADR-0028/0029). O jogo tinha um modo
editor (F2): câmera de voo livre, teleporte/save do spawn, e um gizmo
(`TransformControls`) pra mover/rotacionar/escalar objetos da cena, com um HUD DOM.
É ferramenta de autoria reutilizável — alinhada ao diferencial do projeto (editor
embutido).

## Decisão

Adicionados em `src/editor/`, re-exportados em `src/index-runtime.ts`:

- **`EditorState`** + `createEditorState()` — estado mutável compartilhado
  (`active`, `gizmoDragging`). Os sistemas de jogo/física pausam via
  `pauseWhen: () => editorState.active`.
- **`EditorHud`** + `createEditorHud(parent)` — HUD DOM opcional (barra de
  instruções + coords + toast). Jogos podem injetar a própria implementação da
  interface `EditorHud`.
- **`EditorCameraSystem`** — câmera de voo livre (WASD/QE/Shift/botão-direito),
  toggle F2, `focusOn(obj)` estilo Blender, teleporte (T) + save/clear spawn
  (P/C) via callbacks `onSaveSpawn`/`onClearSpawn`. Generalizado: opera sobre a
  entidade com `EditableTargetComponent` (não mais `PlayerControlComponent`/
  `VehicleComponent`); zera `KinematicBodyComponent` ao entrar/teleportar.
- **`ObjectEditSystem`** — gizmo `TransformControls` (r170+ via `getHelper()`),
  seleção por raycast nos `editRoots`, modos translate/rotate/scale, persistência
  por `Object3D.name` via callbacks. Exporta o tipo `ObjectEdit`.

`VENDOR_TYPE_MODULES` (electron/main.ts) estendido com `editor`.

## Consequências

- **Browser-only e não unit-testado**: dependem de DOM, ponteiro, `TransformControls`
  e canvas — fora do alcance do vitest. Validação foi por `yarn build:engine` +
  `vite build` do corrida-teste (verde). Verificação funcional exige rodar o jogo
  (F2, voar, selecionar, arrastar gizmo) — pendente de teste manual.
- `EditorCameraSystem`/`ObjectEditSystem` mantiveram a assinatura posicional do
  original (parâmetros longos) pra paridade de comportamento; um facade `Editor`
  mais enxuto pode vir depois sem quebrar isto.
- O tipo `ObjectEdit` (px/py/pz/rx/ry/rz/sx/sy/sz) vive aqui por ora; a Fase 5
  (cena em JSON / `SceneFileV1`) deve reconciliá-lo com o schema de cena.
- corrida-teste migrado: usa `createEditorState`/`createEditorHud`/
  `EditorCameraSystem`/`ObjectEditSystem` do engine; car ganhou
  `EditableTargetComponent`; `VehicleSuspensionSystem`/`VehicleInputSystem`
  importam `EditorState` do engine; 4 arquivos locais removidos.
