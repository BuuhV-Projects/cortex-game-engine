// App model do Microsoft GDK (M3, PRD-0004). Sem `-DCORTEX_GDK` é tudo no-op (o
// build desktop normal segue igual). Com o GDK ligado, inicializa/finaliza o
// XGameRuntime — a base do ciclo de vida do app GDK (pré-requisito p/ XUser,
// XGameSave, suspend/resume, e alvos de console). Ver architecture.md
// (pré-requisitos: o GDK é instalado à parte, não vem no fetch-deps).
#pragma once

namespace core {

// Inicializa o Game Runtime do GDK e loga o HRESULT. No-op sem CORTEX_GDK.
// Chamar cedo no main, antes de qualquer outra API do GDK.
void initGameRuntime();

// Finaliza o Game Runtime. No-op sem CORTEX_GDK.
void shutdownGameRuntime();

}  // namespace core
