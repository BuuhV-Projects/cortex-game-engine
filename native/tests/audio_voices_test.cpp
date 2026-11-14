// Testes das vozes de áudio do host (SPEC-0730): um dispositivo lógico só, aberto
// uma vez, com milhares de vozes ligando e desligando enquanto a thread de
// mistura da SDL roda (driver dummy, sem placa de som).
#include <SDL3/SDL.h>

#include <cmath>
#include <vector>

#include "../src/shims/audio_voices.h"
#include "harness.h"

namespace tests {
namespace {

constexpr int kSampleRate = 44100;
constexpr int kChannels = 2;
// Buffers curtos: as vozes sem laço terminam sozinhas durante o teste.
constexpr double kShortSeconds = 0.01;
constexpr double kLongSeconds = 0.25;
constexpr float kAmplitude = 0.25f;
constexpr double kTone = 440;
constexpr double kTwoPi = 6.283185307179586;
// Rodadas do estresse e vozes por rodada.
constexpr int kRounds = 400;
constexpr int kVoicesPerRound = 12;
// Espera entre rodadas: dá tempo à thread de mistura consumir.
constexpr int kRoundMs = 2;
// Quanto esperar no fim pelas vozes que ainda tocam.
constexpr int kDrainMs = 2000;
constexpr int kDrainStepMs = 10;
constexpr float kRate = 1.25f;
constexpr float kGain = 0.5f;

shims::AudioBufferData tone(double seconds) {
  shims::AudioBufferData b;
  b.channels = kChannels;
  b.sampleRate = kSampleRate;
  b.duration = seconds;
  const int frames = static_cast<int>(seconds * kSampleRate);
  b.samples.resize(static_cast<size_t>(frames) * kChannels);
  for (int f = 0; f < frames; ++f) {
    const float s = kAmplitude * static_cast<float>(std::sin(kTwoPi * kTone * f / kSampleRate));
    for (int c = 0; c < kChannels; ++c) b.samples[static_cast<size_t>(f) * kChannels + c] = s;
  }
  return b;
}

}  // namespace

void testAudioVoices() {
  SDL_SetHint(SDL_HINT_AUDIO_DRIVER, "dummy");
  CHECK(SDL_InitSubSystem(SDL_INIT_AUDIO));

  {
    shims::AudioVoices voices;
    // sem buffer: não abre dispositivo nem cria voz
    CHECK(voices.play(1, false, 1, 1, 0) == 0);
    CHECK(voices.deviceOpens() == 0);

    const int shortId = voices.addBuffer(tone(kShortSeconds));
    const int longId = voices.addBuffer(tone(kLongSeconds));
    std::vector<int> loops;
    for (int round = 0; round < kRounds; ++round) {
      for (int v = 0; v < kVoicesPerRound; ++v) {
        const int id = voices.play(v % 2 ? shortId : longId, false, kGain, v % 3 ? 1.0f : kRate, 0);
        CHECK(id != 0);
        // parte das vozes é parada no meio, como um tiro cortado ou um motor que desliga
        if (v % 4 == 0) voices.stop(id);
        else if (v % 5 == 0) voices.setGain(id, kGain);
      }
      if (round % 50 == 0) loops.push_back(voices.play(longId, true, kGain, 1, kLongSeconds / 2));
      voices.update();
      SDL_Delay(kRoundMs);
    }
    // o dispositivo abriu uma vez só, apesar das milhares de vozes
    CHECK(voices.deviceOpens() == 1);
    CHECK(voices.device() != 0);

    // as vozes em laço seguem vivas; parar todas e liberar o buffer longo derruba o resto dele
    for (int id : loops) voices.stop(id);
    voices.freeBuffer(longId);
    CHECK(voices.buffer(longId) == nullptr);
    for (int waited = 0; waited < kDrainMs && voices.liveVoices() > 0; waited += kDrainStepMs) {
      voices.update();
      SDL_Delay(kDrainStepMs);
    }
    // inclusive as de tom ≠ 1, que sem o flush ficavam com o fim preso no reamostrador para sempre
    CHECK(voices.liveVoices() == 0);

    // tocar de novo reaproveita o mesmo dispositivo
    CHECK(voices.play(shortId, false, 1, 1, 0) != 0);
    CHECK(voices.deviceOpens() == 1);

    voices.shutdown();
    CHECK(voices.liveVoices() == 0);
    CHECK(voices.device() == 0);
    CHECK(voices.buffer(shortId) == nullptr);
  }

  SDL_QuitSubSystem(SDL_INIT_AUDIO);
}

}  // namespace tests
