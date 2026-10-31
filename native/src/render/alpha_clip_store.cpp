// Ver alpha_clip_store.h (SPEC-0642).
#include "alpha_clip_store.h"

#include <cstring>

#include "../core/host_gpu.h"

namespace render {
namespace {

/** Constantes de `wrapS`/`wrapT` do `three` (`constants.js`). */
constexpr double kThreeRepeatWrapping = 1000;
constexpr double kThreeClampToEdgeWrapping = 1001;
constexpr double kThreeMirroredRepeatWrapping = 1002;

/** Bindings do grupo 1 do pipeline com recorte (ver o WGSL em `shadow_pass_shaders.h`). */
constexpr uint32_t kBindingTexture = 0;
constexpr uint32_t kBindingSampler = 1;
constexpr uint32_t kBindingCount = 2;
/** Uma camada: o recorte só amostra textura 2D simples. */
constexpr uint32_t kSingleLayer = 1;

WGPUAddressMode paraWgpu(AlphaClipWrap wrap) {
  switch (wrap) {
    case AlphaClipWrap::kRepeat: return WGPUAddressMode_Repeat;
    case AlphaClipWrap::kClamp: return WGPUAddressMode_ClampToEdge;
    case AlphaClipWrap::kMirror: return WGPUAddressMode_MirrorRepeat;
  }
  return WGPUAddressMode_Repeat;
}

}  // namespace

bool alphaClipWrapFromThree(double value, AlphaClipWrap* out) {
  if (value == kThreeRepeatWrapping) *out = AlphaClipWrap::kRepeat;
  else if (value == kThreeClampToEdgeWrapping) *out = AlphaClipWrap::kClamp;
  else if (value == kThreeMirroredRepeatWrapping) *out = AlphaClipWrap::kMirror;
  else return false;
  return true;
}

bool alphaClipFilterableFormat(WGPUTextureFormat format) {
  switch (format) {
    case WGPUTextureFormat_RGBA8Unorm:
    case WGPUTextureFormat_RGBA8UnormSrgb:
    case WGPUTextureFormat_BGRA8Unorm:
    case WGPUTextureFormat_BGRA8UnormSrgb:
    case WGPUTextureFormat_RGBA16Float: return true;
    default: break;
  }
  // Os comprimidos (BC, ETC2, EAC, ASTC) são contíguos no enum e todos filtráveis.
  return format >= WGPUTextureFormat_BC1RGBAUnorm && format <= WGPUTextureFormat_ASTC12x12UnormSrgb;
}

void AlphaClipStore::release(AlphaClipEntry& entry) {
  // Contagem de referência do wgpu: o que já foi submetido sobrevive até a GPU terminar.
  if (entry.bindGroup) wgpuBindGroupRelease(entry.bindGroup);
  if (entry.view) wgpuTextureViewRelease(entry.view);
  entry = AlphaClipEntry{};
}

WGPUBindGroupLayout AlphaClipStore::layout(HostGpu* gpu) {
  if (layout_ || !gpu || !gpu->device) return layout_;
  WGPUBindGroupLayoutEntry entradas[kBindingCount] = {WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT,
                                                       WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT};
  entradas[kBindingTexture].binding = kBindingTexture;
  entradas[kBindingTexture].visibility = WGPUShaderStage_Fragment;
  entradas[kBindingTexture].texture.sampleType = WGPUTextureSampleType_Float;
  entradas[kBindingTexture].texture.viewDimension = WGPUTextureViewDimension_2D;
  entradas[kBindingSampler].binding = kBindingSampler;
  entradas[kBindingSampler].visibility = WGPUShaderStage_Fragment;
  entradas[kBindingSampler].sampler.type = WGPUSamplerBindingType_Filtering;

  WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
  ld.entryCount = kBindingCount;
  ld.entries = entradas;
  layout_ = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  return layout_;
}

WGPUSampler AlphaClipStore::sampler(HostGpu* gpu, AlphaClipWrap wrapS, AlphaClipWrap wrapT) {
  WGPUSampler& slot = samplers_[static_cast<uint32_t>(wrapS)][static_cast<uint32_t>(wrapT)];
  if (slot) return slot;
  // Linear com mipmap linear: o default do `map` no `three` (`LinearMipmapLinearFilter`).
  WGPUSamplerDescriptor sd = WGPU_SAMPLER_DESCRIPTOR_INIT;
  sd.addressModeU = paraWgpu(wrapS);
  sd.addressModeV = paraWgpu(wrapT);
  sd.magFilter = WGPUFilterMode_Linear;
  sd.minFilter = WGPUFilterMode_Linear;
  sd.mipmapFilter = WGPUMipmapFilterMode_Linear;
  slot = wgpuDeviceCreateSampler(gpu->device, &sd);
  return slot;
}

bool AlphaClipStore::set(HostGpu* gpu, int32_t node, const AlphaClipSource& source) {
  erase(node);
  if (!gpu || !gpu->device || !source.texture || !source.uvBuffer || source.uvStride == 0) {
    return false;
  }
  // Uma view padrão de textura com camadas viraria `2d-array`, e o bind group
  // contra o layout `2d` é erro de validação — que no wgpu aborta o processo.
  if (wgpuTextureGetDimension(source.texture) != WGPUTextureDimension_2D ||
      wgpuTextureGetDepthOrArrayLayers(source.texture) != kSingleLayer ||
      !alphaClipFilterableFormat(wgpuTextureGetFormat(source.texture))) {
    return false;
  }
  WGPUBindGroupLayout grupo = layout(gpu);
  WGPUSampler amostrador = sampler(gpu, source.wrapS, source.wrapT);
  if (!grupo || !amostrador) return false;

  AlphaClipEntry entry;
  entry.view = wgpuTextureCreateView(source.texture, nullptr);
  if (!entry.view) return false;

  WGPUBindGroupEntry ligacoes[kBindingCount] = {WGPU_BIND_GROUP_ENTRY_INIT,
                                                WGPU_BIND_GROUP_ENTRY_INIT};
  ligacoes[kBindingTexture].binding = kBindingTexture;
  ligacoes[kBindingTexture].textureView = entry.view;
  ligacoes[kBindingSampler].binding = kBindingSampler;
  ligacoes[kBindingSampler].sampler = amostrador;
  WGPUBindGroupDescriptor gd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  gd.layout = grupo;
  gd.entryCount = kBindingCount;
  gd.entries = ligacoes;
  entry.bindGroup = wgpuDeviceCreateBindGroup(gpu->device, &gd);
  if (!entry.bindGroup) {
    release(entry);
    return false;
  }

  entry.uvBuffer = source.uvBuffer;
  entry.uvStride = source.uvStride;
  entry.uvOffset = source.uvOffset;
  entry.alphaTest = source.alphaTest;
  std::memcpy(entry.uvTransform, source.uvTransform, sizeof(entry.uvTransform));
  entries_[node] = entry;
  return true;
}

const AlphaClipEntry* AlphaClipStore::find(int32_t node) const {
  const auto it = entries_.find(node);
  return it == entries_.end() ? nullptr : &it->second;
}

void AlphaClipStore::erase(int32_t node) {
  const auto it = entries_.find(node);
  if (it == entries_.end()) return;
  release(it->second);
  entries_.erase(it);
}

void AlphaClipStore::clear() {
  for (auto& [node, entry] : entries_) release(entry);
  entries_.clear();
}

AlphaClipStore& alphaClipStore() {
  static AlphaClipStore instancia;
  return instancia;
}

}  // namespace render
