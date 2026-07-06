# CortexNative — arquitetura do host nativo

> **Fonte de verdade viva** do host nativo (`native/`). Leia a seção relevante
> ANTES de mexer; ATUALIZE na mesma mudança quando alterar fluxo, módulo ou
> descobrir armadilha nova. Manutenção é **AI-first**: este doc existe pra uma
> sessão de IA (ou um humano novo) pegar qualquer parte sem arqueologia.
>
> Contexto de produto: `docs/prds/0004-cortex-native-port-console-xbox.md`.
> Decisões de stack: `docs/adrs/0100-cortex-native-stack-do-host-m0.md`.

## O que é

Runtime nativo que executa o JavaScript do jogo **sem browser**:
Hermes (JS) + wgpu-native (WebGPU→D3D12) + SDL3. O JS enxerga a mesma API do
browser (`navigator.gpu`, `requestAnimationFrame`, timers) — é isso que vai
permitir rodar o Three.js WebGPURenderer sem fork. Alvo final: Xbox via GDK;
no PC, futuro export "nativo premium" (Tauri continua o caminho leve).

## Fluxo de um frame

```
main.cpp (loop)
 ├─ pollEvents            core/app_window   quit? resize? (reconfigura surface)
 ├─ runTimers             shims/timers      setTimeout/setImmediate vencidos
 ├─ drainMicrotasks       core/js_runtime   continuações de Promise/async
 ├─ runAnimationFrames    shims/animation_frame  callbacks de rAF (o JS grava
 │                                          e submete comandos WebGPU aqui)
 ├─ drainMicrotasks
 └─ presentIfAcquired     webgpu/surface    present + release da textura, se o
                                            JS chamou getCurrentTexture()
```

No boot: `main` cria janela+surface (D3D12), cria `JsRuntime`, registra shims
e bindings, executa `boot.hbc` (bytecode) e drena microtasks — o `async main()`
do JS roda aí (pede adapter/device, cria pipeline, registra o 1º rAF).

## Mapa de módulos (quem faz o quê)

