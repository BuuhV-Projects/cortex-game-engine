// RenderList nativa (M4 do ADR-0237).
//
// Monta e ordena a lista de desenho a partir do que o `SceneMirror` já calculou
// (matriz de mundo e visibilidade). Duas regras, e as duas têm motivo medido:
//
// - **Opacos agrupados por pipeline.** Trocar pipeline é o que custa caro no
//   encoder; com 5 pipelines na cena inteira (SPEC-0238), agrupar reduz as
//   trocas a praticamente uma por grupo.
// - **Transparentes de trás para frente**, sempre depois dos opacos. Aqui a
//   ordem não é otimização, é correção: transparência fora de ordem é o erro
//   visual mais provável desta migração, e o critério do marco é a ordem bater
//   com a do `three`.
#pragma once

#include <cstdint>
#include <vector>

namespace render {

/** Um item a desenhar. */
struct RenderItem {
  /** Índice do nó no `SceneMirror`. */
  int32_t node = 0;
  /** Chave do pipeline (SPEC-0238) — é por ela que os opacos são agrupados. */
  uint64_t pipelineKey = 0;
  /** Distância ao quadrado até a câmera; ordena os transparentes. */
  float depthSq = 0;
  /** `true` quando o material tem blend. */
  bool transparent = false;
};

/**
 * Ordena em lugar: opacos primeiro (agrupados por pipeline), transparentes
 * depois (do mais distante para o mais próximo).
 *
 * Ordenação **estável**: dois itens equivalentes mantêm a ordem de entrada, que
 * é a da cena. Sem isso, a ordem de desenho mudaria de frame a frame para
 * objetos empatados, e diferenças sutis de imagem apareceriam sem causa
 * aparente.
 */
void sortRenderList(std::vector<RenderItem>& items);

}  // namespace render
