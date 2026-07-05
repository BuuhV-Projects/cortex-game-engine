# Baixa as dependências prebuilt do host nativo (CortexNative, PRD-0004).
# Versões PINADAS — atualizar deliberadamente, nunca "latest".
# Uso:  powershell -ExecutionPolicy Bypass -File native/scripts/fetch-deps.ps1

$ErrorActionPreference = 'Stop'

$SDL_VERSION   = '3.4.12'
$WGPU_VERSION  = 'v29.0.1.1'
$HERMES_VERSION = '0.1.27'   # NuGet Microsoft.JavaScript.Hermes (fork microsoft/hermes-windows)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tp = Join-Path $root 'third_party'
$dl = Join-Path $tp '_downloads'
New-Item -ItemType Directory -Force $dl | Out-Null

function Fetch($name, $url, $zip) {
    $dest = Join-Path $dl $zip
    if (-not (Test-Path $dest)) {
        Write-Host "baixando $name ..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $dest
    } else {
        Write-Host "$name já baixado" -ForegroundColor DarkGray
    }
    return $dest
}

# ── SDL3 (janela/input/áudio; tem suporte oficial GDK pro futuro console) ──
$sdlZip = Fetch 'SDL3' "https://github.com/libsdl-org/SDL/releases/download/release-$SDL_VERSION/SDL3-devel-$SDL_VERSION-VC.zip" "SDL3-$SDL_VERSION.zip"
$sdlDir = Join-Path $tp 'SDL3'
if (-not (Test-Path $sdlDir)) {
    Expand-Archive $sdlZip -DestinationPath $tp
    Rename-Item (Join-Path $tp "SDL3-$SDL_VERSION") $sdlDir
}

# ── wgpu-native (WebGPU nativo → D3D12; alternativa: Dawn, decidir no M0) ──
$wgpuZip = Fetch 'wgpu-native' "https://github.com/gfx-rs/wgpu-native/releases/download/$WGPU_VERSION/wgpu-windows-x86_64-msvc-release.zip" "wgpu-$WGPU_VERSION.zip"
$wgpuDir = Join-Path $tp 'wgpu'
if (-not (Test-Path $wgpuDir)) {
    Expand-Archive $wgpuZip -DestinationPath $wgpuDir
}

# ── stb_image (decode de PNG/JPG das texturas GLB; header único, pinado) ──
$STB_COMMIT = '5c205738c191bcb0abc65c4febfa9bd25ff35234'
$stbDir = Join-Path $tp 'stb'
if (-not (Test-Path (Join-Path $stbDir 'stb_image.h'))) {
    New-Item -ItemType Directory -Force $stbDir | Out-Null
    Write-Host 'baixando stb_image ...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nothings/stb/$STB_COMMIT/stb_image.h" -OutFile (Join-Path $stbDir 'stb_image.h')
}

# ── miniaudio (DECODE de wav/mp3/flac; header único, pinado por tag) ──
$MINIAUDIO_TAG = '0.11.21'
$maDir = Join-Path $tp 'miniaudio'
if (-not (Test-Path (Join-Path $maDir 'miniaudio.h'))) {
    New-Item -ItemType Directory -Force $maDir | Out-Null
    Write-Host 'baixando miniaudio ...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mackron/miniaudio/$MINIAUDIO_TAG/miniaudio.h" -OutFile (Join-Path $maDir 'miniaudio.h')
}

# ── Hermes (runtime JS; fork Windows da Microsoft, via NuGet) ──
$hermesZip = Fetch 'Hermes' "https://www.nuget.org/api/v2/package/Microsoft.JavaScript.Hermes/$HERMES_VERSION" "hermes-$HERMES_VERSION.nupkg.zip"
$hermesDir = Join-Path $tp 'hermes'
if (-not (Test-Path $hermesDir)) {
    Expand-Archive $hermesZip -DestinationPath $hermesDir
}

Write-Host "deps prontas em native/third_party/" -ForegroundColor Green
