# SPEC-0585 — R1.6: renderer próprio dono da pass + pré-compilação (+ buffer único)

**Data:** 2026-10-25
**Status:** proposta. Etapa R1.6 do PRD-0466 (ADR-0465). Base: SPEC-0495 (núcleo), SPEC-0555 (R1.4),
SPEC-0545 (sombra C++), SPEC-0575 (buffer único, estudo).

Critério da etapa (PRD-0466): **0 pipelines criados por quadro em regime; nenhum quadro > 50 ms causado
por pipeline na 1ª volta.** E o R1.6 prepara o aceite do R1: render ≤ 5 ms (hoje 8,3–8,6 ms, abaixo).

## Diagnóstico (2026-10-25, DDD 61 `f10877e`, engine `05fec1a7`, Comercial, `walk`, 1080p, 1 réplica)

Rodadas em `D:/jogos/detetive-brasilia/.cortex/stages/r16-diag/` (script de diagnóstico, uma por braço):

| braço | render (`cpuAvg`) | frameMs med/p95/p99 | > 33 ms | draws | `rpEach` (laço por objeto do three) | `napiWb`/quadro |
| --- | --- | --- | --- | --- | --- | --- |
| three (`renderPhases=2`) | 12,53 | 25,9 / 34,4 / 37,6 | 10% | 165 | 5,92 ms, 100 objetos | 184 |
| nativo (`renderPhases=2`) | 8,15 | 22,6 / 30,2 / 42,1 | 3% | 147 | 2,22 ms, 34 objetos | 76 |
| nativo (sem sonda) | **8,39** | 22,7 / 31,5 / 35,2 | 2% | 147 | — | 75 |

- **Recusas:** 0 da engine e do jogo (só o `skip` da colisão). O nativo toma ~117 instâncias por
  quadro (`[renderServer] taken`/`emissions`).
- **Pipelines depois do aquecimento:** o `game.precompile()` do DDD 61 leva 15,96 s e nasce 77
  pipelines (evento `precompile` do trace). Mesmo assim, em jogo, os **pipelines nativos crescem de 37
  para 46** (`[nativeRenderer] pipelines=`) e o contador do host (`born.pipelines`) de 124 para 130.
  No braço three ele fica parado em 84. Ou seja, o aquecimento não passa pelo caminho nativo inteiro,
  e o critério "0 pipelines por quadro em regime" **falha hoje**. Ainda não se sabe quanto cada um
  custa no quadro: falta o instrumento (abaixo).
- **Onde está o render que sobra (8,4 ms):** a sonda explica ~2,9 ms (`rpEach` 2,2 + `rpMatrix` 0,37
  + `rpProject` 0,2 + `rpObjects` 0,07). O resto (~5,5 ms) fica fora das fases embrulhadas: o `render()`
  do three por chamada, o pós (`postfx`), fundo e sombra, a emissão e o replay do lote C++ e o JS por
  instância do nativo (`take` + `_refreshInstance`, que comparam 16 floats por instância por quadro).
  A divisão exata é a 1ª tarefa da frente "dono da pass" (fase 0 abaixo), **medida sem sonda nos
  deltas** (armadilha 4 da sonda de fases: ela amplifica o que embrulha).

## Como o Godot faz (clone 4.7.2 `ed1daf0b`; anexo `docs/prds/0466-anexos/godot-renderer-rd.md` §4, §5, §8)

- **Dono do quadro:** `RenderForwardClustered::_render_scene` (`render_forward_clustered.cpp:1704`)
  monta e ordena as listas e preenche os instance buffers uma vez (`:1913-1921`), desenha opaco
  (`:2188-2224`), sky depois do opaco com depth test (`:2297-2302`) e transparente (`:2411-2426`), e
  termina no pós + tonemap (`_render_buffers_post_process_and_tonemap`, `renderer_scene_render_rd.cpp:455`;
  tonemap + `linear_to_srgb` num único passe, `shaders/effects/tonemap.glsl:854`, `:230`). Não há uma
  segunda engine percorrendo a cena: o servidor de cena entrega as instâncias visíveis, e o renderer só
  itera listas.
- **Pré-compilação:** `_mesh_compile_pipeline_for_surface` (`render_forward_clustered.cpp:4657-4665`)
  compila as pipelines quando a malha/material **é carregada**, antes do 1º desenho; a compilação vai
  para worker (`pipeline_hash_map_rd.h:151-152`) e `get_pipeline(..., wait=false)` devolve vazio se não
  está pronta (`:179-195`).
