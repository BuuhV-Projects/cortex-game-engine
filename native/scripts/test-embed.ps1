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
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr wp, IntPtr lp, uint flags, uint ms, out UIntPtr res);
  public const uint GW_OWNER = 4;
  // WM_NULL com timeout: se a janela NAO responde em `ms`, a fila dela esta
  // travada — foi o que o SetParent cross-process causava (SPEC-0210).
  public static bool Responsive(IntPtr h, uint ms) {
    UIntPtr res; return SendMessageTimeout(h, 0x0000, IntPtr.Zero, IntPtr.Zero, 0x0002, ms, out res) != IntPtr.Zero;
  }
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  // A janela do host e OWNED, nao filha (SPEC-0210) — entao ela e TOP-LEVEL e
  // EnumChildWindows nao a encontra. Procuramos pelo processo + visibilidade.
  public static IntPtr WindowOfProcess(uint wantPid) {
    IntPtr hit = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == wantPid && IsWindowVisible(h)) {
        RECT r; GetWindowRect(h, out r);
        if ((r.R - r.L) > 100 && (r.B - r.T) > 100) { hit = h; return false; }
      }
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
$script:ackSeen = $null

# Espera a janela do host existir COMO FILHA (o host cria, prende no pai e sobe).
$child = [IntPtr]::Zero
for ($i = 0; $i -lt 60; $i++) {
  [System.Windows.Forms.Application]::DoEvents()
  $child = [Embed]::WindowOfProcess([uint32]$proc.Id)
  if ($child -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 500
}
if ($child -eq [IntPtr]::Zero) { "FALHOU: nenhuma janela do host apareceu"; $proc.Kill(); exit 1 }

# Janela OWNED (nao filha): o vinculo e pelo OWNER (SPEC-0210).
$owner = [Embed]::GetWindow($child, [Embed]::GW_OWNER)
if ($owner -ne $parent) { "FALHOU: dono errado ($owner != $parent)"; $proc.Kill(); exit 1 }
# `GetParent` devolve o OWNER tambem para popups — nao serve pra distinguir.
# O que prova que nao e filha e a AUSENCIA do estilo WS_CHILD (0x40000000),
# que e o que acopla as filas de mensagem (SPEC-0210).
$style = [Embed]::GetWindowLongPtr($child, -16)  # GWL_STYLE
if (([int64]$style -band 0x40000000) -ne 0) { "FALHOU: a janela tem WS_CHILD (acopla filas, ver SPEC-0210)"; $proc.Kill(); exit 1 }
"host embutido: janela $child tem o dono $parent (owned, nao filha)"

# A janela precisa PODER receber foco (SPEC-0211). Com WS_EX_NOACTIVATE
# (0x08000000) ela nunca vira a janela ativa, e janela nao-ativa nao recebe
# WM_KEYDOWN: o jogo desenha mas nao anda — foi lido como "o Studio travou".
$exStyle = [Embed]::GetWindowLongPtr($child, -20)  # GWL_EXSTYLE
if (([int64]$exStyle -band 0x08000000) -ne 0) {
  "FALHOU: a janela tem WS_EX_NOACTIVATE (sem teclado no jogo, ver SPEC-0211)"; $proc.Kill(); exit 1
}
[Embed]::SetForegroundWindow($child) | Out-Null
for ($i = 0; $i -lt 10; $i++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 200 }
if ([Embed]::GetForegroundWindow() -ne $child) {
  "FALHOU: a janela do host nao aceitou ser ativada (o teclado nunca chega no jogo)"; $proc.Kill(); exit 1
}
"janela do host aceita foco (o teclado chega no jogo)"

# ESPERA o JS do host subir antes de mandar geometria. A janela filha aparece
# em ~2s, mas o bundle (ainda mais com o editor dentro) leva bem mais — mandar
# `bounds` antes disso e perde-lo foi o que fez este teste falhar com --editor.
# O produto nao tem esse problema: o NativePreview REENVIA o bounds no `ack`.
$alive = $false
for ($t = 0; $t -lt 60; $t++) {
  $proc.StandardInput.WriteLine('{"type":"hello"}')
  $proc.StandardInput.Flush()
  for ($i = 0; $i -lt 4; $i++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 250 }
  if ($drain.IsCompleted) { break }
  # O ack so aparece no stream quando o processo termina (ReadToEndAsync), entao
  # usamos um proxy barato: o host ja escreveu alguma linha do canal?
  if ($proc.HasExited) { "FALHOU: host saiu antes do handshake"; exit 1 }
  if ($t -ge 20) { $alive = $true; break }   # ~21s: JS de pe mesmo com editor
}
if (-not $alive) { "AVISO: seguindo sem confirmacao do handshake" }

# `bounds` pelo canal: o HOST se reposiciona (a IDE nao chama SetWindowPos).
$proc.StandardInput.WriteLine('{"type":"bounds","x":40,"y":60,"width":640,"height":400}')
$proc.StandardInput.Flush()
for ($i = 0; $i -lt 20; $i++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 300 }

$r = New-Object Embed+RECT
[Embed]::GetWindowRect($child, [ref]$r) | Out-Null
$w = $r.R - $r.L; $h = $r.B - $r.T
"apos bounds: ${w}x${h}"
# Se o drain ja tem o ack, mostra o `embedded` (diagnostico do shim de janela).
if ($drain.IsCompleted -and $drain.Result -match '"type":"ack"[^}]*"embedded":(\w+)') { "ack.embedded = $($Matches[1])" }
if ($w -ne 640 -or $h -ne 400) { "FALHOU: bounds nao aplicado (esperado 640x400)"; $proc.Kill(); exit 1 }

# `previewVisible` pelo canal esconde/mostra a janela (airspace, SPEC-0206) —
# e o que faz o overlay de drag-and-drop da IDE voltar a receber o drop.
$proc.StandardInput.WriteLine('{"type":"previewVisible","visible":false}')
$proc.StandardInput.Flush()
for ($i = 0; $i -lt 10; $i++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 300 }
if ([Embed]::IsWindowVisible($child)) { "FALHOU: janela seguiu visivel apos previewVisible=false"; $proc.Kill(); exit 1 }
"previewVisible=false escondeu a janela"

$proc.StandardInput.WriteLine('{"type":"previewVisible","visible":true}')
$proc.StandardInput.Flush()
for ($i = 0; $i -lt 10; $i++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 300 }
if (-not [Embed]::IsWindowVisible($child)) { "FALHOU: janela nao voltou apos previewVisible=true"; $proc.Kill(); exit 1 }
"previewVisible=true trouxe a janela de volta"

# A JANELA DONA precisa seguir respondendo enquanto o host trabalha. Com
# WS_CHILD + SetParent (a versao anterior) as filas ficavam acopladas e o
# Studio travava junto — "Application Hang" (SPEC-0210).
$travou = $false
for ($i = 0; $i -lt 25; $i++) {
  [System.Windows.Forms.Application]::DoEvents()
  if (-not [Embed]::Responsive($parent, 500)) { $travou = $true; break }
  Start-Sleep -Milliseconds 200
}
if ($travou) { "FALHOU: a janela dona parou de responder (filas acopladas)"; $proc.Kill(); exit 1 }
"janela dona seguiu respondendo com o host ocupado"

# Encerrar nao pode deixar janela orfa.
$proc.Kill(); $proc.WaitForExit(10000)
Start-Sleep -Seconds 1
[System.Windows.Forms.Application]::DoEvents()
if ([Embed]::IsWindow($child)) { "FALHOU: janela do host sobreviveu ao processo (orfa)"; exit 1 }

$form.Close()
"OK: embed, bounds pelo canal e encerramento sem janela orfa"
exit 0
