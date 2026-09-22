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
/**
 * Floats por nó no buffer de sincronização: idx + posição + quat + escala +
 * flags do frame.
 *
 * O `visible` entrou no M6 (SPEC-0245). Ele era fixado no `build` e nunca mais
 * atualizado, então um nó escondido em runtime seguia contando como visível no
 * C++ para sempre — invisível na medição enquanto o filtro angular estava
 * ligado (ele já cortava esses objetos), e uma divergência de até 42 casters
 * com `?casterMinRatio=0`. No passo 2 isso seria sombra de objeto escondido.
 */
constexpr int kSyncFloatsPerNode = 12;
/**
 * Posição das flags do FRAME na linha de sincronização (ver {@link SyncFlag}).
 *
 * É um campo de bits, e não um float por booleano: o que muda por frame cabe
 * num slot só, então acrescentar um estado novo aqui não alarga a linha nem
 * renumera o layout — que é o que custaria uma passada a mais por nó na
 * escrita do JS.
 */
constexpr int kSyncFlags = 11;

/** Bits de {@link kSyncFlags} — o estado que o `three` reavalia TODO frame. */
enum SyncFlag : uint8_t {
  /** `object.visible` próprio do nó (a herança é resolvida em C++). */
  kSyncVisible = 1 << 0,
  /**
   * `material.visible` do `_projectObject`.
   *
   * Vem por frame pelo mesmo motivo do `visible`, e foi o mesmo erro: era
   * fotografado no `build` e nunca mais olhado, enquanto o `three` o reavalia
   * a cada travessia. Um material desligado em runtime seguiria projetando
   * sombra do lado nativo — sombra de objeto que não está na imagem.
   */
  kSyncMaterialVisible = 1 << 1,
};
/** Valor de `geometryId` para um nó sem geometria registrada. */
constexpr int32_t kNoGeometry = -1;

/**
 * Bits de {@link NodeDesc::flags} — a autoria estática de um nó, espelhada uma
 * vez no `build`.
 *
 * São flags e não `bool` soltos porque atravessam a ponte empacotados num
 * float só: um campo novo aqui não renumera o layout de construção.
 *
 * 16 bits: os motivos de recusa do gate (SPEC-0245, E3) levaram a lista a nove
 * bits. Todos os valores cabem exatos num `float32`, que é como eles viajam.
 */
enum NodeFlag : uint16_t {
  /**
   * `castShadow` como o AUTOR deixou (nó/JSON/Inspector), não como o filtro
   * angular o deixou no frame. A distinção é o contrato da SPEC-0197: o filtro
   * só pode TIRAR sombra de quem tinha, nunca dar a quem o autor desligou — e
   * quem reaplica o filtro aqui é o enumerador, então o que ele precisa
   * receber é o teto, não o resultado.
   */
  kNodeCastShadow = 1 << 0,
  /**
   * Fica FORA do filtro angular: malha skinada (o bounding sphere da geometria
   * mente com o rig) e `InstancedMesh` (o bounding sphere descreve uma
   * instância, não o conjunto). Espelha a exceção de `ShadowCasterCulling.ts`.
   */
  kNodeSkipAngularCull = 1 << 1,
  /** `frustumCulled` do objeto: quando desligado, nenhum frustum o corta. */
  kNodeFrustumCulled = 1 << 2,
  /**
   * É malha desenhável: `isMesh` com geometria.
   *
   * O `material.visible` NÃO entra aqui — ele mudou de canal no passo 2
   * (SPEC-0245) e viaja por frame em {@link kSyncMaterialVisible}. O que fica
   * neste bit é só o que não muda: um `Group` nunca vira malha.
   */
  kNodeDrawable = 1 << 3,
  /**
   * Malha skinada. O bounding sphere mente com o rig, e o passe nativo não
   * aplica o esqueleto — é motivo de RECUSA do gate (SPEC-0245, E3).
   */
  kNodeSkinned = 1 << 4,
  /**
   * `InstancedMesh`. O registro de geometria descreve UMA instância; desenhar
   * por ele deixaria de fora todas as outras. Motivo de recusa.
   */
  kNodeInstanced = 1 << 5,
  /**
   * Material em ARRAY. A RenderList do `three` gera um item por grupo da
   * geometria, e o registro desenha a geometria inteira de uma vez — as duas
   * contagens divergem e o desenho sai errado. Motivo de recusa.
   */
  kNodeMaterialArray = 1 << 6,
  /**
   * Recorte alfa (`alphaTest > 0` ou `alphaMap`). O `three` COPIA isso para o
   * material do passe de sombra, então a silhueta da sombra é recortada — o
   * passe nativo é depth-only e não amostra textura. Motivo de recusa.
   */
  kNodeAlphaClip = 1 << 7,
  /**
   * Material com `positionNode` (deslocamento de vértice em TSL). O `three`
   * também o copia para o passe de sombra; a casca de contorno do engine tem
   * um. Reproduzi-lo exigiria compilar o nó em C++. Motivo de recusa.
   */
  kNodePositionNode = 1 << 8,
};

