# ab-bench.ps1 -- coleta A/B do export nativo (TDR-0007).
#
# Roda duas builds INTERCALADAS (A B A B ...) e salva um perf-trace por rodada.
# A analise fica no ab-report.mjs: separar as duas peças permite reanalisar sem
# rodar o jogo de novo.
#
# Uso:
#   powershell -File native/scripts/ab-bench.ps1 -A C:\...\build-antes -B C:\...\build-depois
#   powershell -File native/scripts/ab-bench.ps1 -A ... -B ... -Rodadas 6 -Segundos 120
#
# Por que intercalar: rodar AAAA depois BBBB da vantagem (ou desvantagem) a
# quem correu com a maquina em outro estado termico. Intercalado, a deriva
# atinge as duas igualmente.
#
# Por que PowerShell: o launcher so abre janela de verdade por aqui.
param(
  [Parameter(Mandatory = $true)][string]$A,
  [Parameter(Mandatory = $true)][string]$B,
  # Rodadas POR VERSAO. 4 e o minimo que costuma dar intervalo util.
  [int]$Rodadas = 4,
  # Duracao de cada rodada. Menos que 60s sobra pouco depois do aquecimento.
  [int]$Segundos = 90,
  # Onde os traces sao salvos.
  [string]$Saida = "$env:TEMP\ab-bench",
  # Rotulos no relatorio.
  [string]$NomeA = 'A',
  [string]$NomeB = 'B'
)

$ErrorActionPreference = 'Stop'

foreach ($par in @(@($A, $NomeA), @($B, $NomeB))) {
  $exe = Join-Path $par[0] 'launcher.exe'
  if (-not (Test-Path $exe)) { throw "launcher.exe nao encontrado em $($par[0]) (versao $($par[1]))" }
}
if ($Rodadas -lt 2) { throw "Rodadas precisa ser >= 2: com uma so nao ha como separar efeito de ruido." }

New-Item -ItemType Directory -Force -Path $Saida | Out-Null
Get-ChildItem $Saida -Filter '*.jsonl' -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Output "[ab-bench] $NomeA = $A"
Write-Output "[ab-bench] $NomeB = $B"
Write-Output "[ab-bench] $Rodadas rodadas por versao, ${Segundos}s cada, INTERCALADAS"
Write-Output "[ab-bench] tempo estimado: $([math]::Round($Rodadas * 2 * ($Segundos + 8) / 60, 1)) min"

for ($i = 1; $i -le $Rodadas; $i++) {
  foreach ($par in @(@($A, $NomeA), @($B, $NomeB))) {
    $dir = $par[0]; $nome = $par[1]
    Write-Output "[ab-bench] rodada $i/$Rodadas  versao $nome"
    $job = Start-Job -ScriptBlock {
      param($d)
      $env:CORTEX_LAUNCH_QUERY = 'bench'   # a IA pilota: as duas versoes percorrem o mesmo roteiro
      & (Join-Path $d 'launcher.exe')
    } -ArgumentList $dir
    Start-Sleep -Seconds $Segundos
    Get-Process launcher -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 3   # o processo precisa fechar o arquivo antes da copia
    Remove-Job $job -Force -ErrorAction SilentlyContinue

    $trace = Join-Path $dir 'perf-trace.jsonl'
    if (Test-Path $trace) {
      $destino = Join-Path $Saida "$nome-$i.jsonl"
      Copy-Item $trace $destino -Force
      $linhas = (Get-Content $destino | Measure-Object -Line).Lines
      Write-Output "[ab-bench]   -> $nome-$i.jsonl ($linhas amostras)"
    } else {
      # Nao aborta: uma rodada perdida ainda deixa as outras utilizaveis, e o
      # relatorio conta quantas entraram.
      Write-Warning "[ab-bench]   rodada $i de $nome nao gerou trace (o export foi feito com --debug?)"
    }
  }
}

Write-Output ""
Write-Output "[ab-bench] pronto. Analise com:"
Write-Output "  node native/scripts/ab-report.mjs `"$Saida`" --a $NomeA --b $NomeB"
