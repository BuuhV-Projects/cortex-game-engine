# Teste de aceite do resize da surface (SPEC-0199 / M0 do PRD-0007).
#
# Redimensiona a janela do host N vezes e falha se o processo morrer ou se os
# resizes nao tiverem efeito. VERIFICA o client rect a cada ciclo de proposito:
# sem isso o teste passa vazio quando a janela esta minimizada ou nao e
# redimensionavel — as duas armadilhas que enganaram as primeiras tentativas.
#
# Uso (o host precisa ja estar rodando, em outro terminal):
#   $env:CORTEX_WINDOWED=1; $env:CORTEX_LAUNCH_QUERY="level=space-1"
#   & <export>\launcher.exe
#   powershell -File native/scripts/test-resize.ps1 -Cycles 100
param([string]$ProcName = "launcher", [int]$Cycles = 40)

Add-Type @"
using System; using System.Runtime.InteropServices;
public class Win32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int X, int Y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
"@

$proc = $null
for ($t = 0; $t -lt 60; $t++) {
  $proc = Get-Process -Name $ProcName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) { break }
  Start-Sleep -Seconds 1
}
if (-not $proc) { "PROCESSO NAO ENCONTRADO"; exit 1 }
$hwnd = $proc.MainWindowHandle
if ([Win32]::IsIconic($hwnd)) { [Win32]::ShowWindow($hwnd, 9) | Out-Null; Start-Sleep -Seconds 2 }  # SW_RESTORE
if ([Win32]::IsIconic($hwnd)) { "JANELA MINIMIZADA (teste seria vazio)"; exit 1 }

$sizes = @(@(900,600), @(1280,720), @(640,480), @(1100,900), @(800,450))
$SWP = 0x0002 -bor 0x0004 -bor 0x0010
$applied = 0
for ($i = 0; $i -lt $Cycles; $i++) {
  $proc.Refresh()
  if ($proc.HasExited) { "CRASHOU no ciclo $i (exit $($proc.ExitCode))"; exit 1 }
  $s = $sizes[$i % $sizes.Count]
  [Win32]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, $s[0], $s[1], $SWP) | Out-Null
  Start-Sleep -Milliseconds 350
  $r = New-Object Win32+RECT
  [Win32]::GetClientRect($hwnd, [ref]$r) | Out-Null
  $w = $r.R - $r.L; $h = $r.B - $r.T
  if ($w -gt 0 -and $h -gt 0) { $applied++ }
  if ($i -lt 3 -or $i -eq $Cycles - 1) { "  ciclo $i pediu $($s[0])x$($s[1]) -> client $w x $h" }
}
Start-Sleep -Seconds 2
$proc.Refresh()
if ($proc.HasExited) { "CRASHOU no fim (exit $($proc.ExitCode))"; exit 1 }
if ($applied -lt $Cycles) { "SO $applied de $Cycles resizes tiveram efeito"; exit 1 }
"SOBREVIVEU a $Cycles resizes REAIS (client rect mudou em todos)"
exit 0
