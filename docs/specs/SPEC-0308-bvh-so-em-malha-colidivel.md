# SPEC-0308 - BVH só em malha que pode colidir

**Data:** 2026-10-07
**Status:** aceito

## Contexto

No DDD 61 a varredura de colisão do `CharacterPhysicsSystem`
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
     trocado e a medição no DDD 61 pegou o erro — o `hiddenNotSolid` do
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

## Medição (DDD 61 e81d04d, Chrome headless WebGPU, A = vendor da main × B = esta mudança, mesmo commit do jogo, rodadas intercaladas)

| | A | B |
|---|---|---|
| geometrias com BVH | 287 | 217 (−70) |
| memória dos BVH (ArrayBuffer, fora do heap JS) | 9,2 MB | 6,7 MB (−2,5 MB) |
| malhas `noRaycast` com BVH | 94 | 23 (geometria compartilhada com malha colidível) |
| heap JS após GC | 107,5 MB | 107,5 MB (igual: o BVH é memória externa) |
| carregamento até o 1º quadro (3×) | 3,65–3,72 s | 3,69–3,87 s (ruído) |
| tempo em `ensureBoundsTree` no início (perfil) | ~210 ms | ~185 ms |
| fps Centro / Águas Claras (mediana de 3, sem vsync) | — | igual a A (±1–3%, nos dois sentidos) |

Colisão: personagem andando contra torres de AC, estação, lojas e na origem (4
direções cada) termina na MESMA posição em A e B (±3 cm) e a câmera encolhe igual
contra parede (1,01 m), sem atravessar.

A 1ª versão (pular qualquer `raycast` sobrescrito) dava 201 BVH, mas tirava a árvore
dos carros do jogo (`hiddenNotSolid`) — CPU do Centro subiu; corrigido pelo critério
"sem parâmetros" (item 1).

Fora do escopo, achado na mesma medição: o travamento de ~7–10 s logo após o start
(1 quadro de ~2 s + 1 de ~6–8 s) **não é BVH**. No trace do Chrome a thread do JS
fica ociosa e o processo de GPU compila **140 render pipelines**
(`DeviceBase::APICreateRenderPipeline` 8,9 s, `CompileShaderDXC` 5,4 s) — custo de
variantes de material/pipeline no 1º desenho (aquecimento + primeiros quadros).
