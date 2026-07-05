// Prelude — shims de browser escritos em JS (importado ANTES do three).
// Regra do projeto: o que dá pra shimar em JS fica AQUI; C++ só pro que
// precisa tocar a GPU/SO de verdade (src/webgpu/, src/shims/).

// ── globals básicos ─────────────────────────────────────────────────────────
globalThis.self = globalThis;

globalThis.console = {
  log: (...a) => print('[log]', ...a),
  info: (...a) => print('[info]', ...a),
  debug: (...a) => print('[debug]', ...a),
  warn: (...a) => print('[warn]', ...a),
  error: (...a) => print('[error]', ...a),
  trace: (...a) => print('[trace]', ...a),
};

globalThis.performance = globalThis.performance || { now: () => Date.now() };

// ── constantes WebGPU (valores da spec — puro dado, sem nativo) ────────────
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
globalThis.GPUTextureUsage = {
  COPY_SRC: 1,
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
  STORAGE_BINDING: 8,
  RENDER_ATTACHMENT: 16,
};
globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
globalThis.GPUColorWrite = { RED: 1, GREEN: 2, BLUE: 4, ALPHA: 8, ALL: 15 };

// ── navigator: adapter/device com features/limits que o three consulta ─────
// Limites default da spec WebGPU — suficientes pro M0; quando precisarmos
// dos reais, expor wgpuDeviceGetLimits no shim nativo.
const DEFAULT_LIMITS = {
  maxTextureDimension1D: 8192,
  maxTextureDimension2D: 8192,
  maxTextureDimension3D: 2048,
  maxTextureArrayLayers: 256,
  maxBindGroups: 4,
  maxBindingsPerBindGroup: 1000,
  maxDynamicUniformBuffersPerPipelineLayout: 8,
  maxDynamicStorageBuffersPerPipelineLayout: 4,
  maxSampledTexturesPerShaderStage: 16,
  maxSamplersPerShaderStage: 16,
  maxStorageBuffersPerShaderStage: 8,
  maxStorageTexturesPerShaderStage: 4,
  maxUniformBuffersPerShaderStage: 12,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  maxVertexBuffers: 8,
  maxBufferSize: 268435456,
  maxVertexAttributes: 16,
  maxVertexBufferArrayStride: 2048,
  maxInterStageShaderVariables: 16,
  maxColorAttachments: 8,
  maxColorAttachmentBytesPerSample: 32,
  maxComputeWorkgroupStorageSize: 16384,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeWorkgroupsPerDimension: 65535,
};

const nativeGpu = globalThis.navigator.gpu;
const nativeRequestAdapter = nativeGpu.requestAdapter.bind(nativeGpu);
nativeGpu.requestAdapter = async function (options) {
  const adapter = await nativeRequestAdapter(options);
  adapter.features = new Set();
  adapter.limits = DEFAULT_LIMITS;
  const nativeRequestDevice = adapter.requestDevice.bind(adapter);
  adapter.requestDevice = async function (descriptor) {
    const device = await nativeRequestDevice(descriptor);
    device.features = new Set();
    device.limits = DEFAULT_LIMITS;
    device.lost = new Promise(function () {}); // nunca resolve no host
    if (!device.destroy) device.destroy = function () {};
    return device;
  };
  return adapter;
};
globalThis.navigator.userAgent = 'CortexNative';

// ── canvas fake: o que o WebGPURenderer espera de um HTMLCanvasElement ─────
globalThis.__cortexCreateCanvas = function (width, height) {
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    getContext: function (type) {
      return type === 'webgpu' ? globalThis.gpuContext : null;
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () { return true; },
    getRootNode: function () { return null; },
  };
};
