// commands — gravação e submissão de trabalho de GPU: command encoder,
// render pass e queue.submit.

#include <cstdint>
#include <vector>

#include "../napi/napi_util.h"
#include "enums.h"
#include "internal.h"

namespace webgpu {
namespace {

void finalizeEncoder(napi_env, void* data, void*) {
  if (data) wgpuCommandEncoderRelease(static_cast<WGPUCommandEncoder>(data));
}

void finalizeCommandBuffer(napi_env, void* data, void*) {
  if (data) wgpuCommandBufferRelease(static_cast<WGPUCommandBuffer>(data));
}

void finalizePass(napi_env, void* data, void*) {
  if (data)
    wgpuRenderPassEncoderRelease(static_cast<WGPURenderPassEncoder>(data));
}

// ── render pass: parsing do descriptor ──────────────────────────────────────

WGPUColor parseClearValue(napi_env env, napi_value clear) {
  double rgba[4] = {0, 0, 0, 1};
  bool isArray = false;
  napi_is_array(env, clear, &isArray);
  if (isArray) {
    for (uint32_t c = 0; c < 4; ++c) {
      napi_value channel = nullptr;
      if (napi_get_element(env, clear, c, &channel) == napi_ok)
        napi_get_value_double(env, channel, &rgba[c]);
    }
  } else {
    rgba[0] = njs::getNamedNumber(env, clear, "r", 0);
    rgba[1] = njs::getNamedNumber(env, clear, "g", 0);
    rgba[2] = njs::getNamedNumber(env, clear, "b", 0);
    rgba[3] = njs::getNamedNumber(env, clear, "a", 1);
  }
  return {rgba[0], rgba[1], rgba[2], rgba[3]};
}

WGPURenderPassColorAttachment parseColorAttachment(napi_env env,
                                                   napi_value att) {
  WGPURenderPassColorAttachment out = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  napi_value view = nullptr;
  if (njs::getNamed(env, att, "view", &view))
    out.view = static_cast<WGPUTextureView>(njs::unwrapValue(env, view));
  out.loadOp =
      loadOpFromString(njs::getNamedString(env, att, "loadOp", "clear"));
  out.storeOp =
      storeOpFromString(njs::getNamedString(env, att, "storeOp", "store"));
  napi_value clear = nullptr;
  if (njs::getNamed(env, att, "clearValue", &clear))
    out.clearValue = parseClearValue(env, clear);
  return out;
}

// depthStencilAttachment: {view, depthClearValue, depthLoadOp, depthStoreOp,
// stencilLoadOp?, stencilStoreOp?}
bool parseDepthStencilAttachment(napi_env env, napi_value descriptor,
                                 WGPURenderPassDepthStencilAttachment* out) {
  napi_value att = nullptr;
  if (!njs::getNamed(env, descriptor, "depthStencilAttachment", &att))
    return false;
  napi_value view = nullptr;
  if (njs::getNamed(env, att, "view", &view))
    out->view = static_cast<WGPUTextureView>(njs::unwrapValue(env, view));
  out->depthClearValue = static_cast<float>(
      njs::getNamedNumber(env, att, "depthClearValue", 1.0));
  std::string depthLoad = njs::getNamedString(env, att, "depthLoadOp", "");
  if (!depthLoad.empty()) out->depthLoadOp = loadOpFromString(depthLoad);
  std::string depthStore = njs::getNamedString(env, att, "depthStoreOp", "");
  if (!depthStore.empty()) out->depthStoreOp = storeOpFromString(depthStore);
  std::string stencilLoad =
      njs::getNamedString(env, att, "stencilLoadOp", "");
  if (!stencilLoad.empty()) {
    out->stencilLoadOp = loadOpFromString(stencilLoad);
    out->stencilClearValue = static_cast<uint32_t>(
        njs::getNamedNumber(env, att, "stencilClearValue", 0));
  }
  std::string stencilStore =
      njs::getNamedString(env, att, "stencilStoreOp", "");
  if (!stencilStore.empty())
    out->stencilStoreOp = storeOpFromString(stencilStore);
  return true;
}

std::vector<WGPURenderPassColorAttachment> parseColorAttachments(
    napi_env env, napi_value descriptor) {
  std::vector<WGPURenderPassColorAttachment> out;
  napi_value attachments = nullptr;
  if (!njs::getNamed(env, descriptor, "colorAttachments", &attachments))
    return out;
  uint32_t count = 0;
  napi_get_array_length(env, attachments, &count);
  out.reserve(count);
  for (uint32_t i = 0; i < count; ++i) {
    napi_value att = nullptr;
    napi_get_element(env, attachments, i, &att);
    out.push_back(parseColorAttachment(env, att));
  }
  return out;
}

// ── render pass: métodos ────────────────────────────────────────────────────

napi_value passSetPipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (pass && argc >= 1) {
    auto* pipeline =
        static_cast<WGPURenderPipeline>(njs::unwrapValue(env, args[0]));
    if (pipeline) wgpuRenderPassEncoderSetPipeline(pass, pipeline);
  }
  return njs::undefined(env);
}

napi_value passDraw(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pass || argc < 1) return njs::undefined(env);
  // vértices, instâncias, 1º vértice, 1ª instância
  uint32_t counts[4] = {0, 1, 0, 0};
  for (size_t i = 0; i < argc && i < 4; ++i) {
    double value = 0;
    if (napi_get_value_double(env, args[i], &value) == napi_ok)
      counts[i] = static_cast<uint32_t>(value);
  }
  wgpuRenderPassEncoderDraw(pass, counts[0], counts[1], counts[2], counts[3]);
  return njs::undefined(env);
}

