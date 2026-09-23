# build-host.ps1 -- configura e compila o host nativo (SPEC-0247).
#
# Uso:
#   yarn build:host
#   yarn build:host --Limpar
#   yarn build:host --Alvo cortex_host_tests
#   powershell -File native/scripts/build-host.ps1 -Worktree D:\caminho\da\worktree
#
# Este script existe porque compilar o host tem QUATRO cuidados que, errados,
# falham de um jeito que NAO acusa erro:
#
#  1. `cmake` so existe no PATH depois do vcvars64 -- e esse e o unico dos
#     quatro que da erro claro ("cmake nao e reconhecido").
#  2. O vcvars64 so vale para o processo FILHO. Chamar vcvars e cmake em
#     invocacoes separadas do cmd nao funciona: a segunda nao ve o ambiente da
#     primeira. Por isso as duas correm numa unica linha, com `&&`.
#  3. O compilador OFICIAL do host e o clang-cl, por caminho COMPLETO. Sem os
#     -DCMAKE_*_COMPILER o CMake pega o cl.exe da Build Tools SEM AVISAR, e a
#     validacao acontece num compilador diferente do que gera o release.
#  4. `native/build` NUNCA pode ser junction. O CMake guarda o
#     CMAKE_HOME_DIRECTORY no cache e passaria a compilar os fontes da OUTRA
#     worktree em silencio. (Junction de third_party, rapier-native/target e
#     node_modules, sim -- essas funcionam e economizam disco.)
#
# O que este script NAO faz, de proposito: nao baixa dependencia
# (`native/scripts/fetch-deps.ps1`), nao compila o engine (`yarn build:engine`)
# e nao empacota o Studio (`yarn electron:build`). Encadear tudo aqui esconderia
# qual etapa falhou.

param(
  # Raiz do repo ou da worktree a compilar. Padrao: a raiz deste repo.
  [string]$Worktree = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  # Alvo do CMake. `cortex_host_tests` compila so o harness (rapido).
  [string]$Alvo = 'cortex_host',
  [ValidateSet('Release', 'Debug', 'RelWithDebInfo')]
  [string]$BuildType = 'Release',
  # Apaga native/build antes. OBRIGATORIO quando fontes saem do CMakeLists.txt:
  # o build incremental deixa .obj orfaos e pode religar codigo removido.
  [switch]$Limpar
)

$ErrorActionPreference = 'Stop'

$CAMINHO_DO_CLANG = 'C:\Program Files\LLVM\bin\clang-cl.exe'
$CAMINHO_DO_VSWHERE = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"

# Pre-requisitos conferidos ANTES de comecar, com o que instalar -- em vez de
# falhar no meio do configure com mensagem do CMake.
if (-not (Test-Path $CAMINHO_DO_CLANG)) {
  throw "clang-cl nao encontrado em $CAMINHO_DO_CLANG. Instale o LLVM (https://releases.llvm.org/) -- e o compilador oficial do host."
}
if (-not (Test-Path $CAMINHO_DO_VSWHERE)) {
  throw "vswhere.exe nao encontrado em $CAMINHO_DO_VSWHERE. Instale o Visual Studio (ou as Build Tools) -- o vcvars64 vem com ele."
}

$raizDoVs = & $CAMINHO_DO_VSWHERE -latest -products * -property installationPath
if (-not $raizDoVs) { throw 'vswhere nao encontrou instalacao do Visual Studio.' }
$vcvars = Join-Path $raizDoVs 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { throw "vcvars64.bat nao encontrado em $vcvars" }

$fontes = Join-Path $Worktree 'native'
$build = Join-Path $fontes 'build'
if (-not (Test-Path (Join-Path $fontes 'CMakeLists.txt'))) {
  throw "nao achei native/CMakeLists.txt em $Worktree -- o -Worktree aponta para a raiz do repo, nao para native/."
}

# Cuidado 4: build como junction faria o CMake compilar outra worktree.
$itemDoBuild = Get-Item $build -ErrorAction SilentlyContinue
if ($itemDoBuild -and $itemDoBuild.LinkType) {
  throw "native/build e um $($itemDoBuild.LinkType) -- o CMake guarda o CMAKE_HOME_DIRECTORY no cache e compilaria os fontes de outra worktree em silencio. Remova o link e deixe o build ser um diretorio de verdade."
}

if ($Limpar -and (Test-Path $build)) {
  Write-Output "[build-host] limpando $build"
  Remove-Item $build -Recurse -Force
}

$configure = "cmake -G Ninja -S `"$fontes`" -B `"$build`" -DCMAKE_BUILD_TYPE=$BuildType " +
             "-DCMAKE_C_COMPILER=`"$CAMINHO_DO_CLANG`" -DCMAKE_CXX_COMPILER=`"$CAMINHO_DO_CLANG`""
$compilar = "cmake --build `"$build`" --target $Alvo"

Write-Output "[build-host] worktree: $Worktree"
Write-Output "[build-host] alvo: $Alvo ($BuildType)"

# Cuidados 1 e 2: vcvars e cmake na MESMA invocacao do cmd.
& cmd /c "call `"$vcvars`" >nul && $configure && $compilar"
if ($LASTEXITCODE -ne 0) { throw "build falhou (exit $LASTEXITCODE)" }

Write-Output "[build-host] OK"
