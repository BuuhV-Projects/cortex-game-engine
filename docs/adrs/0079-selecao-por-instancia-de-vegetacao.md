# 0079 - Seleção por instância de vegetação no editor

**Data:** 2026-06-28
**Status:** aceito

## Contexto

A vegetação é `InstancedMesh` (ADR-0077): centenas de árvores num grupo, com 2
sub-malhas (tronco/folha). No editor, clicar numa árvore selecionava o **grupo
inteiro** e mostrava o gizmo de mover no **pivô central no chão** — não dizia QUAL
árvore, e não dava pra apagar uma só. O usuário quer: um grupo (deletar tudo), mas
poder **selecionar/apagar cada árvore** individualmente, e ao selecionar o grupo ver
o contorno em **todas**.

Listar cada instância na hierarquia é inviável (centenas de itens). Decisão (com o
usuário): seleção por **clique no viewport**, sem inflar a hierarquia.

## Decisão

- **`Vegetation`** ganhou `instanceAt(i)`, `removeAt(i)` e `modelBounds(box)` (bbox do
  modelo em escala 1, p/ o gizmo).
- **`VegetationGizmoSystem`** (novo, dev/editor): desenha a **caixa de linhas** verde
  em UMA instância (`show(veg, group, i)`) ou em TODAS (`i < 0`). Puramente visual
  (`raycast` off, `editorInternal`).
- **`ObjectEditSystem`**: o picker captura o `instanceId` do raycast; se o hit é uma
  sub-malha de vegetação (`cortexVegetationSub`), roteia pro `VegetationPickHook`
  (`onInstance`/`onGroup`/`onOther`). Pra vegetação, **não** anexa o gizmo de mover
  (o pivô central confundia) — o feedback é a caixa por instância. O **Delete** chama
  `onDelete()`: se há uma árvore selecionada, remove só ela (e o grupo continua).
- **`VegetationApi.deleteInstance(obj, i)`** remove a instância da `Vegetation` viva e
  **persiste** (`node.instances = veg.getInstances()`), como o resto da autoria.

## Consequências

- Clicar numa árvore seleciona/realça só ela; Delete apaga só ela; o grupo segue 1
  item na hierarquia (selecionar = contorno em todas). Sem lista gigante.
- Mover/rotacionar a árvore individual ainda não tem gizmo (fora do escopo; o uso é
  selecionar + apagar). Mover o grupo todo via gizmo também foi removido (raro/confuso).
- A colisão da árvore continua sendo **propriedade do objeto** (`cortexSolid`/`collide`),
  independente da seleção. Ver [[ADR-0077]].
