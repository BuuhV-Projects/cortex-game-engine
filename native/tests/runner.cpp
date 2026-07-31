// Runner dos testes unitários do host (TDR-0004): registra as funções de
// teste dos *_test.cpp e devolve o nº de falhas como exit code.
#include "harness.h"

namespace tests {
void testFormatFromString();
void testFormatToStringRoundtrip();
void testBc7Math();
void testAppendPerfLog();
void testDescribeCurrentException();
void testGameConfig();
}  // namespace tests

int main() {
  tests::testFormatFromString();
  tests::testFormatToStringRoundtrip();
  tests::testBc7Math();
  tests::testAppendPerfLog();
  tests::testDescribeCurrentException();
  tests::testGameConfig();
  return testing::summary();
}
