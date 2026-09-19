# Teste de aceite do preview embutido (SPEC-0201 / M2 do PRD-0007).
#
# Cria uma janela de teste (no lugar do Studio), sobe o host com
# CORTEX_PARENT_HWND apontando pra ela e verifica o que o marco promete:
#   1. a janela do host vira FILHA da janela de teste (GetParent bate);
#   2. a mensagem `bounds` pelo canal move/redimensiona o host de verdade;
#   3. encerrar o processo nao deixa janela orfa.
#
# Uso: powershell -File native/scripts/test-embed.ps1 -ExportDir <dir do export>
param([Parameter(Mandatory = $true)][string]$ExportDir)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Embed {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  // Acha a janela filha que pertence ao processo do host. FindWindowEx com
  // classe/titulo nulos nao serve aqui: o marshalling de $null no PowerShell
  // vira string vazia e a busca falha (foi o que deu falso negativo).
  public static IntPtr ChildOfProcess(IntPtr parent, uint wantPid) {
    IntPtr hit = IntPtr.Zero;
    EnumChildWindows(parent, (h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == wantPid) { hit = h; return false; }
      return true;
    }, IntPtr.Zero);
    return hit;
  }
}
"@

$exe = Join-Path $ExportDir "launcher.exe"
if (-not (Test-Path $exe)) { "export sem launcher.exe: $ExportDir"; exit 1 }

# Janela que faz o papel do painel de preview do Studio.
$form = New-Object System.Windows.Forms.Form
$form.Text = "cortex embed host (teste)"
$form.Width = 1000; $form.Height = 700
$form.Show()
[System.Windows.Forms.Application]::DoEvents()
$parent = $form.Handle
"janela pai: $parent"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.WorkingDirectory = $ExportDir
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.EnvironmentVariables["CORTEX_PARENT_HWND"] = [string]([int64]$parent)
$psi.EnvironmentVariables["CORTEX_IDE_CHANNEL"] = "1"
$psi.EnvironmentVariables["CORTEX_NO_SPLASH"] = "1"
$psi.EnvironmentVariables["CORTEX_LAUNCH_QUERY"] = "level=space-1"
$proc = [System.Diagnostics.Process]::Start($psi)
# Drena o stdout: sem isso o buffer do pipe enche e o host trava no print.
$drain = $proc.StandardOutput.ReadToEndAsync()

# Espera a janela do host existir COMO FILHA (o host cria, prende no pai e sobe).
$child = [IntPtr]::Zero
for ($i = 0; $i -lt 60; $i++) {
  [System.Windows.Forms.Application]::DoEvents()
  $child = [Embed]::ChildOfProcess($parent, [uint32]$proc.Id)
  if ($child -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 500
}
if ($child -eq [IntPtr]::Zero) { "FALHOU: nenhuma janela filha apareceu"; $proc.Kill(); exit 1 }

$actualParent = [Embed]::GetParent($child)
if ($actualParent -ne $parent) { "FALHOU: pai errado ($actualParent != $parent)"; $proc.Kill(); exit 1 }
"host embutido: janela $child e filha de $parent"

# `bounds` pelo canal: o HOST se reposiciona (a IDE nao chama SetWindowPos).
$proc.StandardInput.WriteLine('{"type":"bounds","x":40,"y":60,"width":640,"height":400}')
$proc.StandardInput.Flush()
for ($i = 0; $i -lt 20; $i++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 300 }

$r = New-Object Embed+RECT
[Embed]::GetWindowRect($child, [ref]$r) | Out-Null
$w = $r.R - $r.L; $h = $r.B - $r.T
"apos bounds: ${w}x${h}"
if ($w -ne 640 -or $h -ne 400) { "FALHOU: bounds nao aplicado (esperado 640x400)"; $proc.Kill(); exit 1 }

# Encerrar nao pode deixar janela orfa.
$proc.Kill(); $proc.WaitForExit(10000)
Start-Sleep -Seconds 1
[System.Windows.Forms.Application]::DoEvents()
if ([Embed]::IsWindow($child)) { "FALHOU: janela do host sobreviveu ao processo (orfa)"; exit 1 }

$form.Close()
"OK: embed, bounds pelo canal e encerramento sem janela orfa"
exit 0