napi_value passSetBindGroup(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (pass && argc >= 2) {
    double index = 0;
    napi_get_value_double(env, args[0], &index);
    auto* group = static_cast<WGPUBindGroup>(njs::unwrapValue(env, args[1]));
    if (group) {
      wgpuRenderPassEncoderSetBindGroup(
          pass, static_cast<uint32_t>(index), group, 0, nullptr);
    }
  }
  return njs::undefined(env);
}

napi_value passSetVertexBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (pass && argc >= 2) {
    double slot = 0;
    napi_get_value_double(env, args[0], &slot);
    auto* buffer = static_cast<WGPUBuffer>(njs::unwrapValue(env, args[1]));
    double offset = 0;
    if (argc >= 3) napi_get_value_double(env, args[2], &offset);
    if (buffer) {
      wgpuRenderPassEncoderSetVertexBuffer(
          pass, static_cast<uint32_t>(slot), buffer,
          static_cast<uint64_t>(offset), WGPU_WHOLE_SIZE);
    }
  }
  return njs::undefined(env);
}

napi_value passSetIndexBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pass || argc < 2) return njs::undefined(env);
  auto* buffer = static_cast<WGPUBuffer>(njs::unwrapValue(env, args[0]));
  WGPUIndexFormat format =
      indexFormatFromString(njs::toString(env, args[1]));
  double offset = 0;
  if (argc >= 3) napi_get_value_double(env, args[2], &offset);
  if (buffer) {
    wgpuRenderPassEncoderSetIndexBuffer(pass, buffer, format,
                                        static_cast<uint64_t>(offset),
                                        WGPU_WHOLE_SIZE);
  }
  return njs::undefined(env);
}

napi_value passDrawIndexed(napi_env env, napi_callback_info info) {
  size_t argc = 5;
  napi_value args[5];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pass || argc < 1) return njs::undefined(env);
  // indexCount, instanceCount, firstIndex, baseVertex, firstInstance
  double values[5] = {0, 1, 0, 0, 0};
  for (size_t i = 0; i < argc && i < 5; ++i)
    napi_get_value_double(env, args[i], &values[i]);
  wgpuRenderPassEncoderDrawIndexed(
      pass, static_cast<uint32_t>(values[0]),
      static_cast<uint32_t>(values[1]), static_cast<uint32_t>(values[2]),
      static_cast<int32_t>(values[3]), static_cast<uint32_t>(values[4]));
  return njs::undefined(env);
}

napi_value passSetViewport(napi_env env, napi_callback_info info) {
  size_t argc = 6;
  napi_value args[6];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pass || argc < 6) return njs::undefined(env);
  double v[6] = {0, 0, 0, 0, 0, 1};
  for (size_t i = 0; i < 6; ++i) napi_get_value_double(env, args[i], &v[i]);
  wgpuRenderPassEncoderSetViewport(
      pass, static_cast<float>(v[0]), static_cast<float>(v[1]),
      static_cast<float>(v[2]), static_cast<float>(v[3]),
      static_cast<float>(v[4]), static_cast<float>(v[5]));
  return njs::undefined(env);
}

