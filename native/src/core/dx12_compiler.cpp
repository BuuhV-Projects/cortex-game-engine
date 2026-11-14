#include "dx12_compiler.h"

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <cctype>

namespace core {
namespace {

constexpr const char* kForceFxcValue = "fxc";
constexpr const char* kDxcEntryPoint = "DxcCreateInstance";

bool equalsIgnoreCase(const char* a, const char* b) {
  for (; *a != '\0' && *b != '\0'; ++a, ++b) {
    if (std::tolower(static_cast<unsigned char>(*a)) != std::tolower(static_cast<unsigned char>(*b))) {
      return false;
    }
  }
  return *a == *b;
}

}  // namespace

std::wstring utf8ToWide(const std::string& text) {
  if (text.empty()) return {};
  const int size = static_cast<int>(text.size());
  const int wide = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), size, nullptr, 0);
  if (wide <= 0) return {};
  std::wstring out(static_cast<size_t>(wide), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), size, out.data(), wide);
  return out;
}

bool dxcLoads(const std::string& path) {
  // O caminho vem em UTF-8 (SDL_GetBasePath): a versão W aceita pasta com acento, que a
  // versão A (página de código ANSI) não abriria. Caminho absoluto +
  // LOAD_WITH_ALTERED_SEARCH_PATH: as dependências da DLL vêm da pasta dela, como quando
  // o wgpu a carregar. Uma DLL x86, truncada ou de outro programa falha aqui ou não tem o
  // ponto de entrada.
  const std::wstring widePath = utf8ToWide(path);
  if (widePath.empty()) return false;
  HMODULE module = LoadLibraryExW(widePath.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (module == nullptr) return false;
  const bool hasEntry = GetProcAddress(module, kDxcEntryPoint) != nullptr;
  FreeLibrary(module);
  return hasEntry;
}

Dx12CompilerChoice chooseDx12Compiler(const char* baseDir, const char* envValue, DxcProbe probe) {
  Dx12CompilerChoice choice;
  if (envValue != nullptr && equalsIgnoreCase(envValue, kForceFxcValue)) {
    choice.reason = "forçado por CORTEX_DX12_COMPILER";
    return choice;
  }
  if (baseDir == nullptr || *baseDir == '\0') {
    choice.reason = "pasta do exe desconhecida";
    return choice;
  }
  const std::string path = std::string(baseDir) + kDxcDllName;
  if (!probe(path)) {
    choice.reason = "dxcompiler.dll ausente ou não carrega";
    return choice;
  }
  choice.compiler = Dx12Compiler::Dxc;
  choice.dxcPath = path;
  choice.reason = "dxcompiler.dll ao lado do exe";
  return choice;
}

}  // namespace core
