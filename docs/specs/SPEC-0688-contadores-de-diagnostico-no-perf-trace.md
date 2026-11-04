# SPEC-0688 — Contadores de diagnóstico no perf-trace (item 5.0 do plano de desempenho)

**Data:** 2026-11-04
**Status:** implementado
**Base:** SPEC-0198 (perf-trace), SPEC-0225 (contadores da ponte NAPI), SPEC-0236 (perfil por sistema),
SPEC-0357 (`gc.allocatedMB`), SPEC-0545 (sombra do sol nativa), SPEC-0616 (UI nativa)

## Contexto

O item 5.0 do plano de desempenho pede medição antes de qualquer corte novo. Cinco perguntas não têm resposta no
`perf-trace.jsonl` de hoje:

1. **Sombra do sol nativa.** O `NativeSunShadowPass` devolve o mapa ao three quando recusa (sem espelho, portão do
   passe, objeto ofensor). O motivo só aparece no `debug('perf')`, e o objeto ofensor (`r.offender`) é descartado.
2. **RenderServer.** `stats.fallback`, `stats.refused` e `stats.fbEnv` são acumulados que só saem num log a cada
   N projeções; as recusas do `NativeRenderer` (`_refusals`) idem.
3. **UI.** Não se sabe quantas vezes por janela cada texto ou canvas da UI é reenviado à GPU, nem qual widget
   reenvia.
4. **Alocação por sistema.** O `cpu.sys*` diz quanto tempo cada sistema do ECS gasta, mas não quanto lixo ele gera.
5. **setBindGroup.** `cpu.napiBind` soma as chamadas do JS (`commands.cpp`) e as do replay em C++ do draw batch
   (`draw_batch_shim.cpp`). Não dá para saber quanto o replay já tirou do JS.

É só medição: nenhum caminho de render, física ou UI muda de comportamento.

## Decisão

### Módulo de contadores (`src/core/perfTrace/traceCounters.ts`)

Um módulo sem dependência que as fontes alimentam e que o `PerfTrace` drena a cada amostra (500 ms). Fica ativo
**só quando o host registrou a ponte do trace** (`globalThis.__cortexPerfTrace`): o `PerfTrace` liga no construtor.
Inativo, toda função de registro retorna na primeira linha, então o custo fora do trace é uma comparação. Não
depende de `cortexDebug=perf`.

- `Tally`: contagem por chave na janela; `drain(limit)` devolve o total e as `limit` chaves maiores, e zera.
- Top-N dos campos novos: `TRACE_TOP = 5`.

Os campos entram na amostra só quando têm o que dizer (mesma regra de `born`/`gc`).

### 1. `sunShadow` — recusas da sombra do sol nativa

O `NativeSunShadowPass` registra cada `update` que redesenhou (`drawn`) ou devolveu o mapa (`handedBack`). Na
recusa, além da string de hoje (que segue indo para o `debug`), registra as partes separadas: `reason`, `counts` e
`r.offender`.

```json
"sunShadow": { "drawn": 0, "handedBack": 30, "reason": "divergente", "counts": "casters=812 nodes=9400",
               "offender": { "name": "poste_07", "id": 4182, "node": "rua-3" } }
```

| Campo | Significado |
|---|---|
| `drawn` | Redesenhos que o passe C++ fez na janela. |
| `handedBack` | Vezes que o passe devolveu o mapa ao three na janela (o three redesenhou). |
| `reason` | Motivo da ÚLTIMA recusa da janela: `sem-espelho`, `sem-mapa`, `alvo-sem-gpu`, `sem-ponte` ou o `reason` do portão C++. Ausente sem recusa. |
| `counts` | Os `counts` do portão nessa recusa, quando vieram. |
| `offender` | O objeto ofensor da recusa: `name` (do three), `id` (`Object3D.id`) e `node` (id do nó de cena que o contém, como em `visible`). Ausente quando o portão não apontou um. |

Ausente quando o passe não rodou na janela.

### 2. `renderServer` — fallback, recusas e motivos do NativeRenderer

O `RenderServer` registra o próprio `stats` ao nascer (o último registrado vale; há um por renderer). A amostra
publica o **delta na janela** de três acumulados. O `NativeRenderer` registra cada recusa no mesmo ponto em que soma
no `_refusals` (fora do aquecimento, como hoje).

