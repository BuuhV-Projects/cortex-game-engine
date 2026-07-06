// pipeline — shader modules (WGSL) e render pipelines. O descriptor grande
// do createRenderPipeline é repartido em sub-parsers por sub-estado
// (vertex/fragment/primitive/depthStencil/multisample/layout).

#include <string>
#include <vector>

#include "../napi/napi_util.h"
#include "enums.h"
#include "internal.h"

namespace webgpu {
namespace {

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

// ── sub-parsers do descriptor ───────────────────────────────────────────────
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
    layout.stepMode = stepModeFromString(
        njs::getNamedString(env, buffer, "stepMode", "vertex"));
    layout.attributeCount = storage->attributes.back().size();
    layout.attributes = storage->attributes.back().data();
    storage->layouts.push_back(layout);
  }
  desc->vertex.bufferCount = storage->layouts.size();
  desc->vertex.buffers = storage->layouts.data();
}

// As strings de entryPoint precisam viver até a chamada de criação, por isso
// são passadas por referência de fora.
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

// blend: {color:{srcFactor,dstFactor,operation}, alpha:{...}} (spec WebGPU)
WGPUBlendComponent parseBlendComponent(napi_env env, napi_value blend,
                                       const char* name) {
  WGPUBlendComponent out = WGPU_BLEND_COMPONENT_INIT;
  napi_value component = nullptr;
  if (!njs::getNamed(env, blend, name, &component)) return out;
  out.srcFactor = blendFactorFromString(
      njs::getNamedString(env, component, "srcFactor", "one"));
  out.dstFactor = blendFactorFromString(
      njs::getNamedString(env, component, "dstFactor", "zero"));
  out.operation = blendOperationFromString(
      njs::getNamedString(env, component, "operation", "add"));
  return out;
}

bool parseFragmentState(napi_env env, napi_value descriptor,
                        WGPUFragmentState* fragment,
                        std::vector<WGPUColorTargetState>* targets,
                        std::vector<WGPUBlendState>* blends,
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
    // blends é pré-alocado pra não invalidar os ponteiros já guardados.
    blends->reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
      napi_value target = nullptr;
      napi_get_element(env, targetsValue, i, &target);
      WGPUColorTargetState state = WGPU_COLOR_TARGET_STATE_INIT;
      state.format = formatFromString(
          njs::getNamedString(env, target, "format", "bgra8unorm"));
      double writeMask = njs::getNamedNumber(env, target, "writeMask", -1);
      if (writeMask >= 0)
        state.writeMask = static_cast<WGPUColorWriteMask>(writeMask);
      napi_value blend = nullptr;
      if (njs::getNamed(env, target, "blend", &blend)) {
        WGPUBlendState blendState;
        blendState.color = parseBlendComponent(env, blend, "color");
        blendState.alpha = parseBlendComponent(env, blend, "alpha");
        blends->push_back(blendState);
        state.blend = &blends->back();
      }
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
  desc->primitive.cullMode = cullModeFromString(
      njs::getNamedString(env, primitive, "cullMode", "none"));
  desc->primitive.frontFace = frontFaceFromString(
      njs::getNamedString(env, primitive, "frontFace", "ccw"));
  std::string stripIndex =
      njs::getNamedString(env, primitive, "stripIndexFormat", "");
  if (!stripIndex.empty())
    desc->primitive.stripIndexFormat = indexFormatFromString(stripIndex);
}

bool parseDepthStencilState(napi_env env, napi_value descriptor,
                            WGPUDepthStencilState* out) {
  napi_value depthStencil = nullptr;
  if (!njs::getNamed(env, descriptor, "depthStencil", &depthStencil))
    return false;
  out->format = formatFromString(
      njs::getNamedString(env, depthStencil, "format", "depth24plus"));
  out->depthWriteEnabled =
      njs::getNamedBool(env, depthStencil, "depthWriteEnabled", false)
          ? WGPUOptionalBool_True
          : WGPUOptionalBool_False;
  out->depthCompare = compareFromString(
      njs::getNamedString(env, depthStencil, "depthCompare", "less"));
  out->depthBias = static_cast<int32_t>(
      njs::getNamedNumber(env, depthStencil, "depthBias", 0));
  out->depthBiasSlopeScale = static_cast<float>(
      njs::getNamedNumber(env, depthStencil, "depthBiasSlopeScale", 0));
  out->depthBiasClamp = static_cast<float>(
      njs::getNamedNumber(env, depthStencil, "depthBiasClamp", 0));
  return true;
}

void parseMultisampleState(napi_env env, napi_value descriptor,
                           WGPURenderPipelineDescriptor* desc) {
  napi_value multisample = nullptr;
  if (!njs::getNamed(env, descriptor, "multisample", &multisample)) return;
  desc->multisample.count = static_cast<uint32_t>(
      njs::getNamedNumber(env, multisample, "count", 1));
}

