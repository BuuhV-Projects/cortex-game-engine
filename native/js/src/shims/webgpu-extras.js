// Complementos JS por cima do shim WebGPU NATIVO (src/webgpu/): constantes
// da spec, features/limits que o Three consulta no adapter/device, e a
// canvas fake que devolve o gpuContext nativo.

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

export function installWebGpuExtras() {
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

  const gpu = globalThis.navigator.gpu;
  const nativeRequestAdapter = gpu.requestAdapter.bind(gpu);
  gpu.requestAdapter = async function (options) {
    const adapter = await nativeRequestAdapter(options);
    // BC (SPEC-0155): o host pede TextureCompressionBC no requestDevice
    // (garantido em D3D12) — refletido aqui pro three aceitar formatos bc*.
    adapter.features = new Set(['texture-compression-bc']);
    adapter.limits = DEFAULT_LIMITS;
    const nativeRequestDevice = adapter.requestDevice.bind(adapter);
    adapter.requestDevice = async function (descriptor) {
      const device = await nativeRequestDevice(descriptor);
      device.features = new Set(['texture-compression-bc']);
      device.limits = DEFAULT_LIMITS;
      device.lost = new Promise(function () {}); // nunca resolve no host
      if (!device.destroy) device.destroy = function () {};
      return device;
    };
    return adapter;
  };
  globalThis.navigator.userAgent = 'CortexNative';
  // Idioma do SO (host injeta __cortexLocale pré-boot — SPEC-0124). Fiel ao
  // browser: o i18n do engine lê navigator.language na primeira abertura.
  globalThis.navigator.language = globalThis.__cortexLocale || 'en';
  if (!globalThis.navigator.getGamepads) {
    // Preenchido de verdade pela frente 2 do M1 (SDL3 → Gamepad API).
    globalThis.navigator.getGamepads = function () { return []; };
  }
}

// Canvas singleton do host — o que o jogo recebe via getElementById('canvas').
export function installHostCanvas() {
  globalThis.__cortexCanvas = createCanvas(
    globalThis.innerWidth || 1280,
    globalThis.innerHeight || 720,
  );
}

export function createCanvas(width, height) {
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    getContext(type) {
      return type === 'webgpu' ? globalThis.gpuContext : null;
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    getRootNode() { return null; },
  };
}
