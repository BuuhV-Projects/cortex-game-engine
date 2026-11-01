// Inflate PURO (sem NAPI) do DecompressionStream do host (ADR-0650 / SPEC-0651):
// zlib (RFC 1950), deflate cru (RFC 1951) e gzip (RFC 1952), sobre o inflate
// que o stb_image já traz. A ponte JS fica em decompression.*.
#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string_view>
#include <vector>

namespace shims {

enum class InflateFormat { kDeflate, kDeflateRaw, kGzip };

// Nomes do navegador: "deflate", "deflate-raw", "gzip". Desconhecido → nullopt.
std::optional<InflateFormat> parseInflateFormat(std::string_view name);

// Descomprime `size` bytes. nullopt se vazio, corrompido ou truncado.
std::optional<std::vector<uint8_t>> inflateBytes(const uint8_t* data,
                                                 size_t size,
                                                 InflateFormat format);

}  // namespace shims
