#include "inflate.h"

#include <climits>
#include <cstdlib>

#define STBI_NO_STDIO
#include <stb_image.h>

namespace shims {
namespace {

// Cabeçalho fixo do gzip (RFC 1952 §2.3): ID1 ID2 CM FLG MTIME(4) XFL OS.
constexpr uint8_t kGzipId1 = 0x1f;
constexpr uint8_t kGzipId2 = 0x8b;
constexpr uint8_t kGzipMethodDeflate = 8;
constexpr size_t kGzipFixedHeader = 10;
constexpr size_t kGzipFlagsAt = 3;
constexpr uint8_t kGzipFhcrc = 0x02;
constexpr uint8_t kGzipFextra = 0x04;
constexpr uint8_t kGzipFname = 0x08;
constexpr uint8_t kGzipFcomment = 0x10;
constexpr size_t kGzipHeaderCrcSize = 2;
// Trailer: CRC32(4) + ISIZE(4), little-endian.
constexpr size_t kGzipTrailer = 8;
constexpr size_t kGzipIsizeSize = 4;
constexpr int kByteBits = 8;

// Primeiro palpite do tamanho de saída do stb (ele realoca se faltar).
constexpr int kGuessRatio = 4;

uint32_t readLe(const uint8_t* p, size_t n) {
  uint32_t v = 0;
  for (size_t i = 0; i < n; ++i) v |= static_cast<uint32_t>(p[i]) << (kByteBits * i);
  return v;
}

// Pula uma string terminada em zero (FNAME/FCOMMENT). false se não termina.
bool skipZeroTerminated(const uint8_t* data, size_t size, size_t* at) {
  while (*at < size && data[*at] != 0) ++*at;
  if (*at >= size) return false;
  ++*at;
  return true;
}

// Offset do deflate cru dentro do membro gzip; nullopt se o cabeçalho é ruim.
std::optional<size_t> gzipPayloadOffset(const uint8_t* data, size_t size) {
  if (size < kGzipFixedHeader + kGzipTrailer) return std::nullopt;
  if (data[0] != kGzipId1 || data[1] != kGzipId2 || data[2] != kGzipMethodDeflate)
    return std::nullopt;
  const uint8_t flags = data[kGzipFlagsAt];
  size_t at = kGzipFixedHeader;
  if (flags & kGzipFextra) {
    constexpr size_t kXlenSize = 2;
    if (at + kXlenSize > size) return std::nullopt;
    at += kXlenSize + readLe(data + at, kXlenSize);
  }
  if ((flags & kGzipFname) && !skipZeroTerminated(data, size, &at)) return std::nullopt;
  if ((flags & kGzipFcomment) && !skipZeroTerminated(data, size, &at)) return std::nullopt;
  if (flags & kGzipFhcrc) at += kGzipHeaderCrcSize;
  if (at + kGzipTrailer > size) return std::nullopt;
  return at;
}

std::optional<std::vector<uint8_t>> takeStbOutput(char* out, int outLen) {
  if (!out) return std::nullopt;
  std::vector<uint8_t> bytes(out, out + outLen);
  std::free(out);  // STBI_FREE padrão = free
  return bytes;
}

}  // namespace

std::optional<InflateFormat> parseInflateFormat(std::string_view name) {
  if (name == "deflate") return InflateFormat::kDeflate;
  if (name == "deflate-raw") return InflateFormat::kDeflateRaw;
  if (name == "gzip") return InflateFormat::kGzip;
  return std::nullopt;
}

std::optional<std::vector<uint8_t>> inflateBytes(const uint8_t* data,
                                                 size_t size,
                                                 InflateFormat format) {
  if (!data || size == 0 || size > static_cast<size_t>(INT_MAX)) return std::nullopt;
  const char* in = reinterpret_cast<const char*>(data);
  const int len = static_cast<int>(size);
  int outLen = 0;
  if (format == InflateFormat::kDeflate) {
    const int guess = len > INT_MAX / kGuessRatio ? len : len * kGuessRatio;
    return takeStbOutput(
        stbi_zlib_decode_malloc_guesssize_headerflag(in, len, guess, &outLen, 1),
        outLen);
  }
  if (format == InflateFormat::kDeflateRaw)
    return takeStbOutput(stbi_zlib_decode_noheader_malloc(in, len, &outLen), outLen);

  const std::optional<size_t> payload = gzipPayloadOffset(data, size);
  if (!payload) return std::nullopt;
  const int payloadLen = static_cast<int>(size - *payload - kGzipTrailer);
  std::optional<std::vector<uint8_t>> bytes = takeStbOutput(
      stbi_zlib_decode_noheader_malloc(in + *payload, payloadLen, &outLen), outLen);
  // ponytail: confere só o ISIZE; CRC32 do trailer ignorado (ADR-0650).
  const uint32_t isize = readLe(data + size - kGzipIsizeSize, kGzipIsizeSize);
  if (bytes && static_cast<uint32_t>(bytes->size()) != isize) return std::nullopt;
  return bytes;
}

}  // namespace shims
