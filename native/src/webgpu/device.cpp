// device — aquisição do GPUDevice e fábricas de recursos: shader module
// (WGSL) e render pipeline. Encoder/queue ficam em commands.cpp.

#include <webgpu/wgpu.h>

#include <cstdio>
#include <string>
#include <vector>

#include "../napi/napi_util.h"
#include "enums.h"
#include "internal.h"

namespace webgpu {
namespace {

struct DeviceResult {
  WGPUDevice device = nullptr;
  bool done = false;
};

void logUncapturedError(WGPUDevice const*, WGPUErrorType type,
                        WGPUStringView message, void*, void*) {
  std::fprintf(stderr, "[webgpu erro %d] %.*s\n", static_cast<int>(type),
               static_cast<int>(message.length), message.data);
}

// Aquisição síncrona (mesmo padrão do acquireAdapter — ver navigator.cpp).
WGPUDevice acquireDevice(HostGpu* gpu, WGPUAdapter adapter) {
  DeviceResult result;
  WGPUDeviceDescriptor desc = WGPU_DEVICE_DESCRIPTOR_INIT;
  // Erros não capturados (shader inválido, uso errado da API) viram log —
  // essencial pra depurar o que o JS pediu.
  desc.uncapturedErrorCallbackInfo.callback = logUncapturedError;
  WGPURequestDeviceCallbackInfo cb = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
  cb.mode = WGPUCallbackMode_AllowProcessEvents;
  cb.userdata1 = &result;
  cb.callback = [](WGPURequestDeviceStatus status, WGPUDevice device,
                   WGPUStringView message, void* userdata1, void*) {
    auto* r = static_cast<DeviceResult*>(userdata1);
    if (status == WGPURequestDeviceStatus_Success) {
      r->device = device;
    } else {
      std::fprintf(stderr, "requestDevice: %.*s\n",
                   static_cast<int>(message.length), message.data);
    }
    r->done = true;
  };
  wgpuAdapterRequestDevice(adapter, &desc, cb);
  while (!result.done) wgpuInstanceProcessEvents(gpu->instance);
  return result.device;
}

void finalizeShaderModule(napi_env, void* data, void*) {
  if (data) wgpuShaderModuleRelease(static_cast<WGPUShaderModule>(data));
}

void finalizePipeline(napi_env, void* data, void*) {
  if (data) wgpuRenderPipelineRelease(static_cast<WGPURenderPipeline>(data));
}

void finalizeBindGroupLayout(napi_env, void* data, void*) {
  if (data)
    wgpuBindGroupLayoutRelease(static_cast<WGPUBindGroupLayout>(data));
}

napi_value pipelineGetBindGroupLayout(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* pipeline = static_cast<WGPURenderPipeline>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pipeline || argc < 1) {
    njs::throwError(env, "getBindGroupLayout: índice obrigatório");
    return njs::undefined(env);
  }
  double index = 0;
  napi_get_value_double(env, args[0], &index);
  WGPUBindGroupLayout layout = wgpuRenderPipelineGetBindGroupLayout(
      pipeline, static_cast<uint32_t>(index));
  return njs::wrapHandle(env, layout, finalizeBindGroupLayout);
}

napi_value makePipelineObject(napi_env env, WGPURenderPipeline pipeline) {
  napi_value obj = njs::wrapHandle(env, pipeline, finalizePipeline);
  njs::setMethod(env, obj, "getBindGroupLayout", pipelineGetBindGroupLayout);
  return obj;
}

napi_value deviceCreateShaderModule(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createShaderModule: descriptor obrigatório");
    return njs::undefined(env);
  }
  std::string code = njs::getNamedString(env, args[0], "code", "");

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {code.data(), code.size()};
  WGPUShaderModuleDescriptor desc = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  desc.nextInChain = &wgsl.chain;
  WGPUShaderModule module = wgpuDeviceCreateShaderModule(device, &desc);
  return njs::wrapHandle(env, module, finalizeShaderModule);
}

