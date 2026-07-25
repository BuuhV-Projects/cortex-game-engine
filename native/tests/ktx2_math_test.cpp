// Testes da matemática de blocos BC7 (TDR-0004/SPEC-0155) — o tamanho errado
// de um nível de mip vira transcode truncado ou ArrayBuffer estourado.
#include "../src/shims/ktx2_math.h"
#include "harness.h"

namespace tests {

void testBc7Math() {
  using namespace shims;
  // Dimensões de mip nunca caem abaixo de 1.
  CHECK(mipDim(1024, 0) == 1024);
  CHECK(mipDim(1024, 10) == 1);
  CHECK(mipDim(1024, 20) == 1);
  CHECK(mipDim(4096, 1) == 2048);
  // Blocos 4×4 arredondam pra cima (borda parcial ainda ocupa bloco inteiro).
  CHECK(bc7BlocksAcross(4) == 1);
  CHECK(bc7BlocksAcross(5) == 2);
  CHECK(bc7BlocksAcross(1) == 1);
  CHECK(bc7BlocksAcross(1024) == 256);
  // Tamanhos reais dos assets do engine (kit 1024², skybox 4096×2048).
  CHECK(bc7LevelByteSize(1024, 1024, 0) == 256u * 256u * 16u);  // 1 MiB
  CHECK(bc7LevelByteSize(4096, 2048, 0) == 1024u * 512u * 16u);  // 8 MiB
  CHECK(bc7LevelByteSize(1024, 1024, 10) == 16u);  // mip 1×1 = 1 bloco
  CHECK(bc7LevelByteSize(6, 3, 0) == 2u * 1u * 16u);  // bordas parciais
}

}  // namespace tests
