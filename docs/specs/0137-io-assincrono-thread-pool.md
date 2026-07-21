# SPEC-0137 - IO assíncrono (thread pool) no host nativo

**Data:** 2026-07-21
**Status:** aceito

## Contexto

Quarto passo (M-perf-3) do PRD-0005. O host nativo é **single-thread** e o
`__cortexReadFile` (base do `fetch`) lê o arquivo **inteiro na thread JS** antes
de devolver. Medido no bench: ler um asset de ~36 MB (um prédio `.glb`) **bloqueia
a thread por ~49 ms** — ~3 frames perdidos, um stutter visível. Isso inviabiliza
o streaming de mundo-aberto (M-perf-4): carregar uma célula travaria o frame.

## Decisão

Um **pool de IO** (`native/src/shims/io_pool.{h,cpp}`) que lê assets em threads de
trabalho, fora da thread JS.

**Regra de ouro: NENHUMA chamada NAPI fora da thread JS.** Os workers só produzem
`std::vector<uint8_t>` (bytes crus); a criação do `ArrayBuffer` e a resolução da
`Promise` acontecem no **drain**, na thread JS. Sem isso, o GC do Hermes upstream
corromperia (mesma classe de armadilha do handle-scope, ADR-0122).

Fluxo:
1. `__cortexReadFileAsync(path)` (thread JS) cria uma `Promise` (`napi_deferred`),
   guarda-a num mapa por `id` (só a thread JS toca), enfileira `{id, path}` e
   acorda um worker.
2. O worker lê os bytes via `readAssetBytes` (pak XOR ou disco — **sem NAPI**;
   `fopen` próprio por chamada, índice do pak read-only após o boot) e empurra
   `{id, bytes}` pra fila de conclusões.
3. `drainIoCompletions(env)` (no `runFrame`, thread JS) esvazia a fila: cria o
   `ArrayBuffer` (memcpy dos bytes) e **resolve** a Promise pelo `id`.
4. `shutdownIoPool()` dá join nos workers **antes** do teardown do Hermes.

`readPakBytes` (pak.cpp) e `readAssetBytes` (files.cpp) são as leituras só-bytes
thread-safe; o `readPakFile`/`__cortexReadFile` síncronos passaram a reusá-las.
Pool de 2–4 workers (`hardware_concurrency` clampado).

## Consequências

- **Medido (bench, asset de 36 MB):** `__cortexReadFile` **bloqueia ~49 ms**;
  `__cortexReadFileAsync` **bloqueia ~2 ms** (só enfileira) e resolve ~52 ms
  depois, **sem travar o frame**. Shutdown limpo (join dos workers), sem crash de
  threading.
- **`fetch` (net.js) continua SÍNCRONO** de propósito: durante o boot o loop
  principal — e o drain — ainda não roda, então um `fetch` async **travaria o
  boot** (a Promise nunca resolveria). O `__cortexReadFileAsync` é o **primitivo**
  pra o streaming (M-perf-4), que o dirige DENTRO do loop (onde o drain roda). A
  fiação `fetch`→async (pro `GLTFLoader` do streaming) exige detecção de
  "boot terminou" e fica pro M-perf-4.
- **Decode ainda síncrono:** a leitura de bytes saiu da thread, mas o decode de
  imagem/KTX2 (basisu) ainda roda na thread JS quando a Promise resolve. Pra
  texturas grandes, decode-async é o próximo alvo (workers produzem RGBA; upload
  na thread JS) — anotado como follow-up do M-perf-3.
- **Promises pendentes no shutdown** ficam sem resolver (o runtime está morrendo;
  os objetos JS somem no teardown). Não se toca NAPI no `shutdownIoPool`.
