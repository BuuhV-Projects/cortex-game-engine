// Captura da textura composta (`swap`) para paridade visual verificável
// (SPEC-0240, passo 1). Modo ligado por env `CORTEX_RENDER_PARITY_CAPTURE`
// (diretório de saída) — sem a env, tudo aqui é no-op.
#pragma once

#include <webgpu/webgpu.h>

struct HostGpu;

namespace webgpu {

/**
 * Lê `CORTEX_RENDER_PARITY_CAPTURE` uma única vez e guarda o estado (diretório
 * + limite de quadros). Chame antes de configurar a surface — o resultado
 * decide se `configureSurface` precisa pedir `CopySrc` no `usage`.
 */
void initRenderParityCapture();

/** O modo de captura está ligado (env presente)? */
bool renderParityCaptureEnabled();

/**
 * Copia `texture` (a `swap` já composta, ANTES do present) para um arquivo
 * RGBA cru no diretório configurado, se ainda não atingiu o limite de
 * quadros. Só faz sentido chamar quando `renderParityCaptureEnabled()`.
 *
 * Requer que `texture` tenha `TextureUsage_CopySrc` — quem chama garante isso
 * via `initRenderParityCapture` + `configureSurface`.
 */
void maybeCaptureFrame(HostGpu* gpu, WGPUTexture texture);

}  // namespace webgpu
