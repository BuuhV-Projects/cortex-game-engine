# CortexNative — host nativo (PRD-0004)

Runtime nativo do cortex-game-engine: executa o JavaScript do jogo **sem
browser** — Hermes (JS) + wgpu-native (WebGPU → D3D12) + SDL3. É o caminho de
port pra console (Xbox/GDK); no PC, o Tauri segue como export leve
(ADR-0024) e este host vira, no futuro, o export "nativo premium".

**Manutenção é AI-first**: antes de mexer, leia o mapa vivo —
[`docs/cortex-native/architecture.md`](../docs/cortex-native/architecture.md)
— que explica módulo a módulo, o fluxo de frame, as regras (SOLID, ownership
de handles, API fiel ao browser), as armadilhas conhecidas e as receitas de
extensão. Toda mudança estrutural atualiza esse doc na mesma mudança.

## Documentos de referência

| Doc | O que explica |
|---|---|
| [PRD-0004](../docs/prds/0004-cortex-native-port-console-xbox.md) | Por que existe, plano completo do port console (M0–M4), portões ID@Xbox |
| [ADR-0094](../docs/adrs/0094-cortex-native-stack-do-host-m0.md) | Decisões de stack: Hermes/NuGet, wgpu-native/D3D12, SDL3, bytecode, SOLID |
| [architecture.md](../docs/cortex-native/architecture.md) | **Mapa vivo**: módulos, frame, regras, armadilhas, receitas, build |

## Status: M0 em andamento

- ✅ **Marco A** — janela SDL3 + clear via WebGPU nativo, backend D3D12
- ✅ **Marco B** — Hermes embutido; boot em bytecode `.hbc` (hermesc no build)
- ✅ **Marco C** — triângulo WGSL 100% comandado pelo JS via `navigator.gpu`
- ⬜ **Marco D** — buffers/bind groups/uniforms
- ⬜ **Marco E** — Three.js WebGPURenderer renderizando um cubo (fim do M0)

## Build rápido

```powershell
powershell -File native/scripts/fetch-deps.ps1   # 1x — deps pinadas
# num prompt com vcvars64 (VS Build Tools):
cmake -G Ninja -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
native/build/cortex_host.exe
```

`third_party/` e `build/` são gitignorados — só código, scripts e docs vão
pro repo. Versões das deps: ver `scripts/fetch-deps.ps1` (pinadas; nunca
"latest").

## Estrutura

```
native/
├── js/boot.js          # boot do jogo (hoje: triângulo) → boot.hbc no build
├── scripts/            # fetch-deps.ps1 (deps prebuilt pinadas)
└── src/
    ├── main.cpp        # composition root + loop (sem lógica própria)
    ├── core/           # janela/surface (SDL3+D3D12) e runtime JS (Hermes)
    ├── napi/           # helpers Node-API genéricos (njs::)
    ├── shims/          # timers, requestAnimationFrame (browser-like)
    └── webgpu/         # navigator.gpu por responsabilidade (ver internal.h)
```
