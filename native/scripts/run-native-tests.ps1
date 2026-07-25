# Roda os testes unitários do host (TDR-0004): builda o alvo cortex_host_tests
# no dev shell do VS e executa. Exit code = nº de falhas (0 = verde).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# cmake do Visual Studio (mesmo usado pra configurar native/build) + vcvars.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsPath = & $vswhere -latest -products * -property installationPath
if (-not $vsPath) { throw 'Visual Studio (Build Tools) não encontrado' }
$cmake = Join-Path $vsPath 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
$vcvars = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'

cmd /c "`"$vcvars`" >nul 2>&1 && `"$cmake`" --build `"$root\build`" --target cortex_host_tests"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& "$root\build\cortex_host_tests.exe"
exit $LASTEXITCODE