- **Ubershader:** no desenho, tenta a pipeline especializada sem esperar; se vier vazia, usa a do
  **ubershader** (o mesmo código-fonte, com as constantes de especialização lidas de push constant,
  `scene_forward_clustered_inc.glsl:26-73`; `render_forward_clustered.cpp:496-534`, `:587-596`).
  Resultado: nenhum quadro espera compilação; ele paga algum custo de GPU enquanto o ubershader está ativo.

## Como fazemos hoje

- **Pass:** o `Game` chama `postfx.render()` (ou `renderer.render`), e o three percorre a cena:
  projeção (em C++ via `NativeMainProjection`), lista, fundo, sombra, laço por objeto. O RS1
  (`RenderServer`) **oferece** as instâncias ao nativo dentro desse laço, e o nativo emite comandos no
  lote C++. O nativo tem custo de JS **por instância por quadro** (`take`, `_refreshInstance`), e o three
  ainda gasta 2,2 ms no laço com 34 objetos (pós, fundo, UI de cena, o que fica fora do RS1).
- **Pipelines nativos:** criados preguiçosamente em `recipeFor` → `_pipeline` (`NativeRenderer.ts`,
  `createShaderModule` + `createRenderPipeline` **síncronos**). O `createRenderPipelineAsync` do host só
  embrulha a chamada síncrona numa promise resolvida (`native/src/webgpu/pipeline.cpp:301-304`).
  Variante = WGSL gerado por (modelo, features, núcleo); o shim descarta `constants`, então não há
  `override` (SPEC-0495).
- **Aquecimento:** `game.precompile()` desenha um quadro com tudo visível e sem culling pelo caminho
  do jogo (ADR-0262). Os pipelines nativos que nascem depois vêm de objetos ou variantes que esse
  quadro não ofereceu ao nativo (a investigar: multidão, carros que chegam, `doubleSide`/transparente
  em 2 passes, skinned, instância que muda `instanceColor`).

## Validação de aplicabilidade

- **Pré-compilação no load = o que já existe, mas passando pelo nativo.** Antes de qualquer
  ubershader: (1) instrumento que registra cada pipeline nativo nascido (chave, quadro, ms da criação);
  (2) o quadro de aquecimento faz `take` + `recipeFor` de **toda** instância elegível, inclusive as que
  o RS1 não ofereceria naquele quadro, e das variantes previsíveis (os 2 passes do transparente de duas
  faces, skinned); (3) os `NativeModelDef` registrados pelo jogo (`registerNativeMaterial`) também
  pré-compilam. Isso cobre o caso "a variante existe na cena no load", que é o do DDD 61.
- **Compilação em worker:** o `wgpuDeviceCreateRenderPipeline` do wgpu-native pode ser chamado de outra
  thread (o `Device` é `Send + Sync`), mas o shim cria no thread do JS. Um `createRenderPipelineAsync`
  real (thread C++ + fila + resolução da promise no próximo tick) é a peça que permite "não esperar".
  **Só entra se o instrumento mostrar pipeline nascendo em jogo depois da pré-compilação**, com custo
  acima de um quadro.
- **Ubershader:** o equivalente WGSL é o mesmo código gerado com as features lidas de um uniform (no
  lugar dos `if` resolvidos na geração). Custo: um gerador a mais por modelo, mais GPU enquanto ativo, e
  paridade a provar para cada modelo. **Só entra se a pré-compilação + worker não zerarem o critério**
  (uma variante que realmente não dá para prever no load). Pelo diagnóstico, não há indício disso.
- **Dono da pass:** o three continua dono do alvo, do pós (`outputColorTransform`, bloom/mood do
  `postfx`) e da UI até o R2. "Dono da pass" no R1.6 é: **a cena espelhada não é percorrida pelo three**.
  O nativo mantém a lista persistente das suas instâncias (o espelho já sabe quem mexeu, SPEC-0234/0322),
  emite tudo num bloco no ponto do RS1 e tira o JS por instância limpa. O three recebe uma cena só com
  o que é dele (fundo, pós, o `skip`).
  **Validar na fase 0:** quanto dos ~5,5 ms fora das fases é JS por instância do nativo, quanto é o
  `render()` do three por chamada e quanto é o pós. Sem essa divisão, a frente não muda código.
- **Hermes:** nada de `for…of` em `Map` nem closure de laço no caminho por quadro (B1, SPEC-0357).

