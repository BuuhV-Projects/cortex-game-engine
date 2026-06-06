# 0047 - Collider 2D como propriedade do objeto (autorável no editor, acoplado)

**Data:** 2026-06-06
**Status:** aceito

## Contexto

O `Collider2DComponent` (ADR-0045) era sempre centrado na posição do
`TransformComponent`. Na prática, pra cobrir uma sub-região do mesh (só o "deck"
de uma ponte, não os pilares) ou compensar um pivô descentralizado do GLB, os
projetos criavam o collider como **entidade ECS desacoplada** do mesh (Transform +
Collider2D, sem Object3D). Consequência: ao mover o objeto no editor, o collider
**não acompanhava** — não eram "o mesmo grupo".

O usuário pediu o modelo estilo Unity/Godot: **todo objeto pode ter um collider,
abstraído pela engine**, com duas fontes — (a) **código/JSON** (autoritativo) ou
(b) **editor** (se não há no código, ativa/configura no modo edição, persistido no
overlay). E o collider **acoplado** ao objeto (movem juntos).

Além disso, os aprendizados do projeto real (`dream-island-wonder`) revelaram um
**bug latente de física**: colliders **sólidos** disparam falso "parede lateral" —
quando o player está em pé e a gravidade o afunda ~0.01u no topo, o X-resolve do
frame seguinte vê Y-overlap e teleporta o player pra borda. O workaround era marcar
**tudo `oneWay`** (que pula o X-resolve), o que limita o design.

## Decisão

1. **Offset no `Collider2DComponent`** (`offsetX`, `offsetY`, default `0`): o AABB
   pode ser uma sub-região deslocada do objeto **sem desacoplar** — o collider mora
   na MESMA entidade do mesh (Object3D + Transform + Collider2D) e movem juntos. A
   física, o gizmo e o inspector usam o centro efetivo `Transform + offset`.

2. **X-resolve por menor penetração** (`PlatformerPhysicsSystem`): o eixo X só
   bloqueia ("parede") quando a penetração horizontal é a MENOR; senão é
   "pousar/teto" e fica pro passo Y. Elimina o wall-trap → **colliders sólidos são
   andáveis** (não precisam ser `oneWay` só pra evitar o trap). `oneWay` segue
   pulando o X inteiro (compat).

3. **Collider vindo do overlay + precedência** (`SceneBuilder`): além de
   `node.collider` (código/JSON), o `buildScene` lê `overlay.data.colliders[id]`
   (editor). Precedência: **código vence**; senão usa o do editor; senão sem
   collider. `colliderSchema` ganhou `offsetX/offsetY`.

4. **Autoria no editor** (`EditorInspector` + `attachEditor`): seção **Collider**
   editável — adicionar (tamanho default = bbox), editar largura/altura/offset/tipo
   (sólido/one-way), remover. Persiste em `overlay.data.colliders[nome]`. Collider
   de código vem **`locked`** (read-only — "definido no código"). O collider criado
   é acoplado (Object3D do objeto selecionado) → o gizmo reflete e movem juntos.

## Consequências

- O collider vira uma propriedade do objeto, autorável visualmente — sem precisar
  do padrão desacoplado nem de helpers manuais por projeto.
- A mudança de física é **aditiva** (offset `0` + menor-penetração só relaxa o
  X-resolve onde antes travava): os 224 testes seguem passando + 2 novos
  (anti wall-trap, offsetY). Casos de "plataformas adjacentes no mesmo Y com gap"
  (parede vertical real) ainda pedem `oneWay`/collider único — o fix cobre o
  wall-trap de UM collider sólido, não a parede entre dois.
- O padrão **desacoplado** (Transform-only, sem Object3D) ainda funciona (é código
  de usuário), mas deixa de ser necessário/recomendado.
- Persistência reusa o overlay (`SceneFileV1.data`, ADR-0031/0044) — sem novo
  formato; `data.colliders` é opaco pro resto do engine.
- Relaciona-se com ADR-0045 (primitivas plataformer), 0046 (ponte editor↔ECS,
  write-back) e 0044 (overlay data-driven).
