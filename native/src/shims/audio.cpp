#include "audio.h"

#include "audio_decode.h"
#include "audio_voices.h"

#include <utility>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Valores padrão dos argumentos do play: buffer, laço, ganho, tom e início (s).
constexpr size_t kPlayArgs = 5;
constexpr double kDefaultGain = 1;
constexpr double kDefaultRate = 1;

double argOr(napi_env env, napi_value value, double fallback) {
  double out = fallback;
  napi_get_value_double(env, value, &out);
  return out;
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
    if (napi_get_typedarray_info(env, args[0], &type, &size, &bytes, &ab, &offset) != napi_ok) return nullValue;
  }
  if (!bytes || size == 0) return nullValue;

  AudioBufferData buffer;
  if (!decodeAudio(bytes, size, &buffer)) return nullValue;
  const double duration = buffer.duration;
  const int sampleRate = buffer.sampleRate;
  const int channels = buffer.channels;
  const int id = audioVoices().addBuffer(std::move(buffer));

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

// __cortexAudio.play(bufferId, loop, gain, rate, offsetSeconds) → voiceId
// (0 = falhou). offsetSeconds (padrão 0) é o ponto de início (SPEC-0700).
napi_value jsPlay(napi_env env, napi_callback_info info) {
  size_t argc = kPlayArgs;
  napi_value args[kPlayArgs];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double values[kPlayArgs] = {0, 0, kDefaultGain, kDefaultRate, 0};
  for (size_t i = 0; i < argc && i < kPlayArgs; ++i) values[i] = argOr(env, args[i], values[i]);

  const int voiceId = audioVoices().play(static_cast<int>(values[0]), values[1] != 0, static_cast<float>(values[2]),
                                         static_cast<float>(values[3]), values[4]);
  napi_value out = nullptr;
  napi_create_int32(env, voiceId, &out);
  return out;
}

// __cortexAudio.setGain(voiceId, gain) e .setRate(voiceId, rate) — ao vivo (SPEC-0700).
napi_value jsSetGain(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 2) {
    audioVoices().setGain(static_cast<int>(argOr(env, args[0], 0)), static_cast<float>(argOr(env, args[1], kDefaultGain)));
  }
  return njs::undefined(env);
}

napi_value jsSetRate(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 2) {
    audioVoices().setRate(static_cast<int>(argOr(env, args[0], 0)), static_cast<float>(argOr(env, args[1], kDefaultRate)));
  }
  return njs::undefined(env);
}

napi_value jsStop(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1) audioVoices().stop(static_cast<int>(argOr(env, args[0], 0)));
  return njs::undefined(env);
}

// __cortexAudio.free(bufferId) — libera o PCM decodificado (ADR-0153), derrubando
// antes as vozes que ainda tocam o buffer.
napi_value jsFree(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1) audioVoices().freeBuffer(static_cast<int>(argOr(env, args[0], 0)));
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
  njs::setMethod(env, audio, "setRate", jsSetRate);
  njs::setMethod(env, audio, "stop", jsStop);
  njs::setMethod(env, audio, "free", jsFree);
  napi_set_named_property(env, global, "__cortexAudio", audio);
}

void updateAudio() { audioVoices().update(); }

void shutdownAudio() { audioVoices().shutdown(); }

}  // namespace shims
