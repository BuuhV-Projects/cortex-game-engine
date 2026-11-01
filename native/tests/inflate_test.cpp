// Testes do inflate do DecompressionStream (ADR-0650 / SPEC-0651). Vetores
// gerados pelo zlib do Node: "cortex cortex cortex!" em zlib, cru e gzip.
#include <string>
#include <vector>

#include "../src/shims/inflate.h"
#include "harness.h"

namespace tests {
namespace {

using Bytes = std::vector<uint8_t>;

const std::string kText = "cortex cortex cortex!";
const Bytes kZlib = {0x78, 0x9c, 0x4b, 0xce, 0x2f, 0x2a, 0x49, 0xad, 0x50,
                     0x48, 0x46, 0xa6, 0x14, 0x01, 0x5b, 0xb7, 0x08, 0x21};
const Bytes kRaw = {0x4b, 0xce, 0x2f, 0x2a, 0x49, 0xad,
                    0x50, 0x48, 0x46, 0xa6, 0x14, 0x01};
const Bytes kGzip = {0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a,
                     0x4b, 0xce, 0x2f, 0x2a, 0x49, 0xad, 0x50, 0x48, 0x46, 0xa6,
                     0x14, 0x01, 0x6a, 0x30, 0xbf, 0x7c, 0x15, 0x00, 0x00, 0x00};
// Mesmo membro com FNAME = "a.txt".
const Bytes kGzipName = {0x1f, 0x8b, 0x08, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
                         0x0a, 0x61, 0x2e, 0x74, 0x78, 0x74, 0x00, 0x4b, 0xce,
                         0x2f, 0x2a, 0x49, 0xad, 0x50, 0x48, 0x46, 0xa6, 0x14,
                         0x01, 0x6a, 0x30, 0xbf, 0x7c, 0x15, 0x00, 0x00, 0x00};

bool inflatesToText(const Bytes& in, shims::InflateFormat format) {
  auto out = shims::inflateBytes(in.data(), in.size(), format);
  return out && std::string(out->begin(), out->end()) == kText;
}

bool rejects(const Bytes& in, shims::InflateFormat format) {
  return !shims::inflateBytes(in.data(), in.size(), format).has_value();
}

}  // namespace

void testInflate() {
  using shims::InflateFormat;
  CHECK(shims::parseInflateFormat("deflate") == InflateFormat::kDeflate);
  CHECK(shims::parseInflateFormat("deflate-raw") == InflateFormat::kDeflateRaw);
  CHECK(shims::parseInflateFormat("gzip") == InflateFormat::kGzip);
  CHECK(!shims::parseInflateFormat("brotli").has_value());

  CHECK(inflatesToText(kZlib, InflateFormat::kDeflate));
  CHECK(inflatesToText(kRaw, InflateFormat::kDeflateRaw));
  CHECK(inflatesToText(kGzip, InflateFormat::kGzip));
  CHECK(inflatesToText(kGzipName, InflateFormat::kGzip));

  // Formato trocado, vazio, truncado e lixo são recusados.
  CHECK(rejects(kRaw, InflateFormat::kDeflate));
  CHECK(rejects(kZlib, InflateFormat::kGzip));
  CHECK(rejects({}, InflateFormat::kDeflate));
  CHECK(rejects(Bytes(kZlib.begin(), kZlib.end() - 8), InflateFormat::kDeflate));
  CHECK(rejects({0xde, 0xad, 0xbe, 0xef}, InflateFormat::kDeflate));
  // ISIZE do trailer diferente do tamanho real.
  Bytes badSize = kGzip;
  badSize[badSize.size() - 4] ^= 1;
  CHECK(rejects(badSize, InflateFormat::kGzip));
}

}  // namespace tests
