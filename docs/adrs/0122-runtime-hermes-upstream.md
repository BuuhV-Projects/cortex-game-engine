# 0122 - Runtime JS do host: Hermes upstream (facebook/hermes) no lugar do fork Microsoft

**Data:** 2026-07-17
**Status:** aceito

## Contexto

O spike do plano de perf (item 3, `.claude/plano-perf-render-nativo.md`) mediu o
mesmo bench (proxy do frame com o core do three.js, es5 idêntico) em quatro
runtimes. O achado central: **o hermes.dll embarcado (NuGet
`Microsoft.JavaScript.Hermes` 0.1.27, o mais novo — o pacote está parado) é
~4,3× mais lento que o interpretador atual do facebook/hermes main** (93,5 ms vs
21,8 ms por frame do proxy). O shermes (AOT) untyped dá só 1,4× sobre o
interpretador novo — não justifica migração de toolchain; JIT e V8 continuam
descartados (console proíbe codegen em runtime; decisão do dev: **sem plano B**
de manter o fork MS no console — o porte do upstream pra GDKX fica no M4).

## Decisão

Trocar o runtime do host pro **facebook/hermes main** (commit pinado em
`native/third_party/hermes-upstream/PINNED_COMMIT`; fetch-deps clona e aplica um
patch mínimo que desliga os testes NAPI — geravam regras duplicadas de `.lib`
no Windows/Ninja).

1. **Build como SUBPROJETO CMake** (`add_subdirectory` em `native/CMakeLists.txt`,
   `EXCLUDE_FROM_ALL`): o VM, a camada NAPI (`hermesNapi`, upstream do próprio
   fork MS) e o `hermesc` compilam com MSVC no MESMO build do host — flags e
   defines idênticos entre VM e embedder (headers do VM com defines diferentes
   quebram ABI em silêncio). O runtime agora é **estático no exe** — sem
   `hermes.dll` no export.
2. **Glue `hermes_embed`** (`native/src/core/hermes_embed.{h,cpp}`): API C
   mínima (create/destroy runtime, create env, run bytecode/script, drain
   jobs). É o ÚNICO tradutor que inclui headers do VM, compilado num alvo que
   herda as flags do Hermes (`hermesNapi_obj`). O `js_runtime.cpp` (e todos os
   shims) só veem `napi_env` + `node_api.h` (vendorizado no próprio hermes em
   `include/hermes/napi/`).
3. **`hermesc` do mesmo commit** em todo lugar que gera bytecode: o alvo
   `hermesc` do subprojeto alimenta o `boot.hbc` do smoke (CMake) e o
   `export-game.mjs` (`<hostBuild>/hermes-upstream/bin/hermesc.exe`). Bytecode
   é acoplado à versão do VM — runtime e compilador andam juntos.

## Armadilhas encontradas no porte (pra próxima manutenção)

1. **Handle scope é OBRIGATÓRIO no NAPI upstream.** O fork MS abria um
   env-scope global (`jsr_open_napi_env_scope`); no upstream, criar valores
   NAPI do lado nativo SEM `napi_handle_scope` aberto (registro de shims, args
   de timers/rAF) **corrompe a pilha de scopes em silêncio** e o GC segfaulta
   depois na marcação (`napi_env__::markHandleScopes` → EvacAcceptor →
   `CardBoundaryTable::updateBoundaries`). Fix: `JsRuntime::HandleScope` (RAII)
   — um scope raiz no boot + **um por frame** no loop do host. Foi caçado com o
   novo **crash handler** (`core/crash_handler.*`: DbgHelp + backtrace
   simbolizado no stderr — fica permanente; segfault nunca mais é exit mudo).
2. **/STACK:10000000** no exe (como os executáveis do próprio Hermes): o
   interpretador usa stack nativa funda; com 1 MB default o bundle do jogo
   estourava no boot.
3. **MSVC**: `hermesc`+`hermesNapi` compilam limpos, mas o glue precisa
   espelhar as flags do VM: defines de diretório via `get_directory_property`
   (ABI!), `/EHs-c- /GR-`, `/wd4576 /wd4141`, e os include dirs com os `.inc`
   pré-gerados (`external/llvh/gen/include`). Os testes NAPI são desligados por
   patch (regras duplicadas de `.lib` no Ninja/Windows — fetch-deps aplica).

## Consequências (números medidos, fase 1 do teste4 windowed)

- Bench proxy DENTRO do host: 93,5 ms (fork MS) → 32–52 ms no MSVC → **29,3 ms
  com clang-cl** (follow-up 2026-07-18: o build oficial agora usa clang-cl —
  LLVM via winget; patches de compat em `native/patches/hermes-upstream.patch`,
  aplicados pelo fetch-deps: -Werror=undef pulado e EH/RTTI via `/EHsc`/`/GR`,
  já que o clang-cl ignora `-f(no-)exceptions`).
- Jogo: 41 → ~60 fps (MSVC) → **70–73 fps com clang-cl** (worst 19–21 ms;
  frame ~14 ms — 60 cravado com folga);
  frame = lógica ~4 ms + render ~15,6 ms — o render passou a ser dominado
  pelas CHAMADAS wgpu/NAPI + driver (não aceleram com interpretador). Levers
  seguintes: PostFX off no export (~4 ms) e menos chamadas WebGPU por frame.
- Boot/carregamento (JS pesado: parse GLB, zod, scripts) ganha os 2–3× cheios.
- Console (M4): o mesmo runtime precisa compilar na toolchain GDKX — anotado no
  plano; sem bifurcação de runtime PC/console. O clang-cl NÃO bifurca esse
  caminho: os patches são gateados por `CLANG_CL` (variável que o próprio
  Hermes.cmake define) e o ramo MSVC puro fica com o comportamento original —
  configurar SEM `-DCMAKE_C(XX)_COMPILER` continua buildando com cl.exe, que é
  o caminho GDKX.
- **CI (GitHub Actions)**: a action `build-native-host` (usada por release.yml
  e build-ide.yml) compila o host com o clang-cl PRÉ-INSTALADO nos runners
  windows-latest (`C:/Program Files/LLVM`), com fallback automático pro MSVC
  se o LLVM sumir da imagem — assim o instalador do Studio embarca o host
  rápido. O build do Hermes (~450 alvos) e o clone pinado são cacheados
  (`actions/cache`, key = hash de CMakeLists + fetch-deps + patch).
- O primeiro build do host recompila o Hermes (~450 alvos, minutos; o ninja
  cacheia depois). `fetch-deps` + build ficam reproduzíveis pelo commit pinado.
- Steam/GDK builds (`build-steam`, `build-gdk`) precisam reconfigurar (o CMake
  novo se aplica aos três).
- O fork MS (`third_party/hermes`) sai do fetch-deps e pode ser apagado do
  disco; `hermes.dll` some do export e do instalador (runtime ESTÁTICO no exe).
- ~~Bug do `CORTEX_RENDER_SCALE=1`~~ **CORRIGIDO**: o panic "Surface image is
  already acquired" era o frame de TRANSIÇÃO do render direto (scale=1 antes do
  compositor de UI nascer) — o JS tinha adquirido a swapchain e o present
  adquiria de novo. O `presentIfAcquired` agora REUSA a textura já adquirida
  como alvo do blit nesse frame (rastreado com prints: `game=0 held=1` no exato
  frame da troca).
- **`error_log.txt`**: o crash handler agora também APENDA o backtrace (e
  aborts/panics do wgpu, via handler de SIGABRT) em `<jogo>/error_log.txt` —
  jogador manda o arquivo quando o jogo fechar sozinho.
