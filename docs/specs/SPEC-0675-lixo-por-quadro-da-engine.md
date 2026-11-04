# SPEC-0675 — Lixo por quadro da engine: consulta do `World`, escrita da `Vegetation` e CSM escalonado

**Data:** 2026-11-03
**Status:** implementado
**Relacionados:** ADR-0676, SPEC-0357, SPEC-0334, SPEC-0077, SPEC-0299, SPEC-0631, SPEC-0245, SPEC-0197

## Contexto

DDD 00 (Port Hollow) no export nativo (Hermes sem JIT, poses fixas): quadro JS 35–48 ms para uma meta de 13,3 ms,
e **~6 MB de lixo por quadro** (~120 MB/s), dos quais o código do jogo é só ~150 KB. Cena: ~14,6 mil nós no grafo,
~2,1 mil entidades ECS, ~19 `FrameHookSystem` do jogo (todos com `requiredComponents = []`).

Três frentes nesta mudança (as outras — `Object3DSyncSystem`, `CharacterPhysicsSystem` — são de outras frentes):

- (a) o lixo da engine por quadro, cortando pelo volume (por entidade/por nó/por draw primeiro);
- (b) `Vegetation.setInstances` de 1.900 impostores custa ~18,7 ms sem JIT (microbench do jogo);
- (c) no Studio (caminho `three` em JS) todas as cascatas do CSM redesenham todo quadro.

## Decisão

### (a) Consulta do `World.tick` sem alocar (ADR-0676)

Leitura dos caminhos quentes que o jogo usa (`Game._tick/_update`, `GameLoop`, `World.tick`, sistemas padrão,
`NativeSceneMirror.update`, `NativeMainProjection`, `RenderServer`, `NativeRenderer`, `FrameProfiler`, `PerfTrace`,
`RenderSections`, UI de runtime, `Vegetation`, sombra nativa). A maior fonte, por volume, era a consulta do `tick`:

- `World.tick` fazia `this.query(...required)` por sistema por quadro: `for…of` no `Set` de entidades (no Hermes, um
  objeto `{ value, done }` por passo) e um array novo que cresce por realocação.
- `requiredComponents = []` casa com **todas** as entidades. No DDD 00 são ~25 sistemas assim (19 ganchos do jogo +
  `TerrainCollision`, `VehicleControl`, `VehicleDriver`, `SkidMark`…): ~52 mil passos de iterador e ~25 arrays de
  2,1 mil posições por quadro.

Estimativa no Hermes (objeto de resultado do iterador ~56–64 B; array de 2,1 mil ponteiros crescendo por realocação
~35–50 KB): **~3–4 MB por quadro** só nessa consulta, mais o tempo de percorrer 52 mil entidades sem JIT. A medição no
nativo fica com a sessão principal.

Mudança (`src/ecs/World.ts`, `src/ecs/Entity.ts`, `src/ecs/structureVersion.ts`):

1. O `World` mantém as entidades também num array (ordem de inserção, a do `Set`), percorrido por índice.
2. Versão de estrutura: `createEntity`, `destroyEntity`, `clear` e `addComponent`/`removeComponent` de qualquer
   entidade sobem um contador do módulo `structureVersion` (interno, fora do `index-runtime`).
3. O `tick` consulta por `requiredComponents` (identidade do array estático, num `WeakMap`: um getter que devolve
   array novo por leitura perde o cache mas não acumula entradas): o resultado fica em cache com a versão
   em que foi montado; com a versão igual, o mesmo array volta, sem varrer nada. `[]` devolve o array de todas as
   entidades. Mudou a estrutura: monta um array **novo** (o antigo, se alguém o guardou, fica como estava).
4. `world.query(...classes)` público continua devolvendo um array novo por chamada, agora sem iterador.

Contrato novo, no TSDoc de `System.update`: o array recebido é compartilhado e não pode ser mutado (nenhum sistema da
engine nem do DDD 00 muta).

Medida (microbench com JIT, `tests/ecs/worldQueryAlloc.test.ts`, 2,1 mil entidades, 25 sistemas `[]` + 3 com dois
componentes): ver tabela em "Medidas".

Achados que ficam **pendentes** (ver "Pendências"): chave de receita por draw no `NativeRenderer.recipeFor`, estado
compartilhado por estado no `RenderServer._prepare`, `getInstances()` copiado na coleta de troncos do
`CharacterPhysicsSystem`.

O que foi lido e **não** aloca por quadro no caminho comum: `GameLoop._step`, `FrameProfiler` (desligado retorna no
primeiro `if`; ligado, só números em `Map`), `RenderSections`, `NativeSceneMirror.update`/`_escreverLinhas`/
`_varrerFlags` (já sem alocação, SPEC-0322/0357), `MainProjector.project`, `RenderServer.offer`/`_emitUntil`,
`UiLayer.update` (um objeto de layout por quadro), `RendererUiBackend.sync`, `PerfTrace.tick` fora da amostra
(64 nós por quadro, sem alocar).

### (b) `Vegetation`: escrita sem cópia, por faixa, e sincronia mais barata