```json
"renderServer": { "fallback": 12, "refused": 340, "fbEnv": 12,
                  "nativeRefused": 3, "nativeTop": [{ "reason": "skinned", "count": 2 }, { "reason": "skip", "count": 1 }] }
```

| Campo | Significado |
|---|---|
| `fallback` | Entradas tomadas na projeção que o three desenhou na emissão (Δ de `stats.fallback`). |
| `refused` | Candidatos oferecidos e devolvidos ao three (Δ de `stats.refused`). |
| `fbEnv` | Dos `fallback`, os causados por troca de luz/ambiente/nó de contexto (Δ de `stats.fbEnv`). |
| `nativeRefused` | Recusas do `NativeRenderer` na janela. Conta CLASSIFICAÇÕES: uma recusa fica em cache no objeto e não se repete por quadro, exceto os motivos de nova tentativa (`RETRY_REASONS`). |
| `nativeTop` | Os 5 motivos mais frequentes da janela. |

Ausente quando nenhum `RenderServer` foi criado e não houve recusa nativa.

### 3. `uiUploads` — reenvios da UI à GPU

O `RendererUiBackend` registra cada vez que manda pixels novos de um widget para a GPU:

- texto (`_rasterInto`): reescrita no lugar (`needsUpdate`) ou textura nova;
- canvas: textura nova (`_ensureCanvasMesh`) ou `needsUpdate` no `_refreshCanvas`;
- imagem de fundo do Panel carregada (`_loadImage`).

A chave é `<tipo>#<id do widget>` (`label#12`, `canvas#3`, `image#5`); widget não tem nome, e o `id` é estável na
sessão. Para texto vai junto o último texto (até 24 caracteres) em `hint`, para identificar o widget no HUD.

```json
"uiUploads": { "total": 64, "top": [{ "widget": "label#12", "count": 30, "hint": "00:41.2" },
                                    { "widget": "canvas#3", "count": 30 }] }
```

Ausente quando nada subiu na janela.

### 4. `alloc` — bytes alocados pelo Hermes, por janela e por sistema

O host expõe `__cortexAllocatedBytes()`: um número (sem objeto, para não poluir a própria medida), o mesmo
`totalAllocatedBytes` do Hermes que alimenta `gc.allocatedMB`. No Hades ele é `totalAllocatedBytes_ +
youngGen().used()`, exato a qualquer instante, então **dá para medir por chamada**.

- `windowKB`: Δ entre amostras. Vem de `__cortexAllocatedBytes()`, ou de `__cortexGcStats().allocatedMB` em host
  antigo. Ausente na primeira amostra (sem base) e fora do host.
- `sysKB`: com o perfil por sistema ligado (`?systemProfile=1`) e a função do host presente, o `World` lê o total
  antes e depois de cada `update` (fora do intervalo cronometrado do `cpu.sys*`) e soma a diferença por sistema,
  com o mesmo nome do `cpu.sys*`.

```json
"alloc": { "windowKB": 2210.4, "sysKB": { "VehicleArcadeSystem": 310.2, "NpcSystem": 95.0 } }
```

Limites conhecidos:
- O `getHeapInfo` do Hades pega o `gcMutex_`. Com uma coleta concorrente em curso, a leitura pode esperar o passo
  da thread do coletor. Só acontece com `?systemProfile=1`, que já é modo de instrumento.
- A alocação de um sistema inclui o que ele chama por dentro (callbacks, eventos).
- Sem `__cortexAllocatedBytes` (host antigo), `sysKB` não sai; `windowKB` sai do `gc`.

### 5. `cpu.napiBindJs` e `cpu.napiBindReplay` — setBindGroup separado

`native/src/webgpu/napi_frame_stats.h` passa a ter os contadores do frame sem depender de NAPI (para o
`cortex_host_tests`) e um contador novo, `setBindGroupReplay`. O replay em C++ (`draw_batch_shim.cpp`) chama
`bumpSetBindGroupReplay()`, que soma no total **e** no replay; a chamada JS (`commands.cpp`) continua com
`bumpSetBindGroup()`. Assim `setBindGroup` mantém o significado de hoje (a soma) e `__cortexNapiStats()` ganha:

- `setBindGroupReplay`: as do replay;
- `setBindGroupJs`: `setBindGroup - setBindGroupReplay`.

No trace, ao lado de `cpu.napiBind` (sem mudança, a soma): `cpu.napiBindJs` e `cpu.napiBindReplay`. Como os outros
`napi*`, são contagens do último frame fechado do host, não da janela. Host antigo: os dois ficam ausentes.

