// Decode de áudio em memória (miniaudio + stb_vorbis): WAV/MP3/FLAC/OGG Vorbis
// → PCM float32 intercalado (SPEC-0700). Sem SDL nem N-API: testável sozinho.
#pragma once

#include <cstddef>
#include <vector>

namespace shims {

struct AudioBufferData {
  std::vector<float> samples;  // float32 intercalado
  int channels = 2;
  int sampleRate = 44100;
  double duration = 0;
};

/** Decodifica `bytes` inteiro em `out`. false = formato não suportado/vazio. */
bool decodeAudio(const void* bytes, size_t size, AudioBufferData* out);

/**
 * Índice (em `samples`) do primeiro quadro em `seconds`. Fora do buffer:
 * em loop dá a volta (módulo a duração); sem loop, prende ao fim.
 */
size_t startSampleAt(const AudioBufferData& buffer, double seconds, bool loop);

}  // namespace shims
