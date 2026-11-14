# SPEC-0731 - DXC no lugar do FXC

**Data:** 2026-11-13
**Status:** implementado

## Contexto

No export nativo do Port Hollow, o `game.precompile` leva ~12 s. Medido com cada `wgpuDeviceCreateRenderPipeline`
cronometrado no C++ (Ryzen 5 5600G, RX 6600):

- 70 render pipelines custam 8,3 s, e os 53 shader modules só 75 ms. O naga (WGSL → HLSL) é barato; o caro é compilar
  o HLSL.
- Um pipeline que reaproveita um shader já compilado leva 0,5–1,6 ms, incluindo o PSO do driver. O custo está no
  compilador de shader, não no driver.
- Rodar de novo na mesma máquina só tira 5–10%: o cache de shader do driver não cobre esse passo.

O host cria a instância D3D12 sem escolher o compilador (`native/src/core/app_window.cpp`). Com
`dx12ShaderCompiler = Undefined`, o wgpu-native usa o **FXC** (`D3DCompile`), que o próprio `wgpu.h` descreve como
"old, slow, and unmaintained". O FXC roda na CPU, numa thread só. No i7-3770K do teste do usuário, ~1,7× mais lento
por núcleo que o 5600G, esse passo deve passar de 13 s.

## Decisão

- O host usa o **DXC** (`dxcompiler.dll`) quando ele está na pasta do executável **e carrega**. Sem a DLL, usa o
  FXC, como hoje. A escolha fica em `native/src/core/dx12_compiler.{h,cpp}`, testada em
  `native/tests/dx12_compiler_test.cpp`.
  - Antes de escolher, o host carrega a DLL (`LoadLibraryEx`) e confere o `DxcCreateInstance`. O wgpu não volta
    sozinho para o FXC: com o DXC pedido e uma DLL que não carrega (x86, truncada, de outro programa), a instância
    fica sem backend e o erro só apareceria como "sem adapter".
  - `WGPUInstanceExtras.dx12ShaderCompiler = WGPUDx12Compiler_Dxc` e `dxcPath` com o caminho **absoluto** da DLL.
    Com o `dxcPath` vazio o wgpu procura no PATH do sistema, e é melhor não depender disso.
  - `CORTEX_DX12_COMPILER=fxc` (sem diferenciar maiúsculas) força o FXC, para comparar e como saída de emergência.
  - O log do host diz qual compilador entrou: `[gpu] compilador de shader: DXC (<caminho>)` ou `FXC (<motivo>)`.
- Versão pinada: DXC **v1.9.2609** (`dxc_2026_09_29.zip`, sha256
  `ad31b1fc8443175d204f77a611fdb3ef2ec42759bdc2f1167368de24a4a7e7f1`), da release oficial em
  `github.com/microsoft/DirectXShaderCompiler`. O wgpu-native v29 exige DXC v1.8.2502 ou mais nova. A partir dessa
  versão o `dxil.dll` não é mais necessário.
- `native/scripts/fetch-deps.ps1` baixa o zip, confere o sha256 (recusa se não bater) e extrai em `third_party/dxc`.
  Mudar o script muda a chave do cache de deps do CI, e o CI baixa tudo de novo. A listagem do `basis_universal`, que
  usa a API do GitHub, passa a mandar o `GITHUB_TOKEN` do Actions quando ele existe
  (`.github/actions/build-native-host/action.yml`). Sem o token, o IP compartilhado do runner estourava o limite da
  API e o job do host falhava sem relação com o PR.
- O build copia o `dxcompiler.dll` para o lado do `cortex_host.exe` (`host_runtime_files`). A cópia é decidida na
  hora do build (`native/scripts/copy-if-exists.cmake`), não no configure: uma pasta de build configurada antes do
  `fetch-deps` baixar o DXC (`build-steam`, `build-gdk`) também recebe a DLL no próximo `cmake --build`. O
  `native/scripts/export-game.mjs` leva o `dxcompiler.dll` para o export quando ele existe no build.

## Consequências

- A compilação dos shaders, que é a maior parte do `precompile`, fica mais rápida. A medida está abaixo.
- O export cresce o tamanho do `dxcompiler.dll` (~20 MB).
- O DXC gera DXIL (Shader Model 6). Toda GPU com D3D12 e driver atual o aceita, inclusive a RX 580 com o Adrenalin.
- O DXC também é o compilador padrão do caminho console (GDK).
- Um bug do DXC com o HLSL do naga apareceria como shader que não compila ou imagem diferente. O
  `CORTEX_DX12_COMPILER=fxc` volta ao FXC sem rebuild.

## Medida

Export nativo do Port Hollow, Ryzen 5 5600G e RX 6600, `?menu=0&intro=0&cortexDebug=boot,perf`. É o mesmo export
nas rodadas, intercaladas, e o FXC entra com `CORTEX_DX12_COMPILER=fxc`:

| | DXC (4 rodadas) | FXC (3 rodadas) |
|---|---|---|
| `game.precompile` | 6,2–6,6 s | 10,8–12,1 s |
| soma dos 66 pipelines | 2,4–2,6 s | 6,8–8,2 s |
| pipeline com `receiveShadow` (média de 32) | 60–66 ms | 181–224 ms |
| primeiro quadro jogável | 42,7–43,7 s | 47,7–48,5 s |

O DXC compila os shaders ~3× mais rápido. O `precompile` cai ~5 s (~45%), e o primeiro quadro jogável cai o
mesmo tanto. O que sobra no `precompile` (~4 s) é a varredura em JS. Numa CPU mais lenta por núcleo, como a do
i7-3770K, o ganho absoluto deve ser maior, porque o FXC é o trecho que mais escala com ela.
