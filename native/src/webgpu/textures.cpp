// textures — recursos de IMAGEM da GPU: GPUTexture (createTexture, views com
// descriptor — depth do Three sai daqui) e GPUSampler. Objetos de view e
// sampler recebem a marca `__kind` pra o parseBindGroupEntry (buffers.cpp)
// distinguir o tipo do resource sem RTTI através do napi_wrap.

#include <cstdint>
#include <string>

#include "../napi/napi_util.h"
#include "enums.h"
#include "internal.h"

namespace webgpu {
namespace {

void finalizeTexture(napi_env, void* data, void*) {
  if (data) wgpuTextureRelease(static_cast<WGPUTexture>(data));
}

void finalizeTextureView(napi_env, void* data, void*) {
  if (data) wgpuTextureViewRelease(static_cast<WGPUTextureView>(data));
}

void finalizeSampler(napi_env, void* data, void*) {
  if (data) wgpuSamplerRelease(static_cast<WGPUSampler>(data));
}

void setKind(napi_env env, napi_value obj, const char* kind) {
  napi_value value = nullptr;
  napi_create_string_utf8(env, kind, NAPI_AUTO_LENGTH, &value);
  napi_set_named_property(env, obj, "__kind", value);
}

// size: {width, height, depthOrArrayLayers?} ou [w, h, d?]
WGPUExtent3D parseExtent(napi_env env, napi_value size) {
  WGPUExtent3D out = {1, 1, 1};
  bool isArray = false;
  napi_is_array(env, size, &isArray);
  if (isArray) {
    uint32_t values[3] = {1, 1, 1};
    for (uint32_t i = 0; i < 3; ++i) {
      napi_value element = nullptr;
      if (napi_get_element(env, size, i, &element) == napi_ok) {
        double v = 0;
        if (napi_get_value_double(env, element, &v) == napi_ok && v > 0)
          values[i] = static_cast<uint32_t>(v);
      }
    }
    out = {values[0], values[1], values[2]};
  } else {
    out.width = static_cast<uint32_t>(
        njs::getNamedNumber(env, size, "width", 1));
    out.height = static_cast<uint32_t>(
        njs::getNamedNumber(env, size, "height", 1));
    out.depthOrArrayLayers = static_cast<uint32_t>(
        njs::getNamedNumber(env, size, "depthOrArrayLayers", 1));
  }
  return out;
}

napi_value textureCreateViewWithDescriptor(napi_env env,
                                           napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* texture =
      static_cast<WGPUTexture>(njs::unwrapThis(env, info, &argc, args));
  if (!texture) return njs::undefined(env);

  WGPUTextureView view = nullptr;
  if (argc >= 1) {
    WGPUTextureViewDescriptor desc = WGPU_TEXTURE_VIEW_DESCRIPTOR_INIT;
    std::string format = njs::getNamedString(env, args[0], "format", "");
    if (!format.empty()) desc.format = formatFromString(format);
    std::string dimension =
        njs::getNamedString(env, args[0], "dimension", "");
    if (!dimension.empty())
      desc.dimension = viewDimensionFromString(dimension);
    desc.aspect =
        aspectFromString(njs::getNamedString(env, args[0], "aspect", "all"));
    desc.baseMipLevel = static_cast<uint32_t>(
        njs::getNamedNumber(env, args[0], "baseMipLevel", 0));
    double mipCount = njs::getNamedNumber(env, args[0], "mipLevelCount", -1);
    if (mipCount >= 0) desc.mipLevelCount = static_cast<uint32_t>(mipCount);
    desc.baseArrayLayer = static_cast<uint32_t>(
        njs::getNamedNumber(env, args[0], "baseArrayLayer", 0));
    double layerCount =
        njs::getNamedNumber(env, args[0], "arrayLayerCount", -1);
    if (layerCount >= 0)
      desc.arrayLayerCount = static_cast<uint32_t>(layerCount);
    view = wgpuTextureCreateView(texture, &desc);
  } else {
    view = wgpuTextureCreateView(texture, nullptr);
  }

  napi_value obj = njs::wrapHandle(env, view, finalizeTextureView);
  setKind(env, obj, "texture-view");
  return obj;
}

napi_value textureDestroy(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* texture =
      static_cast<WGPUTexture>(njs::unwrapThis(env, info, &argc, nullptr));
  if (texture) wgpuTextureDestroy(texture);
  return njs::undefined(env);
}

}  // namespace

napi_value makeTextureViewMethods(napi_env env, napi_value textureObj) {
  njs::setMethod(env, textureObj, "createView",
                 textureCreateViewWithDescriptor);
  njs::setMethod(env, textureObj, "destroy", textureDestroy);
  return textureObj;
}

napi_value deviceCreateTexture(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createTexture: descriptor obrigatório");
    return njs::undefined(env);
  }

  WGPUTextureDescriptor desc = WGPU_TEXTURE_DESCRIPTOR_INIT;
  napi_value size = nullptr;
  if (njs::getNamed(env, args[0], "size", &size))
    desc.size = parseExtent(env, size);
  desc.format =
      formatFromString(njs::getNamedString(env, args[0], "format", ""));
  desc.usage = static_cast<WGPUTextureUsage>(
      njs::getNamedNumber(env, args[0], "usage", 0));
  desc.sampleCount = static_cast<uint32_t>(
      njs::getNamedNumber(env, args[0], "sampleCount", 1));
  desc.mipLevelCount = static_cast<uint32_t>(
      njs::getNamedNumber(env, args[0], "mipLevelCount", 1));
  std::string dimension =
      njs::getNamedString(env, args[0], "dimension", "2d");
  if (dimension == "1d") desc.dimension = WGPUTextureDimension_1D;
  else if (dimension == "3d") desc.dimension = WGPUTextureDimension_3D;
  else desc.dimension = WGPUTextureDimension_2D;

  WGPUTexture texture = wgpuDeviceCreateTexture(device, &desc);
  napi_value obj = njs::wrapHandle(env, texture, finalizeTexture);
  return makeTextureViewMethods(env, obj);
}

napi_value deviceCreateSampler(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device) return njs::undefined(env);

  WGPUSamplerDescriptor desc = WGPU_SAMPLER_DESCRIPTOR_INIT;
  if (argc >= 1) {
    desc.magFilter = filterModeFromString(
        njs::getNamedString(env, args[0], "magFilter", "nearest"));
    desc.minFilter = filterModeFromString(
        njs::getNamedString(env, args[0], "minFilter", "nearest"));
    desc.mipmapFilter = mipmapFilterFromString(
        njs::getNamedString(env, args[0], "mipmapFilter", "nearest"));
    desc.addressModeU = addressModeFromString(
        njs::getNamedString(env, args[0], "addressModeU", "clamp-to-edge"));
    desc.addressModeV = addressModeFromString(
        njs::getNamedString(env, args[0], "addressModeV", "clamp-to-edge"));
    desc.addressModeW = addressModeFromString(
        njs::getNamedString(env, args[0], "addressModeW", "clamp-to-edge"));
    std::string compare = njs::getNamedString(env, args[0], "compare", "");
    if (!compare.empty()) desc.compare = compareFromString(compare);
    desc.maxAnisotropy = static_cast<uint16_t>(
        njs::getNamedNumber(env, args[0], "maxAnisotropy", 1));
  }

  WGPUSampler sampler = wgpuDeviceCreateSampler(device, &desc);
  napi_value obj = njs::wrapHandle(env, sampler, finalizeSampler);
  setKind(env, obj, "sampler");
  return obj;
}

}  // namespace webgpu
