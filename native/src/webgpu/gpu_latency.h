// Latência de conclusão do trabalho de GPU (SPEC-0253).
//
// Existe porque o kart-racer congela a tela por ~1 s enquanto o fps NÃO CAI, e
// todos os suspeitos de CPU já foram descartados por medição: o laço do JS não
// tem gap nenhum, o present custa 2 a 3 ms, nenhum pipeline/buffer/textura
// nasce no momento, e o `frameMs` máximo da sessão inteira foi 22,2 ms.
//
// Ou seja: a CPU produz frames normalmente enquanto a imagem não atualiza. O
// tempo está depois de tudo que os contadores atuais enxergam.
//
// Mede PONTA A PONTA — do `wgpuQueueSubmit` até a GPU avisar que terminou —, e
// não o tempo puro de execução na GPU. É deliberado: o que se caça é um frame
// que não chega à tela, e isso pode ser espera de fila, de swapchain ou do
// compositor. Nada disso apareceria num timestamp por pass.
//
// Desligado por padrão; liga junto com o cronômetro de fases, por
// `CORTEX_FRAME_TIMING`.
#pragma once

struct WGPUQueueImpl;
struct WGPUInstanceImpl;

namespace webgpu {

/** Liga a coleta conforme o ambiente. Uma vez, no boot. */
void initGpuLatency();

/** A coleta está ligada? */
bool gpuLatencyEnabled();

/**
 * Registra o frame recém-submetido e pede à GPU que avise ao terminar.
 * Chamado logo depois do `wgpuQueueSubmit` do frame.
 */
void trackSubmittedFrame(WGPUQueueImpl* queue);

/**
 * Processa os avisos pendentes da GPU.
 *
 * Precisa ser chamado por frame: o callback do wgpu só dispara quando alguém
 * bombeia os eventos, e o host só fazia isso em pontos pontuais. Sem esta
 * chamada a medida nunca chega, e o relatório mostraria "latência zero" — que
 * é a conclusão errada mais cara possível aqui.
 */
void pumpGpuLatency(WGPUInstanceImpl* instance);

/**
 * Escreve mediana e p95 no `perf-log.txt` a cada N frames, ao lado das fases
 * do frame. Devolve `false` se não houve amostra no período.
 */
bool reportGpuLatency();

}  // namespace webgpu