/**
 * Esfera de recorte da geometria, em espaço LOCAL do nó.
 *
 * Local, e não de mundo, porque é o que o `three` guarda
 * (`geometry.boundingSphere`) e é o que não muda quando o objeto se move — a
 * conversão para mundo é uma multiplicação por nó, feita no frame.
 */
struct Bounds {
  double cx = 0, cy = 0, cz = 0;
  double radius = 0;
};

/**
 * Transform local de um nó, como o JS o descreve.
 *
 * Em double, e não float: o `three` guarda matriz em double, e na escala de uma
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
  /** `material.visible` inicial; depois disso chega por frame (SPEC-0245). */
  bool materialVisible = true;
  /**
   * Combinação de {@link NodeFlag}.
   *
   * 16 bits e não 8: os motivos de recusa do gate (E3) passaram de quatro bits
   * para nove, e estourar em silêncio faria o gate ACEITAR um caster que devia
   * recusar — a falha exatamente na direção errada.
   */
  uint16_t flags = 0;
  /** Id da geometria no `GeometryRegistry`, ou {@link kNoGeometry}. */
  int32_t geometryId = kNoGeometry;
  /** Esfera da geometria em espaço local (ver {@link Bounds}). */
  Bounds bounds;
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

  /**
   * Nós cuja matriz de mundo foi recomposta no último {@link updateAndCull}.
   *
   * É o que decide quais uniformes sobem para a GPU (M3 do ADR-0237): quem não
   * mudou mantém o slot do frame anterior e não gera `writeBuffer`. A lista
   * precisa ser montada **durante** a passada — as flags de sujo são o canal
   * que o pai usa para avisar o filho, e são limpas no fim dela.
   */
  const std::vector<NodeIndex>& changedThisFrame() const { return changed_; }

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

  /** Pai de um nó, ou {@link kNoParent}. */
  NodeIndex parent(NodeIndex index) const { return parents_[static_cast<size_t>(index)]; }

  /**
   * `visible` PRÓPRIO do nó — não leva o pai em conta.
   *
   * O `three` poda a subárvore inteira num pai invisível; quem precisa dessa
   * regra é quem percorre (ver `ShadowCasterEnumerator`), e reproduzi-la aqui
   * custaria uma passada extra a quem não precisa dela.
   */
  bool visibleFlag(NodeIndex index) const { return visibleFlags_[static_cast<size_t>(index)] != 0; }

  /**
   * `material.visible` deste FRAME.
   *
   * Separado do {@link visibleFlag} porque os dois escondem coisas diferentes:
   * `object.visible` poda a subárvore inteira, `material.visible` tira só
   * aquela malha da RenderList — o filho de uma malha sem material continua
   * desenhando.
   */
  bool materialVisibleFlag(NodeIndex index) const {
    return materialVisibleFlags_[static_cast<size_t>(index)] != 0;
  }

  /** Combinação de {@link NodeFlag} declarada no `build`. */
  uint16_t flags(NodeIndex index) const { return flags_[static_cast<size_t>(index)]; }

  /** `true` se o nó tem o bit pedido. */
  bool hasFlag(NodeIndex index, NodeFlag flag) const {
    return (flags_[static_cast<size_t>(index)] & static_cast<uint16_t>(flag)) != 0;
  }

  /** Id da geometria do nó, ou {@link kNoGeometry}. */
  int32_t geometryId(NodeIndex index) const { return geometryIds_[static_cast<size_t>(index)]; }

  /** Esfera da geometria, em espaço local. */
  const Bounds& bounds(NodeIndex index) const { return bounds_[static_cast<size_t>(index)]; }

 private:
  std::vector<NodeIndex> parents_;
  std::vector<Transform> locals_;
  std::vector<float> radii_;
  std::vector<uint8_t> visibleFlags_;
  /** `material.visible` por nó, atualizado por frame junto do transform. */
  std::vector<uint8_t> materialVisibleFlags_;
  /** Autoria estática por nó: {@link NodeFlag}. */
  std::vector<uint16_t> flags_;
  /** Geometria de cada nó, para o passe nativo saber o que desenhar. */
  std::vector<int32_t> geometryIds_;
  /** Esfera local de cada nó. */
  std::vector<Bounds> bounds_;
  /** Matriz local de cada nó (16 floats por nó), recomposta quando o transform muda. */
  std::vector<double> local_;
  /** Matriz de mundo de cada nó (16 floats por nó). */
  std::vector<double> world_;
  /** Nós cuja matriz local mudou desde o último update. */
  std::vector<uint8_t> dirty_;
  std::vector<NodeIndex> visible_;
  /** Quem teve a matriz de mundo recomposta no frame (M3). */
  std::vector<NodeIndex> changed_;
};

}  // namespace scene