## Desenho (por parte; cada uma com interruptor próprio, desligada até o aceite)

### Parte 1 — pré-compilação do nativo (critério de pipelines)

1. **Instrumento:** `stats.pipelineMs` (soma) e um evento por nascimento depois do `precompile`
   (`[nativeRenderer] pipeline born <codeKey> <ms>` no `debug('perf')`, e `nativePipelinesBorn` no
   perf-trace). Teste: um nascimento depois do aquecimento aparece no evento.
2. **Aquecimento pelo nativo:** no quadro do `precompile`, o nativo cria a receita de toda instância
   elegível da cena (não só as oferecidas), mais as variantes previsíveis (passes do `doubleSide`
   transparente, skinned) e os modelos do jogo registrados.
3. **Medir de novo:** 0 nascimentos em regime (2 réplicas, 4 pontos + drive). Sobrou nascimento → o
   evento diz qual; se não der para prever no load → Parte 1b (`createRenderPipelineAsync` real em
   thread C++, e o draw daquele objeto fica no three, ou fora do quadro, até a pipeline ficar pronta).
   Ubershader só se a 1b não bastar. **Cada passo depende do resultado medido do anterior.**

#### P1 — como ficou (Frente C)

**Instrumento (passo 1).** `_pipeline` cronometra módulo + pipeline: `stats.pipelineMs`, linha
`[nativeRenderer] pipeline born frame=<n> <chave> <ms>` no `debug('perf')` e fila de módulo
(`recordNativePipelineBirth`, `PipelineBirthLog.ts`, teto de 256 sem trace) que o `PerfTrace` drena como
`nativePipelinesBorn` (mesmo formato do `pipelinesBorn` do three: objeto, material, ms, chave).

**Os nascimentos em jogo** (`p1-born`, f10877e, Comercial `walk`, `unlit,lambert,standard,wgsl`, 135 s). O
aquecimento cria 34 pipelines nos quadros 1–2 (1,23 s). Depois nascem **12** (os "9" do diagnóstico eram
37→46 entre relatórios; 3 nascem no quadro 75, antes do 1º relatório), ~227 ms no total:

| quadro | objeto | modelo / variante | ms |
| --- | --- | --- | --- |
| 75 | `interiores-lanchonete` | standard `map+emissiveMap+fog+doubleSide` | 2,4 |
| 75 | `steering` (moto) | standard `map+fog` | 69,2 |
| 75 | `floor_1` (moto) | standard `fog` | 74,4 |
| 429 | `marcador-trabalho` (2 passes) | unlit `fog+alpha` aditivo duas faces | 9,3 |
| 469 | `morador-rua-*` | lambert `fog` | 30,4 |
| 664 | `tiro-capsula`, `tiro-brilho`, `tiro-tracante`, `tiro-marca` | unlit (pools instanciados) | 33,6 |
| 725 | `farois-lentes` | unlit `instanceColor` | 6,7 |
| 3052 | `ceu` | unlit `map+alpha` aditivo | 1,4 |

O quadro 75 sozinho gasta 146 ms: o critério "nenhum quadro > 50 ms por pipeline" falha hoje.

**Por que o aquecimento não os viu (medido).** O quadro de aquecimento **não passava pelo nativo**: o
`[nativeRenderer] precompile` registrou `frame=0`. O espelho de cena e a projeção em C++ só se instalam
no 1º tick do loop (`Game.ts`, SPEC-0234), e o DDD 61 chama `game.precompile()` **antes** do
`game.start()`. O quadro saía todo pelo three, e só ele aquecia (77 pipelines). Os 34 pipelines nativos
dos quadros 1–2 já eram quadros de jogo (escondidos pelo `revealWhenSmooth` do jogo). Os 12 seguintes
eram o que esses quadros não desenharam: pools escondidos (tiros, marcador), moto, faróis, o sol do céu.

**Aquecimento pelo nativo (passo 2).** Atrás de `?nativePrecompile=1` (desligado até o aceite):
1. `precompile()` com o loop parado instala o espelho e a projeção (`_installSceneMirror`, o mesmo bloco
   do tick, extraído) e atualiza o espelho antes do quadro: o aquecimento passa pela projeção em C++,
   pelo RS1 e pelo nativo.
2. Depois do `draw()`, `precompileNative(root, camera)` percorre a cena **inteira** (visível ou não) e
   faz `take` + `recipeFor` de todos os passes de cada malha elegível (material único e visível, na
   camada da câmera), com o contexto de render do passe principal que acabou de rodar. Cobre o que a
   projeção não oferece (pool com `visible=false`, fora da vista). O número entra no evento
   `precompile` como `nativeBorn`.

