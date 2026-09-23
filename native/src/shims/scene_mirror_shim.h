// Ponte do espelho de cena para o JS (SPEC-0234, fase 3 do ADR-0232).
//
// Expõe `__cortexSceneMirror` com quatro operações. O desenho inteiro existe
// para evitar três armadilhas já pagas em medição: ponte por objeto (15 us
// cada), laço de aplicação em JS (≥1,4 ms para 1.300 nós) e instancing
// (descartado na SPEC-0012 do jogo).
//
// A saída não é copiada: as matrizes de mundo vivem na memória do C++ e o JS
// as enxerga por `napi_create_external_arraybuffer`.
#pragma once

#include <node_api.h>

struct HostGpu;

namespace shims {

// Registra __cortexSceneMirror no global.
//
// `gpu` entra porque o M6 (SPEC-0245) acrescentou `drawShadowPass`: o passe de
// sombra nativo desenha a partir DAQUI, onde o espelho e o enumerador de
// casters já estão, em vez de atravessar a ponte de novo com a lista pronta.
void registerSceneMirror(napi_env env, HostGpu* gpu);

}  // namespace shims
