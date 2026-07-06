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
  // resolveTarget: MSAA. Com antialias, o Three renderiza numa textura
  // multisampled (view) e RESOLVE pro swapchain (resolveTarget) no fim do
  // pass. Sem parsear isto, o antialias vira no-op → serrilhado.
  napi_value resolve = nullptr;
  if (njs::getNamed(env, att, "resolveTarget", &resolve))
    out.resolveTarget =
        static_cast<WGPUTextureView>(njs::unwrapValue(env, resolve));
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

// executeBundles(bundles[]) — o three usa pra mipmaps (render bundles).
napi_value passExecuteBundles(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* pass = static_cast<WGPURenderPassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pass || argc < 1) return njs::undefined(env);
  uint32_t count = 0;
  napi_get_array_length(env, args[0], &count);
  std::vector<WGPURenderBundle> bundles;
  bundles.reserve(count);
  for (uint32_t i = 0; i < count; ++i) {
    napi_value item = nullptr;
    napi_get_element(env, args[0], i, &item);
    auto* bundle = static_cast<WGPURenderBundle>(njs::unwrapValue(env, item));
    if (bundle) bundles.push_back(bundle);
  }
  if (!bundles.empty())
    wgpuRenderPassEncoderExecuteBundles(pass, bundles.size(), bundles.data());
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
  njs::setMethod(env, obj, "executeBundles", passExecuteBundles);
  njs::setMethod(env, obj, "end", passEnd);
  return obj;
}

// ── render bundle encoder (grava comandos reutilizáveis; mipmaps do three) ──

void finalizeRenderBundle(napi_env, void* data, void*) {
  if (data) wgpuRenderBundleRelease(static_cast<WGPURenderBundle>(data));
}

napi_value bundleFinish(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* enc = static_cast<WGPURenderBundleEncoder>(
      njs::unwrapThis(env, info, &argc, nullptr));
  if (!enc) return njs::undefined(env);
  WGPURenderBundle bundle = wgpuRenderBundleEncoderFinish(enc, nullptr);
  return njs::wrapHandle(env, bundle, finalizeRenderBundle);
}

napi_value bundleSetPipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* enc = static_cast<WGPURenderBundleEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (enc && argc >= 1) {
    auto* p = static_cast<WGPURenderPipeline>(njs::unwrapValue(env, args[0]));
    if (p) wgpuRenderBundleEncoderSetPipeline(enc, p);
  }
  return njs::undefined(env);
}

napi_value bundleSetBindGroup(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  auto* enc = static_cast<WGPURenderBundleEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (enc && argc >= 2) {
    double index = 0;
    napi_get_value_double(env, args[0], &index);
    auto* g = static_cast<WGPUBindGroup>(njs::unwrapValue(env, args[1]));
    if (g)
      wgpuRenderBundleEncoderSetBindGroup(enc, static_cast<uint32_t>(index), g,
                                          0, nullptr);
  }
  return njs::undefined(env);
}

napi_value bundleSetVertexBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  auto* enc = static_cast<WGPURenderBundleEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (enc && argc >= 2) {
    double slot = 0, offset = 0;
    napi_get_value_double(env, args[0], &slot);
    auto* b = static_cast<WGPUBuffer>(njs::unwrapValue(env, args[1]));
    if (argc >= 3) napi_get_value_double(env, args[2], &offset);
    if (b)
      wgpuRenderBundleEncoderSetVertexBuffer(enc, static_cast<uint32_t>(slot),
                                             b, static_cast<uint64_t>(offset),
                                             WGPU_WHOLE_SIZE);
  }
  return njs::undefined(env);
}

napi_value bundleDraw(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  auto* enc = static_cast<WGPURenderBundleEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!enc || argc < 1) return njs::undefined(env);
  uint32_t c[4] = {0, 1, 0, 0};
  for (size_t i = 0; i < argc && i < 4; ++i) {
    double v = 0;
    napi_get_value_double(env, args[i], &v);
    c[i] = static_cast<uint32_t>(v);
  }
  wgpuRenderBundleEncoderDraw(enc, c[0], c[1], c[2], c[3]);
  return njs::undefined(env);
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

// ── compute pass ────────────────────────────────────────────────────────────

napi_value computeSetPipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* pass = static_cast<WGPUComputePassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (pass && argc >= 1) {
    auto* pipeline =
        static_cast<WGPUComputePipeline>(njs::unwrapValue(env, args[0]));
    if (pipeline) wgpuComputePassEncoderSetPipeline(pass, pipeline);
  }
  return njs::undefined(env);
}

napi_value computeSetBindGroup(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  auto* pass = static_cast<WGPUComputePassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (pass && argc >= 2) {
    double index = 0;
    napi_get_value_double(env, args[0], &index);
    auto* group = static_cast<WGPUBindGroup>(njs::unwrapValue(env, args[1]));
    if (group) {
      wgpuComputePassEncoderSetBindGroup(pass, static_cast<uint32_t>(index),
                                         group, 0, nullptr);
    }
  }
  return njs::undefined(env);
}

napi_value computeDispatch(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  auto* pass = static_cast<WGPUComputePassEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!pass || argc < 1) return njs::undefined(env);
  double v[3] = {1, 1, 1};
  for (size_t i = 0; i < argc && i < 3; ++i)
    napi_get_value_double(env, args[i], &v[i]);
  wgpuComputePassEncoderDispatchWorkgroups(
      pass, static_cast<uint32_t>(v[0]), static_cast<uint32_t>(v[1]),
      static_cast<uint32_t>(v[2]));
  return njs::undefined(env);
}

