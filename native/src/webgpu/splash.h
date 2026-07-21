// Splash OBRIGATÓRIA da engine (ADR-0109): a marca TS Cortex Studio aparece nos
// primeiros ~1,9 s de qualquer jogo exportado, cobrindo o tempo de carga.
//
// Ela NÃO pode rodar antes do JS bootar: o adapter/device do WebGPU são
// adquiridos PELO JS (navigator.gpu, ver core/host_gpu.h), então o host não tem
// device na hora em que a janela sobe. Por isso a splash vive no loop de frames
// e só começa a contar quando o device existe.
#pragma once

#include <node_api.h>

#include "../core/host_gpu.h"

namespace webgpu {

/**
 * A splash ainda tem trabalho a fazer? (não terminou nem falhou)
 *
 * Enquanto isto for true o host NÃO deve apresentar o frame do jogo — a splash
 * é dona da tela. Apresentar os dois no mesmo vsync faz a splash "piscar" com o
 * jogo aparecendo por trás.
 */
bool splashPending();

/**
 * Desenha um frame da splash na swapchain e apresenta.
 *
 * Chame UMA vez por frame do host, NO LUGAR do present normal (ver
 * `splashPending`). Descarta o frame que o JS tenha preparado: o jogo carrega
 * por trás, sem ser exibido.
 *
 * @return true se apresentou; false enquanto o device (pedido pelo JS) ainda
 *         não existe, ou quando a splash acabou de terminar.
 */
bool splashFrame(HostGpu* gpu, double elapsedMs);

/** Libera textura/pipeline da splash. Idempotente. */
void shutdownSplash();

/** Marca a splash como TERMINADA (ex.: CORTEX_NO_SPLASH) — `splashPending` vira false. */
void endSplash();

/**
 * Expõe `__cortexSplashActive()` ao JS: `true` enquanto a splash cobre a tela.
 * O jogo espera isto virar `false` pra mostrar SUA tela de loading — senão o
 * carregamento roda "atrás" da splash e a barra só aparece no fim (ADR-0138).
 */
void registerSplash(napi_env env);

}  // namespace webgpu
