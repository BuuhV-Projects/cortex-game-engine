// Shaders WGSL do blit final do host (ver blit_shaders.cpp).
#pragma once

namespace webgpu {

/** Trecho comum do efeito embaixo d'água (SPEC-0726): uniform no binding 5 + funções. */
extern const char* const kUnderwaterWgsl;
/** Blit LDR: offscreen já tonemapeado + UI em gama (ADR-0105). */
extern const char* const kBlitShader;
/** Composite HDR: cena + bloom → vinheta → ACES → OETF → UI (ADR-0147/0149). */
extern const char* const kHdrBlitShader;

}  // namespace webgpu
