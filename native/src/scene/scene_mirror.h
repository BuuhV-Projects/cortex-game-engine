// Espelho da hierarquia de cena em C++ (SPEC-0233, fase 2 do ADR-0232).
//
// O JS descreve a cena uma vez e, por frame, manda só o que mudou — 63 nós de
// ~1.300 no kart-racer, medido. Aqui acontecem as duas fases que em JS custam
// 8,5 ms por frame: compor a matriz de mundo e cortar pelo frustum.
//
// A cena é guardada em memória LINEAR com pai antes de filho. Não é detalhe de
// implementação: é o que transforma a propagação de matriz numa passada
// sequencial, em vez de uma perseguição de ponteiros com um cache miss por nó.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace scene {

/** Índice de nó. `kNoParent` marca raiz. */
using NodeIndex = int32_t;
constexpr NodeIndex kNoParent = -1;

/** Quantos planos tem um frustum. */
constexpr int kFrustumPlanes = 6;
/** Floats por nó no buffer de sincronização: idx + posição + quat + escala. */
constexpr int kSyncFloatsPerNode = 11;

/**
 * Transform local de um nó, como o JS o descreve.
 *
 * Em double, e não float: o  guarda matriz em double, e na escala de uma
 * cidade (centenas de metros) o float32 perde dígitos suficientes para o shadow
 * map ganhar bandas. Foi o que aconteceu na primeira versão desta fase.
 */
struct Transform {
  double px = 0, py = 0, pz = 0;
  double qx = 0, qy = 0, qz = 0, qw = 1;
  double sx = 1, sy = 1, sz = 1;
};

/** Um nó da cena, na descrição inicial. */
struct NodeDesc {
  NodeIndex parent = kNoParent;
  Transform transform;
  /** Raio da esfera de recorte, em unidades de mundo. 0 = não participa do culling. */
  float radius = 0;
  bool visible = true;
};

/**
 * Cópia da hierarquia em C++.
 *
 * Contrato de ordem: **todo nó vem depois do seu pai**. É o que permite a
 * propagação ser um laço linear; `build` rejeita uma árvore fora de ordem em
 * vez de produzir matriz errada em silêncio.
 */
class SceneMirror {
 public:
  /** Recebe a árvore. Devolve `false` se algum nó vier antes do pai. */
  bool build(const std::vector<NodeDesc>& nodes);

  /**
   * Aplica os transforms que mudaram no frame, lidos do buffer que o JS
   * escreveu (ver {@link kSyncFloatsPerNode}). Índice fora da cena é ignorado —
   * o JS pode estar um frame à frente numa remoção.
   */
  void applyTransforms(const double* buffer, size_t valueCount);

  /**
   * Compõe as matrizes de mundo e corta pelo frustum.
   *
   * @param viewProj  matriz 4x4 (16 floats, coluna-maior como no three)
   * @param planes    6 planos do frustum, 4 floats cada
   * @return quantos nós ficaram visíveis; os índices ficam em {@link visible}
   */
  int updateAndCull(const float* viewProj, const float* planes);

  /** Índices visíveis do último {@link updateAndCull}. */
  const std::vector<NodeIndex>& visible() const { return visible_; }

  /** Matriz de mundo de um nó (16 doubles), após {@link updateAndCull}. */
  const double* worldMatrix(NodeIndex index) const { return &world_[static_cast<size_t>(index) * 16]; }

  /**
   * Memória crua das matrizes de mundo, para ser exposta ao JS **sem cópia**
   * (`napi_create_external_arraybuffer`). O `three` aponta o
   * `matrixWorld.elements` de cada objeto para a fatia dele e passa a ler
   * daqui — é o que elimina o laço de aplicação em JS (SPEC-0234).
   *
   * Cuidado: o vetor não pode realocar enquanto o JS segura o buffer, senão o
   * ponteiro que ele guarda vira lixo. Por isso a cena é montada uma vez em
   * {@link build} e não cresce depois.
   */
  double* worldData() { return world_.data(); }
  size_t worldElementCount() const { return world_.size(); }

  size_t size() const { return parents_.size(); }

 private:
  std::vector<NodeIndex> parents_;
  std::vector<Transform> locals_;
  std::vector<float> radii_;
  std::vector<uint8_t> visibleFlags_;
  /** Matriz local de cada nó (16 floats por nó), recomposta quando o transform muda. */
  std::vector<double> local_;
  /** Matriz de mundo de cada nó (16 floats por nó). */
  std::vector<double> world_;
  /** Nós cuja matriz local mudou desde o último update. */
  std::vector<uint8_t> dirty_;
  std::vector<NodeIndex> visible_;
};

}  // namespace scene
