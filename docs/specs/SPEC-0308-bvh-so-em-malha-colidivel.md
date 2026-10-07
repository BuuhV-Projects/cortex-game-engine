# SPEC-0308 - BVH só em malha que pode colidir

**Data:** 2026-10-07
**Status:** aceito

## Contexto

No Detetive Brasília a varredura de colisão do `CharacterPhysicsSystem`
(`collectScene`) chamava `ensureBoundsTree` em toda malha encontrada — inclusive as
escondidas (SPEC-0307 manteve o BVH delas no carregamento pra não montar no quadro
em que o culling as mostra). Mas parte dessas malhas **nunca** é raycastada:

- o jogo desliga o raycast da malha decorativa com `mesh.raycast = () => {}`
  (padrão `noRaycast`): o raio nunca chega na geometria, a árvore não serve pra nada;
- o editor também monta a árvore (`EditorCameraSystem.collectGroundMeshes`) pelas
  mesmas malhas.

São 60+ torres de Águas Claras e muito cenário: memória (o BVH é da ordem do buffer
de posições) e tempo de carregamento perdidos.

## Decisão

1. **`ensureBoundsTree` pula malha com `raycast` desligado** — sobrescrito
   (diferente de `Mesh.prototype.raycast`/`InstancedMesh.prototype.raycast` já com o
   patch) **por uma função sem parâmetros** (`raycast.length === 0`, o `() => {}` do
   `noRaycast`): sem ler o raio ela nunca usa a geometria. Vale pra todo chamador
   (física, câmera do editor).
   - **Por que não "qualquer sobrescrito":** a 1ª versão pulava todo `raycast`
     trocado e a medição no Detetive Brasília pegou o erro — o `hiddenNotSolid` do
     jogo (trânsito, patrulha, viatura, caminhão de gás) embrulha o raycast em
     `function (ray, out) { …; proto.raycast.call(this, ray, out) }`: a malha COLIDE
     e usa a árvore. Sem ela o raycast desses carros voltava a O(nº de triângulos)
     por raio (CPU do Centro subiu). Embrulho com parâmetros mantém a árvore.
2. **Marcador explícito `userData.cortexNoCollide = true`** — "isto é decoração,
   nunca colide com personagem/câmera". `traverseCollidable` **não desce** na
   subárvore marcada (como `editorInternal`): fica fora das listas de chão/parede/
   terreno, dos alvos da câmera e sem BVH. Marque a raiz de um grupo (ex.: o prédio
   inteiro) pra excluir todos os filhos. O picking do editor não muda (o raycast da
   malha continua o da three). Não afeta o Rapier (colisor de corpo é outro caminho).
3. **Preservado:** malha colidível escondida (sem as condições acima) continua
   ganhando BVH no carregamento (SPEC-0307), e a colidível visível continua no
   raycast com árvore. A montagem continua preguiçosa: acontece na varredura em que
   a malha entra (ou entraria, se escondida) na lista.

Sem helper novo exportado: o flag em `userData` basta (é dado, serializa no
`level.json` como os outros `cortex*`).

## Consequências

- Limite conhecido: embrulho com **rest** (`(...a) => proto.raycast.apply(this, a)`)
  também tem `length === 0` e perderia a árvore — declare os parâmetros
  (`(ray, out)`). Nenhum caso no engine/jogos.
- `cortexNoCollide` tira a subárvore da colisão do Character/câmera em até
  `COLLECT_INTERVAL_MS` (250 ms), como esconder (SPEC-0307).
- Testes: `tests/physics/raycastAccel.test.ts` (noRaycast sem árvore; colidível com
  árvore; embrulho `(ray, out)` mantém árvore e acerta), `tests/systems/CharacterPhysics.test.ts` (escondida colidível ganha BVH na
  carga; `cortexNoCollide`/noRaycast não; colidível continua segurando o chão).
