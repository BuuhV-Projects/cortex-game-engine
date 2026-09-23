// Ver geometry_registry_shim.cpp (SPEC-0241, passo 2).
#pragma once

#include <node_api.h>

namespace render {
class GeometryRegistry;
}

namespace shims {

/** Registra `__cortexGeometryRegistry` no global. */
void registerGeometryRegistry(napi_env env);

/** O registro do processo — quem desenha consulta por aqui. */
render::GeometryRegistry& geometryRegistry();

}  // namespace shims
