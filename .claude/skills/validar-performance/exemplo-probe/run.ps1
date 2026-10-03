param([int]$ProbeLevel = 0, [switch]$Diagnostic, [switch]$MovingCamera, [string]$Candidate = 'legacy', [string]$Name = 'baseline', [int]$Frames = 330, [switch]$Build, [switch]$Capture, [switch]$Dynamic, [switch]$Bench, [switch]$AiPlayer, [string]$BundleEngine = 'D:/@buuhvprojects/js-game-engine', [string]$HostRoot = 'D:/@buuhvprojects/js-game-engine')
$ErrorActionPreference = 'Stop'
$experimentRoot = $PSScriptRoot
$engineRoot = 'D:/@buuhvprojects/js-game-engine'
if ($Build) {
    & node "$BundleEngine/native/scripts/bundle.mjs" "$experimentRoot/boot.bundle.js" "$experimentRoot/main.ts"
    if ($LASTEXITCODE -ne 0) { throw 'Bundle failed' }
    & "$HostRoot/native/build/bin/hermesc.exe" -emit-binary -O -w -out "$experimentRoot/boot.hbc" "$experimentRoot/boot.bundle.js"
    if ($LASTEXITCODE -ne 0) { throw 'Bytecode compilation failed' }
}
$runRoot = Join-Path $experimentRoot $Name
if (Test-Path -LiteralPath $runRoot) { throw "Run already exists: $runRoot" }
New-Item -ItemType Directory -Path $runRoot | Out-Null
New-Item -ItemType Junction -Path (Join-Path $runRoot 'assets') -Target 'D:/jogos/crash-bandicoot-racer/assets' | Out-Null
Copy-Item -LiteralPath "$experimentRoot/boot.hbc" -Destination $runRoot
foreach ($font in @('Roboto-Medium.ttf', 'ui-font-glyphs.json')) {
    Copy-Item -LiteralPath (Join-Path (Split-Path $experimentRoot) $font) -Destination $runRoot
}
$environmentNames = @('CORTEX_RENDER_SCALE','CORTEX_LAUNCH_QUERY','CORTEX_NO_SPLASH','CORTEX_FRAME_TIMING','CORTEX_RENDER_PARITY_CAPTURE','CORTEX_RENDER_PARITY_CAPTURE_FRAMES','CORTEX_RENDER_PARITY_CAPTURE_SKIP')
$savedEnvironment = @{}
foreach ($environmentName in $environmentNames) { $savedEnvironment[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName, 'Process') }
try {
    $env:CORTEX_RENDER_SCALE = '1'
    $env:CORTEX_LAUNCH_QUERY = "probeLevel=$ProbeLevel&diagnostic=$([int]$Diagnostic.IsPresent)&movingCamera=$([int]$MovingCamera.IsPresent)&candidate=$Candidate&frames=$Frames&dynamicGameplay=$([int]$Dynamic.IsPresent)&carProfile=1$(if ($Bench) { "&bench=1" })$(if ($AiPlayer) { "&aiPlayer=1" })"
    $env:CORTEX_NO_SPLASH = '1'
    $env:CORTEX_FRAME_TIMING = '1'
    $env:CORTEX_RENDER_PARITY_CAPTURE = $null
    if ($Capture) {
        $env:CORTEX_RENDER_PARITY_CAPTURE = Join-Path $runRoot 'capture'
        $env:CORTEX_RENDER_PARITY_CAPTURE_FRAMES = '1'
        $env:CORTEX_RENDER_PARITY_CAPTURE_SKIP = '200'
    }
    $hostProcess = Start-Process -FilePath "$HostRoot/native/build/cortex_host.exe" -ArgumentList $runRoot -WorkingDirectory $engineRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runRoot 'stdout.log') -RedirectStandardError (Join-Path $runRoot 'stderr.log') -PassThru
    $null = $hostProcess.Handle
    $finished = $hostProcess.WaitForExit(900000)
    if (-not $finished) { Stop-Process -Id $hostProcess.Id; throw 'Probe timeout' }
    $hostProcess.Refresh()
    if ($null -ne $hostProcess.ExitCode -and $hostProcess.ExitCode -ne 0) { throw "Host exit code $($hostProcess.ExitCode)" }
    $resultLine = Get-Content -LiteralPath (Join-Path $runRoot 'stdout.log') | Where-Object { $_ -match '\[binding-probe\] RESULT ' } | Select-Object -Last 1
    if ($Capture -and -not $resultLine) {
        $captureFiles = @(Get-ChildItem -LiteralPath (Join-Path $runRoot 'capture') -Filter '*.rgba')
        if ($captureFiles.Count -ne 1) { throw 'Missing parity capture' }
        @{ capture = $captureFiles[0].FullName; candidate = $Candidate; probeLevel = $ProbeLevel } | ConvertTo-Json -Compress
        return
    }
    if (-not $resultLine) { throw 'Missing probe result' }
    $resultJson = $resultLine.Substring($resultLine.IndexOf('RESULT ') + 7)
    [IO.File]::WriteAllText((Join-Path $runRoot 'result.json'), $resultJson, [Text.UTF8Encoding]::new($false))
    $result = $resultJson | ConvertFrom-Json
    $result | Select-Object probeLevel,diagnostic,movingCamera,candidate,frames,fps,p50ms,p95ms,p99ms,worstMs | ConvertTo-Json -Compress
} finally {
    foreach ($environmentName in $environmentNames) { [Environment]::SetEnvironmentVariable($environmentName, $savedEnvironment[$environmentName], 'Process') }
}
