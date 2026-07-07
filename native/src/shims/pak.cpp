#include "pak.h"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <map>
#include <vector>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Chave do XOR — DEVE bater byte a byte com PAK_KEY em native/scripts/pak.mjs.
const char KEY[] = "CortexNative-pak-scramble-key-v1";
const size_t KEY_LEN = sizeof(KEY) - 1;  // 32 (sem o '\0')
const uint32_t HEADER = 16;

struct Entry {
  uint32_t offset;
  uint32_t size;
};

std::map<std::string, Entry> g_index;
std::string g_pakPath;
bool g_scrambled = false;

uint32_t readU32(const unsigned char* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) |
         (static_cast<uint32_t>(p[3]) << 24);
}

uint16_t readU16(const unsigned char* p) {
  return static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
}

// XOR in-place; `filePos` = posição absoluta de buf[0] no arquivo (>= HEADER).
void unscramble(unsigned char* buf, size_t len, uint32_t filePos) {
  for (size_t i = 0; i < len; i++) {
    buf[i] ^= KEY[(filePos + i - HEADER) % KEY_LEN];
  }
}

}  // namespace

bool loadPak(const std::string& pakPath) {
  FILE* f = std::fopen(pakPath.c_str(), "rb");
  if (!f) return false;

  unsigned char header[HEADER];
  if (std::fread(header, 1, HEADER, f) != HEADER ||
      std::memcmp(header, "CXP1", 4) != 0) {
    std::fclose(f);
    return false;
  }
  const uint32_t indexOffset = readU32(header + 4);
  const uint32_t indexSize = readU32(header + 8);
  g_scrambled = (readU32(header + 12) & 1u) != 0;

  std::vector<unsigned char> idx(indexSize);
  std::fseek(f, static_cast<long>(indexOffset), SEEK_SET);
  const bool ok = std::fread(idx.data(), 1, indexSize, f) == indexSize;
  std::fclose(f);
  if (!ok || indexSize < 4) return false;
  if (g_scrambled) unscramble(idx.data(), idx.size(), indexOffset);

  const uint32_t count = readU32(idx.data());
  size_t pos = 4;
  g_index.clear();
  for (uint32_t i = 0; i < count; i++) {
    if (pos + 2 > idx.size()) return false;
    const uint16_t pathLen = readU16(idx.data() + pos);
    pos += 2;
    if (pos + pathLen + 8 > idx.size()) return false;
    std::string key(reinterpret_cast<const char*>(idx.data() + pos), pathLen);
    pos += pathLen;
    const uint32_t offset = readU32(idx.data() + pos);
    pos += 4;
    const uint32_t size = readU32(idx.data() + pos);
    pos += 4;
    g_index[key] = {offset, size};
  }
  g_pakPath = pakPath;
  return true;
}

napi_value readPakFile(napi_env env, const std::string& relPath) {
  auto it = g_index.find(relPath);
  if (it == g_index.end()) return nullptr;  // não está no pak → cai pro disco

  FILE* f = std::fopen(g_pakPath.c_str(), "rb");
  if (!f) return nullptr;
  const uint32_t filePos = HEADER + it->second.offset;
  const uint32_t size = it->second.size;
  std::fseek(f, static_cast<long>(filePos), SEEK_SET);

  void* data = nullptr;
  napi_value arrayBuffer = nullptr;
  napi_create_arraybuffer(env, size, &data, &arrayBuffer);
  if (data && size > 0) {
    std::fread(data, 1, size, f);
    if (g_scrambled)
      unscramble(static_cast<unsigned char*>(data), size, filePos);
  }
  std::fclose(f);
  return arrayBuffer;
}

}  // namespace shims
