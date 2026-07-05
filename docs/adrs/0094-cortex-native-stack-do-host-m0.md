# 0094 - CortexNative: stack do host nativo (M0)

**Data:** 2026-07-05
**Status:** aceito

## Contexto

O PRD-0004 define o port 100% nativo pra console (Xbox/GDK): executar o
JavaScript do jogo sem browser. O M0 é a prova de conceito no PC. Este ADR
registra as decisões de stack tomadas ao implementar os Marcos A–C
(janela+render nativo → Hermes embutido → triângulo WGSL comandado pelo JS).

## Decisão

Stack do host (`native/`), todas as deps prebuilt e pinadas
(`native/scripts/fetch-deps.ps1`):

1. **Runtime JS: Hermes via NuGet `Microsoft.JavaScript.Hermes`** (fork
   `microsoft/hermes-windows`). Embedding pela **API C estável**
   (`jsr_*` + Node-API), não pelos headers C++ do JSI — ABI-safe com a
   `hermes.dll` prebuilt, sem compilar o Hermes do zero. O pacote traz o
   `hermes.exe` (compilador): o boot roda de **bytecode `.hbc`** gerado no
   build (console não faz parse de JS em runtime; o PC segue igual por
   paridade). QuickJS foi considerado (precedente ChowJS em consoles) e fica
   como alternativa se o Hermes travar no caminho console.

2. **Gráficos: wgpu-native (WebGPU nativo) com backend D3D12 forçado.**
   O cortex exige WebGPU (`Renderer.ts`), então o host expõe `navigator.gpu`
   — **nenhuma simulação de WebGL em camada nenhuma**. wgpu-native (e não
   Dawn) pro bootstrap por pragmatismo: release prebuilt com header C padrão
   (`webgpu.h`). Como o shim programa contra a API padrão, trocar por Dawn
   depois é possível. D3D12 explícito (`WGPUInstanceExtras.backends`) pra
   manter PC e Xbox na mesma pilha gráfica desde o primeiro frame.

3. **Plataforma: SDL3** (janela/input/áudio) — tem suporte oficial GDK/GDKX,
   o que dá o caminho de console sem trocar de biblioteca.

4. **Shims fiéis ao browser** (`navigator.gpu`, `requestAnimationFrame`,
   `setTimeout`/`setImmediate`): o código JS não sabe que não está num
   browser. É o que permite apontar o Three.js WebGPURenderer pro host nos
   próximos marcos sem forkear o Three.

5. **Organização SOLID em módulos por domínio** (`core/`, `napi/`, `shims/`,
   `webgpu/`): arquivos pequenos, responsabilidade única, condições de loop
   extraídas em funções nomeadas. Manutenção é AI-first: cada módulo tem
   cabeçalho explicando o que é, e o mapa vivo fica em
   `docs/cortex-native/architecture.md`.

## Consequências

- O mesmo bundle JS do jogo roda no browser (Studio/Tauri) e no host — a
  paridade é a API, não a implementação.
- `wgpuInstanceWaitAny` não é implementado no wgpu-native v29 (panic): toda
  aquisição assíncrona usa `AllowProcessEvents` + `wgpuInstanceProcessEvents`
  (armadilha documentada no architecture.md).
- O Hermes agenda continuações de async/await via `setImmediate` quando a
  fila de jobs nativa não está ativa — o shim de timers é obrigatório, não
  cosmético.
- Node-API pura (sem JSI C++) custa um pouco de verbosidade nos bindings; em
  troca, nunca quebramos ABI com a dll prebuilt.
- Dawn×wgpu e Hermes×QuickJS serão reavaliados com benchmark quando o Three
  estiver rodando (fim do M0), antes do compromisso de console (M3).
