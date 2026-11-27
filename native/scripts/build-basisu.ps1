# build-basisu.ps1 -- compila o encoder NATIVO do basis_universal (o CLI `basisu`)
# que o cook usa nas texturas acima do teto do encoder WASM (SPEC-0750, ADR-0751).
#
# O WASM recusa fonte com mais de 12.582.912 texels (fixo na compilacao dele); o
# encoder C++ so limita o lado a 16384, entao 4096² passa sem reduzir. O fonte
# vem do MESMO commit fixado do transcoder e do WASM (fetch-deps.ps1 baixa em
# native/third_party/_downloads/basisu-src/). Saida: native/tools/basisu/basisu.exe
# (fora do git, como o basis-encoder WASM).
#
# Uso:
#   powershell -File native/scripts/build-basisu.ps1 [-Fontes <pasta do basis_universal>]
#
# Mesma receita do build-host.ps1: vcvars64 e cmake na MESMA invocacao do cmd, e
# o clang-cl por caminho completo (sem isso o CMake pega o cl.exe sem avisar).

param(
  [string]$Fontes = ''
)
$ErrorActionPreference = 'Stop'

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BASISU_COMMIT = 'e4f439fc9545b6a9e1fd26fc7ffd0c682c4b96d4'   # SHA da tag v2_1_0r (fetch-deps.ps1)
if (-not $Fontes) {
  $Fontes = Join-Path $raiz "native\third_party\_downloads\basisu-src\basis_universal-$BASISU_COMMIT"
}
if (-not (Test-Path (Join-Path $Fontes 'basisu_tool.cpp'))) {
  throw "fonte do basis_universal nao encontrado em $Fontes (rode native/scripts/fetch-deps.ps1)"
}

$CAMINHO_DO_CLANG = 'C:\Program Files\LLVM\bin\clang-cl.exe'
if (-not (Test-Path $CAMINHO_DO_CLANG)) { throw "clang-cl nao encontrado em $CAMINHO_DO_CLANG" }
$CAMINHO_DO_VSWHERE = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $CAMINHO_DO_VSWHERE)) { throw "vswhere.exe nao encontrado em $CAMINHO_DO_VSWHERE" }
$raizDoVs = & $CAMINHO_DO_VSWHERE -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars = Join-Path $raizDoVs 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { throw "vcvars64.bat nao encontrado em $vcvars" }

# Cache do CMake fora da pasta do fonte. O exe, porem, sai em <fonte>/bin: o
# CMakeLists do basis fixa CMAKE_RUNTIME_OUTPUT_DIRECTORY com set() (vence o -D).
$build = Join-Path $raiz 'native\build-basisu'
$saida = Join-Path $raiz 'native\tools\basisu'
New-Item -ItemType Directory -Force $build, $saida | Out-Null

# Sem os exemplos e sem OpenCL; SSE 4.1 e Zstd ligados (o KTX2 do cook e UASTC+Zstd).
# O CMake do basis so liga o SSE 4.1 para MSVC/GCC; no clang-cl a flag vai a mao.
# CRT estatico (/MT): o exe vai sozinho no Studio empacotado, sem o VC++
# Redistributable. O BASISU_STATIC do basis nao vale no clang-cl (fica num ramo
# `if (NOT MSVC)`), entao o runtime e escolhido pelo CMake (politica CMP0091).
$configure = "cmake -G Ninja -S `"$Fontes`" -B `"$build`" -DCMAKE_BUILD_TYPE=Release " +
             "-DCMAKE_C_COMPILER=`"$CAMINHO_DO_CLANG`" -DCMAKE_CXX_COMPILER=`"$CAMINHO_DO_CLANG`" " +
             "-DBASISU_EXAMPLES=OFF -DBASISU_OPENCL=OFF -DBASISU_SSE=ON -DBASISU_ZSTD=ON -DBASISU_STATIC=ON " +
             "-DCMAKE_C_FLAGS=-msse4.1 -DCMAKE_CXX_FLAGS=-msse4.1 " +
             "-DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded"
$compilar = "cmake --build `"$build`" --target basisu"
& cmd /c "call `"$vcvars`" >nul && $configure && $compilar"
if ($LASTEXITCODE -ne 0) { throw "build do basisu falhou (codigo $LASTEXITCODE)" }

# O CMakeLists do basis fixa CMAKE_RUNTIME_OUTPUT_DIRECTORY em <fonte>/bin.
$exe = Join-Path $Fontes 'bin/basisu.exe'
if (-not (Test-Path $exe)) { throw "basisu.exe nao saiu do build em $exe" }
# Reprova o exe que ainda depende do runtime dinamico do VC++ (falharia no
# Studio instalado numa maquina sem o redistribuivel).
$CAMINHO_DO_OBJDUMP = 'C:\Program Files\LLVM\bin\llvm-objdump.exe'
$DLLS_DO_CRT_DINAMICO = 'MSVCP140|VCRUNTIME140|api-ms-win-crt-'
$imports = & $CAMINHO_DO_OBJDUMP -p $exe | Select-String 'DLL Name'
$crt = $imports | Where-Object { $_ -match $DLLS_DO_CRT_DINAMICO }
if ($crt) { throw "basisu.exe ainda importa o CRT dinamico: $($crt -join '; ')" }
Copy-Item $exe (Join-Path $saida 'basisu.exe') -Force
Write-Host "basisu.exe -> $saida" -ForegroundColor Green
