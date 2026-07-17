# Baixa as dependências prebuilt do host nativo (CortexNative, PRD-0004).
# Versões PINADAS — atualizar deliberadamente, nunca "latest".
# Uso:  powershell -ExecutionPolicy Bypass -File native/scripts/fetch-deps.ps1

$ErrorActionPreference = 'Stop'

$SDL_VERSION   = '3.4.12'
$WGPU_VERSION  = 'v29.0.1.1'
# (o runtime Hermes agora vem do clone pinado de facebook/hermes — ver o fim
#  deste script; o NuGet da MS foi aposentado no ADR-0122)

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
New-Item -ItemType Directory -Force $stbDir | Out-Null
if (-not (Test-Path (Join-Path $stbDir 'stb_image.h'))) {
    Write-Host 'baixando stb_image ...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nothings/stb/$STB_COMMIT/stb_image.h" -OutFile (Join-Path $stbDir 'stb_image.h')
}
if (-not (Test-Path (Join-Path $stbDir 'stb_truetype.h'))) {
    Write-Host 'baixando stb_truetype ...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nothings/stb/$STB_COMMIT/stb_truetype.h" -OutFile (Join-Path $stbDir 'stb_truetype.h')
}

# ── fonte oficial da UI de runtime (ADR-0102/0103) — Roboto MEDIUM, tag pinada.
# É a MESMA que o Studio embute via @font-face (src/ui/runtime/uiFont.ts), pro
# preview bater com o export. ──
$fontDir = Join-Path $tp 'fonts'
if (-not (Test-Path (Join-Path $fontDir 'Roboto-Medium.ttf'))) {
    New-Item -ItemType Directory -Force $fontDir | Out-Null
    Write-Host 'baixando Roboto Medium ...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/googlefonts/roboto-2/v2.138/src/hinted/Roboto-Medium.ttf' -OutFile (Join-Path $fontDir 'Roboto-Medium.ttf')
}

# ── miniaudio (DECODE de wav/mp3/flac; header único, pinado por tag) ──
$MINIAUDIO_TAG = '0.11.21'
$maDir = Join-Path $tp 'miniaudio'
if (-not (Test-Path (Join-Path $maDir 'miniaudio.h'))) {
    New-Item -ItemType Directory -Force $maDir | Out-Null
    Write-Host 'baixando miniaudio ...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mackron/miniaudio/$MINIAUDIO_TAG/miniaudio.h" -OutFile (Join-Path $maDir 'miniaudio.h')
}

# ── basis_universal transcoder (decode KTX2/Basis → RGBA no host; ADR-0108) ──
# Só a pasta transcoder/ (headers + 1 .cpp + tabelas .inc/.inl), pinado por commit.
# Baixa arquivo-a-arquivo (o archive do repo tem ~120 MB de assets de teste; a
# transcoder/ tem ~3 MB). A lista vem da API do GitHub no commit pinado.
$BASISU_COMMIT = '1b33fd5098c6e7b58324146b8f5518cbb4cdfb72'
$basisuDir = Join-Path $tp 'basisu'
if (-not (Test-Path (Join-Path $basisuDir 'basisu_transcoder.cpp'))) {
    Write-Host 'baixando basis_universal (transcoder/) ...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $basisuDir | Out-Null
    $listUrl = "https://api.github.com/repos/BinomialLLC/basis_universal/contents/transcoder?ref=$BASISU_COMMIT"
    $entries = Invoke-RestMethod -Uri $listUrl -Headers @{ 'User-Agent' = 'cortex-fetch-deps' }
    foreach ($e in $entries) {
        if ($e.type -ne 'file') { continue }
        $raw = "https://raw.githubusercontent.com/BinomialLLC/basis_universal/$BASISU_COMMIT/transcoder/$($e.name)"
        Invoke-WebRequest -Uri $raw -OutFile (Join-Path $basisuDir $e.name)
    }
}
# Decoder Zstd single-file (vendorizado no próprio basis) — o transcoder do host
# builda com BASISD_SUPPORT_KTX2_ZSTD=1 (ADR-0119: cor em UASTC+RDO+zstd). O
# layout third_party/zstd/ espelha o repo (o transcoder inclui "../zstd/zstd.h").
$zstdDir = Join-Path $tp 'zstd'
if (-not (Test-Path (Join-Path $zstdDir 'zstddeclib.c'))) {
    Write-Host 'baixando zstd (basis_universal/zstd) ...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $zstdDir | Out-Null
    foreach ($f in @('zstd.h', 'zstd_errors.h', 'zstddeclib.c')) {
        $raw = "https://raw.githubusercontent.com/BinomialLLC/basis_universal/$BASISU_COMMIT/zstd/$f"
        Invoke-WebRequest -Uri $raw -OutFile (Join-Path $zstdDir $f)
    }
}

