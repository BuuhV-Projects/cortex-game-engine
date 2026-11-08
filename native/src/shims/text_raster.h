// Raster de texto nativo (stb_truetype) pro RendererUiBackend (ADR-0102) e o
// canvas 2D: __cortexRasterText(texto, alturaPx, origem?, família?) →
// { width, height, rgba } — glifos BRANCOS com alpha (o material tinge a cor).
// Fonte padrão: Roboto-Medium.ttf ao lado do exe (ou do jogo). Fontes do jogo:
// __cortexLoadFont(família, url) lê do assets.pak; __cortexFontMetrics(família)
// dá ascent/descent em EM (ADR-0715, registro em font_registry.h).
#pragma once

#include <node_api.h>

#include <string>

namespace shims {

// exeDir/baseDir: onde procurar a fonte (baseDir do jogo primeiro).
void registerTextRaster(napi_env env, const std::string& baseDir,
                        const std::string& exeDir);

// Telemetria (SPEC-0321): rasters de texto AINDA VIVOS (não coletados pelo GC)
// por origem — "ui=Nx/MB canvas=Nx/MB outro=Nx/MB". É o que separa vazamento
// (vivos crescem) de churn (o total alocado cresce, os vivos não). Devolve o nº
// de bytes escritos (sem terminador). `CORTEX_TEXT_LOG=1` imprime cada raster
// (origem, px, texto) no stdout.
int dumpTextRasterLive(char* buf, size_t bufSize);

}  // namespace shims