Efeito colateral: a varredura chama `take` em malhas que o jogo nunca chega a oferecer. As recusas
delas entram no `refused` do relatório (`p1-warm3`: 25 em vez de 1; `skip=20`, `variant:standard=3`,
`depth=1`, `variant:lambert=1`). Não muda o que é desenhado, porque a recusa por objeto é a mesma que
haveria na oferta.

**Correção na integração (2026-10-25):** as recusas do aquecimento ficavam em cache em `_byObject`, e o
`take` com cache devolve a recusa **sem contar**. Uma malha escondida no load, revelada pelo quadro de
aquecimento e oferecida de verdade depois, sumia do relatório, e o critério de 0 recusas deixava de
enxergá-la. As 25 vinham do **quadro** de aquecimento (que agora passa pelo nativo com tudo revelado), não
da varredura (`r16-int-p1b`: varredura com 0 recusas). Agora o aquecimento inteiro (quadro + varredura)
roda dentro de `NativeRenderer.warmup`: as recusas são contadas à parte (linha `[nativeRenderer] warm-up
refused=<n> | <motivos>`) e **não ficam em cache**. Quando a malha é oferecida de verdade, ela é
classificada de novo e entra no `refused` normal, que volta a ser só do que é oferecido para desenho.

**Medido (passo 3, `p1-warm3`, f10877e, Comercial `walk`, `unlit,lambert,standard,wgsl`, 135 s):**

| | sem (`p1-born`) | com `nativePrecompile=1` (`p1-warm3`) |
| --- | --- | --- |
| `precompile` (ms) | 16 634 | **7 801** |
| pipelines do three no aquecimento | 77 | 14 |
| pipelines nativos no aquecimento | 0 | **57** (44 pela projeção + 13 pela varredura) |
| pipelines nativos nascidos em jogo | 46 (34 nos quadros 1–2 + 12) | **0** |
| `born.pipelines` do host, 1ª → última amostra | 118 → 130 | **78 → 78** |

Nascimentos em regime, mesmo export do check-stage (`p1-precompile/births`), 2 réplicas × Setor O e
Comercial × dia e noite em `walk`, mais Comercial `drive`: **0 nativos depois do aquecimento nas 10
rodadas**, e o `born.pipelines` do host não se mexe do início ao fim (78 de dia, 69 à noite). Sem
nascimento em jogo, nenhum quadro pode passar de 50 ms por pipeline.

Paridade (`check-stage p1-precompile`, `unlit,lambert,standard,wgsl&nativePrecompile=1`): galeria PASS
0/0, Setor O dia PASS (0,0002%), noite PASS, Comercial dia e noite PASS 0/0, fumaça PASS. `nativeTint=1` na
galeria: FAIL (alt 28, 65,8%).

A/B intercalado (`ab` + `ab2`, Comercial `walk`, mesmo export; 5 rodadas válidas de cada braço): render
igual dentro do ruído (lote `ab2`: 10,01 → 10,15 ms; o B-r1 do `ab` saiu lento por inteiro, `world` também,
carga da máquina). O GC jovem cai de ~40 para ~12 ms/s em todas as rodadas com o interruptor, sem causa
explicada (backlog do PRD-0466).

O `precompile` cai à metade porque o nativo assume a maior parte da cena e o three compila menos. Sem
nascimento imprevisível em jogo, a 1b (`createRenderPipelineAsync` em thread C++) e o ubershader **não
entram**.

#### P1 — oclusor só de profundidade (`colorWrite=false`)

Depois da P1, o único objeto que o three ainda desenhava na cena era o `skip`: `static-merged-11`, um
`MeshBasicMaterial` com `colorWrite=false` (oclusor que só escreve profundidade, ~0,35 ms). O classificador
o marcava como `skip`, e o nativo o recusava.

**Desenho.** O classificador cobre `colorWrite=false` com o modelo do tipo do material e a feature de
núcleo `noColorWrite` (não chega ao modelo). No `drawState`, ela vira `writeMask: 0` no alvo de cor e entra
na chave de estado. É o que o `WebGPUPipelineUtils` do three faz (`colorWrite ? All : None`): o fragment
shader roda, a profundidade é escrita e a cor não. A ordem é a do three: é um opaco, vai para a fase
opaca com a mesma chave de ordenação do RS1. O `skip` continua no tipo e no censo (os scripts leem o
campo), mas o classificador não o devolve mais: o censo conta `skip=0`. Interruptor de desligar para A/B:
`?nativeDepthOnly=0` devolve o oclusor ao three (recusa `skip`, como antes).

