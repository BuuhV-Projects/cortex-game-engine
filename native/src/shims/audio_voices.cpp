#include "audio_voices.h"

#include <cstdio>
#include <utility>

namespace shims {
namespace {

// Taxa normal de reprodução: sem ajuste de tom.
constexpr float kNormalRate = 1.0f;

}  // namespace

AudioVoices& audioVoices() {
  static AudioVoices voices;
  return voices;
}

int AudioVoices::addBuffer(AudioBufferData buffer) {
  const int id = nextBufferId_++;
  buffers_[id] = std::move(buffer);
  return id;
}

const AudioBufferData* AudioVoices::buffer(int id) const {
  auto it = buffers_.find(id);
  return it == buffers_.end() ? nullptr : &it->second;
}

void AudioVoices::freeBuffer(int id) {
  // As vozes que tocam o buffer caem antes: senão o update realimentaria um PCM
  // que não existe mais.
  for (auto it = voices_.begin(); it != voices_.end();) {
    if (it->second.bufferId == id) {
      destroyVoice(it->second);
      it = voices_.erase(it);
    } else {
      ++it;
    }
  }
  buffers_.erase(id);
}

bool AudioVoices::ensureDevice() {
  if (device_ != 0) return true;
  // Um dispositivo lógico para o jogo todo, no padrão do sistema: o SDL o leva
  // junto quando a saída padrão do Windows muda (SPEC-0730).
  device_ = SDL_OpenAudioDevice(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, nullptr);
  if (device_ == 0) {
    std::printf("[audio] SDL_OpenAudioDevice falhou: %s\n", SDL_GetError());
    return false;
  }
  ++deviceOpens_;
  std::printf("[audio] dispositivo de reprodução aberto (id %u)\n", device_);
  return true;
}

void AudioVoices::feed(Voice& voice, size_t first) {
  const AudioBufferData* data = buffer(voice.bufferId);
  if (!data || first >= data->samples.size()) return;
  SDL_PutAudioStreamData(voice.stream, data->samples.data() + first,
                         static_cast<int>((data->samples.size() - first) * sizeof(float)));
}

void AudioVoices::destroyVoice(Voice& voice) {
  // Desliga o stream sob o lock do dispositivo e libera; o dispositivo continua aberto.
  SDL_DestroyAudioStream(voice.stream);
  voice.stream = nullptr;
}

int AudioVoices::play(int bufferId, bool loop, float gain, float rate, double offsetSeconds) {
  const AudioBufferData* data = buffer(bufferId);
  if (!data || !ensureDevice()) return 0;

  SDL_AudioSpec deviceSpec{};
  if (!SDL_GetAudioDeviceFormat(device_, &deviceSpec, nullptr)) {
    std::printf("[audio] SDL_GetAudioDeviceFormat falhou: %s\n", SDL_GetError());
    return 0;
  }
  const SDL_AudioSpec source = {SDL_AUDIO_F32, data->channels, data->sampleRate};
  SDL_AudioStream* stream = SDL_CreateAudioStream(&source, &deviceSpec);
  if (!stream) {
    std::printf("[audio] SDL_CreateAudioStream falhou: %s\n", SDL_GetError());
    return 0;
  }
  SDL_SetAudioStreamGain(stream, gain);
  if (rate > 0 && rate != kNormalRate) SDL_SetAudioStreamFrequencyRatio(stream, rate);

  const int voiceId = nextVoiceId_++;
  Voice& voice = voices_[voiceId];
  voice = Voice{stream, bufferId, loop};
  // o PCM entra antes de ligar: o stream não começa vazio
  feed(voice, startSampleAt(*data, offsetSeconds, loop));
  // Sem laço, a entrada acabou: o flush solta o fim que o reamostrador segura (som com tom ≠ 1 ou em outra taxa
  // que a do dispositivo). Sem ele a fila nunca zera e a voz nunca é recolhida (SPEC-0730).
  if (!loop) SDL_FlushAudioStream(stream);
  if (!SDL_BindAudioStream(device_, stream)) {
    std::printf("[audio] SDL_BindAudioStream falhou: %s\n", SDL_GetError());
    destroyVoice(voice);
    voices_.erase(voiceId);
    return 0;
  }
  return voiceId;
}

void AudioVoices::setGain(int voiceId, float gain) {
  auto it = voices_.find(voiceId);
  if (it != voices_.end()) SDL_SetAudioStreamGain(it->second.stream, gain);
}

void AudioVoices::setRate(int voiceId, float rate) {
  auto it = voices_.find(voiceId);
  if (it != voices_.end() && rate > 0) SDL_SetAudioStreamFrequencyRatio(it->second.stream, rate);
}

void AudioVoices::stop(int voiceId) {
  auto it = voices_.find(voiceId);
  if (it == voices_.end()) return;
  destroyVoice(it->second);
  voices_.erase(it);
}

void AudioVoices::update() {
  for (auto it = voices_.begin(); it != voices_.end();) {
    Voice& voice = it->second;
    const int queued = SDL_GetAudioStreamQueued(voice.stream);
    if (voice.loop) {
      // realimenta antes de secar (meio buffer de folga)
      const AudioBufferData* data = buffer(voice.bufferId);
      const int total = data ? static_cast<int>(data->samples.size() * sizeof(float)) : 0;
      if (queued < total / 2) feed(voice);
      ++it;
    } else if (queued == 0) {
      destroyVoice(voice);
      it = voices_.erase(it);
    } else {
      ++it;
    }
  }
}

void AudioVoices::shutdown() {
  for (auto& [id, voice] : voices_) destroyVoice(voice);
  voices_.clear();
  buffers_.clear();
  if (device_ != 0) {
    SDL_CloseAudioDevice(device_);
    device_ = 0;
  }
}

bool logAudioDeviceEvent(const SDL_Event& event) {
  const char* what = nullptr;
  switch (event.type) {
    case SDL_EVENT_AUDIO_DEVICE_ADDED:
      what = "adicionado";
      break;
    case SDL_EVENT_AUDIO_DEVICE_REMOVED:
      what = "removido";
      break;
    case SDL_EVENT_AUDIO_DEVICE_FORMAT_CHANGED:
      what = "formato mudou";
      break;
    default:
      return false;
  }
  // o evento traz o id FÍSICO; o do jogo é lógico e segue o padrão do sistema
  const char* name = SDL_GetAudioDeviceName(event.adevice.which);
  std::printf("[audio] dispositivo %u %s%s: %s\n", event.adevice.which, what,
              event.adevice.recording ? " (gravação)" : "", name ? name : "?");
  return true;
}

}  // namespace shims