O custo do `setInstances` não era a cópia (`slice` de 9,5 mil números: ~0,01 ms): era o `sync` — por instância e por
sub-malha, `Euler` → `Quaternion` → `compose` → `multiplyMatrices` → `setMatrixAt`, e depois o
`InstancedMesh.computeBoundingSphere` percorrendo tudo de novo (`getMatrixAt` + `Sphere.applyMatrix4` +
`getMaxScaleOnAxis`). Sem JIT (V8 `--jitless`, 1.900 árvores de 2 sub-malhas) a esfera sozinha passava do resto.

Mudança (`src/scene/Vegetation.ts`, `src/scene/vegetationMatrices.ts`):

1. **Matriz direta:** `T(pos)·Ry(rot)·S(scale)·local` escrita direto no `instanceMatrix.array` (12 produtos por coluna,
   seno e cosseno uma vez por instância para todas as sub-malhas). Mesma matriz do caminho antigo (tolerância de
   ponto flutuante).
2. **Esfera no mesmo laço:** a esfera de cada instância sai da matriz recém-calculada (em `double`, antes de ir para o
   `Float32Array`; o `three` relê a matriz já arredondada, então a diferença é só o arredondamento de `float`) e entra
   por `Sphere.union` num rascunho — o resultado do `computeBoundingSphere`, sem a segunda passada.
3. **API nova, a antiga mantida:**
   - `setInstances(flat)` — como antes (copia; aceita qualquer `ArrayLike<number>`; zera a máscara).
   - `adoptInstances(data, count?)` — **sem cópia**: o `Float32Array`/`Float64Array`/`number[]` do chamador vira o
     armazenamento. O chamador não muta sem avisar (`syncInstances`). Zera a máscara.
   - `writeInstances(first, flat, count?)` — copia só a faixa `[first, first+count)` para o armazenamento, sobe o
     total se a faixa passar dele, e sincroniza **só a faixa**: matrizes, `instanceMatrix.addUpdateRange` e a esfera
     **crescendo** (união com as esferas da faixa; nunca encolhe — encolhe na próxima escrita inteira). Mantém a
     máscara.
   - `syncInstances(first, count)` — ressincroniza uma faixa que o chamador mutou no buffer adotado.
   - `instanceData` — o armazenamento atual, só leitura, válido para `count` instâncias (sem a cópia de
     `getInstances()`).
4. Faixas acumuladas sem upload (malha fora de vista não sobe; SPEC-0597): passou de 32 faixas, o `three` sobe o
   atributo inteiro (`clearUpdateRanges`).
5. A escrita inteira (`setInstances`, `adoptInstances`, edição do editor) marca a faixa inteira **explícita**
   (`clearUpdateRanges` + `addUpdateRange(0, n × 16)`), não a lista vazia. Com a lista vazia ("sobe tudo"), uma
   escrita por faixa no mesmo quadro, antes do upload, fazia o `three` subir só a faixa e perder a escrita inteira.
6. O vão que o `writeInstances` abre além do total (`[total, first)`) fica com escala 0 no armazenamento próprio (com buffer adotado, com o que o buffer tiver): não desenha, e o coletor do
   personagem não faz tronco de escala 0 (antes virava um tronco invisível na origem). Instância de escala 0 (o vão e
   a escondida pela máscara da estrada) também não entra na esfera de culling: a matriz nula levaria a esfera da
   geometria para a origem e esticaria a esfera da malha até lá, desligando o culling da SPEC-0299 nas vistas.

`add`, `removeNear`, `removeAt` (editor) e `getInstances` seguem com o mesmo comportamento; com buffer adotado, as
edições do editor copiam para um array próprio antes de mexer.

### (c) CSM escalonado no caminho `three`

`CameraFollowingCSM` (agora em `src/scene/CameraFollowingCSM.ts`; o `OutdoorLighting.ts` tinha 582 linhas) ganha
`farCascadeInterval` (opção `shadowFarCascadeInterval` do `setupOutdoorLighting`, default **2**): sem espelho
nativo instalado (Studio, navegador — o `three` é o único que desenha as cascatas), a cascata 0 redesenha todo quadro
e a cascata `i > 0` só nos quadros em que `(quadro + i) % intervalo === 0` — as distantes se revezam e não caem todas
no mesmo quadro. `1` volta ao comportamento antigo.

- Seguro porque o `three` só recalcula `shadow.matrix` (o `lightShadowMatrix` que amostra o mapa) dentro do
  `updateShadow`: a cascata que pulou o quadro amostra o mapa e a matriz do MESMO quadro anterior. Estático fica
  certo; objeto andando na cascata distante atrasa até `intervalo − 1` quadros. A câmera andando também: a cascata que pulou
  cobre a área da câmera do quadro anterior, e com a câmera rápida a borda dela pode ficar sem sombra por até
  `intervalo − 1` quadros.
- Troca de câmera (`updateFrustums`, editor ↔ play) força todas as cascatas no quadro.
- O 1º quadro escalonado também força todas: nenhuma cascata tem mapa ainda, e a que pulasse amostraria a textura
  de profundidade zerada (a faixa dela inteira em sombra). O `_init` do CSM já guarda a câmera do build, então a
  troca de câmera não cobre esse quadro.