# ── basis_universal ENCODER (WASM) — ferramenta de BUILD (converter PNG→KTX2,
# scripts/encode-ktx2.mjs). NÃO vai pro runtime; roda no Node. Mesmo commit do
# transcoder. Fica em tools/ (não third_party/, que é dep de compilação). ──
$encDir = Join-Path $root 'tools/basis-encoder'
if (-not (Test-Path (Join-Path $encDir 'basis_encoder.wasm'))) {
    Write-Host 'baixando basis_encoder (WASM, build tool) ...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $encDir | Out-Null
    foreach ($f in @('basis_encoder.js', 'basis_encoder.wasm')) {
        $raw = "https://raw.githubusercontent.com/BinomialLLC/basis_universal/$BASISU_COMMIT/webgl/encoder/build/$f"
        Invoke-WebRequest -Uri $raw -OutFile (Join-Path $encDir $f)
    }
}

# ── NSIS (portable) — gera o instalador do export PC (make-installer.mjs).
# Build tool; fica em tools/ (gitignorado). ──
$NSIS_VERSION = '3.10'
$nsisDir = Join-Path $root 'tools/nsis'
if (-not (Test-Path (Join-Path $nsisDir 'Bin/makensis.exe'))) {
    $nsisZip = Fetch 'NSIS' "https://downloads.sourceforge.net/project/nsis/NSIS%203/$NSIS_VERSION/nsis-$NSIS_VERSION.zip" "nsis-$NSIS_VERSION.zip"
    $tmp = Join-Path $dl 'nsis-extract'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive $nsisZip -DestinationPath $tmp
    $r = Get-ChildItem $tmp -Directory | Select-Object -First 1  # nsis-3.10/
    New-Item -ItemType Directory -Force (Split-Path $nsisDir) | Out-Null
    Move-Item $r.FullName $nsisDir
    Remove-Item $tmp -Recurse -Force
}

# ── Hermes UPSTREAM (facebook/hermes) — runtime JS do host (ADR-0122) ──
# Clonado no commit pinado; o native/CMakeLists builda como SUBPROJETO (flags/
# ABI idênticos entre VM e glue). Substituiu o fork MS do NuGet (0.1.27, ~4×
# mais lento no mesmo bytecode; o pacote está parado).
$HERMES_COMMIT = 'efcf68e285865fd9d952070b08e751bcad63f25e'
$hermesUp = Join-Path $tp 'hermes-upstream/src'
if (-not (Test-Path (Join-Path $hermesUp 'CMakeLists.txt'))) {
    Write-Host 'clonando facebook/hermes (pinado) ...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $hermesUp | Out-Null
    git -C $hermesUp init -q
    git -C $hermesUp remote add origin https://github.com/facebook/hermes.git
    git -C $hermesUp fetch -q --depth 1 origin $HERMES_COMMIT
    git -C $hermesUp checkout -q FETCH_HEAD
    Set-Content (Join-Path $tp 'hermes-upstream/PINNED_COMMIT') $HERMES_COMMIT
}
# Patch: os testes NAPI geram regras duplicadas de .lib no Windows/Ninja
# (test_exception.lib) — gate atrás de HERMES_NAPI_TESTS (off por default).
$extCmake = Join-Path $hermesUp 'external/CMakeLists.txt'
$extSrc = Get-Content $extCmake -Raw
if ($extSrc -notmatch 'HERMES_NAPI_TESTS') {
    $extSrc = $extSrc -replace 'if\(HERMES_ENABLE_NAPI\)', @'
# [cortex] testes NAPI desligados: geram regras duplicadas de .lib no
# Windows/Ninja (test_exception.lib) e nao fazem parte do runtime embarcado.
if(HERMES_ENABLE_NAPI AND HERMES_NAPI_TESTS)
'@
    Set-Content $extCmake $extSrc -Encoding utf8
    Write-Host 'hermes: patch dos testes NAPI aplicado' -ForegroundColor Cyan
}

Write-Host "deps prontas em native/third_party/" -ForegroundColor Green