| Caminho | Responsabilidade |
|---|---|
| `native/src/main.cpp` | Composition root: liga módulos e roda o loop. Não contém lógica. |
| `native/src/core/host_gpu.h` | Estado gráfico compartilhado (instance, surface, device, config, textura do frame). Structs, sem comportamento. |
| `native/src/core/app_window.*` | SDL3: janela, instância WebGPU (D3D12 forçado), surface, eventos (quit/resize). |
| `native/src/core/js_runtime.*` | Ciclo de vida do Hermes (API C `jsr_*`), `print()`, boot `.hbc`→fallback `.js`, drain de microtasks. |
| `native/src/napi/napi_util.*` | Helpers Node-API genéricos (namespace `njs`): propriedades, wrap/unwrap de handles, chamadas JS com log de exceção. Zero dependência de WebGPU/SDL. |
| `native/src/shims/timers.*` | `setTimeout`/`clearTimeout`/`setImmediate`. O Hermes agenda async/await via `setImmediate` — obrigatório. |
| `native/src/shims/animation_frame.*` | `requestAnimationFrame` (uma geração de callbacks por frame; JS re-registra). |
| `native/src/shims/input.*` | Eventos SDL→JS (keydown/keyup/pointer via `__cortexDispatchInput`) + Gamepad API (`__cortexInput.getGamepads`, layout standard W3C sobre SDL_Gamepad). |
| `native/src/shims/files.*` | `__cortexReadFile` (fetch lê daqui; base = pasta do exe → futuro XPackage). |
| `native/src/shims/image_decode.*` | `__cortexDecodeImage` (stb_image → RGBA8) pro createImageBitmap. |
| `native/src/shims/rapier.*` | Ponte C ABI do crate rapier-native → `__rapierNative` (funções achatadas, f64). |
| `native/src/shims/audio.*` | `__cortexAudio`: decode (miniaudio) + playback (streams SDL3; loop/gain/pitch); `updateAudio()` por frame. |
| `native/src/shims/text_raster.*` | `__cortexRasterText` (stb_truetype + Roboto pinada) → bitmap RGBA branco pro RendererUiBackend (ADR-0102). |
| `src/ui/runtime/` (ENGINE) | UI de runtime ADR-0102: UiLayer/widgets/layout + DomUiBackend e RendererUiBackend. |
| `native/rapier-native/` | Crate Rust (cdylib): Rapier de verdade com C ABI mínima espelhando o que o engine usa. |
| `native/src/webgpu/bindings.h` | API pública do módulo: `registerBindings`, `presentIfAcquired`. Fora do módulo, só inclua este. |
| `native/src/webgpu/internal.h` | Contratos entre os .cpp do módulo (callbacks repartidos). |
| `native/src/webgpu/navigator.cpp` | `navigator.gpu` (requestAdapter, formato preferido) + dono do `gpuState()`. |
| `native/src/webgpu/device.cpp` | Aquisição do device, composição do objeto JS `device`, error scopes (push/popErrorScope). |
| `native/src/webgpu/pipeline.cpp` | Shader modules (WGSL) e render pipelines — sub-parsers por sub-estado (vertex/fragment/primitive/depth/multisample/layout). |
| `native/src/webgpu/layouts.cpp` | Bind group layouts e pipeline layouts explícitos (o Three não usa 'auto'). |
| `native/src/webgpu/buffers.cpp` | Recursos de DADOS: createBuffer (+mappedAtCreation/getMappedRange/unmap), writeBuffer (assinatura completa da spec, offsets em ELEMENTOS), createBindGroup, global `GPUBufferUsage`. |
| `native/src/webgpu/textures.cpp` | Recursos de IMAGEM: createTexture, views com descriptor (depth do Three), samplers. Marca `__kind` nos objetos p/ o parseBindGroupEntry. |
| `native/src/webgpu/commands.cpp` | Encoder, render pass (color+depth attachments), setBindGroup/setVertexBuffer/setIndexBuffer/viewport/scissor, draw/drawIndexed, queue.submit. |
| `native/src/webgpu/surface.cpp` | `gpuContext` (configure/getCurrentTexture) e present. |
| `native/src/webgpu/enums.*` | Mapas string↔enum (formatos, compare, cull, vertex formats...). |
| `native/js/src/main.js` | Boot do jogo (hoje: cubo Three.js girando + smoke tests do M1). Entry do bundle. |
| `native/js/src/prelude.js` | Orquestrador dos shims JS (importa js/src/shims/ na ordem certa). Regra: o que dá pra shimar em JS fica em shims/. |
| `native/js/src/shims/globals.js` | self, console→print, performance. |
| `native/js/src/shims/event-target.js` | EventTarget-lite + Event/CustomEvent — o "event bus via document" que os jogos usam (rush:*). |
| `native/js/src/shims/dom-lite.js` | DOM inerte (createElement/appendChild/innerHTML rodam, nada renderiza) + window/document com bus próprio. Etapa 6a do M1. |
| `native/js/src/shims/webgpu-extras.js` | Constantes GPU*, features/limits no adapter/device, canvas fake. |
| `native/js/src/shims/input-bridge.js` | Redistribui eventos do host pra window/document/body (como o browser) e liga navigator.getGamepads ao nativo. |
| `native/js/examples/triangle.js` | Referência: triângulo WebGPU puro (Marcos C–D), sem Three. |
| `native/scripts/bundle.mjs` | esbuild (bundle es2018) + Babel (classes loose + arrows) → IIFE único pro hermesc. |
| `native/scripts/fetch-deps.ps1` | Baixa deps prebuilt **pinadas** (SDL3, wgpu-native, Hermes NuGet). |

## Regras do projeto (não quebrar)

1. **SOLID/clean code**: arquivo pequeno, responsabilidade única; condição de
   loop vira função nomeada (`isSurfaceTextureUsable`, `takeDueTimers`);
   parsing de descriptor grande vira sub-parsers (`parseVertexState`...).
2. **API fiel ao browser**: o JS nunca deve precisar saber que está no host.
   Nada de APIs "cortex-only" fora do namespace `gpuContext` (que simula a
   canvas — será substituído por um shim de canvas quando o Three entrar).
3. **Ownership de handles**: objeto JS embrulha handle via `napi_wrap` com
   finalizer que faz release no GC. Exceções NÃO-own (finalizeNoop): device e
   adapter (vivem no `HostGpu`, host libera no shutdown) e a textura da
   surface (host apresenta/libera 1x por frame em `presentIfAcquired`).
4. **Strings pra WGPUStringView**: a `std::string` precisa viver até a
   chamada wgpu (por isso os parsers recebem `std::string*` de fora).
5. **Deps pinadas** — nunca "latest". Atualização de versão é mudança
   deliberada (edite fetch-deps.ps1 e reteste os 3 marcos).

