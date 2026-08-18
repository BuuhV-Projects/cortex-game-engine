// Raster de texto nativo (stb_truetype) pro RendererUiBackend (ADR-0102):
// __cortexRasterText(texto, alturaPx) → { width, height, rgba } — glifos
// BRANCOS com alpha (o material tinge a cor). Fonte: Roboto-Regular.ttf ao
// lado do exe (ou do jogo).
#pragma once

#include <node_api.h>

#include <string>

namespace shims {

// exeDir/baseDir: onde procurar a fonte (baseDir do jogo primeiro).
void registerTextRaster(napi_env env, const std::string& baseDir,
                        const std::string& exeDir);

// Telemetria (diagnóstico do JSOutOfMemoryError, SPEC-0188+): total de
// rasterizações desde o boot e MB de ArrayBuffer RGBA gerado — cada chamada
// cria um ArrayBuffer novo no heap Hermes (napi_create_arraybuffer); texto que
// muda todo frame (timer de HUD) rasteriza continuamente durante o gameplay,
// fora do nudge de GC que só roda no reset de fase (ADR-0153).
uint64_t perfTextRasterCount();
double perfTextRasterBytesMB();

}  // namespace shims
