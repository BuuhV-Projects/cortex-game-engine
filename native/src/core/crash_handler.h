// Handler de crash do host: em ACCESS_VIOLATION (e afins), abort/panic
// (wgpu/Rust) ou exceção C++ não tratada, imprime a CAUSA e um backtrace
// SIMBOLIZADO (DbgHelp + PDB quando presente) no stderr E grava/apenda em
// `<logDir>/error_log.txt` — pro jogador/dev mandar o arquivo quando o jogo
// fechar sozinho. Sem isso, um segfault no host é um exit 139 mudo —
// indiagnosticável em campo (SPEC-0173).
#pragma once

#include <cstddef>

namespace core {

// Tamanho do buffer de descrição de exceção ("<tipo> — <what()>"). what() de
// exceção da STL é curto; 512 cobre com folga sem pesar na pilha de um handler
// que roda com o processo já morrendo.
constexpr size_t kExceptionDescMax = 512;

// Descreve, em `out`, a exceção C++ EM VOO — tipo (`typeid`) e `what()`. Só faz
// sentido de dentro de um `catch` ou de um handler de `terminate`; sem exceção
// corrente escreve o diagnóstico disso (noexcept violado / thread sem join),
// que também é informação. Nunca lança: é usada em caminho de crash.
void describeCurrentException(char* out, size_t size);

// Instala os handlers (uma vez, no início do main). `logDir` = pasta onde o
// error_log.txt é gravado (dir do jogo); nullptr/vazio = só stderr.
void installCrashHandler(const char* logDir = nullptr);

// Instala o handler de `terminate` NA THREAD CORRENTE. Chame no início de toda
// thread criada pelo host.
//
// No MSVC o handler de terminate é mantido POR THREAD — o `set_terminate` do
// main NÃO vale pras outras. Medido: exceção escapando do callable de uma
// std::thread caía num abort MUDO mesmo com o handler instalado no main
// (SPEC-0173). Isto é a rede de segurança; a proteção de verdade é não deixar
// exceção escapar do callable (try/catch no corpo da thread).
void installThreadCrashHandler();

// Apenda uma linha no error_log.txt (e stderr). Usado pelos pontos de erro
// não-fatais que precisam sobreviver num exe sem console: erro de validação
// do WebGPU, exceção JS não tratada — o CONTEXTO que explica o crash que vem
// em seguida.
void appendErrorLog(const char* fmt, ...);

// Telemetria de performance/VRAM (SPEC-0152/ADR-0153): acrescenta uma linha
// (timestampada) ao `perf-log.txt` na pasta do jogo. Silencioso se a pasta
// ainda não foi registrada OU se a telemetria está desligada (default) — o
// jogador final não ganha arquivo de log na pasta; liga no export com
// métricas (`--debug` → cortex.json `debug:true`), no dev-run e via
// CORTEX_VRAM_LOG=1. Barato o bastante pra logs periódicos do loop.
void appendPerfLog(const char* fmt, ...);

// Liga/desliga a gravação do perf-log.txt (ver appendPerfLog).
void setPerfLogEnabled(bool enabled);

}  // namespace core
