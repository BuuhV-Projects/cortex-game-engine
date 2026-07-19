# Descobre QUEM segura um arquivo/pasta no Windows, via Restart Manager
# (rstrtmgr.dll) — a MESMA API que o Explorer usa no diálogo "o arquivo está
# aberto em outro programa". Detecta Explorer, terminais/consoles, serviços e
# apps com janela. Saída: uma linha por processo, "PID<TAB>Nome<TAB>Tipo".
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File who-locks.ps1 <path...>
# Os caminhos chegam em $args (coleta posicional confiável via -File; um param
# [string[]] NÃO coleta múltiplos posicionais nesse modo).
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class CortexRM {
  [StructLayout(LayoutKind.Sequential)]
  struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }

  const int CCH_RM_MAX_APP_NAME = 255;
  const int CCH_RM_MAX_SVC_NAME = 63;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)] public string strServiceShortName;
    public int ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }

  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
  [DllImport("rstrtmgr.dll")]
  static extern int RmEndSession(uint pSessionHandle);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames,
    uint nApplications, RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo,
    [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);

  public static List<string> Who(string[] paths) {
    var res = new List<string>();
    uint handle;
    if (RmStartSession(out handle, 0, Guid.NewGuid().ToString()) != 0) return res;
    try {
      if (RmRegisterResources(handle, (uint)paths.Length, paths, 0, null, 0, null) != 0) return res;
      uint needed = 0, count = 0, reasons = 0;
      RmGetList(handle, out needed, ref count, null, ref reasons); // 1ª chamada: quantos
      if (needed == 0) return res;
      var arr = new RM_PROCESS_INFO[needed];
      count = needed;
      if (RmGetList(handle, out needed, ref count, arr, ref reasons) == 0) {
        for (uint i = 0; i < count; i++) {
          res.Add(arr[i].Process.dwProcessId + "\t" + arr[i].strAppName + "\t" + arr[i].ApplicationType);
        }
      }
    } finally {
      RmEndSession(handle);
    }
    return res;
  }
}
'@

# Só registra ARQUIVOS que existem. Registrar um DIRETÓRIO faz o RmGetList
# retornar ACCESS_DENIED e zerar a lista inteira (medido) — o chamador já
# expande pastas nos arquivos de dentro; aqui filtramos por Leaf de novo.
$existing = @($args | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($existing.Count -eq 0) { exit 0 }

[CortexRM]::Who($existing) | ForEach-Object { Write-Output $_ }
