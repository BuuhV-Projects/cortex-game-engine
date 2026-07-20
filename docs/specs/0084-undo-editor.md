# SPEC-0084 - Undo/Redo (CTRL+Z) no editor

**Data:** 2026-06-29
**Status:** aceito (em fases)

## Contexto

O editor (F2) não tinha **nenhum** undo — qualquer erro (mover, deletar, editar) era
permanente. O usuário pediu CTRL+Z pra **tudo**. A superfície de mutação é grande: gizmo
de transform, ~11 seções de autoria (física/material/terreno/veículo/underlay/…), add/delete
de nó, sculpt de terreno, spray de vegetação, edição de malha (ProBuilder).

## Decisão

**Command-stack** (`CommandStack` + `EditorCommand{label, undo, redo}`): cada ação já
executada é empilhada; `undo()` reverte, `redo()` refaz; nova ação limpa o redo. Atalhos:
**CTRL+Z** desfaz, **CTRL+SHIFT+Z / CTRL+Y** refaz (só no editor, fora de campos de texto).

Implementado **em fases** (a superfície é grande e a UI do editor só é validável rodando):
- **Fase 1a (feita):** infra + atalhos + **undo de TRANSFORM** (gizmo) — captura antes no
  `dragging-changed` (start), registra o comando ao soltar (se mudou). `ObjectEditSystem`
  expõe `onTransformCommit`; o `attachEditor` empilha (aplica pos/rot/escala + write-back +
  `overlay.objects` + persist + re-seleciona).
- **Fase 1b (feita):** add/delete de nó. O Object3D é mantido **vivo** (delete só
  desanexa) → undo re-anexa o mesmo obj + restaura `overlay.objects`/concerns (snapshot
  JSON) + lista `added`/`deleted` + recria o corpo físico vivo (`physicsApi.setType` pelo
  tipo salvo; params exatos voltam no reload via overlay). `add` e `delete` compartilham
  `snapshotNode`/`restoreNode`/`deleteNodeCleanup`. **Limitação:** params finos do corpo
  (massa/velocidade) voltam como default ao vivo até o próximo reload.
- **Fase 2:** seções de autoria (física/material/matte/collider/veículo/underlay/animação)
  — comando com snapshot antes/depois da entrada do `overlay.data[concern][id]` + re-aplicar.
- **Fase 3:** sculpt (heightmap), spray de vegetação, edição de malha — comandos em LOTE
  (uma pincelada/sessão = um undo), snapshot do heightmap/instances/geometry.

## Consequências

- Ponto de funil: o `CommandStack` no `attachEditor`; cada origem de mutação empilha um
  comando (transform via callback do gizmo; as demais via as APIs de autoria, nas fases).
- Casos difíceis (sculpt/veg/mesh) precisam de batch (timestamp/`pointerup`) pra não
  poluir o histórico com centenas de micro-ações.
- Limite de 200 ações (ring) pra não vazar memória.
