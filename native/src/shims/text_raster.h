// Raster de texto nativo (stb_truetype) pro RendererUiBackend (ADR-0102):
// __cortexRasterText(texto, alturaPx) → { width, height, rgba } — glifos
// BRANCOS com alpha (o material tinge a cor). Fonte: Roboto-Regular.ttf ao
// lado do exe (ou do jogo).
#pragma once

#include <hermes/hermes_api.h>

#include <string>

namespace shims {

// exeDir/baseDir: onde procurar a fonte (baseDir do jogo primeiro).
void registerTextRaster(napi_env env, const std::string& baseDir,
                        const std::string& exeDir);

}  // namespace shims
