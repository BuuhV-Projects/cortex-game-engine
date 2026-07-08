#include "gdk.h"

#include <cstdio>

#ifdef CORTEX_GDK
// Os headers do GDK dependem do SDK do Windows (STDAPI/HRESULT/…) — incluir
// <windows.h> ANTES. LEAN_AND_MEAN + NOMINMAX evitam poluição/conflito de macros.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <XGameRuntime.h>
#endif

namespace core {

void initGameRuntime() {
#ifdef CORTEX_GDK
  const HRESULT hr = XGameRuntimeInitialize();
  if (SUCCEEDED(hr)) {
    std::fprintf(stderr, "[gdk] XGameRuntimeInitialize OK\n");
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
