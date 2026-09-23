// Cronômetro das fases do frame do HOST (SPEC-0249).
//
// Existe porque a campanha de perf chegou num ponto em que os contadores do JS
// deixaram de explicar o frame: entre os 25 piores e os 25 melhores frames do
// kart-racer há 14,3 ms de diferença, e `cpu.render` + `cpu.world` + `cpu.ui`
// explicam 5,2 ms. Os outros 9,15 ms acontecem FORA do JS — e é justamente o
// que ninguém media.
//
// Mede em nanossegundos (`SDL_GetTicksNS`), porque o host não expõe
// `performance` e o `frameMs` que o PerfTrace grava vem de `Date.now()`, com
// resolução de 1 ms — grosseiro demais para separar as fases.
//
// Desligado por padrão; liga com `CORTEX_FRAME_TIMING=1`.
#pragma once

#include <cstdint>

namespace core {

/** Fase do frame do host. A ordem é a de execução dentro do laço. */
enum class FramePhase : uint8_t {
  kPoll = 0,     ///< `pollEvents`: entrada e eventos de janela.
  kJs,           ///< Timers, microtasks e `requestAnimationFrame`.
  kPresent,      ///< `presentIfAcquired` — INCLUI o bloqueio do v-blank.
  kRest,         ///< Destruições adiadas, contadores, áudio.
  kCount,
};

/** Liga a coleta se `CORTEX_FRAME_TIMING` estiver no ambiente. Uma vez, no boot. */
void initFrameTiming();

/** A coleta está ligada? Barato o bastante para guardar cada `mark`. */
bool frameTimingEnabled();

/**
 * Marca o fim de uma fase. O início é o fim da fase anterior (ou o começo do
 * frame, para a primeira) — assim uma fase não medida não some do total, ela
 * aparece embutida na seguinte, que é o comportamento honesto.
 */
void markFramePhase(FramePhase phase);

/** Abre o frame: zera o relógio das fases. Chamado no topo do laço. */
void beginFrameTiming();

/**
 * Fecha o frame e, a cada `kFramesPorRelatorio` frames, escreve mediana e p95
 * de cada fase no `perf-log.txt`. `presented` diz se este frame de fato chegou
 * ao `wgpuSurfacePresent` — sem isso a mediana de `kPresent` misturaria frames
 * que bloquearam no v-blank com frames que retornaram cedo.
 */
void endFrameTiming(bool presented);

}  // namespace core
