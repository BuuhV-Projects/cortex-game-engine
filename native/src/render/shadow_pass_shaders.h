// WGSL do passe de sombra nativo (SPEC-0245, SPEC-0289, SPEC-0642).
//
// Quatro variantes: (malha comum | `InstancedMesh`) × (depth-only | recorte alfa).
// Todas leem o MESMO uniforme por caster (os 256 bytes do slot, ver
// `ShadowCasterUniforms` em `shadow_pass.cpp`); as depth-only só usam as matrizes.
#pragma once

namespace render {

/** Uniforme por caster, comum às quatro variantes. */
#define CORTEX_SHADOW_UNIFORMS_WGSL \
  "struct Uniformes {\n"            \
  "  model : mat4x4f,\n"            \
  "  view : mat4x4f,\n"             \
  "  projection : mat4x4f,\n"       \
  "  uvTransform : mat3x3f,\n"      \
  "  alphaTest : f32,\n"            \
  "};\n"                            \
  "@group(0) @binding(0) var<uniform> u : Uniformes;\n"

/**
 * Posição e nada mais. Sem estágio de fragmento: o passe só escreve
 * profundidade, e um fragmento que não escreve nada custaria uma invocação por
 * pixel coberto. Ordem do `three` (SPEC-0545): `clip = P · ((V · M) · p)`.
 */
inline const char* kShaderSombra = CORTEX_SHADOW_UNIFORMS_WGSL R"WGSL(
@vertex
fn vs(@location(0) position : vec3f) -> @builtin(position) vec4f {
  let positionView = ((u.view * u.model) * vec4f(position, 1.0)).xyz;
  return u.projection * vec4f(positionView, 1.0);
}
)WGSL";

/**
 * `InstancedMesh` (SPEC-0289): a matriz da instância chega como atributo POR
 * INSTÂNCIA (4 colunas, coluna-maior como o `instanceMatrix`) e entra entre a
 * `model` e a posição — a ordem do `three`.
 */
inline const char* kShaderSombraInstanciada = CORTEX_SHADOW_UNIFORMS_WGSL R"WGSL(
@vertex
fn vs(@location(0) position : vec3f,
      @location(1) c0 : vec4f, @location(2) c1 : vec4f,
      @location(3) c2 : vec4f, @location(4) c3 : vec4f) -> @builtin(position) vec4f {
  let positionLocal = (mat4x4f(c0, c1, c2, c3) * vec4f(position, 1.0)).xyz;
  let positionView = ((u.view * u.model) * vec4f(positionLocal, 1.0)).xyz;
  return u.projection * vec4f(positionView, 1.0);
}
)WGSL";

/**
 * Fragmento do recorte alfa (SPEC-0642), igual ao do `three`: `map.a` no UV
 * transformado por `map.matrix`, descarte quando `a <= alphaTest`. Sem alvo de
 * cor — só decide se a profundidade do fragmento entra.
 */
#define CORTEX_SHADOW_ALPHA_CLIP_FS_WGSL                                        \
  "struct Saida {\n"                                                           \
  "  @builtin(position) position : vec4f,\n"                                   \
  "  @location(0) uv : vec2f,\n"                                               \
  "};\n"                                                                       \
  "@group(1) @binding(0) var mapa : texture_2d<f32>;\n"                        \
  "@group(1) @binding(1) var amostrador : sampler;\n"                          \
  "@fragment\n"                                                                \
  "fn fs(entrada : Saida) {\n"                                                 \
  "  let alfa = textureSample(mapa, amostrador, entrada.uv).a;\n"              \
  "  if (alfa <= u.alphaTest) { discard; }\n"                                  \
  "}\n"

inline const char* kShaderSombraRecorte = CORTEX_SHADOW_UNIFORMS_WGSL
    CORTEX_SHADOW_ALPHA_CLIP_FS_WGSL R"WGSL(
@vertex
fn vs(@location(0) position : vec3f, @location(5) uv : vec2f) -> Saida {
  var saida : Saida;
  let positionView = ((u.view * u.model) * vec4f(position, 1.0)).xyz;
  saida.position = u.projection * vec4f(positionView, 1.0);
  saida.uv = (u.uvTransform * vec3f(uv, 1.0)).xy;
  return saida;
}
)WGSL";

inline const char* kShaderSombraInstanciadaRecorte = CORTEX_SHADOW_UNIFORMS_WGSL
    CORTEX_SHADOW_ALPHA_CLIP_FS_WGSL R"WGSL(
@vertex
fn vs(@location(0) position : vec3f,
      @location(1) c0 : vec4f, @location(2) c1 : vec4f,
      @location(3) c2 : vec4f, @location(4) c3 : vec4f,
      @location(5) uv : vec2f) -> Saida {
  var saida : Saida;
  let positionLocal = (mat4x4f(c0, c1, c2, c3) * vec4f(position, 1.0)).xyz;
  let positionView = ((u.view * u.model) * vec4f(positionLocal, 1.0)).xyz;
  saida.position = u.projection * vec4f(positionView, 1.0);
  saida.uv = (u.uvTransform * vec3f(uv, 1.0)).xy;
  return saida;
}
)WGSL";

#undef CORTEX_SHADOW_ALPHA_CLIP_FS_WGSL
#undef CORTEX_SHADOW_UNIFORMS_WGSL

}  // namespace render