// Storage dos layouts de vertex buffer — os arrays precisam viver até a
// chamada de criação do pipeline.
struct VertexLayoutStorage {
  std::vector<std::vector<WGPUVertexAttribute>> attributes;
  std::vector<WGPUVertexBufferLayout> layouts;
};

WGPUVertexAttribute parseVertexAttribute(napi_env env, napi_value attr) {
  WGPUVertexAttribute out = WGPU_VERTEX_ATTRIBUTE_INIT;
  out.format = vertexFormatFromString(
      njs::getNamedString(env, attr, "format", "float32x3"));
  out.offset =
      static_cast<uint64_t>(njs::getNamedNumber(env, attr, "offset", 0));
  out.shaderLocation = static_cast<uint32_t>(
      njs::getNamedNumber(env, attr, "shaderLocation", 0));
  return out;
}

void parseVertexBuffers(napi_env env, napi_value vertex,
                        WGPURenderPipelineDescriptor* desc,
                        VertexLayoutStorage* storage) {
  napi_value buffers = nullptr;
  if (!njs::getNamed(env, vertex, "buffers", &buffers)) return;
  uint32_t count = 0;
  napi_get_array_length(env, buffers, &count);
  for (uint32_t i = 0; i < count; ++i) {
    napi_value buffer = nullptr;
    napi_get_element(env, buffers, i, &buffer);

    std::vector<WGPUVertexAttribute> attrs;
    napi_value attrsValue = nullptr;
    if (njs::getNamed(env, buffer, "attributes", &attrsValue)) {
      uint32_t attrCount = 0;
      napi_get_array_length(env, attrsValue, &attrCount);
      for (uint32_t a = 0; a < attrCount; ++a) {
        napi_value attr = nullptr;
        napi_get_element(env, attrsValue, a, &attr);
        attrs.push_back(parseVertexAttribute(env, attr));
      }
    }
    storage->attributes.push_back(std::move(attrs));

    WGPUVertexBufferLayout layout = WGPU_VERTEX_BUFFER_LAYOUT_INIT;
    layout.arrayStride = static_cast<uint64_t>(
        njs::getNamedNumber(env, buffer, "arrayStride", 0));
    layout.attributeCount = storage->attributes.back().size();
    layout.attributes = storage->attributes.back().data();
    storage->layouts.push_back(layout);
  }
  desc->vertex.bufferCount = storage->layouts.size();
  desc->vertex.buffers = storage->layouts.data();
}

// Sub-parsers do descriptor de pipeline — as strings de entryPoint precisam
// viver até a chamada de criação, por isso são passadas por referência.
void parseVertexState(napi_env env, napi_value descriptor,
                      WGPURenderPipelineDescriptor* desc,
                      std::string* vsEntry, VertexLayoutStorage* storage) {
  napi_value vertex = nullptr;
  if (!njs::getNamed(env, descriptor, "vertex", &vertex)) return;
  napi_value module = nullptr;
  njs::getNamed(env, vertex, "module", &module);
  desc->vertex.module =
      static_cast<WGPUShaderModule>(njs::unwrapValue(env, module));
  *vsEntry = njs::getNamedString(env, vertex, "entryPoint", "");
  if (!vsEntry->empty())
    desc->vertex.entryPoint = {vsEntry->data(), vsEntry->size()};
  parseVertexBuffers(env, vertex, desc, storage);
}

