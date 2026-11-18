# build-host.ps1 -- compila o Rapier nativo e o host (SPEC-0247, SPEC-0260).
#
# `yarn build:host` compila o host nas DUAS saidas do mesmo codigo: `native/build`
# (CORTEX_STEAM=OFF, host padrao) e `native/build-steam` (ON, linka o Steamworks
# SDK). Os dois exports -- comum e Steam -- conferem seu respectivo host (SPEC-0660),
# entao manter so um em dia deixava o outro desatualizado sem ninguem ver. O
# build-steam e pulado com aviso quando o SDK nao esta presente (e opt-in). Os
# alvos de teste geram so o `build`.
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
  # Apaga os diretorios de build antes (os dois: build e build-steam). OBRIGATORIO
  # quando fontes saem do CMakeLists.txt: o build incremental deixa .obj orfaos e
  # pode religar codigo removido.
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
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw 'cargo nao encontrado no PATH. Instale o Rust (https://rustup.rs/) -- ele compila o rapier_native.dll que o host linka.'
}
if (-not (Test-Path $CAMINHO_DO_VSWHERE)) {
  throw "vswhere.exe nao encontrado em $CAMINHO_DO_VSWHERE. Instale o Visual Studio (ou as Build Tools) -- o vcvars64 vem com ele."
}

$raizDoVs = & $CAMINHO_DO_VSWHERE -latest -products * -property installationPath
if (-not $raizDoVs) { throw 'vswhere nao encontrou instalacao do Visual Studio.' }
$vcvars = Join-Path $raizDoVs 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { throw "vcvars64.bat nao encontrado em $vcvars" }

$fontes = Join-Path $Worktree 'native'
if (-not (Test-Path (Join-Path $fontes 'CMakeLists.txt'))) {
  throw "nao achei native/CMakeLists.txt em $Worktree -- o -Worktree aponta para a raiz do repo, nao para native/."
}

# Rapier nativo ANTES do CMake (SPEC-0260). O host linka a DLL de
# rapier-native/target/release, mas o CMake nao a compila: sem este passo o
# host linka contra a DLL anterior sem erro nenhum, e a funcao nova so falta
# em runtime ("undefined is not a function" no export). DLL em dia = poucos
# segundos.
$crate = Join-Path $fontes 'rapier-native'
$itemDoTarget = Get-Item (Join-Path $crate 'target') -ErrorAction SilentlyContinue
if ($itemDoTarget -and $itemDoTarget.LinkType) {
  Write-Warning "rapier-native/target e $($itemDoTarget.LinkType) para $($itemDoTarget.Target) -- o cargo vai escrever la, e a DLL daquele repo passa a ser a desta worktree."
}
Write-Output "[build-host] rapier-native: cargo build --release"
& cargo build --release --manifest-path (Join-Path $crate 'Cargo.toml')
if ($LASTEXITCODE -ne 0) { throw "cargo build do rapier-native falhou (exit $LASTEXITCODE)" }

# Duas saidas do mesmo codigo-fonte (SPEC-0247): `build` (CORTEX_STEAM=OFF, host
# padrao) e `build-steam` (ON, linka o Steamworks SDK). O export de Steam confere
# o `build-steam` (SPEC-0660), o export comum confere o `build` -- compilar os
# dois aqui evita o host desatualizado de um deles passar despercebido.
# So `cortex_host` gera os dois: os alvos de teste nao linkam Steam, entao um so.
$saidas = @( @{ Dir = Join-Path $fontes 'build'; Steam = 'OFF' } )
if ($Alvo -eq 'cortex_host') {
  # O SDK e OPT-IN e pre-requisito (nao vem no fetch-deps). Sem ele, CORTEX_STEAM=ON
  # da FATAL_ERROR no configure (CMakeLists.txt) -- pular com aviso e melhor que
  # derrubar o build normal de quem nao tem Steam.
  $sdkSteam = if ($env:STEAMWORKS_SDK) { $env:STEAMWORKS_SDK } else { Join-Path $fontes 'third_party/steamworks' }
  if (Test-Path (Join-Path $sdkSteam 'public/steam/steam_api.h')) {
    $saidas += @{ Dir = Join-Path $fontes 'build-steam'; Steam = 'ON' }
  } else {
    Write-Warning "[build-host] Steamworks SDK nao encontrado em '$sdkSteam' -- pulando build-steam. O export de Steam precisa dele; baixe em partner.steamgames.com e extraia p/ native/third_party/steamworks (ou defina STEAMWORKS_SDK)."
  }
}

# host_runtime_files copia as DLLs e grava o selo que o export confere (SPEC-0660).
$alvos = if ($Alvo -eq 'cortex_host') { 'cortex_host host_runtime_files' } else { $Alvo }

Write-Output "[build-host] worktree: $Worktree"
Write-Output "[build-host] alvo: $Alvo ($BuildType)"

foreach ($saida in $saidas) {
  $build = $saida.Dir

  # Cuidado 4: build como junction faria o CMake compilar outra worktree.
  $itemDoBuild = Get-Item $build -ErrorAction SilentlyContinue
  if ($itemDoBuild -and $itemDoBuild.LinkType) {
    throw "$build e um $($itemDoBuild.LinkType) -- o CMake guarda o CMAKE_HOME_DIRECTORY no cache e compilaria os fontes de outra worktree em silencio. Remova o link e deixe o build ser um diretorio de verdade."
  }
  if ($Limpar -and (Test-Path $build)) {
    Write-Output "[build-host] limpando $build"
    Remove-Item $build -Recurse -Force
  }

  $configure = "cmake -G Ninja -S `"$fontes`" -B `"$build`" -DCMAKE_BUILD_TYPE=$BuildType " +
               "-DCMAKE_C_COMPILER=`"$CAMINHO_DO_CLANG`" -DCMAKE_CXX_COMPILER=`"$CAMINHO_DO_CLANG`" " +
               "-DCORTEX_STEAM=$($saida.Steam)"
  $compilar = "cmake --build `"$build`" --target $alvos"

  Write-Output "[build-host] compilando $build (CORTEX_STEAM=$($saida.Steam))"
  # Cuidados 1 e 2: vcvars e cmake na MESMA invocacao do cmd.
  & cmd /c "call `"$vcvars`" >nul && $configure && $compilar"
  if ($LASTEXITCODE -ne 0) { throw "build de $build falhou (exit $LASTEXITCODE)" }
}

Write-Output "[build-host] OK"
