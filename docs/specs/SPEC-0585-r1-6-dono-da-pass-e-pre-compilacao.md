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