napi_value computeEnd(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* pass = static_cast<WGPUComputePassEncoder>(
      njs::unwrapThis(env, info, &argc, nullptr));
  if (pass) wgpuComputePassEncoderEnd(pass);
  return njs::undefined(env);
}

napi_value encoderBeginComputePass(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* encoder = static_cast<WGPUCommandEncoder>(
      njs::unwrapThis(env, info, &argc, nullptr));
  if (!encoder) return njs::undefined(env);
  WGPUComputePassEncoder pass =
      wgpuCommandEncoderBeginComputePass(encoder, nullptr);
  napi_value obj = njs::wrapHandle(env, pass, [](napi_env, void* d, void*) {
    if (d) wgpuComputePassEncoderRelease(static_cast<WGPUComputePassEncoder>(d));
  });
  njs::setMethod(env, obj, "setPipeline", computeSetPipeline);
  njs::setMethod(env, obj, "setBindGroup", computeSetBindGroup);
  njs::setMethod(env, obj, "dispatchWorkgroups", computeDispatch);
  njs::setMethod(env, obj, "end", computeEnd);
  return obj;
}

// ── cópias (mipmaps/utilidades do three) ────────────────────────────────────

napi_value encoderCopyBufferToBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 5;
  napi_value args[5];
  auto* encoder = static_cast<WGPUCommandEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!encoder || argc < 5) return njs::undefined(env);
  auto* src = static_cast<WGPUBuffer>(njs::unwrapValue(env, args[0]));
  auto* dst = static_cast<WGPUBuffer>(njs::unwrapValue(env, args[2]));
  double srcOff = 0, dstOff = 0, size = 0;
  napi_get_value_double(env, args[1], &srcOff);
  napi_get_value_double(env, args[3], &dstOff);
  napi_get_value_double(env, args[4], &size);
  if (src && dst) {
    wgpuCommandEncoderCopyBufferToBuffer(
        encoder, src, static_cast<uint64_t>(srcOff), dst,
        static_cast<uint64_t>(dstOff), static_cast<uint64_t>(size));
  }
  return njs::undefined(env);
}

napi_value encoderCopyTextureToTexture(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  auto* encoder = static_cast<WGPUCommandEncoder>(
      njs::unwrapThis(env, info, &argc, args));
  if (!encoder || argc < 3) return njs::undefined(env);
  WGPUTexelCopyTextureInfo src = parseCopyTexture(env, args[0]);
  WGPUTexelCopyTextureInfo dst = parseCopyTexture(env, args[1]);
  if (!src.texture || !dst.texture) return njs::undefined(env);
  WGPUExtent3D extent = parseCopyExtent(env, args[2]);
  wgpuCommandEncoderCopyTextureToTexture(encoder, &src, &dst, &extent);
  return njs::undefined(env);
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
  njs::setMethod(env, obj, "beginComputePass", encoderBeginComputePass);
  njs::setMethod(env, obj, "copyBufferToBuffer", encoderCopyBufferToBuffer);
  njs::setMethod(env, obj, "copyTextureToTexture",
                 encoderCopyTextureToTexture);
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

/**
 * onSubmittedWorkDone → Promise. O wgpu-native não implementa a versão com
 * future (mesma limitação do WaitAny); como o host submete e apresenta no
 * mesmo frame, resolvemos imediatamente — suficiente pro three (readback
 * real usa mapAsync, que bombeia de verdade).
 */
napi_value queueOnSubmittedWorkDone(napi_env env, napi_callback_info) {
  return njs::resolvedPromise(env, njs::undefined(env));
}

napi_value deviceCreateRenderBundleEncoder(napi_env env,
                                           napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createRenderBundleEncoder: descriptor obrigatório");
    return njs::undefined(env);
  }

  std::vector<WGPUTextureFormat> colorFormats;
  napi_value formatsValue = nullptr;
  if (njs::getNamed(env, args[0], "colorFormats", &formatsValue)) {
    uint32_t count = 0;
    napi_get_array_length(env, formatsValue, &count);
    for (uint32_t i = 0; i < count; ++i) {
      napi_value item = nullptr;
      napi_get_element(env, formatsValue, i, &item);
      colorFormats.push_back(formatFromString(njs::toString(env, item)));
    }
  }

  WGPURenderBundleEncoderDescriptor desc =
      WGPU_RENDER_BUNDLE_ENCODER_DESCRIPTOR_INIT;
  desc.colorFormatCount = colorFormats.size();
  desc.colorFormats = colorFormats.data();
  std::string depthFormat =
      njs::getNamedString(env, args[0], "depthStencilFormat", "");
  if (!depthFormat.empty())
    desc.depthStencilFormat = formatFromString(depthFormat);
  desc.sampleCount = static_cast<uint32_t>(
      njs::getNamedNumber(env, args[0], "sampleCount", 1));

  WGPURenderBundleEncoder enc =
      wgpuDeviceCreateRenderBundleEncoder(device, &desc);
  napi_value obj = njs::wrapHandle(env, enc, [](napi_env, void* d, void*) {
    if (d)
      wgpuRenderBundleEncoderRelease(static_cast<WGPURenderBundleEncoder>(d));
  });
  njs::setMethod(env, obj, "setPipeline", bundleSetPipeline);
  njs::setMethod(env, obj, "setBindGroup", bundleSetBindGroup);
  njs::setMethod(env, obj, "setVertexBuffer", bundleSetVertexBuffer);
  njs::setMethod(env, obj, "draw", bundleDraw);
  njs::setMethod(env, obj, "finish", bundleFinish);
  return obj;
}

}  // namespace webgpu
