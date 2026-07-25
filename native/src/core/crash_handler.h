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
