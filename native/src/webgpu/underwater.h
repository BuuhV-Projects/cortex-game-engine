// Efeito de tela embaixo d'água do host (SPEC-0726, ADR-0727): a ponte com o JS
// e o estado lido pelo blit final (supersample.cpp).
#pragma once

#include <node_api.h>

#include "underwater_params.h"

namespace webgpu {

/**
 * Expõe `__cortexUnderwater(params | null)` ao JS. `params` são os campos planos
 * do estado resolvido:
 * ```js
 * __cortexUnderwater({ amount, tint, brightness, amplitude, frequency, speed, r, g, b })
 * ```
 * O JS só chama quando o estado muda. `null` (ou `amount` 0) desliga.
 */
void registerUnderwater(napi_env env);

/** Estado corrente (já limitado). */
const UnderwaterState& underwaterState();

/** Uniform deste quadro, com a fase pelo relógio do host. */
UnderwaterUniform underwaterUniformNow();

}  // namespace webgpu
