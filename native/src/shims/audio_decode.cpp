#include "audio_decode.h"

#include <cmath>

// stb_vorbis do jeito que o miniaudio pede (SPEC-0700): o header antes da
// implementação do miniaudio liga o MA_HAS_VORBIS; a implementação vem depois.
#define STB_VORBIS_HEADER_ONLY
#include <stb_vorbis.c>

#define MA_NO_DEVICE_IO
#define MA_NO_THREADING
#define MINIAUDIO_IMPLEMENTATION
#include <miniaudio.h>

#undef STB_VORBIS_HEADER_ONLY
#include <stb_vorbis.c>

namespace shims {

namespace {
constexpr ma_uint64 kChunkSamples = 4096;
}  // namespace

bool decodeAudio(const void* bytes, size_t size, AudioBufferData* out) {
  ma_decoder_config config =
      ma_decoder_config_init(ma_format_f32, 0, 0);  // canais/taxa nativos
  ma_decoder decoder;
  if (ma_decoder_init_memory(bytes, size, &config, &decoder) != MA_SUCCESS)
    return false;

  out->channels = static_cast<int>(decoder.outputChannels);
  out->sampleRate = static_cast<int>(decoder.outputSampleRate);
  // Vorbis devolve 0 aqui (stb_vorbis em modo push): o reserve é só dica.
  ma_uint64 totalFrames = 0;
  ma_decoder_get_length_in_pcm_frames(&decoder, &totalFrames);
  if (totalFrames > 0) out->samples.reserve(totalFrames * out->channels);

  float chunk[kChunkSamples];
  const ma_uint64 chunkFrames = kChunkSamples / out->channels;
  for (;;) {
    ma_uint64 read = 0;
    ma_decoder_read_pcm_frames(&decoder, chunk, chunkFrames, &read);
    if (read == 0) break;
    out->samples.insert(out->samples.end(), chunk,
                        chunk + read * out->channels);
  }
  ma_decoder_uninit(&decoder);
  out->duration =
      static_cast<double>(out->samples.size()) / out->channels /
      out->sampleRate;
  return !out->samples.empty();
}

size_t startSampleAt(const AudioBufferData& buffer, double seconds, bool loop) {
  const size_t frames = buffer.samples.size() / buffer.channels;
  if (frames == 0 || !(seconds > 0)) return 0;
  double frame = std::floor(seconds * buffer.sampleRate);
  if (loop) frame = std::fmod(frame, static_cast<double>(frames));
  else if (frame > static_cast<double>(frames)) frame = static_cast<double>(frames);
  return static_cast<size_t>(frame) * buffer.channels;
}

}  // namespace shims