### Divisões de arquivo (regra das 500 linhas)

- `src/core/PerfTrace.ts` (754): a implementação do censo da cena (`SceneWalk`, `countNodes`,
  `countUnchangedMatrices`, `censusBySceneNode`, `collectVisible`, `sceneNodeIdOf`) vai para
  `src/core/perfTrace/sceneCensus.ts`; os leitores do host para `perfTrace/hostStats.ts`; os blocos do `tick` que
  escrevem no mapa `cpu` (ponte NAPI, fases, sistemas, cobertura de material) para `perfTrace/sampleSections.ts`.
- `src/ui/runtime/RendererUiBackend.ts` (770): materiais TSL da caixa e da imagem, estilo da caixa, "cover", blend
  da composição, `flipRowsInto` e a destruição do visual vão para `src/ui/runtime/uiBackendMaterials.ts`.
- `native/src/webgpu/napi_stats.h`: a parte sem NAPI vai para `napi_frame_stats.h/.cpp`.

Só movimentação: o comportamento é o mesmo.

### `.d.ts` público autocontido (`VENDOR_TYPE_MODULES`)

O Studio copia para o `vendor/` só os `.d.ts` da lista `VENDOR_TYPE_MODULES` (`electron/main.ts`). Os módulos de
`core/perfTrace/*` ficam **fora** dela e por isso não podem aparecer em nenhuma assinatura pública:

- os tipos públicos (`PerfSample` com os campos novos, `VisibleNode`, `SceneWalkResult`, `GcTotals`,
  `SunShadowSample`, `ShadowOffender`, `RenderServerSample`, `UiUploadsSample`, `AllocSample`,
  `TraceCounterFields`) são declarados no próprio `PerfTrace.ts`; os módulos internos os importam com `import type`;
- `SceneWalk`, `countNodes`, `countUnchangedMatrices`, `censusBySceneNode` e `collectVisible` seguem públicos no
  `PerfTrace.ts` como fachadas com assinatura própria, que delegam à implementação em `sceneCensus.ts`
  (`SceneWalk.result` passa a ser getter, só leitura);
- nada de `core/perfTrace/*` é re-exportado.

`tests/electron/vendorTypeModules.test.ts` lê a lista do `electron/main.ts`, emite as declarações em memória e
confere que todo `import`/`export … from` relativo dos `.d.ts` da lista aponta para outro módulo da lista. As
referências quebradas que já existiam na `main` (`FrameProfiler`, `RenderPhaseProbe`, `scenes/ilha.json`) ficam
numa lista explícita no teste: corrigi-las exige mudar a lista no `electron/main.ts`. Uma referência nova fora da
lista reprova; uma antiga corrigida pede para sair da lista.

## Como ler

- Mapa devolvido ao three o tempo todo: `sunShadow.handedBack` alto e `drawn` zero. `reason` e `offender` dizem
  quem está barrando.
- `renderServer.fallback` acompanhando o `fbEnv`: a luz ou o ambiente estão trocando por quadro e derrubam a lista.
- `uiUploads.top` com um `label` em ~30 por janela (60 fps): um texto que muda todo quadro (cronômetro). Canvas
  em 30: o canvas está sendo redesenhado todo quadro.
- `alloc.sysKB`: o sistema com mais KB por janela é o maior gerador de lixo; compare com `gc.youngCount`.
- `cpu.napiBindReplay / cpu.napiBind`: a fração dos setBindGroup que o replay em C++ já tirou do JS.

## Testes

- `tests/core/perfTrace/traceCounters.test.ts`: `Tally` (top-N, zera ao drenar), inatividade sem a ponte, e cada
  campo (`sunShadow`, `renderServer`, `uiUploads`, `alloc`).
- `tests/core/PerfTraceCounters.test.ts`: `PerfTrace.tick` publica os campos e o `napiBindJs`/`napiBindReplay`.
- `tests/render/native/sunShadowTrace.test.ts`: recusa com ofensor chega ao `sunShadow`.
- `tests/ui/RendererUiBackendUploads.test.ts`: reenvio de texto e canvas por widget.
- `tests/ecs/WorldSystemAlloc.test.ts`: delta por sistema com leitor falso.
- `native/tests/napi_frame_stats_test.cpp`: total, replay e JS separados.
- `tests/electron/vendorTypeModules.test.ts`: `.d.ts` vendorizados sem referência para fora da lista.
