// Enumerador de casters de sombra em C++ (SPEC-0245, passo 1 do M6).
//
// Responde a UMA pergunta: dado o espelho de cena, quais nós o `three`
// desenharia no passe de sombra deste frame? Nada é desenhado aqui — desenhar
// é o passo 2. Separar as duas coisas é o que deixa esta unidade PURA: sem
// wgpu, sem NAPI, testável no harness `cortex_host_tests`.
//
// Para a resposta bater, os filtros têm de ser os mesmos do `three`, NA MESMA
// ORDEM em que ele os aplica:
//
//   1. `_projectObject` volta na porta se `object.visible === false` — e volta
//      com a SUBÁRVORE inteira, então a visibilidade é herdada;
//   2. só malha desenhável com material visível entra na RenderList;
//   3. o culling angular da SPEC-0197 (`ShadowCasterCulling.ts`) já decidiu o
//      `castShadow` do frame; aqui ele é REAPLICADO sobre a autoria, em vez de
//      lido do `three`, porque o C++ não vê a mutação que o JS faz;
//   4. `_projectObject` corta pelo frustum da câmera da CASCATA (uma ortho),
//      não da câmera do jogo;
//   5. `getShadowRenderObjectFunction` só chama `renderObject` quando
//      `object.castShadow === true` — o filtro que o `three` aplica DEPOIS da
//      RenderList, e que é a razão de a lista ser muito maior que os draws.
#pragma once

#include <cstdint>
#include <vector>

#include "scene_mirror.h"

namespace scene {

/**
 * Distância mínima usada na razão do culling angular.
 *
 * Espelha `MIN_DISTANCE` de `ShadowCasterCulling.ts`: evita a divisão por ~0
 * quando o objeto está em cima da câmera.
 */
constexpr double kMinCasterDistance = 1.0;

/** Parâmetros da sombra no frame. */
struct ShadowCasterParams {
  /**
   * Limiar `raio / distância` da SPEC-0197. `<= 0` desliga o filtro angular e
   * devolve a autoria, exatamente como `shouldCastShadow` faz.
   */
  double minRatio = 0;
  /** Posição da câmera do JOGO, em mundo — é dela que sai a distância. */
  double cameraX = 0, cameraY = 0, cameraZ = 0;
};

/**
 * Reproduz em C++ a seleção de casters do `three`.
 *
 * Guarda os vetores de trabalho entre frames: a enumeração roda dentro do
 * frame e alocar ~1.300 bytes por passada devolveria em malloc o que o marco
 * quer ganhar em submissão.
 */
class ShadowCasterEnumerator {
 public:
  /**
   * Enumera os casters.
   *
   * @param mirror       espelho já atualizado por `updateAndCull` (as matrizes
   *                     de mundo precisam ser as deste frame)
   * @param params       limiar angular e posição da câmera do jogo
   * @param shadowPlanes 6 planos, 4 floats cada, da câmera da CASCATA, em
   *                     espaço de mundo
   * @return quantos casters entraram; os índices ficam em {@link casters}
   */
  int enumerate(const SceneMirror& mirror, const ShadowCasterParams& params, const float* shadowPlanes);

  /** Índices da última {@link enumerate}, na ordem da cena. */
  const std::vector<NodeIndex>& casters() const { return casters_; }

 private:
  /** `visible` já com a herança do pai resolvida (o `three` poda a subárvore). */
  std::vector<uint8_t> effectiveVisible_;
  std::vector<NodeIndex> casters_;
};

/**
 * A regra de `shouldCastShadow` (`ShadowCasterCulling.ts`), isolada para o
 * teste poder atacar as bordas do limiar sem montar uma cena.
 */
bool shouldCastShadow(double radius, double distance, double minRatio);

}  // namespace scene
