// Handler de crash do host: em ACCESS_VIOLATION (e afins) ou abort/panic
// (wgpu/Rust) imprime um backtrace SIMBOLIZADO (DbgHelp + PDB quando presente)
// no stderr E grava/apenda em `<logDir>/error_log.txt` — pro jogador/dev
// mandar o arquivo quando o jogo fechar sozinho. Sem isso, um segfault no host
// é um exit 139 mudo — indiagnosticável em campo.
#pragma once

namespace core {

// Instala os handlers (uma vez, no início do main). `logDir` = pasta onde o
// error_log.txt é gravado (dir do jogo); nullptr/vazio = só stderr.
void installCrashHandler(const char* logDir = nullptr);

}  // namespace core