## Libs de terceiros no export nativo (regra de compatibilidade)

A promessa "o dev instala libs npm" continua, com a MESMA regra do React
Native (que roda milhares de libs sobre Hermes em produção):

- **JS puro funciona** (moment, dayjs, date-fns, lodash, uuid...) — sintaxe
  moderna é resolvida pelo pipeline (esbuild es2018 + Babel classes/arrows).
- **APIs de browser** funcionam SE estiverem nos shims (fetch, timers,
  TextDecoder, crypto...) — a lista cresce por demanda; faltou algo, é um
  shim novo, não um beco.
- **Não funcionam**: libs Node-only (fs/net), WASM, Intl pesado (Luxon;
  preferir dayjs/date-fns), e metaprogramação exótica (caso real: o CORE do
  zod v4 quebra no Hermes — resolvido trocando o runtime do engine pra
  `zod/v3` (subpath do próprio pacote v4), que roda no Hermes e valida DE
  VERDADE no host; o electron/Agent SDK segue no v4).
- Pendência de tooling: verificação de compatibilidade no BUILD (compilar a
  lib com hermesc + smoke) pra o dev descobrir na hora do bundle, não no
  console.

## Armadilhas conhecidas

- **`wgpuInstanceWaitAny` → panic "not implemented"** (wgpu-native v29).
  Aquisição assíncrona SEMPRE com `AllowProcessEvents` + loop de
  `wgpuInstanceProcessEvents` (ver `acquireAdapter`/`acquireDevice`).
- **`setImmediate` ausente = async/await morto**: o Hermes (fila de jobs
  nativa inativa) agenda continuações via `setImmediate`. Sem o shim, o boot
  morre com `ReferenceError` depois do primeiro `await`.
