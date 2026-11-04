# ADR-0677 — Projeção do passe principal: o que fica em C++ e o que fica em JS

**Data:** 2026-11-03
**Status:** aceito — direção (b)/(c) da ADR-0330; a intermediária foi implementada na SPEC-0682 (ADR-0683), o item retido segue adiado (ver Resultado)

## Contexto

DDD 00 (Port Hollow), export nativo: `nativeProject` mede 4–6 ms dentro do `sceneRender` (7–11 ms), mesmo com a
etapa (a) da ADR-0330 entregue (SPEC-0332).

Lendo o caminho (`src/render/NativeMainProjection.ts`, `native/src/scene/main_pass_culler.cpp`,
`src/render/RenderServer.ts`, `src/render/CleanDrawFastPath.ts`):

- **Já roda em C++, numa chamada por quadro** (`__cortexMainPass.project`): a travessia da árvore espelhada, a
  visibilidade herdada, a composição das matrizes de mundo (no `SceneMirror`), o culling por frustum pela esfera da
  geometria e o `z` de ordenação.
- **O que sobra em JS é por candidato** (cada nó que passou no culling):
  1. `layers.test`, leitura do material, `material.visible`;
  2. `RenderServer.offer` → `recordingOf` → `check`: o `restMatch` (~45 comparações de estado de material,
     geometria e atributos, com um `for…in` nos atributos) e o `matrixMatch` (16 comparações da matriz de mundo
     contra a gravada);
  3. `_push` em 10 arrays paralelos, e no `_prepare` o `sort` com comparador JS.

No Hermes sem JIT isso dá alguns µs por candidato. É esse laço que mede 4–6 ms. O culling por frustum, que a
tarefa pedia para levar ao C++, já está lá.

## Alternativas

| | o que vai para C++ | o que sobra em JS por candidato | custo |
| --- | --- | --- | --- |
| **só culling em C++** (o estado atual, (a)) | culling, mundo, `z` | tudo do item 2 e 3 acima | nada a fazer, nada se ganha |
| **intermediária: bit "moveu" do host** | o espelho guarda a versão da matriz de mundo por slot e devolve, com cada candidato, se a matriz mudou desde a gravação | `restMatch`, `_push`, `sort` | some o `matrixMatch` (~⅓ do `check`) |
| **item de desenho retido** ((b)/(c) da ADR-0330) | o host guarda, por slot, a receita do desenho (pipeline, bind groups, faixa de vértices) e emite os draws na ordem do `three` | só a notificação do que mudou (versão de material/geometria por gancho, como os de transform da SPEC-0322) | o laço por candidato sai do JS |

## Decisão

A direção é o **item de desenho retido** ((b)/(c) da ADR-0330). Os princípios da fase (o JS orquestra e o C++
itera, chamadas grossas, sincronizar só o sujo) apontam para lá. Ficar só no culling em C++ é o que já temos, e a
medição mostra que o custo restante está na cola por candidato, não no culling.

A **intermediária** fica como primeiro passo, porque reaproveita o "sujo de verdade" da SPEC-0678. A partir dela
o host sabe exatamente quais matrizes de mundo mudaram (o `updateAndCull` não propaga mais linha igual). Uma
versão por slot nesse ponto é barata, e o `matrixMatch` vira uma comparação de inteiro.

## Consequências

- **Nada disso foi implementado nesta mudança.** A intermediária mexe em `RenderServer.ts` (655 linhas),
  `CleanDrawFastPath.ts` (887) e `scene_mirror.h` (578). Pela SPEC-0668, cada um teria de ser dividido na mesma
  mudança. São três divisões de código de render sem medição no jogo, e a frente não roda o jogo. Ficam para uma
  mudança própria: primeiro as divisões, sem mudança de comportamento, depois o bit "moveu" com A/B no DDD 00.
- O item de desenho retido depende da cobertura da `MaterialDesc` (M1) e dos ganchos de versão de
  material/geometria. A SPEC-0333 (etapa (b)) segue sendo o lugar do desenho.
- O que esta mudança reduz no `nativeProject` vem só da SPEC-0678. O `syncPending` no começo da projeção manda
  menos linhas, e o host deixa de recompor subárvore parada.

## Resultado (2026-11-04, SPEC-0682, ADR-0683)

- **Intermediária entregue.** O `cull` aceito devolve, por candidato, a versão da matriz de mundo
  (`native/src/scene/world_versions.*`). Ela é dada pelo **conteúdo** (foto por slot comparada com a memória que o
  `three` lê, contador global), e não pela lista `changed_` do `updateAndCull`, porque o JS escreve na fatia do mundo
  sem linha de sync (SPEC-0340). Os dois consumidores pulam as 16 comparações quando a versão é a que adotaram: o
  RS1 (`checkRecording`) e o renderer nativo (`take(…, version)`, ligado no DDD 00), que é quem recebe a maioria
  dos candidatos.
- As três divisões que a primeira versão desta ADR pedia foram feitas na mesma série, sem mudança de comportamento:
  `RenderServer.ts` (655 → 489 + `RenderServerTypes.ts`), `CleanDrawFastPath.ts` (887 → 447 + `CleanSnapshot.ts`) e
  também `NativeRenderer.ts` (1.063 → 471 + três stores e `nativeRendererShared.ts`). O `scene_mirror.h` (578) não
  foi tocado: as versões ficam com o `MainPassCuller`.
- **Estimativa, não medição:** ~0,4–1 ms a menos no `nativeProject` do centro do DDD 00 (2–3 mil candidatos parados
  × 0,2–0,4 µs da comparação no Hermes sem JIT). A medição fica para a sessão principal (A/B, poses fixas).
- **Item retido:** adiado, com o desenho e o motivo na ADR-0683 (paridade sem rede de troca de material em runtime
  e ordem com dois lados ordenando). O próximo passo é medir quanto do `nativeProject` sobrou.
