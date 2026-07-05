// buffers — recursos de DADOS da GPU: GPUBuffer (createBuffer/writeBuffer)
// e bind groups (createBindGroup). Também registra o global GPUBufferUsage
// (constantes numéricas idênticas às da spec WebGPU/webgpu.h).

#include <cstdint>
#include <vector>

#include "../napi/napi_util.h"
#include "internal.h"

namespace webgpu {
namespace {

void finalizeBuffer(napi_env, void* data, void*) {
  if (data) wgpuBufferRelease(static_cast<WGPUBuffer>(data));
}

void finalizeBindGroup(napi_env, void* data, void*) {
  if (data) wgpuBindGroupRelease(static_cast<WGPUBindGroup>(data));
}

// Extrai (ponteiro, tamanho) de um TypedArray ou ArrayBuffer JS.
bool getBytes(napi_env env, napi_value value, void** data, size_t* size) {
  bool isTypedArray = false;
  napi_is_typedarray(env, value, &isTypedArray);
  if (isTypedArray) {
    napi_typedarray_type type;
    size_t length = 0;
    napi_value arrayBuffer = nullptr;
    size_t byteOffset = 0;
    void* bufferData = nullptr;
    napi_get_typedarray_info(env, value, &type, &length, &bufferData,
                             &arrayBuffer, &byteOffset);
    size_t elementSize = 0;
    napi_value dummy = nullptr;
    (void)dummy;
    // byteLength = length * bytes/elemento; o Node-API já devolve o ponteiro
    // deslocado (bufferData aponta pro início da view).
    switch (type) {
      case napi_int8_array:
      case napi_uint8_array:
      case napi_uint8_clamped_array: elementSize = 1; break;
      case napi_int16_array:
      case napi_uint16_array: elementSize = 2; break;
      case napi_int32_array:
      case napi_uint32_array:
      case napi_float32_array: elementSize = 4; break;
      case napi_float64_array:
      case napi_bigint64_array:
      case napi_biguint64_array: elementSize = 8; break;
      default: elementSize = 1; break;
    }
    *data = bufferData;
    *size = length * elementSize;
    return true;
  }
  bool isArrayBuffer = false;
  napi_is_arraybuffer(env, value, &isArrayBuffer);
  if (isArrayBuffer) {
    return napi_get_arraybuffer_info(env, value, data, size) == napi_ok;
  }
  return false;
}

napi_value bufferDestroy(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* buffer =
      static_cast<WGPUBuffer>(njs::unwrapThis(env, info, &argc, nullptr));
  if (buffer) wgpuBufferDestroy(buffer);
  return njs::undefined(env);
}

WGPUBindGroupEntry parseBindGroupEntry(napi_env env, napi_value entry) {
  WGPUBindGroupEntry out = WGPU_BIND_GROUP_ENTRY_INIT;
  out.binding =
      static_cast<uint32_t>(njs::getNamedNumber(env, entry, "binding", 0));

  napi_value resource = nullptr;
  if (njs::getNamed(env, entry, "resource", &resource)) {
    napi_value bufferValue = nullptr;
    if (njs::getNamed(env, resource, "buffer", &bufferValue)) {
      out.buffer = static_cast<WGPUBuffer>(njs::unwrapValue(env, bufferValue));
      out.offset = static_cast<uint64_t>(
          njs::getNamedNumber(env, resource, "offset", 0));
      double size = njs::getNamedNumber(env, resource, "size", -1);
      out.size = size < 0 ? WGPU_WHOLE_SIZE : static_cast<uint64_t>(size);
    }
  }
  return out;
}

}  // namespace

napi_value deviceCreateBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createBuffer: descriptor obrigatório");
    return njs::undefined(env);
  }

  WGPUBufferDescriptor desc = WGPU_BUFFER_DESCRIPTOR_INIT;
  desc.size = static_cast<uint64_t>(
      njs::getNamedNumber(env, args[0], "size", 0));
  desc.usage = static_cast<WGPUBufferUsage>(
      njs::getNamedNumber(env, args[0], "usage", 0));

  WGPUBuffer buffer = wgpuDeviceCreateBuffer(device, &desc);
  napi_value obj = njs::wrapHandle(env, buffer, finalizeBuffer);
  njs::setMethod(env, obj, "destroy", bufferDestroy);
  return obj;
}

napi_value deviceCreateBindGroup(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createBindGroup: descriptor obrigatório");
    return njs::undefined(env);
  }

  napi_value layoutValue = nullptr;
  njs::getNamed(env, args[0], "layout", &layoutValue);
  auto* layout =
      static_cast<WGPUBindGroupLayout>(njs::unwrapValue(env, layoutValue));

  std::vector<WGPUBindGroupEntry> entries;
  napi_value entriesValue = nullptr;
  if (njs::getNamed(env, args[0], "entries", &entriesValue)) {
    uint32_t count = 0;
    napi_get_array_length(env, entriesValue, &count);
    entries.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
      napi_value entry = nullptr;
      napi_get_element(env, entriesValue, i, &entry);
      entries.push_back(parseBindGroupEntry(env, entry));
    }
  }

  WGPUBindGroupDescriptor desc = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  desc.layout = layout;
  desc.entryCount = entries.size();
  desc.entries = entries.data();
  WGPUBindGroup group = wgpuDeviceCreateBindGroup(device, &desc);
  return njs::wrapHandle(env, group, finalizeBindGroup);
}

napi_value queueWriteBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (argc < 3 || !gpu || !gpu->queue) {
    njs::throwError(env, "writeBuffer: (buffer, offset, data) obrigatórios");
    return njs::undefined(env);
  }

  auto* buffer = static_cast<WGPUBuffer>(njs::unwrapValue(env, args[0]));
  double offset = 0;
  napi_get_value_double(env, args[1], &offset);
  void* data = nullptr;
  size_t size = 0;
  if (buffer && getBytes(env, args[2], &data, &size) && size > 0) {
    wgpuQueueWriteBuffer(gpu->queue, buffer, static_cast<uint64_t>(offset),
                         data, size);
  }
  return njs::undefined(env);
}

void registerBufferUsageGlobals(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);

  // Valores da spec WebGPU — idênticos aos WGPUBufferUsage_* do webgpu.h.
  const struct {
    const char* name;
    uint32_t value;
  } kUsages[] = {
      {"MAP_READ", 0x0001},   {"MAP_WRITE", 0x0002}, {"COPY_SRC", 0x0004},
      {"COPY_DST", 0x0008},   {"INDEX", 0x0010},     {"VERTEX", 0x0020},
      {"UNIFORM", 0x0040},    {"STORAGE", 0x0080},   {"INDIRECT", 0x0100},
      {"QUERY_RESOLVE", 0x0200},
  };
  napi_value usage = njs::makeObject(env);
  for (const auto& entry : kUsages) {
    napi_value value = nullptr;
    napi_create_uint32(env, entry.value, &value);
    napi_set_named_property(env, usage, entry.name, value);
  }
  napi_set_named_property(env, global, "GPUBufferUsage", usage);
}

}  // namespace webgpu
