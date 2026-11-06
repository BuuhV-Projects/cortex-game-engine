// Testes do decode de áudio do host (SPEC-0700): OGG Vorbis pelo stb_vorbis
// dentro do miniaudio, e o quadro de início do offset do play.
#include <cmath>
#include <fstream>
#include <iterator>
#include <vector>

#include "../src/shims/audio_decode.h"
#include "harness.h"

namespace tests {
namespace {

constexpr int kSampleRate = 44100;
constexpr double kToneSeconds = 0.5;
// Vorbis em modo push pode sobrar até um bloco no fim (2048 quadros ≈ 46 ms).
constexpr double kDurationSlackSeconds = 0.05;

std::vector<char> readFixture(const char* name) {
  std::ifstream file(std::string(CORTEX_TEST_FIXTURES) + "/" + name,
                     std::ios::binary);
  return {std::istreambuf_iterator<char>(file), {}};
}

}  // namespace

void testAudioDecode() {
  // .ogg mono 44,1 kHz de 0,5 s (ffmpeg sine 440 Hz, libvorbis -q 2).
  const std::vector<char> ogg = readFixture("tone-mono-44k-500ms.ogg");
  CHECK(!ogg.empty());
  shims::AudioBufferData buffer;
  CHECK(shims::decodeAudio(ogg.data(), ogg.size(), &buffer));
  CHECK(buffer.channels == 1);
  CHECK(buffer.sampleRate == kSampleRate);
  CHECK(std::fabs(buffer.duration - kToneSeconds) < kDurationSlackSeconds);

  const char garbage[] = "isto nao e audio";
  shims::AudioBufferData none;
  CHECK(!shims::decodeAudio(garbage, sizeof(garbage), &none));

  // Quadro de início: 0,25 s → quadro 11025; em loop dá a volta; sem loop prende ao fim.
  shims::AudioBufferData stereo;
  stereo.channels = 2;
  stereo.sampleRate = kSampleRate;
  stereo.samples.assign(static_cast<size_t>(kSampleRate) * 2, 0.f);  // 1 s
  CHECK(shims::startSampleAt(stereo, 0.25, false) == 11025u * 2);
  CHECK(shims::startSampleAt(stereo, 1.25, true) == 11025u * 2);
  CHECK(shims::startSampleAt(stereo, 3.0, false) == stereo.samples.size());
  CHECK(shims::startSampleAt(stereo, -1.0, false) == 0u);
}

}  // namespace tests
