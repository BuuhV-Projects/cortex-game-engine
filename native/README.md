# CortexNative — host nativo (PRD-0004)

Runtime nativo do cortex-game-engine: executa o JavaScript do jogo **sem
browser** — Hermes (JS) + wgpu-native (WebGPU → D3D12) + SDL3 (janela/input/
áudio). É o caminho de port para console (Xbox/GDK) e, no futuro, um export
PC "nativo premium" opcional (o Tauri segue como caminho leve de PC).

## Status: M0 em andamento

- ✅ **Marco A** — janela SDL3 + clear color via WebGPU nativo, backend D3D12
- ✅ **Marco B** — Hermes embutido; `tick()` em JS comanda a cor de cada frame
  (ciclo JS → Node-API → WebGPU → GPU provado)
- ⬜ Bundle `.hbc` via `hermesc` (hoje o script de boot é inline)
- ⬜ Shim `navigator.gpu` completo via JSI (o que o Three WebGPURenderer usa)
- ⬜ Cubo do Three.js renderizado pelo host (meta final do M0)

## Build

Pré-requisitos: VS Build Tools (MSVC x64), CMake e Ninja (os dois vêm no
Build Tools). Deps prebuilt são baixadas por script (versões pinadas):

```powershell
# 1. baixa SDL3 3.4.12, wgpu-native v29.0.1.1, Hermes 0.1.27 (NuGet MS)
powershell -File native/scripts/fetch-deps.ps1

# 2. configura + compila (num prompt com vcvars64)
cmake -G Ninja -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build

# 3. roda
native/build/cortex_host.exe
```

`third_party/` e `build/` são gitignorados — só código e scripts vão pro repo.

## Decisões (a formalizar em ADR quando o M0 fechar)

- **wgpu-native** (e não Dawn) pro bootstrap: prebuilt com header C
  (`webgpu.h`), trivial de linkar. Dawn continua candidata — o código usa a
  API padrão `webgpu.h`, então a troca é possível. Backend **D3D12 forçado**
  (`WGPUInstanceExtras`) pra manter paridade com o caminho console desde já.
- **Hermes via NuGet da Microsoft** (`Microsoft.JavaScript.Hermes`):
  embedding pela API C estável (`jsr_*` + Node-API), ABI-safe — sem compilar
  o Hermes do zero. O `tools/` do pacote traz o `hermes.exe` (compilador de
  bytecode pro futuro passo `.hbc`).
- `wgpuInstanceWaitAny` não é implementado no wgpu-native v29 — aquisição de
  adapter/device usa `AllowProcessEvents` + `wgpuInstanceProcessEvents`.
