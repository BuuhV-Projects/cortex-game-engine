// Vozes de áudio do host (SPEC-0730): os buffers decodificados e as vozes que
// tocam, num dispositivo lógico SÓ, aberto uma vez. Cada voz é um
// SDL_AudioStream ligado a esse dispositivo. Sem NAPI: o audio.cpp é a ponte JS
// e o audio_voices_test exercita isto com o driver dummy da SDL.
#pragma once

#include <SDL3/SDL.h>

#include <map>

#include "audio_decode.h"

namespace shims {

class AudioVoices {
 public:
  /** Guarda o PCM decodificado; devolve o id do buffer. */
  int addBuffer(AudioBufferData buffer);
  /** O buffer `id`, ou nullptr. */
  const AudioBufferData* buffer(int id) const;
  /** Derruba as vozes que tocam `id` e libera o PCM (ADR-0153). */
  void freeBuffer(int id);

  /**
   * Toca o buffer `bufferId` a partir de `offsetSeconds` (SPEC-0700): devolve o
   * id da voz, ou 0 se o buffer não existe ou não há saída de áudio.
   */
  int play(int bufferId, bool loop, float gain, float rate, double offsetSeconds);
  void setGain(int voiceId, float gain);
  void setRate(int voiceId, float rate);
  void stop(int voiceId);

  /** Por quadro: realimenta as vozes em laço e recolhe as que terminaram. */
  void update();
  /** Para todas as vozes, libera os buffers e fecha o dispositivo. */
  void shutdown();

  /** O dispositivo lógico (0 = ainda não abriu). */
  SDL_AudioDeviceID device() const { return device_; }
  /** Quantas vezes o dispositivo foi aberto (o teste confere que é 1). */
  int deviceOpens() const { return deviceOpens_; }
  int liveVoices() const { return static_cast<int>(voices_.size()); }

 private:
  struct Voice {
    SDL_AudioStream* stream = nullptr;
    int bufferId = 0;
    bool loop = false;
  };

  bool ensureDevice();
  void feed(Voice& voice, size_t first = 0);
  void destroyVoice(Voice& voice);

  std::map<int, AudioBufferData> buffers_;
  std::map<int, Voice> voices_;
  int nextBufferId_ = 1;
  int nextVoiceId_ = 1;
  SDL_AudioDeviceID device_ = 0;
  int deviceOpens_ = 0;
};

/** As vozes do host (uma instância para o processo). */
AudioVoices& audioVoices();

/** Loga os eventos de dispositivo de áudio da SDL (SPEC-0730); false = não era de áudio. */
bool logAudioDeviceEvent(const SDL_Event& event);

}  // namespace shims