- **O Hermes NÃO tem sintaxe `class`** (nem async arrows). Por isso o
  bundle.mjs roda Babel depois do esbuild: `plugin-transform-classes` em
  **loose** (o modo spec usa Reflect.construct e morre com "super() hasn't
  been called") + `plugin-transform-arrow-functions` **no mesmo passe**
  (se o esbuild rebaixar arrows antes, ele iça `var _this = this` pra antes
  do super() e o transform de classes quebra). NÃO usar `-Xes6-class` do
  hermesc: o bytecode exige um runtime compilado com a flag
  (`HermesES6Internal` não existe na hermes.dll da Microsoft).
- **Booleans JS não passam em `napi_get_value_double`**: flags de descriptor
  (`mappedAtCreation`, `depthWriteEnabled`...) SEMPRE via `njs::getNamedBool`
  — foi bug real (buffer nunca mapeado → panic no getMappedRange).
- **`writeBuffer` tem 5 argumentos** na spec: (buffer, bufferOffset, data,
  dataOffset, size) com dataOffset/size em **elementos** do TypedArray.
  O Three usa todos — ignorar os dois últimos estoura o buffer.
- **`SDL_SetMainReady`/`SDL_main.h`**: não usamos; `main` puro funciona no
  SDL3. Incluir `SDL_main.h` redefine `main` e quebra o link.
- **hermes.exe é x86** (roda via WOW64) — caminho `tools/native/release/x86`.
  O bytecode gerado é portátil; a dll do runtime é x64.
- **vcvars64 obrigatório** pro CMake/Ninja acharem o `cl.exe` (Build Tools
  em `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools`).

## Como estender (receitas)

**Expor uma API WebGPU nova pro JS** (ex.: `createBuffer`):
1. Escolha o arquivo por responsabilidade (recursos → `device.cpp`;
   gravação → `commands.cpp`; apresentação → `surface.cpp`).
2. Escreva o callback `napi_value fn(napi_env, napi_callback_info)` usando
   `njs::` (unwrapThis pro handle nativo, getNamed* pro descriptor).
3. Enum novo em string? Adicione o par em `enums.*`.
4. Anexe com `njs::setMethod` no objeto certo (device/encoder/pass).
5. Compartilhado entre .cpp? Declare em `internal.h`.
6. Exercite no `boot.js`, recompile (o `.hbc` regenera sozinho) e rode.
7. Atualize a tabela acima se criou arquivo novo.

**Shim de browser novo** (ex.: `performance.now`): arquivo novo em `shims/`
com par `register*()`/`run*()` se precisar de tick do loop; registre no
`main.cpp`.

## Build & run

```powershell
powershell -File native/scripts/fetch-deps.ps1   # 1x (baixa deps pinadas)
# num prompt com vcvars64:
cmake -G Ninja -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
native/build/cortex_host.exe
```

Saída esperada hoje (M0, Marco C): janela com triângulo violeta, e no console
`[js] [boot] pipeline criado — WGSL compilado no backend D3D12`.

## Estado e próximos marcos

**M0 CONCLUÍDO em 2026-07-05** — conceito CortexNative validado de ponta a
ponta: Three.js WebGPURenderer renderizando cubo girando (MeshNormalMaterial,
depth, perspectiva) em bytecode Hermes sobre D3D12, sem browser.

- ✅ A: janela SDL3 + clear via WebGPU nativo (D3D12)
- ✅ B: Hermes embutido (bytecode .hbc), JS comanda o frame
- ✅ C: triângulo WGSL 100% definido em JS via navigator.gpu
- ✅ D: vertex buffer + uniform + bind group (triângulo girando)
- ✅ E: **cubo do Three.js girando** — bundle esbuild+Babel do three/webgpu,
  prelude de shims JS, layouts explícitos, depth texture, index buffer,
  viewport/scissor, mapeamento de buffer, error scopes

Limitações conhecidas: mapAsync (readback) e copyTextureToTexture não
existem; MSAA não testado.

**M1 — engine cortex completo no host**, validado com o jogo real teste4.
Plano completo com inventário e ordem de ataque:
`docs/cortex-native/m1-inventario-teste4.md`. Estado:
- ✅ Frente 1 — event bus (CustomEvent via document) + DOM-lite inerte
- ✅ Frente 2 — input: keydown/keyup/pointer SDL→JS (validado com tecla real)
  + Gamepad API standard sobre SDL_Gamepad
- ✅ Frente 3 — fetch/assets: GLB do kit do teste4 renderizado COM textura
  (files.cpp + stb_image + writeTexture/copyExternalImageToTexture +
  TextDecoder/atob/Blob/createImageBitmap em JS)
- ✅ Frente 4 (core) — Rapier NATIVO: crate Rust `native/rapier-native`
  (C ABI achatada, scratch compartilhado) + shims/rapier.cpp + adaptador
  `rapier-compat.js` com a forma da API compat (o bundle aponta o import
  do @dimforge/rapier3d-compat pra ele). Smoke: bola repousa no chão.
  **Pendências**: DynamicRayCastVehicleController (carro) e
  setAdditionalMassProperties — lança erro claro se usados.
- ✅ Frente 5 — áudio: decode via miniaudio (wav/mp3/flac, pinado) +
  playback por streams SDL3 (gain/pitch nativos, loop realimentado por
  frame); WebAudio-lite em JS com a forma que o THREE.Audio usa.
  **Pendência**: espacialização do PannerNode (PositionalAudio toca sem 3D).
- ✅ Frente 6 — **UI de runtime (ADR-0102) implementada e provada no jogo**:
  `src/ui/runtime/` no ENGINE (UiLayer + Panel/Label/Button ancorados, foco
  d-pad/setas NA API, `game.ui`) com DomUiBackend (Studio) e
  RendererUiBackend (host: cena ortográfica + `__cortexRasterText` via
  stb_truetype/Roboto pinada; **descarte de textura ADIADO 2 frames** —
  dispose imediato derruba o frame em voo). teste4 migrado (MainMenu +
  HUD do RushSystem): menu navegável e HUD ao vivo no host (screenshots).
  **Pendências**: migrar DialogueUI/LoadingScreen/Speedometer pra API;
  texto maior que o botão não recorta; re-vendorizar .d.ts pros jogos.

**TESTE PRÁTICO (2026-07-05): o teste4 REAL é JOGÁVEL no host.** Pipeline:
`node native/scripts/bundle.mjs <out> D:/jogos/teste4/main.ts` (CORTEX_LEVEL
opcional pula o menu) → hermesc → `cortex_host.exe D:\jogos\teste4`.
Menu nativo navegável → fase com visual COMPLETO (texturas embutidas via
URL/objectURL; blend ok) → HUD ao vivo (moedas/cronômetro). Pendência de
produto: empacotamento (boot.hbc gerado à mão na pasta do jogo).

Build do Rapier nativo: `cargo build --release` em `native/rapier-native/`
(1x; o CMake linka `target/release/rapier_native.dll.lib` e copia a dll).
