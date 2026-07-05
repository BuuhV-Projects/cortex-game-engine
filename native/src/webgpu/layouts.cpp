// layouts — bind group layouts e pipeline layouts EXPLÍCITOS (o Three não
// usa layout 'auto': ele declara visibility/tipos por binding).

#include <string>
#include <vector>

#include "../napi/napi_util.h"
#include "enums.h"
#include "internal.h"

namespace webgpu {
namespace {

void finalizeBindGroupLayout(napi_env, void* data, void*) {
  if (data)
    wgpuBindGroupLayoutRelease(static_cast<WGPUBindGroupLayout>(data));
}

void finalizePipelineLayout(napi_env, void* data, void*) {
  if (data) wgpuPipelineLayoutRelease(static_cast<WGPUPipelineLayout>(data));
}

WGPUBufferBindingType bufferBindingTypeFromString(const std::string& s) {
  if (s == "storage") return WGPUBufferBindingType_Storage;
  if (s == "read-only-storage") return WGPUBufferBindingType_ReadOnlyStorage;
  return WGPUBufferBindingType_Uniform;
}

WGPUSamplerBindingType samplerBindingTypeFromString(const std::string& s) {
  if (s == "non-filtering") return WGPUSamplerBindingType_NonFiltering;
  if (s == "comparison") return WGPUSamplerBindingType_Comparison;
  return WGPUSamplerBindingType_Filtering;
}

WGPUTextureSampleType textureSampleTypeFromString(const std::string& s) {
  if (s == "unfilterable-float")
    return WGPUTextureSampleType_UnfilterableFloat;
  if (s == "depth") return WGPUTextureSampleType_Depth;
  if (s == "sint") return WGPUTextureSampleType_Sint;
  if (s == "uint") return WGPUTextureSampleType_Uint;
  return WGPUTextureSampleType_Float;
}

// Uma entry: {binding, visibility, buffer|sampler|texture:{...}}
WGPUBindGroupLayoutEntry parseLayoutEntry(napi_env env, napi_value entry) {
  WGPUBindGroupLayoutEntry out = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
  out.binding =
      static_cast<uint32_t>(njs::getNamedNumber(env, entry, "binding", 0));
  out.visibility = static_cast<WGPUShaderStage>(
      njs::getNamedNumber(env, entry, "visibility", 0));

  napi_value buffer = nullptr;
  if (njs::getNamed(env, entry, "buffer", &buffer)) {
    out.buffer.type = bufferBindingTypeFromString(
        njs::getNamedString(env, buffer, "type", "uniform"));
    out.buffer.hasDynamicOffset =
        njs::getNamedBool(env, buffer, "hasDynamicOffset", false);
    return out;
  }

  napi_value sampler = nullptr;
  if (njs::getNamed(env, entry, "sampler", &sampler)) {
    out.sampler.type = samplerBindingTypeFromString(
        njs::getNamedString(env, sampler, "type", "filtering"));
    return out;
  }

  napi_value texture = nullptr;
  if (njs::getNamed(env, entry, "texture", &texture)) {
    out.texture.sampleType = textureSampleTypeFromString(
        njs::getNamedString(env, texture, "sampleType", "float"));
    out.texture.viewDimension = viewDimensionFromString(
        njs::getNamedString(env, texture, "viewDimension", "2d"));
    out.texture.multisampled =
        njs::getNamedBool(env, texture, "multisampled", false);
    return out;
  }
  return out;
}

}  // namespace

napi_value deviceCreateBindGroupLayout(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createBindGroupLayout: descriptor obrigatório");
    return njs::undefined(env);
  }

  std::vector<WGPUBindGroupLayoutEntry> entries;
  napi_value entriesValue = nullptr;
  if (njs::getNamed(env, args[0], "entries", &entriesValue)) {
    uint32_t count = 0;
    napi_get_array_length(env, entriesValue, &count);
    entries.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
      napi_value entry = nullptr;
      napi_get_element(env, entriesValue, i, &entry);
      entries.push_back(parseLayoutEntry(env, entry));
    }
  }

  WGPUBindGroupLayoutDescriptor desc = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
  desc.entryCount = entries.size();
  desc.entries = entries.data();
  WGPUBindGroupLayout layout = wgpuDeviceCreateBindGroupLayout(device, &desc);
  return njs::wrapHandle(env, layout, finalizeBindGroupLayout);
}

napi_value deviceCreatePipelineLayout(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createPipelineLayout: descriptor obrigatório");
    return njs::undefined(env);
  }

  std::vector<WGPUBindGroupLayout> layouts;
  napi_value layoutsValue = nullptr;
  if (njs::getNamed(env, args[0], "bindGroupLayouts", &layoutsValue)) {
    uint32_t count = 0;
    napi_get_array_length(env, layoutsValue, &count);
    layouts.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
      napi_value item = nullptr;
      napi_get_element(env, layoutsValue, i, &item);
      auto* layout =
          static_cast<WGPUBindGroupLayout>(njs::unwrapValue(env, item));
      if (layout) layouts.push_back(layout);
    }
  }

  WGPUPipelineLayoutDescriptor desc = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  desc.bindGroupLayoutCount = layouts.size();
  desc.bindGroupLayouts = layouts.data();
  WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(device, &desc);
  return njs::wrapHandle(env, layout, finalizePipelineLayout);
}

}  // namespace webgpu
