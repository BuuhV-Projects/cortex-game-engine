// Ponte da projeção do passe principal (SPEC-0332, etapa (a) do ADR-0330).
//
// Expõe `__cortexMainPass`: `project` (uma travessia de ponte por render da
// cena espelhada) e `setBounds` (a geometria de um nó mudou). Lê o espelho
// que o `scene_mirror_shim` já mantém — não há estado de cena novo aqui.
#pragma once

#include <node_api.h>

namespace shims {

void registerMainPass(napi_env env);

}  // namespace shims
