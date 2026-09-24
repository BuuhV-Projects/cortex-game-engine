// Timestamp de GPU por render pass (SPEC-0254).
//
// A SPEC-0253 provou que o congelamento do kart-racer está na GPU: numa janela
// com a CPU normal (js p95 de 23 ms, present de 0,30 ms) a GPU levou 176,54 ms
// num frame. O que ela NÃO diz é no quê — `OnSubmittedWorkDone` mede o
// conjunto.
//
// Este módulo separa por pass, para que o próximo passo seja um alvo e não uma
// quinta hipótese.
//
// Cada pass é identificado por ORDEM no frame e pela contagem de draws que
// emitiu: o three não rotula os render passes (só o encoder e os attachments),
// então não há nome a aproveitar. Ordem + draws basta para reconhecer quem é
// quem — sombra tem dezenas de draws, blit tem um.
//
// Desligado por padrão; liga com `CORTEX_FRAME_TIMING`, junto das outras
// medições.
#pragma once

#include <cstdint>

struct WGPUAdapterImpl;
struct WGPUDeviceImpl;
struct WGPUQueueImpl;
struct WGPUCommandEncoderImpl;
struct WGPUInstanceImpl;
struct WGPUPassTimestampWrites;

namespace webgpu {

/** Liga a coleta conforme o ambiente. Uma vez, no boot, ANTES do device. */
void initPassTiming();

/** A coleta está ligada? */
bool passTimingEnabled();

/**
 * O adapter suporta `TimestampQuery`?
 *
 * Pedir uma feature que o adapter não tem faz o `requestDevice` FALHAR e o
 * jogo não abre. Por isso a feature só entra em `requiredFeatures` quando isto
 * devolve `true` — e só quando a medição está ligada.
 */
bool adapterSupportsTimestamp(WGPUAdapterImpl* adapter);

/** Cria o query set e os buffers de leitura. Depois do device pronto. */
void setupPassTiming(WGPUDeviceImpl* device);

/**
 * Os `timestampWrites` para o próximo render pass, ou `nullptr` quando a
 * medição está desligada ou os slots do frame acabaram.
 *
 * O ponteiro devolvido vive até o fim do frame — o descriptor do pass o
 * referencia, e o wgpu lê no `beginRenderPass`.
 */
const WGPUPassTimestampWrites* nextPassTimestampWrites();

/**
 * Resolve os timestamps do frame e dispara a leitura assíncrona.
 * Chamado uma vez por frame, depois do último pass e antes do submit final.
 */
void resolvePassTiming(WGPUCommandEncoderImpl* encoder, WGPUQueueImpl* queue);

/**
 * Inicia a leitura do frame, DEPOIS do submit.
 *
 * Separado do resolve porque a cópia só é gravada no encoder ali; ela executa
 * no submit, e mapear antes disso faz o wgpu abortar o processo.
 */
void startPassTimingRead();

/** Bombeia as leituras prontas. Uma vez por frame, sem bloquear. */
void pumpPassTiming(WGPUInstanceImpl* instance);

/** Escreve o relatório no `perf-log.txt`. Devolve `false` sem amostras. */
bool reportPassTiming();

}  // namespace webgpu
