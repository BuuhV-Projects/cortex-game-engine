// Handler de crash do host: em ACCESS_VIOLATION (e afins) imprime um backtrace
// SIMBOLIZADO (DbgHelp + PDB quando presente) no stderr antes de morrer.
// Sem isso, um segfault no host é um exit 139 mudo — indiagnosticável em campo.
#pragma once

namespace core {

// Instala o unhandled exception filter (uma vez, no início do main).
void installCrashHandler();

}  // namespace core
