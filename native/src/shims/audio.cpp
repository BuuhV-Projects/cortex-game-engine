#include "audio.h"

#define MA_NO_DEVICE_IO
#define MA_NO_THREADING
#define MINIAUDIO_IMPLEMENTATION
#include <miniaudio.h>

#include <SDL3/SDL.h>

#include <cstdint>
#include <map>
#include <vector>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Buffer decodificado: float32 intercalado.
struct AudioBufferData {
  std::vector<float> samples;
  int channels = 2;
  int sampleRate = 44100;
  double duration = 0;
};

struct Voice {
  SDL_AudioStream* stream = nullptr;
  int bufferId = 0;
  bool loop = false;
};

std::map<int, AudioBufferData> g_buffers;
std::map<int, Voice> g_voices;
int g_nextBufferId = 1;
int g_nextVoiceId = 1;

bool decodeToBuffer(const void* bytes, size_t size, AudioBufferData* out) {
  ma_decoder_config config =
      ma_decoder_config_init(ma_format_f32, 0, 0);  // canais/taxa nativos
  ma_decoder decoder;
  if (ma_decoder_init_memory(bytes, size, &config, &decoder) != MA_SUCCESS)
    return false;

  out->channels = static_cast<int>(decoder.outputChannels);
  out->sampleRate = static_cast<int>(decoder.outputSampleRate);
  ma_uint64 totalFrames = 0;
  ma_decoder_get_length_in_pcm_frames(&decoder, &totalFrames);
  if (totalFrames > 0) out->samples.reserve(totalFrames * out->channels);

  float chunk[4096];
  const ma_uint64 chunkFrames = 4096 / out->channels;
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

void feedVoice(Voice& voice) {
  const AudioBufferData& buffer = g_buffers[voice.bufferId];
  SDL_PutAudioStreamData(
      voice.stream, buffer.samples.data(),
      static_cast<int>(buffer.samples.size() * sizeof(float)));
}

// __cortexAudio.decode(ArrayBuffer|TypedArray) → {id,duration,sampleRate,channels}|null
napi_value jsDecode(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  if (argc < 1) return nullValue;

  void* bytes = nullptr;
  size_t size = 0;
  bool isArrayBuffer = false;
  napi_is_arraybuffer(env, args[0], &isArrayBuffer);
  if (isArrayBuffer) {
    napi_get_arraybuffer_info(env, args[0], &bytes, &size);
  } else {
    napi_typedarray_type type;
    napi_value ab = nullptr;
    size_t offset = 0;
    if (napi_get_typedarray_info(env, args[0], &type, &size, &bytes, &ab,
                                 &offset) != napi_ok)
      return nullValue;
  }
  if (!bytes || size == 0) return nullValue;

  AudioBufferData buffer;
  if (!decodeToBuffer(bytes, size, &buffer)) return nullValue;
  int id = g_nextBufferId++;
  double duration = buffer.duration;
  int sampleRate = buffer.sampleRate;
  int channels = buffer.channels;
  g_buffers[id] = std::move(buffer);

  napi_value out = njs::makeObject(env);
  napi_value v = nullptr;
  napi_create_int32(env, id, &v);
  napi_set_named_property(env, out, "id", v);
  napi_create_double(env, duration, &v);
  napi_set_named_property(env, out, "duration", v);
  napi_create_int32(env, sampleRate, &v);
  napi_set_named_property(env, out, "sampleRate", v);
  napi_create_int32(env, channels, &v);
  napi_set_named_property(env, out, "channels", v);
  return out;
}

// __cortexAudio.play(bufferId, loop, gain, rate) → voiceId (0 = falhou)
napi_value jsPlay(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double values[4] = {0, 0, 1, 1};
  for (size_t i = 0; i < argc && i < 4; ++i)
    napi_get_value_double(env, args[i], &values[i]);

  napi_value out = nullptr;
  auto it = g_buffers.find(static_cast<int>(values[0]));
  if (it == g_buffers.end()) {
    napi_create_int32(env, 0, &out);
    return out;
  }
  const AudioBufferData& buffer = it->second;

  SDL_AudioSpec spec = {SDL_AUDIO_F32, buffer.channels, buffer.sampleRate};
  SDL_AudioStream* stream = SDL_OpenAudioDeviceStream(
      SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &spec, nullptr, nullptr);
  if (!stream) {
    napi_create_int32(env, 0, &out);
    return out;
  }
  SDL_SetAudioStreamGain(stream, static_cast<float>(values[2]));
  if (values[3] > 0 && values[3] != 1.0)
    SDL_SetAudioStreamFrequencyRatio(stream, static_cast<float>(values[3]));

  int voiceId = g_nextVoiceId++;
  Voice voice{stream, static_cast<int>(values[0]), values[1] != 0};
  g_voices[voiceId] = voice;
  feedVoice(g_voices[voiceId]);
  SDL_ResumeAudioStreamDevice(stream);

  napi_create_int32(env, voiceId, &out);
  return out;
}

napi_value jsSetGain(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double voiceId = 0, gain = 1;
  if (argc >= 2) {
    napi_get_value_double(env, args[0], &voiceId);
    napi_get_value_double(env, args[1], &gain);
    auto it = g_voices.find(static_cast<int>(voiceId));
    if (it != g_voices.end())
      SDL_SetAudioStreamGain(it->second.stream, static_cast<float>(gain));
  }
  return njs::undefined(env);
}

napi_value jsStop(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double voiceId = 0;
  if (argc >= 1 && napi_get_value_double(env, args[0], &voiceId) == napi_ok) {
    auto it = g_voices.find(static_cast<int>(voiceId));
    if (it != g_voices.end()) {
      SDL_DestroyAudioStream(it->second.stream);
      g_voices.erase(it);
    }
  }
  return njs::undefined(env);
}

}  // namespace

void registerAudio(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value audio = njs::makeObject(env);
  njs::setMethod(env, audio, "decode", jsDecode);
  njs::setMethod(env, audio, "play", jsPlay);
  njs::setMethod(env, audio, "setGain", jsSetGain);
  njs::setMethod(env, audio, "stop", jsStop);
  napi_set_named_property(env, global, "__cortexAudio", audio);
}

void updateAudio() {
  for (auto it = g_voices.begin(); it != g_voices.end();) {
    Voice& voice = it->second;
    int queued = SDL_GetAudioStreamQueued(voice.stream);
    if (voice.loop) {
      // Realimenta antes de secar (meio buffer de folga).
      const AudioBufferData& buffer = g_buffers[voice.bufferId];
      int total = static_cast<int>(buffer.samples.size() * sizeof(float));
      if (queued < total / 2) feedVoice(voice);
      ++it;
    } else if (queued == 0) {
      SDL_DestroyAudioStream(voice.stream);
      it = g_voices.erase(it);
    } else {
      ++it;
    }
  }
}

void shutdownAudio() {
  for (auto& [id, voice] : g_voices) SDL_DestroyAudioStream(voice.stream);
  g_voices.clear();
  g_buffers.clear();
}

}  // namespace shims