- Com espelho nativo instalado nada muda: o passe nativo (SPEC-0245) é dono do `autoUpdate`, e num quadro que ele
  devolve ao `three` já chamou o `updateMatrices` das cascatas — pular o redesenho ali daria mapa velho com matriz
  nova. `?semPasseDeSombra=1` continua congelando tudo.
- Dois lixos por quadro do mesmo arquivo saem junto (valem no nativo): as queries `?semPasseDeSombra` e
  `?semPasseDeSombraNativo` eram um `URLSearchParams` novo por pergunta, 2–3 por quadro (agora só quando
  `location.search` muda), e a linha de relato do passe nativo (`ASSUMIU desenhados=…`) era montada todo quadro com o
  log desligado — o `desenhados` muda quase todo quadro (agora só com `debug('perf')` ligado).

## Medidas

Microbench de alocação (`heapUsed` antes/depois de rodadas de chamadas, menor rodada sem coleta, como o
`tests/perf/alloc.perf.ts` do DDD 00) nos testes `tests/ecs/worldQueryAlloc.test.ts` e
`tests/scene/vegetationWriteBench.test.ts`, que rodam com JIT; os mesmos arquivos empacotados e rodados com
`node --jitless` (o proxy do Hermes, young generation de 512 MB para não coletar no meio da rodada) dão a coluna sem
JIT. O V8 tem objetos menores que o Hermes, e com JIT otimiza o iterador do `Set` que o Hermes aloca por passo: os
números comparam antes e depois, não somam com o nativo.

O `vegetationWriteBench` também compara o **tempo** do `setInstances` com o caminho antigo, no mesmo processo. Na
máquina local o caminho novo tem de ser 1,5× mais rápido (medido ~3×). No runner do CI (máquina compartilhada) a mesma
medida deu ~1,3× e reprovou um PR sem relação com a `Vegetation` (cortex-game-engine#53, 2026-11-04): com `CI`
definido, só se exige que o caminho novo não seja mais lento. A asserção de bytes por chamada não depende de tempo e
vale nos dois.

| rotina | antes | depois |
| --- | --- | --- |
| `World.tick`, 2,1 mil entidades, 25 sistemas `[]` + 3 com 2 componentes, com JIT | 88 KB/tick | 66 B/tick |
| idem, sem JIT | **4,19 MB/tick**, 4,5 ms/tick | 1,5 KB/tick, 0,005 ms/tick |
| `Vegetation.setInstances` 1.900 × 2 sub-malhas, com JIT | 0,57–0,60 ms | 0,25 ms |
| idem, sem JIT | 17,7 ms | 6,2 ms (`adoptInstances`: 5,8 ms) |
| `Vegetation.writeInstances` de uma faixa de 64, sem JIT | — (escrevia tudo) | 0,21 ms |

O que cai por quadro no DDD 00 (estimativa, a confirmar na medição do nativo): a consulta do `World.tick` era
~4 MB/quadro sem JIT no V8 para a forma da cena do DDD 00 (~2,1 mil entidades, ~28 sistemas) — a maior parte dos
~5,8 MB da engine — e some; o tempo de percorrer as entidades (~4,5 ms sem JIT no V8) também. A `Vegetation` não é
por quadro: o ganho é no quadro em que o LOD da mata reescreve uma célula (~17,7 → ~6,2 ms, ou só a faixa com
`writeInstances`). O CSM escalonado é só do Studio.

## Pendências

- **`NativeRenderer.recipeFor`** monta `` `${color}|${depth}|${samples}|${pass}` `` por entrada nativa por passe por
  quadro (no Hermes, ~6 strings intermediárias por draw). Cache por `(renderContext, passe, quadro)` resolve. Fica
  pendente porque `NativeRenderer.ts` tem 1.063 linhas: tocá-lo exige dividi-lo (SPEC-0668), refatoração do renderer
  nativo que pede a bancada para validar — frente do render.
- **`RenderServer._prepare`** cria `{ calls, shared: sharedHandles(...) }` (objeto + array) por estado de shader por
  quadro, porque `info.calls` muda todo quadro. Reaproveitar o objeto e o array resolve. `RenderServer.ts` tem 655
  linhas: mesma razão.
- **`CharacterPhysicsSystem`** copia `getInstances()` da vegetação sólida na coleta de troncos; `instanceData` (acima)
  serve sem cópia. Arquivo de outra frente.
- O resto dos ~6 MB por quadro que não é desta consulta precisa da sonda por seção do nativo (SPEC-0357 §1) para
  atribuir — a sessão principal mede tudo junto.

## Consequências

- Quadro sem mudança de estrutura do ECS não aloca na consulta; sistema que mutar o array recebido quebra os outros
  (contrato no TSDoc).
- `Vegetation` ganha quatro membros públicos; o comportamento antigo fica igual. Escrita por faixa deixa a esfera de
  culling maior que o necessário até a próxima escrita inteira (culling conservador, nunca some).
- No Studio as cascatas distantes do CSM atrasam até 1 quadro (default 2) para objeto em movimento.