**Medido** (`p1-depth`, f10877e, `unlit,lambert,standard,wgsl&nativePrecompile=1`):
- check-stage PASS 0/0 em todos os pontos (galeria, Setor O e Comercial, dia e noite), fumaça PASS (render
  9,22); `nativeTint=1` na galeria FAIL (alt 28, 65,8%).
- Censo (`rendererCensus=1`, Comercial): `objects=125 covered=125 refused=0 skip=0`. O relatório do nativo
  fica com `refused=0` (antes 25 com a varredura do `precompile`, 20 deles `skip`).
- A/B intercalado Comercial `walk`, `nativeDepthOnly=0` × padrão, mesmo export. Lote `ab2` (máquina
  quieta, 3 + 3): render 8,54 → **8,26 ms (−0,28)**, faixas sem sobreposição (A 8,41–8,74 × B 8,18–8,33),
  draws iguais (146,7). Lote `ab` (ruidoso, 3 + 2): −1,17 ms. O ganho bate com os ~0,35 ms que o three
  gastava no oclusor e fica acima do ruído: **a mudança fica**.

### Parte 2 — dono da pass (critério de render)

0. **Fase 0, medir:** dividir o render nativo (8,4 ms) em: JS por instância do nativo, `render()` do
   three por chamada, pós, fundo/sombra, emissão + replay. Instrumento com cronômetro em volta de cada
   bloco (um campo `cpu.native*` por bloco), validado num caso de resposta conhecida (um bloco com
   espera artificial aparece no campo certo). Medir os deltas sem a sonda de fases.
1. **Lista persistente:** o nativo guarda as instâncias tomadas e só toca as sujas que o espelho
   reporta (sem `take` + comparação de matriz por instância por quadro).
2. **Cena do three sem os espelhados:** o three deixa de percorrer os objetos 3D que o nativo cobre
   (máscara de layer ou cena paralela: a escolha fica para a fase 0, conforme o que pesar).
3. **Paridade:** check-stage PASS (o nativo continua emitindo no mesmo ponto), tint FAIL.

### Parte 3 — dados por objeto num buffer único (SPEC-0575)

Como na SPEC-0575: sonda de pixel do `firstInstance` no D3D12 antes do código, A/B
`?nativeObjects=ubo|storage`, e fica só se ganhar.

## Frentes (dependências e arquivos)

| frente | o quê | arquivos próprios | depende de |
| --- | --- | --- | --- |
| **P1 pré-compilação** | Parte 1 (instrumento → aquecimento pelo nativo → 1b/ubershader só se preciso) | seção de pipelines do `NativeRenderer.ts` (`_pipeline`, novos `precompile*`), `src/core/Game.ts` (`precompile`), `native/src/webgpu/pipeline.cpp` só na 1b | nada |
| **P2 dono da pass** | Parte 2 (fase 0 → lista persistente → cena do three sem espelhados) | `src/render/RenderServer.ts`, `NativeMainProjection.ts`, `CleanDrawFastPath.ts`, seção de instâncias do `NativeRenderer.ts` (`take`, `_refreshInstance`) | nada (a fase 0 é só medição) |
| **P3 buffer único** | Parte 3 (SPEC-0575) | grupo 3 + `coreWgsl` (`NativeModel.ts`), `DrawBatch.ts`, `native/src/render/draw_batch.*` | **P2** (as duas mexem na emissão e no estado por instância; P3 entra sobre a lista persistente) |

P1 e P2 rodam em paralelo (seções diferentes do `NativeRenderer.ts`, conflito trivial no merge). P3
espera a P2 e só fica se o A/B ganhar.

## Testes

- P1: evento de nascimento depois do aquecimento; aquecimento cria a receita de instância não oferecida
  e dos 2 passes do `doubleSide` transparente (Vitest com o host falso do `NativeRenderer.test.ts`).
- P2: lista persistente só toca sujos (contador); cena do three sem espelhados mantém o `skip`.
- Paridade de todas: `check-stage` PASS (`unlit,lambert,standard,wgsl`) + `nativeTint` FAIL.

## Critério de aceite do R1.6

