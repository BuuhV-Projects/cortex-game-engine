# SPEC-0287 — Transcode KTX2 assíncrono no host (fora da thread JS)

**Data:** 2026-10-02
**Status:** aceito

## Contexto

`loadKtx2Native` (`src/core/loadKtx2.ts`) chama o binding **síncrono**
`__cortexTranscodeKtx2(bytes)` (basis_universal UASTC → BC7 com mips,
SPEC-0155). O transcode roda na thread JS: no crash-bandicoot-racer (fase 2,
streaming de LOD) cada textura 2048² custa ~60 ms e cada carga de LOD traz 3 →
frames de 220–300 ms durante a corrida.

O host já tem um pool de workers com Promise resolvida na thread JS
(`native/src/shims/io_pool.*`, M-perf-3 / PRD-0005), hoje especializado em
ler arquivo.

## Decisão

### Pool compartilhado, tarefa genérica

Escolha: **generalizar o `io_pool`** em vez de criar um pool irmão só pra KTX2.

- O `io_pool` passa a aceitar uma tarefa genérica:
  `submitIoJob(env, label, work, settle) → Promise`. `work` roda num worker
  (**sem NAPI**, só bytes); `settle(env, deferred)` roda no drain
  (`drainIoCompletions`, 1×/frame na thread JS) e resolve/rejeita a Promise.
  O `__cortexReadFileAsync` vira um cliente dessa API (comportamento igual).
- Alternativa descartada — pool dedicado: mais 2–4 threads competindo pelos
  mesmos núcleos, segunda fila/drain/shutdown pra manter em sincronia, e
  nenhum ganho real: o leitor de arquivo e o transcode já são consumidos em
  série pelo GLTFLoader (o GLB é lido antes das texturas).
- Custo aceito: com o mínimo de 2 workers, 2+ transcodes em voo atrasam uma
  leitura de arquivo em até ~60 ms. É latência de carga, não travada de frame.

### Binding `__cortexTranscodeKtx2Async(bytes) → Promise`

- Resultado no **mesmo formato** do síncrono:
  `{ width, height, format: 'bc7', levels: ArrayBuffer[] }` ou
  `{ width, height, format: 'rgba', rgba: ArrayBuffer }`.
- Entrada inválida / transcode que falha → **reject** (`Error`), em vez do
  `null` do síncrono (Promise rejeitada é o idioma do JS pra erro assíncrono).
- Os bytes de entrada são **copiados** pra um `std::vector` na chamada (o
  ArrayBuffer JS não pode ser tocado fora da thread JS).
- O transcode em si vira função pura sem NAPI (`ktx2_transcode.{h,cpp}`):
  produz `std::vector`s. Síncrono e assíncrono usam a mesma função; os
  `ArrayBuffer`s de saída são criados **na thread JS** (no drain para o async),
  contabilizados em `perf_arraybuffer` com a fonte `ktx2`.
- `basisu_transcoder_init()` roda **uma vez** via `std::call_once` (pode ser
  chamado de worker ou da thread JS). Cada chamada cria seu próprio
  `basist::ktx2_transcoder` (o objeto não é compartilhado entre threads).
- Shutdown: o `shutdownIoPool()` existente já faz join antes do teardown do
  Hermes; tarefas não drenadas ficam pendentes (o runtime está morrendo).
- O binding síncrono continua existindo (bundle antigo/fallback).

### Engine (`loadKtx2Native`)

- Usa `__cortexTranscodeKtx2Async` quando existe; senão cai no síncrono
  (host antigo). Reject vira `Error` com a URL na mensagem.
- A montagem da textura não muda: BC7 → `CompressedTexture` marcada com
  `userData.cortexNativeKtx2` (SPEC-0286 continua liberando os mips após o
  upload); RGBA → `DataTexture`.

## Consequências

- O transcode sai da thread JS: o frame só paga a cópia dos bytes de entrada e
  a criação dos `ArrayBuffer`s de saída no drain.
- Pico de memória transitório: os níveis BC7 existem em `std::vector` (worker)
  e no `ArrayBuffer` por um instante na conversão. O caminho síncrono ganhou a
  mesma cópia extra (~1 ms por 2048²) em troca de um único código de transcode.
- A textura chega um frame depois do fim do transcode (drain no começo do
  `runFrame`).
- Testes: `tests/core/loadKtx2-native-async.test.ts` (Vitest). C++: o alvo
  `cortex_host_tests` só cobre unidades puras sem basisu/NAPI e não há fixture
  KTX2 no repo — o caminho async é validado no host pela medição abaixo.

## Medição no host

Probe `D:/Codex/2026-10-02/ktx2-async-probe` (adaptado do `leak-probe`):
bundla com o `src/` desta mudança e roda o `cortex_host.exe` compilado da mesma
árvore. Cada ciclo carrega `reference-circuit/assets/10-coqueiro/lod2.glb`
(crash-bandicoot-racer; **3 texturas KTX2 2048², 12 mips**), mostra 5 frames,
remove e descarta. Mede o maior intervalo entre frames (`onUpdate`, wall-clock)
do início da carga até o fim dos 5 frames. "Antes" = mesmo exe/bundle com
`sync=1` (apaga `__cortexTranscodeKtx2Async` → cai no síncrono). 10 ciclos por
rodada, duas rodadas por caminho, janela oculta, `maxFps = 0`.

| Caminho | Rodada | Ocioso (ms) | Maior frame por ciclo: mín / mediana / máx (ms) |
|---|---|---|---|
| síncrono (antes) | 1 | 13,7 | 219,0 / 240,9 / 311,1 |
| síncrono (antes) | 2 | 13,5 | 209,3 / 219,7 / 317,3 |
| assíncrono (depois) | 1 | 26,1 | 31,8 / 40,3 / 70,0 |
| assíncrono (depois) | 2 | 13,7 | 25,5 / 32,5 / 53,8 |

- Pior frame de carga cai **~6×** (mediana 220–241 ms → 32–40 ms). O que
  sobra é parse do GLB, criação dos `ArrayBuffer`s (~5,6 MB por textura com
  mips) e upload BC7 na GPU — já fora do escopo do transcode.
- Em todos os ciclos o objeto renderizou com as 4 referências de textura
  (3 imagens) marcadas `cortexNativeKtx2` (BC7 nativo); stderr sem erro de
  validação WebGPU e sem `error_log.txt`.
