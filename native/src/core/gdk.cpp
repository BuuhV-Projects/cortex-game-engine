#include "gdk.h"

#include <cstdio>

#ifdef CORTEX_GDK
// Os headers do GDK dependem do SDK do Windows (STDAPI/HRESULT/…) — incluir
// <windows.h> ANTES. LEAN_AND_MEAN + NOMINMAX evitam poluição/conflito de macros.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <XGameRuntime.h>
#include <XPackage.h>
#endif

namespace core {

void initGameRuntime() {
#ifdef CORTEX_GDK
  const HRESULT hr = XGameRuntimeInitialize();
  if (SUCCEEDED(hr)) {
    std::fprintf(stderr, "[gdk] XGameRuntimeInitialize OK\n");
    // Identidade do pacote: só existe quando o app roda REGISTRADO como pacote
    // GDK (wdapp register / instalado). Prova o app model de ponta a ponta —
    // sem isso, XUser/XGameSave/achievements não funcionam.
    char pkgId[256] = {};
    const HRESULT ph = XPackageGetCurrentProcessPackageIdentifier(sizeof(pkgId), pkgId);
    if (SUCCEEDED(ph) && pkgId[0]) {
      std::fprintf(stderr, "[gdk] package identity: %s\n", pkgId);
    } else {
      std::fprintf(stderr, "[gdk] SEM package identity (0x%08lX) — rodando solto (não registrado)\n",
                   static_cast<unsigned long>(ph));
    }
  } else {
    // Falha comum: o app AINDA não está registrado como pacote GDK
    // (MicrosoftGame.config + registro). O host segue rodando como desktop.
    std::fprintf(stderr,
                 "[gdk] XGameRuntimeInitialize falhou (0x%08lX) — o app precisa "
                 "estar registrado como pacote GDK (MicrosoftGame.config).\n",
                 static_cast<unsigned long>(hr));
  }
#endif
}

void shutdownGameRuntime() {
#ifdef CORTEX_GDK
  XGameRuntimeUninitialize();
#endif
}

}  // namespace core