- 0 pipelines nativos nascidos em regime (instrumento da P1), 2 réplicas, 4 pontos `walk` + `drive`.
- Nenhum quadro > 50 ms com nascimento de pipeline na 1ª volta (mesmo instrumento cruzado com `frameMs`).
- P2: render nativo cai na proporção medida na fase 0; o render ≤ 5 ms é do aceite do R1, não da etapa.
- P3: só com ganho no A/B (SPEC-0575).

## Fase 0 da Parte 2 — medida (2026-10-25, Frente A)

Instrumento: seções do `FrameProfiler` aninhadas em `render` (`src/render/RenderSections.ts`):
`sceneRender` (cada `renderer.render` da cena espelhada), `nativeProject` (projeção inteira) com
`nativeCull` (a parte C++) dentro, e `nativeEmit` (emissão + replay). O laço JS por instância é
`nativeProject − nativeCull`; o trabalho do three é `sceneRender − nativeProject − nativeEmit`; pós e
resto é `render − mirror − sceneRender`. Resumo de uma linha: `native/scripts/perf/render-sections.sh`
(mesma janela do kit, `t ≥ 30 s`).

**Validação (resposta conhecida):** `?renderSectionSpin=<seção>` espera 2 ms dentro da seção; cada uma
sobe só no próprio bloco: `sceneRender` → three +2,3; `nativeProject` → laço JS +2,2; `nativeCull` →
cull +2,0; `nativeEmit` → emissão +6,1 (≈3 chamadas por quadro × 2 ms).

**Divisão** (DDD 61 `f10877e`, Comercial, `walk`, 1080p, `unlit,lambert,standard,wgsl`; render 8,39 ms,
igual ao `validate.sh`):

| bloco | ms/quadro |
| --- | --- |
| espelho (`mirror`) | 1,14 |
| laço JS por instância (ofertas + `take` + `_refreshInstance`) | **2,38** |
| cull C++ | ~0,00 |
| emissão + replay | 0,55 |
| trabalho do three com a cena espelhada (listas, sombra, fundo, objetos dele) | **3,33** |
| pós e resto | 0,99 |

Alvos da Parte 2: o laço JS (passo 1, lista persistente) e o trabalho do three com a cena espelhada
(passo 2), ~5,7 ms no total.

### Passo 1 — onde está o custo do laço JS (rodadas de teto, instrumentação temporária, fora do commit)

Cronômetros temporários em volta de `take` (no `offerNative`), de `server.offer` e do teste de
frustum/z do JS, e interruptores que desligam um pedaço do `_refreshInstance` (só para medir; a
imagem fica errada). ~119 `take` por quadro, 123 candidatos.

| rodada | `take` (ms/quadro) | leitura |
| --- | --- | --- |
| completo | 1,97 | ≈16 µs por `take` |
| sem comparar a matriz | 1,97 | a comparação de 16 floats não pesa |
| sem geometria/`_drawParameters` | 1,61 | geometria ≈0,36 |
| sem `_refreshMaterial` | 1,20 | **material ≈0,77** |

O resto do laço (≈0,4 ms) é `offer` (classificação, ordem) e o frustum do JS (0,20).

Dentro do material (rodada com seções temporárias; máquina carregada, render 12,5 ms, vale a
proporção): ~78 materiais e ~125 instâncias por quadro; checagem de textura **0,58** ms, `writeParams`
0,32 ms.

**1a — textura do material só quando a versão muda.** Hoje `_refreshMaterial` chama, por
textura e por quadro, `Textures.updateTexture` e `Textures.updateSampler` do three (o segundo monta
uma string de chave a cada chamada, `WebGPUTextureUtils.updateSampler`, e isso aloca no Hermes) e
`backend.get`. O three só faz isso quando o binding vê a versão da textura mudar. Passamos a guardar
`texture.version` por textura no `MatState`; com a versão igual, a textura é pulada sem chamada
nenhuma. A exceção é a textura de render target, que o three recria no redimensionamento sem mudar
a versão: ela continua checada a cada quadro. Uma primeira versão, que ainda comparava a
identidade da textura GPU por quadro (`backend.get`), não teve ganho visível numa rodada solta
(laço JS 2,42 contra 2,38, com a máquina carregada) e foi trocada por esta. A troca de sampler sem
`needsUpdate` já não refazia o grupo antes, e isso não muda. `writeParams` continua por quadro: o
three não avisa quando uma cor muda, então comparar o bloco é o único rastreio de sujos possível.

