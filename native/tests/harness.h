// Harness de teste MINIMALISTA do host (TDR-0004): zero dependências — um
// `CHECK` com contagem e relato, pra testar unidades PURAS do C++ (enums,
// matemática, logging) sem arrastar gtest/wgpu/Hermes pro build de teste.
//
// Uso num *_test.cpp:
//   #include "harness.h"
//   void testMinhaUnidade() {
//     CHECK(formatFromString("bc7-rgba-unorm") == WGPUTextureFormat_BC7RGBAUnorm);
//   }
// E registre a função no main (runner.cpp). Exit code = nº de falhas.
#pragma once

#include <cstdio>

namespace testing {

inline int g_checks = 0;
inline int g_failures = 0;

inline void reportCheck(bool ok, const char* expr, const char* file, int line) {
  ++g_checks;
  if (!ok) {
    ++g_failures;
    std::printf("FALHOU  %s:%d  %s\n", file, line, expr);
  }
}

inline int summary() {
  std::printf("%d checks, %d falhas\n", g_checks, g_failures);
  return g_failures;
}

}  // namespace testing

#define CHECK(expr) ::testing::reportCheck((expr), #expr, __FILE__, __LINE__)