// layout: 'auto' (string) → NULL; objeto → WGPUPipelineLayout embrulhado
void parsePipelineLayout(napi_env env, napi_value descriptor,
                         WGPURenderPipelineDescriptor* desc) {
  napi_value layout = nullptr;
  if (!njs::getNamed(env, descriptor, "layout", &layout)) return;
  napi_valuetype type = napi_undefined;
  napi_typeof(env, layout, &type);
  if (type == napi_object) {
    desc->layout =
        static_cast<WGPUPipelineLayout>(njs::unwrapValue(env, layout));
  }
}

}  // namespace

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

napi_value deviceCreateRenderPipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createRenderPipeline: descriptor obrigatório");
    return njs::undefined(env);
  }

  WGPURenderPipelineDescriptor desc = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  parsePipelineLayout(env, args[0], &desc);
  std::string vsEntry;
  VertexLayoutStorage vertexStorage;
  parseVertexState(env, args[0], &desc, &vsEntry, &vertexStorage);

  WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
  std::vector<WGPUColorTargetState> targets;
  std::vector<WGPUBlendState> blends;
  std::string fsEntry;
  if (parseFragmentState(env, args[0], &fragment, &targets, &blends, &fsEntry))
    desc.fragment = &fragment;

  parsePrimitiveState(env, args[0], &desc);
  WGPUDepthStencilState depthStencil = WGPU_DEPTH_STENCIL_STATE_INIT;
  if (parseDepthStencilState(env, args[0], &depthStencil))
    desc.depthStencil = &depthStencil;
  parseMultisampleState(env, args[0], &desc);

  WGPURenderPipeline pipeline = wgpuDeviceCreateRenderPipeline(device, &desc);
  return makePipelineObject(env, pipeline);
}

/** Versão async da spec — no host a criação é síncrona; devolve Promise. */
napi_value deviceCreateRenderPipelineAsync(napi_env env,
                                           napi_callback_info info) {
  return njs::resolvedPromise(env, deviceCreateRenderPipeline(env, info));
}

// ── compute pipelines (renderer.compute/TSL compute dos jogos) ─────────────

napi_value deviceCreateComputePipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createComputePipeline: descriptor obrigatório");
    return njs::undefined(env);
  }

  WGPUComputePipelineDescriptor desc = WGPU_COMPUTE_PIPELINE_DESCRIPTOR_INIT;
  // layout: 'auto' → NULL; objeto → unwrap (mesma regra do render pipeline)
  napi_value layout = nullptr;
  if (njs::getNamed(env, args[0], "layout", &layout)) {
    napi_valuetype type = napi_undefined;
    napi_typeof(env, layout, &type);
    if (type == napi_object)
      desc.layout = static_cast<WGPUPipelineLayout>(njs::unwrapValue(env, layout));
  }
  std::string entry;
  napi_value compute = nullptr;
  if (njs::getNamed(env, args[0], "compute", &compute)) {
    napi_value module = nullptr;
    njs::getNamed(env, compute, "module", &module);
    desc.compute.module =
        static_cast<WGPUShaderModule>(njs::unwrapValue(env, module));
    entry = njs::getNamedString(env, compute, "entryPoint", "");
    if (!entry.empty()) desc.compute.entryPoint = {entry.data(), entry.size()};
  }

  WGPUComputePipeline pipeline =
      wgpuDeviceCreateComputePipeline(device, &desc);
  napi_value obj = njs::wrapHandle(env, pipeline, [](napi_env, void* d, void*) {
    if (d) wgpuComputePipelineRelease(static_cast<WGPUComputePipeline>(d));
  });
  njs::setMethod(env, obj, "getBindGroupLayout", [](napi_env e, napi_callback_info i) -> napi_value {
    size_t ac = 1;
    napi_value av[1];
    auto* p = static_cast<WGPUComputePipeline>(njs::unwrapThis(e, i, &ac, av));
    double index = 0;
    if (ac >= 1) napi_get_value_double(e, av[0], &index);
    if (!p) return njs::undefined(e);
    WGPUBindGroupLayout l = wgpuComputePipelineGetBindGroupLayout(
        p, static_cast<uint32_t>(index));
    return njs::wrapHandle(e, l, [](napi_env, void* d, void*) {
      if (d) wgpuBindGroupLayoutRelease(static_cast<WGPUBindGroupLayout>(d));
    });
  });
  napi_value marker = nullptr;
  napi_get_boolean(env, true, &marker);
  napi_set_named_property(env, obj, "__isComputePipeline", marker);
  return obj;
}

napi_value deviceCreateComputePipelineAsync(napi_env env,
                                            napi_callback_info info) {
  return njs::resolvedPromise(env, deviceCreateComputePipeline(env, info));
}

}  // namespace webgpu
