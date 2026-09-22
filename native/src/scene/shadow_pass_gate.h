// Gate de recusa do passe de sombra nativo (SPEC-0245, E3 do passo 2).
//
// Antes de desenhar qualquer coisa, o sistema precisa saber QUANDO NÃO PODE
// ASSUMIR. Recusar significa que o `three` mantém o passe de sombra dele e
// tudo segue como hoje — o princípio do M1: **recusar em vez de aproximar**.
//
// A assimetria importa. Aceitar por engano é sombra errada ou sombra faltando
// na imagem do jogador, descoberta tarde e difícil de rastrear; recusar por
// engano é só não ganhar os milissegundos deste marco, e aparece no log. Por
// isso todo caso duvidoso recusa.
//
// A unidade é PURA — sem wgpu, sem NAPI — e é por isso que a consulta ao
// registro de geometria entra por um ponteiro de função: o `GeometryRegistry`
// arrasta `webgpu.h`, e depender dele aqui tiraria o gate do harness
// `cortex_host_tests`, que é justamente onde cada condição é exercitada.
#pragma once

#include <cstdint>
#include <vector>

#include "scene_mirror.h"

namespace scene {

/**
 * Por que o passe nativo NÃO pode assumir o frame.
 *
 * A ordem é a de prioridade do relato: os dois primeiros são fatos do frame
 * inteiro, o resto é por caster. {@link kNone} = aceito.
 */
enum class ShadowGateRefusal : uint8_t {
  kNone = 0,
  /**
   * A cena do `three` tem mais (ou menos) nós que o espelho.
   *
   * O espelho é montado uma vez no `install` e não cresce (SPEC-0234), então
   * um nó criado depois dele NÃO EXISTE do lado nativo. Enquanto o `three`
   * desenhava a sombra isso era erro de contagem; com o passe nativo no lugar
   * dele vira **sombra faltando**, porque ninguém mais desenha o que o C++ não
   * vê. Medido no kart-racer: 977 nós na cena contra 975 no espelho.
   */
  kNodeCountDivergence,
  /**
   * `renderer.shadowMap.type === VSMShadowMap`.
   *
   * Com VSM a RT de COR do shadow map importa, e desligar o passe do `three`
   * (E6) é o que deixa de limpá-la. Com PCF/PCFSoft ela é irrelevante — mas o
   * tipo é configurável, então é guarda e não suposição.
   */
  kVsmShadowMap,
  /** Caster skinado: o bounding sphere mente com o rig e o passe não aplica o esqueleto. */
  kSkinnedCaster,
  /** `InstancedMesh`: o registro descreve uma instância, não o conjunto. */
  kInstancedCaster,
  /**
   * Material em array: a RenderList do `three` gera um item POR GRUPO da
   * geometria, e o registro desenha a geometria inteira. `GeometryEntry` não
   * guarda `drawRange` nem grupos, então não há o que aproximar.
   */
  kMaterialArray,
  /** `alphaTest > 0` ou `alphaMap`: o `three` copia o recorte para o passe de sombra. */
  kAlphaClip,
  /** `positionNode`: deslocamento de vértice que o passe depth-only não reproduz. */
  kPositionNode,
  /** A geometria do caster não está no `GeometryRegistry` — não há o que desenhar. */
  kGeometryMissing,
};

/**
 * Quantos valores {@link ShadowGateRefusal} existem, incluindo
 * {@link ShadowGateRefusal::kNone} — é o tamanho de {@link
 * ShadowGateResult::counts}.
 *
 * Tem de acompanhar o enum. Errar para menos não dá erro de compilação: a
 * contagem do último motivo cai FORA do array, em cima do campo seguinte, e o
 * gate passa a relatar número inventado.
 */
constexpr int kShadowGateRefusalCount = 9;

/** Fatos do frame inteiro, que só o JS enxerga. */
struct ShadowGateFrame {
  /**
   * Nós que a cena do `three` tem AGORA (contados no JS).
   *
   * Negativo = "não medido neste frame"; o gate então pula a checagem de
   * divergência em vez de recusar por um número que não existe.
   */
  int32_t sceneNodeCount = -1;
  /** `renderer.shadowMap.type === VSMShadowMap`. */
  bool vsmShadowMap = false;
};

/**
 * Consulta ao registro de geometria, injetada para a unidade ficar pura.
 *
 * `nullptr` significa "não há registro para consultar", e aí toda geometria
 * conta como ausente — recusa, que é o lado seguro.
 */
using GeometryPresence = bool (*)(int32_t geometryId, void* userData);

/** Veredito do gate, com o que basta para explicá-lo no log. */
struct ShadowGateResult {
  bool accepted = false;
  /** Primeiro motivo por ordem de prioridade; {@link ShadowGateRefusal::kNone} se aceito. */
  ShadowGateRefusal reason = ShadowGateRefusal::kNone;
  /** Quantos objetos caíram em {@link reason}. */
  int32_t offenders = 0;
  /**
   * Contagem por motivo, indexada pelo valor de {@link ShadowGateRefusal}.
   *
   * Todos os motivos são contados, não só o primeiro: um caster pode ser
   * skinado E ter recorte alfa, e saber quantos objetos caem em cada condição
   * é o que diz se a recusa é uma malha isolada ou a cena inteira.
   */
  int32_t counts[kShadowGateRefusalCount] = {};
  /** Casters distintos recusados (um caster com dois motivos conta uma vez). */
  int32_t refusedCasters = 0;
  /** Casters avaliados. */
  int32_t totalCasters = 0;
};

/**
 * Decide se o passe nativo pode assumir o frame.
 *
 * @param mirror    espelho já atualizado no frame
 * @param casters   saída do {@link ShadowCasterEnumerator}
 * @param frame     fatos do frame que só o JS enxerga
 * @param presence  consulta ao registro de geometria (ver {@link GeometryPresence})
 * @param userData  repassado a `presence` sem ser tocado
 */
ShadowGateResult evaluateShadowPassGate(const SceneMirror& mirror,
                                        const std::vector<NodeIndex>& casters,
                                        const ShadowGateFrame& frame, GeometryPresence presence,
                                        void* userData);

/** Nome do motivo, para o relato por log sair legível sem depurador. */
const char* shadowGateRefusalName(ShadowGateRefusal reason);

}  // namespace scene
