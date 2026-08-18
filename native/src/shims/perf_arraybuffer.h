// Telemetria de ArrayBuffers criados pro Hermes (diagnóstico do
// JSOutOfMemoryError, SPEC-0188+): cada `napi_create_arraybuffer` conta como
// pressão de heap EXTERNA (GCBase::HeapInfo.externalBytes) — se o total sobe
// mais rápido do que o esperado numa sessão longa, é aqui que se vê POR QUAL
// fonte (pak/imagem/ktx2/io_pool/texto), sem precisar instrumentar o Hermes
// em si. Uso: chamar `trackArrayBufferBytes(Source::X, bytes)` no ponto de
// criação; `dumpArrayBufferStats(buf, size)` formata uma linha pro
// perf-log.txt.
#pragma once

#include <cstddef>

namespace shims {

enum class ArrayBufferSource {
  kPak,          // pak.cpp: leitura de arquivo binário do assets.pak
  kImageDecode,  // image_decode.cpp: PNG/JPG -> RGBA
  kKtx2,         // ktx2.cpp: transcode KTX2 -> BC7/RGBA
  kIoPool,       // io_pool.cpp: leitura assíncrona (worker pool)
  kFiles,        // files.cpp: leitura síncrona de arquivo
  kTextRaster,   // text_raster.cpp: rasterização de texto (stb_truetype)
  kCount,        // sentinela — nº de fontes
};

void trackArrayBufferBytes(ArrayBufferSource source, size_t bytes);

// Formata todas as fontes em `buf` (uma linha, "pak=12x/3.4MB img=...").
// Devolve o nº de bytes escritos (sem terminador).
int dumpArrayBufferStats(char* buf, size_t bufSize);

}  // namespace shims
