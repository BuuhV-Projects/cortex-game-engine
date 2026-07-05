# CortexNative — arquitetura do host nativo

> **Fonte de verdade viva** do host nativo (`native/`). Leia a seção relevante
> ANTES de mexer; ATUALIZE na mesma mudança quando alterar fluxo, módulo ou
> descobrir armadilha nova. Manutenção é **AI-first**: este doc existe pra uma
> sessão de IA (ou um humano novo) pegar qualquer parte sem arqueologia.
>
> Contexto de produto: `docs/prds/0004-cortex-native-port-console-xbox.md`.
> Decisões de stack: `docs/adrs/0094-cortex-native-stack-do-host-m0.md`.

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
| `native/src/webgpu/bindings.h` | API pública do módulo: `registerBindings`, `presentIfAcquired`. Fora do módulo, só inclua este. |
| `native/src/webgpu/internal.h` | Contratos entre os .cpp do módulo (callbacks repartidos). |
| `native/src/webgpu/navigator.cpp` | `navigator.gpu` (requestAdapter, formato preferido) + dono do `gpuState()`. |
| `native/src/webgpu/device.cpp` | requestDevice, createShaderModule (WGSL), createRenderPipeline (parsers por sub-estado). |
| `native/src/webgpu/buffers.cpp` | Recursos de DADOS: createBuffer, writeBuffer (TypedArray/ArrayBuffer→GPU), createBindGroup, global `GPUBufferUsage`. |
| `native/src/webgpu/commands.cpp` | Encoder, render pass (parsers de attachment/clearValue), setBindGroup/setVertexBuffer, queue.submit. |
| `native/src/webgpu/surface.cpp` | `gpuContext` (configure/getCurrentTexture) e present. |
| `native/src/webgpu/enums.*` | Mapas string↔enum ('bgra8unorm', 'triangle-list'...). |
| `native/js/boot.js` | Script de boot (hoje: triângulo WGSL). Compilado pra `boot.hbc` no build. |
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

## Armadilhas conhecidas

- **`wgpuInstanceWaitAny` → panic "not implemented"** (wgpu-native v29).
  Aquisição assíncrona SEMPRE com `AllowProcessEvents` + loop de
  `wgpuInstanceProcessEvents` (ver `acquireAdapter`/`acquireDevice`).
- **`setImmediate` ausente = async/await morto**: o Hermes (fila de jobs
  nativa inativa) agenda continuações via `setImmediate`. Sem o shim, o boot
  morre com `ReferenceError` depois do primeiro `await`.
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

- ✅ A: janela SDL3 + clear via WebGPU nativo (D3D12)
- ✅ B: Hermes embutido (bytecode .hbc), JS comanda o frame
- ✅ C: triângulo WGSL 100% definido em JS via navigator.gpu
- ✅ D: vertex buffer + uniform + bind group (triângulo girando; JS escreve o
  uniform por frame via queue.writeBuffer)
- ⬜ E: superfície WebGPU que o Three WebGPURenderer usa + shims DOM mínimos
  (canvas, TextDecoder...) → **cubo do Three.js girando = fim do M0**

Limitação conhecida do Marco D: mapeamento de buffer (mapAsync/getMappedRange
/mappedAtCreation) ainda não existe — só escrita via queue.writeBuffer.
