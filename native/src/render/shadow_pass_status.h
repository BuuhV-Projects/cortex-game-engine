// Resultado do passe de sombra nativo por cascata (SPEC-0690, item 3).
//
// O `drawShadowCasters` devolvia 0 em três casos que pedem respostas opostas:
// cascata vazia (o alvo tem de ser LIMPO, senão a sombra do quadro anterior
// fica), casters não prontos (o alvo NÃO pode ser limpo, e a cascata é recusada)
// e casters descartados pelo shim (recusa, sem tocar no alvo). Esta unidade
// separa os três, e é PURA — sem wgpu, sem NAPI — para o harness
// `cortex_host_tests` exercitar cada decisão sem GPU.
#pragma once

#include <cstdint>
#include <vector>

namespace render {

/**
 * Como terminou o passe de uma cascata.
 *
 * Os valores são o código do contrato da SPEC-0690: não mude a ordem sem mudar o
 * `mirrorBridge.ts`. O slot `kGateOutStatus` leva o código + 1 ({@link shadowStatusSlot}).
 */
enum class ShadowPassStatus : uint8_t {
  /** Desenhou pelo menos um caster. */
  kOk = 0,
  /** Nada a desenhar: o alvo foi limpo (profundidade 1), sem draws. */
  kClearedEmpty = 1,
  /** Havia casters, mas faltou geometria, pipeline ou uniforme: nada submetido. */
  kNotReady = 2,
  /** O gate recusou, ou não há alvo: o C++ não chegou a desenhar. */
  kRefused = 3,
  /** O shim descartou algum caster depois do gate: nada desenhado nem limpo. */
  kSkipped = 4,
};

/**
 * Deslocamento do código no slot `kGateOutStatus`: 0 fica reservado para "nada
 * escrito", que é o que um host antigo (ou um vetor zerado) deixa no slot.
 */
constexpr double kStatusSlotOffset = 1.0;

/** O valor que vai no slot `kGateOutStatus` para `status`. */
constexpr double shadowStatusSlot(ShadowPassStatus status) {
  return static_cast<double>(status) + kStatusSlotOffset;
}

/** O que o `drawShadowCasters` devolve: quantos desenhou e como terminou. */
struct ShadowPassResult {
  uint32_t drawn = 0;
  ShadowPassStatus status = ShadowPassStatus::kNotReady;
};

/**
 * Decide o status antes de abrir o pass, só pelas contagens da lista.
 *
 * @param total           itens que chegaram ao `drawShadowCasters`
 * @param missingGeometry itens cuja geometria não está no `GeometryRegistry`
 * @param emptyInstances  itens com `instanceCount == 0` (vazio legítimo)
 *
 * Lista vazia, ou só de lotes vazios, é {@link ShadowPassStatus::kClearedEmpty};
 * qualquer geometria ausente é {@link ShadowPassStatus::kNotReady} (desenhar o
 * resto daria um mapa sem parte dos casters, que é sombra faltando); o resto é
 * {@link ShadowPassStatus::kOk}. A falha de pipeline ou de uniforme, que só se
 * descobre com GPU, também vira `kNotReady` no chamador.
 */
ShadowPassStatus classifyShadowPass(uint32_t total, uint32_t missingGeometry,
                                    uint32_t emptyInstances);

/** `true` quando o status abre e submete um pass no alvo (desenha ou limpa). */
bool shadowPassWritesTarget(ShadowPassStatus status);

/** Um passo do passe de uma cascata, na ordem em que o `drawShadowCasters` o executa. */
enum class ShadowPassStep : uint8_t {
  /** Abre o render pass só de profundidade no alvo. */
  kOpen,
  /** Escreve o uniforme do próximo caster no slot dele (fila, antes do submit). */
  kWriteUniform,
  /** Desenha o próximo caster. */
  kDraw,
  /** Fecha e submete o pass. */
  kSubmit,
};

/**
 * O roteiro do passe de uma cascata (SPEC-0690), PURO para o harness conferir a
 * ordem sem GPU.
 *
 * - {@link ShadowPassStatus::kOk}: abre, escreve os `drawable` uniformes, faz
 *   os `drawable` draws e submete — toda escrita vem ANTES do submit da própria
 *   cascata, que é o que deixa duas cascatas no mesmo quadro reaproveitarem os
 *   slots `0..n-1` sem uma ler o uniforme da outra;
 * - {@link ShadowPassStatus::kClearedEmpty}: abre e submete, sem draw (limpa);
 * - os outros: vazio — nada é submetido, o alvo fica como estava.
 */
std::vector<ShadowPassStep> planShadowPass(ShadowPassStatus status, uint32_t drawable);

/** Slot de um item que não desenha (`instanceCount == 0`). */
constexpr uint32_t kNoShadowSlot = UINT32_MAX;

/**
 * Slot de uniforme de cada item de UMA chamada: sequencial a partir de 0, na
 * ordem da lista, pulando os itens com `instanceCount == 0` (que recebem
 * {@link kNoShadowSlot}). Cada cascata recomeça do 0: os slots valem só até o
 * submit dela (ver {@link planShadowPass}).
 *
 * @return quantos itens desenham.
 */
uint32_t assignShadowSlots(const uint32_t* instanceCounts, uint32_t total,
                           std::vector<uint32_t>& out);

/** Destino de um caster aceito pelo gate, na montagem da lista do shim. */
enum class ShadowItemFate : uint8_t {
  /** Entra na lista do desenho. */
  kDraw,
  /** Lote instanciado com `count == 0`: vazio legítimo, só não entra. */
  kEmpty,
  /** Falta algo que o gate deveria ter garantido: conta em `skipped`. */
  kSkipped,
};

/** O que o shim sabe de um caster quando monta a lista (ver {@link shadowItemFate}). */
struct ShadowItemFacts {
  /** `geometryId != kNoGeometry`. */
  bool hasGeometry = true;
  /** Nó `InstancedMesh`. */
  bool instanced = false;
  /** O `InstanceBufferStore` tem o lote do nó. */
  bool batchFound = false;
  /** Instâncias do lote. */
  uint32_t batchCount = 0;
  /** Nó com recorte alfa (SPEC-0642). */
  bool alphaClip = false;
  /** O `AlphaClipStore` tem o recorte do nó. */
  bool alphaClipFound = false;
};

/**
 * Descarte silencioso era o caso que a SPEC-0690 tira: sem geometria, sem lote
 * ou sem recorte na store, o caster sumiria do mapa sem ninguém saber. Agora ele
 * vira {@link ShadowItemFate::kSkipped}, e a cascata é recusada.
 */
ShadowItemFate shadowItemFate(const ShadowItemFacts& facts);

}  // namespace render
