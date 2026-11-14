// Testes da escolha do compilador de shader D3D12 (SPEC-0731): o DXC só entra com a
// DLL que carrega de verdade; o resto (forçado, sem pasta, DLL ausente ou inválida) é FXC.
#include "../src/core/dx12_compiler.h"
#include "harness.h"

#include <string>

namespace tests {

namespace {

constexpr const char* kBaseDir = "C:\\jogo\\";
std::string gProbed;

bool probeOk(const std::string& path) {
  gProbed = path;
  return true;
}

bool probeFails(const std::string& path) {
  gProbed = path;
  return false;
}

}  // namespace

void testDx12CompilerPicksDxcBesideExe() {
  gProbed.clear();
  const core::Dx12CompilerChoice c = core::chooseDx12Compiler(kBaseDir, nullptr, probeOk);
  CHECK(c.compiler == core::Dx12Compiler::Dxc);
  CHECK(c.dxcPath == std::string(kBaseDir) + core::kDxcDllName);
  CHECK(gProbed == c.dxcPath);
  // Valor que não é "fxc" não muda nada.
  CHECK(core::chooseDx12Compiler(kBaseDir, "dxc", probeOk).compiler == core::Dx12Compiler::Dxc);
}

void testDx12CompilerFallsBackToFxc() {
  // Forçado pela variável, sem diferenciar maiúsculas, e sem nem olhar a DLL.
  gProbed.clear();
  CHECK(core::chooseDx12Compiler(kBaseDir, "fxc", probeOk).compiler == core::Dx12Compiler::Fxc);
  CHECK(core::chooseDx12Compiler(kBaseDir, "FXC", probeOk).compiler == core::Dx12Compiler::Fxc);
  CHECK(gProbed.empty());
  // DLL ausente ou que não carrega.
  const core::Dx12CompilerChoice bad = core::chooseDx12Compiler(kBaseDir, nullptr, probeFails);
  CHECK(bad.compiler == core::Dx12Compiler::Fxc);
  CHECK(bad.dxcPath.empty());
  // Pasta do exe desconhecida.
  CHECK(core::chooseDx12Compiler(nullptr, nullptr, probeOk).compiler == core::Dx12Compiler::Fxc);
  CHECK(core::chooseDx12Compiler("", nullptr, probeOk).compiler == core::Dx12Compiler::Fxc);
}

void testDxcLoadsRejectsInvalidDll() {
  CHECK(!core::dxcLoads("Z:\\nao-existe\\dxcompiler.dll"));
  // Arquivo que não é DLL (a fonte de UI) não carrega.
  CHECK(!core::dxcLoads(CORTEX_DEFAULT_UI_FONT));
#ifdef CORTEX_TEST_DXC_DLL
  // A DLL pinada do fetch-deps carrega e exporta o DxcCreateInstance.
  CHECK(core::dxcLoads(CORTEX_TEST_DXC_DLL));
#endif
}

}  // namespace tests
