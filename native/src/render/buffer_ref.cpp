// Ver buffer_ref.h (ADR-0692, item 5).
#include "buffer_ref.h"

namespace render {

const BufferRefOps& wgpuBufferRefOps() {
  static const BufferRefOps ops{wgpuBufferAddRef, wgpuBufferRelease};
  return ops;
}

}  // namespace render
