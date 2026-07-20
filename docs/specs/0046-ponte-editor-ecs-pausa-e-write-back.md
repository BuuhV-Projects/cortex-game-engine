# SPEC-0046 - Ponte editor↔ECS: pausa de gameplay e write-back no Transform

**Data:** 2026-06-05
**Status:** aceito

## Contexto

Com o foco em plataforma 2.5D (PRD-0003 / SPEC-0045) os objetos da cena viraram
**entidades ECS** (player, colliders) movidas pela física a cada tick. Isso
quebrava o editor embutido (F2, SPEC-0030/0041/0042) de dois jeitos:

1. **Gameplay rodava durante a edição:** ao abrir o editor, o player continuava
   caindo e os sistemas continuavam mexendo nos objetos — impossível editar.
2. **Edição não "grudava":** mover um objeto pelo gizmo mexia no `Object3D`, mas
   o `Object3DSyncSystem` reescreve o `Object3D` a partir do `TransformComponent`
   no próximo tick — então a edição era sobrescrita ao dar play.

## Decisão

Ponte mínima entre o editor e o ECS, em duas pontas:

1. **Pausa de sistemas — `System.pauseWhen`.** Campo opcional na base `System`:
   `pauseWhen?: () => boolean`. No `World.tick`, antes de consultar/atualizar,
   `if (system.pauseWhen?.()) continue;` pula o sistema naquele frame. Genérico
   (qualquer sistema pode pausar sob qualquer condição), não acoplado ao editor.

2. **`Game.editorActive`.** Getter no `Game` (`this._editor?.isActive() ?? false`)
   + `GameEditor.isActive()`. `false` quando não há editor (produção). É o gatilho
   de pausa: `setupPlatformer` marca `input.pauseWhen = physics.pauseWhen = () =>
   game.editorActive`. No editor a gameplay congela; ao fechar, volta.

3. **Write-back do gizmo no Transform.** Em `attachEditor`, o callback
   `onTransformChange` do `ObjectEditSystem` procura a entidade cujo
   `Object3DComponent.object` é o objeto movido e copia
   posição/rotação(Y) pro `TransformComponent`. Assim o sync passa a propagar a
   edição (em vez de sobrescrevê-la) — a edição persiste no play.
   `ThirdPersonCameraSystem`, que já tinha um `pauseWhen` privado próprio, passou
   a usar o herdado da base.

## Consequências

- Editar objetos de gameplay no editor (F2) agora "gruda": move/rotaciona →
  Transform → persiste ao dar play. Junto com o overlay (ADR-0044), também
  persiste em disco.
- `System.pauseWhen` é API pública nova e reutilizável (pausar IA, partículas,
  etc. sob qualquer predicado), não só gameplay-no-editor.
- O editor é **3D pleno** (todos os eixos livres: mover/rotacionar/escalar em
  X/Y/Z), mesmo a gameplay sendo 2.5D — útil pra profundidade/parallax em Z e
  decoração. O write-back cobre só posição + rotação Y porque são os **únicos
  campos que o `Object3DSyncSystem` sobrescreve**; rotação X/Z e escala não são
  sincronizadas, então ficam no `Object3D` e persistem sem precisar do Transform.
  (Histórico: o editor já foi travado no plano XY via `lock2D`, opção que segue
  existindo no `ObjectEditSystem` mas não é mais usada por padrão.)
- Só funciona pra objetos com entidade ECS sincronizada (`Object3DComponent` +
  `TransformComponent`); objetos puros de cena seguem editados direto no `Object3D`.
- Relaciona-se com ADR-0028 (sync Object3D↔Transform), 0030/0041/0042 (editor),
  0044 (overlay/persistência) e 0045/PRD-0003 (gameplay 2.5D que motiva a pausa).
