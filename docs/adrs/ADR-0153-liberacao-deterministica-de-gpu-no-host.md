# ADR-0153 - Liberação determinística de GPU/RAM no host nativo

**Data:** 2026-07-25
**Status:** aceito

## Contexto

No export nativo, cada fase jogada aumentava VRAM e RAM do processo sem volta.
Causa (auditoria completa em `native/`):

- `destroy()` de buffers/texturas é **release-only por decisão registrada**
  (`native/src/webgpu/internal.h`): marcar "destroyed" no wgpu derrubava o jogo
  com panic de validação ("has been destroyed") quando o three ainda gravava
  passes com recursos dispostos frames antes. A memória só volta quando o GC do
  Hermes coleta o wrapper JS e o finalizer chama `wgpu*Release`.
- Só que **nada dispara o GC**: os wrappers são objetos JS minúsculos escondendo
  MBs de recurso nativo (sem contabilidade de memória externa), então o Hermes
  não sente pressão e os finalizers podem nunca rodar. Resultado: a fase antiga
  fica inteira na VRAM.
- Dois vazamentos de RAM associados: o cache de PCM decodificado
  (`g_buffers` em `audio.cpp`) só insere — não existe `free`; e os object URLs
  do shim de rede (`net.js`) retêm bytes se ninguém revogar.

Alternativas consideradas pra VRAM:

1. **Destruição adiada real** (implementar `deferDestroy*`/`flushDeferredDestroys`
   destruindo N frames após o present): libera na hora, mas reintroduz o risco
   exato que motivou o release-only — o panic era intermitente e acontecia
   "vários frames depois", então nenhum N é comprovadamente seguro.
2. **Nudge de GC no teardown de fase** (`Runtime::collect` exposto ao JS):
   mantém o release-only (zero risco de validação — o wgpu refcounta e segura o
   que ainda estiver em voo), e torna a coleta determinística no único momento
   em que importa (troca de fase, atrás da tela de loading). Pré-condições, já
   resolvidas na SPEC-0152: o three solta as referências no dispose e os
   listeners vazados que pinavam a cena foram corrigidos.
3. Contabilidade de memória externa (`napi_adjust_external_memory` na criação
   dos wrappers): pressão contínua e automática, mas depende do suporte do
   hermes-napi e não dá determinismo no reset.

## Decisão

**Opções 1 + 2 combinadas** *(revisado na validação por soak — a 1ª versão
deste ADR escolhia só a 2)*: o soak automatizado provou que **release-only +
GC não devolve VRAM** — mesmo com os finalizers rodando (`Release`), refs
internas do wgpu (views/bind groups de wrappers ainda vivos) seguravam os
recursos, e ~770 MB vazavam POR troca de fase. Então:

- **Destruição adiada REAL**: `deferDestroy*` enfileira com **`wgpu*AddRef`**
  (a ref da fila — sem ela, o finalizer do GC podia zerar o refcount antes do
  flush e o destroy adiado virava use-after-free, AV reproduzido no soak) e o
  `flushDeferredDestroys` executa `wgpu*Destroy` + `Release` da fila
  **10 frames depois** (`kDeferredDestroyFrames`) — fora da janela de passes
  gravados/em voo que causava o panic histórico ("has been destroyed").
  Validado no soak: 6 trocas de fase sem panic.
- Telemetria de VRAM: contadores criação×destroy×release + registro de
  texturas vivas com dimensões, quieta por padrão, ligada por
  `CORTEX_VRAM_LOG=1` — foi o instrumento que identificou cada classe de
  vazamento (PMREM, skybox/cubo, CSM).

- `hermes_embed` expõe `cortexHermesCollectGarbage()` (`Runtime::collect`);
  `js_runtime` registra o global **`__cortexGC()`**. O `Game.reset()` do engine
  chama `__cortexGC?.()` ao final do teardown (SPEC-0152) — coleta os wrappers
  órfãos → finalizers → `wgpu*Release` → VRAM/RAM de volta, na troca de fase.
- `__cortexAudio` ganha **`free(bufferId)`** (apaga do `g_buffers`); o wrapper
  de `AudioBuffer` do `webaudio-lite.js` ganha `free()` (idempotente) chamado
  pelo `AssetLoader.disposeCache()` do engine.
- `net.js` registra **`__cortexClearObjectUrls()`** (esvazia o Map de object
  URLs), chamado pelo `clearSceneAssetCaches()` (SPEC-0152) — só no despejo
  explícito de assets, quando nenhum blob: URL antigo é mais alcançável.
- A opção 3 fica como evolução futura se o platô entre resets incomodar.
- **`clearKeptObjects()` no drain** *(bug real achado na validação)*: o embed
  usa `Runtime::drainJobs()` cru, que **não** limpa o `[[KeptAlive]]` dos
  WeakRefs (o caminho JSI `hermes.cpp::drainMicrotasks` limpa) — sem isso,
  TODO alvo de `WeakRef` criado/`deref()`ado ficava retido pra sempre.
  `cortexHermesDrainJobs` agora chama `clearKeptObjects()` após o drain.
- **Teto de heap do Hermes** *(extensão, alvo de spec mínima 2 GB RAM)*: sem
  limite, o Hades prefere crescer o heap a coletar — o working set subia
  ~1 MB/s de lixo durante o gameplay. `GCConfig.maxHeapSize = 512 MB` (~8× o
  live-set medido) torna a coleta regular e limita a RAM do JS.
- **Gotcha do Hermes documentado**: closures capturam o *environment* inteiro
  da função (agravado pelo `transform-block-scoping` do bundle, ADR-0146 —
  `let`/`const` viram `var` num escopo só). Uma closure sobrevivente qualquer
  criada numa função grande de fase retém TODOS os locals dela. Mitigação no
  jogo: anular locals pesados no fim do teardown (spec 0015 do teste4).

## Consequências

- VRAM/RAM da fase anterior é liberada no `Game.reset()` (e não "quando o GC
  quiser"). O custo do `collect` completo (~dezenas de ms) acontece atrás da
  tela de loading da troca, onde não há frame a perder.
- O panic "has been destroyed" continua estruturalmente impossível — nada muda
  no caminho de validação do wgpu.
- `__cortexGC` coleta o runtime inteiro (não só GPU) — efeito colateral bem-vindo
  em closures/arrays soltos da fase.
- Um jogo que nunca chama `reset()` continua no comportamento antigo (GC ao
  ritmo do Hermes). Áudio: quem descartar `AudioBuffer` sem `free()` também.