bool parseFragmentState(napi_env env, napi_value descriptor,
                        WGPUFragmentState* fragment,
                        std::vector<WGPUColorTargetState>* targets,
                        std::string* fsEntry) {
  napi_value fragmentValue = nullptr;
  if (!njs::getNamed(env, descriptor, "fragment", &fragmentValue))
    return false;

  napi_value module = nullptr;
  njs::getNamed(env, fragmentValue, "module", &module);
  fragment->module =
      static_cast<WGPUShaderModule>(njs::unwrapValue(env, module));
  *fsEntry = njs::getNamedString(env, fragmentValue, "entryPoint", "");
  if (!fsEntry->empty())
    fragment->entryPoint = {fsEntry->data(), fsEntry->size()};

  napi_value targetsValue = nullptr;
  if (njs::getNamed(env, fragmentValue, "targets", &targetsValue)) {
    uint32_t count = 0;
    napi_get_array_length(env, targetsValue, &count);
    for (uint32_t i = 0; i < count; ++i) {
      napi_value target = nullptr;
      napi_get_element(env, targetsValue, i, &target);
      WGPUColorTargetState state = WGPU_COLOR_TARGET_STATE_INIT;
      state.format = formatFromString(
          njs::getNamedString(env, target, "format", "bgra8unorm"));
      targets->push_back(state);
    }
  }
  fragment->targetCount = targets->size();
  fragment->targets = targets->data();
  return true;
}

void parsePrimitiveState(napi_env env, napi_value descriptor,
                         WGPURenderPipelineDescriptor* desc) {
  napi_value primitive = nullptr;
  if (!njs::getNamed(env, descriptor, "primitive", &primitive)) return;
  desc->primitive.topology = topologyFromString(
      njs::getNamedString(env, primitive, "topology", "triangle-list"));
}

napi_value deviceCreateRenderPipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createRenderPipeline: descriptor obrigatório");
    return njs::undefined(env);
  }

  // layout: 'auto' → NULL (pipeline layout automático do WebGPU)
  WGPURenderPipelineDescriptor desc = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  std::string vsEntry;
  VertexLayoutStorage vertexStorage;
  parseVertexState(env, args[0], &desc, &vsEntry, &vertexStorage);

  WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
  std::vector<WGPUColorTargetState> targets;
  std::string fsEntry;
  if (parseFragmentState(env, args[0], &fragment, &targets, &fsEntry))
    desc.fragment = &fragment;

  parsePrimitiveState(env, args[0], &desc);

  WGPURenderPipeline pipeline = wgpuDeviceCreateRenderPipeline(device, &desc);
  return makePipelineObject(env, pipeline);
}

}  // namespace

napi_value makeDeviceObject(napi_env env, WGPUDevice device) {
  // device vive no HostGpu (o host libera no shutdown) — sem finalizer.
  napi_value obj = njs::wrapHandle(env, device, njs::finalizeNoop);
  njs::setMethod(env, obj, "createShaderModule", deviceCreateShaderModule);
  njs::setMethod(env, obj, "createRenderPipeline", deviceCreateRenderPipeline);
  njs::setMethod(env, obj, "createCommandEncoder", deviceCreateCommandEncoder);
  njs::setMethod(env, obj, "createBuffer", deviceCreateBuffer);
  njs::setMethod(env, obj, "createBindGroup", deviceCreateBindGroup);

  napi_value queue = njs::makeObject(env);
  njs::setMethod(env, queue, "submit", queueSubmit);
  njs::setMethod(env, queue, "writeBuffer", queueWriteBuffer);
  napi_set_named_property(env, obj, "queue", queue);
  return obj;
}

napi_value adapterRequestDevice(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* adapter =
      static_cast<WGPUAdapter>(njs::unwrapThis(env, info, &argc, nullptr));
  HostGpu* gpu = gpuState();
  if (!adapter || !gpu) {
    njs::throwError(env, "requestDevice: adapter inválido");
    return njs::undefined(env);
  }
  if (!gpu->device) {
    WGPUDevice device = acquireDevice(gpu, adapter);
    if (!device) {
      njs::throwError(env, "requestDevice falhou");
      return njs::undefined(env);
    }
    gpu->device = device;
    gpu->queue = wgpuDeviceGetQueue(device);
  }
  return njs::resolvedPromise(env, makeDeviceObject(env, gpu->device));
}

}  // namespace webgpu
