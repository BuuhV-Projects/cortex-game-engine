# SPEC-0680 — Uma travessia de matriz por render de cena (caminho three)

**Data:** 2026-11-04
**Status:** implementado

## Contexto

Medição de 2026-11-04 (DDD 00, Studio, three em JS): centro 25,0 ms (render 20,4), spawn 29,9 ms (render 25). A
auditoria contou o `updateMatrixWorld` da cena ~4,4× por quadro sobre ~14,6 mil nós: o `Renderer.render` do three
(`node_modules/three/src/renderers/common/Renderer.js`, ~1578) faz `scene.updateMatrixWorld()` sempre que
`scene.matrixWorldAutoUpdate === true`, e o quadro chama esse `render` várias vezes para a MESMA cena — o passe
principal (`PassNode` do pós ou `Renderer.render` direto) e, aninhados nele, cada cascata de sombra que redesenha
(`ShadowNode.renderShadow` → `renderer.render(scene, shadow.camera)`). O wrapper da auditoria (r5) que fazia uma
travessia só mediu −8,5 a −14,6 ms no Studio com sombra.

Era o item 5 pendente da SPEC-0671: a saída pensada mexia no `Game.ts` (1.080 linhas). A escolha de onde cortar
está na ADR-0681.

## Decisão

### 1. `installSingleMatrixUpdate` (`src/render/SingleMatrixUpdate.ts`)

Embrulha o `render` da INSTÂNCIA do `WebGPURenderer` (sem tocar no `node_modules`), instalado no construtor do
`Renderer` da engine. Para cada chamada `render(scene, camera)`:

- se `scene.matrixWorldAutoUpdate !== true` (render aninhado da mesma cena, `?matrixFreeze`, cena já gerida por
  quem chamou) ou o desvio (`bypass`) está ativo: repassa sem mexer em nada;
- senão: `scene.updateMatrixWorld()` uma vez, `scene.matrixWorldAutoUpdate = false`, chama o `render` original e,
  num `finally`, devolve `matrixWorldAutoUpdate = true` (também quando o render lança).

Resultado: por render "de fora" de uma cena há UMA travessia; os renders aninhados (cascatas, passes que desenham a
mesma cena) acham o auto-update desligado e não percorrem de novo. Fora do render a cena volta ao normal — editor,
picking, raycast, `getWorldPosition` e quem adiciona objeto entre quadros veem a cena como antes.

A câmera não muda: o three só atualiza a câmera sem pai (`camera.parent === null`), que custa um nó.

O `bypass` é `activeSceneMirror()?.installed`: com o espelho nativo (SPEC-0234) a matriz de mundo é do host e os nós
espelhados já estão com o auto-update desligado; o nativo fica como está.

`uninstall()` devolve o `render` anterior (propriedade própria ou a do protótipo). A `RenderPhaseProbe`
(`?renderPhases`) e a `NativeMainProjection` embrulham por cima, depois: a primeira continua medindo o render todo
(a travessia única cai dentro da janela dela); a segunda só existe com o espelho, quando o desvio está ativo.

### 2. Luzes das cascatas atualizadas no próprio `updateBefore` (`CameraFollowingCSM`)

O `CSMShadowNode.updateBefore` do three MOVE as luzes das cascatas (`lwLight.position`/`target.position`) DURANTE o
render, e o `shadow.updateMatrices(luz)` de cada cascata lê `light.matrixWorld`. Antes, quem propagava a posição nova
era a travessia do render da cascata ANTERIOR (a cascata 0 já usava a matriz do quadro passado). Com uma travessia
só, todas usariam a do quadro passado.

Depois do `super.updateBefore`, o `CameraFollowingCSM` chama `updateMatrixWorld()` na luz e no alvo de cada cascata
(2 nós por cascata, sem filhos). Só sem o espelho instalado (mesmo critério do escalonamento da SPEC-0675): com o
espelho a matriz desses nós é do host. Ganho de quebra: a cascata 0 deixa de usar a pose do quadro anterior.

### 3. Outras travessias por quadro no caminho three (auditoria)

Lidas no caminho do Studio:

- `cullOutlines` (`Game`, a cada 10 quadros) e `cullShadowCasters` (`CameraFollowingCSM`, a cada 10 quadros) já são
  amortizados e não caem no mesmo quadro (o da sombra roda no quadro 1, 11, 21…; o do contorno no 10, 20, 30…).
- `PerfTrace`, `RendererCensus`, `pendingInstanceRanges`, `WriteBufferCensus`: só com a medição pedida.
- `CasterGeometryRegistry._varrer`: só quando o registro precisa revarrer (cena nova), não por quadro.
- `uiQuads` faz `scene.updateMatrixWorld()` na cena da UI (dezenas de nós) e o `render` dela faz outra: custo
  desprezível, fica.

Nenhuma outra travessia da cena inteira se repete por quadro do lado da engine; a repetida era a da matriz.

### 4. Fora desta mudança

- `NativeRenderer.recipeFor` (pendência da SPEC-0675): continua montando `` `${color}|${depth}|${samples}|${pass}` ``
  e lendo três formatos do `renderContext` por draw por passe. O `known.frame === _frameGeneration` só invalida
  quando o grupo 1 muda, então o custo é a string e as três leituras, não o `record`. Cachear por
  `(renderContext, passe, quadro)` exige tocar `src/render/native/NativeRenderer.ts` (já dividido na SPEC-0682, 471 linhas), refatoração do
  renderer nativo que só se valida na bancada do host: fica pendente só por essa validação.

## Consequências

- Studio/navegador: de ~4,4 para 1 travessia da cena por quadro (a do pós-processo/UI em outras cenas é à parte).
  Estimativa: com o custo da auditoria (r5), −8,5 a −14,6 ms no render com sombra; pela conta direta, 3,4 de 4,4
  travessias somem (~77% do tempo de matriz do quadro).
- Objeto movido DENTRO do render da mesma cena (callback de render, `updateBefore` de nó) não tem mais a matriz
  repropagada pelos renders aninhados: quem mexe em pose no meio do render atualiza a matriz do que mexeu (é o que
  o CSM passa a fazer). Na engine não há outro caso (`onBeforeRender` só aparece como critério de recusa no nativo).
- Objeto movido entre dois renders de fora (outro `render` no mesmo quadro, split-screen, editor) é atualizado pela
  travessia do render seguinte, como antes.
- O nativo não muda: o desvio pelo espelho deixa o `render` como estava.