A/B intercalado (`ab.sh`, Comercial, `walk`, 2 réplicas; A = base da fase 0, B = 1a; máquina com
outra sessão, absolutos ~20% acima da fase 0, vale a diferença):

| métrica | A | B | Δ |
| --- | --- | --- | --- |
| render | 10,35 | 8,96 | **−1,39** |
| laço JS | 2,87 | 2,25 | −0,62 |
| three com a cena espelhada | 4,25 | 3,74 | −0,51 (menos GC) |
| GC (KB/quadro) | 1003 | 849 | −154 (as chaves do `updateSampler`) |
| frameMs p99 | 73,4 | 54,8 | −18,6 |

### Passo 2 — o que é o "trabalho do three com a cena espelhada" (medido, 2026-10-25)

Instrumentação temporária (fora do commit) dentro do `render` da cena espelhada, DDD 61 `f10877e`,
Comercial, `walk`, 1080p, já com o 1a (render ~8,2 ms):

| fatia (ms/quadro) | |
| --- | --- |
| `sceneRef.onBeforeRender` do **jogo** (`figureBatch`, `peopleBatch`, `playerSkin`: cópia das matrizes dos bonecos para os lotes instanciados), antes da projeção | **~1,7–2,0** |
| `backend.finishRender` (fim da pass e submit; custo do wgpu) | 0,87–1,17 |
| `_renderOutput` (quad de Output Color Transform) | 0,42 |
| draws do three na cena espelhada (**1 objeto**, `static-merged-11`) | 0,35 |
| `beginProjection` (blocos de luz/sombra do `beginFrame`) | 0,26 |
| `backend.beginRender` | 0,11 |
| fundo, listas, ordenação, render target | ~0 |

Como chegamos lá: as chamadas do `_renderScene` antes da projeção (`setRenderTarget`,
`_renderContexts.get`, `getDrawingBufferSize`, `_getFrameBufferTarget`, `camera.updateMatrixWorld`,
`inspector`) deram ~0, e o `matrixFreeze` não mudou o intervalo (não é a travessia de matrizes). A
distribuição do intervalo (mediana ~1 ms por render, GC em ~2,5% dos renders) descartou GC. O que
restava no trecho era o `onBeforeRender` da cena, onde o jogo pendura os três lotes.

Os outros ~33 `renderObject` por quadro do three são de outras cenas (UI e pós), fora do `sceneRender`.
O passe de sombra do sol (C++, Frente B) desenha sob demanda, com o gatilho do `SunShadow` do jogo.

**Consequência para a Parte 2:** tirar a cena espelhada do three economiza só o preparo dele
(~0,5 ms: draw de 1 objeto e `beginRender`). `finishRender` e o pós continuam necessários com
qualquer dono da pass. O grosso restante é do jogo (lotes de bonecos no `onBeforeRender`, ~1,8 ms) e
do laço JS por instância (~2,1 ms). A meta de ≤ 5 ms só com o renderer não fecha: precisa de um item
no jogo (lotes de pessoas) ou de levar a cópia dos lotes ao espelho C++.

**Decisão da coordenação (2026-10-25):** o `finishRender` e o pós (~1,3–1,6 ms) ficam com qualquer dono
da pass, então a meta de ≤ 5 ms depende do item A (laço JS, esta frente) somado ao C (o
`onBeforeRender` do jogo, aberto na Frente D). O passo 2 continua no plano por ser pré-requisito do
dono da pass, do R2 e do R4, mesmo rendendo ~0,5 ms.

### Passo 1b — estado persistente por slot do espelho (item A)

No modelo do Godot, o servidor guarda a instância e o cliente manda só o delta. Aqui o cull C++ já
devolve o **slot** do nó no espelho. O `take` recebe esse slot (`offer`/`offerNative` repassam) e acha
a instância num array por slot, conferindo `inst.object === object`. Isso tira a busca no `WeakMap`
de cada candidato, a cada quadro. Sem slot (fora da projeção nativa), o `WeakMap` continua valendo.
A checagem de identidade e de versões (material, geometria, `material.version`, `instanceColor`)
não muda, nem a paridade.

A geometria passa a ser atualizada uma vez por quadro (`GeoState.frame`), como o material já é. Uma
geometria compartilhada por N instâncias deixa de ter as versões dos atributos comparadas N vezes.

Medição: A/B intercalado contra o 1a (laço JS e render). Sem ganho acima do ruído, o item sai.

