// Passe nativo do render (SPEC-0241, passo 3).
//
// Desenha malhas REAIS da cena numa pass própria em C++, no alvo do `three`,
// DEPOIS dele. A ordem importa e foi medida no passo 0: desenhar antes não
// funciona (o `three` limpa o alvo e o céu dele cobre a tela); desenhar depois
// funciona e a profundidade que ele escreveu é respeitada, então a oclusão
// entre os dois motores sai correta.
#pragma once

#include <cstdint>

#include <webgpu/webgpu.h>

struct HostGpu;

namespace render {

/** Uma malha a desenhar: id no registro de geometria + como posicioná-la. */
struct NativeDrawItem {
  uint32_t geometryId = 0;
  /** Matriz de mundo, coluna-maior, como o `three` a mantém. */
  float model[16] = {};
  /** Cor sólida enquanto os modelos de sombreamento não entram. */
  float color[4] = {1.0f, 1.0f, 1.0f, 1.0f};
};

/**
 * Abre uma pass no alvo do `three` (sem limpar) e desenha os itens.
 *
 * `viewProjection` vem da câmera do `three`, para a imagem casar exatamente com
 * o que ele desenhou — recalcular a projeção aqui introduziria diferença
 * sub-pixel sem motivo.
 *
 * `viewProfundidade`, quando vem preenchida, é usada no lugar de uma view nova
 * criada a partir da textura. Isso importa porque o `three` guarda a view do
 * alvo da canvas no descriptor dele: se a textura for recriada depois, ele
 * segue escrevendo na VIEW ANTIGA, e uma view nova da textura atual lê um
 * buffer zerado — o passe desenha e nada oclui.
 *
 * Devolve quantos itens foram efetivamente desenhados: item cuja geometria não
 * está registrada é **pulado**, não aproximado.
 */
uint32_t drawNativeItems(HostGpu* gpu, WGPUTexture alvoCor, WGPUTexture alvoProfundidade,
                         WGPUTextureView viewProfundidade, const float viewProjection[16],
                         const NativeDrawItem* itens, uint32_t total);

}  // namespace render