napi_value passSetScissorRect(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pass || argc < 4) return njs::undefined(env);
  double v[4] = {0, 0, 0, 0};
  for (size_t i = 0; i < 4; ++i) napi_get_value_double(env, args[i], &v[i]);
  wgpuRenderPassEncoderSetScissorRect(
      pass, static_cast<uint32_t>(v[0]), static_cast<uint32_t>(v[1]),
      static_cast<uint32_t>(v[2]), static_cast<uint32_t>(v[3]));
  return njs::undefined(env);
}

napi_value passEnd(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, nullptr));
  if (pass) wgpuRenderPassEncoderEnd(pass);
  return njs::undefined(env);
}

napi_value makePassObject(napi_env env, WGPURenderPassEncoder pass) {
  napi_value obj = njs::wrapHandle(env, pass, finalizePass);
  njs::setMethod(env, obj, "setPipeline", passSetPipeline);
  njs::setMethod(env, obj, "setBindGroup", passSetBindGroup);
  njs::setMethod(env, obj, "setVertexBuffer", passSetVertexBuffer);
  njs::setMethod(env, obj, "setIndexBuffer", passSetIndexBuffer);
  njs::setMethod(env, obj, "setViewport", passSetViewport);
  njs::setMethod(env, obj, "setScissorRect", passSetScissorRect);
  njs::setMethod(env, obj, "draw", passDraw);
  njs::setMethod(env, obj, "drawIndexed", passDrawIndexed);
  njs::setMethod(env, obj, "end", passEnd);
  return obj;
}

// ── encoder: métodos ────────────────────────────────────────────────────────

napi_value encoderBeginRenderPass(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* encoder = static_cast<WGPUCommandEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!encoder || argc < 1) {
    njs::throwError(env, "beginRenderPass: descriptor obrigatório");
    return njs::undefined(env);
  }

  std::vector<WGPURenderPassColorAttachment> attachments =
      parseColorAttachments(env, args[0]);
  if (attachments.empty()) {
    njs::throwError(env, "beginRenderPass: colorAttachments obrigatório");
    return njs::undefined(env);
  }

  WGPURenderPassDescriptor desc = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  desc.colorAttachmentCount = attachments.size();
  desc.colorAttachments = attachments.data();
  WGPURenderPassDepthStencilAttachment depthAttachment =
      WGPU_RENDER_PASS_DEPTH_STENCIL_ATTACHMENT_INIT;
  if (parseDepthStencilAttachment(env, args[0], &depthAttachment))
    desc.depthStencilAttachment = &depthAttachment;
  WGPURenderPassEncoder pass =
      wgpuCommandEncoderBeginRenderPass(encoder, &desc);
  return makePassObject(env, pass);
}

napi_value encoderFinish(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* encoder = static_cast<WGPUCommandEncoder>(
      njs::unwrapThis(env, info, &argc, nullptr));
  if (!encoder) return njs::undefined(env);
  WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, nullptr);
  return njs::wrapHandle(env, commands, finalizeCommandBuffer);
}

std::vector<WGPUCommandBuffer> collectCommandBuffers(napi_env env,
                                                     napi_value array) {
  std::vector<WGPUCommandBuffer> out;
  uint32_t count = 0;
  napi_get_array_length(env, array, &count);
  out.reserve(count);
  for (uint32_t i = 0; i < count; ++i) {
    napi_value item = nullptr;
    napi_get_element(env, array, i, &item);
    auto* buffer = static_cast<WGPUCommandBuffer>(njs::unwrapValue(env, item));
    if (buffer) out.push_back(buffer);
  }
  return out;
}

}  // namespace

napi_value deviceCreateCommandEncoder(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, nullptr));
  if (!device) return njs::undefined(env);
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, nullptr);
  napi_value obj = njs::wrapHandle(env, encoder, finalizeEncoder);
  njs::setMethod(env, obj, "beginRenderPass", encoderBeginRenderPass);
  njs::setMethod(env, obj, "finish", encoderFinish);
  return obj;
}

napi_value queueSubmit(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (argc < 1 || !gpu || !gpu->queue) return njs::undefined(env);

  std::vector<WGPUCommandBuffer> buffers = collectCommandBuffers(env, args[0]);
  if (!buffers.empty())
    wgpuQueueSubmit(gpu->queue, buffers.size(), buffers.data());
  return njs::undefined(env);
}

}  // namespace webgpu
