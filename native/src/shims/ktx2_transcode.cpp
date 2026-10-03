#include "ktx2_transcode.h"

#include <mutex>

#include "ktx2_math.h"
// Transcoder do basis_universal (third-party). Defines no CMake:
// BASISD_SUPPORT_KTX2=1, BASISD_SUPPORT_KTX2_ZSTD=1.
#include "basisu_transcoder.h"

namespace shims {
namespace {

constexpr size_t RGBA_BYTES_PER_PIXEL = 4;
constexpr uint32_t FIRST_LAYER = 0;
constexpr uint32_t FIRST_FACE = 0;
constexpr uint32_t BASE_LEVEL = 0;

std::once_flag g_initOnce;  // tabelas de lookup do transcoder — inicializa 1×.

// ── BC7, todos os mips (SPEC-0155) ───────────────────────────────────────────
// RGBA32 cru ocupava 4× mais VRAM que o Studio (KTX2Loader → BC7) e só
// entregava o mip 0 (o three re-gerava mips na GPU). Todo hardware D3D12
// suporta BC1–7 por spec; o device pede TextureCompressionBC (device.cpp).
bool transcodeBc7(basist::ktx2_transcoder& trans, Ktx2Image& out) {
  const uint32_t levelCount = trans.get_levels();
  if (levelCount == 0) return false;
  out.levels.resize(levelCount);
  for (uint32_t level = 0; level < levelCount; ++level) {
    auto& buf = out.levels[level];
    buf.resize(bc7LevelByteSize(out.width, out.height, level));  // TDR-0004
    if (!trans.transcode_image_level(level, FIRST_LAYER, FIRST_FACE, buf.data(),
                                     bc7BlocksPerLevel(out.width, out.height, level),
                                     basist::transcoder_texture_format::cTFBC7_RGBA)) {
      out.levels.clear();
      return false;
    }
  }
  out.bc7 = true;
  return true;
}

// ── Fallback RGBA32 (mip 0) — arquivos que o BC7 não cobrir ──────────────────
bool transcodeRgba(basist::ktx2_transcoder& trans, Ktx2Image& out) {
  const uint32_t pixels = out.width * out.height;
  out.rgba.resize(static_cast<size_t>(pixels) * RGBA_BYTES_PER_PIXEL);
  return trans.transcode_image_level(BASE_LEVEL, FIRST_LAYER, FIRST_FACE,
                                     out.rgba.data(), pixels,
                                     basist::transcoder_texture_format::cTFRGBA32);
}

}  // namespace

bool transcodeKtx2(const uint8_t* bytes, size_t size, Ktx2Image& out) {
  if (!bytes || size == 0) return false;
  std::call_once(g_initOnce, [] { basist::basisu_transcoder_init(); });

  basist::ktx2_transcoder trans;
  if (!trans.init(bytes, static_cast<uint32_t>(size))) return false;
  if (!trans.start_transcoding()) return false;
  out.width = trans.get_width();
  out.height = trans.get_height();
  if (out.width == 0 || out.height == 0) return false;
  return transcodeBc7(trans, out) || transcodeRgba(trans, out);
}

}  // namespace shims
