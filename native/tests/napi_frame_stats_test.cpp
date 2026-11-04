// setBindGroup separado em chamada JS e replay em C++ (SPEC-0688). O que
// importa: o total (`napiBind` do trace) segue sendo a soma das duas origens,
// e a parte JS sai da diferença.
#include "../src/webgpu/napi_frame_stats.h"
#include "harness.h"

namespace tests {

void testNapiBindGroupSplitsJsAndReplay() {
  webgpu::g_napiFrame = webgpu::NapiFrameStats{};
  webgpu::bumpSetBindGroup();
  webgpu::bumpSetBindGroup();
  webgpu::bumpSetBindGroupReplay();
  webgpu::bumpSetBindGroupReplay();
  webgpu::bumpSetBindGroupReplay();
  const webgpu::NapiFrameStats& s = webgpu::g_napiFrame;
  CHECK(s.setBindGroup == 5);
  CHECK(s.setBindGroupReplay == 3);
  CHECK(webgpu::setBindGroupJs(s) == 2);
  webgpu::g_napiFrame = webgpu::NapiFrameStats{};
  CHECK(webgpu::setBindGroupJs(webgpu::g_napiFrame) == 0);
}

}  // namespace tests
