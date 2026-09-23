// Ver shadow_pass_gate.h (SPEC-0245, E3 do passo 2).
#include "shadow_pass_gate.h"

namespace scene {
namespace {

/** Marca o motivo e devolve `true`, para o chamador somar o caster uma vez só. */
bool marcar(ShadowGateResult& r, ShadowGateRefusal reason) {
  r.counts[static_cast<size_t>(reason)] += 1;
  return true;
}

/**
 * Motivos por caster, na ordem de prioridade do relato.
 *
 * A lista é percorrida inteira por caster (não para no primeiro): um objeto
 * skinado que também tem recorte alfa aparece nas duas contagens, e é isso que
 * permite ler do log se tirar uma condição bastaria para o gate aceitar.
 */
const ShadowGateRefusal kPerCasterOrder[] = {
    ShadowGateRefusal::kSkinnedCaster,  ShadowGateRefusal::kInstancedCaster,
    ShadowGateRefusal::kMaterialArray,  ShadowGateRefusal::kAlphaClip,
    ShadowGateRefusal::kPositionNode,   ShadowGateRefusal::kGeometryMissing,
    ShadowGateRefusal::kUnsupportedSide,
};

}  // namespace

const char* shadowGateRefusalName(ShadowGateRefusal reason) {
  switch (reason) {
    case ShadowGateRefusal::kNone: return "aceito";
    case ShadowGateRefusal::kNodeCountDivergence: return "divergencia-de-nos";
    case ShadowGateRefusal::kVsmShadowMap: return "vsm";
    case ShadowGateRefusal::kSkinnedCaster: return "skinned";
    case ShadowGateRefusal::kInstancedCaster: return "instanced";
    case ShadowGateRefusal::kMaterialArray: return "material-em-array";
    case ShadowGateRefusal::kAlphaClip: return "recorte-alfa";
    case ShadowGateRefusal::kPositionNode: return "position-node";
    case ShadowGateRefusal::kGeometryMissing: return "geometria-ausente";
    case ShadowGateRefusal::kUnsupportedSide: return "lado-nao-reproduzivel";
  }
  return "desconhecido";
}

ShadowGateResult evaluateShadowPassGate(const SceneMirror& mirror,
                                        const std::vector<NodeIndex>& casters,
                                        const ShadowGateFrame& frame, GeometryPresence presence,
                                        void* userData) {
  ShadowGateResult r;
  r.totalCasters = static_cast<int32_t>(casters.size());

  // --- Fatos do frame inteiro ---------------------------------------------
  // A divergência vale mesmo sem caster nenhum: o nó que falta no espelho pode
  // ser exatamente o que projetaria a sombra que sumiria.
  if (frame.sceneNodeCount >= 0) {
    // VIVOS, e não slots: um nó removido vira lápide no lugar (mudar o índice
    // dos outros custaria reapontar o `matrixWorld` de todo mundo), mas para o
    // `three` ele não existe mais.
    const auto mirrorCount = static_cast<int32_t>(mirror.liveCount());
    if (frame.sceneNodeCount != mirrorCount) {
      const int32_t diff = frame.sceneNodeCount - mirrorCount;
      r.counts[static_cast<size_t>(ShadowGateRefusal::kNodeCountDivergence)] =
          diff < 0 ? -diff : diff;
    }
  }
  if (frame.vsmShadowMap) r.counts[static_cast<size_t>(ShadowGateRefusal::kVsmShadowMap)] = 1;

  // --- Um caster de cada vez ----------------------------------------------
  for (const NodeIndex index : casters) {
    bool refused = false;
    if (mirror.hasFlag(index, kNodeSkinned)) {
      refused = marcar(r, ShadowGateRefusal::kSkinnedCaster);
    }
    if (mirror.hasFlag(index, kNodeInstanced)) {
      refused = marcar(r, ShadowGateRefusal::kInstancedCaster);
    }
    if (mirror.hasFlag(index, kNodeMaterialArray)) {
      refused = marcar(r, ShadowGateRefusal::kMaterialArray);
    }
    if (mirror.hasFlag(index, kNodeAlphaClip)) {
      refused = marcar(r, ShadowGateRefusal::kAlphaClip);
    }
    if (mirror.hasFlag(index, kNodePositionNode)) {
      refused = marcar(r, ShadowGateRefusal::kPositionNode);
    }
    // Sem registro para consultar, TODA geometria conta como ausente: é o lado
    // seguro, e é o estado real antes de o registro preguiçoso (E2) encher.
    const int32_t geometry = mirror.geometryId(index);
    const bool registered =
        presence != nullptr && geometry != kNoGeometry && presence(geometry, userData);
    if (!registered) refused = marcar(r, ShadowGateRefusal::kGeometryMissing);
    // O lado da face vem resolvido do JS (ver `ShadowSide`). O que o passe
    // nativo sabe desenhar são os três valores da tabela do `three`; qualquer
    // outro recusa, em vez de virar um `cullMode` aproximado.
    if (mirror.shadowSide(index) == kShadowSideUnsupported) {
      refused = marcar(r, ShadowGateRefusal::kUnsupportedSide);
    }

    if (refused) r.refusedCasters += 1;
  }

  // --- Veredito ------------------------------------------------------------
  if (r.counts[static_cast<size_t>(ShadowGateRefusal::kNodeCountDivergence)] > 0) {
    r.reason = ShadowGateRefusal::kNodeCountDivergence;
  } else if (r.counts[static_cast<size_t>(ShadowGateRefusal::kVsmShadowMap)] > 0) {
    r.reason = ShadowGateRefusal::kVsmShadowMap;
  } else {
    for (const ShadowGateRefusal reason : kPerCasterOrder) {
      if (r.counts[static_cast<size_t>(reason)] > 0) {
        r.reason = reason;
        break;
      }
    }
  }
  r.accepted = r.reason == ShadowGateRefusal::kNone;
  r.offenders = r.counts[static_cast<size_t>(r.reason)];
  return r;
}

}  // namespace scene
