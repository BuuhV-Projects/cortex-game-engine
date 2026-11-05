// Estado do espelho de cena compartilhado pelos shims dele (SPEC-0234).
//
// Header INTERNO: só `scene_mirror_shim.cpp` e `scene_mirror_shadow_shim.cpp`
// o incluem. O passe de sombra saiu para o arquivo dele (SPEC-0690) e precisa
// do mesmo estado do processo — o espelho, o enumerador e as instâncias.
#pragma once

#include <node_api.h>

#include <vector>

#include "../render/instance_buffer_store.h"
#include "../render/shadow_pass.h"
#include "../scene/scene_mirror.h"
#include "../scene/shadow_caster_enumerator.h"

struct HostGpu;

namespace shims {

/** Floats do frustum: 6 planos de 4. */
constexpr int kFrustumFloats = scene::kFrustumPlanes * 4;

/**
 * Estado do espelho, um por processo.
 *
 * Vive em `static` e não em `napi_env` porque o host tem um runtime só e a cena
 * é única — e porque o `ArrayBuffer` externo que o JS segura aponta para a
 * memória daqui: ela precisa durar mais que qualquer escopo de callback.
 */
struct MirrorState {
  scene::SceneMirror mirror;
  /** Enumerador do passe de sombra (SPEC-0245); guarda os buffers entre frames. */
  scene::ShadowCasterEnumerator shadowCasters;
  /** Casters que o gate deixou seguir para o desenho (sem os skinados, SPEC-0690). */
  std::vector<scene::NodeIndex> shadowDrawList;
  /** Transforms que o JS escreve por frame (só os nós dinâmicos), em dupla. */
  std::vector<double> syncBuffer;
  /**
   * Lote do passe de sombra, reusado entre frames.
   *
   * Vive aqui, e não na pilha da chamada, pelo motivo de sempre nesta série:
   * alocar por frame devolveria em malloc parte do que o marco ganha em
   * submissão.
   */
  std::vector<render::ShadowDrawItem> shadowItems;
  /** Matrizes de instância dos `InstancedMesh` (SPEC-0289). */
  render::InstanceBufferStore instances;
  bool built = false;
};

/** O estado do processo. */
MirrorState& mirrorState();

/** GPU do host, para o passe de sombra nativo (SPEC-0245, E5). */
HostGpu* mirrorGpu();

/** `drawShadowPass(...)` — ver scene_mirror_shadow_shim.cpp. */
napi_value jsDrawShadowPass(napi_env env, napi_callback_info info);

}  // namespace shims