**Resultado: saiu.** No A/B (Comercial, `walk`, 2 réplicas), o laço JS ficou em 2,175 ms com o 1a e
2,165 com o 1b, dentro do ruído. O render caiu 0,25 ms, mas no three e no world, que o 1b não toca.
Nem a busca no `WeakMap` nem a geometria repetida pesam. O custo é o trabalho por candidato em si:
classificar, material do quadro, versões, parâmetros de draw, matriz e as 10 listas do `_push`.

**O que sobra para o item A** é passar a lista ao C++. O espelho já sabe quem se moveu e quem está
visível, então o C++ guarda as instâncias aceitas (receita, slot, chave de ordem) e monta os comandos.
O JS fica só com o que o three não notifica: os parâmetros de cada material único (~78 por quadro) e
as versões de cada geometria única, uma vez por quadro, mais as trocas de material/geometria/
visibilidade como delta. É uma mudança de desenho (lista e ordenação em C++, `draw_batch` alimentado
pelo cull), não um ajuste do `take`.

### Plano B do item A — lista de instâncias em C++ (só se A + C não fecharem a meta)

Entra só se, depois do passo 2 e da correção da Frente D (lotes de bonecos no `onBeforeRender`), a
medição mostrar render > 5 ms. Vem com ADR e com a confirmação do usuário (são vários dias).

**Desenho.** O C++ passa a guardar a lista de instâncias aceitas pelo nativo, indexada pelo slot do
espelho: receita por passe, `count`/`first`/instâncias, slot do bloco do objeto, `renderOrder`,
material (id) e a flag de transparente. O cull (`project`) já percorre os nós visíveis. Para quem tem
entrada na lista, ele calcula o `z` e a chave de ordem do three (`groupOrder`, `renderOrder`, `z`, `id`;
o transparente, por `z` invertido) e monta os comandos do `draw_batch` direto, sem voltar ao JS. A
matriz do bloco do objeto é escrita no C++ quando o espelho marca o nó como sujo
(`changedThisFrame`, `scene_mirror.h:433`), e a matriz normal é calculada lá, em double. O JS recebe
só: (1) os candidatos **sem** entrada (novos, recusados ou do three) para o caminho de hoje; (2) uma
vez por quadro, os ~78 materiais únicos (`writeParams` e comparação, versões de textura) e as
geometrias únicas (versões dos atributos, `drawRange`, `instanceCount`); (3) os eventos que invalidam
uma entrada (troca de material/geometria, `material.version`, `instanceColor`, `removed`, recriação
de receita por mudança de grupo), que a apagam no C++. Skinned e `InstancedMesh` continuam no
caminho JS (ossos e `count` por quadro) até medir que pesam.

**Paridade.** A ordem do three é total (a chave acima, `painterSortStable`), então a mesma chave
calculada no C++ dá a mesma sequência de draws. O ponto de emissão (`emitBefore` intercalado com a
lista do three) fica igual. Os riscos são o `z` em float (o three usa o `z` do `Vector4` em double e
compara em double; o C++ também em double) e as entradas transparentes de duas faces (2 passes).

**Estimativa.** Hoje: laço JS ~2,1 ms + emissão 0,56. Fica no JS: materiais (~0,3) e geometrias (~0,2,
uma vez cada), mais os candidatos fora da lista (~10%). Ganho esperado de ~1,3 a 1,6 ms. Custo: ~3 a 5
dias, entre C++ (lista, chave, escrita de matriz), ponte, JS e testes (Vitest e `cortex_host_tests`),
com A/B e check-stage em cada fase.

### Passo 2 — situação (2026-10-25)

A `NativeMainProjection` já tira a cena espelhada do three no sentido do desenho. A travessia, a
visibilidade e o culling estão em C++; o three não chama `_projectObject` na árvore e não desenha
nenhum objeto que o nativo cubra. Na cena espelhada, ele desenha só o `skip` (`static-merged-11`,
`colorWrite=false`, oclusor só de profundidade, 0,35 ms; o desenho acima deixa o `skip` com o three) e
recebe as luzes pela `pushLight`. O que sobra do "three com a cena espelhada" é o preparo e o
fechamento da pass (`beginRender` 0,11, `finishRender` ~0,9–1,2, pós 0,42), que ficam com qualquer
dono da pass enquanto o three for dono do alvo (até o R2). Também há o `onBeforeRender` do jogo,
item C. Levar o `skip` ao nativo (pipeline com `writeMask: 0`) exigiria mexer na seção de pipelines,
que é da P1, e renderia ≤ 0,35 ms.
