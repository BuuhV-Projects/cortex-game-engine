// Ver render_list.h (M4 do ADR-0237).
#include "render_list.h"

#include <algorithm>

namespace render {

void sortRenderList(std::vector<RenderItem>& items) {
  std::stable_sort(items.begin(), items.end(), [](const RenderItem& a, const RenderItem& b) {
    // Opaco antes de transparente: o transparente precisa do depth já escrito.
    if (a.transparent != b.transparent) return !a.transparent;
    if (!a.transparent) {
      // Opacos: agrupa por pipeline para não ficar trocando estado no encoder.
      return a.pipelineKey < b.pipelineKey;
    }
    // Transparentes: do mais longe para o mais perto. Trocar isto não muda o
    // desempenho, muda a imagem.
    return a.depthSq > b.depthSq;
  });
}

}  // namespace render
