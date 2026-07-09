// Splash OBRIGATÓRIA da engine (ADR-0109): a marca TS Cortex Studio aparece nos
// primeiros ~1,9 s de qualquer jogo exportado, cobrindo o tempo de carga.
//
// Ela NÃO pode rodar antes do JS bootar: o adapter/device do WebGPU são
// adquiridos PELO JS (navigator.gpu, ver core/host_gpu.h), então o host não tem
// device na hora em que a janela sobe. Por isso a splash vive no loop de frames
// e só começa a contar quando o device existe.
#pragma once

#include "../core/host_gpu.h"

namespace webgpu {

/**
 * Desenha um frame da splash na swapchain e apresenta.
 *
 * Chame UMA vez por frame do host, DEPOIS do present normal: a splash adquire a
 * própria textura de surface e apresenta por cima, então não disputa a
 * `currentTexture` que o JS possa ter adquirido.
 *
 * @return true enquanto a splash estiver visível (o host segue chamando);
 *         false quando terminou (e os recursos já foram liberados) ou enquanto
 *         o device ainda não existe.
 */
bool splashFrame(HostGpu* gpu, double elapsedMs);

/** Libera textura/pipeline da splash. Idempotente. */
void shutdownSplash();

}  // namespace webgpu
