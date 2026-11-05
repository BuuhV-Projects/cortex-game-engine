// `drawShadowPass` do espelho de cena (SPEC-0245, E5; resultado da SPEC-0690).
//
// Saiu do `scene_mirror_shim.cpp` quando o resultado por cascata ganhou
// `skipped`, `excluded` e `status` (SPEC-0690): é a única operação do espelho
// que fala com o gate e com o passe de sombra, e o que só ela usa mora aqui.
#include <cstdint>
#include <cstring>
#include <vector>

#include "../napi/napi_util.h"
#include "../render/alpha_clip_store.h"
#include "../render/geometry_registry.h"
#include "../render/shadow_pass_status.h"
#include "../scene/shadow_pass_gate.h"
#include "geometry_registry_shim.h"
#include "scene_mirror_state.h"

namespace shims {
namespace {

/**
 * Layout do vetor de saída do gate (ver {@link jsDrawShadowPass}).
 *
 * O gate roda por frame, então ele ESCREVE num buffer que o JS já tem em vez
 * de devolver um objeto novo: criar um `napi_value` por frame para relatar um
 * veredito seria gastar em alocação o que o marco quer ganhar em submissão.
 */
/**
 * Motivos com slot de contagem no INÍCIO do vetor: os de antes do ADR-0692. O
 * layout fica congelado (`GATE_OUT_REASON_SLOTS` no JS); motivo novo ganha slot
 * depois do status, e host e JS antigos continuam se entendendo.
 */
constexpr int kGateOutReasonSlots = static_cast<int>(scene::ShadowGateRefusal::kPositionNotFloat32x3);
constexpr int kGateOutRefusedCasters = kGateOutReasonSlots;
constexpr int kGateOutTotalCasters = kGateOutReasonSlots + 1;
/** Índice do primeiro nó ofensor, ou -1 (SPEC-0289). */
constexpr int kGateOutFirstOffender = kGateOutReasonSlots + 2;
/** Tamanho do formato antigo, que o host ainda aceita (sem as posições da SPEC-0690). */
constexpr int kGateOutLegacyFloats = kGateOutReasonSlots + 3;
/** Casters que o shim descartou depois do gate (SPEC-0690). */
constexpr int kGateOutSkipped = kGateOutReasonSlots + 3;
/** Casters skinados tirados da lista (SPEC-0690). */
constexpr int kGateOutExcluded = kGateOutReasonSlots + 4;
/** {@link render::ShadowPassStatus} da cascata (SPEC-0690). */
constexpr int kGateOutStatus = kGateOutReasonSlots + 5;
/** Tamanho do formato da SPEC-0690 (sem o slot do ADR-0692). */
constexpr int kGateOutSpec0690Floats = kGateOutReasonSlots + 6;
/** Contagem de `posicao-nao-float32x3` (ADR-0692). */
constexpr int kGateOutPositionFormat = kGateOutReasonSlots + 6;
constexpr int kGateOutFloats = kGateOutReasonSlots + 7;
static_assert(kGateOutReasonSlots + 1 == scene::kShadowGateRefusalCount,
              "motivo novo do gate precisa de slot proprio depois de kGateOutPositionFormat");
/** Argumentos de `drawShadowPass` (ver {@link jsDrawShadowPass}). */
constexpr size_t kArgsDrawShadowPass = 10;
/** Elementos de uma matriz 4x4. */
constexpr size_t kMatrixElements = 16;
/** `drawShadowPass` matrices with projection and view apart: viewProj + projection + view. */
constexpr size_t kSplitMatrixElements = 3 * kMatrixElements;

/**
 * Consulta ao registro de geometria, na forma que o gate PURO aceita.
 *
 * O `GeometryRegistry` arrasta `webgpu.h`; o gate não pode vê-lo sem sair do
 * harness. Este adaptador mora aqui, que é onde os dois mundos já se encontram.
 */
bool geometriaRegistrada(int32_t geometryId, void*) {
  if (geometryId < 0) return false;
  return geometryRegistry().find(static_cast<uint32_t>(geometryId)) != nullptr;
}

/** O registro recusou a geometria pelo formato da `position` (ADR-0692)? */
bool posicaoRecusada(int32_t geometryId, void*) {
  if (geometryId < 0) return false;
  return geometryRegistry().positionRefused(static_cast<uint32_t>(geometryId));
}

/** O host tem as matrizes deste `InstancedMesh`? (a forma que o gate puro aceita) */
bool instanciasPresentes(int32_t node, void*) {
  return mirrorState().instances.find(node) != nullptr;
}

/** O host tem o recorte alfa deste nó (SPEC-0642)? */
bool recortePresente(int32_t node, void*) {
  return render::alphaClipStore().find(node) != nullptr;
}

/**
 * Monta a lista do desenho a partir dos casters que o gate deixou seguir.
 *
 * Devolve quantos foram DESCARTADOS (SPEC-0690): sem geometria, sem lote
 * instanciado ou sem recorte na store — o que o gate deveria ter garantido.
 * Antes eles sumiam do mapa em silêncio; agora a cascata é recusada. Lote com
 * `count == 0` é vazio legítimo: não entra e não conta.
 */
uint32_t montarItens(MirrorState& s) {
  uint32_t descartados = 0;
  s.shadowItems.clear();
  s.shadowItems.reserve(s.shadowDrawList.size());
  for (const scene::NodeIndex index : s.shadowDrawList) {
    const int32_t geometria = s.mirror.geometryId(index);
    render::ShadowItemFacts fatos;
    fatos.hasGeometry = geometria != scene::kNoGeometry;
    fatos.instanced = s.mirror.hasFlag(index, scene::kNodeInstanced);
    const render::InstanceSet* lote =
        fatos.instanced ? s.instances.find(static_cast<int32_t>(index)) : nullptr;
    fatos.batchFound = lote != nullptr;
    fatos.batchCount = lote ? lote->count : 0;
    fatos.alphaClip = s.mirror.hasFlag(index, scene::kNodeAlphaClip);
    const render::AlphaClipEntry* recorte =
        fatos.alphaClip ? render::alphaClipStore().find(static_cast<int32_t>(index)) : nullptr;
    fatos.alphaClipFound = recorte != nullptr;

    const render::ShadowItemFate destino = render::shadowItemFate(fatos);
    if (destino == render::ShadowItemFate::kSkipped) {
      ++descartados;
      continue;
    }
    if (destino == render::ShadowItemFate::kEmpty) continue;

    render::ShadowDrawItem item;
    item.geometryId = static_cast<uint32_t>(geometria);
    std::memcpy(item.model, s.mirror.worldMatrix(index), sizeof(item.model));
    // O lado da face é do MATERIAL e chega por frame; o sentido depende ainda
    // da matriz de mundo (escala espelhada inverte a face, como no `three`).
    item.cullMode =
        render::shadowCullMode(static_cast<uint8_t>(s.mirror.shadowSide(index)), item.model);
    if (lote) {
      item.instanceBuffer = lote->buffer;
      item.instanceCount = lote->count;
    }
    item.alphaClip = recorte;
    s.shadowItems.push_back(item);
  }
  return descartados;
}

/** Escreve as posições da SPEC-0690, só quando o JS deu um vetor do formato novo. */
void escreverResultado(double* out, size_t outLength, uint32_t descartados, int32_t excluidos,
                       render::ShadowPassStatus status) {
  if (outLength < static_cast<size_t>(kGateOutSpec0690Floats)) return;
  out[kGateOutSkipped] = descartados;
  out[kGateOutExcluded] = excluidos;
  out[kGateOutStatus] = render::shadowStatusSlot(status);
}

}  // namespace

/**
 * `drawShadowPass(minRatio, camX, camY, camZ, planos, viewProj, alvo,
 * nosDaCena, vsm, saida)` — o passe de sombra NATIVO (SPEC-0245, E5).
 *
 * Faz numa travessia de ponte só o que o `three` faz em JS por objeto:
 * enumera os casters, passa pelo gate e, se ele aceitar, desenha direto na
 * `ShadowDepthTexture` da cascata.
 *
 * `alvo` é o `GPUTexture` do `shadow.map.depthTexture`, identificado do lado
 * do JS por IDENTIDADE do objeto (nunca por dimensão — foi o que custou dois
 * dias no M5) e reaquirido por frame, porque o `three` recria a textura quando
 * o `mapSize` muda.
 *
 * `viewProj` é `Float64Array`, não `Float32Array`: a multiplicação por `model`
 * acontece em `double` no C++ e só o resultado vira `float`. Degradar antes é
 * o caminho conhecido para as bandas da SPEC-0234.
 *
 * `saida` aceita o formato antigo (`kGateOutLegacyFloats`) e o da SPEC-0690
 * (`kGateOutSpec0690Floats`), que acrescenta `skipped`, `excluded` e `status`, e o do
 * ADR-0692 (`kGateOutFloats`), com a contagem de `posicao-nao-float32x3`; o JS
 * pré-preenche o status com -1 para reconhecer um host antigo.
 *
 * @return `>= 0` — casters desenhados (0 com status `cleared-empty`,
 *   `not-ready`, `skipped` ou `refused` sem alvo); `< 0` — recusado pelo
 *   gate, com o código do motivo negado. `saida` traz a contagem por motivo em todos os casos.
 */
napi_value jsDrawShadowPass(napi_env env, napi_callback_info info) {
  size_t argc = kArgsDrawShadowPass;
  napi_value args[kArgsDrawShadowPass];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  MirrorState& s = mirrorState();
  if (!s.built || argc < kArgsDrawShadowPass) return njs::undefined(env);

  scene::ShadowCasterParams params;
  napi_get_value_double(env, args[0], &params.minRatio);
  napi_get_value_double(env, args[1], &params.cameraX);
  napi_get_value_double(env, args[2], &params.cameraY);
  napi_get_value_double(env, args[3], &params.cameraZ);

  napi_typedarray_type type;
  void* planeData = nullptr;
  size_t planeLength = 0;
  napi_value planeBuffer;
  size_t planeOffset = 0;
  if (napi_get_typedarray_info(env, args[4], &type, &planeLength, &planeData, &planeBuffer,
                               &planeOffset) != napi_ok ||
      planeData == nullptr || planeLength < kFrustumFloats) {
    return njs::undefined(env);
  }

  void* vpData = nullptr;
  size_t vpLength = 0;
  napi_value vpBuffer;
  size_t vpOffset = 0;
  if (napi_get_typedarray_info(env, args[5], &type, &vpLength, &vpData, &vpBuffer, &vpOffset) !=
          napi_ok ||
      vpData == nullptr || type != napi_float64_array || vpLength < kMatrixElements) {
    return njs::undefined(env);
  }
  const auto* viewProjection = static_cast<const double*>(vpData);
  // Optional extension (SPEC-0545): `[viewProj, projection, view]`, 48 doubles — the sun's
  // single map is drawn in the three's float order; 16 doubles keeps the CSM path.
  const bool splitMatrices = vpLength >= kSplitMatrixElements;
  const double* projection = splitMatrices ? viewProjection + kMatrixElements : nullptr;
  const double* view = splitMatrices ? viewProjection + 2 * kMatrixElements : nullptr;

  napi_valuetype tipoAlvo = napi_undefined;
  napi_typeof(env, args[6], &tipoAlvo);
  WGPUTexture alvo = (tipoAlvo == napi_null || tipoAlvo == napi_undefined)
                         ? nullptr
                         : static_cast<WGPUTexture>(njs::unwrapValue(env, args[6]));

  scene::ShadowGateFrame frame;
  double sceneNodes = -1.0;
  napi_get_value_double(env, args[7], &sceneNodes);
  frame.sceneNodeCount = static_cast<int32_t>(sceneNodes);
  bool vsm = false;
  napi_get_value_bool(env, args[8], &vsm);
  frame.vsmShadowMap = vsm;

  void* outData = nullptr;
  size_t outLength = 0;
  napi_value outBuffer;
  size_t outOffset = 0;
  if (napi_get_typedarray_info(env, args[9], &type, &outLength, &outData, &outBuffer,
                               &outOffset) != napi_ok ||
      outData == nullptr || outLength < static_cast<size_t>(kGateOutLegacyFloats)) {
    return njs::undefined(env);
  }

  s.shadowCasters.enumerate(s.mirror, params, static_cast<const float*>(planeData));
  const scene::ShadowGateResult veredito = scene::evaluateShadowPassGate(
      s.mirror, s.shadowCasters.casters(), frame, geometriaRegistrada, nullptr,
      instanciasPresentes, recortePresente, &s.shadowDrawList, posicaoRecusada);

  auto* out = static_cast<double*>(outData);
  for (int i = 0; i < kGateOutReasonSlots; i++) out[i] = veredito.counts[i];
  if (outLength >= static_cast<size_t>(kGateOutFloats)) {
    out[kGateOutPositionFormat] = veredito.counts[kGateOutReasonSlots];
  }
  out[kGateOutRefusedCasters] = veredito.refusedCasters;
  out[kGateOutTotalCasters] = veredito.totalCasters;
  out[kGateOutFirstOffender] = veredito.firstOffender;

  const bool pelaPorta = veredito.accepted;
  napi_value saida;
  if (!pelaPorta) {
    escreverResultado(out, outLength, 0, veredito.excludedCasters,
                      render::ShadowPassStatus::kRefused);
    napi_create_double(env, static_cast<double>(-static_cast<int>(veredito.reason)), &saida);
    return saida;
  }
  if (alvo == nullptr) {
    // Sem alvo o passe não pode assumir: recusa SEM código de gate (status
    // `kRefused`, retorno 0). O JS relata `sem-alvo` e devolve a cascata ao
    // `three`, e nada some da imagem. Host antigo/JS antigo: drawn 0 é recusa.
    escreverResultado(out, outLength, 0, veredito.excludedCasters,
                      render::ShadowPassStatus::kRefused);
    napi_create_double(env, 0.0, &saida);
    return saida;
  }

  const uint32_t descartados = montarItens(s);
  if (descartados > 0) {
    // Desenhar o resto daria um mapa sem parte dos casters: nada é desenhado
    // nem limpo, e o JS recusa a cascata (`descartado`).
    escreverResultado(out, outLength, descartados, veredito.excludedCasters,
                      render::ShadowPassStatus::kSkipped);
    napi_create_double(env, 0.0, &saida);
    return saida;
  }

  const render::ShadowPassResult resultado = render::drawShadowCasters(
      mirrorGpu(), alvo, viewProjection, s.shadowItems.data(),
      static_cast<uint32_t>(s.shadowItems.size()), projection, view);
  escreverResultado(out, outLength, 0, veredito.excludedCasters, resultado.status);
  napi_create_double(env, static_cast<double>(resultado.drawn), &saida);
  return saida;
}

}  // namespace shims
